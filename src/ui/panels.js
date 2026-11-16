import { site, whatsappUrl } from '../config.js';
import { currencyGroups, budgetTiers } from '../data/currencies.js';

const stack = [];
let hooks = { onOpen() {}, onClose() {} };
export function setPanelHooks(h) {
  hooks = { ...hooks, ...h };
}

export function openPanel(el, focusSel) {
  if (!el.hidden && el.classList.contains('is-open')) return;
  const prev = document.activeElement;
  el.hidden = false;
  el._prevFocus = prev;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  stack.push(el);
  hooks.onOpen(el);
  setTimeout(() => (el.querySelector(focusSel) || el.querySelector('.panel__close'))?.focus({ preventScroll: true }), 350);
}

export function closePanel(el = stack[stack.length - 1]) {
  if (!el || el.hidden) return;
  el.classList.remove('is-open');
  stack.splice(stack.indexOf(el), 1);
  setTimeout(() => {
    if (!el.classList.contains('is-open')) el.hidden = true;
  }, 700);
  el._prevFocus?.focus?.({ preventScroll: true });
  hooks.onClose(el);
}

export const anyPanelOpen = () => stack.length > 0;

export function initPanels() {
  document.querySelectorAll('.panel').forEach((p) =>
    p.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closePanel(p);
    }),
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) closePanel();
    // simple focus trap
    if (e.key === 'Tab' && stack.length) {
      const panel = stack[stack.length - 1];
      const f = [...panel.querySelectorAll('a[href], button, input, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
}

/* ───────── project panel ───────── */

export function fillProjectPanel(projects, index, onNext) {
  const p = projects[index];
  const $ = (id) => document.getElementById(id);
  $('pp-index').textContent = `${String(index + 1).padStart(2, '0')} / ${String(projects.length).padStart(2, '0')}`;
  $('pp-name').textContent = p.name;
  $('pp-meta').innerHTML = '';
  [['Category', p.category], ['Year', p.year]].filter(([, v]) => v).forEach(([k, v]) => {
    const d = document.createElement('div');
    d.innerHTML = '<dt></dt><dd></dd>';
    d.children[0].textContent = k;
    d.children[1].textContent = v;
    $('pp-meta').appendChild(d);
  });
  $('pp-desc').textContent = p.description;
  $('pp-tech').innerHTML = '';
  (p.tech || []).forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    $('pp-tech').appendChild(li);
  });
  const visit = $('pp-visit');
  visit.href = p.url;
  const store = /apps\.apple\.com/.test(p.url) ? 'App Store' : /play\.google\.com/.test(p.url) ? 'Google Play' : '';
  visit.textContent = store ? `View on ${store} ↗` : 'Visit site ↗';
  visit.setAttribute('aria-label', `${store ? `View ${p.name} on ${store}` : `Visit ${p.name}`} (opens in a new tab)`);
  const shots = $('pp-shots');
  shots.innerHTML = '';
  const files = p.screenshots || [];
  const ordered = [...files.filter((f) => f.startsWith('desktop')).slice(0, 3), ...files.filter((f) => f.startsWith('mobile')).slice(0, 3)];
  ordered.forEach((f, i) => {
    const img = new Image();
    img.src = `/shots/${p.id}/${f}`;
    img.alt = `${p.name} — ${f.startsWith('mobile') ? 'mobile' : 'desktop'} screenshot ${i + 1}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.className = f.startsWith('mobile') ? 'is-mobile' : 'is-desktop';
    shots.appendChild(img);
  });
  const next = $('pp-next');
  const ni = (index + 1) % projects.length;
  next.textContent = `Next: ${projects[ni].name} →`;
  next.onclick = () => onNext(ni);
  $('project-panel').querySelector('.panel__body').scrollTop = 0;
}

/* ───────── contact panel ───────── */

export function initContact() {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');
  const needs = ['Website', 'E-commerce', 'Web app / dashboard', 'Mobile app', 'UI/UX design', 'Something else'];
  const needBox = form.querySelector('[data-chips="need"]');
  const budgetBox = form.querySelector('[data-chips="budget"]');
  const chosen = { need: new Set(), budget: '' };

  const chip = (text, group) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = text;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      if (group === 'need') {
        chosen.need.has(text) ? chosen.need.delete(text) : chosen.need.add(text);
        b.setAttribute('aria-pressed', chosen.need.has(text));
      } else {
        chosen.budget = chosen.budget === text ? '' : text;
        budgetBox.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c.textContent === chosen.budget));
      }
    });
    return b;
  };
  needs.forEach((n) => needBox.appendChild(chip(n, 'need')));

  // currency picker: USD first, then INR, then Arab currencies, then the rest
  const currencySelect = form.querySelector('#currency-select');
  currencyGroups.forEach((g) => {
    const group = document.createElement('optgroup');
    group.label = g.label;
    g.items.forEach(([code, name]) => group.appendChild(new Option(`${code} · ${name}`, code)));
    currencySelect.appendChild(group);
  });
  currencySelect.value = 'USD';
  const renderBudgets = () => {
    budgetBox.innerHTML = '';
    chosen.budget = '';
    budgetTiers(currencySelect.value, site.budgets).forEach((b) => budgetBox.appendChild(chip(b, 'budget')));
  };
  currencySelect.addEventListener('change', renderBudgets);
  renderBudgets();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let bad = false;
    ['name', 'email'].forEach((k) => {
      const input = form.elements[k];
      const invalid = !input.value.trim() || (k === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value));
      input.setAttribute('aria-invalid', invalid);
      if (invalid) bad = true;
    });
    if (bad) {
      status.className = 'form__status is-error';
      status.textContent = 'Please add your name and a valid email.';
      return;
    }
    const brief = {
      ...data,
      need: [...chosen.need].join(', ') || '—',
      budget: chosen.budget ? `${chosen.budget} (${data.currency})` : '—',
      _subject: `New project enquiry from ${data.name}`,
    };
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    status.className = 'form__status';
    status.textContent = 'Sending…';
    try {
      if (!site.formspreeId) throw new Error('no-endpoint');
      const res = await fetch(`https://formspree.io/f/${site.formspreeId}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(brief),
      });
      if (!res.ok) throw new Error('send-failed');
      form.reset();
      chosen.need.clear();
      form.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      status.className = 'form__status is-ok';
      status.textContent = "Thank you. Your enquiry has been received and I'll reply within one working day.";
    } catch (err) {
      // no form endpoint configured (or it failed): hand the brief to the visitor's email app
      const body = `Name: ${brief.name}\nEmail: ${brief.email}\nCompany: ${brief.company || '—'}\nNeed: ${brief.need}\nBudget: ${brief.budget}\n\n${brief.message || ''}`;
      window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(brief._subject)}&body=${encodeURIComponent(body)}`;
      status.className = 'form__status';
      status.textContent = 'Opening your email app with your enquiry…';
    } finally {
      btn.disabled = false;
    }
  });

  document.querySelectorAll('[data-whatsapp]').forEach((a) => (a.href = whatsappUrl()));
}
