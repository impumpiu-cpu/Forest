// Grid helpers. Cells are indexed i = y * w + x.
import {T, WALKABLE} from '../data/terrain.js';
import {clamp} from '../core/util.js';

export const inBounds = (w, x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h;
// a point (fractional coordinates) on the map; inBounds(w, x | 0, y | 0) would let −0.3 through, since −0.3 | 0 is 0
export const inMap = (w, x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h;
export const walkable = (w, i) => WALKABLE[w.grid.terr[i]] === 1;
export const cellOf = (w, a) => clamp(a.y | 0, 0, w.h - 1) * w.w + clamp(a.x | 0, 0, w.w - 1);
export const isCampArea = (w, i) => Math.abs((i % w.w) - w.camp.x) <= 3 && Math.abs(((i / w.w) | 0) - w.camp.y) <= 3;
export const distToCamp2 = (w, i) => ((i % w.w) - w.camp.x) ** 2 + (((i / w.w) | 0) - w.camp.y) ** 2;

// 8 neighbours: the first four are orthogonal
// one step from cell i to its neighbour j: j walkable and, for a diagonal, both side cells walkable too
// (nobody squeezes between two rocks touching at a corner). The flow fields, A*, the straight walk
// and the flow-field walk all go by this one rule.
export function canStep(w, i, j) {
  if (!WALKABLE[w.grid.terr[j]]) return false;
  const xi = i % w.w, yi = (i / w.w) | 0, xj = j % w.w, yj = (j / w.w) | 0;
  if (xi === xj || yi === yj) return true;
  return WALKABLE[w.grid.terr[yi * w.w + xj]] === 1 && WALKABLE[w.grid.terr[yj * w.w + xi]] === 1;
}

export const DX = [1, -1, 0, 0, 1, 1, -1, -1];
export const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export function nextToRock(w, i) {
  if (!walkable(w, i)) return false;
  const x = i % w.w, y = (i / w.w) | 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k], ny = y + DY[k];
    if (inBounds(w, nx, ny) && w.grid.terr[ny * w.w + nx] === T.ROCK) return true;
  }
  return false;
}
