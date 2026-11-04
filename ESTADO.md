# Estado: Aliexpress (Smart Buy CL)
Actualizado: 2026-11-03

## En curso
- La búsqueda real funciona: Darío autorizó de nuevo el 2026-11-03.
- Sin uso por varios días, la renovación automática deja de servir y hay que correr `py autorizar.py`.
- La app corre con asistente conversacional, estilo suizo-institucional, logo definitivo y acceso directo en el escritorio.

## Decidido hace poco
- 2026-11-04: la UI pasa al estilo suizo-institucional (`design/dna-smartbuy.md` v2). El registro está en `design/loop/vuelta-suizo-1.md`.
- 2026-11-03: logo Paquete estrella, en tinta, dibujado con JavaScript (`logo/propuestas/logos.js`; `node logo/generar.js` rehace los archivos).
- 2026-11-03: el nombre definitivo es Smart Buy CL.
- 2026-11-03: se arreglaron los 15 bugs de gravedad alta y media de la revisión.
- 2026-11-03: `design/tests.yaml` pasa 17 de 17 con datos reales.
- 2026-11-03: la búsqueda junta varias listas y busca marcas aparte (campo Marcas), porque la API da 20 por página y favorece lo barato.
- 2026-11-03: las marcas pedidas suman 15 puntos al ranking y la variante se elige por lo que el título no dice, como el largo.

Del 2026-10-26:
- API Drop Shipping en modo solo lectura, en vez de la de afiliados (quedó «Unmet»).
- Sin API pagada: el asistente usa Claude Code local (`claude -p`) con la cuota del plan.
- Reseñas desde un endpoint público no oficial, sabiendo que puede romperse.
- La UI anterior entró al catálogo como `herramienta-calida`.

## Siguiente
1. Comprobado el 2026-11-03 con la API real y la página de `1005011932940880`:
   - `shipping_fee_format` viene como «US $2.99», `orders` como «10,000+» y `price_include_tax` es `False`. La página dice «VAT calculated at checkout», así que el IVA no se duplica.
   - Sobre `free_shipping_threshold` (US$10) la página muestra «Free shipping» con retiro en punto de entrega. El envío a domicilio no se comprobó.
2. Revisar el tipo de cambio: es fijo (`USD_CLP`, 926 en `.env` desde el 2026-11-03, sacado de $12.100 por US$13,06) y no avisa su antigüedad.
3. Bugs menores sin arreglar:
   - XSS en campos numéricos de reseñas sin `esc()` (`reviewBlock` en `static/app.js`).
   - Comparar queda bloqueado por productos ocultos: limpiar `compareIds` en `recompute`.
   - Una variante manual sobre presupuesto no se puede revertir desde Descartados.
   - Cambiar `q` sin buscar y mover un filtro descarta todo.
   - Tabla Comparar: marca «—» como mejor si todo es null y no tiene fila de arancel.
   - Asistente: errores no capturados en `/api/chat` (prompt muy largo, JSON malo).
   - Falsos descartes por tipo: «ssd externo» descarta «Disco SSD externo».
   - Coincidencias que cruzan palabras: must «2m» acepta «2mm».
   - `isdigit()` acepta «²» en `/api/reviews`.
4. Dudas sin comprobar: dictado tras `stop()`, `javascript:` en la URL de la lista corta, estáticos sin `Cache-Control`.

## Dónde mirar
- `CLAUDE.md`: cómo se ejecuta y reglas.
- `design/brief.md`: decisiones del diseño.
- `design/dna-smartbuy.md` y `design/tests.yaml`: vara visual.
- `git log`: historia del código.
- Ojo: `README.md` aún describe la API de afiliados.
- Ojo: la memoria dice que no se había hecho push, pero `origin/main` ya coincide con `HEAD`.
