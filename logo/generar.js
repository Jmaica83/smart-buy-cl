// Genera los archivos del logo definitivo (Paquete estrella) desde propuestas/logos.js.
// Uso: node logo/generar.js   (necesita Microsoft Edge para rasterizar)

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { LOGOS, iconSvg } = require("./propuestas/logos.js");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const TILE = "#000000";
const GLYPH = "#fdfcfc";
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const logo = LOGOS.find(l => l.id === "paquete");

// A tamaño chico el símbolo ocupa más del cuadrado para que se siga leyendo.
const svgFor = size => iconSvg(logo, size, TILE, GLYPH, size <= 32 ? 0.82 : 0.68);

function rasterize(jobs) {
  const page = `<!doctype html><body><pre id="out"></pre><script>
    const jobs = ${JSON.stringify(jobs)};
    (async () => {
      const out = {};
      for (const job of jobs) {
        const img = new Image();
        img.src = "data:image/svg+xml;base64," + btoa(job.svg);
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = job.size;
        const ctx = canvas.getContext("2d");
        if (job.type === "image/jpeg") { ctx.fillStyle = "${GLYPH}"; ctx.fillRect(0, 0, job.size, job.size); }
        ctx.drawImage(img, 0, 0, job.size, job.size);
        out[job.name] = canvas.toDataURL(job.type, 0.95).split(",")[1];
      }
      document.getElementById("out").textContent = JSON.stringify(out);
    })();
  </script>`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logo-"));
  const file = path.join(dir, "render.html");
  fs.writeFileSync(file, page);
  const dom = execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--virtual-time-budget=5000", "--dump-dom", `file:///${file.replace(/\\/g, "/")}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  fs.rmSync(dir, { recursive: true, force: true });
  const json = dom.match(/<pre id="out">(.*?)<\/pre>/s)[1];
  const images = JSON.parse(json);
  return Object.fromEntries(Object.entries(images).map(([name, b64]) => [name, Buffer.from(b64, "base64")]));
}

// ICO con cada tamaño guardado como PNG.
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dir = entries.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size % 256, 0);
    e.writeUInt8(size % 256, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...entries.map(e => e.png)]);
}

const jobs = [
  ...ICO_SIZES.map(size => ({ name: `ico-${size}`, size, type: "image/png", svg: svgFor(size) })),
  { name: "logo-120.png", size: 120, type: "image/png", svg: svgFor(120) },
  { name: "logo-512.png", size: 512, type: "image/png", svg: svgFor(512) },
  { name: "logo-120.jpg", size: 120, type: "image/jpeg", svg: svgFor(120) },
  { name: "logo-512.jpg", size: 512, type: "image/jpeg", svg: svgFor(512) },
];
const images = rasterize(jobs);

for (const name of ["logo-120.png", "logo-512.png", "logo-120.jpg", "logo-512.jpg"]) {
  fs.writeFileSync(path.join(__dirname, name), images[name]);
}
fs.writeFileSync(path.join(__dirname, "logo.ico"), buildIco(ICO_SIZES.map(size => ({ size, png: images[`ico-${size}`] }))));
fs.writeFileSync(path.join(__dirname, "..", "static", "icon.svg"), svgFor(64));
console.log("Listo: logo.ico, logo-120/512 (.png y .jpg) y static/icon.svg");
