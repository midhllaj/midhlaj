/**
 * Personal details — edit here. Everything about the WORK lives in src/data/projects.json.
 * Empty strings are fine: links fall back gracefully.
 */
export const site = {
  name: 'Midhlaj',
  role: 'Designer & Developer',
  status: 'Taking on new projects',
  email: 'midhlaj268@gmail.com',
  whatsapp: '918714801971', // digits only, international format (91 = India)
  phone: '+918714801971', // for tap-to-call links
  phoneLabel: '+91 87148 01971',
  socials: {
    instagram: 'https://www.instagram.com/midhlaj.co_/', // full URLs; empty ones are hidden
    linkedin: 'https://www.linkedin.com/in/mohammed-midhlaj-a10215365/',
    github: 'https://github.com/midhllaj',
  },
  // Contact form: create a free form at https://formspree.io and paste its ID (the part after /f/).
  // Leave empty and "Send enquiry" opens the visitor's email app with the brief pre-filled instead.
  formspreeId: '',
  services: ['Website design & development', 'E-commerce', 'Web apps & dashboards', 'iOS & Android apps', 'UI/UX design', 'Motion & interaction design'],
  // Budget chips in the contact form. `usd` is the default; every other currency is converted
  // from it and rounded (rates in src/data/currencies.js). Set your own figures per currency in `fixed`.
  budgets: {
    usd: [500, 1000, 2500],
    fixed: {
      INR: [30000, 75000, 150000],
      AED: [1500, 3500, 7000],
    },
  },
};

export const whatsappUrl = (text = "Hi Midhlaj, I'd like to discuss a project.") =>
  site.whatsapp ? `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}` : `mailto:${site.email}`;
