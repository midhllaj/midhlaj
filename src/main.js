import './styles/main.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import projects from './data/projects.json';
import { loadSignature, mountSignatures, drawSignature, resetSignature } from './ui/signature.js';
import { initCursor } from './ui/cursor.js';
import { renderContent } from './ui/content.js';
import { initPanels, openPanel, closePanel, setPanelHooks, fillProjectPanel, initContact } from './ui/panels.js';
import { FIRST, SEG } from './scene/constants.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
// Phones often switch on "reduce motion" silently (Android battery saver → "Remove animations").
// The site keeps its full animation either way; reduce-motion only drops the smooth-scroll glide.
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
})();
const params = new URLSearchParams(window.location.search);
const staticMode = !hasWebGL || params.has('static');
if (staticMode) root.classList.add('static-mode');
document.body.classList.add('is-loading');

/* ───────── smooth scroll ───────── */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
const lenis = new Lenis({ lerp: reduced ? 1 : 0.085, autoRaf: false, anchors: false });
lenis.stop(); // locked until the intro finishes
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

/* ───────── layout ───────── */
const work = $('#work');
const story = $('#about');
const storyTrack = $('#story-track');
const storyWindow = $('.story__window');
const storyCards = [...storyTrack.children];
/*
 * Scroll map of the #work section:
 *   flyStart ── flight through the work ── flyEnd ── About strip slides sideways ── aboutEnd ── next section
 * During the About part the face stays regrouped and every px of vertical scroll moves the strip ~0.8px sideways.
 */
const STORY_RATIO = 1.6; // vertical scroll px per horizontal px
const L = { vh: window.innerHeight, flyStart: 0, flyRange: 1, flyEnd: 0, storyHold: 0, storyRun: 1, storyTravel: 0, storyWin: 0, cardX: [], cardW: [], aboutEnd: 0 };
function measure() {
  L.vh = window.innerHeight;
  const live = !staticMode;
  L.storyWin = storyWindow.clientWidth;
  L.storyTravel = live ? Math.max(0, storyTrack.scrollWidth - L.storyWin) : 0;
  L.cardX = storyCards.map((c) => c.offsetLeft);
  L.cardW = storyCards.map((c) => c.offsetWidth);
  L.storyHold = live ? L.vh * 0.55 : 0; // the face slides left and the strip settles in before it starts moving
  L.storyRun = Math.max(1, L.storyTravel * STORY_RATIO);
  const aboutLen = live ? Math.round(L.storyHold + L.storyRun + L.vh * 0.4) : 0;
  if (live) work.style.height = `${Math.round(L.vh * (1.4 + projects.length * 1.2) + aboutLen)}px`;
  L.flyStart = work.offsetTop;
  L.flyRange = Math.max(1, work.offsetHeight - L.vh - aboutLen);
  L.flyEnd = L.flyStart + L.flyRange;
  L.aboutEnd = L.flyEnd + aboutLen;
}

/* ───────── content + UI ───────── */
let exp = null;
const cursor = initCursor();
renderContent(projects, { onCard: (i) => openProject(i) });
initPanels();
initContact();
measure();

const projectPanel = $('#project-panel');
const contactPanel = $('#contact');
let flying = false; // a programmatic scroll to a project is in progress

setPanelHooks({
  onOpen() {
    if (!flying) lenis.stop();
  },
  onClose(el) {
    if (el === projectPanel) exp?.clearFocus();
    if (!document.querySelector('.panel.is-open')) lenis.start();
  },
});

function openProject(pi, itemIndex) {
  fillProjectPanel(projects, pi, (ni) => openProject(ni));
  if (!exp) {
    openPanel(projectPanel, '#pp-visit');
    return;
  }
  const ii = itemIndex ?? exp.firstItemOf(pi);
  if (ii < 0) return openPanel(projectPanel, '#pp-visit');
  const target = L.flyStart + exp.flyProgressForItem(ii) * L.flyRange;
  const far = Math.abs(lenis.scroll - target) > L.vh * 3;
  flying = true;
  lenis.start();
  exp.focusItem(ii);
  lenis.scrollTo(target, {
    duration: far ? 2.4 : 1.3,
    easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    force: true,
    onComplete: () => {
      flying = false;
      if (projectPanel.classList.contains('is-open')) lenis.stop();
    },
  });
  setTimeout(() => openPanel(projectPanel, '#pp-visit'), far ? 1500 : 600);
}

// in-page anchors, contact triggers, mobile menu
const menu = $('#menu');
const menuBtn = $('#menu-btn');
const setMenu = (open) => {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', open);
  menuBtn.textContent = open ? 'Close' : 'Menu';
  open ? lenis.stop() : lenis.start();
};
menuBtn.addEventListener('click', () => setMenu(menu.hidden));

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"], [data-open-contact]');
  if (!a) return;
  e.preventDefault();
  if (!menu.hidden) setMenu(false);
  if (a.hasAttribute('data-open-contact')) {
    if (projectPanel.classList.contains('is-open')) closePanel(projectPanel);
    openPanel(contactPanel, 'input[name=name]');
    return;
  }
  const id = a.getAttribute('href');
  if (id === '#top') return lenis.scrollTo(0, { duration: 1.6 });
  if (id === '#work' && !staticMode) return lenis.scrollTo(L.flyStart + L.vh * 0.1, { duration: 1.8 });
  if (id === '#about' && !staticMode) return lenis.scrollTo(L.flyEnd + L.storyHold, { duration: 2.2 });
  const t = document.querySelector(id);
  if (t) lenis.scrollTo(t, { duration: 1.4 });
});

/* ───────── scroll-linked UI ───────── */
const heroBottom = $('.hero__bottom');
const heroName = $('#hero-name');
const heroSig = $('.hero__sig');

/* giant name: fit the width, capped by height so the face stays visible */
function fitName() {
  const span = heroName.firstElementChild;
  heroName.style.setProperty('--name-size', '100px');
  const w100 = span.getBoundingClientRect().width || 1;
  const gutter = parseFloat(getComputedStyle(heroName).paddingLeft) || 16;
  const byWidth = ((window.innerWidth - gutter * 2) / w100) * 100;
  const cap = window.innerWidth > window.innerHeight ? window.innerHeight * 0.36 : Infinity;
  const size = Math.min(byWidth, cap);
  heroName.style.setProperty('--name-size', `${size.toFixed(1)}px`);
  // Lift the name so the tail of the "j" sits just above the bottom of the screen instead of being cut off.
  // Measure the real glyph ink (canvas) and the line box, then set `bottom` so the baseline lands there.
  const ctx = (fitName.ctx ||= document.createElement('canvas').getContext('2d'));
  const cs = getComputedStyle(heroName);
  ctx.font = `italic 400 ${size}px ${cs.fontFamily}`;
  const m = ctx.measureText(span.textContent);
  const inkDown = m.actualBoundingBoxDescent || size * 0.2;
  const inkUp = m.actualBoundingBoxAscent || size * 0.72;
  const fA = m.fontBoundingBoxAscent || size * 0.9;
  const fD = m.fontBoundingBoxDescent || size * 0.25;
  const lineH = parseFloat(cs.lineHeight) || size * 0.82;
  const baselineInBox = (lineH - (fA + fD)) / 2 + fD; // baseline height above the line box bottom
  const gap = Math.max(10, size * 0.05);
  heroName.style.setProperty('--name-bottom', `${(inkDown + gap - baselineInBox).toFixed(1)}px`);
  document.documentElement.style.setProperty('--name-h', `${(inkDown + gap + inkUp).toFixed(1)}px`);
}
fitName();

/* document position of an element from layout alone (transforms ignored) */
const layoutTop = (el) => {
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  return y;
};

const hudIndex = $('#hud-index');
const hudName = $('#hud-name');
const outro = $('#fly-outro');
const outroSig = $('.fly__outro-sig');
const caption = $('#fly-caption');
const storyIndex = $('#story-index');
const storyBar = $('#story-bar');
$('#story-total').textContent = String(storyCards.length).padStart(2, '0');
let outroShown = false;
let lastHud = -1;
let lastStory = -1;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function frame(time, deltaTime) {
  const y = lenis.animatedScroll;
  const heroP = clamp(y / L.vh);
  const flyP = clamp((y - L.flyStart) / L.flyRange);

  if (!document.body.classList.contains('is-loading')) {
    const o = clamp(1 - heroP * 2.4);
    heroBottom.style.opacity = o;
    heroBottom.style.transform = `translate3d(0, ${(-heroP * 60).toFixed(1)}px, 0)`;
    heroName.style.opacity = clamp(1 - heroP * 1.6);
    heroName.style.transform = `translate3d(0, ${(-heroP * 120).toFixed(1)}px, 0)`;
    heroSig.style.opacity = clamp(1 - heroP * 3) * 0.8; // bright enough for the glow to read
  }
  if (!exp) return;

  exp.scroll.heroP = heroP;
  exp.scroll.flyP = flyP;
  exp.scroll.vel = lenis.velocity;
  const active = y < L.aboutEnd + L.vh * 1.02;
  if (active !== exp.active) exp.setActive(active);
  exp.update(time, deltaTime / 1000);

  const inFly = heroP > 0.6 && flyP < 0.92;
  document.body.classList.toggle('in-fly', inFly);
  const idx = clamp(Math.floor((-exp.s.camZ - FIRST + SEG * 0.75) / SEG), 0, projects.length - 1);
  if (idx !== lastHud && projects[idx]) {
    lastHud = idx;
    hudIndex.textContent = String(idx + 1).padStart(2, '0');
    hudName.textContent = projects[idx].name;
  }

  // end of the flight: face regroups → signature draws again, About slides in beside the face
  const showOutro = flyP > 0.965 && y < L.aboutEnd + L.vh * 0.9;
  if (showOutro && !outroShown) {
    outroShown = true;
    outro.classList.add('is-visible');
    story.classList.add('is-visible');
    drawSignature(outroSig, { duration: 1.6, delay: 0.1 });
  } else if (!showOutro && outroShown && (flyP < 0.9 || y > L.aboutEnd + L.vh)) {
    outroShown = false;
    outro.classList.remove('is-visible');
    story.classList.remove('is-visible');
    storyCards.forEach((c) => c.classList.remove('is-in'));
    resetSignature(outroSig);
  }
  if (outroShown) updateStory(y, deltaTime / 1000);
  else exp.scroll.shift = 0;
}

/* About strip
 * hold phase: the face slides left, the signature makes way, the strip glides in from the right
 * run phase:  vertical scroll → sideways slide, with depth (ghost type, card parallax) and a lean on fast scrolls
 * after:      it rides up with the page into the next section */
const storyIns = storyCards.map((c) => c.querySelector('.story__in'));
const storyGhost = $('#story-ghost');
const storyTabs = [...document.querySelectorAll('.story__tabs [data-to]')];
const CHAPTER = [0, 1, 2, 2, 2, 2, 3, 4]; // card → tab
let storySkew = 0;
const ease = (t) => t * t * (3 - 2 * t);

function updateStory(y, dt) {
  const shift = ease(clamp((y - L.flyEnd) / (L.storyHold * 0.85)));
  const p = clamp((y - L.flyEnd - L.storyHold) / L.storyRun);
  const tx = p * L.storyTravel;

  exp.scroll.shift = shift;
  story.style.setProperty('--shift', shift.toFixed(4));
  outro.style.setProperty('--shift', shift.toFixed(4));

  // lean into fast scrolls, settle back when the wheel stops
  const target = clamp(-lenis.velocity * 0.09, -2.4, 2.4);
  storySkew += (target - storySkew) * (1 - Math.exp(-8 * (dt || 0.016)));
  storyTrack.style.transform = `translate3d(${(-tx).toFixed(1)}px, 0, 0) skewX(${storySkew.toFixed(3)}deg)`;
  storyGhost.style.transform = `translate3d(${(-tx * 0.32 - shift * 120).toFixed(1)}px, 0, 0)`;
  storyBar.style.transform = `scaleX(${p.toFixed(4)})`;

  // per-card depth: content trails the card a little
  const mid = L.storyWin / 2;
  for (let i = 0; i < storyCards.length; i++) {
    const left = L.cardX[i] - tx;
    const off = left + L.cardW[i] / 2 - mid;
    if (left < L.storyWin * 0.9 && left + L.cardW[i] > 0) storyCards[i].classList.add('is-in');
    if (Math.abs(off) < L.storyWin * 1.5) storyIns[i].style.transform = `translate3d(${(off * 0.045).toFixed(1)}px, 0, 0)`;
  }

  const lift = Math.max(0, y - L.aboutEnd).toFixed(1);
  story.style.setProperty('--lift', lift);
  outro.style.setProperty('--lift', lift);
  story.classList.toggle('is-done', p > 0.98);
  document.body.classList.toggle('in-story', y > L.flyEnd + L.storyHold * 0.5);

  // counter + chapter tab follow the card in the reading spot (just left of the window's middle)
  const x = tx + L.storyWin * 0.45;
  let i = 0;
  while (i < L.cardX.length - 1 && L.cardX[i + 1] <= x) i++;
  if (p > 0.995) i = storyCards.length - 1;
  if (i !== lastStory) {
    lastStory = i;
    storyIndex.textContent = String(i + 1).padStart(2, '0');
    storyTabs.forEach((t, ti) => t.classList.toggle('is-active', ti === CHAPTER[i]));
  }
}

// chapter tabs scroll to their card
storyTabs.forEach((t) =>
  t.addEventListener('click', () => {
    const i = +t.dataset.to;
    const p = L.storyTravel ? clamp((L.cardX[i] - (i ? L.storyWin * 0.08 : 0)) / L.storyTravel) : 0;
    lenis.scrollTo(L.flyEnd + L.storyHold + p * L.storyRun + 1, { duration: 1.6, easing: (k) => 1 - Math.pow(1 - k, 4) });
  }),
);
gsap.ticker.add((t, dt) => frame(t, dt));

window.addEventListener('pointermove', (e) => {
  caption.style.transform = `translate3d(${e.clientX + 18}px, ${e.clientY + 18}px, 0)`;
}, { passive: true });

let rT;
const relayout = () => {
  clearTimeout(rT);
  rT = setTimeout(() => {
    fitName();
    measure();
    exp?.resize();
    ScrollTrigger.refresh();
  }, 120);
};
window.addEventListener('resize', relayout);
// late font swaps (slow phones) change the name/copy height, so re-seat the face on the name
document.fonts?.addEventListener?.('loadingdone', relayout);

/* ───────── section reveals ───────── */
function initReveals() {
  gsap.utils.toArray('.section__head > *, .cta__title, .cta__btns, .card, .footer__sig').forEach((el) => {
    gsap.from(el, {
      y: 40,
      opacity: 0,
      duration: 1.1,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });
}

/* ───────── boot: loader → signature intro → mosaic ───────── */
const loadImage = (src) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`failed to load ${src}`));
    img.src = src;
  });

async function boot() {
  const countEl = $('#loader-count');
  const counter = { v: 0 };
  let done = 0;
  const jobs = [];
  const track = (p) => {
    jobs.push(p);
    p.then(() => {
      done++;
      gsap.to(counter, { v: (done / jobs.length) * 100, duration: 0.6, ease: 'power2.out', overwrite: true, onUpdate: () => (countEl.textContent = Math.round(counter.v)) });
    }).catch(() => {});
    return p;
  };
  const sig = track(loadSignature());
  track(document.fonts.ready);
  const assets = staticMode
    ? null
    : Promise.all([
        track(fetch('/atlas/atlas.json').then((r) => r.json())),
        track(loadImage('/atlas/atlas.webp')),
        track(loadImage('/assets/portrait-map.png')),
        track(loadImage('/assets/portrait-color.webp')),
        track(import('./scene/Experience.js')),
      ]);

  await sig;
  mountSignatures();
  await document.fonts.ready;
  fitName();
  if (heroSig) resetSignature(heroSig);

  if (assets) {
    try {
      const [atlas, atlasImage, mapImage, photoImage, { Experience }] = await assets;
      exp = new Experience({
        canvas: $('#webgl'),
        projects,
        atlas,
        atlasImage,
        mapImage,
        photoImage,
        isMobile,
        // layout position (offsetTop ignores the scroll lift on the name/copy), so the face is seated on the
        // name even when the page is opened already scrolled (scroll restoration) or resized mid-scroll
        getTextTop: () => Math.min(layoutTop(heroBottom), layoutTop(heroName)),
        labelsEl: $('#fly-labels'),
        onHover: (item) => {
          cursor.setLabel(item ? 'View' : '');
          caption.textContent = item ? `${projects[item.project].name} — ${projects[item.project].year}` : '';
          caption.classList.toggle('is-visible', !!item);
        },
        onSelect: (i) => openProject(exp.tunnel.items[i].project, i),
      });
      exp.update(0, 0); // compile shaders behind the loader
    } catch (err) {
      console.error(err);
      root.classList.add('static-mode');
      work.style.height = '';
    }
  }
  measure();

  await Promise.allSettled(jobs); // every progress tween is queued before the final one
  gsap.killTweensOf(counter);
  await gsap.to(counter, { v: 100, duration: 0.5, ease: 'power1.out', onUpdate: () => (countEl.textContent = Math.round(counter.v)) });
  const loader = $('#loader');
  loader.classList.add('is-done');
  const loaderSig = $('.loader__sig');

  {
    gsap.set(loaderSig, { opacity: 1 });
    await drawSignature(loaderSig, { duration: 1.6, delay: 0.15 });
    await gsap.to(loaderSig, { opacity: 0, y: -10, duration: 0.5, delay: 0.4, ease: 'power2.in' }); // let the ink sit for a beat
  }
  exp?.intro();
  document.body.classList.remove('is-loading');
  lenis.start();
  gsap.fromTo(
    '.header, .hero__bottom',
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 1.1, stagger: 0.08, ease: 'power3.out', delay: exp ? 1.0 : 0.1, clearProps: 'transform,opacity' },
  );
  gsap.fromTo(heroName, { opacity: 0 }, { opacity: 1, duration: 0.01, delay: exp ? 0.6 : 0, clearProps: 'opacity' });
  gsap.fromTo(heroName.firstElementChild, { yPercent: 110 }, { yPercent: 0, duration: 1.6, ease: 'expo.out', delay: exp ? 0.6 : 0 });
  // the big grey signature line slowly writes itself across the hero
  drawSignature(heroSig, { duration: 2.2, delay: exp ? 0.5 : 0.2 });
  await gsap.to(loader, { opacity: 0, duration: 0.8, ease: 'power2.out' });
  loader.remove();
  drawSignature($('.header__logo'), { duration: 1.6 });
  // full-page strips that make the fly-through tiles scroll like real sites (not needed for first paint)
  if (exp) {
    fetch('/atlas/scroll.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((scroll) => scroll && loadImage(`/atlas/scroll.webp?v=${scroll.version}`).then((img) => exp.setScroll(scroll, img)))
      .catch(() => {});
  }

  initReveals();
  ScrollTrigger.refresh();
  if (params.get('open') === 'contact') openPanel(contactPanel, 'input[name=name]');
}

boot();
