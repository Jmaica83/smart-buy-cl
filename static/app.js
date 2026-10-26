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
const TYPE_ARTICLE = { cable: "un", adaptador: "un", cargador: "un", hub: "un", concentrador: "un", convertidor: "un", conector: "un" };

function singular(w) {
  if (PRODUCT_TYPES.has(w)) return w;
  if (w.endsWith("es") && PRODUCT_TYPES.has(w.slice(0, -2))) return w.slice(0, -2);
  if (w.endsWith("s") && PRODUCT_TYPES.has(w.slice(0, -1))) return w.slice(0, -1);
  return w;
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
    if (type && type !== wantedType) reasons.push(`Parece ${TYPE_ARTICLE[type] || "un(a)"} ${type}, no ${TYPE_ARTICLE[wantedType] || "un(a)"} ${wantedType}`);
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
  if (p.rating_pct != null) out.push([p.rating_pct >= 95 ? "pro" : "con", `${p.rating_pct}% de valoraciones positivas, ${p.sold.toLocaleString("es-CL")} vendidos`]);
  if (!r.cost.shipKnown) out.push(["con", `Envío desconocido: se estimó ${clp(r.cost.ship)} (el típico de esta búsqueda)`]);
  else if (p.ship_days) out.push([p.ship_days <= 15 ? "pro" : "con", `Llega en ~${p.ship_days} días`]);
  if (r.niceTotal) out.push([r.niceHits.length === r.niceTotal ? "pro" : "con", `Deseables: ${r.niceHits.length} de ${r.niceTotal}`]);
  (p.reviews?.flags || []).forEach(f => out.push(["bad", "Reseñas: " + f]));
  return out;
}

// ---------- render ----------
function form() {
  const fd = new FormData($("#form"));
  const f = Object.fromEntries(fd.entries());
  f.group = fd.has("group");
  f.type_only = fd.has("type_only");
  f.iva_included = fd.has("iva_included");
  return f;
}

function card(r, i) {
  const p = r.p, c = r.cost;
  const inShort = shortlist.some(s => s.id === p.id);
  const chips = Object.entries(p.specs || {}).map(([k, v]) => {
    const hit = r.niceHits.some(h => norm(`${k}: ${v}`).includes(h));
    return `<span class="chip${hit ? " hit" : ""}">${esc(k)}: ${esc(v)}</span>`;
  }).join("");
  const rev = reviewBlock(p.reviews);
  const canRead = /^\d+$/.test(p.id);
  const clones = r.clones?.length ? `<div class="clones">Mismo producto en ${r.clones.length} tienda${r.clones.length > 1 ? "s" : ""} más: ${r.clones.map(x => `${esc(x.p.store.name)} (${clp(x.cost.total)})`).join(", ")}</div>` : "";
  return `
  <article class="card${i === 0 ? " top1" : ""}">
    <div class="rank">#${i + 1}</div>
    <div>
      <a class="title" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>
      <div class="store">${esc(p.store.name || "Tienda sin nombre")}${p.store.official ? " · Oficial" : ""}${p.store.choice ? " · Choice" : ""}</div>
      ${variantSelect(r)}
      <div class="chips">${chips}</div>
      <ul class="reasons">${r.reasons.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join("")}</ul>
      ${rev}${clones}
    </div>
    <div class="side">
      <div class="total">${clp(c.total)}</div>
      <div class="breakdown">Producto ${clp(c.price)} · Envío ${c.shipKnown ? clp(c.ship) : "~" + clp(c.ship)}${c.duty ? ` · Arancel ${clp(c.duty)}` : ""}${c.iva ? ` · IVA ${clp(c.iva)}` : ""}</div>
      <div class="score"><b>${Math.round(r.score)}</b>/100<div class="bar"><div style="width:${r.score}%"></div></div></div>
      <div class="actions">
        <button data-compare="${esc(p.id)}" class="${compareIds.has(p.id) ? "on" : ""}">Comparar</button>
        <button data-short="${esc(p.id)}" class="${inShort ? "on" : ""}">${inShort ? "En lista" : "Lista corta"}</button>
        ${canRead ? `<button data-reviews="${esc(p.id)}">${p.reviews ? "Actualizar reseñas" : "Leer reseñas"}</button>` : ""}
      </div>
    </div>
  </article>`;
}

function reviewBlock(r) {
  if (!r) return "";
  const head = r.total != null
    ? `<b>Reseñas:</b> ${r.stars ?? "?"}★ de ${r.total.toLocaleString("es-CL")} (${r.with_photos} con foto, ${r.negative_pct ?? "?"}% negativas) · leídas ${r.read}`
    : `<b>Reseñas leídas (${r.read}, ${r.with_photos} con foto)</b>`;
  const parts = [head];
  if (r.summary) parts.push(esc(r.summary));
  if (r.labels?.length) parts.push(r.labels.map(esc).join(" · "));
  if (r.chile?.length) parts.push("<b>Desde Chile:</b> " + r.chile.map(t => `“${esc(t)}”`).join(" "));
  if (r.worst?.length) parts.push(`<details><summary>Peores reseñas (${r.worst.length})</summary>${r.worst.map(w => `<p>${"★".repeat(w.stars)} ${esc(w.text)} <span class="muted">${esc(w.variant)}</span></p>`).join("")}</details>`);
  return `<div class="review">${parts.join("<br>")}</div>`;
}

function variantSelect(r) {
  const vs = r.p.variants || [];
  if (vs.length < 2) return r.variant ? `<div class="variant">Variante: ${esc(r.variant.label)}</div>` : "";
  const opts = vs.map(v => `<option value="${esc(v.sku_id)}"${v.sku_id === r.variant?.sku_id ? " selected" : ""}${v.stock === 0 ? " disabled" : ""}>${esc(v.label)} · US$${v.price_usd}${v.stock === 0 ? " (sin stock)" : ""}</option>`).join("");
  return `<label class="variant">Variante: <select data-variant="${esc(r.p.id)}">${opts}</select>${r.manual ? "" : " <span class=\"muted\">(elegida automáticamente)</span>"}</label>`;
}

function renderRanking() {
  $("#tab-ranking").innerHTML = ranked.length ? ranked.map(card).join("") : `<div class="empty">Nada cumple los requisitos. Revisa "Descartados".</div>`;
  $("#n-ranking").textContent = `(${ranked.length})`;
}

function renderDiscarded() {
  $("#tab-discarded").innerHTML = discarded.length ? discarded.map(d => `
    <div class="discard"><a class="title" href="${esc(d.p.url)}" target="_blank" rel="noopener">${esc(d.p.title)}</a>
    <div class="muted">${esc(d.p.store.name)} · ${clp(d.cost.total)}</div>
    <div class="why">${d.reasons.map(esc).join(" · ")}</div></div>`).join("") : `<div class="empty">Nada descartado.</div>`;
  $("#n-discarded").textContent = `(${discarded.length})`;
}

function renderCompare() {
  const all = ranked.flatMap(r => [r, ...(r.clones || [])]);
  const rows = [...compareIds].map(id => all.find(r => r.p.id === id)).filter(Boolean);
  $("#n-compare").textContent = `(${rows.length})`;
  if (rows.length < 2) { $("#tab-compare").innerHTML = `<div class="empty">Marca "Comparar" en 2 a 5 productos del ranking.</div>`; return; }
  const specKeys = [...new Set(rows.flatMap(r => Object.keys(r.p.specs || {})))];
  const line = (label, vals, best) => {
    const bi = best ? vals.map(v => v.n).reduce((b, n, i, a) => (n != null && (a[b] == null || best(n, a[b])) ? i : b), 0) : -1;
    return `<tr><th>${label}</th>${vals.map((v, i) => `<td class="${i === bi && rows.length > 1 ? "best" : ""}">${v.t}</td>`).join("")}</tr>`;
  };
  const lo = (a, b) => a < b, hi = (a, b) => a > b;
  const v = (t, n) => ({ t: esc(t ?? "—"), n });
  $("#tab-compare").innerHTML = `<div class="table-wrap"><table>
    <tr><th></th>${rows.map(r => `<th><a href="${esc(r.p.url)}" target="_blank" rel="noopener">${esc(r.p.title.slice(0, 60))}…</a></th>`).join("")}</tr>
    ${line("Puntaje", rows.map(r => v(Math.round(r.score), r.score)), hi)}
    ${line("Total en Chile", rows.map(r => v(clp(r.cost.total), r.cost.total)), lo)}
    ${line("Producto", rows.map(r => v(clp(r.cost.price))))}
    ${line("Envío", rows.map(r => v(r.cost.shipKnown ? clp(r.cost.ship) : "~" + clp(r.cost.ship))))}
    ${line("IVA", rows.map(r => v(clp(r.cost.iva))))}
    ${line("Días de envío", rows.map(r => v(r.p.ship_days, r.p.ship_days)), lo)}
    ${line("Valoración", rows.map(r => v(r.p.rating_pct != null ? r.p.rating_pct + "%" : null, r.p.rating_pct)), hi)}
    ${line("Vendidos", rows.map(r => v(r.p.sold.toLocaleString("es-CL"), r.p.sold)), hi)}
    ${line("Variante", rows.map(r => v(r.variant?.label)))}
    ${line("Tienda", rows.map(r => v(r.p.store.name)))}
    ${line("Feedback tienda", rows.map(r => v(r.p.store.positive_pct != null ? r.p.store.positive_pct + "%" : null, r.p.store.positive_pct)), hi)}
    ${line("Años tienda", rows.map(r => v(r.p.store.years, r.p.store.years)), hi)}
    ${line("Oficial / Choice", rows.map(r => v([r.p.store.official && "Oficial", r.p.store.choice && "Choice"].filter(Boolean).join(" · ") || "No")))}
    ${specKeys.map(k => line(esc(k), rows.map(r => v(r.p.specs?.[k])))).join("")}
    ${line("Alertas reseñas", rows.map(r => v(r.p.reviews ? (r.p.reviews.flags.join(", ") || "Ninguna") : "Sin revisar")))}
  </table></div>`;
}

function renderShortlist() {
  $("#n-shortlist").textContent = `(${shortlist.length})`;
  $("#tab-shortlist").innerHTML = shortlist.length ? shortlist.map(s => `
    <div class="sl" data-id="${esc(s.id)}">
      <a class="title" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>
      <div class="muted">${esc(s.store)}${s.variant ? " · " + esc(s.variant) : ""} · ${clp(s.total_clp)} · puntaje ${Math.round(s.score)}</div>
      <div class="state ${s.status}">${s.status === "approved" ? "Aprobado: Claude lo agrega al carro, tú pagas" : "Pendiente"}</div>
      <textarea placeholder="Notas (color, variante, talla...)">${esc(s.note || "")}</textarea>
      <div class="actions" style="justify-content:flex-start">
        <button data-approve="${esc(s.id)}" class="${s.status === "approved" ? "on" : ""}">${s.status === "approved" ? "Quitar aprobación" : "Aprobar para el carro"}</button>
        <button data-remove="${esc(s.id)}">Quitar</button>
      </div>
    </div>`).join("") : `<div class="empty">Agrega productos con "Lista corta" desde el ranking.</div>`;
}

function renderAll() { renderRanking(); renderDiscarded(); renderCompare(); renderShortlist(); }

// ---------- datos ----------
async function saveShortlist() {
  await fetch("/api/shortlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shortlist) });
}

function recompute() {
  ({ ranked, discarded } = evaluate(lastProducts, form()));
  renderAll();
}

async function search() {
  $("#status").textContent = "Buscando…";
  try {
    const res = await fetch("/api/search?q=" + encodeURIComponent(form().q));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    lastProducts = data.products;
    compareIds = new Set();
    $("#status").textContent = `${lastProducts.length} productos encontrados. Envío a Chile, IVA ${CONFIG.iva * 100}% y tipo de cambio aproximado incluidos.`;
    recompute();
  } catch (e) {
    $("#status").textContent = "Error: " + e.message;
  }
}

// ---------- eventos ----------
$("#form").addEventListener("submit", e => { e.preventDefault(); search(); });
$("#form").addEventListener("input", e => {
  if (e.target.type === "range") e.target.nextElementSibling.value = e.target.value;
  if (lastProducts.length && e.target.name !== "q") recompute();
});
document.querySelectorAll(".slider input").forEach(i => i.nextElementSibling.value = i.value);

document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button, .tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  $("#tab-" + b.dataset.tab).classList.add("active");
}));

document.addEventListener("click", async e => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.compare) {
    const id = t.dataset.compare;
    if (compareIds.has(id)) compareIds.delete(id);
    else if (compareIds.size < 5) compareIds.add(id);
    renderRanking(); renderCompare();
  } else if (t.dataset.short) {
    const id = t.dataset.short;
    const idx = shortlist.findIndex(s => s.id === id);
    if (idx >= 0) shortlist.splice(idx, 1);
    else {
      const r = ranked.flatMap(r => [r, ...(r.clones || [])]).find(r => r.p.id === id);
      shortlist.push({ id, title: r.p.title, url: r.p.url, store: r.p.store.name, variant: r.variant?.label || "", sku_id: r.variant?.sku_id || "", total_clp: r.cost.total, score: r.score, status: "pending", note: "" });
    }
    await saveShortlist(); renderRanking(); renderShortlist();
  } else if (t.dataset.reviews) {
    const id = t.dataset.reviews;
    t.disabled = true; t.textContent = "Leyendo…";
    try {
      const res = await fetch("/api/reviews?id=" + encodeURIComponent(id), { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const p = lastProducts.find(p => p.id === id);
      p.reviews = data.reviews;
      if (p.rating_pct == null) p.rating_pct = data.rating_pct;
      recompute();
    } catch (err) {
      t.disabled = false; t.textContent = "Reintentar reseñas";
      $("#status").textContent = err.message;
    }
  } else if (t.dataset.approve) {
    const s = shortlist.find(s => s.id === t.dataset.approve);
    s.status = s.status === "approved" ? "pending" : "approved";
    await saveShortlist(); renderShortlist();
  } else if (t.dataset.remove) {
    shortlist = shortlist.filter(s => s.id !== t.dataset.remove);
    await saveShortlist(); renderRanking(); renderShortlist();
  }
});

document.addEventListener("change", async e => {
  if (e.target.matches("select[data-variant]")) {
    selectedSku[e.target.dataset.variant] = e.target.value;
    recompute();
    return;
  }
  if (e.target.matches(".sl textarea")) {
    shortlist.find(s => s.id === e.target.closest(".sl").dataset.id).note = e.target.value;
    await saveShortlist();
  }
});

// ---------- búsquedas guardadas ----------
let searches = [];

function renderSaved(selected = "") {
  $("#saved").innerHTML = `<option value="">Búsquedas guardadas…</option>` +
    searches.map(s => `<option${s.name === selected ? " selected" : ""}>${esc(s.name)}</option>`).join("");
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
async function saveSearches() {
  await fetch("/api/searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(searches) });
}
$("#saved").addEventListener("change", e => {
  const s = searches.find(s => s.name === e.target.value);
  if (s) { applySearch(s); search(); }
});
$("#save-search").addEventListener("click", async () => {
  const name = prompt("Nombre para esta búsqueda:", $("#saved").value || form().q);
  if (!name) return;
  const { group, iva_included, type_only, ...fields } = form();
  const entry = { name, ...fields, group, iva_included, type_only };
  const i = searches.findIndex(s => s.name === name);
  if (i >= 0) searches[i] = entry; else searches.push(entry);
  await saveSearches();
  renderSaved(name);
});
$("#del-search").addEventListener("click", async () => {
  const name = $("#saved").value;
  if (!name || !confirm(`¿Borrar la búsqueda "${name}"?`)) return;
  searches = searches.filter(s => s.name !== name);
  await saveSearches();
  renderSaved();
});

(async function init() {
  CONFIG = await (await fetch("/api/config")).json();
  $("#mode").textContent = CONFIG.mode === "api" ? "API real" : "Datos de prueba";
  $("#mode").className = "badge " + CONFIG.mode;
  $("#fx").textContent = `US$1 ≈ ${clp(CONFIG.usd_clp)} · IVA ${CONFIG.iva * 100}%`;
  shortlist = await (await fetch("/api/shortlist")).json();
  renderShortlist();
  searches = await (await fetch("/api/searches")).json();
  renderSaved();
  search();
})();
