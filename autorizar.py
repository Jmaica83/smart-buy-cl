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


def refresh_expire(data, now_ms):
    """Hasta cuándo sirve el refresh token, en milisegundos; 0 si AliExpress no lo dice."""
    valid = data.get("refresh_token_valid_time")
    return int(valid) if valid else now_ms + int(data["refresh_expires_in"]) * 1000 if data.get("refresh_expires_in") else 0


def save_token(data):
    now_ms = int(time.time() * 1000)
    expire = data.get("expire_time") or now_ms + int(data.get("expires_in", 0)) * 1000
    refresh_limit = refresh_expire(data, now_ms) or read_env().get("ALIEXPRESS_REFRESH_EXPIRES", "0")
    write_env({
        "ALIEXPRESS_ACCESS_TOKEN": data["access_token"],
        "ALIEXPRESS_REFRESH_TOKEN": data.get("refresh_token", ""),
        "ALIEXPRESS_TOKEN_EXPIRES": str(expire),
        "ALIEXPRESS_REFRESH_EXPIRES": str(refresh_limit),
    })


def code_from(pasted):
    """Saca el código de la dirección pegada; también acepta el código solo."""
    pasted = pasted.strip()
    return parse_qs(urlparse(pasted).query).get("code", [pasted])[0]


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
    code = code_from(pasted)
    if not code:
        print("No encontré el código en lo que pegaste.")
        return

    try:
        data = aliexpress_api.create_token(key, secret, code)
    except Exception as exc:
        print(f"Error al crear el token: {exc}")
        return
    save_token(data)
    env = read_env()
    hours = (int(env["ALIEXPRESS_TOKEN_EXPIRES"]) - time.time() * 1000) / 3600000
    refresh = (int(env["ALIEXPRESS_REFRESH_EXPIRES"]) - time.time() * 1000) / 3600000
    limit = f"se puede renovar por ~{refresh:.0f} horas" if refresh > 0 else "AliExpress no dijo hasta cuándo se renueva"
    print(f"\nListo. Token guardado en .env (vence en ~{hours:.0f} horas; {limit}).")


if __name__ == "__main__":
    main()
