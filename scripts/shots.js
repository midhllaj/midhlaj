#!/usr/bin/env node
/**
 * npm run shots [-- --force] [-- --only=<id>]
 *
 * For every project in src/data/projects.json:
 *   - opens the URL in headless Chrome (desktop 1440x900 + mobile 390x844)
 *   - captures the hero + up to 4 scrolled sections
 *   - writes 400px WebP thumbnails  -> public/thumbs/<id>/<desktop|mobile>-<n>.webp
 *   - writes 1200px WebP "large"    -> public/shots/<id>/<desktop|mobile>-<n>.webp   (side panel)
 *   - records the list in projects.json -> "screenshots"
 *   - captures a tall full-page "strip" per size -> raw/strips/<id>/<desktop|mobile>.webp
 *     (packed into public/atlas/scroll.webp so the tiles in the fly-through scroll like real pages)
 * Then rebuilds the texture atlas + static mosaic / OG image.
 *
 * Projects that already have thumbnails are skipped unless --force is passed.
 *
 * Apps without a public page (dashboards, mobile apps): put the screenshots in
 * raw/shots/<id>/ named desktop-0.png, desktop-1.png … mobile-0.png … (png/jpg/webp).
 * When that folder exists it is used instead of visiting the URL.
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { ROOT, readProjects, writeProjects, exists } from './lib/paths.js';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SECTIONS = 5; // hero + 4 scrolled sections (fewer if the page is short)
const STRIP_VIEWPORTS = { desktop: 8, mobile: 6 }; // how much of the page the scrolling tiles show
const STRIP_WIDTH = { desktop: 800, mobile: 390 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function autoScroll(page) {
  // Scroll through the whole page once so lazy images / reveal animations fire.
  await page.evaluate(async () => {
    const h = () => document.documentElement.scrollHeight;
    for (let y = 0; y < h(); y += Math.round(innerHeight * 0.6)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 140));
    }
    window.scrollTo(0, 0);
  });
  await sleep(600);
}

/** Full-page capture (top STRIP_VIEWPORTS screens) for the scrolling tiles. */
async function captureStrip(page, project, kind) {
  const vp = VIEWPORTS[kind];
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(700);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const height = Math.min(total, vp.height * STRIP_VIEWPORTS[kind]);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: vp.width, height }, captureBeyondViewport: true });
  const dir = path.join(ROOT, 'raw/strips', project.id);
  await fs.mkdir(dir, { recursive: true });
  await sharp(png).resize({ width: STRIP_WIDTH[kind] }).webp({ quality: 82 }).toFile(path.join(dir, `${kind}.webp`));
  console.log(`  · ${kind} strip (${vp.width}×${height})`);
}

async function capture(browser, project, kind, { shots = true, strip = true } = {}) {
  const vp = VIEWPORTS[kind];
  const page = await browser.newPage();
  await page.setViewport(vp);
  if (kind === 'mobile') await page.setUserAgent(MOBILE_UA);
  try {
    await page.goto(project.url, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    console.warn(`  ! ${kind}: load timed out, continuing with what rendered (${e.message})`);
  }
  // Wait out preloaders: until the page is taller than the viewport (or a per-project "shotWait" ms).
  const deadline = Date.now() + (project.shotWait || 12000);
  while (Date.now() < deadline) {
    const tall = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight * 1.3).catch(() => false);
    if (tall) break;
    await sleep(500);
  }
  await sleep(project.shotWait ? 500 : 2000);
  // Hide cookie banners / chat bubbles that would cover every shot.
  await page.addStyleTag({
    content: `[id*="cookie" i],[class*="cookie" i],[class*="consent" i],[id*="consent" i],
      iframe[src*="tawk"],iframe[src*="crisp"],#hubspot-messages-iframe-container{display:none!important}
      *{scroll-behavior:auto!important}`,
  }).catch(() => {});
  await autoScroll(page);
  if (strip) await captureStrip(page, project, kind);
  if (!shots) { await page.close(); return []; }

  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const maxY = Math.max(0, total - vp.height);
  const n = maxY < vp.height * 0.5 ? 1 : SECTIONS;
  const files = [];
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : Math.round((maxY * i) / (n - 1));
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await sleep(900);
    const png = await page.screenshot({ type: 'png' });
    const name = `${kind}-${i}.webp`;
    await sharp(png).resize({ width: 400 }).webp({ quality: 78 }).toFile(path.join(ROOT, 'public/thumbs', project.id, name));
    await sharp(png).resize({ width: kind === 'desktop' ? 1200 : 600 }).webp({ quality: 80 }).toFile(path.join(ROOT, 'public/shots', project.id, name));
    files.push(name);
    process.stdout.write(`  · ${kind} ${i + 1}/${n}\r`);
  }
  process.stdout.write('\n');
  await page.close();
  return files;
}

const IMG = /\.(png|jpe?g|webp)$/i;
const order = (f) => (f.startsWith('desktop') ? 0 : 1000) + parseInt(f.match(/\d+/)?.[0] || 0, 10);

/** Build thumbs + large shots from raw/shots/<id>/ (desktop shots are cropped to 16:10 like the browser captures). */
async function fromRaw(project, rawDir) {
  const files = (await fs.readdir(rawDir)).filter((f) => IMG.test(f) && /^(desktop|mobile)/.test(f)).sort((a, b) => order(a) - order(b));
  const out = [];
  for (const f of files) {
    const kind = f.startsWith('mobile') ? 'mobile' : 'desktop';
    const name = f.replace(IMG, '.webp');
    let img = sharp(path.join(rawDir, f)).flatten({ background: '#ffffff' });
    if (kind === 'desktop') img = img.resize(1440, 900, { fit: 'cover', position: 'top' });
    const buf = await img.png().toBuffer();
    await sharp(buf).resize({ width: 400 }).webp({ quality: 78 }).toFile(path.join(ROOT, 'public/thumbs', project.id, name));
    await sharp(buf).resize({ width: kind === 'desktop' ? 1200 : 600 }).webp({ quality: 80 }).toFile(path.join(ROOT, 'public/shots', project.id, name));
    out.push(name);
  }
  console.log(`  · ${out.length} screenshots from raw/shots/${project.id}/`);
  return out;
}

async function main() {
  const projects = await readProjects();
  let browser;
  let changed = false;

  for (const project of projects) {
    if (ONLY && project.id !== ONLY) continue;
    const thumbDir = path.join(ROOT, 'public/thumbs', project.id);
    const have = (await exists(thumbDir)) ? (await fs.readdir(thumbDir)).filter((f) => f.endsWith('.webp')) : [];
    const rawDir = path.join(ROOT, 'raw/shots', project.id);
    const useRaw = await exists(rawDir);
    if (have.length && !FORCE) {
      console.log(`- ${project.name}: ${have.length} shots exist, skipping (use --force to retake)`);
      if (!project.screenshots?.length) { project.screenshots = have.sort(); changed = true; }
      // websites captured before strips existed: grab just the scrolling strips
      const stripDir = path.join(ROOT, 'raw/strips', project.id);
      const strips = ['desktop', 'mobile'].every((k) => fsSync.existsSync(path.join(stripDir, `${k}.webp`)));
      if (!useRaw && !strips) {
        browser ||= await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
        try {
          for (const kind of ['desktop', 'mobile']) await capture(browser, project, kind, { shots: false });
        } catch (e) {
          console.error(`  ✗ strip failed: ${e.message}`);
        }
      }
      continue;
    }
    console.log(`+ ${project.name} — ${useRaw ? `raw/shots/${project.id}/` : project.url}`);
    await fs.rm(thumbDir, { recursive: true, force: true });
    await fs.rm(path.join(ROOT, 'public/shots', project.id), { recursive: true, force: true });
    await fs.mkdir(thumbDir, { recursive: true });
    await fs.mkdir(path.join(ROOT, 'public/shots', project.id), { recursive: true });
    if (useRaw) {
      project.screenshots = await fromRaw(project, rawDir);
      changed = true;
      continue;
    }
    browser ||= await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
    try {
      const desktop = await capture(browser, project, 'desktop');
      const mobile = await capture(browser, project, 'mobile');
      project.screenshots = [...desktop, ...mobile];
      changed = true;
    } catch (e) {
      console.error(`  ✗ failed: ${e.message}`);
    }
  }
  if (browser) await browser.close();
  if (changed) await writeProjects(projects);

  console.log('\nRebuilding texture atlas + mosaic…');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/atlas.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/render-mosaic.js')], { stdio: 'inherit' });
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
