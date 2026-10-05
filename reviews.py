"""Lee reseñas desde el endpoint público (no oficial) de AliExpress.

No es parte de la API de afiliados: puede cambiar o bloquearse sin aviso.
Se consulta solo bajo demanda (un producto a la vez) y se guarda en caché.
"""

import json
import time
import urllib.parse
import urllib.request

ENDPOINT = "https://feedback.aliexpress.com/pc/searchEvaluation.do"
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
PAGES = 3
PAGE_SIZE = 20

# Palabras que suelen indicar un problema real en cables, electrónica y ropa.
FLAG_TERMS = {
    "Velocidad menor a la anunciada": ["lento", "480", "usb 2.0", "slow", "no es 10", "no es 20", "velocidad baja"],
    "No funciona o dejó de funcionar": ["no funciona", "dejó de funcionar", "dejo de funcionar", "not working", "stopped working", "no sirve"],
    "No coincide con la descripción": ["no coincide", "diferente", "falso", "fake", "no es el", "no es lo que"],
    "Llegó dañado o de mala calidad": ["roto", "dañado", "danado", "broken", "mala calidad", "se rompió", "se rompio"],
    "Problemas de talla o medida": ["talla", "pequeño", "grande", "más corto", "mas corto", "size"],
    "No llegó o envío problemático": ["no llegó", "no llego", "nunca llegó", "never arrived", "reembolso", "refund"],
}


def _fetch(product_id, page, filter_="all"):
    query = urllib.parse.urlencode({
        "productId": product_id, "lang": "es_ES", "country": "CL",
        "page": page, "pageSize": PAGE_SIZE, "filter": filter_, "sort": "complex_default",
    })
    req = urllib.request.Request(f"{ENDPOINT}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode()).get("data") or {}


def _text(review):
    return (review.get("buyerTranslationFeedback") or review.get("buyerFeedback") or "").strip()


def _labels(data):
    out = []
    for item in data.get("reviewStructuredLabelDTOList") or []:
        for label in item.get("categoryReviewLabelDTOList") or []:
            options = label.get("labelValueOptions") or []
            best = max(options, key=lambda o: o.get("displayOption", 0), default=None)
            if best:
                out.append(f"{label.get('labelName')}: {best.get('countPercentage')} {best.get('labelValueName', '').lower()}")
    return out


def fetch_reviews(product_id):
    first = _fetch(product_id, 1)
    stats = first.get("productEvaluationStatistic") or {}
    counts = {f["filterCode"]: f["filterCount"] for f in (first.get("filterInfo") or {}).get("filterStatistic", [])}

    reviews = list(first.get("evaViewList") or [])
    for page in range(2, min(PAGES, first.get("totalPage") or 1) + 1):
        time.sleep(0.8)
        reviews += _fetch(product_id, page).get("evaViewList") or []

    negatives = [r for r in reviews if (r.get("buyerEval") or 100) <= 60 and _text(r)]
    flags = []
    for flag, terms in FLAG_TERMS.items():
        hits = [r for r in negatives if any(t in _text(r).lower() for t in terms)]
        if hits:
            flags.append(f"{flag} ({len(hits)} reseña{'s' if len(hits) > 1 else ''})")

    from_chile = [r for r in reviews if r.get("buyerCountry") == "CL" and _text(r)]

    return {
        "rating_pct": stats.get("positiveRate") or None,
        "reviews": {
            "source": "AliExpress (endpoint no oficial)",
            "fetched": time.strftime("%Y-%m-%d"),
            "total": stats.get("totalNum", 0),
            "read": len(reviews),
            "with_photos": counts.get("image", 0),
            "stars": stats.get("evarageStar"),
            "negative_pct": stats.get("negativeRate"),
            "labels": _labels(first),
            "flags": flags,
            "worst": [{"stars": round((r.get("buyerEval") or 0) / 20), "text": _text(r)[:300],
                       "variant": r.get("skuInfo", ""), "country": r.get("buyerCountry")}
                      for r in negatives[:5]],
            "chile": [_text(r)[:300] for r in from_chile[:3]],
            "summary": "",
        },
    }
