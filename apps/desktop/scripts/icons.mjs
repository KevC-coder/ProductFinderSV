/**
 * Genera los iconos de la app a partir del isotipo (apps/web/public/favicon.svg):
 *   - apps/web/public/icons/icon-192.png, icon-512.png, icon-maskable-512.png  (PWA)
 *   - apps/desktop/assets/app.ico                                           (ejecutable)
 *
 * ⚠️ El isotipo es PROVISIONAL: al recibir el SVG oficial, reemplazar favicon.svg y volver a
 * ejecutar `npm run icons -w apps/desktop`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(import.meta.dirname, '../../..');
const svgPath = path.join(root, 'apps/web/public/favicon.svg');
const pwaDir = path.join(root, 'apps/web/public/icons');
const icoPath = path.join(root, 'apps/desktop/assets/app.ico');

const svg = fs.readFileSync(svgPath, 'utf8');

const render = (source, size) =>
  Buffer.from(new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng());

// Maskable: el sistema recorta con su propia forma, así que el símbolo va dentro de la
// "zona segura" (80 %) sobre fondo negro a sangre.
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect width="48" height="48"[^>]*\/>/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" fill="#080a09"/>
  <g transform="translate(7.2 7.2) scale(0.7)">${inner}</g>
</svg>`;

fs.mkdirSync(pwaDir, { recursive: true });
fs.writeFileSync(path.join(pwaDir, 'icon-192.png'), render(svg, 192));
fs.writeFileSync(path.join(pwaDir, 'icon-512.png'), render(svg, 512));
fs.writeFileSync(path.join(pwaDir, 'icon-maskable-512.png'), render(maskable, 512));

/** ICO con entradas PNG (soportado desde Windows Vista). */
function buildIco(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); // 0 = 256 px
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2); // colores de paleta
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4); // planos
    header.writeUInt16LE(32, e + 6); // bits por píxel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
fs.mkdirSync(path.dirname(icoPath), { recursive: true });
fs.writeFileSync(icoPath, buildIco(sizes.map((size) => ({ size, data: render(svg, size) }))));

console.log(`Iconos generados:\n  ${pwaDir}\n  ${icoPath}`);
