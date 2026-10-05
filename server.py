"""Servidor local del comparador.

Uso:  py server.py   y abrir http://localhost:8000

Sin credenciales en .env funciona en modo prueba con data/mock_products.json.
"""

import json
import os
import re
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import aliexpress_api
import reviews

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
STATIC = ROOT / "static"
ENRICH = DATA / "enrich"
SHORTLIST = DATA / "shortlist.json"
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
TRACKING_ID = ENV.get("ALIEXPRESS_TRACKING_ID", "")
MODE = "api" if APP_KEY and APP_SECRET else "mock"
CONFIG = {
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
                    products = aliexpress_api.search(APP_KEY, APP_SECRET, TRACKING_ID, query)
                else:
                    products = mock_search(query)
            except Exception as exc:
                return self.send_json({"error": str(exc)}, 502)
            return self.send_json({"products": apply_enrichment(products)})
        if url.path == "/api/shortlist":
            return self.send_json(read_json(SHORTLIST, []))
        return super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
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
        if url.path != "/api/shortlist":
            return self.send_json({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length", 0))
        items = json.loads(self.rfile.read(length) or b"[]")
        SHORTLIST.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
        return self.send_json({"ok": True})


def main():
    ENRICH.mkdir(parents=True, exist_ok=True)
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
