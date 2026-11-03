# CLAUDE.md: Smart Buy CL (repo smart-buy-cl)

Comparador personal de productos de AliExpress para comprar desde Chile. Un asistente arma la búsqueda; la app rankea por costo real puesto en Chile, tienda y reseñas. App web local en Python, con `static/` como interfaz.

El estado vive en `ESTADO.md`; se actualiza al cerrar cada chat con `/cerrar`.

## Cómo se ejecuta
- `iniciar.bat` o `py iniciar.py`: abre http://localhost:8000. Reinicia el servidor si su código quedó viejo.
- `py server.py`: solo el servidor. `PORT` cambia el puerto; `NO_BROWSER=1` no abre el navegador.
- `py autorizar.py`: autoriza la cuenta (una vez). La URL se pega en la terminal, no en el chat.
- `py probar_api.py [palabras]`: prueba la API y muestra la forma de las respuestas.
- Sin credenciales en `.env`, corre en modo prueba con `data/mock_products.json`.
- Para `design/tests.yaml`, levantar el servidor con `PORT=8001`.

## Reglas
- Las credenciales van solo en `.env` (fuera de git), nunca en el chat. El repo es público.
- La API es solo lectura: no agregar métodos de orden a `READ_ONLY_METHODS` (`aliexpress_api.py`).
- Sin API pagada: `chat.py` usa `claude -p` local.
- Se compra con el link normal del producto, nunca con link de afiliado. Darío paga él mismo.
- Claude in Chrome se cuelga en aliexpress.com: guiar a Darío paso a paso.
- `shipping_fee_cent` de `ds.freight.query` viene en dólares, pese al nombre.
- Interfaz en español de Chile, tono calmo, sin urgencia ni colores de promoción (`design/brief.md`).
- Las decisiones pendientes se le preguntan a Darío con AskUserQuestion, no en listas de texto.

## Documentos
- `ESTADO.md`: estado. `README.md`: qué hace (aún cita la API de afiliados).
- `design/brief.md`, `design/dna-smartbuy.md`, `design/tests.yaml`: diseño y su verificación.
- `server.py`, `aliexpress_api.py`, `reviews.py`, `chat.py`: servidor, API, reseñas y asistente.
