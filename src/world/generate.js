// World generation. makeTerrain is pure (the menu preview uses it too); createWorld builds the full state.
import {newBehaviour} from '../settlement/behaviour.js';
import {mulberry, seedNumber, newStreams} from '../core/rng.js';
import {clamp} from '../core/util.js';
import {HOUR} from '../core/time.js';
import {T, BY_CODE, OPEN, TERRAIN} from '../data/terrain.js';
import {BIOMES} from '../data/biomes.js';
import {makeSite, paintOrder, SIDES} from './site.js';
import {findPath} from '../nav/astar.js';
import {DX, DY} from './grid.js';
const BIOME_LIST = BIOMES.all();
import {STOCKS} from '../data/presets.js';
import {RESOURCES} from '../data/resources.js';
import {initOutside} from '../outside/index.js';
import {emptyMods} from '../settlement/mods.js';
import {isCampArea} from './grid.js';
import {setWind} from './weather.js';
import {recomputeZone} from '../settlement/zone.js';
import {newChronicle} from '../settlement/chronicle.js';
import {findLakes} from './lakes.js';
import {layOre} from './ores.js';
import {layPlants} from './plants.js';
import {newTradeState} from '../settlement/trade.js';

function noiseLayer(rnd, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0;
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return out;
}

// fractal value noise normalised to 0..1; feature size grows with the map so big maps get more lakes, not bigger ones
// `scale` shrinks every layer: fine noise for tree cover and crags (the coarse layer has only a few
// dozen random points per map, and two coarse fields are never quite independent of each other)
function fbm(rnd, w, h, scale = 1) {
  const k = Math.sqrt(w * h / (128 * 96));
  const layers = [[36 * Math.min(k, 1.3) * scale, 0.5], [18 * scale, 0.27], [9 * scale, 0.15], [4 * scale, 0.08]].map(([c, wt]) => [noiseLayer(rnd, w, h, c), wt]);
  const n = w * h, o = new Float32Array(n); let mn = 1e9, mx = -1e9;
  for (let i = 0; i < n; i++) { let v = 0; for (const [l, wt] of layers) v += l[i] * wt; o[i] = v; if (v < mn) mn = v; if (v > mx) mx = v; }
  for (let i = 0; i < n; i++) o[i] = (o[i] - mn) / (mx - mn);
  return o;
}

// 0..1 quantile rank of every value (the fractal noise is not uniform; ranks are, so a share is a threshold)
function ranks(v) {
  const n = v.length, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => v[a] - v[b] || a - b);
  const r = new Float32Array(n); for (let k = 0; k < n; k++) r[idx[k]] = k / n;
  return r;
}

// Paints the map from a site (world/site.js): open water on the lowest cells, bare rock on the highest,
// then the mountain biomes on the high land and the rest by moisture — the driest cells to the driest
// biome — so that each biome gets its share and lies where the land puts it. Within a biome the ground
// is the biome's own (grass, steppe, sand, bog), forest covers it up to the biome's tree cover, and
// bogs keep pools in their lowest cells. grid.biome remembers the biome of every cell, grid.under the
// ground a burnt or felled cell comes back to.
export function makeTerrain(input) {
  const site = input.biomes ? input : makeSite(input);
  const {w, h} = site, n = w * h;
  const rng = mulberry(seedNumber(site.seed));
  const hgt = fbm(rng, w, h), moist = fbm(rng, w, h), tree = fbm(rng, w, h, 0.4), crag = fbm(rng, w, h, 0.4);
  const hq = ranks(hgt), mq = ranks(moist), tq = ranks(tree), cq = ranks(crag);
  const terr = new Uint8Array(n), fert = new Float32Array(n), under = new Uint8Array(n), biome = new Uint8Array(n);
  const G = id => TERRAIN.get(id).code;
  const land = [];
  for (let i = 0; i < n; i++) {
    if (hq[i] < site.water) terr[i] = T.WATER;
    else if (hq[i] >= 1 - site.rock) terr[i] = T.ROCK;
    else land.push(i);
  }
  // the biomes, highland first (they take the highest land), then from the driest to the wettest
  const order = paintOrder(site);
  const mountain = order.filter(([b]) => b.kind === 'altitude' || b.id === 'underground' || b.id === 'volcano');
  // the «water» biome is the open water already laid out, the painter skips it
  const lowland = order.filter(([b]) => b.kind !== 'water' && !mountain.some(([m]) => m === b));
  const total = order.reduce((s, [, v]) => s + v, 0) || 1;
  // highest first, with a little noise so that the highland biomes do not follow the contour lines
  const hn = i => hq[i] + 0.12 * (cq[i] - 0.5);
  const byHeight = land.slice().sort((a, b) => hn(b) - hn(a) || a - b);
  const assigned = new Uint8Array(n);
  let k = 0;
  for (const [b, v] of mountain) { const m = Math.round(land.length * v / total); for (let q = 0; q < m && k < byHeight.length; q++, k++) { biome[byHeight[k]] = BIOME_LIST.indexOf(b) + 1; assigned[byHeight[k]] = 1; } }
  const rest = land.filter(i => !assigned[i]).sort((a, b) => mq[a] - mq[b] || a - b);   // driest first
  const lowTotal = lowland.reduce((s, [, v]) => s + v, 0) || 1;
  let at = 0;
  lowland.forEach(([b, v], idx) => {
    const m = idx === lowland.length - 1 ? rest.length - at : Math.round(rest.length * v / lowTotal);
    for (let q = 0; q < m && at < rest.length; q++, at++) biome[rest[at]] = BIOME_LIST.indexOf(b) + 1;
  });
  const ground = new Map();   // biome → its cells of bare ground, for the tree cover
  for (const i of land) {
    const b = BIOME_LIST[biome[i] - 1] || BIOMES.get('meadow');
    under[i] = G(b.ground);
    if (b.pools > 0 && hq[i] < site.water + b.pools) terr[i] = T.WATER;             // pools in the lowest cells of a bog
    else if (b.rock > 0 && cq[i] > 1 - b.rock * 0.5) terr[i] = T.ROCK;             // crags of the highlands
    else { terr[i] = under[i]; (ground.get(b) || ground.set(b, []).get(b)).push(i); }
    fert[i] = clamp((moist[i] * 1.25 - (hgt[i] - 0.5) * 0.6) * b.fert * site.fert, 0.05, 1);
  }
  // forest covers exactly the biome's share of its ground: the cells with the lowest tree noise
  // (a rank within the biome, so that pools and crags do not skew the share)
  for (const [b, cells] of ground) {
    const m = Math.round(cells.length * Math.min(1, b.trees * site.trees)); if (!m) continue;
    cells.sort((p, q) => tq[p] - tq[q] || p - q);
    for (let k = 0; k < m; k++) terr[cells[k]] = T.FOREST;
  }
  for (let i = 0; i < n; i++) if (!under[i]) under[i] = T.GRASS;
  const river = layRiver(site, {w, h, terr, under, hgt, fert, noise: cq});
  // camp: a dry open spot nearest to the centre with a passable 7×7 around it (no bog underfoot)
  let best = -1, bd = 1e9;
  const mx = Math.round(w * 0.12), my = Math.round(h * 0.12);
  const blocked = t => !BY_CODE[t].walkable;
  for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) {
    if (!OPEN[terr[y * w + x]]) continue;
    let ok = true;
    for (let yy = -3; yy <= 3 && ok; yy++) for (let xx = -3; xx <= 3; xx++) { const t = terr[(y + yy) * w + x + xx]; if (blocked(t) || t === T.SWAMP) { ok = false; break; } }
    if (!ok) continue;
    const d = (x - w / 2) ** 2 + (y - h / 2) ** 2; if (d < bd) { bd = d; best = y * w + x; }
  }
  if (best < 0) best = (h >> 1) * w + (w >> 1);
  const cx = best % w, cy = (best / w) | 0;
  for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) { const j = (cy + yy) * w + cx + xx; terr[j] = OPEN[under[j]] ? under[j] : T.GRASS; under[j] = terr[j]; }
  const gates = layGates(site, {w, h, terr, under, biome, cx, cy, river});
  return {w, h, terr, hgt, fert, under, biome, cx, cy, rng, site, gates, river};
}

// cheapest path for water: a Dijkstra over the cells with a cost that loves low ground and open water
// (so a river finds the lakes) and hates rock (a gorge only where there is no other way)
function waterPath(w, h, terr, hgt, noise, from, to) {
  const n = w * h, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const hI = new Int32Array(n * 9), hD = new Float64Array(n * 9); let hn = 0;
  const push = (i, d) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hD[p] <= d) break; hI[k] = hI[p]; hD[k] = hD[p]; k = p; } hI[k] = i; hD[k] = d; };
  // a little noise in the cost: without it the cheapest way runs along the grid lines, and a river meanders
  const cost = j => (terr[j] === T.WATER ? 0.15 : terr[j] === T.ROCK ? 14 : 0.25 + 8 * hgt[j] * hgt[j] + 0.7 * noise[j]);
  dist[from] = 0; push(from, 0);
  while (hn > 0) {
    const i = hI[0], d = hD[0];
    hn--; const li = hI[hn], ld = hD[hn]; let k = 0;
    for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && hD[c + 1] < hD[c]) c++; if (hD[c] >= ld) break; hI[k] = hI[c]; hD[k] = hD[c]; k = c; }
    hI[k] = li; hD[k] = ld;
    if (done[i]) continue; done[i] = 1;
    if (i === to) break;
    const x = i % w, y = (i / w) | 0;
    for (let q = 0; q < 4; q++) {   // four directions: a river does not step diagonally between two land cells
      const nx = x + DX[q], ny = y + DY[q]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, nd = d + cost(j);
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(j, nd); }
    }
  }
  if (!done[to]) return null;
  const path = []; for (let c = to; c !== -1; c = prev[c]) path.push(c);
  return path.reverse();
}

// the river: from the source gate to the mouth gate along the low ground, one cell wide (two for a wide
// one), through the lakes it meets; the flood plain (two cells either side) is richer ground
function layRiver(site, t) {
  const {w, h, terr, under, hgt, fert, noise} = t;
  const g = (site.gates || []).filter(x => x.kind === 'river'); if (g.length < 2) return null;
  const edge = x => { const along = x.side === 'north' || x.side === 'south' ? w : h, k = Math.round(x.at * (along - 1)); return x.side === 'north' ? k : x.side === 'south' ? (h - 1) * w + k : x.side === 'west' ? k * w : k * w + w - 1; };
  let [a, b] = [edge(g.find(x => x.role === 'source')), edge(g.find(x => x.role === 'mouth'))];
  if (hgt[a] < hgt[b]) [a, b] = [b, a];   // water runs downhill: the higher gate is the source
  const path = waterPath(w, h, terr, hgt, noise, a, b); if (!path) return null;
  const cells = new Set(path);
  // a wide river: a second cell beside every step — below a horizontal step, to the right of a vertical one
  if (g[0].wide) for (let k = 0; k + 1 < path.length; k++) {
    const i = path[k], horizontal = ((path[k + 1] / w) | 0) === ((i / w) | 0);
    const j = horizontal ? ((i / w) | 0) + 1 < h ? i + w : i - w : (i % w) + 1 < w ? i + 1 : i - 1;
    if (terr[j] !== T.ROCK) cells.add(j);
  }
  for (const i of cells) { terr[i] = T.WATER; under[i] = T.GRASS; }
  for (const i of path) {
    const x = i % w, y = (i / w) | 0;
    for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) {
      const px = x + xx, py = y + yy; if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const j = py * w + px; if (BY_CODE[terr[j]].kind === 'ground' || terr[j] === T.FOREST) fert[j] = Math.min(1, fert[j] + 0.12);
    }
  }
  return {source: a, mouth: b, cells: [...cells], wide: !!g[0].wide};
}

// which cells can be walked to from cell `from` (four directions and the diagonal rule of the game)
function reachableFrom(t, from) {
  const {w, h, terr} = t, seen = new Uint8Array(w * h), stack = [from]; seen[from] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    for (let q = 0; q < 8; q++) {
      const nx = x + DX[q], ny = y + DY[q]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx; if (seen[j] || !BY_CODE[terr[j]].walkable) continue;
      if (q >= 4 && (!BY_CODE[terr[y * w + nx]].walkable || !BY_CODE[terr[ny * w + x]].walkable)) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  return seen;
}

// a ford across the river at cell i and the river cells beside it (a wide river needs two)
function ford(t, i) {
  const {w, h, terr} = t, x = i % w, y = (i / w) | 0;
  for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
    const px = x + xx, py = y + yy; if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const j = py * w + px; if (terr[j] === T.WATER && t.river.cells.includes(j)) terr[j] = T.FORD;
  }
}// the gate cell of a side: `at` along that edge, moved to the nearest passable cell of the edge
function gateCell(t, g) {
  const {w, h, terr} = t;
  const along = g.side === 'north' || g.side === 'south' ? w : h;
  const cellAt = k => (g.side === 'north' ? k : g.side === 'south' ? (h - 1) * w + k : g.side === 'west' ? k * w : k * w + w - 1);
  const k0 = Math.round(g.at * (along - 1));
  for (let d = 0; d < along; d++) for (const k of [k0 + d, k0 - d]) {
    if (k < 0 || k >= along) continue;
    const i = cellAt(k); if (BY_CODE[terr[i]].walkable) return i;
  }
  return cellAt(k0);
}

// gates get a cell on the edge and, for a road gate, a road to the camp: the cheapest path over the
// land (A* by terrain cost: a road goes round bogs and through meadows rather than forest)
function layGates(site, t) {
  const {w, h, terr, under, river} = t, out = [];
  // for the road's path the river is wadeable: where the road crosses it, a ford is laid
  const walk = Uint8Array.from(terr); if (river) for (const j of river.cells) walk[j] = T.FORD;
  const tmp = {w, h, n: w * h, grid: {terr: walk}};
  let fords = 0;
  for (const g of site.gates || []) {
    if (g.kind === 'river') { const i = river ? (g.role === 'source' ? river.source : river.mouth) : -1; if (i >= 0) out.push({...g, i, x: i % w, y: (i / w) | 0}); continue; }
    const i = gateCell(t, g), gate = {...g, i, x: i % w, y: (i / w) | 0, road: false};
    if (!BY_CODE[terr[i]].walkable) { terr[i] = OPEN[under[i]] ? under[i] : T.GRASS; under[i] = terr[i]; if (!t.biome[i]) t.biome[i] = t.biome[i + (gate.x === 0 ? 1 : gate.x === w - 1 ? -1 : gate.y === 0 ? w : -w)] || 1; }
    if (g.kind === 'road') {
      const path = findPath(tmp, gate.x, gate.y, t.cx, t.cy, w * h * 2);
      if (path) {
        for (const j of [i, ...path]) {
          if (Math.abs((j % w) - t.cx) <= 1 && Math.abs(((j / w) | 0) - t.cy) <= 1) continue;
          if (terr[j] === T.WATER) { ford(t, j); fords++; } else { terr[j] = T.ROAD; under[j] = T.ROAD; }
        }
        gate.road = true;
      }
    }
    out.push(gate);
  }
  // a river (with the lakes it joins) must not cut the map in two: while some bank cannot be reached
  // from the camp, a ford is laid at the crossing nearest to the camp — a river cell with reached land
  // on one side and unreached land on the other
  if (river) for (let k = 0; k < 4; k++) {
    const reach = reachableFrom(t, t.cy * w + t.cx);
    // which river cells touch a reached bank, which an unreached one
    const bank = new Int8Array(w * h);   // 1: reached land beside, 2: unreached, 3: both
    for (const j of river.cells) {
      if (terr[j] !== T.WATER) continue;
      const x = j % w, y = (j / w) | 0;
      for (let q = 0; q < 4; q++) { const nx = x + DX[q], ny = y + DY[q]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const m = ny * w + nx; if (!BY_CODE[terr[m]].walkable || terr[m] === T.FORD) continue; bank[j] |= reach[m] ? 1 : 2; }
    }
    // a crossing: a cell by the reached bank with the unreached bank within one cell (a wide river is two cells)
    let best = -1, bd = Infinity;
    for (const j of river.cells) {
      if (!(bank[j] & 1)) continue;
      const x = j % w, y = (j / w) | 0; let far = false;
      for (let yy = -1; yy <= 1 && !far; yy++) for (let xx = -1; xx <= 1; xx++) { const px = x + xx, py = y + yy; if (px < 0 || py < 0 || px >= w || py >= h) continue; if (bank[py * w + px] & 2) { far = true; break; } }
      if (!far) continue;
      const d = (x - t.cx) ** 2 + (y - t.cy) ** 2; if (d < bd) { bd = d; best = j; }
    }
    if (best < 0) break;
    ford(t, best);
  }
  return out;
}

export function createWorld(cfg) {
  const t = makeTerrain(cfg), n = t.w * t.h;
  const f32 = () => new Float32Array(n);
  const world = {
    cfg: {...cfg}, climate: t.site.climate, calendar: {startDay: t.site.startDay},
    w: t.w, h: t.h, n, rng: t.rng, rngs: newStreams(cfg.seed), tick: Math.round(7 * HOUR),
    site: t.site, region: t.site.region, gates: t.gates, river: t.river,
    grid: {terr: t.terr, hgt: t.hgt, fert: t.fert, under: t.under, biome: t.biome, food: f32(), wood: f32(), fuel: f32(), fire: f32(),
      heat: f32(), heat2: f32(), smoke: f32(), smoke2: f32(), bush: new Uint8Array(n), bld: new Int16Array(n).fill(-1)},
    camp: {x: t.cx, y: t.cy, cells: [], set: null},
    stock: {}, agents: [], buildings: [], gardenCells: [], armory: [], fx: [], corpses: [], graves: [], graveyard: null,
    nextId: 1, nameIdx: 0, bldSeq: 0,
    wind: {dir: cfg.windDir, str: cfg.windStr / 100, x: 0, y: 0},
    weather: {rain: 0, rainLeft: 0},
    stats: {fireCount: 0, fireNearCamp: 0, burntCells: 0, spoiledToday: 0, lastSteal: -999, hunted: 0, wolfKills: 0, wolfAttacks: 0, crafted: 0, broken: 0, raids: 0},
    campLit: false, mods: emptyMods(), cache: {}, outside: null, caravan: null, trade: newTradeState(), chronicle: newChronicle(), over: null,
    behave: newBehaviour(),
    council: {lastDay: -1, goal: null, votes: [], args: [], decision: 'Первый совет соберётся сегодня вечером у костра.'},
    logLines: [], logVersion: 0, nav: null,
  };
  const g = world.grid;
  for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) world.camp.cells.push((t.cy + yy) * t.w + t.cx + xx);
  world.camp.set = new Set(world.camp.cells);

  for (let i = 0; i < n; i++) {
    const tt = g.terr[i];
    g.fuel[i] = BY_CODE[tt].fuel;
    if (tt === T.FOREST) { g.wood[i] = 0.6 + 0.4 * t.rng(); g.fuel[i] += g.wood[i]; }
    else if (BY_CODE[tt].bush > 0 && t.rng() < 0.07 * BY_CODE[tt].bush * g.fert[i] && !isCampArea(world, i)) { g.bush[i] = 1; g.food[i] = 0.5 + 0.5 * t.rng(); g.fuel[i] += 0.2; }
  }
  for (const r of RESOURCES.all()) world.stock[r.id] = STOCKS[cfg.stock].stock[r.id] || 0;
  findLakes(world);
  layOre(world);
  layPlants(world);
  recomputeZone(world);
  initOutside(world);
  setWind(world);
  return world;
}
