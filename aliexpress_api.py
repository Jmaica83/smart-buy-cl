"""Cliente mínimo de la API de afiliados de AliExpress (Open Platform).

Firma las consultas con HMAC-SHA256 y normaliza los productos al formato
que usa el comparador. Solo usa la biblioteca estándar de Python.
"""

import hashlib
import hmac
import json
import time
import urllib.parse
import urllib.request

GATEWAY = "https://api-sg.aliexpress.com/sync"


class ApiError(Exception):
    pass


def _sign(params, secret):
    payload = "".join(f"{k}{params[k]}" for k in sorted(params))
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest().upper()


def call(method, app_key, app_secret, **biz_params):
    params = {
        "app_key": app_key,
        "method": method,
        "sign_method": "sha256",
        "timestamp": str(int(time.time() * 1000)),
    }
    params.update({k: str(v) for k, v in biz_params.items() if v is not None})
    params["sign"] = _sign(params, app_secret)

    body = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(GATEWAY, data=body, headers={
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode())

    if "error_response" in data:
        err = data["error_response"]
        raise ApiError(f"{err.get('code')}: {err.get('msg')}")
    return data


def _pct(value):
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace("%", ""))
    except ValueError:
        return None


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize(p):
    return {
        "id": str(p.get("product_id")),
        "title": p.get("product_title", ""),
        "url": p.get("product_detail_url") or f"https://www.aliexpress.com/item/{p.get('product_id')}.html",
        "image": p.get("product_main_image_url"),
        "price_usd": _num(p.get("target_sale_price")),
        "original_price_usd": _num(p.get("target_original_price")),
        "shipping_usd": None,
        "ship_days": None,
        "rating_pct": _pct(p.get("evaluate_rate")),
        "sold": int(p.get("lastest_volume") or 0),
        "store": {
            "id": str(p.get("shop_id") or ""),
            "name": p.get("shop_name") or "",
            "url": p.get("shop_url") or "",
            "positive_pct": None,
            "years": None,
            "official": False,
            "choice": False,
        },
        "specs": {},
        "category": p.get("second_level_category_name") or p.get("first_level_category_name") or "",
        "source": "api",
    }


def search(app_key, app_secret, tracking_id, keywords, page=1):
    data = call(
        "aliexpress.affiliate.product.query",
        app_key, app_secret,
        keywords=keywords,
        ship_to_country="CL",
        target_currency="USD",
        target_language="ES",
        page_no=page,
        page_size=50,
        tracking_id=tracking_id or None,
    )
    result = (data.get("aliexpress_affiliate_product_query_response", {})
                  .get("resp_result", {}))
    if str(result.get("resp_code")) not in ("200", "405"):
        raise ApiError(f"{result.get('resp_code')}: {result.get('resp_msg')}")
    products = (result.get("result") or {}).get("products", {}).get("product", [])
    return [normalize(p) for p in products]
