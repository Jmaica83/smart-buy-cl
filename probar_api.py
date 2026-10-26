"""Prueba la conexión con la API y muestra la forma de las respuestas (sin llaves).

Uso:  py probar_api.py [palabras de búsqueda]
"""

import json
import sys

import aliexpress_api
import autorizar


def shape(obj, depth=0, max_depth=6):
    """Resume la estructura: claves y un ejemplo de valor, sin volcar todo."""
    pad = "  " * depth
    if depth > max_depth:
        return pad + "..."
    if isinstance(obj, dict):
        return "\n".join(f"{pad}{k}:\n{shape(v, depth + 1)}" if isinstance(v, (dict, list))
                         else f"{pad}{k}: {str(v)[:70]!r}" for k, v in obj.items())
    if isinstance(obj, list):
        return f"{pad}[lista de {len(obj)}]" + ("\n" + shape(obj[0], depth + 1) if obj else "")
    return pad + repr(obj)[:70]


def main():
    env = autorizar.read_env()
    key, secret = env["ALIEXPRESS_APP_KEY"], env["ALIEXPRESS_APP_SECRET"]
    session = env.get("ALIEXPRESS_ACCESS_TOKEN")
    query = " ".join(sys.argv[1:]) or "cable usb c 10gbps"

    print("== búsqueda (respuesta cruda) ==")
    raw = aliexpress_api.call("aliexpress.ds.text.search", key, secret, session,
                              keyWord=query, local="es_ES", countryCode="CL", currency="USD",
                              pageSize=3, pageIndex=1)
    print(shape(raw))

    products = aliexpress_api.search(key, secret, session, query)
    print(f"\n== {len(products)} productos normalizados; primero: ==")
    if not products:
        return
    print(json.dumps(products[0], ensure_ascii=False, indent=1))

    pid = products[0]["id"]
    print("\n== detalle (respuesta cruda) ==")
    print(shape(aliexpress_api.call("aliexpress.ds.product.get", key, secret, session,
                                    product_id=pid, ship_to_country="CL",
                                    target_currency="USD", target_language="ES")))
    detail = aliexpress_api.product_detail(key, secret, session, pid)
    print("\n== detalle normalizado ==")
    print(json.dumps(detail, ensure_ascii=False, indent=1)[:2000])

    print("\n== envío (respuesta cruda) ==")
    print(shape(aliexpress_api.call("aliexpress.ds.freight.query", key, secret, session,
                                    queryDeliveryReq={"productId": int(pid), "quantity": 1,
                                                      "shipToCountry": "CL", "language": "es_ES",
                                                      "locale": "es_ES", "currency": "USD",
                                                      "selectedSkuId": str(detail.get("sku_id"))})))
    print("\n== envío normalizado ==")
    print(aliexpress_api.freight(key, secret, session, pid, detail.get("sku_id")))


if __name__ == "__main__":
    main()
