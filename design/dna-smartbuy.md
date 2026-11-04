# DNA — Smart Buy CL (adaptado de «propuesta institucional»)

Versión 2 (2026-11-04). Copia adaptada de `design/estilos/suizo-institucional/dna-institucional.md` (biblioteca). Es la vara de los críticos de `design-loop`. La versión 1, cálida, sigue en el catálogo como `herramienta-calida`.

## Resumen en una frase
Un informe de compra claro y preciso: blanco, IBM Plex, líneas de 1 px, esquinas casi rectas y el color vivo solo en las fotos de los productos.

## Tokens

### Color (claro)
| Rol | Valor | Uso |
|---|---|---|
| canvas | `#ffffff` | fondo de la app |
| taupe | `#f3f4f6` | bandas: estado vacío del asistente, mensajes del asistente |
| stone | `#d9dce1` | líneas de 1 px, pista de la barra de puntaje |
| ink | `#15171b` | texto principal, botón principal, línea de 2 px |
| graphite | `#4b5059` | texto secundario y rótulos |
| smoke | `#666b74` | texto de ayuda, borde de campo |
| ash | `#9aa0a8` | solo decorativo, nunca texto |
| acento | `#bd450b` | número del primer lugar y punto de problema; < 1 % |
| ok / aviso / error | `#15171b` / `#9aa0a8` / `#bd450b` | SOLO como punto de 6 px |

### Color (oscuro)
canvas `#0b0c0f` · taupe `#15171b` · stone `#2a2d33` · ink `#f3f4f6` · graphite `#c6cad1` · smoke `#9aa0a8` · ash `#666b74` · borde de campo `#7c828b` · acento `#ee6018`.

### Tipografía
| Rol | Familia | Peso | Tamaño / interlínea |
|---|---|---|---|
| display del asistente vacío | IBM Plex Sans | 600 | 48 px / 1.08 |
| título de pestaña (`h2.panel-title`) | IBM Plex Sans | 600 | 28 px / 1.15 |
| título de producto | IBM Plex Sans | 600 | 15 px / 1.4 |
| cuerpo | IBM Plex Sans | 400 | 14 px / 1.5 |
| asistente y cuadro para escribir | IBM Plex Sans | 400 | 16 px / 1.55 |
| rótulo de campo | IBM Plex Mono | 400 | 12 px, mayúsculas, tracking 1,2 px |
| precio total | IBM Plex Mono | 500 | 24 px / 1.17 |
| técnico (precios, puntajes, días, variantes) | IBM Plex Mono | 400 | 12–13 px |

### Espaciado y forma
Unidad 4 px. Barra superior 56 px. Panel lateral 360 px. Radio de 2 px en botones, campos, fotos, bandas y mensajes; nunca más de 4 px. Sin sombras: lo que flota lleva borde de 1 px. Los puntos de 6 px siguen siendo círculos.

### Movimiento
120–180 ms, `ease-out`, solo en controles y en el indicador «pensando». Con `prefers-reduced-motion` no hay animaciones.

### Voz
Calma y precisa. Títulos de 1 a 3 palabras en caja normal. Solo los rótulos mono van en mayúsculas.

## Firmas
1. **Filas, no tarjetas**: los productos son filas separadas por líneas de 1 px; el primero abre con una línea ink de 2 px.
2. **Pestañas con línea**: la activa lleva línea ink de 2 px y peso 600. Sin rellenos.
3. **Rótulos mono** en los campos del panel.
4. **Tabla de líneas finas**: sin cebra ni fondo, encabezado sobre línea ink de 2 px.
5. **Un solo acento**: número del primer lugar y puntos de problema.
6. **Color solo en el producto**: el único color vivo son las fotos de AliExpress.

## Prohibiciones
- Ningún radio mayor a 4 px, salvo los puntos de 6 px.
- Ninguna sombra ni degradado.
- Ningún color saturado distinto del acento, salvo las fotos.
- Ningún título en mayúsculas.
- Ninguna familia distinta de IBM Plex Sans, IBM Plex Mono y la pila de sistema.
- Sin emojis.

## Adaptación al proyecto (desde suizo-institucional)
| Original | Aquí | Por qué |
|---|---|---|
| Documento de lectura | App en dos columnas | Se mantiene el layout del taller, ya probado |
| Sin modo oscuro fuera de `.oscuro` | Modo oscuro completo, con los tokens de las láminas | La app sigue el modo del sistema |
| Títulos de sección 3 + 9 columnas con número | Sin número de sección | Una app no tiene secciones numeradas |
| Sin ok ni aviso | Puntos en gris y tinta; solo el problema usa acento | Color solo para lo anormal |
| Título 28 px | Display de 48 px en el asistente vacío | Darío aprobó ese bloque el 2026-10-26 |
| Banda solo para el resumen | Banda también en el asistente vacío | Mismo bloque aprobado |

## Tests
Están en `design/tests.yaml`.
