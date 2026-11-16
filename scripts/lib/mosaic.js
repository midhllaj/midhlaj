/**
 * Shared mosaic math — used by the Node static renderer and mirrored in the GLSL shader
 * (src/scene/shaders.js). Keep the two in sync.
 */

/** Map a tile pixel (0..1 luminance) onto the target cell brightness. */
export function tint(cellB, tileLum, tileRGB) {
  // Cell brightness sets the tone; the screenshot contributes texture/detail around it.
  const detail = (tileLum - 0.5) * 0.38;
  const g = Math.min(1, Math.max(0, cellB * 1.02 + detail * (0.35 + cellB)));
  // keep a whisper of the original colour
  return tileRGB.map((c) => Math.min(1, Math.max(0, g * 0.88 + c * cellB * 0.12)));
}

/** Contrast curve applied to the sampled portrait brightness before tinting. */
export function shapeBrightness(b) {
  const c = Math.min(1, Math.max(0, (b - 0.06) / 0.9));
  return Math.pow(c, 0.9);
}
