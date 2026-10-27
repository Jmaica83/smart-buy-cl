# Vuelta 1 — 2026-10-26

Pieza: `static/` (index.html, style.css, app.js), servida en `http://localhost:8001/?buscar=Cable%20USB4%20confiable`. Modo: rápido (herramienta interna).
Verificador: `loop/verificacion-1/resultado.json` (con `--a11y`). Capturas y `lado.png` en la misma carpeta.
Crítico: uno combinado (fidelidad + craft + gusto), Sonnet, sobre la versión de la vuelta. En paralelo, un agente hizo la revisión funcional (32 puntos) antes de construir.

## Medición

- **Línea base (app anterior, `verificacion/v0`):** 1 de 17 tests del DNA; puerta de accesibilidad FALLA (contraste 3,74:1 del naranja, táctil 0/28).
- **Tests del DNA:** pasan 17 de 17.
- **Puerta de accesibilidad:** PASA (contraste, axe, táctil 44 px, foco).
- **Severidades altas:** 4 (vuelta anterior: no hubo).

## Gusto y referencia

| # | Pregunta | Sí / no | Evidencia |
|---|---|---|---|
| 1 | ¿Se reconoce la referencia por la forma? | Parcial | Titular fino, píldora negra y tono cálido sí; faltaban un foco único y aire |
| 2 | ¿Hay algo que no saldría de una plantilla? | Casi no | Lo más propio: titular 48 px y la tarjeta con foto; el resto es formulario estándar |
| 3 | ¿Mismo nivel de oficio que la referencia? | No | La referencia tiene un objeto protagonista y un solo mensaje |
| 4 | ¿Siluetas reconocibles? | No aplica | Solo fotos de producto |
| 5 | ¿Formas orgánicas deformes? | No | Sin ilustración |
| 6 | ¿El color solo donde significa algo? | Sí | Puntos ok/aviso/error y fotos |
| 7 | ¿Se tocó algo ya aprobado? | No aplica | Primera versión con DNA |
| 8 | ¿Emojis, sombras, degradados, stock, IA? | No | Ninguno |
| 9 | ¿Se copió la identidad de la referencia? | No | Solo patrones |
| 10 | ¿En el teléfono se ve diseñado? | Mixto | El asistente sí; el ranking era la versión de escritorio apilada |

Veredicto del crítico: «hereda paleta y tipografía, pero por la forma todavía se ve genérica».

## Encontrado y aplicado

**Severidad alta**
- Doble titular en el asistente vacío («Asistente» 32 px + «¿Qué quieres comprar?» 48 px + dos ayudas). Ahora el estado vacío es un solo bloque taupe radio 24 con el titular de 48 px; el h2 queda solo para lectores de pantalla.
- Tarjeta sin foco: el selector de variante pesaba más que el título. Selector a 12 px mono sobre fondo transparente; razones visibles bajan de 3 a 2; el producto #1 lleva foto de 160 px como protagonista.
- Acciones desalineadas y «En la lista» con borde negro que parecía primario. Ahora es una grilla de igual ancho; el estado activo es relleno stone.
- Tabla Comparar recortada a la derecha. Columnas de 160–260 px que se ajustan; caben 3 productos a 1280.

**Severidad media**
- Barra de puntaje de 4 px casi invisible: pasa a 6 px.
- Panel lateral apretado: 20 px entre campos, 24 px antes de los pesos; «Debe tener» y «Descartar» en dos líneas.
- La línea de estado separaba pestañas y titular: ahora vive bajo el titular de Ranking.
- Hueco vacío entre la conversación y el cuadro para escribir: se quitó el alto mínimo.

**Severidad baja**
- Pestañas cortadas a 390: padding de 12 px.

## Descartado

- Bajar el borde del selector de variante a stone (crítico): choca con el test 7 del DNA (borde #8a847c, contraste de campos WCAG 1.4.11). Se alivianó con tamaño y fondo.
- Número del ranking «azulado» (crítico): el CSS lo pinta ink; es efecto de la compresión de la captura.

## Pendiente para Darío

- ~~Estado vacío del asistente en bloque taupe~~: aprobado por Darío (2026-10-26).
- Nombre y logo definitivos (brief).

## Cambios al DNA o al brief

Ninguno.

## Cierre

Re-verificación sobre la versión final (`loop/verificacion-final/`): tests del DNA 17 de 17, puerta de accesibilidad PASA. Mostrado a Darío en el chat con capturas PNG.

## Proceso

- Los chequeos `js` de `tests.yaml` deben empezar con `return` en el nivel superior: `verificar.py` usa el cuerpo tal cual si encuentra la palabra `return` dentro de la expresión.
- El contraste se medía a mitad de la transición de color de las pestañas; las pestañas quedaron sin transición.
- La app necesita el servidor con datos; el yaml apunta a `?buscar=Cable USB4 confiable` con 25 s de espera.
