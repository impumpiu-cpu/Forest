// Point-to-point paths around water and rocks (A* on the grid, 8 directions, no corner cutting).
// Flow fields cover shared targets (camp, berries, prey…); this covers one agent chasing one
// moving target or walking to a spot of its own. Buffers are allocated once per world and reused.
import {BY_CODE, WALKABLE, T} from '../data/terrain.js';

const ROCK = T.ROCK;
import {DX, DY} from '../world/grid.js';

const SQRT2 = Math.SQRT2;

function buffers(w) {
  if (w.astar) return w.astar;
  const n = w.n;
  return (w.astar = {g: new Float32Array(n), seen: new Int32Array(n), closed: new Int32Array(n), parent: new Int32Array(n),
    heapI: new Int32Array(n * 8), heapF: new Float32Array(n * 8), stamp: 0});
}

// Every cell a straight segment crosses, in order (a grid walk, not point samples: a line through the
// exact corner of two cells reports both side cells, so it cannot slip between two touching rocks).
// visit(i) returning false stops the walk; the result is whether the walk got to the end.
function walkLine(w, x0, y0, x1, y1, visit) {
  let cx = Math.floor(x0), cy = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1), dx = x1 - x0, dy = y1 - y0;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h;
  if (!inside(cx, cy) || !visit(cy * w.w + cx)) return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity;
  let tx = dx ? ((sx > 0 ? cx + 1 - x0 : x0 - cx) * tdx) : Infinity;
  let ty = dy ? ((sy > 0 ? cy + 1 - y0 : y0 - cy) * tdy) : Infinity;
  for (let guard = 0; (cx !== ex || cy !== ey) && guard < 4 * (w.w + w.h); guard++) {
    if (Math.abs(tx - ty) < 1e-9) {
      // through a corner: both side cells count, then the diagonal one
      if (!inside(cx + sx, cy) || !visit(cy * w.w + cx + sx)) return false;
      if (!inside(cx, cy + sy) || !visit((cy + sy) * w.w + cx)) return false;
      cx += sx; cy += sy; tx += tdx; ty += tdy;
    } else if (tx < ty) { cx += sx; tx += tdx; } else { cy += sy; ty += tdy; }
    if (!inside(cx, cy) || !visit(cy * w.w + cx)) return false;
  }
  return true;
}

// line of sight between two points over walkable cells only (the straight walk is safe)
export const clearLine = (w, x0, y0, x1, y1) => walkLine(w, x0, y0, x1, y1, i => WALKABLE[w.grid.terr[i]] === 1);

// a shot's line: only rock stops an arrow or a stone (water, grass and wood do not)
export const lineOfFire = (w, x0, y0, x1, y1) => walkLine(w, x0, y0, x1, y1, i => w.grid.terr[i] !== ROCK);

// the cheapest step of any walkable ground (the table «Местность» may change it): the scale of the estimate
function cheapestStep() {
  let m = Infinity;
  for (const t of Object.values(BY_CODE)) if (t && t.walkable && t.pathCost > 0 && t.pathCost < m) m = t.pathCost;
  return Number.isFinite(m) ? Math.min(1, m) : 1;
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
  const stamp = ++b.stamp, {g, seen, closed, parent, heapI, heapF} = b;
  const gxC = goal % W, gyC = (goal / W) | 0;
  // the octile distance × the cheapest step of any walkable ground (a road's): it never overstates what is left, so the
  // first pop of the goal is the cheapest way (docs/RULES.md; a road away from the straight line is found)
  const cheap = cheapestStep(), h = i => { const dx = Math.abs((i % W) - gxC), dy = Math.abs(((i / W) | 0) - gyC); return ((dx + dy) + (SQRT2 - 2) * Math.min(dx, dy)) * cheap; };
  let hn = 0;
  const push = (i, f) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; } heapI[k] = i; heapF[k] = f; };
  seen[start] = stamp; g[start] = 0; parent[start] = -1; push(start, h(start));
  let expanded = 0;
  while (hn > 0) {
    const i = heapI[0];
    hn--; const li = heapI[hn], lf = heapF[hn]; let k = 0;
    for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= lf) break; heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c; }
    heapI[k] = li; heapF[k] = lf;
    // a cell is expanded once: stale copies left in the heap by a later, cheaper visit are skipped
    // (the estimate never overstates a step — h above — so the first pop is the cheapest). Without
    // this the search re-expanded the same cells over and over and gave up on long but open routes.
    if (closed[i] === stamp) continue;
    closed[i] = stamp;
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
