#!/usr/bin/env node
/**
 * Packs every thumbnail in public/thumbs/<id>/ into ONE texture atlas:
 *   public/atlas/atlas.webp  +  public/atlas/atlas.json
 * Order and project grouping follow src/data/projects.json, so the 3D scene builds itself from it.
 * Uses a simple shelf packer; tile height shrinks until everything fits in 2048² (then 4096²).
 *
 * Also packs the full-page strips from raw/strips/<id>/ into public/atlas/scroll.webp + scroll.json,
 * which the fly-through uses to make each tile scroll like a real page.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, readProjects, exists } from './lib/paths.js';

const OUT_DIR = path.join(ROOT, 'public/atlas');
const PAD = 2;

async function collect() {
  const projects = await readProjects();
  const items = [];
  for (const p of projects) {
    const dir = path.join(ROOT, 'public/thumbs', p.id);
    if (!(await exists(dir))) continue;
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.webp')).sort((a, b) => {
      // desktop first, then numeric order
      const ka = (a.startsWith('desktop') ? 0 : 1000) + parseInt(a.match(/\d+/)?.[0] || 0, 10);
      const kb = (b.startsWith('desktop') ? 0 : 1000) + parseInt(b.match(/\d+/)?.[0] || 0, 10);
      return ka - kb;
    });
    for (const f of files) {
      const file = path.join(dir, f);
      const meta = await sharp(file).metadata();
      items.push({ project: p.id, file: f, kind: f.startsWith('mobile') ? 'mobile' : 'desktop', src: file, aspect: meta.width / meta.height });
    }
  }
  return items;
}

function pack(items, size, h) {
  let x = 0, y = 0;
  const out = [];
  for (const it of items) {
    const w = Math.round(h * it.aspect);
    if (x + w + PAD > size) { x = 0; y += h + PAD; }
    if (y + h > size) return null;
    out.push({ ...it, x, y, w, h });
    x += w + PAD;
  }
  return { rects: out, used: y + h };
}

async function placeholderItems() {
  // No screenshots yet — synthesise a few neutral "website" tiles so the scene still renders.
  const dir = path.join(OUT_DIR, '_placeholder');
  await fs.mkdir(dir, { recursive: true });
  const items = [];
  for (let i = 0; i < 12; i++) {
    const g = 40 + i * 9;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250">
      <rect width="400" height="250" fill="rgb(${g},${g},${g})"/>
      <rect x="24" y="22" width="80" height="10" fill="#bbb"/><rect x="300" y="22" width="76" height="10" fill="#777"/>
      <rect x="24" y="90" width="${180 + (i % 4) * 30}" height="26" fill="#eee"/><rect x="24" y="130" width="140" height="12" fill="#999"/>
      <rect x="230" y="70" width="146" height="150" fill="rgb(${g + 50},${g + 50},${g + 50})"/></svg>`;
    const f = path.join(dir, `p${i}.webp`);
    await sharp(Buffer.from(svg)).webp().toFile(f);
    items.push({ project: '_placeholder', file: `p${i}.webp`, kind: 'desktop', src: f, aspect: 1.6 });
  }
  return items;
}

async function main() {
  let items = await collect();
  if (!items.length) {
    console.warn('atlas: no thumbnails found — run `npm run shots`. Writing a placeholder atlas.');
    items = await placeholderItems();
  }
  let result, size;
  outer: for (size of [2048, 4096]) {
    for (let h = 256; h >= 48; h -= 16) {
      result = pack(items, size, h);
      if (result) break outer;
    }
  }
  if (!result) throw new Error('Too many thumbnails for a 4096 atlas — split into multiple atlases.');
  const height = 2 ** Math.ceil(Math.log2(result.used)); // power-of-two height for mipmaps
  const composites = await Promise.all(
    result.rects.map(async (r) => ({
      input: await sharp(r.src).resize(r.w, r.h, { fit: 'cover' }).toBuffer(),
      left: r.x,
      top: r.y,
    })),
  );
  await fs.mkdir(OUT_DIR, { recursive: true });
  await sharp({ create: { width: size, height, channels: 3, background: '#0a0a0b' } })
    .composite(composites)
    .webp({ quality: 82 })
    .toFile(path.join(OUT_DIR, 'atlas.webp'));
  const json = {
    width: size,
    height,
    version: Date.now(),
    tiles: result.rects.map(({ project, file, kind, x, y, w, h }) => ({ project, file, kind, x, y, w, h })),
  };
  await fs.writeFile(path.join(OUT_DIR, 'atlas.json'), JSON.stringify(json));
  console.log(`atlas: ${json.tiles.length} tiles → ${size}×${height} (tile height ${result.rects[0].h}px)`);
  await buildScrollAtlas();
}

// ── scrolling strips ──
const STRIP_W = { desktop: 400, mobile: 160 };
const VIEW = { desktop: 900 / 1440, mobile: 844 / 390 }; // viewport height / width
const SW = 2048, SH = 4096;

function packColumns(strips, cap) {
  const cols = [];
  let nextX = 0;
  const out = [];
  for (const st of strips) {
    const w = STRIP_W[st.kind];
    const vh = Math.round(w * VIEW[st.kind]);
    const h = Math.min(Math.floor(w / st.aspect), Math.round(vh * cap[st.kind]));
    let col = cols.find((c) => c.w === w && c.used + h <= SH);
    if (!col) {
      if (nextX + w > SW) return null;
      col = { x: nextX, w, used: 0 };
      cols.push(col);
      nextX += w + PAD;
    }
    out.push({ ...st, x: col.x, y: col.used, w, h, vh });
    col.used += h + PAD;
  }
  return out;
}

async function buildScrollAtlas() {
  const projects = await readProjects();
  const strips = [];
  for (const p of projects) {
    for (const kind of ['desktop', 'mobile']) {
      const src = path.join(ROOT, 'raw/strips', p.id, `${kind}.webp`);
      if (!(await exists(src))) continue;
      const m = await sharp(src).metadata();
      strips.push({ project: p.id, kind, src, aspect: m.width / m.height });
    }
  }
  const jsonPath = path.join(OUT_DIR, 'scroll.json');
  if (!strips.length) {
    await fs.rm(jsonPath, { force: true });
    console.log('scroll atlas: no strips yet (run `npm run shots`)');
    return;
  }
  // fewer screens per strip until everything fits in 2048×4096
  let rects;
  for (let f = 1; f > 0.2 && !rects; f *= 0.88) rects = packColumns(strips, { desktop: 8 * f, mobile: 5.8 * f });
  if (!rects) throw new Error('scroll atlas: too many strips for 2048×4096');
  const composites = await Promise.all(
    rects.map(async (r) => ({
      // keep the top of the page, crop the rest
      input: await sharp(r.src).resize({ width: r.w }).extract({ left: 0, top: 0, width: r.w, height: r.h }).toBuffer(),
      left: r.x,
      top: r.y,
    })),
  );
  await sharp({ create: { width: SW, height: SH, channels: 3, background: '#0a0a0b' } })
    .composite(composites)
    .webp({ quality: 76 })
    .toFile(path.join(OUT_DIR, 'scroll.webp'));
  const json = {
    width: SW,
    height: SH,
    version: Date.now(),
    strips: rects.map(({ project, kind, x, y, w, h, vh }) => ({ project, kind, x, y, w, h, vh })),
  };
  await fs.writeFile(jsonPath, JSON.stringify(json));
  console.log(`scroll atlas: ${rects.length} strips → ${SW}×${SH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
