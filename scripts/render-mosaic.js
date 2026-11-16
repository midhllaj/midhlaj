#!/usr/bin/env node
/**
 * Renders the face mosaic to static images (no browser needed):
 *   public/assets/mosaic.webp  — reduced-motion / no-WebGL fallback
 *   public/og.jpg              — Open Graph share image (1200×630)
 * Runs automatically after `npm run shots` and `npm run assets`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './lib/paths.js';
import { shapeBrightness } from './lib/mosaic.js';
import { extendShoulders } from '../src/scene/shoulders.js';

const COLS = 70, ROWS = 90, CELL = 12, GAP = 1;

async function main() {
  const atlasJson = JSON.parse(await fs.readFile(path.join(ROOT, 'public/atlas/atlas.json'), 'utf8'));
  const atlas = await sharp(path.join(ROOT, 'public/atlas/atlas.webp')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const map = await sharp(path.join(ROOT, 'public/assets/portrait-map.png'))
    .ensureAlpha()
    .resize(COLS, ROWS, { fit: 'fill', kernel: 'cubic' })
    .raw()
    .toBuffer();

  // sample the face, then widen it so the shoulders slope outwards (same as the live hero)
  const faceCells = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const mi = i * 4;
    faceCells.push({ b: shapeBrightness((0.2126 * map[mi] + 0.7152 * map[mi + 1] + 0.0722 * map[mi + 2]) / 255), a: map[mi + 3] / 255 });
  }
  const { cells, cols: GC } = extendShoulders(faceCells, COLS, ROWS);

  const W = GC * CELL, H = ROWS * CELL;
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < out.length; i += 3) { out[i] = 10; out[i + 1] = 10; out[i + 2] = 11; }
  const AW = atlas.info.width;
  const tiles = atlasJson.tiles;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < GC; c++) {
      const { a, b } = cells[r * GC + c];
      const pick = rnd(), ox = rnd(), oy = rnd();
      if (a < 0.45) continue;
      const t = tiles[Math.floor(pick * tiles.length)];
      const side = Math.min(t.w, t.h) * 0.55; // a square crop out of the screenshot
      const sx = t.x + ox * (t.w - side), sy = t.y + oy * (t.h - side);
      // halftone like the live hero: bright cells → big, bright, real-colour tiles; shadows → tiny
      const sm = Math.min(1, Math.max(0, b / 0.6));
      const size = Math.max(2, Math.round((CELL - GAP) * (0.24 + 0.68 * sm * sm * (3 - 2 * sm))));
      const off = Math.floor((CELL - size) / 2);
      const gain = 0.38 + 1.25 * b;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const ax = Math.floor(sx + (x / size) * side), ay = Math.floor(sy + (y / size) * side);
          const ai = (ay * AW + ax) * 3;
          const oi = ((r * CELL + off + y) * W + c * CELL + off + x) * 3;
          for (let k = 0; k < 3; k++) out[oi + k] = Math.min(255, atlas.data[ai + k] * gain + 25 * b);
        }
    }

  const mosaic = sharp(out, { raw: { width: W, height: H, channels: 3 } });
  await mosaic.clone().webp({ quality: 80 }).toFile(path.join(ROOT, 'public/assets/mosaic.webp'));

  // ── OG image ──
  const sig = await fs.readFile(path.join(ROOT, 'public/assets/signature.svg'), 'utf8');
  const vb = sig.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  let inner = sig.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  // with a pen-ink layer, the share image shows the ink alone
  if (inner.includes('class="sig-fill"')) inner = inner.replace(/<g class="sig-strokes"[\s\S]*?<\/g>/, '');
  const sigW = 300, sigS = sigW / vb[2];
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#0a0a0b"/>
    <g transform="translate(80 92) scale(${sigS})" fill="none">${inner}</g>
    <text x="80" y="${150 + vb[3] * sigS}" fill="#8a8a8a" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="18" letter-spacing="3">DESIGNER &amp; DEVELOPER</text>
    <text x="78" y="${226 + vb[3] * sigS}" fill="#f2f2f0" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="600" font-size="54" letter-spacing="-1.5">Websites &amp; apps for</text>
    <text x="78" y="${288 + vb[3] * sigS}" fill="#f2f2f0" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="600" font-size="54" letter-spacing="-1.5">businesses everywhere.</text>
    <line x1="80" x2="640" y1="560" y2="560" stroke="#2a2a2b"/>
    <text x="80" y="592" fill="#8a8a8a" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="16" letter-spacing="2">SCROLL TO EXPLORE THE WORK</text>
  </svg>`;
  // OG: the right half shows the centre of the (wider) mosaic
  const mosaicH = 630, mosaicW = Math.round((W / H) * mosaicH), boxW = 580;
  const ogMosaic = await mosaic.clone().resize(mosaicW, mosaicH)
    .extract({ left: Math.max(0, Math.round((mosaicW - boxW) / 2)), top: 0, width: Math.min(boxW, mosaicW), height: mosaicH })
    .png().toBuffer();
  await sharp(Buffer.from(text))
    .composite([{ input: ogMosaic, left: 1200 - Math.min(boxW, mosaicW), top: 0 }])
    .jpeg({ quality: 86 })
    .toFile(path.join(ROOT, 'public/og.jpg'));
  console.log(`mosaic: public/assets/mosaic.webp (${W}×${H}) + public/og.jpg`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
