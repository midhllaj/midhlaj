import { gsap } from 'gsap';

let svgText = '';

/** The pen-ink layer, unless this slot hides it in CSS (too small for thick-and-thin, or a line-only design). */
function inkFill(svg) {
  const fill = svg.querySelector('.sig-fill');
  return fill && getComputedStyle(fill).display !== 'none' ? fill : null;
}

export async function loadSignature() {
  svgText = await fetch('/assets/signature.svg').then((r) => r.text());
  return svgText;
}

/** Inject the signature into every [data-signature] slot and size its strokes. */
export function mountSignatures() {
  document.querySelectorAll('[data-signature]').forEach((el) => {
    el.innerHTML = svgText;
    const svg = el.querySelector('svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    // static state: show the ink when this slot has it, otherwise the line
    if (inkFill(svg)) svg.querySelector('.sig-strokes').style.opacity = 0;
  });
  sizeStrokes();
  window.addEventListener('resize', sizeStrokes);
}

/** Keep stroke width at ~N screen px regardless of how big the signature renders. */
function sizeStrokes() {
  document.querySelectorAll('[data-signature] svg').forEach((svg) => {
    const host = svg.parentElement;
    const px = parseFloat(host.dataset.sigPx || getComputedStyle(host).getPropertyValue('--sig-px')) || 1.6;
    const vbW = svg.viewBox.baseVal.width || 600;
    const w = svg.getBoundingClientRect().width || 100;
    const sw = (px * vbW) / w;
    svg.querySelectorAll('.sig-strokes path').forEach((p) => {
      p.style.strokeWidth = p.classList.contains('dot') ? sw * 2.4 : sw;
    });
  });
}

/** Hide strokes ready for drawing. */
export function resetSignature(host) {
  const svg = host.querySelector('svg');
  if (!svg) return;
  const fill = inkFill(svg);
  const strokes = svg.querySelector('.sig-strokes');
  gsap.killTweensOf(svg.querySelectorAll('path, .sig-strokes'));
  strokes.style.opacity = 1;
  if (fill) fill.style.opacity = 0;
  svg.querySelectorAll('.sig-strokes path').forEach((p) => {
    const len = p.getTotalLength() + 1;
    p.style.strokeDasharray = `${len} ${len}`;
    p.style.strokeDashoffset = len;
  });
}

/** Draw the signature stroke by stroke (stroke-dashoffset), ~duration seconds in total. */
export function drawSignature(host, { duration = 2.5, delay = 0 } = {}) {
  const svg = host.querySelector('svg');
  if (!svg) return gsap.timeline();
  resetSignature(host);
  const paths = [...svg.querySelectorAll('.sig-strokes path')];
  const lens = paths.map((p) => p.getTotalLength() + 1);
  const total = lens.reduce((a, b) => a + b, 0);
  const tl = gsap.timeline({ delay });
  paths.forEach((p, i) => {
    tl.to(p, { strokeDashoffset: 0, duration: Math.max(0.06, (duration * lens[i]) / total), ease: 'power1.inOut' }, i ? '>-0.02' : 0);
  });
  const fill = inkFill(svg);
  if (fill) {
    // the line settles into pen ink: thick downstrokes, light upstrokes, tapered ends
    tl.to(fill, { opacity: 1, duration: 0.9, ease: 'power2.out' }, '>-0.15');
    tl.to(svg.querySelector('.sig-strokes'), { opacity: 0, duration: 0.9, ease: 'power2.in' }, '<');
  }
  return tl;
}
