import { gsap } from 'gsap';

/** Dot cursor that grows over links/buttons/tiles. Returns a small API for the 3D scene. */
export function initCursor() {
  const el = document.querySelector('.cursor');
  if (!el || window.matchMedia('(hover: none)').matches) return { setLabel() {}, setHover() {} };
  const label = el.querySelector('.cursor__label');
  const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3' });
  let sceneLabel = '';

  window.addEventListener('pointermove', (e) => {
    xTo(e.clientX);
    yTo(e.clientY);
    el.classList.add('is-visible');
  }, { passive: true });
  document.addEventListener('pointerleave', () => el.classList.remove('is-visible'));

  const sel = 'a, button, [data-cursor], .chip, input, textarea';
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest(sel);
    if (!t) return;
    const text = t.dataset.cursor;
    if (text) {
      label.textContent = text;
      el.classList.add('is-label');
    } else el.classList.add('is-hover');
  });
  document.addEventListener('pointerout', (e) => {
    const t = e.target.closest(sel);
    if (!t) return;
    el.classList.remove('is-hover');
    if (!sceneLabel) el.classList.remove('is-label');
  });

  return {
    setLabel(text) {
      sceneLabel = text || '';
      if (text) {
        label.textContent = text;
        el.classList.add('is-label');
      } else el.classList.remove('is-label');
    },
  };
}
