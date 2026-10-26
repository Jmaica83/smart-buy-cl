"""Asistente de búsqueda: conversa con Claude Code (claude -p) en tu PC.

No usa la API de Anthropic ni API key: llama al Claude Code instalado, con tu
sesión iniciada, así que consume del límite de uso de tu plan.
Cada turno es una llamada nueva sin herramientas, sin MCP y sin tus ajustes,
para que sea rápida y solo pueda conversar.
"""

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKDIR = ROOT / "data" / "chat"

SYSTEM_PROMPT = """Eres el asistente de compras de "Smart Buy CL", un comparador personal de productos de AliExpress para un comprador en Chile.

Tu trabajo: entender qué quiere comprar la persona haciéndole preguntas, y cuando tengas lo necesario, armar la búsqueda para el comparador.

Cómo conversar:
- Español de Chile, cercano y breve. Una o dos preguntas por turno, nunca un cuestionario largo.
- En "options" da de 2 a 5 respuestas rápidas cortas para la pregunta que haces (la persona igual puede escribir otra cosa). Incluye "No sé" cuando la persona podría no saberlo, y en ese caso explica cómo averiguarlo o elige tú lo más seguro.
- Pregunta solo lo que cambia qué producto conviene: tipo exacto de producto, compatibilidad (conectores, modelo del equipo, talla, voltaje), características que debe tener, qué descartar, presupuesto total en CLP y qué le importa más (precio, confiabilidad de la tienda, reseñas, rapidez).
- Si algo técnico importa y la persona no lo sabe, explícalo en una línea (por ejemplo: un cable USB 2.0 de carga rápida no sirve para un SSD).
- No inventes productos ni precios: tú no buscas, el comparador busca.
- Cuando ya sepas lo suficiente (normalmente 3 a 6 turnos), pon done=true, resume en "reply" qué vas a buscar y llena "search".

Cómo llenar "search" (el comparador usa estas reglas):
- q: palabras de búsqueda para AliExpress en español, cortas, empezando por el tipo de producto (ej: "cable usb4 40gbps usb c a usb c"). La primera palabra de tipo se usa para descartar productos de otro tipo, así que debe ser el sustantivo del producto (cable, adaptador, cargador, carcasa, audífonos, zapatillas, taladro...).
- must / nice / exclude: la coma separa requisitos que se deben cumplir TODOS; la barra | separa alternativas (basta una). Se compara contra el título y las características del producto, sin importar mayúsculas ni espacios. Usa términos que aparezcan en títulos reales de AliExpress, con variantes: "40Gbps|USB4|Thunderbolt".
  - must: lo imprescindible (pocas cosas, para no descartar de más).
  - nice: lo deseable, suma puntos.
  - exclude: solo lo que delata un producto equivocado (ej: "USB 2.0, 480Mbps, adaptador, llavero"). NO pongas accesorios que suelen venir incluidos en la caja (estuche, funda, cable de carga, almohadillas, repuestos): muchos títulos los mencionan y descartarías productos buenos. El comparador ya descarta solo los productos que son de otro tipo (por ejemplo una funda cuando buscas audífonos). Pocas palabras y bien específicas.
- budget: presupuesto máximo total puesto en Chile en pesos, solo dígitos, o "" si no hay límite.
- w_price, w_seller, w_product, w_nice: pesos de 0 a 10 según lo que priorice. Precio importa mucho = w_price 8-10; confiabilidad = w_seller y w_product 8-10 y w_price 2-3; equilibrio = 6/5/6/4.
- name: nombre corto para guardar la búsqueda (ej: "Cable USB4 confiable").
Si en la conversación aparece que una búsqueda no encontró nada, propone qué relajar (menos requisitos en must, menos exclusiones, más presupuesto) y al confirmar arma una búsqueda nueva con done=true.
Mientras done=false, deja todos los campos de "search" como "" y los pesos en 5."""

SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "options": {"type": "array", "items": {"type": "string"}},
        "done": {"type": "boolean"},
        "search": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "q": {"type": "string"},
                "must": {"type": "string"},
                "nice": {"type": "string"},
                "exclude": {"type": "string"},
                "budget": {"type": "string"},
                "w_price": {"type": "integer"},
                "w_seller": {"type": "integer"},
                "w_product": {"type": "integer"},
                "w_nice": {"type": "integer"},
            },
            "required": ["name", "q", "must", "nice", "exclude", "budget",
                         "w_price", "w_seller", "w_product", "w_nice"],
            "additionalProperties": False,
        },
    },
    "required": ["reply", "options", "done", "search"],
    "additionalProperties": False,
}


class ChatError(Exception):
    pass


def _transcript(history):
    lines = []
    for turn in history:
        who = "Usuario" if turn["role"] == "user" else "Asistente"
        lines.append(f"{who}: {turn['text']}")
    return "\n\n".join(lines)


def ask(history, model=None):
    """history: lista de {"role": "user"|"assistant", "text": str}; el último es del usuario."""
    exe = shutil.which("claude")
    if not exe:
        raise ChatError("No encontré Claude Code (comando 'claude') en este PC.")
    WORKDIR.mkdir(parents=True, exist_ok=True)

    prompt = ("Conversación hasta ahora:\n\n" + _transcript(history) +
              "\n\nResponde como el Asistente al último mensaje del Usuario.")
    cmd = [exe, "-p", "--output-format", "json", "--tools", "", "--no-session-persistence",
           "--setting-sources", "", "--strict-mcp-config", "--exclude-dynamic-system-prompt-sections",
           "--system-prompt", SYSTEM_PROMPT, "--json-schema", json.dumps(SCHEMA)]
    if model:
        cmd += ["--model", model]
    cmd.append(prompt)

    try:
        proc = subprocess.run(cmd, cwd=WORKDIR, stdin=subprocess.DEVNULL, capture_output=True,
                              timeout=180, encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        raise ChatError("Claude tardó demasiado en responder. Intenta de nuevo.")

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()
        raise ChatError("Claude Code no respondió bien: " + (detail[-1] if detail else f"código {proc.returncode}"))
    if data.get("is_error"):
        raise ChatError(f"Claude Code devolvió un error: {data.get('result') or data.get('subtype')}")

    out = data.get("structured_output")
    if not isinstance(out, dict):
        try:
            out = json.loads(data.get("result") or "")
        except json.JSONDecodeError:
            raise ChatError("La respuesta no tuvo el formato esperado.")
    return out
