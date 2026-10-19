// The caravan's way across the world: A* over the world's cells with the caravan's own price of a
// step. On foot it is the world's (atlas/roads.js moveCost: roads ease the way, mountains and swamps
// slow it, each people walks its own lands better). On wheels the road is everything: off a road a step
// costs more, and mountains, swamps, jungle, dense forest cannot be crossed at all (data/transport.js WHEELS).
import {moveCost, roadLevel} from '../atlas/roads.js';
import {biomeAt} from '../atlas/biomes.js';
import {Heap} from '../atlas/heap.js';
import {WHEELS} from '../data/transport.js';

const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
const SCRATCH = new WeakMap();
const scratchOf = a => { let s = SCRATCH.get(a); if (!s) SCRATCH.set(a, s = {g: new Float64Array(a.n).fill(Infinity), came: new Int32Array(a.n), touched: []}); return s; };

export const onRoad = (a, i) => !!a.f.road && roadLevel(a.f.road[i]) >= 0 && a.f.road[i] >= WHEELS.roadAt;

// whether wheels can enter a cell, and what a step there costs
export function stepCost(a, i, people, wheeled) {
  const c = moveCost(a, i, people);
  if (!wheeled || c === Infinity || onRoad(a, i)) return c;
  const b = biomeAt(a, i);
  if (!b || WHEELS.block.includes(b.id)) return Infinity;
  if (b.trees >= WHEELS.denseForest && a.f.trees && a.f.trees[i] >= WHEELS.denseForest) return Infinity;
  return c * WHEELS.offRoad;
}

// the way from s to t as cells after s, and its price (Σ step × length); null when there is none
export function route(a, s, t, people, wheeled) {
  if (s === t) return {path: [], cost: 0};
  const {w, h} = a, {g, came, touched} = scratchOf(a), heap = new Heap(1024), tx = t % w, ty = (t / w) | 0;
  touched.length = 0;
  const H = i => 0.6 * Math.hypot(i % w - tx, ((i / w) | 0) - ty);
  g[s] = 0; came[s] = s; touched.push(s); heap.push(H(s), s);
  let found = false, steps = 0;
  while (heap.size && steps++ < 80000) {
    const c = heap.pop();
    if (c === t) { found = true; break; }
    const x = c % w, y = (c / w) | 0;
    for (const [dx, dy, len] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, sc = stepCost(a, j, people, wheeled);
      if (sc === Infinity) continue;
      const ng = g[c] + sc * len;
      if (ng < g[j]) { if (g[j] === Infinity) touched.push(j); g[j] = ng; came[j] = c; heap.push(ng + H(j), j); }
    }
  }
  let out = null;
  if (found) { const path = []; for (let i = t; i !== s; i = came[i]) path.push(i); out = {path: path.reverse(), cost: g[t]}; }
  for (const i of touched) g[i] = Infinity;
  return out;
}
