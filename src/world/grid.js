// Grid helpers. Cells are indexed i = y * w + x.
import {T, WALKABLE} from '../data/terrain.js';
import {clamp} from '../core/util.js';

export const inBounds = (w, x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h;
export const walkable = (w, i) => WALKABLE[w.grid.terr[i]] === 1;
export const cellOf = (w, a) => clamp(a.y | 0, 0, w.h - 1) * w.w + clamp(a.x | 0, 0, w.w - 1);
export const isCampArea = (w, i) => Math.abs((i % w.w) - w.camp.x) <= 3 && Math.abs(((i / w.w) | 0) - w.camp.y) <= 3;
export const distToCamp2 = (w, i) => ((i % w.w) - w.camp.x) ** 2 + (((i / w.w) | 0) - w.camp.y) ** 2;

// 8 neighbours: the first four are orthogonal
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
