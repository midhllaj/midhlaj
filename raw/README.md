# Source photos (not deployed)

Drop your originals here, then run `npm run assets`:

| File | What |
|---|---|
| `signature.strokes.json` | Centre-line trace of the signature, one point list per pen stroke (used first) |
| `signature.jpg` (or .png) | Photo/scan of the signature on white paper (fallback, traced with potrace) |
| `portrait.jpg` (or .png) | The black & white portrait |
| `portrait-cutout.png` *(optional)* | Your own background-removed portrait with transparency (skips automatic removal) |
| `portrait.crop.json` *(optional)* | Manual head-and-shoulders crop in source pixels: `{ "left": 0, "top": 0, "width": 800, "height": 1030 }` (keep ≈ 7:9) |

Photos in this folder are git-ignored.
