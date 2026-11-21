#!/usr/bin/env node
/**
 * Genera todos los derivados de marca a partir de LOGO.png (raíz del proyecto).
 *
 * Requisito: LOGO.png debe existir. El script no inventa un logo.
 *
 * Salidas:
 *  public/brand/logo-mark.png      Monograma con fondo transparente (para UI y OG)
 *  public/brand/logo-mark.webp     Igual, formato moderno
 *  public/brand/logo-tile.png      Monograma sobre lienzo cuadrado oscuro
 *  public/favicon.ico              ICO multi-tamaño (16, 32, 48)
 *  public/favicon.svg              SVG con el monograma embebido
 *  public/favicon-16x16.png
 *  public/favicon-32x32.png
 *  public/apple-touch-icon.png     180x180
 *  public/android-chrome-192x192.png
 *  public/android-chrome-512x512.png
 *  public/og-image.png             1200x630 para Open Graph y Twitter
 *
 * Uso: node scripts/generate-brand-assets.mjs
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'LOGO.png');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BRAND_DIR = path.join(PUBLIC_DIR, 'brand');

const BG = { r: 23, g: 33, b: 31 }; // #17211F
const GOLD = { r: 212, g: 175, b: 55 }; // #D4AF37

async function ensureSource() {
  try {
    await access(SOURCE);
  } catch {
    console.error('\n✖ No se encontró LOGO.png en la raíz del proyecto.');
    console.error('  Coloca el logo oficial (PNG cuadrado) y vuelve a ejecutar:\n');
    console.error('  node scripts/generate-brand-assets.mjs\n');
    process.exit(1);
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Extrae el monograma del fondo oscuro y devuelve un PNG transparente + su bbox. */
async function extractTransparentMark() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const output = Buffer.alloc(width * height * 4);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const distance = Math.hypot(r - BG.r, g - BG.g, b - BG.b);
      const alpha = clamp((distance - 26) / 140, 0, 1);
      const target = (y * width + x) * 4;

      output[target] = GOLD.r;
      output[target + 1] = GOLD.g;
      output[target + 2] = GOLD.b;
      output[target + 3] = Math.round(alpha * 255);

      if (alpha > 0.04) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) throw new Error('No se detectó el monograma sobre el fondo de LOGO.png');

  const padding = Math.round(Math.min(maxX - minX, maxY - minY) * 0.04);
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(height - 1, maxY + padding);

  const cropped = sharp(output, { raw: { width, height, channels: 4 } }).extract({
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  });

  const buffer = await cropped.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  return { buffer: buffer.data, width: buffer.info.width, height: buffer.info.height };
}

/** Lienzo cuadrado oscuro con el monograma centrado. */
async function makeSquareIcon(mark, size, { fillWidth = 0.8 } = {}) {
  const targetWidth = Math.round(size * fillWidth);
  const resizedHeight = Math.max(1, Math.round((mark.height / mark.width) * targetWidth));

  const glyph = await sharp(mark.buffer)
    .resize({ width: targetWidth, height: resizedHeight, fit: 'inside' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...BG, alpha: 1 },
    },
  })
    .composite([
      {
        input: glyph,
        left: Math.round((size - targetWidth) / 2),
        top: Math.round((size - resizedHeight) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO con payloads PNG (soportado por navegadores y Windows). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + directory.length;

  entries.forEach((entry, index) => {
    const base = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1);
    directory.writeUInt8(0, base + 2);
    directory.writeUInt8(0, base + 3);
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(entry.buffer.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.buffer.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.buffer)]);
}

function ogSvg(markDataUri, markWidth, markHeight) {
  const markHeightOnCanvas = Math.round((markHeight / markWidth) * 400);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="18%" cy="0%" r="90%">
      <stop offset="0%" stop-color="#D4AF37" stop-opacity="0.22"/>
      <stop offset="55%" stop-color="#D4AF37" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#17211F" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F0F4F2" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#F0F4F2" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#17211F"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="24" y="24" width="1152" height="582" rx="26" fill="none" stroke="url(#fade)" stroke-width="2"/>
  <image href="${markDataUri}" x="80" y="${Math.round((630 - markHeightOnCanvas) / 2)}" width="400" height="${markHeightOnCanvas}" />
  <line x1="520" y1="214" x2="560" y2="214" stroke="#D4AF37" stroke-width="4" stroke-linecap="round"/>
  <text x="520" y="322" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="92" font-weight="700" letter-spacing="-3" fill="#F0F4F2">credibas<tspan fill="#D4AF37">.</tspan></text>
  <text x="522" y="382" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="32" fill="#F0F4F2" fill-opacity="0.78">Controla tus créditos. Domina tus finanzas.</text>
  <text x="522" y="452" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="22" letter-spacing="4" fill="#D4AF37">GESTIÓN DE CRÉDITOS Y CARTERA</text>
  <text x="522" y="552" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="24" fill="#F0F4F2" fill-opacity="0.55">credibas.app</text>
</svg>`;
}

async function main() {
  await ensureSource();
  await mkdir(BRAND_DIR, { recursive: true });

  console.log('→ Extrayendo monograma de LOGO.png…');
  const mark = await extractTransparentMark();
  console.log(`  monograma ${mark.width}×${mark.height}`);

  const logoMark = await sharp(mark.buffer)
    .resize({ width: 1200, withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(path.join(BRAND_DIR, 'logo-mark.png'), logoMark);
  await writeFile(
    path.join(BRAND_DIR, 'logo-mark.webp'),
    await sharp(mark.buffer).resize({ width: 1200 }).webp({ quality: 92, alphaQuality: 100 }).toBuffer(),
  );

  const tile512 = await makeSquareIcon(mark, 512);
  const tileMaskable = await makeSquareIcon(mark, 512, { fillWidth: 0.6 });
  const tile192 = await makeSquareIcon(mark, 192);
  const tile180 = await makeSquareIcon(mark, 180, { fillWidth: 0.78 });
  const tile64 = await makeSquareIcon(mark, 64);
  const tile48 = await makeSquareIcon(mark, 48, { fillWidth: 0.86 });
  const tile32 = await makeSquareIcon(mark, 32, { fillWidth: 0.88 });
  const tile16 = await makeSquareIcon(mark, 16, { fillWidth: 0.9 });

  await writeFile(path.join(BRAND_DIR, 'logo-tile.png'), tile512);
  await writeFile(path.join(PUBLIC_DIR, 'android-chrome-512x512.png'), tile512);
  await writeFile(path.join(PUBLIC_DIR, 'android-chrome-maskable-512x512.png'), tileMaskable);
  await writeFile(path.join(PUBLIC_DIR, 'android-chrome-192x192.png'), tile192);
  await writeFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), tile180);
  await writeFile(path.join(PUBLIC_DIR, 'favicon-16x16.png'), tile16);
  await writeFile(path.join(PUBLIC_DIR, 'favicon-32x32.png'), tile32);
  await writeFile(
    path.join(PUBLIC_DIR, 'favicon.ico'),
    buildIco([
      { size: 16, buffer: tile16 },
      { size: 32, buffer: tile32 },
      { size: 48, buffer: tile48 },
    ]),
  );

  const embedded = `data:image/png;base64,${tile64.toString('base64')}`;
  await writeFile(
    path.join(PUBLIC_DIR, 'favicon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Credibas">
  <rect width="64" height="64" fill="#17211F"/>
  <image href="${embedded}" width="64" height="64"/>
</svg>
`,
  );

  console.log('→ Generando imagen Open Graph 1200×630…');
  const ogMark = await sharp(mark.buffer)
    .resize({ width: 800 })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const ogDataUri = `data:image/png;base64,${ogMark.data.toString('base64')}`;
  const ogBuffer = await sharp(Buffer.from(ogSvg(ogDataUri, ogMark.info.width, ogMark.info.height)))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await writeFile(path.join(PUBLIC_DIR, 'og-image.png'), ogBuffer);

  console.log('\n✔ Activos generados:');
  console.log('  public/favicon.ico · favicon.svg · favicon-16x16.png · favicon-32x32.png');
  console.log('  public/apple-touch-icon.png · android-chrome-192x192.png · android-chrome-512x512.png');
  console.log('  public/og-image.png · brand/logo-mark.png · brand/logo-mark.webp · brand/logo-tile.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
