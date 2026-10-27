# Brief — Smart Buy CL (rediseño de la app)

Fecha de inicio: 2026-10-26. Las decisiones van fechadas y atribuidas: «(Darío, AAAA-MM-DD)».

- **Qué es:** comparador personal de productos de AliExpress para comprar desde Chile: un asistente conversa y arma la búsqueda; la app rankea por costo real puesto en Chile, tienda y reseñas.
- **Formato:** app web local (`static/index.html`, servida por `server.py` en localhost). Escritorio 1280–1440 px; también debe usarse a 390 px.
- **Para quién:** Darío, en su PC, cuando quiere comprar algo sin marearse con la tienda de AliExpress.
- **Qué tiene que lograr:** que en menos de 2 minutos pase de «quiero X» a un producto elegido con confianza, sabiendo cuánto cuesta puesto en Chile y por qué ese y no otro.
- **Tono:** calmo, preciso, confiable. NO es una tienda: nada de urgencia, ofertas gritadas ni colores de promoción. Español de Chile, tú, sin voseo, sin slop de IA.
- **Estilo:** DNA en `dna-smartbuy.md`, adaptado de `design/estilos/elevenlabs-calido/` (Darío, 2026-10-26).
- **Zonas:** no aplica.
- **Fuentes de verdad del contenido:** la API de AliExpress (Drop Shipping, solo lectura) y el endpoint de reseñas, vía `server.py`. Los datos de prueba (`data/mock_products.json`) se rotulan «Datos de prueba» en la barra.
- **Dónde lo revisa Darío:** capturas en el chat (PNG con SendUserFile) después de la vuelta 1 y al cierre.
- **Presupuesto del loop:** 3 vueltas, modo rápido (herramienta interna).

## Decisiones

| Fecha | Decisión | Quién |
|---|---|---|
| 2026-10-26 | Estilo elevenlabs-calido del catálogo | Darío |
| 2026-10-26 | Aplicar DNA + design-loop (no Claude Design) | Darío |
| 2026-10-26 | Dos líneas en paralelo: revisión funcional por agentes y rediseño visual | Darío |
| 2026-10-26 | El cuadro para escribir del asistente debe ser grande (era «enanito») | Darío |
| 2026-10-26 | Modo herramienta interna: DNA del catálogo como vara, loop rápido | Claude |
| 2026-10-26 | Aprobado el estado vacío del asistente en bloque taupe con titular de 48 px | Darío |
| 2026-10-26 | El DNA entra al catálogo como `herramienta-calida`, estilo base de herramientas | Darío |

## Pendientes del dueño

- Nombre y logo definitivos (hoy «Smart Buy CL» con el logo SB naranjo del acceso directo).
