"""Cliente mínimo de AliExpress Open Platform (API de Drop Shipping), solo lectura.

Firma las consultas con HMAC-SHA256 y normaliza los productos al formato
que usa el comparador. Solo usa la biblioteca estándar de Python.

Por diseño solo se pueden llamar los métodos de READ_ONLY_METHODS: la cuenta
autorizada técnicamente permite hacer pedidos, y este cliente lo impide.
"""

import hashlib
import hmac
import json
import time
import urllib.parse
import urllib.request

GATEWAY = "https://api-sg.aliexpress.com"

READ_ONLY_METHODS = {
    "aliexpress.ds.text.search",
    "aliexpress.ds.product.get",
    "aliexpress.ds.freight.query",
    "/auth/token/create",
    "/auth/token/refresh",
}


class ApiError(Exception):
    pass


def _sign(api, params, secret):
    payload = "".join(f"{k}{params[k]}" for k in sorted(params))
    if api.startswith("/"):
        payload = api + payload
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest().upper()


def call(api, app_key, app_secret, session=None, **biz_params):
    if api not in READ_ONLY_METHODS:
        raise ApiError(f"Método bloqueado (solo lectura): {api}")

    params = {
        "app_key": app_key,
        "sign_method": "sha256",
        "timestamp": str(int(time.time() * 1000)),
    }
    if api.startswith("/"):
        url = f"{GATEWAY}/rest{api}"
    else:
        url = f"{GATEWAY}/sync"
        params["method"] = api
    if session:
        params["session"] = session
    for key, value in biz_params.items():
        if value is not None:
            params[key] = value if isinstance(value, str) else json.dumps(value, separators=(",", ":")) \
                if isinstance(value, (dict, list)) else str(value)
    params["sign"] = _sign(api, params, app_secret)

    body = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    })
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = json.loads(resp.read().decode())

    if "error_response" in data:
        err = data["error_response"]
        raise ApiError(f"{err.get('code')}: {err.get('msg')}")
    if data.get("code") not in (None, "0", 0) and "access_token" not in data:
        raise ApiError(f"{data.get('code')}: {data.get('message') or data.get('msg')}")
    return data


# ---------- autorización ----------

def authorize_url(app_key, redirect_uri):
    return (f"{GATEWAY}/oauth/authorize?response_type=code&force_auth=true"
            f"&redirect_uri={urllib.parse.quote(redirect_uri, safe='')}&client_id={app_key}")


def create_token(app_key, app_secret, code):
    return call("/auth/token/create", app_key, app_secret, code=code)


def refresh_token(app_key, app_secret, refresh):
    return call("/auth/token/refresh", app_key, app_secret, refresh_token=refresh)


# ---------- utilidades ----------

def _first(d, *keys):
    for key in keys:
        if isinstance(d, dict) and d.get(key) not in (None, ""):
            return d[key]
    return None


def _num(value):
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace("%", "").replace(",", "").replace("US $", "").replace("$", "").replace("+", "").strip())
    except ValueError:
        return None


def _find_list(obj, *names):
    """Busca la primera lista de dicts bajo alguna de las claves dadas (a cualquier profundidad)."""
    if isinstance(obj, dict):
        for name in names:
            value = obj.get(name)
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value
        for value in obj.values():
            found = _find_list(value, *names)
            if found:
                return found
    elif isinstance(obj, list):
        for value in obj:
            found = _find_list(value, *names)
            if found:
                return found
    return []


def _empty_product(product_id):
    return {
        "id": str(product_id),
        "title": "",
        "url": f"https://www.aliexpress.com/item/{product_id}.html",
        "image": None,
        "price_usd": None,
        "original_price_usd": None,
        "shipping_usd": None,
        "ship_days": None,
        "rating_pct": None,
        "sold": 0,
        "store": {"id": "", "name": "", "url": "", "positive_pct": None, "years": None,
                  "official": False, "choice": False},
        "specs": {},
        "category": "",
        "source": "api",
    }


# ---------- búsqueda ----------

def search(app_key, app_secret, session, keywords, page=1):
    data = call(
        "aliexpress.ds.text.search", app_key, app_secret, session,
        keyWord=keywords, local="es_ES", countryCode="CL", currency="USD",
        pageSize=50, pageIndex=page,
    )
    items = _find_list(data, "selection_search_product", "products", "product")
    out = []
    for it in items:
        pid = _first(it, "itemId", "item_id", "product_id", "productId")
        if not pid:
            continue
        p = _empty_product(pid)
        p["title"] = _first(it, "title", "subject", "product_title") or ""
        image = _first(it, "itemMainPic", "item_main_pic", "product_main_image_url")
        p["image"] = ("https:" + image) if image and image.startswith("//") else image
        p["price_usd"] = _num(_first(it, "targetSalePrice", "salePrice", "target_sale_price", "sale_price"))
        p["original_price_usd"] = _num(_first(it, "targetOriginalPrice", "originalPrice", "target_original_price"))
        p["rating_pct"] = _num(_first(it, "evaluateRate", "evaluate_rate"))
        p["sold"] = int(_num(_first(it, "orders", "lastest_volume", "volume")) or 0)
        out.append(p)
    return out


# ---------- detalle ----------

def product_detail(app_key, app_secret, session, product_id):
    data = call(
        "aliexpress.ds.product.get", app_key, app_secret, session,
        product_id=product_id, ship_to_country="CL", target_currency="USD", target_language="ES",
    )
    result = _find_result(data)
    base = result.get("ae_item_base_info_dto") or {}
    store = result.get("ae_store_info") or {}
    logistics = result.get("logistics_info_dto") or {}
    skus = _find_list(result.get("ae_item_sku_info_dtos") or {}, "ae_item_sku_info_d_t_o")
    props = _find_list(result.get("ae_item_properties") or {}, "ae_item_property")
    images = ((result.get("ae_multimedia_info_dto") or {}).get("image_urls") or "").split(";")

    priced = [(_num(_first(s, "offer_sale_price", "sku_price")), s) for s in skus]
    priced = sorted([x for x in priced if x[0]], key=lambda x: x[0])
    rating = _num(base.get("avg_evaluation_rating"))
    specs = {p.get("attr_name"): p.get("attr_value") for p in props
             if p.get("attr_name") and p.get("attr_value")}
    choice = str(specs.pop("Choice", "")).lower() == "yes"
    for junk in ("semi_Choice", "Producto químico de alta preocupación", "Paquete", "Certificación"):
        specs.pop(junk, None)

    detail = {
        "title": base.get("subject"),
        "image": images[0] if images and images[0] else None,
        "price_usd": priced[0][0] if priced else None,
        "sku_id": priced[0][1].get("sku_id") if priced else (skus[0].get("sku_id") if skus else None),
        "ship_days": _num(logistics.get("delivery_time")),
        "rating_pct": rating * 20 if rating and rating <= 5 else rating,
        "sold": int(_num(base.get("sales_count")) or 0) or None,
        "store": {
            "id": str(store.get("store_id") or ""),
            "name": store.get("store_name") or "",
            "url": f"https://www.aliexpress.com/store/{store.get('store_id')}" if store.get("store_id") else "",
            "described_rating": _num(store.get("item_as_described_rating")),
            "shipping_rating": _num(store.get("shipping_speed_rating")),
            "communication_rating": _num(store.get("communication_rating")),
            "choice": choice,
        },
        "specs": specs,
        "variants": [_variant(price, s) for price, s in priced],
    }
    return detail


def _variant(price, sku):
    props = _find_list(sku.get("ae_sku_property_dtos") or {}, "ae_sku_property_d_t_o")
    parts = []
    for p in props:
        value = p.get("property_value_definition_name") or p.get("sku_property_value") or ""
        if value and "china" not in value.lower():  # "Envíos desde: China" no distingue variantes
            parts.append(value.strip())
    return {
        "sku_id": str(sku.get("sku_id")),
        "label": " / ".join(parts) or "Única",
        "price_usd": price,
        "stock": int(_num(sku.get("sku_available_stock")) or 0),
    }


def freight(app_key, app_secret, session, product_id, sku_id=None):
    req = {"productId": int(product_id), "quantity": 1, "shipToCountry": "CL",
           "language": "es_ES", "locale": "es_ES", "currency": "USD"}
    if sku_id:
        req["selectedSkuId"] = str(sku_id)
    data = call("aliexpress.ds.freight.query", app_key, app_secret, session, queryDeliveryReq=req)
    options = _find_list(data, "delivery_option_d_t_o", "delivery_options")
    best = None
    for opt in options:
        # shipping_fee_cent viene en dólares pese al nombre; el texto formateado es la referencia.
        fee = _num(_first(opt, "shipping_fee_format", "shipping_fee_cent"))
        if str(opt.get("free_shipping")).lower() == "true":
            fee = 0.0
        if fee is None:
            continue
        if best is None or fee < best["shipping_usd"]:
            best = {"shipping_usd": fee,
                    "ship_days": _num(opt.get("max_delivery_days")),
                    "carrier": _first(opt, "company", "code"),
                    "free_shipping_threshold": _num(opt.get("free_shipping_threshold"))}
    return best


def _find_result(data):
    for value in data.values():
        if isinstance(value, dict):
            if "result" in value and isinstance(value["result"], dict):
                return value["result"]
            if "ae_item_base_info_dto" in value:
                return value
    return {}
