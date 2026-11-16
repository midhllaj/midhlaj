import { site } from '../config.js';

const SOCIALS = {
  ig: ['Instagram', 'instagram'],
  li: ['LinkedIn', 'linkedin'],
  gh: ['GitHub', 'github'],
  wa: ['WhatsApp', null],
};

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Everything that depends on projects.json / config.js is rendered here. */
export function renderContent(projects, { onCard }) {
  document.querySelectorAll('[data-status]').forEach((e) => (e.textContent = site.status));
  document.querySelectorAll('[data-year]').forEach((e) => (e.textContent = new Date().getFullYear()));
  document.querySelectorAll('[data-count]').forEach((e) => (e.textContent = projects.length));
  document.getElementById('hud-total').textContent = String(projects.length).padStart(2, '0');
  document.querySelectorAll('[data-email]').forEach((a) => {
    a.href = `mailto:${site.email}`;
    a.textContent = site.email;
  });
  document.querySelectorAll('[data-phone]').forEach((a) => {
    if (!site.phone) return a.remove();
    a.href = `tel:${site.phone}`;
    if (!a.textContent.trim()) a.textContent = site.phoneLabel || site.phone;
  });

  document.querySelectorAll('[data-socials]').forEach((box) => {
    const keys = (box.dataset.socials || 'ig,li,gh,wa').split(',');
    box.innerHTML = '';
    keys.forEach((k) => {
      const [label, key] = SOCIALS[k];
      const href = k === 'wa' ? (site.whatsapp ? `https://wa.me/${site.whatsapp}` : '') : site.socials[key];
      if (!href) return; // not set in src/config.js yet: leave it out rather than show a dead link
      const a = el('a', null, label);
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      box.appendChild(a);
    });
  });

  // selected work (featured)
  const cards = document.getElementById('cards');
  cards.innerHTML = '';
  projects.forEach((p, i) => {
    if (!p.featured) return;
    const cover = (p.screenshots || []).find((f) => f.startsWith('desktop')) || p.screenshots?.[0];
    const a = el('a', 'card');
    a.href = p.url;
    a.dataset.cursor = 'Fly in';
    a.setAttribute('aria-label', `${p.name} — open in the fly-through`);
    const media = el('div', 'card__media');
    if (cover) {
      const img = new Image();
      img.src = `/shots/${p.id}/${cover}`;
      img.alt = `${p.name} screenshot`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 1200;
      img.height = 750;
      media.appendChild(img);
    }
    const meta = el('div', 'card__meta');
    meta.append(el('span', 'card__name', p.name), el('span', 'label card__cat', p.category), el('span', 'label', String(p.year)));
    a.append(media, meta);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      onCard(i);
    });
    cards.appendChild(a);
  });

  // about lists
  document.querySelectorAll('[data-list]').forEach((ul) => {
    ul.innerHTML = '';
    site[ul.dataset.list].forEach((s) => ul.appendChild(el('li', null, s)));
  });

  // static / reduced-motion grid
  const grid = document.getElementById('fly-grid');
  grid.innerHTML = '';
  projects.forEach((p, i) => {
    const cover = (p.screenshots || []).find((f) => f.startsWith('desktop'));
    const a = el('a', 'card');
    a.href = p.url;
    a.id = `work-${p.id}`;
    const media = el('div', 'card__media');
    if (cover) {
      const img = new Image();
      img.src = `/thumbs/${p.id}/${cover}`;
      img.alt = `${p.name} screenshot`;
      img.loading = 'lazy';
      media.appendChild(img);
    }
    a.append(media, el('h3', null, p.name), el('span', 'label', `${p.category} · ${p.year}`));
    a.addEventListener('click', (e) => {
      e.preventDefault();
      onCard(i, { fromGrid: true });
    });
    grid.appendChild(a);
  });
}
