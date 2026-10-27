const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clp = n => "$" + Math.round(n).toLocaleString("es-CL");
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

let CONFIG = null;
let lastProducts = [];
let ranked = [];
let discarded = [];
let compareIds = new Set();
const selectedSku = {};
let shortlist = [];

// ---------- requisitos ----------
// Normaliza para comparar: "20 Gbps" = "20Gbps", "0,5 m" = "0.5m".
const norm = s => String(s).toLowerCase().replace(/(\d),(\d)/g, "$1.$2").replace(/\s+/g, "");
function parseTerms(text) {
  return text.split(/,(?!\d)/).map(t => t.trim()).filter(Boolean)
    .map(t => t.split("|").map(norm).filter(Boolean));
}
function haystack(p) {
  return norm(p.title + " " + Object.entries(p.specs || {}).map(([k, v]) => `${k}: ${v}`).join(" "));
}
const matches = (hay, alts) => alts.some(a => hay.includes(a));

// ---------- tipo de producto ----------
// AliExpress devuelve productos "relacionados" (un adaptador cuyo título menciona "cable").
// El tipo de un producto es la primera palabra de esta lista que aparece en su título.
const PRODUCT_TYPES = new Set(("cable adaptador cargador hub concentrador carcasa caja funda soporte convertidor " +
  "conector extension auricular audifono teclado mouse raton lampara bateria disco ssd memoria tarjeta lector " +
  "dock estacion switch camara reloj smartwatch zapatilla zapato polera camiseta chaqueta pantalon mochila bolso " +
  "taladro destornillador atornillador sierra bombilla ampolleta foco enchufe regleta router antena microfono " +
  "parlante altavoz protector mica vidrio llavero organizador").split(" "));
// Sinónimos: se comparan por su forma canónica (auricular = audifono, etc.).
const TYPE_SYNONYMS = { auricular: "audifono", altavoz: "parlante", raton: "mouse", ampolleta: "bombilla", foco: "bombilla",
  concentrador: "hub", atornillador: "destornillador", camiseta: "polera", zapato: "zapatilla", smartwatch: "reloj" };
const FEMININE = new Set("carcasa caja funda lampara bateria memoria tarjeta estacion camara zapatilla polera chaqueta mochila sierra bombilla regleta antena mica".split(" "));
const withArticle = t => `${FEMININE.has(t) ? "una" : "un"} ${t}`;

function singular(w) {
  let s = w;
  if (!PRODUCT_TYPES.has(s)) {
    if (s.endsWith("es") && PRODUCT_TYPES.has(s.slice(0, -2))) s = s.slice(0, -2);
    else if (s.endsWith("s") && PRODUCT_TYPES.has(s.slice(0, -1))) s = s.slice(0, -1);
  }
  return PRODUCT_TYPES.has(s) ? (TYPE_SYNONYMS[s] || s) : w;
}
function productType(text) {
  const words = String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/);
  for (const w of words) {
    const s = singular(w);
    if (PRODUCT_TYPES.has(s)) return s;
  }
  return null;
}

// ---------- costo real en Chile ----------
let shipEstimate = 0;

function landedCost(p, ivaIncluded) {
  const price = p.price_usd ?? 0;
  const ship = p.shipping_usd ?? shipEstimate;
  const base = price + ship;
  let duty = 0, iva = 0;
  if (base > CONFIG.duty_threshold_usd) duty = base * CONFIG.duty;
  if (!ivaIncluded) iva = (base + duty) * CONFIG.iva;
  const fx = CONFIG.usd_clp;
  return { price: price * fx, ship: ship * fx, duty: duty * fx, iva: iva * fx, total: (base + duty + iva) * fx, shipKnown: p.shipping_usd != null };
}

// ---------- puntajes ----------
function sellerScore(s) {
  const parts = [];
  if (s.positive_pct != null) parts.push(clamp((s.positive_pct - 90) / 9));
  if (s.years != null) parts.push(clamp(s.years / 5));
  for (const r of [s.described_rating, s.shipping_rating, s.communication_rating]) {
    if (r != null) parts.push(clamp((r - 4.5) / 0.4));
  }
  let score = parts.length ? parts.reduce((a, b) => a + b) / parts.length : 0.5;
  if (s.official) score += 0.1;
  if (s.choice) score += 0.05;
  return { score: clamp(score), known: parts.length > 0 };
}
function productScore(p) {
  const rating = p.rating_pct != null ? clamp((p.rating_pct - 85) / 13) : 0.5;
  const sold = clamp(Math.log10((p.sold || 0) + 1) / 4);
  let score = rating * 0.65 + sold * 0.35;
  const flags = p.reviews?.flags || [];
  score -= flags.length * 0.25;
  if (p.reviews && !flags.length) score += 0.1;
  return clamp(score);
}

function groupClones(items) {
  const tokens = p => new Set(p.title.toLowerCase().replace(/[^a-z0-9áéíóúñ.]+/g, " ").split(" ").filter(w => w.length > 1));
  const sets = items.map(tokens);
  const parent = items.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = sets[i], b = sets[j];
      const inter = [...a].filter(w => b.has(w)).length;
      if (inter / (a.size + b.size - inter) >= 0.7) parent[find(j)] = find(i);
    }
  }
  const groups = {};
  items.forEach((p, i) => (groups[find(i)] ||= []).push(p));
  return Object.values(groups);
}

function evaluate(products, f) {
  const must = parseTerms(f.must), nice = parseTerms(f.nice), exclude = parseTerms(f.exclude);
  const budget = Number(f.budget) || Infinity;
  const ok = [], out = [];

  const wantedType = f.type_only ? productType(f.q) : null;
  const knownShip = products.map(p => p.shipping_usd).filter(x => x != null).sort((a, b) => a - b);
  shipEstimate = knownShip.length ? knownShip[Math.floor(knownShip.length / 2)] : 0;

  for (const p of products) {
    const hay = haystack(p);
    const pick = pickVariant(p, must, exclude);
    const cost = landedCost(pick.variant ? { ...p, price_usd: pick.variant.price_usd } : p, f.iva_included);
    const missing = must.filter(alts => !matches(hay, alts)).map(a => a.join(" o "));
    const banned = exclude.filter(alts => matches(hay, alts)).map(a => a.join(" o "));
    const reasons = [];
    const type = wantedType && productType(p.title);
    if (type && type !== wantedType) reasons.push(`Parece ${withArticle(type)}, no ${withArticle(wantedType)}`);
    if (missing.length) reasons.push("No cumple: " + missing.join(", "));
    if (banned.length) reasons.push("Tiene algo descartado: " + banned.join(", "));
    if (cost.total > budget) reasons.push(`Sobre presupuesto (${clp(cost.total)})`);
    if (reasons.length) { out.push({ p, cost, reasons }); continue; }
    const niceHits = nice.filter(alts => matches(hay, alts)).map(a => a[0]);
    ok.push({ p, cost, niceHits, niceTotal: nice.length, ...pick });
  }

  const minTotal = Math.min(...ok.map(r => r.cost.total));
  const w = { price: +f.w_price, seller: +f.w_seller, product: +f.w_product, nice: +f.w_nice };
  const wSum = w.price + w.seller + w.product + w.nice || 1;

  for (const r of ok) {
    const seller = sellerScore(r.p.store);
    r.parts = {
      price: minTotal / r.cost.total,
      seller: seller.score,
      product: productScore(r.p),
      nice: r.niceTotal ? r.niceHits.length / r.niceTotal : 1,
    };
    r.score = 100 * (w.price * r.parts.price + w.seller * r.parts.seller + w.product * r.parts.product + w.nice * r.parts.nice) / wSum;
    r.sellerKnown = seller.known;
  }
  ok.sort((a, b) => b.score - a.score);

  let list = ok;
  if (f.group) {
    list = groupClones(ok.map(r => r.p)).map(g => {
      const rs = g.map(p => ok.find(r => r.p === p)).sort((a, b) => b.score - a.score);
      return { ...rs[0], clones: rs.slice(1) };
    }).sort((a, b) => b.score - a.score);
  }
  list.forEach(r => r.reasons = explain(r, minTotal));
  return { ranked: list, discarded: out };
}

// Elige la variante: la que eligió el usuario o, si no, la más barata que cumple los requisitos.
// AliExpress muestra el precio de la variante más barata, que muchas veces es otra cosa
// (por ejemplo la versión de 10Gbps de un cable anunciado como de 40Gbps).
function pickVariant(p, must, exclude) {
  const variants = p.variants || [];
  if (!variants.length) return { variant: null, cheapestSkipped: null };
  const chosen = variants.find(v => v.sku_id === selectedSku[p.id]);
  if (chosen) return { variant: chosen, cheapestSkipped: null, manual: true };
  let candidates = variants.filter(v => v.stock !== 0);
  if (!candidates.length) candidates = variants;
  for (const alts of must) {
    const ok = candidates.filter(v => matches(norm(v.label), alts));
    if (ok.length && ok.length < candidates.length) candidates = ok;
  }
  for (const alts of exclude) {
    const ok = candidates.filter(v => !matches(norm(v.label), alts));
    if (ok.length) candidates = ok;
  }
  const variant = candidates.reduce((a, b) => (b.price_usd < a.price_usd ? b : a));
  const cheapest = variants.reduce((a, b) => (b.price_usd < a.price_usd ? b : a));
  return { variant, cheapestSkipped: cheapest.sku_id !== variant.sku_id ? cheapest : null };
}

function explain(r, minTotal) {
  const p = r.p, s = p.store, out = [];
  if (r.cheapestSkipped) out.push(["con", `Ojo: el precio que muestra AliExpress (US$${r.cheapestSkipped.price_usd}) es de otra variante (${r.cheapestSkipped.label}). Aquí se usa la que cumple tus requisitos.`]);
  if (r.cost.total <= minTotal * 1.001) out.push(["pro", "El más barato puesto en Chile"]);
  else if (r.parts.price >= 0.8) out.push(["pro", `Solo ${clp(r.cost.total - minTotal)} más caro que el más barato`]);
  else out.push(["con", `${clp(r.cost.total - minTotal)} más caro que el más barato`]);
  if (s.official) out.push(["pro", "Tienda oficial de la marca"]);
  if (s.positive_pct != null) out.push([s.positive_pct >= 95 ? "pro" : "con", `Tienda con ${s.positive_pct}% de feedback positivo`]);
  if (s.described_rating != null) out.push([s.described_rating >= 4.7 ? "pro" : "con", `Tienda: ${s.described_rating}/5 en "como se describe", ${s.shipping_rating ?? "?"}/5 en envío`]);
  if (s.years != null && s.years < 2) out.push(["con", `Tienda nueva (${s.years} año${s.years === 1 ? "" : "s"})`]);
  if (!r.sellerKnown) out.push(["con", "Sin datos de la tienda"]);
  if (p.rating_pct != null) out.push([p.rating_pct >= 95 ? "pro" : "con", `${p.rating_pct}% de valoraciones positivas, ${fmtSold(p.sold)} vendidos`]);
  if (!r.cost.shipKnown) out.push(["con", `Envío desconocido: se estimó ${clp(r.cost.ship)} (el típico de esta búsqueda)`]);
  else if (p.ship_days) out.push([p.ship_days <= 15 ? "pro" : "con", `Llega en ~${p.ship_days} días`]);
  if (r.niceTotal) out.push([r.niceHits.length === r.niceTotal ? "pro" : "con", `Deseables: ${r.niceHits.length} de ${r.niceTotal}`]);
  (p.reviews?.flags || []).forEach(f => out.push(["bad", "Reseñas: " + f]));
  return out;
}

// ---------- utilidades de interfaz ----------
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// Llama al servidor local y traduce los errores a algo legible.
async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, options.body !== undefined
      ? { method: "POST", headers: { "Content-Type": "application/json" }, ...options, body: JSON.stringify(options.body) }
      : options);
  } catch {
    throw new Error("No hay conexión con el servidor local. ¿Está abierto Smart Buy?");
  }
  let data;
  try { data = await res.json(); } catch { throw new Error(`El servidor respondió algo inválido (código ${res.status}).`); }
  if (!res.ok || data?.error) throw new Error(data?.error || `Error del servidor (código ${res.status}).`);
  return data;
}

let toastTimer;
function toast(text, action) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(text)}</span>` + (action ? `<button type="button" class="pill">${esc(action.label)}</button>` : "");
  el.hidden = false;
  if (action) el.querySelector("button").onclick = () => { el.hidden = true; action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 3500);
}

function form() {
  const fd = new FormData($("#form"));
  const f = Object.fromEntries(fd.entries());
  f.group = fd.has("group");
  f.type_only = fd.has("type_only");
  f.iva_included = fd.has("iva_included");
  return f;
}

function showTab(name, focus = false) {
  document.querySelectorAll(".tabs button").forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + name));
}
const setCount = (id, n) => ($("#" + id).textContent = n ? n : "");

// ---------- tarjetas ----------
const fmtSold = n => (n ?? 0).toLocaleString("es-CL");

function card(r, i) {
  const p = r.p, c = r.cost;
  const inShort = shortlist.some(s => s.id === p.id);
  // Solo las características que importan para esta búsqueda (las que calzan con lo deseable).
  const chips = Object.entries(p.specs || {})
    .filter(([k, v]) => r.niceHits.some(h => norm(`${k}: ${v}`).includes(h)))
    .slice(0, 6).map(([k, v]) => `<span class="chip">${esc(k)}: ${esc(v)}</span>`).join("");
  const top = r.reasons.slice(0, 2), rest = r.reasons.slice(2);
  const li = ([k, t]) => `<li class="${k}">${esc(t)}</li>`;
  const canRead = /^\d+$/.test(p.id);
  const loading = reviewsLoading.has(p.id);
  const clones = r.clones?.length ? `<div class="clones">Mismo producto en ${r.clones.length} tienda${r.clones.length > 1 ? "s" : ""} más: ${r.clones.map(x => `${esc(x.p.store.name)} <span class="mono">${clp(x.cost.total)}</span>`).join(", ")}</div>` : "";
  const media = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="noimg"></div>`;
  return `
  <article class="card${i === 0 ? " top" : ""}" data-id="${esc(p.id)}">
    <div class="card-media">${media}<span class="rank">${i + 1}</span></div>
    <div class="card-body">
      ${i === 0 ? `<div class="best-label state-dot ok">Mejor opción según tus prioridades</div>` : ""}
      <a class="title" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>
      <div class="meta">${esc(p.store.name || "Tienda sin nombre")}${p.store.official ? " · Tienda oficial" : ""}${p.store.choice ? " · Choice" : ""}</div>
      ${variantSelect(r)}
      ${chips ? `<div class="chips">${chips}</div>` : ""}
      <ul class="reasons">${top.map(li).join("")}</ul>
      ${rest.length ? `<details class="more" data-more="${esc(p.id)}"${openMore.has(p.id) ? " open" : ""}><summary>${rest.length} detalle${rest.length > 1 ? "s" : ""} más</summary><ul class="reasons">${rest.map(li).join("")}</ul></details>` : ""}
      ${reviewBlock(p.reviews, p.id)}${clones}
    </div>
    <div class="card-side">
      <div class="total">${clp(c.total)}</div>
      <div class="breakdown">producto ${clp(c.price)}<br>envío ${c.shipKnown ? clp(c.ship) : "~" + clp(c.ship)}${c.duty ? ` · arancel ${clp(c.duty)}` : ""}${c.iva ? ` · IVA ${clp(c.iva)}` : ""}</div>
      <div class="score">
        <div class="score-row"><span>Puntaje</span><span class="score-num">${Math.round(r.score)}</span></div>
        <div class="bar" role="img" aria-label="Puntaje ${Math.round(r.score)} de 100"><div style="width:${r.score}%"></div></div>
      </div>
      <div class="actions">
        <button type="button" data-compare="${esc(p.id)}" class="${compareIds.has(p.id) ? "on" : ""}" aria-pressed="${compareIds.has(p.id)}">Comparar</button>
        <button type="button" data-short="${esc(p.id)}" class="${inShort ? "on" : ""}" aria-pressed="${inShort}">${inShort ? "En la lista" : "Guardar"}</button>
        ${canRead ? `<button type="button" data-reviews="${esc(p.id)}"${loading ? " disabled" : ""}>${loading ? "Leyendo…" : p.reviews ? "Releer reseñas" : "Leer reseñas"}</button>` : ""}
      </div>
    </div>
  </article>`;
}

function reviewBlock(r, id) {
  if (!r) return "";
  const head = r.total != null
    ? `<div><span class="mono">${r.stars ?? "?"}★</span> en <span class="mono">${fmtSold(r.total)}</span> reseñas · <span class="mono">${r.with_photos}</span> con foto · <span class="mono">${r.negative_pct ?? "?"}%</span> negativas</div>`
    : `<div>Reseñas leídas: <span class="mono">${r.read}</span> (<span class="mono">${r.with_photos}</span> con foto)</div>`;
  const parts = [head];
  if (r.summary) parts.push(`<div>${esc(r.summary)}</div>`);
  if (r.labels?.length) parts.push(`<div>${r.labels.map(esc).join(" · ")}</div>`);
  if (r.chile?.length) parts.push(`<div>Desde Chile: ${r.chile.map(t => `“${esc(t)}”`).join(" ")}</div>`);
  if (r.worst?.length) parts.push(`<details class="more" data-more="w${esc(id)}"${openMore.has("w" + id) ? " open" : ""}><summary>Peores reseñas (${r.worst.length})</summary>${r.worst.map(w => `<p><span class="mono">${w.stars}★</span> ${esc(w.text)} <span class="meta">${esc(w.variant)}</span></p>`).join("")}</details>`);
  return `<div class="review">${parts.join("")}</div>`;
}

function variantSelect(r) {
  const vs = r.p.variants || [];
  if (vs.length < 2) return r.variant ? `<div class="variant">Variante: <span class="mono">${esc(r.variant.label)}</span></div>` : "";
  const opts = vs.map(v => `<option value="${esc(v.sku_id)}"${v.sku_id === r.variant?.sku_id ? " selected" : ""}${v.stock === 0 ? " disabled" : ""}>${esc(v.label)} · US$${v.price_usd}${v.stock === 0 ? " (sin stock)" : ""}</option>`).join("");
  return `<label class="variant">Variante${r.manual ? "" : " (elegida automáticamente)"}<select data-variant="${esc(r.p.id)}">${opts}</select></label>`;
}

const emptyState = (text, withAssistant = true) =>
  `<div class="empty"><p>${text}</p>${withAssistant ? `<button type="button" class="pill" data-goto="assistant">Ir al asistente</button>` : ""}</div>`;

function renderRanking() {
  const focusSel = document.activeElement?.matches?.("select[data-variant]") ? document.activeElement.dataset.variant : null;
  $("#ranking-body").innerHTML = !hasSearched
    ? emptyState("Todavía no hay búsqueda. Cuéntale al asistente qué buscas o usa los ajustes de búsqueda.")
    : ranked.length ? ranked.map(card).join("")
    : emptyState(`Nada cumple los requisitos. ${discarded.length ? `Revisa los ${discarded.length} descartados para ver por qué, o relaja los filtros.` : ""}`);
  setCount("n-ranking", ranked.length);
  if (focusSel) $(`select[data-variant="${focusSel}"]`)?.focus();
}

function renderDiscarded() {
  $("#discarded-body").innerHTML = discarded.length ? discarded.map(d => `
    <div class="discard"><a class="title" href="${esc(d.p.url)}" target="_blank" rel="noopener">${esc(d.p.title)}</a>
    <div class="meta">${esc(d.p.store.name)} · <span class="mono">${clp(d.cost.total)}</span></div>
    <div class="why">${d.reasons.map(esc).join(" · ")}</div></div>`).join("")
    : emptyState(hasSearched ? "Nada descartado en esta búsqueda." : "Aquí aparecen los productos que no cumplen, con el motivo.", false);
  setCount("n-discarded", discarded.length);
}

function renderCompare() {
  const all = ranked.flatMap(r => [r, ...(r.clones || [])]);
  const rows = [...compareIds].map(id => all.find(r => r.p.id === id)).filter(Boolean);
  setCount("n-compare", rows.length);
  if (rows.length < 2) {
    $("#compare-body").innerHTML = emptyState(`Marca «Comparar» en 2 a 5 productos del ranking. ${rows.length === 1 ? "Llevas 1." : ""}`, false);
    return;
  }
  const specKeys = [...new Set(rows.flatMap(r => Object.keys(r.p.specs || {})))];
  const line = (label, vals, best, num = false) => {
    const bi = best ? vals.map(v => v.n).reduce((b, n, i, a) => (n != null && (a[b] == null || best(n, a[b])) ? i : b), 0) : -1;
    return `<tr><th scope="row">${label}</th>${vals.map((v, i) => `<td class="${num ? "num" : ""}${i === bi ? " best" : ""}">${v.t}</td>`).join("")}</tr>`;
  };
  const lo = (a, b) => a < b, hi = (a, b) => a > b;
  const v = (t, n) => ({ t: esc(t ?? "—"), n });
  const short = t => (t.length > 60 ? t.slice(0, 60) + "…" : t);
  $("#compare-body").innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th scope="col"><span class="meta">El punto marca el mejor valor</span></th>${rows.map(r => `<th scope="col"><a href="${esc(r.p.url)}" target="_blank" rel="noopener">${esc(short(r.p.title))}</a></th>`).join("")}</tr></thead>
    <tbody>
    ${line("Puntaje", rows.map(r => v(Math.round(r.score), r.score)), hi, true)}
    ${line("Total en Chile", rows.map(r => v(clp(r.cost.total), r.cost.total)), lo, true)}
    ${line("Producto", rows.map(r => v(clp(r.cost.price))), null, true)}
    ${line("Envío", rows.map(r => v(r.cost.shipKnown ? clp(r.cost.ship) : "~" + clp(r.cost.ship))), null, true)}
    ${line("IVA", rows.map(r => v(clp(r.cost.iva))), null, true)}
    ${line("Días de envío", rows.map(r => v(r.p.ship_days, r.p.ship_days)), lo, true)}
    ${line("Valoración", rows.map(r => v(r.p.rating_pct != null ? r.p.rating_pct + "%" : null, r.p.rating_pct)), hi, true)}
    ${line("Vendidos", rows.map(r => v(fmtSold(r.p.sold), r.p.sold)), hi, true)}
    ${line("Variante", rows.map(r => v(r.variant?.label)), null, true)}
    ${line("Tienda", rows.map(r => v(r.p.store.name)))}
    ${line("Como se describe", rows.map(r => v(r.p.store.described_rating != null ? r.p.store.described_rating + "/5" : null, r.p.store.described_rating)), hi, true)}
    ${line("Oficial / Choice", rows.map(r => v([r.p.store.official && "Oficial", r.p.store.choice && "Choice"].filter(Boolean).join(" · ") || "No")))}
    ${specKeys.map(k => line(esc(k), rows.map(r => v(r.p.specs?.[k])))).join("")}
    ${line("Alertas de reseñas", rows.map(r => v(r.p.reviews ? (r.p.reviews.flags.join(", ") || "Ninguna") : "Sin leer")))}
    </tbody>
  </table></div>`;
}

function renderShortlist() {
  setCount("n-shortlist", shortlist.length);
  $("#shortlist-body").innerHTML = shortlist.length ? shortlist.map(s => `
    <div class="sl" data-id="${esc(s.id)}">
      <a class="title" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>
      <div class="meta">${esc(s.store)}${s.variant ? ` · <span class="mono">${esc(s.variant)}</span>` : ""} · <span class="mono">${clp(s.total_clp)}</span> · puntaje <span class="mono">${Math.round(s.score)}</span></div>
      <div class="state-dot ${s.status === "approved" ? "ok" : ""}">${s.status === "approved" ? "Aprobado para comprar" : "Pendiente de decidir"}</div>
      <textarea aria-label="Notas sobre este producto" placeholder="Notas: color, talla, para quién…">${esc(s.note || "")}</textarea>
      <div class="saved-note" aria-live="polite"></div>
      <div class="actions">
        <button type="button" data-approve="${esc(s.id)}" class="${s.status === "approved" ? "on" : ""}" aria-pressed="${s.status === "approved"}">${s.status === "approved" ? "Quitar aprobación" : "Aprobar"}</button>
        <button type="button" data-open="${esc(s.url)}${s.sku_id ? "?skuId=" + esc(s.sku_id) : ""}">Abrir en AliExpress</button>
        <button type="button" data-remove="${esc(s.id)}">Quitar</button>
      </div>
    </div>`).join("") : emptyState("Guarda aquí los candidatos del ranking para decidir con calma.", false);
}

function renderAll() { renderRanking(); renderDiscarded(); renderCompare(); renderShortlist(); }

// ---------- datos ----------
let hasSearched = false;
let searchSeq = 0;
const reviewsLoading = new Set();
const openMore = new Set();

// Guarda en cola para que dos guardados seguidos no lleguen desordenados.
let saveQueue = Promise.resolve();
function persist(path, data) {
  saveQueue = saveQueue.then(() => api(path, { body: data })).catch(e => { toast("No se pudo guardar: " + e.message); throw e; });
  return saveQueue.catch(() => {});
}
const saveShortlist = () => persist("/api/shortlist", shortlist);
const saveSearches = () => persist("/api/searches", searches);

function recompute() {
  ({ ranked, discarded } = evaluate(lastProducts, form()));
  renderAll();
}
const recomputeSoon = debounce(recompute, 250);

// Devuelve true si la búsqueda terminó y es la más reciente.
async function search() {
  const q = form().q.trim();
  if (!q) { toast("Escribe qué buscas o pídeselo al asistente."); return false; }
  const seq = ++searchSeq;
  const started = Date.now();
  const btn = $("#search-btn");
  btn.disabled = true; btn.textContent = "Buscando…";
  const tick = () => {
    if (seq !== searchSeq) return;
    $("#status").innerHTML = `Buscando en AliExpress y cotizando envío a Chile… <span class="mono">${Math.round((Date.now() - started) / 1000)} s</span> (suele tardar 20 a 60 s)<div class="progress"></div>`;
  };
  tick();
  const timer = setInterval(tick, 1000);
  try {
    const data = await api("/api/search?q=" + encodeURIComponent(q));
    if (seq !== searchSeq) return false;
    lastProducts = data.products;
    compareIds = new Set();
    hasSearched = true;
    $("#status").textContent = `${lastProducts.length} productos para «${q}». Totales con envío, IVA ${CONFIG.iva * 100}% y tipo de cambio aproximado.`;
    recompute();
    return true;
  } catch (e) {
    if (seq === searchSeq) $("#status").innerHTML = `<span class="state-dot error">La búsqueda falló: ${esc(e.message)}</span>`;
    throw e;
  } finally {
    clearInterval(timer);
    if (seq === searchSeq) { btn.disabled = false; btn.textContent = "Buscar y comparar"; }
  }
}

// ---------- eventos: formulario y pestañas ----------
$("#form").addEventListener("submit", async e => {
  e.preventDefault();
  showTab("ranking");
  try { await search(); } catch {}
});
$("#form").addEventListener("input", e => {
  if (e.target.type === "range") e.target.nextElementSibling.value = e.target.value;
  if (lastProducts.length && e.target.name !== "q") recomputeSoon();
});
document.querySelectorAll(".slider input").forEach(i => (i.nextElementSibling.value = i.value));

document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
$(".tabs").addEventListener("keydown", e => {
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
  const tabs = [...document.querySelectorAll(".tabs button")];
  const i = tabs.indexOf(document.activeElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  e.preventDefault();
  showTab(tabs[next].dataset.tab, true);
});

document.addEventListener("toggle", e => {
  const id = e.target.dataset?.more;
  if (id) e.target.open ? openMore.add(id) : openMore.delete(id);
}, true);

document.addEventListener("click", async e => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.goto) return showTab(t.dataset.goto);
  if (t.dataset.open) return window.open(t.dataset.open, "_blank", "noopener");
  if (t.dataset.compare) {
    const id = t.dataset.compare;
    if (compareIds.has(id)) compareIds.delete(id);
    else if (compareIds.size >= 5) return toast("Puedes comparar hasta 5. Quita uno primero.");
    else compareIds.add(id);
    renderRanking(); renderCompare();
  } else if (t.dataset.short) {
    const id = t.dataset.short;
    const idx = shortlist.findIndex(s => s.id === id);
    if (idx >= 0) shortlist.splice(idx, 1);
    else {
      const r = ranked.flatMap(r => [r, ...(r.clones || [])]).find(r => r.p.id === id);
      if (!r) return;
      shortlist.push({ id, title: r.p.title, url: r.p.url, store: r.p.store.name, variant: r.variant?.label || "", sku_id: r.variant?.sku_id || "", total_clp: r.cost.total, score: r.score, status: "pending", note: "" });
      toast("Guardado en la lista corta.");
    }
    renderRanking(); renderShortlist();
    saveShortlist();
  } else if (t.dataset.reviews) {
    const id = t.dataset.reviews;
    reviewsLoading.add(id);
    renderRanking();
    try {
      const data = await api("/api/reviews?id=" + encodeURIComponent(id), { method: "POST" });
      const p = lastProducts.find(p => p.id === id);
      if (p) { p.reviews = data.reviews; if (p.rating_pct == null) p.rating_pct = data.rating_pct; }
    } catch (err) {
      toast(err.message);
    } finally {
      reviewsLoading.delete(id);
      recompute();
    }
  } else if (t.dataset.approve) {
    const s = shortlist.find(s => s.id === t.dataset.approve);
    s.status = s.status === "approved" ? "pending" : "approved";
    renderShortlist(); saveShortlist();
  } else if (t.dataset.remove) {
    const idx = shortlist.findIndex(s => s.id === t.dataset.remove);
    const [removed] = shortlist.splice(idx, 1);
    renderRanking(); renderShortlist(); saveShortlist();
    toast("Quitado de la lista.", { label: "Deshacer", run: () => { shortlist.splice(idx, 0, removed); renderRanking(); renderShortlist(); saveShortlist(); } });
  }
});

document.addEventListener("change", e => {
  if (e.target.matches("select[data-variant]")) {
    selectedSku[e.target.dataset.variant] = e.target.value;
    recompute();
  }
});
const saveNote = debounce(async (el) => {
  const box = el.closest(".sl");
  const item = shortlist.find(s => s.id === box.dataset.id);
  if (!item) return;
  item.note = el.value;
  await saveShortlist();
  box.querySelector(".saved-note").textContent = "Nota guardada";
}, 800);
document.addEventListener("input", e => {
  if (e.target.matches(".sl textarea")) { e.target.closest(".sl").querySelector(".saved-note").textContent = ""; saveNote(e.target); }
});

// ---------- búsquedas guardadas ----------
let searches = [];

function renderSaved(selected = "") {
  $("#saved").innerHTML = `<option value="">Elegir…</option>` +
    searches.map(s => `<option${s.name === selected ? " selected" : ""}>${esc(s.name)}</option>`).join("");
  $("#del-search").disabled = !selected;
}
function applySearch(s) {
  const f = $("#form");
  for (const [key, value] of Object.entries(s)) {
    const el = f.elements[key];
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!value;
    else el.value = value;
    if (el.type === "range") el.nextElementSibling.value = value;
  }
}
$("#saved").addEventListener("change", async e => {
  $("#del-search").disabled = !e.target.value;
  const s = searches.find(s => s.name === e.target.value);
  if (!s) return;
  applySearch(s);
  showTab("ranking");
  try { await search(); } catch {}
});
$("#save-search").addEventListener("click", () => {
  $("#save-row").hidden = false; $("#save-search").hidden = true;
  $("#save-name").value = $("#saved").value || form().q;
  $("#save-name").focus(); $("#save-name").select();
});
const closeSaveRow = () => { $("#save-row").hidden = true; $("#save-search").hidden = false; };
$("#save-cancel").addEventListener("click", closeSaveRow);
$("#save-name").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#save-confirm").click(); } if (e.key === "Escape") closeSaveRow(); });
$("#save-confirm").addEventListener("click", async () => {
  const name = $("#save-name").value.trim();
  if (!name) return $("#save-name").focus();
  const { group, iva_included, type_only, ...fields } = form();
  const entry = { name, ...fields, group, iva_included, type_only };
  const i = searches.findIndex(s => s.name === name);
  if (i >= 0) searches[i] = entry; else searches.push(entry);
  closeSaveRow();
  renderSaved(name);
  await saveSearches();
  toast(`Búsqueda «${name}» guardada.`);
});
$("#del-search").addEventListener("click", async () => {
  const name = $("#saved").value;
  const idx = searches.findIndex(s => s.name === name);
  if (idx < 0) return;
  const [removed] = searches.splice(idx, 1);
  renderSaved();
  await saveSearches();
  toast(`Búsqueda «${name}» borrada.`, { label: "Deshacer", run: async () => { searches.splice(idx, 0, removed); renderSaved(name); await saveSearches(); } });
});

// ---------- asistente ----------
const GREETING = { role: "assistant", text: "Hola. ¿Qué quieres comprar? Cuéntamelo como quieras y te pregunto lo necesario para encontrar la mejor opción.",
  options: ["Un cable", "Audífonos", "Una herramienta", "Ropa o zapatillas"] };
const CHAT_KEY = "smartbuy.chat";
let chatHistory = [GREETING];
let chatBusy = false;
let chatId = 0;

function loadChat() {
  try { const saved = JSON.parse(localStorage.getItem(CHAT_KEY)); if (Array.isArray(saved) && saved.length) chatHistory = saved; } catch {}
}
function storeChat() {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(chatHistory)); } catch {}
}
function mdLite(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}
function renderChat(pending = "") {
  const fresh = chatHistory.length === 1;
  $("#chat-empty").hidden = !fresh;
  $("#tab-assistant").classList.toggle("fresh", fresh);
  $("#chat-log").innerHTML = (fresh ? "" : chatHistory.map(m => `<div class="msg ${m.role}${m.error ? " error" : ""}">${mdLite(m.text)}</div>`).join("")) + pending;
  const last = chatHistory[chatHistory.length - 1];
  $("#chat-options").innerHTML = !chatBusy && last.role === "assistant" && last.options?.length
    ? last.options.map(o => `<button type="button" data-option="${esc(o)}">${esc(o)}</button>`).join("") : "";
  $("#chat-send").disabled = chatBusy;
  $("#chat-reset").disabled = chatBusy;
  const log = $("#chat-log");
  (log.lastElementChild || log).scrollIntoView({ block: "nearest", behavior: "auto" });
}
const thinking = (label, started) =>
  `<div class="msg assistant thinking"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>${label}${started ? ` <span class="mono">${Math.round((Date.now() - started) / 1000)} s</span>` : ""}</div>`;

function autoGrow() {
  const el = $("#chat-input");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 240) + "px";
}

async function sendChat(text) {
  text = text.trim();
  if (!text || chatBusy) return false;
  const myChat = chatId;
  chatHistory.push({ role: "user", text });
  chatBusy = true;
  storeChat();
  const started = Date.now();
  renderChat(thinking("Pensando", started));
  const timer = setInterval(() => renderChat(thinking("Pensando", started)), 1000);
  try {
    const data = await api("/api/chat", { body: chatHistory.filter(m => !m.error).map(m => ({ role: m.role, text: m.text })) });
    clearInterval(timer);
    if (myChat !== chatId) return true;
    chatHistory.push({ role: "assistant", text: data.reply, options: data.options });
    storeChat();
    if (data.done) await runAssistantSearch(data.search, myChat);
  } catch (e) {
    clearInterval(timer);
    if (myChat !== chatId) return true;
    chatHistory.push({ role: "assistant", text: "No pude responder. " + e.message, error: true, options: ["Reintentar", "Usar los ajustes manuales"] });
  } finally {
    clearInterval(timer);
    if (myChat === chatId) { chatBusy = false; storeChat(); renderChat(); $("#chat-input").focus(); }
  }
  return true;
}

async function runAssistantSearch(s, myChat) {
  const entry = { ...s, group: true, iva_included: false, type_only: true };
  for (const k of ["w_price", "w_seller", "w_product", "w_nice"]) entry[k] = String(entry[k]);
  applySearch(entry);
  const i = searches.findIndex(x => x.name === entry.name);
  if (i >= 0) searches[i] = entry; else searches.push(entry);
  renderSaved(entry.name);
  saveSearches();
  compareIds = new Set();
  const started = Date.now();
  renderChat(thinking("Buscando en AliExpress y cotizando envío (suele tardar 20 a 60 s)", started));
  const timer = setInterval(() => renderChat(thinking("Buscando en AliExpress y cotizando envío (suele tardar 20 a 60 s)", started)), 1000);
  try {
    if (!(await search())) return;
  } catch (e) {
    if (myChat === chatId) chatHistory.push({ role: "assistant", text: "La búsqueda falló: " + e.message, error: true, options: ["Reintentar la búsqueda"] });
    return;
  } finally {
    clearInterval(timer);
  }
  if (myChat !== chatId) return;
  const top = ranked[0];
  chatHistory.push({ role: "assistant", options: ["Ver el ranking", "Buscar otra cosa"],
    text: top ? `Encontré ${ranked.length} opciones que cumplen y descarté ${discarded.length}. La mejor según tus prioridades es **${top.p.title.slice(0, 80)}…** por ${clp(top.cost.total)} puesto en Chile. La búsqueda quedó guardada como «${entry.name}».`
              : `No encontré productos que cumplan todo (descarté ${discarded.length}). Motivos más comunes: ${topReasons()}. Dime qué relajar y vuelvo a buscar.` });
}
function topReasons() {
  const count = {};
  discarded.forEach(d => d.reasons.forEach(r => { const k = r.split(":")[0].replace(/\(.*\)/, "").trim(); count[k] = (count[k] || 0) + 1; }));
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`).join(", ") || "ninguno";
}
function resetChat() {
  chatId++;
  chatHistory = [GREETING];
  chatBusy = false;
  storeChat(); renderChat();
  $("#chat-input").focus();
}

$("#chat-form").addEventListener("submit", async e => {
  e.preventDefault();
  const input = $("#chat-input");
  if (chatBusy || !input.value.trim()) return;
  const text = input.value;
  input.value = ""; autoGrow();
  await sendChat(text);
});
$("#chat-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#chat-form").requestSubmit(); }
});
$("#chat-input").addEventListener("input", autoGrow);
$("#chat-options").addEventListener("click", async e => {
  const o = e.target.closest("button")?.dataset.option;
  if (!o) return;
  if (o === "Ver el ranking") return showTab("ranking");
  if (o === "Buscar otra cosa") return resetChat();
  if (o === "Usar los ajustes manuales") { $("#filters").open = true; return $("#form").elements.q.focus(); }
  if (o === "Reintentar" || o === "Reintentar la búsqueda") {
    if (chatHistory[chatHistory.length - 1].error) chatHistory.pop();
    if (o === "Reintentar la búsqueda") {
      chatBusy = true; renderChat();
      try { await runAssistantSearch({ ...form(), name: $("#saved").value || form().q }, chatId); } finally { chatBusy = false; storeChat(); renderChat(); }
      return;
    }
    const lastUser = chatHistory.pop();
    return sendChat(lastUser.text);
  }
  sendChat(o);
});
$("#chat-reset").addEventListener("click", resetChat);

// ---------- dictado por voz ----------
// Usa el reconocimiento de voz del navegador (Chrome y Edge). El texto queda en el cuadro
// para revisarlo antes de enviar.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let dictationBase = "";

function setMic(on) {
  const b = $("#chat-mic");
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", on);
  b.querySelector("span").textContent = on ? "Escuchando… toca para parar" : "Dictar";
}
function stopDictation() { if (recognizer) recognizer.stop(); }
function startDictation() {
  recognizer = new Recognition();
  recognizer.lang = "es-CL";
  recognizer.continuous = true;
  recognizer.interimResults = true;
  const input = $("#chat-input");
  dictationBase = input.value.trim() ? input.value.trim() + " " : "";
  recognizer.onresult = e => {
    let text = "";
    for (const r of e.results) text += r[0].transcript;
    input.value = dictationBase + text.trimStart();
    autoGrow();
  };
  recognizer.onerror = e => {
    const msg = { "not-allowed": "El navegador no tiene permiso para usar el micrófono. Permítelo en el ícono del candado de la barra de direcciones.",
      "no-speech": "No escuché nada. Prueba de nuevo, más cerca del micrófono.", "audio-capture": "No encontré un micrófono conectado.",
      network: "El dictado necesita internet (el navegador procesa el audio en línea)." }[e.error];
    if (msg) toast(msg);
  };
  recognizer.onend = () => { recognizer = null; setMic(false); input.focus(); };
  recognizer.start();
  setMic(true);
}
if (Recognition) {
  $("#chat-mic").hidden = false;
  $("#chat-mic").addEventListener("click", () => (recognizer ? stopDictation() : startDictation()));
  // Al enviar se corta el dictado para no seguir escribiendo en un cuadro vacío.
  $("#chat-form").addEventListener("submit", stopDictation, true);
}

// ---------- inicio ----------
async function init() {
  try {
    CONFIG = await api("/api/config");
    const [sl, ss] = await Promise.all([api("/api/shortlist"), api("/api/searches")]);
    shortlist = sl; searches = ss;
  } catch (e) {
    $("#offline").hidden = false;
    return;
  }
  $("#offline").hidden = true;
  $("#mode").textContent = CONFIG.mode === "api" ? "AliExpress en vivo" : "Datos de prueba";
  $("#mode").className = "state-dot " + (CONFIG.mode === "api" ? "ok" : "warn");
  $("#fx").textContent = `US$1 ≈ ${clp(CONFIG.usd_clp)} · IVA ${CONFIG.iva * 100}%`;
  if (window.matchMedia("(max-width: 860px)").matches) $("#filters").open = false;
  loadChat();
  renderSaved();
  renderAll();
  renderChat();
  // ?buscar=<nombre> abre directo una búsqueda guardada.
  const wanted = new URLSearchParams(location.search).get("buscar");
  const preset = wanted && searches.find(s => s.name === wanted);
  if (preset) {
    applySearch(preset); renderSaved(preset.name);
    try { await search(); } catch {}
  }
}
$("#retry-init").addEventListener("click", init);
init();
