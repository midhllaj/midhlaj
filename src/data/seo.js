/**
 * Search (SEO) and answer-engine (AEO) content, built into index.html at build time by vite.config.js:
 * the visible FAQ section, the JSON-LD structured data, robots.txt, sitemap.xml and llms.txt.
 * Edit the FAQ answers here; contact details and work come from src/config.js and projects.json.
 */
import { site } from '../config.js';
import projects from './projects.json';

export const TITLE = 'Midhlaj | Website Developer & Designer: Web & Mobile Apps';
export const DESCRIPTION =
  'Midhlaj is a website developer and designer in India building fast websites, online stores, web apps and iOS & Android apps for businesses worldwide.';

const list = (items) => items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
// public websites after the two apps (private client tools have no url and are described separately)
const work = projects.slice(2).filter((p) => p.url).map((p) => p.name);

export const faq = [
  {
    q: 'Who is Midhlaj?',
    a: `Midhlaj is a website developer and designer based in India. Midhlaj designs and builds websites, online stores, web apps and iOS and Android apps for businesses, startups and founders around the world, taking each project from the first idea to launch day. Midhlaj's portfolio, work and contact details are at midhlaj.co.`,
  },
  {
    q: 'What services does Midhlaj offer?',
    a: `${list(site.services)}. Every project is designed and developed by the same person, so the finished site or app looks the way it was designed and works properly on every screen.`,
  },
  {
    q: 'What has Midhlaj built?',
    a: `Projects include Linaul, a platform for trucking companies with a web dashboard, operator and driver apps and live GPS tracking; Nudge, an iOS focus timer and app blocker; an estimate and invoice generator for an event planning company; and websites for ${list(work)}.`,
  },
  {
    q: 'How much does a website cost?',
    a: `It depends on the size of the project. Website budgets usually start from about $${site.budgets.usd[0]} (₹${site.budgets.fixed.INR[0].toLocaleString('en-IN')} in India or AED ${site.budgets.fixed.AED[0].toLocaleString('en-US')} in the UAE). Online stores, web apps and mobile apps cost more. Send a short brief to get a quote for your project.`,
  },
  {
    q: 'Does Midhlaj work with clients outside India?',
    a: 'Yes. Midhlaj works remotely with clients worldwide, including India, the UAE and further afield, and can quote in your currency.',
  },
  {
    q: 'How does a project work?',
    a: 'Four steps: strategy (goals, audience and scope agreed up front), design (interfaces, motion and clickable prototypes), build (fast, accessible code for the web, iOS and Android) and launch (testing, deployment and handover).',
  },
  {
    q: 'How do I hire Midhlaj?',
    a: `Use the "Start a project" form on this site, message on WhatsApp or call ${site.phoneLabel}, or email ${site.email}.`,
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The visible FAQ list (crawlable without JavaScript). */
export function faqHtml() {
  return faq
    .map(
      ({ q, a }, i) =>
        `<details class="faq__item"${i === 0 ? ' open' : ''}><summary><h3>${esc(q)}</h3></summary><p>${esc(a)}</p></details>`,
    )
    .join('\n            ');
}

/** schema.org graph: who Midhlaj is, the service, the work and the FAQ. */
export function jsonLd(url) {
  const person = `${url}/#person`;
  const sameAs = Object.values(site.socials).filter(Boolean);
  const graph = [
    {
      '@type': 'Person',
      '@id': person,
      name: site.name,
      alternateName: ['Mohammed Midhlaj', 'Midhllaj', 'midhllaj', 'midhlaj.co', 'midhlaj.co_'],
      jobTitle: 'Website Developer & Designer',
      description: DESCRIPTION,
      url: `${url}/`,
      image: `${url}/assets/about.webp`,
      email: `mailto:${site.email}`,
      telephone: site.phone,
      address: { '@type': 'PostalAddress', addressCountry: 'IN' },
      knowsAbout: ['Web development', 'Website design', 'Web design', 'UI/UX design', 'E-commerce', 'Web applications', 'iOS development', 'Android development', 'SwiftUI', 'JavaScript', 'three.js', 'Motion design'],
      ...(sameAs.length && { sameAs }),
    },
    {
      '@type': 'WebSite',
      '@id': `${url}/#website`,
      url: `${url}/`,
      name: site.name,
      alternateName: ['midhlaj.co', 'Midhlaj, Website Developer & Designer'],
      inLanguage: 'en',
      publisher: { '@id': person },
    },
    {
      '@type': 'ProfilePage',
      '@id': `${url}/#webpage`,
      url: `${url}/`,
      name: TITLE,
      description: DESCRIPTION,
      inLanguage: 'en',
      isPartOf: { '@id': `${url}/#website` },
      mainEntity: { '@id': person },
      primaryImageOfPage: `${url}/og.jpg`,
      dateModified: new Date().toISOString().slice(0, 10),
    },
    {
      '@type': 'ProfessionalService',
      '@id': `${url}/#service`,
      name: 'Midhlaj: Website Design & Development',
      description: DESCRIPTION,
      url: `${url}/`,
      image: `${url}/og.jpg`,
      email: site.email,
      telephone: site.phone,
      founder: { '@id': person },
      address: { '@type': 'PostalAddress', addressCountry: 'IN' },
      areaServed: 'Worldwide',
      availableLanguage: 'English',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Services',
        itemListElement: site.services.map((name) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name, provider: { '@id': person } } })),
      },
    },
    {
      '@type': 'ItemList',
      name: 'Selected work by Midhlaj',
      itemListElement: projects.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: { '@type': 'CreativeWork', name: p.name, url: p.url, description: p.description, genre: p.category, creator: { '@id': person } },
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}/#faq`,
      mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];
  // escape "<" so no answer text can close the script tag
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function robotsTxt(url) {
  return `# Search engines and AI answer engines are welcome.\nUser-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n`;
}

export function sitemapXml(url) {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${url}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
    <image:image><image:loc>${url}/og.jpg</image:loc></image:image>
  </url>
</urlset>
`;
}

/** llms.txt: a plain summary for AI assistants (ChatGPT, Perplexity, Claude, Gemini). */
export function llmsTxt(url) {
  const socials = Object.entries(site.socials).filter(([, v]) => v).map(([k, v]) => `- ${k[0].toUpperCase() + k.slice(1)}: ${v}`);
  return `# Midhlaj

> ${DESCRIPTION}

Website: ${url}/

## About
Midhlaj is a website developer and designer based in India who works with clients worldwide. Midhlaj designs and develops every project end to end: websites, online stores, web apps and dashboards, and iOS and Android apps.

## Services
${site.services.map((s) => `- ${s}`).join('\n')}

## Work
${projects.map((p) => `- ${p.url ? `[${p.name}](${p.url})` : p.name} (${p.category}): ${p.description}`).join('\n')}

## FAQ
${faq.map(({ q, a }) => `### ${q}\n${a}`).join('\n\n')}

## Contact
- Email: ${site.email}
- WhatsApp / phone: ${site.phoneLabel}
${socials.join('\n')}
`;
}
