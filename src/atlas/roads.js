// Roads worn by traffic (data/roads.js). Every few years each town sends traffic to its nearest towns
// along the cheapest way (A* over the world grid); a road already there makes the way cheaper, so
// the traffic of many towns gathers on the same roads and wears them into highways, while roads
// nobody walks overgrow. Peoples that dislike each other or are at war do not trade, so no road
// joins their towns (atlas/diplomacy.js).
//
// Field (a.f): road — the wear of each cell (0 none; data/roads.js levels: path, road, highway).
import {Heap, DIRS8} from './heap.js';
import {ROADS} from '../data/roads.js';
import {RIVERS} from '../data/hydrology.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {biomeAt} from './biomes.js';
import {townFx} from './towns.js';
import {trades} from './diplomacy.js';
import {scaleOf} from './tectonics.js';

export const roadLevel = v => { let lv = -1; ROADS.levels.forEach((L, k) => { if (v >= L.wear) lv = k; }); return lv; };

// what a step into a cell costs without any road (Infinity: the ocean); the land does not change,
// so it is worked out once per people and kept (a.roadBase)
function baseCost(a, i, P) {
  const f = a.f;
  if (f.ocean[i]) return Infinity;
  const b = biomeAt(a, i).id;
  let c = ROADS.cost[b] ?? 1.5;
  if (f.lake[i] >= 0) c = ROADS.cost.water;
  // elves walk the woods, dwarves the mountains, as their own roads
  const mv = P.moves[b];
  if (mv) c /= mv;
  c += ROADS.slope * (1 - f.flat[i]) * 0.3;
  if (f.flow[i] >= RIVERS.river * scaleOf(a) ** 2) c += ROADS.river;
  return c;
}
function baseCosts(a, people) {
  const all = a.roadBase ||= {};
  if (!all[people]) { const P = WORLD_PEOPLES.get(people), out = new Float64Array(a.n); for (let i = 0; i < a.n; i++) out[i] = baseCost(a, i, P); all[people] = out; }
  return all[people];
}
// what a step into a cell costs now: the base, less the ford where a bridge stands, eased by the road worn there
const stepCost = (a, base, i) => (base[i] - (a.f.bridge ? ROADS.river * a.f.bridge[i] : 0)) * (1 - ROADS.roadEase * Math.min(1, a.f.road[i] / ROADS.levels[1].wear));

// A* from one cell to another; the path as a list of cells, or null
function findPath(a, s, t, people, scratch) {
  const {w, h} = a, {g, came, touched} = scratch, heap = new Heap(1024), tx = t % w, ty = (t / w) | 0, base = baseCosts(a, people);
  touched.length = 0;
  const H = i => 0.6 * Math.hypot(i % w - tx, ((i / w) | 0) - ty);
  g[s] = 0; came[s] = s; touched.push(s); heap.push(H(s), s);
  let found = false, steps = 0;
  while (heap.size && steps++ < 60000) {
    const c = heap.pop();
    if (c === t) { found = true; break; }
    const x = c % w, y = (c / w) | 0;
    for (const [dx, dy, len] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, sc = stepCost(a, base, j);
      if (sc === Infinity) continue;
      const ng = g[c] + sc * len;
      if (ng < g[j]) { if (g[j] === Infinity) touched.push(j); g[j] = ng; came[j] = c; heap.push(ng + H(j), j); }
    }
  }
  let path = null;
  if (found) { path = []; for (let i = t; i !== s; i = came[i]) path.push(i); path.push(s); }
  for (const i of touched) g[i] = Infinity;
  return path;
}

// one round of traffic between towns; returns the pairs that got a road for the first time
export function wearRoads(a) {
  const f = a.f, k = scaleOf(a), towns = a.towns.filter(t => t.alive), reach = ROADS.reach * k;
  for (let i = 0; i < a.n; i++) f.road[i] *= ROADS.decay;
  const scratch = a.roadScratch ||= {g: new Float64Array(a.n).fill(Infinity), came: new Int32Array(a.n), touched: []};
  const done = new Set(), fresh = [];
  for (const t of towns) {
    const near = towns.filter(o => o !== t && trades(a, t.realm, o.realm))
      .map(o => [o, Math.hypot(o.x - t.x, o.y - t.y)]).filter(([, d]) => d <= reach).sort((p, q) => p[1] - q[1]).slice(0, ROADS.links);
    for (const [o] of near) {
      const key = Math.min(t.id, o.id) * 100000 + Math.max(t.id, o.id);
      if (done.has(key)) continue;
      done.add(key);
      const path = findPath(a, t.i, o.i, t.people, scratch);
      if (!path) continue;
      // trading towns send more down the road
      const amt = Math.sqrt(t.pop * o.pop) / ROADS.traffic * (1 + (townFx(t).trade + townFx(o).trade) / 2);
      for (const c of path) f.road[c] += amt;
      a.roadPairs ||= new Set();
      if (!a.roadPairs.has(key)) { a.roadPairs.add(key); fresh.push([t, o]); }
    }
  }
  return fresh;
}

// how well a town is on the roads: 0 … 1 (a road at the town, the better the more)
export function roadAccess(a, i) {
  const v = a.f.road?.[i] || 0;
  return Math.min(1, v / ROADS.levels[2].wear);
}
