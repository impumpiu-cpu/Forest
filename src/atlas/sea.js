// Sea lanes (data/roads.js SEA): the roads of the water. A town with a harbour sends ships to the
// nearest harbours of realms it trades with, the cheapest way over the ocean (A* over water cells);
// a lane already sailed is easier, so the ships gather on the same lanes and wear them in, as roads
// are worn on land. The sea is faster than any road: a cell of water costs SEA.cost against 1 and
// more on land, so a harbour town's trade reaches far — and a far harbour town stands on its own
// (atlas/realms.js: a harbour counts as distance for a schism). A lighthouse sends ships further.
//
// Field (a.f): sea — the wear of each water cell (0 none; SEA.levels: a lane, a sea road).
import {TOWN_ROLES} from '../data/worldLand.js';
import {linkKey} from './common.js';
import {Heap, DIRS8} from './heap.js';
import {SEA} from '../data/roads.js';
import {townFx} from './towns.js';
import {trades} from './diplomacy.js';
import {scaleOf} from './tectonics.js';
import {TOWN_FLOW} from '../data/townBuildings.js';
import {faunaCell} from './fauna.js';

export const hasHarbor = t => t.alive && TOWN_ROLES.harbor.some(id => t.built.includes(id));   // (data/worldLand.js)
export const seaLevelOf = v => { let lv = -1; SEA.levels.forEach((L, k) => { if (v >= L.wear) lv = k; }); return lv; };

// the water cell beside a harbour town the ships leave from
function quay(a, t) {
  const x0 = t.x, y0 = t.y;
  for (const [dx, dy] of DIRS8) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < a.w && y < a.h && a.f.ocean[y * a.w + x]) return y * a.w + x; }
  return -1;
}

const stepCost = (a, i) => (a.f.ocean[i] ? SEA.cost * (1 - SEA.ease * Math.min(1, a.f.sea[i] / SEA.levels[0].wear)) : Infinity);

// A* over the water from one quay to another
function sail(a, s, t, scratch) {
  const {w, h} = a, {g, came, touched} = scratch, heap = new Heap(1024), tx = t % w, ty = (t / w) | 0;
  touched.length = 0;
  const H = i => SEA.cost * (1 - SEA.ease) * Math.hypot(i % w - tx, ((i / w) | 0) - ty);
  g[s] = 0; came[s] = s; touched.push(s); heap.push(H(s), s);
  let found = false, steps = 0;
  while (heap.size && steps++ < 80000) {
    const c = heap.pop();
    if (c === t) { found = true; break; }
    const x = c % w, y = (c / w) | 0;
    for (const [dx, dy, len] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, sc = stepCost(a, j);
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

// one round of shipping between harbours; returns the pairs that got a lane for the first time
export function sailLanes(a) {
  const f = a.f, k = scaleOf(a);
  f.sea ||= new Float32Array(a.n);
  for (let i = 0; i < a.n; i++) f.sea[i] *= SEA.decay;
  const ports = a.towns.filter(hasHarbor).map(t => [t, quay(a, t)]).filter(([, q]) => q >= 0);
  if (ports.length < 2) return [];
  const scratch = a.seaScratch ||= {g: new Float64Array(a.n).fill(Infinity), came: new Int32Array(a.n), touched: []};
  const done = new Set(), fresh = [];
  a.lanes ||= new Set();
  for (const [t, qt] of ports) {
    const reach = SEA.reach * k * (TOWN_ROLES.seaReach.some(id => t.built.includes(id)) ? SEA.lighthouse : 1);
    const near = ports.filter(([o]) => o !== t && trades(a, t.realm, o.realm))
      .map(([o, qo]) => [o, qo, Math.hypot(o.x - t.x, o.y - t.y)]).filter(([, , d]) => d <= reach).sort((p, q) => p[2] - q[2]).slice(0, SEA.links);
    for (const [o, qo] of near) {
      const key = linkKey(t, o);
      if (done.has(key)) continue;
      done.add(key);
      const path = sail(a, qt, qo, scratch);
      if (!path) continue;
      const amt = Math.sqrt(t.pop * o.pop) / SEA.traffic * (1 + (townFx(t).trade + townFx(o).trade) / 2);
      for (const c of path) f.sea[c] += amt;
      if (!a.lanes.has(key)) { a.lanes.add(key); fresh.push([t, o]); }
    }
  }
  return fresh;
}

// are two harbour towns joined by a sailed lane (for the realms' trade routes)
export const laneBetween = (a, t, o) => !!a.lanes && a.lanes.has(linkKey(t, o));
// how well a town is on the sea: 0 … 1 (a sailed lane at its quay)
export function seaAccess(a, t) {
  if (!a.f.sea || !hasHarbor(t)) return 0;
  const q = quay(a, t);
  return q < 0 ? 0 : Math.min(1, a.f.sea[q] / SEA.levels[1].wear);
}

// what the sea around a town feeds, as a share of the land around it would (TOWN_FLOW.sea): the share of water in the
// cells its land feed is counted over (atlas/peoples.js: 3×3 of the fauna grid; kept — the sea does not move) × its best
// fishers (a fishing hut, a pier, a harbour) × the boats of its shipyard (t.econ.boats)
export function seaFeed(a, t) {
  const S = TOWN_FLOW.sea; let best = 0;
  for (const id of Object.keys(S)) if (t.built.includes(id)) best = Math.max(best, S[id]);
  if (!best) return 0;
  const pk = t.place ||= {};
  if (pk.sea == null) {
    const F = a.fauna, c = F.c, j = faunaCell(a, t.i), fx = j % F.W, fy = (j / F.W) | 0;
    let n = 0, w = 0;
    for (let y = Math.max(0, (fy - 1) * c); y < Math.min(a.h, (fy + 2) * c); y++) for (let x = Math.max(0, (fx - 1) * c); x < Math.min(a.w, (fx + 2) * c); x++) { n++; if (a.f.ocean[y * a.w + x]) w++; }
    pk.sea = n ? Math.round(w / n * 1000) / 1000 : 0;
  }
  return pk.sea * best * (t.econ?.boats || 1);
}
