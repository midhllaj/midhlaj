# Midhlaj — Web Designer & Developer

A dark, minimal, single-page portfolio. Scroll to fly through the work in 3D. Hundreds of website thumbnails fly in and settle into a mosaic of my face. The handwritten signature draws itself on screen.

**Stack:** Vite · vanilla JS · Three.js (WebGL) · GSAP + ScrollTrigger · Lenis · Puppeteer + sharp (build-time tooling). Static output, ready for Vercel.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # → dist/
npm run preview      # serve the production build
```

Node 18+ (tested on Node 22).

Useful URL flags:
- `?open=contact` opens the contact panel on load.
- `?static` forces the reduced-motion version (no WebGL): a static mosaic image plus a simple grid.

---

## Add a new website (two steps)

1. Add **one entry** to [`src/data/projects.json`](src/data/projects.json):

   ```json
   {
     "id": "new-client",
     "name": "New Client",
     "url": "https://newclient.com/",
     "category": "Restaurant",
     "year": 2026,
      "description": "One or two lines about the project.",
     "tech": ["Next.js", "GSAP"],
     "featured": false,
     "screenshots": []
   }
   ```

   `id` must be unique and URL-safe (it becomes the folder name). Set `"featured": true` to also show it as a large card in **Selected work**.

2. Run:

   ```bash
   npm run shots
   ```

   For each project that has no screenshots yet, this:
   - opens the URL in headless Chrome at **desktop 1440×900** and **mobile 390×844**
   - captures the hero plus 4 scrolled sections in each size
   - saves **400px WebP thumbnails** to `public/thumbs/<id>/` and **larger WebP shots** (for the side panel) to `public/shots/<id>/`
   - writes the file list into `projects.json → screenshots`
   - captures a tall **full-page strip** per size (top 8 desktop / 6 mobile screens) to `raw/strips/<id>/`. These are packed into `public/atlas/scroll.webp`, so every desktop and phone tile in the fly-through scrolls through the real page. Older sites without strips get them on the next run.
   - rebuilds the texture atlas (`public/atlas/`), the static mosaic and the OG image

   Sites that already have shots are skipped. Options:
   ```bash
   npm run shots -- --force                 # retake everything
   npm run shots -- --force --only=new-client   # retake one site
   ```
   If a site has a long preloader, add `"shotWait": 8000` (ms) to its entry.

   **Apps without a public page** (dashboards, mobile apps, like Linaul): put the screenshots in `raw/shots/<id>/` named `desktop-0.png`, `desktop-1.png`, … and `mobile-0.png`, … (png, jpg or webp). If that folder exists, `npm run shots` uses those files instead of visiting the URL. Desktop images are cropped to 16:10.

Everything else builds itself from `projects.json`: the fly-through tunnel and its floating labels, the mosaic tiles, the Selected work cards, the client list in About, and "Explore all N projects".

---

## Your signature and portrait

> **Portrait:** done (`raw/portrait.jpg`). **Signature:** done: traced from the signing video into `raw/signature.strokes.json` (edit the points and run `npm run assets -- --only=signature` to rebuild).

1. Put the photos in [`/raw`](raw/README.md) as `raw/signature.jpg` and `raw/portrait.jpg`.
2. Background removal uses `@imgly/background-removal-node` (already installed as a dev dependency; it runs in its own process because it clashes with sharp). Alternatives: `pip install "rembg[cpu,cli]"`, or save your own cut-out as `raw/portrait-cutout.png`.
3. Run:
   ```bash
   npm run assets
   ```

What it does:
- **Signature:** flattens the paper lighting, removes the paper (Otsu threshold) so only the pencil strokes remain, and vectorises them with potrace. The result is `public/assets/signature.svg` in white on transparent, using your real stroke shapes. The SVG has a stroke layer (drawn with `stroke-dashoffset`) and a solid ink layer that fades in after the draw. It also generates `favicon.svg` and `apple-touch-icon.png`.
- **Portrait:** removes the background (sky, wires, trees), auto-crops to head and shoulders, converts to B&W with raised contrast, and writes:
  - `public/assets/portrait-color.webp`, a colour cut-out used to tint the hero tiles
  - `public/assets/portrait.webp`, a B&W cut-out (no longer shown; the About photo is `public/assets/about.webp`, made from `raw/about.png`)
  - `public/assets/portrait-map.png`, the 140×180 brightness and alpha map the mosaic samples (≈70×90 cells on desktop, 28×36 on mobile)
  - then re-renders `public/assets/mosaic.webp` and `public/og.jpg`.

If the auto-crop misses, add `raw/portrait.crop.json` (see `raw/README.md`) and rerun.

---

## Personal details

Edit [`src/config.js`](src/config.js) to set:
- your WhatsApp number
- your Instagram, LinkedIn and GitHub URLs
- your services
- your budget ranges (USD)
- the Formspree form ID

**Contact form:** create a free form at [formspree.io](https://formspree.io), copy its ID (the part after `/f/`), and paste it into `formspreeId`. Until then, "Send enquiry" opens the visitor's email app with the brief filled in.

---

## Deploy to Vercel

1. Push the repo to GitHub, then **Import Project** on vercel.com. The framework preset is detected as Vite: build `vite build`, output `dist` (both already set in `vercel.json`).
2. Optional: set `SITE_URL=https://your-domain.com` in the project's environment variables to get absolute canonical and OG URLs. Without it, the Vercel production URL is used automatically.
3. Deploy.

Screenshots are taken **locally** (`npm run shots`) and committed. Puppeteer skips its Chrome download on Vercel/CI (`.puppeteerrc.cjs`).

---

## Project structure

```
index.html              page markup + SEO / OG tags
src/
  main.js               boot: loader → signature → mosaic; Lenis; scroll → camera; panels
  config.js             personal details
  data/projects.json    the work (single source of truth)
  scene/
    Experience.js       renderer, camera, scroll mapping, hover/click picking, floating labels
    Mosaic.js           face mosaic: InstancedBufferGeometry + atlas + brightness-tint shader
    Tunnel.js           fly-through: one plane per screenshot, grouped by project along -Z
    shaders.js          GLSL (intro fly-in, scatter, tint, radial motion blur)
    constants.js
  ui/
    signature.js        inject + draw the SVG signature (stroke-dashoffset)
    panels.js           project side panel, contact panel + form, Esc / focus trap
    content.js          renders cards, lists, socials, static grid from data
    cursor.js           custom dot cursor
  styles/main.css
scripts/
  shots.js              Puppeteer screenshots → thumbs / shots → atlas → mosaic
  atlas.js              packs thumbs into public/atlas/atlas.webp + atlas.json
  assets.js             signature + portrait processing
  render-mosaic.js      static mosaic + OG image (Node, no browser)
public/
  thumbs/ shots/ atlas/ assets/  og.jpg  favicon.svg
raw/                    your original photos (git-ignored)
```

## How the effects work

- **Hero (modelled on the reference):** the face is centred and made of small website tiles in their real colours. Each tile's size and brightness follow your portrait, so bright areas give big, bright tiles and shadows shrink to tiny dim ones (a halftone). A slight tint from your colour photo keeps the red hair and skin tones, and faint dust floats around. Behind it, a giant italic serif "Midhlaj" sits along the bottom (Instrument Serif, fitted to the screen width) while the signature writes itself as a big thin grey line.
- **Face mosaic:** the portrait map is sampled into a grid; each kept cell becomes one instance with a random crop of a screenshot from the atlas (`aRect`) and its brightness (`aB`). The fragment shader turns the screenshot's luminance into detail around the cell's brightness, so the tiles together read as the face. Brighter tiles sit slightly forward, which gives real depth when the mouse tilts the face.
- **Intro:** each tile starts deep in −Z and eases into its cell, staggered from the centre outwards.
- **Fly-through:** scroll position maps to camera Z. The mosaic scatters into an ambient field streaming past the camera. The real screenshots float in a tunnel, grouped by project, with HTML labels projected from 3D. Scroll velocity adds a radial blur and a small FOV kick. Raycasting powers hover (brighten + caption) and click (camera flies to the tile and the side panel opens).
- **Outro:** at the end of the section the tiles regroup into the face and the signature draws again.
- **Reduced motion / no WebGL:** no 3D. Instead, a static mosaic image (pre-rendered by `render-mosaic.js`) and a simple project grid.

## Performance notes

- JS is about **185 KB gzipped** in total (three.js ≈ 119 KB, GSAP + Lenis ≈ 51 KB, app ≈ 15 KB). three.js is code-split and loaded during the loader.
- One WebP atlas texture and one draw call for the whole mosaic (≈3–4k instances on desktop, ≈500 on mobile). Mobile uses a lighter shader (no blur taps) and a lower pixel ratio.
- The canvas stops rendering once the content sections cover it.
- KTX2 isn't used: WebP keeps the build toolchain simple. If you add many more sites, convert `atlas.webp` with `toktx` and switch the loader to `KTX2Loader`.
