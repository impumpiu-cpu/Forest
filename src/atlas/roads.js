// Roads worn by traffic (data/roads.js). Every few years each link of the net of supply (atlas/sites.js) sends its traffic
// along the cheapest way between its towns (A* over the world grid); a road already there makes the way cheaper, so
// the traffic of many towns gathers on the same roads and wears them into highways, while roads
// nobody walks overgrow. The more a link carried — food down the net, goods bought — the more its road wears. Peoples that dislike each other or are at war do not trade, so no road
// joins their towns (atlas/diplomacy.js).
//
// Field (a.f): road — the wear of each cell (0 none; data/roads.js levels: path, road, highway).
import {linkKey} from './common.js';
import {Heap, DIRS8} from './heap.js';
import {hopsLive} from './treasury.js';
import {ROADS} from '../data/roads.js';
import {NET} from '../data/sites.js';
import {ARMY} from '../data/parties.js';
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
// the costs of a people, or of anyone (`null`: the wild, with no roads of its own)
const ANYONE = {moves: {}};
function baseCosts(a, people) {
  const all = a.roadBase ||= {};
  const key = people || 'anyone';
  if (!all[key]) { const P = people ? WORLD_PEOPLES.get(people) : ANYONE, out = new Float64Array(a.n); for (let i = 0; i < a.n; i++) out[i] = baseCost(a, i, P); all[key] = out; }
  return all[key];
}
// what a step into a cell costs now: the base, less the ford where a bridge stands, eased by the road worn there
const stepCost = (a, base, i) => (base[i] - (a.f.bridge ? ROADS.river * a.f.bridge[i] : 0)) * (1 - ROADS.roadEase * Math.min(1, a.f.road[i] / ROADS.levels[1].wear));
// the cost of a step into a cell for a traveller of this people (atlas/parties.js); Infinity: the sea
export const moveCost = (a, i, people) => stepCost(a, baseCosts(a, people), i);

// the lands of the world: each cell not of the ocean by the land it lies on (8 ways, as the paths go), the ocean −1. The land
// does not change (only the ocean stops a step: baseCost), so it is worked out once and kept beside the world (a.roadLand)
export function landsOf(a) {
  if (a.roadLand) return a.roadLand;
  const {w, h, n} = a, out = new Int32Array(n).fill(-1), stack = [];
  let id = 0;
  for (let s = 0; s < n; s++) {
    if (out[s] !== -1 || a.f.ocean[s]) continue;
    out[s] = id; stack.push(s);
    while (stack.length) {
      const c = stack.pop(), x = c % w, y = (c / w) | 0;
      for (const [dx, dy] of DIRS8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (out[j] === -1 && !a.f.ocean[j]) { out[j] = id; stack.push(j); } }
    }
    id++;
  }
  return (a.roadLand = out);
}

// A* from one cell to another; the path as a list of cells, or null
export function findPath(a, s, t, people, scratch) {
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

// the pairs of living towns that deal with each other: each town with its `links` nearest within
// `reach` cells (of a 192-cell-high world) whose realm trades with its own; each pair once
export function tradeLinks(a, links = ROADS.links, reach = ROADS.reach) {
  const towns = a.towns.filter(t => t.alive), far = reach * scaleOf(a), done = new Set(), out = [];
  for (const t of towns) {
    const near = towns.filter(o => o !== t && trades(a, t.realm, o.realm))
      .map(o => [o, Math.hypot(o.x - t.x, o.y - t.y)]).filter(([, d]) => d <= far).sort((p, q) => p[1] - q[1]).slice(0, links);
    for (const [o] of near) {
      const key = linkKey(t, o);
      if (!done.has(key)) { done.add(key); out.push([t, o]); }
    }
  }
  return out;
}

// one round of traffic between towns; returns the pairs that got a road for the first time.
// The pairs are the links of the net of supply (atlas/sites.js: the nearest towns that trade, and what they keep up by what
// flows down them); the traffic of a pair is its trade (√ of the peoples, more for trading towns) and the supply that flowed
// down its link this year (the food, and the goods bought down it — a mine's ore on its way to the forge: data/sites.js
// NET.wear), so the roads wear where the goods go, and a link the goods have left overgrows with it
export function wearRoads(a) {
  const f = a.f;
  for (let i = 0; i < a.n; i++) f.road[i] *= ROADS.decay;
  const scratch = a.roadScratch ||= {g: new Float64Array(a.n).fill(Infinity), came: new Int32Array(a.n), touched: []};
  const fresh = [], pairs = a.net ? [...a.net.links.values()].filter(l => l.p.alive && l.q.alive).map(l => [l.p, l.q, l]) : tradeLinks(a).map(([t, o]) => [t, o, null]);
  const land = landsOf(a), L = a.net?.links;
  const trade = new Map(), tradeOf = t => { let v = trade.get(t); if (v === undefined) trade.set(t, v = townFx(t).trade); return v; };   // (a town's trade, once a round)
  const amtOf = (t, o, l) => Math.sqrt(t.pop * o.pop) / ROADS.traffic * (1 + (tradeOf(t) + tradeOf(o)) / 2) + (l?.flow || 0) / NET.wear;
  // a trade route over the net (atlas/treasury.js: a seller far off, through its province or other lands) has no road of its
  // own: its traffic goes down the links of its way (l.hops), wearing their roads — the caravans walk from town to town. Only
  // the other links (the neighbours', a route whose way is gone) find their way over the land
  const extra = new Map(), routes = [];
  const lay = (l, v, depth) => { for (const k of l.hops) { const h = L.get(k); if (h?.hops && depth < ROADS.hopDepth) lay(h, v, depth + 1); else if (h) extra.set(h, (extra.get(h) || 0) + v); } };
  for (const [t, o, l] of pairs) if (l && L && hopsLive(a, l)) { routes.push(l); lay(l, amtOf(t, o, l), 1); }
  const onHops = new Set(routes);
  for (const [t, o, l] of pairs) {
    if (onHops.has(l)) continue;
    const key = linkKey(t, o);
    if (land[t.i] !== land[o.i]) continue;   // (two lands apart: no way on foot — the search would only fail after the whole land)
    const path = findPath(a, t.i, o.i, t.people, scratch);
    if (!path) continue;
    // the way's cost and how well it is roaded, as the trade reads them (atlas/treasury.js: the carriage, the link's room)
    if (l) { const base = baseCosts(a, t.people); let c = 0, r = 0; for (const cell of path) { c += stepCost(a, base, cell); r += Math.min(1, f.road[cell] / ROADS.levels[1].wear); } l.cost = Math.round(c * 10) / 10; l.road = Math.round(r / path.length * 1000) / 1000; }
    const amt = amtOf(t, o, l) + (extra.get(l) || 0);
    for (const c of path) if (!f.scourge || f.scourge[c] <= ARMY.scourged) f.road[c] += amt;   // no caravan goes where an army's foragers are
    a.roadPairs ||= new Set();
    if (!a.roadPairs.has(key)) { a.roadPairs.add(key); fresh.push([t, o]); }
  }
  // a route's cost and road: its way's, summed and the least (the carriage and the room of the trade read them)
  for (const l of routes) {
    let c = 0, r = 1;
    for (const k of l.hops) { const h = L.get(k); c += h.cost ?? Math.hypot(h.p.x - h.q.x, h.p.y - h.q.y); r = Math.min(r, h.road || 0); }
    l.cost = Math.round(c * 10) / 10; l.road = Math.round(r * 1000) / 1000;
  }
  return fresh;
}

// how well a town is on the roads: 0 … 1 (a road at the town, the better the more)
export function roadAccess(a, i) {
  const v = a.f.road?.[i] || 0;
  return Math.min(1, v / ROADS.levels[2].wear);
}
