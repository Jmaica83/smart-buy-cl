// Propuestas de logo de Smart Buy CL, dibujadas con código.
// Cada logo es una función (fg, bg) que devuelve SVG en una grilla de 100 × 100.
// fg es la tinta del símbolo; bg es el color que recorta (la estrella, las líneas).

function star(cx, cy, r, fill, rotate = 0) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? r * 0.42 : r;
    const a = (-90 + rotate + i * 36) * Math.PI / 180;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${fill}" stroke-width="${(r * 0.1).toFixed(2)}" stroke-linejoin="round"/>`;
}

function line(x1, y1, x2, y2, color, width) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

// La etiqueta de precio con la estrella de Chile en el lugar del ojal.
function etiqueta(fg, bg) {
  const tag = "M50 12 L77 37 V82 Q77 88 71 88 H29 Q23 88 23 82 V37 Z";
  return `<g transform="rotate(14 50 50)">
    <path d="${tag}" fill="${fg}" stroke="${fg}" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="50" cy="26" r="5" fill="${bg}"/>
    ${star(50, 59, 21, bg, -14)}
  </g>`;
}

// La boleta: cada línea es un costo y la última, gruesa, es el total puesto en Chile.
function boleta(fg, bg) {
  const left = 22, right = 78, teeth = 4, base = 88, depth = 10;
  const step = (right - left) / teeth;
  let edge = "";
  for (let i = teeth - 1; i >= 0; i--) {
    edge += ` L${left + step * (i + 0.5)} ${base - depth} L${left + step * i} ${base}`;
  }
  const d = `M${left + 5} 10 H${right - 5} Q${right} 10 ${right} 15 V${base}${edge} V15 Q${left} 10 ${left + 5} 10 Z`;
  return `<path d="${d}" fill="${fg}" stroke="${fg}" stroke-width="3" stroke-linejoin="round"/>
    ${line(33, 26, 67, 26, bg, 5)}
    ${line(33, 39, 56, 39, bg, 5)}
    ${line(33, 59, 67, 59, bg, 10)}`;
}

// La S es un camino: sale de lejos y termina en un punto, tu casa.
function ruta(fg, bg) {
  return `<path d="M80 22 H37 A14 14 0 0 0 37 50 H63 A14 14 0 0 1 63 78 H36"
      fill="none" stroke="${fg}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="23" cy="78" r="12.5" fill="${bg}" stroke="${fg}" stroke-width="7"/>`;
}

// El paquete que llega con la estrella de Chile.
function paquete(fg, bg) {
  return `<rect x="10" y="15" width="80" height="22" rx="5" fill="${fg}"/>
    <rect x="44" y="15" width="12" height="22" fill="${bg}"/>
    <path d="M16 42 H84 V80 Q84 87 77 87 H23 Q16 87 16 80 Z" fill="${fg}"/>
    ${star(50, 64, 19, bg)}`;
}

const LOGOS = [
  { id: "etiqueta", nombre: "Etiqueta estrella", idea: "Precio, reseñas y Chile en una sola forma.", draw: etiqueta },
  { id: "boleta", nombre: "Boleta", idea: "Lo que de verdad pagas: la última línea es el total.", draw: boleta },
  { id: "ruta", nombre: "Ruta S", idea: "La S es el camino del envío y termina en tu casa.", draw: ruta },
  { id: "paquete", nombre: "Paquete estrella", idea: "La compra puesta en Chile.", draw: paquete },
];

// Símbolo suelto, sin fondo.
function logoSvg(logo, size, fg, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${logo.nombre}">${logo.draw(fg, bg)}</svg>`;
}

// Ícono de app: el símbolo dentro de un cuadrado de esquinas redondas.
function iconSvg(logo, size, tile, glyph, scale = 0.68) {
  const offset = 50 * (1 - scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${logo.nombre}">
    <rect width="100" height="100" rx="22" fill="${tile}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${logo.draw(glyph, tile)}</g>
  </svg>`;
}

if (typeof module !== "undefined") module.exports = { LOGOS, logoSvg, iconSvg };
