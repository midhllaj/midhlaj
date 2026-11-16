/**
 * The portrait photo is cropped at the sides, so the shirt ends in hard vertical edges.
 * This widens the face grid by `pad` columns per side and grows the shoulders outwards in a
 * diagonal slope, continuing the shirt's tone from the photo edge and darkening slightly towards
 * the outline so they read as rounded. Pure JS — shared by the browser and scripts/render-mosaic.js.
 *
 * cells: [{ b, a }] row-major, cols × rows  →  { cells, cols, pad }
 */
export function extendShoulders(cells, cols, rows, { padFrac = 0.42, minRowFrac = 0.6, slope = 1.5 } = {}) {
  const pad = Math.round(cols * padFrac);
  const C = cols + pad * 2;
  const out = new Array(C * rows);
  for (let i = 0; i < out.length; i++) out[i] = { b: 0, a: 0 };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out[r * C + c + pad] = cells[r * cols + c];

  let seed = 29;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const filled = (r, c) => cells[r * cols + c].a > 0.45;

  for (const side of [-1, 1]) {
    const edgeC = side < 0 ? 0 : cols - 1;
    // first row (below the face) where the shirt reaches this side of the photo
    let rTouch = -1;
    for (let r = Math.floor(rows * minRowFrac); r < rows; r++) {
      if (filled(r, edgeC) && filled(r, edgeC - side) && filled(r, edgeC - 2 * side)) { rTouch = r; break; }
    }
    if (rTouch < 0) continue;
    let lastB = 0.6;
    for (let r = rTouch; r < rows; r++) {
      // tone to continue: average of the 3 cells nearest the edge
      let sum = 0, n = 0;
      for (let k = 0; k < 3; k++) {
        const cc = edgeC - k * side;
        if (filled(r, cc)) { sum += cells[r * cols + cc].b; n++; }
      }
      const baseB = n ? sum / n : lastB;
      lastB = baseB;
      const ext = Math.min(pad, Math.round((r - rTouch + 1) * slope)); // same shoulder angle on both sides
      for (let k = 1; k <= ext; k++) {
        const t = k / (ext + 0.5); // 0 next to the photo → 1 at the outline
        const b = Math.min(1, Math.max(0, baseB * (1 - 0.5 * t * t) + (rnd() - 0.5) * 0.12));
        const c = side < 0 ? pad - k : pad + cols - 1 + k;
        out[r * C + c] = { b, a: k === ext ? 0.6 : 1 };
      }
    }
  }
  return { cells: out, cols: C, pad };
}
