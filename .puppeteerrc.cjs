// Skip the Chrome download on Vercel / CI — screenshots are taken locally with `npm run shots`.
module.exports = { skipDownload: !!(process.env.VERCEL || process.env.CI) };
