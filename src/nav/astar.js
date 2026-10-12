// Point-to-point paths around water and rocks (A* on the grid, 8 directions, no corner cutting).
// Flow fields cover shared targets (camp, berries, prey…); this covers one agent chasing one
// moving target or walking to a spot of its own. Buffers are allocated once per world and reused.
import {BY_CODE, WALKABLE} from '../data/terrain.js';
import {DX, DY} from '../world/grid.js';

const SQRT2 = Math.SQRT2;

function buffers(w) {
  if (w.astar) return w.astar;
  const n = w.n;
  return (w.astar = {g: new Float32Array(n), seen: new Int32Array(n), parent: new Int32Array(n),
    heapI: new Int32Array(n * 8), heapF: new Float32Array(n * 8), stamp: 0});
}

// line of sight between two points over walkable cells only (the straight walk is safe)
export function clearLine(w, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
  for (let s = 1; s <= steps; s++) {
    const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
    if (x < 0 || y < 0 || x >= w.w || y >= w.h || !WALKABLE[w.grid.terr[(y | 0) * w.w + (x | 0)]]) return false;
  }
  return true;
}

// cells from start to goal (excluding start), or null when the goal cannot be reached within `budget` expansions
export function findPath(w, sx, sy, gx, gy, budget = 6000) {
  const W = w.w, H = w.h, terr = w.grid.terr, b = buffers(w);
  const start = (sy | 0) * W + (sx | 0);
  let goal = (gy | 0) * W + (gx | 0);
  if (!WALKABLE[terr[goal]]) {   // aim at the nearest walkable cell next to an unwalkable goal
    let best = -1, bd = Infinity; const x = gx | 0, y = gy | 0;
    for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (WALKABLE[terr[j]] && k < bd) { bd = k; best = j; } }
    if (best < 0) return null; goal = best;
  }
  if (start === goal) return [];
  const stamp = ++b.stamp, {g, seen, parent, heapI, heapF} = b;
  const gxC = goal % W, gyC = (goal / W) | 0;
  const h = i => { const dx = Math.abs((i % W) - gxC), dy = Math.abs(((i / W) | 0) - gyC); return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy); };
  let hn = 0;
  const push = (i, f) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; } heapI[k] = i; heapF[k] = f; };
  seen[start] = stamp; g[start] = 0; parent[start] = -1; push(start, h(start));
  let expanded = 0;
  while (hn > 0) {
    const i = heapI[0];
    hn--; const li = heapI[hn], lf = heapF[hn]; let k = 0;
    for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= lf) break; heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c; }
    heapI[k] = li; heapF[k] = lf;
    if (i === goal) {
      const path = []; for (let c = goal; c !== start; c = parent[c]) path.push(c);
      return path.reverse();
    }
    if (++expanded > budget || hn >= heapI.length - 8) return null;
    const x = i % W, y = (i / W) | 0, gi = g[i];
    for (let q = 0; q < 8; q++) {
      const nx = x + DX[q], ny = y + DY[q]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (!WALKABLE[terr[j]]) continue;
      if (q >= 4 && (!WALKABLE[terr[y * W + nx]] || !WALKABLE[terr[ny * W + x]])) continue;
      const ng = gi + BY_CODE[terr[j]].pathCost * (q >= 4 ? SQRT2 : 1);
      if (seen[j] === stamp && ng >= g[j]) continue;
      seen[j] = stamp; g[j] = ng; parent[j] = i; push(j, ng + h(j));
    }
  }
  return null;
}
