#!/usr/bin/env node
/**
 * npm run assets
 *
 * Signature:  raw/signature.strokes.json (centre-line trace, preferred) or
 *             raw/signature.(jpg|png|webp)  →  public/assets/signature.svg  (+ favicon.svg, apple-touch-icon.png)
 *   paper removed (Otsu threshold) → only pencil strokes → potrace → white on transparent SVG.
 *   The SVG keeps two layers: <g class="sig-strokes"> (outline paths, animated with stroke-dashoffset)
 *   and <path class="sig-fill"> (the solid ink, faded in after the draw).
 *
 * Portrait:   raw/portrait.(jpg|png|webp)  →  public/assets/portrait.webp   (B&W cut-out; the About photo is public/assets/about.webp)
 *                                          →  public/assets/portrait-map.png (140×180 brightness+alpha map for the mosaic)
 *   Background removal, in order of preference:
 *     1. raw/portrait-cutout.png (your own cut-out with transparency, e.g. from remove.bg / Photoshop)
 *     2. @imgly/background-removal-node   (npm i -D @imgly/background-removal-node)
 *     3. `rembg` CLI                      (pip install "rembg[cpu,cli]")
 *   Crop: automatic head+shoulders from the subject mask, or override with raw/portrait.crop.json
 *         { "left": 0, "top": 0, "width": 800, "height": 1030 }  (pixels of the source photo)
 *
 * Without raw files, placeholders are generated so the site still runs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import potrace from 'potrace';
import { ROOT, exists } from './lib/paths.js';

const RAW = path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'public/assets');
const MAP_W = 140, MAP_H = 180; // 7:9, matches the mosaic grid aspect

async function findRaw(base) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG']) {
    const f = path.join(RAW, `${base}.${ext}`);
    if (await exists(f)) return f;
  }
  return null;
}

/* ───────────────────────────── signature ───────────────────────────── */

function otsu(data) {
  const hist = new Array(256).fill(0);
  for (const v of data) hist[v]++;
  const total = data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

function splitSubpaths(d) {
  return d.match(/M[^M]+/g)?.map((s) => s.trim()) ?? [];
}

function subpathMinX(d) {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [0];
  let min = Infinity;
  for (let i = 0; i < nums.length; i += 2) min = Math.min(min, nums[i]);
  return min;
}

async function processSignature(src) {
  console.log(`signature: tracing ${path.relative(ROOT, src)}`);
  // 1. normalise paper: grayscale, flatten lighting with a big blur divide, stretch contrast
  const base = sharp(src).rotate().grayscale();
  const meta = await base.metadata();
  const scale = Math.min(1, 2000 / Math.max(meta.width, meta.height));
  const W = Math.round(meta.width * scale), H = Math.round(meta.height * scale);
  const gray = await base.clone().resize(W, H).raw().toBuffer();
  const bg = await sharp(gray, { raw: { width: W, height: H, channels: 1 } }).blur(40).raw().toBuffer();
  const flat = Buffer.alloc(gray.length);
  for (let i = 0; i < gray.length; i++) flat[i] = Math.min(255, Math.round((gray[i] / Math.max(1, bg[i])) * 235));
  const thr = Math.min(otsu(flat), 200);
  const bin = Buffer.alloc(flat.length);
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const ink = flat[i] < thr;
      bin[i] = ink ? 0 : 255;
      if (ink) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  const m = 12;
  const crop = { left: Math.max(0, minX - m), top: Math.max(0, minY - m) };
  crop.width = Math.min(W - crop.left, maxX - minX + 2 * m);
  crop.height = Math.min(H - crop.top, maxY - minY + 2 * m);
  const png = await sharp(bin, { raw: { width: W, height: H, channels: 1 } })
    .extract(crop)
    .resize({ width: Math.min(1600, crop.width * 2) })
    .median(3)
    .png()
    .toBuffer();
  const pm = await sharp(png).metadata();

  // 2. potrace → outline paths
  const svg = await new Promise((res, rej) =>
    potrace.trace(png, { threshold: 128, turdSize: 20, optTolerance: 0.35, color: '#fff', background: 'transparent' }, (e, s) => (e ? rej(e) : res(s))),
  );
  const d = svg.match(/ d="([^"]+)"/)?.[1];
  if (!d) throw new Error('potrace returned no path — check the signature photo');
  const subs = splitSubpaths(d).sort((a, b) => subpathMinX(a) - subpathMinX(b));
  const sw = Math.max(1.2, pm.width / 500).toFixed(2);
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pm.width} ${pm.height}" fill="none" class="signature-svg" data-source="photo">
  <path class="sig-fill" fill="#fff" fill-rule="evenodd" d="${d}"/>
  <g class="sig-strokes" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
${subs.map((s) => `    <path d="${s}"/>`).join('\n')}
  </g>
</svg>
`;
  return out;
}

/** Catmull-Rom through every point → cubic Bézier segments [start, c1, c2, end]. */
function crSegments(p) {
  if (p.length < 3) return [[p[0], p[0], p.at(-1), p.at(-1)]];
  const segs = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    segs.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return segs;
}

const r1 = (n) => +n.toFixed(1);

/** Smooth a list of points into a cubic Bézier path. */
function smoothPath(p) {
  const segs = crSegments(p);
  return `M${r1(p[0][0])} ${r1(p[0][1])}` + segs.map(([, a, b, e]) => `C${r1(a[0])} ${r1(a[1])} ${r1(b[0])} ${r1(b[1])} ${r1(e[0])} ${r1(e[1])}`).join('');
}

/** Evenly spaced samples along the smoothed stroke. */
function sampleStroke(p, step = 1.5) {
  const pts = [];
  for (const [s, a, b, e] of crSegments(p)) {
    for (let i = pts.length ? 1 : 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      pts.push([
        u * u * u * s[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * e[0],
        u * u * u * s[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * e[1],
      ]);
    }
  }
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= step || i === pts.length - 1) { out.push(pts[i]); acc = 0; }
  }
  return out;
}

/**
 * Pen-ink outline of one stroke: a ribbon around the centre line whose width follows a ballpoint's
 * pressure — fuller on downstrokes, lighter on upstrokes, tapering in and out at the pen lifts.
 */
function inkRibbon(p, { min, max, taperIn = 14, taperOut = 22 }) {
  const s = sampleStroke(p);
  const n = s.length;
  if (n < 3) return '';
  const len = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  const L = len[n - 1];
  const tan = s.map((_, i) => {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(n - 1, i + 1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  });
  // pressure: downward travel (screen y grows) presses harder
  let w = tan.map(([, dy]) => 0.35 + 0.65 * Math.max(0, dy) ** 0.8);
  for (let pass = 0; pass < 4; pass++) w = w.map((_, i) => (w[Math.max(0, i - 2)] + w[Math.max(0, i - 1)] + w[i] + w[Math.min(n - 1, i + 1)] + w[Math.min(n - 1, i + 2)]) / 5);
  w = w.map((v, i) => {
    const tin = Math.min(1, len[i] / Math.min(taperIn, L / 3)) ** 0.55;
    const tout = Math.min(1, (L - len[i]) / Math.min(taperOut, L / 3)) ** 0.7;
    return (min + (max - min) * v) * Math.max(0.12, Math.min(tin, tout)) / 2;
  });
  const left = s.map(([x, y], i) => [x - tan[i][1] * w[i], y + tan[i][0] * w[i]]);
  const right = s.map(([x, y], i) => [x + tan[i][1] * w[i], y - tan[i][0] * w[i]]).reverse();
  return 'M' + [...left, ...right].map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + 'Z';
}

/**
 * Centre-line trace of the real signature (raw/signature.strokes.json, traced from the signing video).
 * One <path> per pen stroke, in writing order, so the draw animation follows the real hand; then a
 * pen-ink layer (.sig-fill) with thick-and-thin strokes that the site fades in once the line has drawn.
 */
async function strokeSignature(src) {
  console.log(`signature: building from ${path.relative(ROOT, src)}`);
  const { strokes } = JSON.parse(await fs.readFile(src, 'utf8'));
  const all = Object.values(strokes).flat();
  const pad = 8, k = 1.6;
  const minX = Math.min(...all.map((q) => q[0])) - pad, minY = Math.min(...all.map((q) => q[1])) - pad;
  const W = Math.ceil((Math.max(...all.map((q) => q[0])) + pad - minX) * k);
  const H = Math.ceil((Math.max(...all.map((q) => q[1])) + pad - minY) * k);
  const scaled = Object.entries(strokes).map(([name, pts]) => [name, pts.map(([x, y]) => [(x - minX) * k, (y - minY) * k])]);
  const paths = scaled.map(([name, p]) => `    <path${name.startsWith('dot') ? ' class="dot"' : ''} data-stroke="${name}" d="${smoothPath(p)}"/>`);
  const ink = scaled
    .map(([name, p]) =>
      name.startsWith('dot')
        ? `M${r1(p[0][0] - 3.4)} ${r1(p[0][1])}a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0Z`
        : inkRibbon(p, name === 'flourish' ? { min: 1.6, max: 4.4, taperIn: 30, taperOut: 60 } : { min: 1.9, max: 5.6 }),
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" class="signature-svg" data-source="traced">
  <path class="sig-fill" fill="#fff" d="${ink}"/>
  <g class="sig-strokes" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
${paths.join('\n')}
  </g>
</svg>
`;
}

/** Hand-traced stand-in following the described shapes; replaced as soon as raw/signature.* exists. */
function placeholderSignature() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 260" fill="none" class="signature-svg" data-source="placeholder">
  <g class="sig-strokes" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M46 214C70 160 98 92 128 34C136 70 150 140 176 206C140 176 84 168 30 184C90 176 170 170 224 162"/>
    <path d="M214 168C218 158 222 150 226 150C230 150 230 160 230 168C232 156 236 150 240 150C244 150 244 160 244 168C246 156 250 150 254 150C258 150 258 162 260 168C262 160 266 152 268 150C268 158 268 164 272 168C278 166 284 156 290 152C284 148 276 156 278 164C282 170 290 164 294 152C296 136 298 124 298 112C298 132 298 156 304 168C308 152 312 128 312 110C312 130 312 152 314 168C318 156 322 150 328 150C332 152 332 162 336 168C342 154 348 130 348 110C344 130 344 156 352 168C356 162 362 152 370 150C362 148 354 158 358 166C362 170 370 162 372 150C372 160 374 166 380 168C384 166 388 160 390 152C392 170 390 196 382 214C376 222 366 216 372 204C380 190 400 178 420 170"/>
    <path d="M330 236C420 200 520 130 616 28"/>
    <path class="dot" d="M560 152l.4 .1"/>
    <path class="dot" d="M586 138l.4 .1"/>
  </g>
</svg>
`;
}

async function writeSignatureFiles(svg) {
  await fs.writeFile(path.join(OUT, 'signature.svg'), svg);
  // favicon: signature on a dark tile (white-on-transparent would vanish in light browser tabs)
  const vb = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  // favicon is too small for the ink layer: line only
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*<path class="sig-fill"[^>]*\/>/, '');
  const s = 52 / Math.max(vb[2], vb[3] * 1.6);
  const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0a0a0b"/><g transform="translate(${(64 - vb[2] * s) / 2} ${(64 - vb[3] * s) / 2}) scale(${s})" fill="none">${inner.replace(/stroke-width="([\d.]+)"/g, (m, w) => `stroke-width="${Math.max(+w, 2.2 / s)}"`)}</g></svg>`;
  await fs.writeFile(path.join(ROOT, 'public/favicon.svg'), fav);
  await sharp(Buffer.from(fav)).resize(180, 180).png().toFile(path.join(ROOT, 'public/apple-touch-icon.png'));
}

/* ───────────────────────────── portrait ───────────────────────────── */

async function removeBackground(src, rotatedPng) {
  const cut = await findRaw('portrait-cutout');
  if (cut) {
    console.log('portrait: using raw/portrait-cutout.png');
    return sharp(cut).png().toBuffer();
  }
  try {
    await import.meta.resolve?.('@imgly/background-removal-node');
    const tmpIn = path.join(os.tmpdir(), `portrait-in-${Date.now()}.png`);
    const tmpOut = path.join(os.tmpdir(), `portrait-cut-${Date.now()}.png`);
    await fs.writeFile(tmpIn, rotatedPng);
    console.log('portrait: removing background with @imgly/background-removal-node…');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/lib/cutout.js'), tmpIn, tmpOut], { stdio: ['ignore', 'inherit', 'ignore'] });
    return await fs.readFile(tmpOut);
  } catch (e) {
    if (!/Cannot find|ERR_MODULE_NOT_FOUND/.test(e.message)) console.warn('  imgly failed:', e.message);
  }
  try {
    const tmp = path.join(os.tmpdir(), `portrait-cut-${Date.now()}.png`);
    const tmpIn = path.join(os.tmpdir(), `portrait-in-${Date.now()}.png`);
    await fs.writeFile(tmpIn, rotatedPng);
    execFileSync('rembg', ['i', tmpIn, tmp], { stdio: 'ignore' });
    console.log('portrait: background removed with rembg');
    return fs.readFile(tmp);
  } catch {}
  console.warn(
    '\n  ⚠ No background remover available — the sky/wires/trees will stay in.\n' +
      '    Install one, then run `npm run assets` again:\n' +
      '      npm i -D @imgly/background-removal-node\n' +
      '    or save your own cut-out as raw/portrait-cutout.png\n',
  );
  return sharp(rotatedPng).ensureAlpha().png().toBuffer();
}

/**
 * Tidy the cut-out alpha: morphological opening drops thin leftovers (wires, window frames, poles),
 * then only the largest connected blob (you) is kept, with a soft 1px edge.
 */
async function cleanMask(buf) {
  const img = sharp(buf).ensureAlpha();
  const { width: W, height: H } = await img.metadata();
  const r = Math.max(3, Math.round(Math.min(W, H) / 64));
  const alpha = await img.clone().extractChannel(3).threshold(128).raw().toBuffer();
  const opened = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).erode(r).dilate(r).extractChannel(0).raw().toBuffer();
  // largest 4-connected component
  const label = new Int32Array(W * H);
  let best = 0, bestSize = 0, id = 0;
  const stack = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!opened[i] || label[i]) continue;
    id++;
    let sp = 0, size = 0;
    stack[sp++] = i;
    label[i] = id;
    while (sp) {
      const j = stack[--sp];
      size++;
      const x = j % W, y = (j / W) | 0;
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) {
        if (k >= 0 && opened[k] && !label[k]) { label[k] = id; stack[sp++] = k; }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  // final alpha = original alpha inside the kept blob (dilated a touch so hair edges survive)
  const keep = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) keep[i] = label[i] === best ? 255 : 0;
  // rounded grow (blur + low threshold) so the original soft edges come back without square corners
  const keepD = await sharp(keep, { raw: { width: W, height: H, channels: 1 } })
    .blur(r * 1.1).threshold(40).extractChannel(0).raw().toBuffer();
  const { data } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < W * H; i++) {
    // drop the faint sky-coloured fringe around hair: steeper alpha falloff
    let a = Math.min(data[i * 4 + 3], keepD[i]) / 255;
    a = Math.min(1, Math.max(0, (a - 0.3) / 0.6));
    data[i * 4 + 3] = Math.round(a * a * (3 - 2 * a) * 255);
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

async function autoCrop(buf) {
  const override = path.join(RAW, 'portrait.crop.json');
  if (await exists(override)) return JSON.parse(await fs.readFile(override, 'utf8'));
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const rowSpan = new Array(H).fill(null);
  for (let y = 0; y < H; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 128) { if (a < 0) a = x; b = x; }
    if (a >= 0) rowSpan[y] = [a, b];
  }
  const top = rowSpan.findIndex(Boolean);
  if (top < 0) return { left: 0, top: 0, width: W, height: H };
  // head width ≈ median span of the first 12% of subject rows → frame ≈ 2.4 head widths
  const rows = rowSpan.slice(top, top + Math.round(H * 0.12)).filter(Boolean);
  const spans = rows.map(([a, b]) => b - a).sort((a, b) => a - b);
  const headW = spans[Math.floor(spans.length * 0.8)] || W * 0.3;
  const cx = rows.reduce((s, [a, b]) => s + (a + b) / 2, 0) / rows.length;
  let width = Math.min(W, Math.round(headW * 2.5));
  let height = Math.round((width * 9) / 7);
  let ty = Math.max(0, top - Math.round(height * 0.06));
  if (ty + height > H) { height = H - ty; width = Math.round((height * 7) / 9); }
  const left = Math.max(0, Math.min(W - width, Math.round(cx - width / 2)));
  return { left, top: ty, width, height };
}

async function processPortrait(src) {
  console.log(`portrait: processing ${path.relative(ROOT, src)}`);
  const rotated = await sharp(src).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const cut = await cleanMask(await removeBackground(src, rotated));
  const crop = await autoCrop(cut);
  console.log('portrait: crop', crop);
  const cropped = sharp(cut).extract(crop);
  // full-colour cut-out for the hero (the real face, before it pixelates). Same 7:9 'fill' as the map,
  // so each mosaic cell lines up exactly with its slice of the photo.
  await cropped.clone().resize(MAP_W * 5, MAP_H * 5, { fit: 'fill' }).modulate({ saturation: 1.05 })
    .webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(OUT, 'portrait-color.webp'));
  const { data, info } = await cropped.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // B&W + contrast, computed only over subject pixels so the removed background doesn't skew levels
  const lum = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128) lum.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  lum.sort((a, b) => a - b);
  const lo = lum[Math.floor(lum.length * 0.02)] ?? 0, hi = lum[Math.floor(lum.length * 0.98)] ?? 255;
  const out = Buffer.alloc((data.length / 4) * 2);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 2) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    let v = (l - lo) / Math.max(1, hi - lo);
    v = Math.min(1, Math.max(0, v));
    v = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v); // S-curve = raised contrast
    out[j] = Math.round(v * 255);
    out[j + 1] = data[i + 3];
  }
  const bw = sharp(out, { raw: { width: info.width, height: info.height, channels: 2 } });
  await bw.clone().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 90 }).toFile(path.join(OUT, 'portrait.webp'));
  // mosaic map: extra local contrast (CLAHE) + lifted mids so eyes/nose/jaw read at ~70×90 tiles
  const n = info.width * info.height;
  const g0 = Buffer.alloc(n), alphaCh = Buffer.alloc(n);
  for (let i = 0; i < n; i++) { g0[i] = out[i * 2]; alphaCh[i] = out[i * 2 + 1]; }
  const gray = await sharp(g0, { raw: { width: info.width, height: info.height, channels: 1 } })
    .clahe({ width: 64, height: 64, maxSlope: 4 }).extractChannel(0).raw().toBuffer();
  for (let i = 0; i < n; i++) gray[i] = Math.round(255 * Math.pow(gray[i] / 255, 0.8)); // lift mids
  const ga = Buffer.alloc(gray.length * 2);
  for (let i = 0; i < gray.length; i++) { ga[i * 2] = gray[i]; ga[i * 2 + 1] = alphaCh[i]; }
  await sharp(ga, { raw: { width: info.width, height: info.height, channels: 2 } })
    .resize(MAP_W, MAP_H, { fit: 'fill' })
    .png()
    .toFile(path.join(OUT, 'portrait-map.png'));
}

/** Stylised head-and-shoulders stand-in so the mosaic still reads as a face before the real photo is added. */
async function placeholderPortrait() {
  const curls = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const a = Math.PI * (0.92 + rnd() * 1.16);
    const r = 30 + rnd() * 14;
    curls.push(`<circle cx="${70 + Math.cos(a) * r * 1.05}" cy="${66 + Math.sin(a) * r * 1.02}" r="${5 + rnd() * 6}" fill="rgb(${18 + rnd() * 30 | 0},${18 + rnd() * 30 | 0},${18 + rnd() * 30 | 0})"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}">
  <defs>
    <radialGradient id="f" cx="0.42" cy="0.4" r="0.7"><stop offset="0" stop-color="#c9c9c9"/><stop offset="0.7" stop-color="#8d8d8d"/><stop offset="1" stop-color="#5a5a5a"/></radialGradient>
    <linearGradient id="s" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f2f2f2"/><stop offset="1" stop-color="#cfcfcf"/></linearGradient>
  </defs>
  <path d="M8 180 C10 150 30 138 52 132 L88 132 C110 138 130 150 132 180 Z" fill="url(#s)"/>
  <path d="M58 116 L82 116 L84 138 C76 146 64 146 56 138 Z" fill="#777"/>
  <path d="M52 132 C60 146 80 146 88 132" stroke="#999" stroke-width="3" fill="none"/>
  <ellipse cx="70" cy="86" rx="27" ry="35" fill="url(#f)"/>
  <ellipse cx="43" cy="88" rx="4" ry="8" fill="#888"/><ellipse cx="97" cy="88" rx="4" ry="8" fill="#6a6a6a"/>
  ${curls.join('')}
  <path d="M50 76 Q58 71 65 75" stroke="#2a2a2a" stroke-width="3" fill="none"/><path d="M75 75 Q82 71 90 76" stroke="#2a2a2a" stroke-width="3" fill="none"/>
  <ellipse cx="58" cy="84" rx="5" ry="3" fill="#222"/><ellipse cx="82" cy="84" rx="5" ry="3" fill="#222"/>
  <path d="M70 86 L66 100 Q70 103 75 100" stroke="#5c5c5c" stroke-width="2.5" fill="none"/>
  <path d="M61 108 Q70 113 80 108" stroke="#4a4a4a" stroke-width="3" fill="none"/>
  <path d="M46 92 Q48 118 70 122 Q92 118 94 92" stroke="#444" stroke-width="5" fill="none" opacity="0.55"/>
</svg>`;
  const img = sharp(Buffer.from(svg)).blur(0.8);
  await img.clone().png().toFile(path.join(OUT, 'portrait-map.png'));
  await sharp(Buffer.from(svg)).resize(560, 720).blur(2).grayscale().webp({ quality: 80 }).toFile(path.join(OUT, 'portrait.webp'));
  await sharp(Buffer.from(svg)).resize(MAP_W * 5, MAP_H * 5).blur(1).webp({ quality: 80 }).toFile(path.join(OUT, 'portrait-color.webp'));
}

/* ───────────────────────────── main ───────────────────────────── */

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  // `npm run assets -- --only=signature` (or portrait) rebuilds just that part and keeps the other's status
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const statusFile = path.join(OUT, 'assets.json');
  const status = (await exists(statusFile)) ? JSON.parse(await fs.readFile(statusFile, 'utf8')) : {};

  if (only !== 'portrait') {
    const sigSrc = await findRaw('signature');
    const sigTrace = path.join(RAW, 'signature.strokes.json');
    if (await exists(sigTrace)) {
      await writeSignatureFiles(await strokeSignature(sigTrace));
      status.signature = 'traced';
    } else if (sigSrc) {
      await writeSignatureFiles(await processSignature(sigSrc));
      status.signature = 'photo';
    } else {
      console.warn('signature: raw/signature.jpg not found — writing hand-traced placeholder');
      await writeSignatureFiles(placeholderSignature());
      status.signature = 'placeholder';
    }
  }

  if (only !== 'signature') {
    const porSrc = await findRaw('portrait');
    if (porSrc) {
      await processPortrait(porSrc);
      status.portrait = 'photo';
    } else {
      console.warn('portrait: raw/portrait.jpg not found — writing placeholder face map');
      await placeholderPortrait();
      status.portrait = 'placeholder';
    }
  }
  await fs.writeFile(path.join(OUT, 'assets.json'), JSON.stringify(status, null, 2));
  console.log('assets:', status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
