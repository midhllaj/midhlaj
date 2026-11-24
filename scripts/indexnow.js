/**
 * Tell Bing, Yandex, Seznam and Naver (IndexNow) that the site changed, so they recrawl it soon.
 * Run after a deploy is live:  npm run indexnow
 * The key file public/<KEY>.txt must be live at the site root for the ping to be accepted.
 */
const SITE = 'https://www.midhlaj.co';
const KEY = 'e990cb95c9d05711b2b99817a3cd7663';

const sitemap = await fetch(`${SITE}/sitemap.xml`).then((r) => r.text());
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith(SITE));

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URL(s): ${urlList.join(', ')}`);
if (!res.ok && res.status !== 202) process.exitCode = 1;
