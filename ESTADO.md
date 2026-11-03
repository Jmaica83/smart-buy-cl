# Estado: Aliexpress (Smart Buy CL)
Actualizado: 2026-11-03

## En curso
- Trabajo abierto: sin dato. El último avance real es del 2026-10-26.
- Estado a esa fecha: la app corre con la API real (búsqueda, detalle y envío a Chile), asistente conversacional y UI rediseñada.
- Vencimiento actual del token de la API: sin dato. Dura cerca de 1 día y se renueva solo.

## Decidido hace poco
Todo del 2026-10-26:
- API Drop Shipping en modo solo lectura, en vez de la de afiliados (quedó «Unmet»).
- Sin API pagada: el asistente usa Claude Code local (`claude -p`) con la cuota del plan.
- Reseñas desde un endpoint público no oficial, sabiendo que puede romperse.
- UI con el DNA `design/dna-smartbuy.md`; entró al catálogo como `herramienta-calida`.
- Aprobado el estado vacío del asistente en bloque taupe.

## Siguiente
- Nombre y logo definitivos (pendiente en `design/brief.md`).
- Otros pasos: sin dato.

## Dónde mirar
- `CLAUDE.md`: cómo se ejecuta y reglas.
- `design/brief.md`: decisiones y pendientes del diseño.
- `design/dna-smartbuy.md` y `design/tests.yaml`: vara visual.
- `git log`: historia del código.
- Ojo: `README.md` aún describe la API de afiliados.
- Ojo: la memoria dice que no se había hecho push, pero `origin/main` ya coincide con `HEAD`.
