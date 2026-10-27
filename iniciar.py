"""Abre Smart Buy CL. Si el servidor ya corre con el código actual, solo abre el navegador;
si corre con código viejo, lo cierra y lo vuelve a iniciar."""

import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8000
URL = f"http://localhost:{PORT}"


def running_stamp():
    try:
        with urllib.request.urlopen(f"{URL}/api/config", timeout=3) as r:
            return json.load(r).get("code_stamp", 0)
    except Exception:
        return None


def pid_on_port():
    out = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True).stdout
    for line in out.splitlines():
        m = re.search(rf"127\.0\.0\.1:{PORT}\s+\S+\s+LISTENING\s+(\d+)", line)
        if m:
            return int(m.group(1))
    return None


def main():
    current = max(f.stat().st_mtime for f in ROOT.glob("*.py"))
    stamp = running_stamp()
    if stamp is not None and stamp >= current:
        webbrowser.open(URL)
        return
    if stamp is not None or pid_on_port():
        pid = pid_on_port()
        if pid:
            print("Reiniciando el servidor con la versión nueva…")
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
            for _ in range(20):
                if not pid_on_port():
                    break
                time.sleep(0.25)
    print("Comparador Smart Buy CL. No cierres esta ventana mientras lo uses.")
    os.chdir(ROOT)
    sys.exit(subprocess.call([sys.executable, "server.py"]))


if __name__ == "__main__":
    main()
