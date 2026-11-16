import { defineConfig } from 'vite';

// Absolute site URL for canonical / Open Graph tags.
// On Vercel it is picked up automatically; override with SITE_URL=https://your-domain.com
const siteUrl = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
).replace(/\/$/, '');

export default defineConfig({
  plugins: [
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
    },
  ],
  build: {
    target: 'es2020',
    assetsDir: '_app',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], gsap: ['gsap', 'gsap/ScrollTrigger', 'lenis'] },
      },
    },
  },
});
