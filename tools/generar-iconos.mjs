// Genera los íconos por defecto del manifest (icons/icon-{16,32,48,128}.png).
// Solo usa módulos de Node (zlib, fs): no hace falta npm install.
// Uso: node tools/generar-iconos.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const TAMANIOS = [16, 32, 48, 128];
const AZUL = [37, 99, 235];
const BLANCO = [255, 255, 255];
const DIR_ICONOS = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");

// Cobertura (0-1) de un píxel por un disco, con 4x4 muestras para suavizar el borde
function cobertura(x, y, cx, cy, radio) {
  let dentro = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const dx = x + (i + 0.5) / 4 - cx;
      const dy = y + (j + 0.5) / 4 - cy;
      if (dx * dx + dy * dy <= radio * radio) dentro++;
    }
  }
  return dentro / 16;
}

// Círculo azul con un anillo blanco (una lupa estilizada)
function dibujar(tam) {
  const rgba = Buffer.alloc(tam * tam * 4);
  const c = tam / 2;
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const fondo = cobertura(x, y, c, c, tam * 0.48);
      const anillo = cobertura(x, y, c, c, tam * 0.3) - cobertura(x, y, c, c, tam * 0.18);
      const color = AZUL.map((v, k) => Math.round(v + (BLANCO[k] - v) * anillo));
      rgba.set([...color, Math.round(fondo * 255)], (y * tam + x) * 4);
    }
  }
  return rgba;
}

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const tipoYDatos = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tipoYDatos));
  return Buffer.concat([largo, tipoYDatos, crc]);
}

function png(tam, rgba) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(tam, 0);
  cabecera.writeUInt32BE(tam, 4);
  cabecera.set([8, 6, 0, 0, 0], 8); // 8 bits por canal, RGBA
  // Cada fila empieza con el byte de filtro 0 (sin filtro)
  const filas = Buffer.alloc(tam * (tam * 4 + 1));
  for (let y = 0; y < tam; y++) {
    rgba.copy(filas, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque("IHDR", cabecera),
    bloque("IDAT", deflateSync(filas)),
    bloque("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(DIR_ICONOS, { recursive: true });
for (const tam of TAMANIOS) {
  const ruta = join(DIR_ICONOS, `icon-${tam}.png`);
  writeFileSync(ruta, png(tam, dibujar(tam)));
  console.log(`Generado ${ruta}`);
}
