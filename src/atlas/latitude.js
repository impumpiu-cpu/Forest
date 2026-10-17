// Latitude of a row. The setting «Широты» (data/geology.js HEMISPHERES) decides where the equator lies:
//   north   — the top edge is the pole, the bottom edge the equator (one hemisphere);
//   equator — the equator across the middle, the north pole at the top edge, the south one at the bottom.

// signed latitude in degrees: + north, − south
export function latitude(a, y) {
  const t = y / (a.h - 1);
  return a.cfg.hemisphere === 'equator' ? 90 * (1 - 2 * t) : 90 * (1 - t);
}

// 0 at the pole, 1 at the equator
export const warmth = (a, y) => 1 - Math.abs(latitude(a, y)) / 90;

// which way is the equator from a row: +1 down the map, −1 up, 0 on it
export const towardEquator = (a, y) => Math.sign(latitude(a, y));
