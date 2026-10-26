"""Autoriza tu cuenta de AliExpress para la API (se hace una vez).

Uso:  py autorizar.py

1. Abre la página oficial de autorización de AliExpress.
2. Tú inicias sesión y apruebas.
3. AliExpress te manda a la página de GitHub con ?code=... en la dirección.
4. Copias esa dirección completa y la pegas aquí en la terminal (no en el chat).
5. El script guarda el token en .env.
"""

import time
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import aliexpress_api

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
REDIRECT_URI = "https://github.com/Jmaica83/smart-buy-cl"


def read_env():
    env = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()
    return env


def write_env(updates):
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    seen = set()
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if key in updates:
            lines[i] = f"{key}={updates[key]}"
            seen.add(key)
    lines += [f"{k}={v}" for k, v in updates.items() if k not in seen]
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def save_token(data):
    now_ms = int(time.time() * 1000)
    expire = data.get("expire_time") or now_ms + int(data.get("expires_in", 0)) * 1000
    write_env({
        "ALIEXPRESS_ACCESS_TOKEN": data["access_token"],
        "ALIEXPRESS_REFRESH_TOKEN": data.get("refresh_token", ""),
        "ALIEXPRESS_TOKEN_EXPIRES": str(expire),
    })


def main():
    env = read_env()
    key, secret = env.get("ALIEXPRESS_APP_KEY"), env.get("ALIEXPRESS_APP_SECRET")
    if not key or not secret:
        print("Falta ALIEXPRESS_APP_KEY o ALIEXPRESS_APP_SECRET en .env")
        return

    url = aliexpress_api.authorize_url(key, REDIRECT_URI)
    print("Abriendo la página de autorización de AliExpress...")
    print("Si no se abre, copia esta dirección en tu navegador:\n")
    print(url, "\n")
    webbrowser.open(url)

    pasted = input("Después de aprobar, pega aquí la dirección completa a la que te mandó (con ?code=): ").strip()
    code = parse_qs(urlparse(pasted).query).get("code", [pasted])[0]
    if not code:
        print("No encontré el código en lo que pegaste.")
        return

    try:
        data = aliexpress_api.create_token(key, secret, code)
    except Exception as exc:
        print(f"Error al crear el token: {exc}")
        return
    save_token(data)
    days = (int(read_env()["ALIEXPRESS_TOKEN_EXPIRES"]) - time.time() * 1000) / 86400000
    print(f"\nListo. Token guardado en .env (vence en ~{days:.0f} días; se renueva solo).")


if __name__ == "__main__":
    main()
