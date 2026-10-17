// Latitude of a row: 0 at the pole, 1 at the equator. The setting «Широты» (data/geology.js HEMISPHERES)
// decides where the equator lies.
export function warmth(a, y) {
  const t = y / (a.h - 1);
  return a.cfg.hemisphere === 'equator' ? 1 - Math.abs(2 * t - 1) : t;
}
