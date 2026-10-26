# DNA — Smart Buy CL (adaptado de «Cuaderno de estudio» / ElevenLabs)

Versión 1 (2026-10-26). Copia adaptada de `design/estilos/elevenlabs-calido/dna-elevenlabs.md` (biblioteca, 2026-10-21). Es la vara de los críticos de `design-loop`. Del original se toma el sistema, no su marca, logo ni textos.

## Resumen en una frase
Papel cáscara de huevo con tinta negra: cada pestaña abre con un titular susurrado en Inter 300; todo lo demás en Inter 400/500; superficies cálidas en capas sin sombras; píldoras negras para la única acción principal; y el color vivo solo dentro del «producto», que aquí son las fotos de los productos de AliExpress.

## Tokens

### Color (claro) — ≈ 85 % fondos cálidos · 12 % tinta · ≤ 3 % color (fotos)
| Rol | Hex | Uso |
|---|---|---|
| canvas | `#fdfcfc` | fondo de la app, panel lateral, botones secundarios. Nunca `#ffffff` |
| taupe | `#f5f3f1` | tarjetas de producto, burbujas del asistente, bandas |
| stone | `#ebe8e4` | hairlines de 1 px, divisores, pista de la barra de puntaje |
| ink | `#000000` | texto principal, botón principal, pestaña activa, burbuja del usuario |
| graphite | `#44403b` | texto secundario fuerte, etiquetas |
| smoke | `#6b655e` | texto de cuerpo y ayuda |
| ash | `#a59f97` | solo decorativo (nunca texto) |
| borde de campo | `#8a847c` | borde 1 px de inputs, selects y del cuadro del asistente |
| borde de botón | `#e5e5e5` | borde 1 px de píldoras secundarias |
| ok / aviso / error | `#3d7a57` / `#9a6a1f` / `#b3261e` | SOLO como punto de 6 px junto a texto graphite |

### Color (oscuro)
canvas `#141311` · taupe `#1c1a18` · stone `#2a2724` · ink `#f5f3f1` (texto y relleno del botón principal, con texto `#141311`) · graphite `#d6d1ca` · smoke `#a59f97` · ash `#8a847c` · borde de campo `#777169`. Puntos semánticos: ok `#6fb38a`, aviso `#d3a050`, error `#ef6b62`.

### Tipografía
| Rol | Familia | Peso | Tamaño / interlínea | Tracking |
|---|---|---|---|---|
| display de pantalla vacía (asistente sin conversación) | Inter | 300 | 48 px / 1.08 | −0.02em |
| display (título de pestaña, `h2.panel-title`) | Inter | 300 | 32 px / 1.13 | −0.02em |
| display pequeño (precio total, puntaje) | Geist Mono / Inter | 400 / 300 | 24 px / 1.17 | −0.02em |
| subtítulo de sección / título de producto | Inter | 500 | 15 px / 1.4 | +0.01em |
| cuerpo | Inter | 400 | 14 px / 1.5 | +0.01em |
| texto del asistente y del cuadro para escribir | Inter | 400 | 16 px / 1.55 | 0 |
| botón, pestaña | Inter | 500 | 14 px (13 px en barras) | 0 |
| ayuda / caption | Inter | 400 | 12 px / 1.5 (mín. 12 px; 11 px solo en chips) | 0 |
| técnico (precios, puntajes, US$, días, %, variantes) | Geist Mono | 400 | 13 px / 1.69 (12 px en tablas) | 0 |

### Espaciado
Unidad 4 px. Escala 4·8·12·16·20·24·32·40·48·64. Entre bloques 24 px; dentro de un bloque 8–12 px; padding de tarjeta 20 px. Barra superior 56 px. Panel lateral 360 px.

### Forma
- Radios: tarjetas 20 px · overlays 24 px · inputs 4 px · botones, pestañas, chips 9999 px · foto de producto 12 px.
- Bordes: 1 px stone; botones secundarios 1 px `#e5e5e5`.
- Sombras: ninguna en tarjetas. Solo la susurrada en lo que flota (toast, barra flotante): `0 0 1px rgba(0,0,0,.4), 0 1px 1px rgba(0,0,0,.04), 0 2px 4px rgba(0,0,0,.04)`.

### Movimiento
120–180 ms, `ease-out`, solo en fondo/borde de controles al pasar el mouse y el indicador «pensando» del asistente. Nada rebota ni escala. Con `prefers-reduced-motion` no hay animaciones.

### Voz
Calma y precisa. Títulos de 1–3 palabras, sin signos de exclamación en la interfaz, sin mayúsculas sostenidas salvo siglas (CLP, IVA, US$).

## Firmas
1. **Titular susurrado**: cada pestaña abre con su nombre en Inter 300, 32 px, −0.02em, ink.
2. **Píldoras negras**: una sola acción principal visible por vista (Buscar, Enviar, Aprobar para el carro), píldora ink con texto canvas; las secundarias, píldoras canvas con borde 1 px. Ningún botón de color.
3. **Capas cálidas sin sombra**: canvas → taupe → stone. Tarjetas taupe, radio 20, sin borde ni sombra.
4. **Hairlines**: la separación es una línea de 1 px stone.
5. **Color solo en el producto**: el único color vivo de la pantalla son las fotos de los productos.
6. **Mono técnico**: precios, puntajes, porcentajes, días y variantes en Geist Mono.

## Prohibiciones
- Ningún `font-weight` > 500.
- Ninguna familia distinta de Inter y Geist Mono (más la pila del sistema como respaldo).
- Ningún `#fff`/`#ffffff`/`white` de fondo; ningún gris frío.
- Ningún botón, pestaña, chip, foco o enlace de color (naranja, azul, verde, rojo). El naranja `#e8502a` de la versión anterior sale de la interfaz.
- Ninguna sombra difuminada > 4 px; ninguna sombra en tarjetas.
- Ningún radio < 16 px en tarjetas; ningún botón con esquinas.
- Nada de degradados.
- Estados (ok/aviso/error) sin fondos de color: texto graphite con punto de 6 px.
- Sin emojis.

## Layouts con nombre
- **Taller en dos columnas**: barra superior 56 px (marca, estado de datos, tipo de cambio) · panel lateral canvas 360 px con hairline a la derecha (búsquedas guardadas y filtros) · área principal canvas con pestañas en píldora.
- **Pantalla vacía del asistente**: titular 48 px centrado, una línea de ayuda smoke, cuadro grande para escribir y respuestas rápidas en píldoras.
- **Tarjeta de producto**: foto 96 px radio 12 → título 15/500 → tienda y variante → chips → razones con puntos semánticos; a la derecha, total en Geist Mono 24 px, desglose 12 px y puntaje con barra ink sobre stone.

## Adaptación al proyecto (desde elevenlabs-calido)
| Original | Aquí | Por qué |
|---|---|---|
| El «producto» es el molde y la prenda (chispas violeta/naranja) | El «producto» son las fotos de AliExpress; no se usan chispas | Las fotos ya traen todo el color; la interfaz queda en tinta |
| Inputs radio 4 px | El cuadro del asistente es radio 20 px (como tarjeta), 16 px de texto, mínimo 3 líneas | Es el elemento principal de la app y Darío pidió que no sea «enanito» |
| Panel lateral 400 px | 360 px | Deja más ancho a la tarjeta de producto |
| Cuerpo 14 px | Asistente 16 px | Conversación larga; se lee mejor |
| Lienzo taupe | Área principal canvas; las tarjetas son taupe | No hay lienzo de dibujo; las tarjetas necesitan contraste con el fondo |
| ash para notas | ash nunca es texto | Accesibilidad (igual que la vuelta 1 del original) |
| — | El mejor valor de la tabla Comparar se marca con punto ok + peso 500, no con fondo verde | Prohibición de fondos de estado |

## Tests (una copia mala falla al menos uno)
1. Todo `font-weight` es 300, 400 o 500.
2. Las únicas familias son Inter, Geist Mono y la pila de sistema.
3. No hay `#fff`, `#ffffff` ni `white` de fondo.
4. No queda el naranja `#e8502a`/`#ff6a3d` ni ningún color saturado en botones, pestañas o enlaces.
5. Todo `button` tiene radio 9999 px.
6. Las tarjetas (`.card`, `.sl`, `.discard`, `.table-wrap`) tienen radio ≥ 16 px y sin sombra.
7. Inputs, selects y textareas del formulario tienen radio 4 px y borde 1 px `#8a847c`; el cuadro del asistente tiene radio 20 px y texto de 16 px.
8. Cada pestaña abre con un `h2.panel-title` en Inter 300, 32 px.
9. El fondo del body es `#fdfcfc` y las tarjetas de producto son `#f5f3f1`.
10. Ninguna `box-shadow` supera 4 px de difuminado.
11. La pestaña activa es una píldora ink rellena con texto canvas; las demás sin fondo.
12. Hay como máximo un botón relleno ink visible por pestaña (aparte de la pestaña activa).
13. Precios y puntajes usan Geist Mono.
14. En modo oscuro el canvas es `#141311`.
15. Los colores semánticos solo aparecen como puntos de 6 px.
16. A 390 px no hay scroll horizontal y el panel de filtros queda bajo el área principal.
17. El cuadro para escribir del asistente mide al menos 72 px de alto y ocupa el ancho de la conversación.
