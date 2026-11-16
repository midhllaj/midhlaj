import { defineConfig } from 'vite';
import { TITLE, DESCRIPTION, faqHtml, jsonLd, robotsTxt, sitemapXml, llmsTxt } from './src/data/seo.js';

// Absolute site URL for canonical / Open Graph tags, the sitemap and structured data.
// On Vercel it comes from the project's production domain automatically; override with SITE_URL=https://…
const siteUrl = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
  'https://midhlaj-tawny.vercel.app'
).replace(/\/$/, '');

// Google Search Console "HTML tag" verification: set GOOGLE_SITE_VERIFICATION to the content="…" value
// (in Vercel → Settings → Environment Variables), then redeploy.
const verify = process.env.GOOGLE_SITE_VERIFICATION
  ? `<meta name="google-site-verification" content="${process.env.GOOGLE_SITE_VERIFICATION}" />`
  : '';

const files = { 'robots.txt': robotsTxt, 'sitemap.xml': sitemapXml, 'llms.txt': llmsTxt };
const types = { txt: 'text/plain; charset=utf-8', xml: 'application/xml; charset=utf-8' };

export default defineConfig({
  plugins: [
    {
      name: 'seo',
      transformIndexHtml: (html) =>
        html
          .replaceAll('__TITLE__', TITLE)
          .replaceAll('__DESCRIPTION__', DESCRIPTION)
          .replace('<!--SEO:VERIFY-->', verify)
          .replace('<!--SEO:JSONLD-->', `<script type="application/ld+json">${jsonLd(siteUrl)}</script>`)
          .replace('<!--SEO:FAQ-->', faqHtml())
          .replaceAll('__SITE_URL__', siteUrl),
      // dev server: serve the generated files too
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const name = req.url?.split('?')[0].slice(1);
          if (!files[name]) return next();
          res.setHeader('Content-Type', types[name.split('.').pop()]);
          res.end(files[name](siteUrl));
        });
      },
      generateBundle() {
        for (const [fileName, make] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source: make(siteUrl) });
      },
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
