"""Servidor local del comparador.

Uso:  py server.py   y abrir http://localhost:8000

Sin credenciales en .env funciona en modo prueba con data/mock_products.json.
"""

import json
import os
import re
import time
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import aliexpress_api
import autorizar
import chat
import reviews

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
STATIC = ROOT / "static"
ENRICH = DATA / "enrich"
SHORTLIST = DATA / "shortlist.json"
SEARCHES = DATA / "searches.json"
DEFAULT_SEARCHES = [{
    "name": "Cable USB4 confiable",
    "q": "cable usb4 40gbps usb c a usb c",
    "budget": "",
    "must": "40Gbps|USB4|Thunderbolt",
    "nice": "E-Marker, trenzado|nylon, 240W|100W",
    "exclude": "USB 2.0, 480Mbps, USB-A|USB A a, Micro, llavero, magnético|magnetico, adaptador, 4 puertos",
    "w_price": "2", "w_seller": "9", "w_product": "9", "w_nice": "4",
    "group": True, "iva_included": False, "type_only": True,
}]
PORT = int(os.environ.get("PORT") or 8000)


def load_env():
    env = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip()
    return env


ENV = load_env()
APP_KEY = ENV.get("ALIEXPRESS_APP_KEY", "")
APP_SECRET = ENV.get("ALIEXPRESS_APP_SECRET", "")
MODE = "api" if APP_KEY and APP_SECRET and ENV.get("ALIEXPRESS_ACCESS_TOKEN") else "mock"
CACHE = DATA / "cache"
CACHE_HOURS = 12
DETAIL_COUNT = 50
# Huella del código al arrancar: el lanzador la compara para saber si el servidor quedó viejo.
CODE_STAMP = max(f.stat().st_mtime for f in ROOT.glob("*.py"))
CONFIG = {
    "code_stamp": CODE_STAMP,
    "mode": MODE,
    "usd_clp": float(ENV.get("USD_CLP") or 950),
    "iva": 0.19,
    "duty": 0.06,
    "duty_threshold_usd": 500,
}


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def mock_search(query):
    products = read_json(DATA / "mock_products.json", [])
    terms = [t for t in re.split(r"\s+", query.lower()) if t]
    hits = [p for p in products
            if any(t in (p["title"] + " " + " ".join(p["specs"].values())).lower() for t in terms)]
    return hits or products


def access_token():
    """Devuelve el token vigente; lo renueva si vence en menos de una hora."""
    env = load_env()
    token = env.get("ALIEXPRESS_ACCESS_TOKEN", "")
    expires = int(env.get("ALIEXPRESS_TOKEN_EXPIRES") or 0)
    if expires and expires - time.time() * 1000 < 3600000 and env.get("ALIEXPRESS_REFRESH_TOKEN"):
        data = aliexpress_api.refresh_token(APP_KEY, APP_SECRET, env["ALIEXPRESS_REFRESH_TOKEN"])
        autorizar.save_token(data)
        token = data["access_token"]
    return token


def cached_detail(product_id, session):
    path = CACHE / f"{product_id}.json"
    cached = read_json(path, None)
    fresh = cached and "variants" in cached and time.time() - cached.get("_at", 0) < CACHE_HOURS * 3600
    if fresh and cached.get("shipping_usd") is not None:
        return cached
    # Sin envío: AliExpress a veces no lo cotiza; se reintenta como máximo una vez por hora.
    if fresh and time.time() - cached.get("_freight_tried", 0) < 3600:
        return cached
    if fresh:
        detail = cached  # Solo falta el envío (suele ser por límite de consultas): se reintenta.
    else:
        detail = {"_at": time.time()}
        try:
            detail.update(aliexpress_api.product_detail(APP_KEY, APP_SECRET, session, product_id))
        except Exception as exc:
            detail["_error"] = str(exc)
    for attempt in range(3):
        try:
            ship = aliexpress_api.freight(APP_KEY, APP_SECRET, session, product_id, detail.get("sku_id"))
        except Exception as exc:
            detail["_freight_error"] = str(exc)
            break
        if ship:
            detail.update(ship)
            detail.pop("_freight_error", None)
            break
        time.sleep(1.5 * (attempt + 1))
    detail["_freight_tried"] = time.time()
    path.write_text(json.dumps(detail, ensure_ascii=False, indent=2), encoding="utf-8")
    return detail


def merge_detail(p, d):
    for key in ("title", "image", "rating_pct", "sold"):
        if p.get(key) in (None, "", 0) and d.get(key) not in (None, ""):
            p[key] = d[key]
    # El precio de la variante más barata (la misma que cotiza el envío) es más fiel
    # que el de la búsqueda, que a veces muestra precios promocionales.
    for key in ("price_usd", "shipping_usd", "ship_days", "carrier"):
        if d.get(key) is not None:
            p[key] = d[key]
    if d.get("variants"):
        p["variants"] = d["variants"]
    if d.get("free_shipping_threshold"):
        p["free_shipping_threshold"] = d["free_shipping_threshold"]
    if d.get("specs"):
        p["specs"] = d["specs"]
    for key, value in (d.get("store") or {}).items():
        if value not in (None, ""):
            p["store"][key] = value


def api_search(query):
    session = access_token()
    products = aliexpress_api.search(APP_KEY, APP_SECRET, session, query)
    top = products[:DETAIL_COUNT]
    with ThreadPoolExecutor(max_workers=4) as pool:
        details = list(pool.map(lambda p: cached_detail(p["id"], session), top))
    for p, d in zip(top, details):
        merge_detail(p, d)
    return products


def apply_enrichment(products):
    """Mezcla los datos que Claude carga desde Chrome (reseñas, tienda, envío)."""
    for p in products:
        extra = read_json(ENRICH / f"{p['id']}.json", None)
        if not extra:
            continue
        store = extra.pop("store", {})
        for key, value in store.items():
            if value is not None:
                p["store"][key] = value
        for key in ("shipping_usd", "ship_days", "specs"):
            if extra.get(key) is not None:
                p[key] = extra.pop(key)
        if p.get("rating_pct") is None and extra.get("rating_pct") is not None:
            p["rating_pct"] = extra["rating_pct"]
        p["reviews"] = extra.get("reviews")
    return products


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def log_message(self, fmt, *args):
        pass

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/config":
            return self.send_json(CONFIG)
        if url.path == "/api/search":
            query = parse_qs(url.query).get("q", [""])[0].strip()
            try:
                if MODE == "api":
                    products = api_search(query)
                else:
                    products = mock_search(query)
            except Exception as exc:
                return self.send_json({"error": str(exc)}, 502)
            return self.send_json({"products": apply_enrichment(products)})
        if url.path == "/api/shortlist":
            return self.send_json(read_json(SHORTLIST, []))
        if url.path == "/api/searches":
            return self.send_json(read_json(SEARCHES, DEFAULT_SEARCHES))
        return super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        if url.path == "/api/chat":
            length = int(self.headers.get("Content-Length", 0))
            history = json.loads(self.rfile.read(length) or b"[]")
            try:
                return self.send_json(chat.ask(history, ENV.get("CHAT_MODEL") or None))
            except chat.ChatError as exc:
                return self.send_json({"error": str(exc)}, 502)
        if url.path == "/api/reviews":
            product_id = parse_qs(url.query).get("id", [""])[0]
            if not product_id.isdigit():
                return self.send_json({"error": "Solo productos reales tienen reseñas"}, 400)
            try:
                fresh = reviews.fetch_reviews(product_id)
            except Exception as exc:
                return self.send_json({"error": f"No se pudieron leer las reseñas: {exc}"}, 502)
            path = ENRICH / f"{product_id}.json"
            merged = read_json(path, {})
            merged.update(fresh)
            path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
            return self.send_json(fresh)
        targets = {"/api/shortlist": SHORTLIST, "/api/searches": SEARCHES}
        if url.path not in targets:
            return self.send_json({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length", 0))
        items = json.loads(self.rfile.read(length) or b"[]")
        targets[url.path].write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
        return self.send_json({"ok": True})


def main():
    ENRICH.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"Comparador en {url}  (modo: {'API real' if MODE == 'api' else 'datos de prueba'})")
    print("Ctrl+C para cerrar.")
    if os.environ.get("NO_BROWSER") != "1":
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
