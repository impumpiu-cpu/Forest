// World generation. makeTerrain is pure (the menu preview uses it too); createWorld builds the full state.
import {newBehaviour} from '../settlement/behaviour.js';
import {mulberry, seedNumber, newStreams} from '../core/rng.js';
import {clamp} from '../core/util.js';
import {HOUR} from '../core/time.js';
import {T, BY_CODE, OPEN, TERRAIN} from '../data/terrain.js';
import {BIOMES} from '../data/biomes.js';
import {makeSite, paintOrder, SIDES} from './site.js';
import {findPath} from '../nav/astar.js';
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
  const gates = layGates(site, {w, h, terr, under, cx, cy});
  return {w, h, terr, hgt, fert, under, biome, cx, cy, rng, site, gates};
}

// the gate cell of a side: `at` along that edge, moved to the nearest passable cell of the edge
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
  const {w, h, terr, under} = t, out = [];
  const tmp = {w, h, n: w * h, grid: {terr}};
  for (const g of site.gates || []) {
    const i = gateCell(t, g), gate = {...g, i, x: i % w, y: (i / w) | 0, road: false};
    if (!BY_CODE[terr[i]].walkable) { terr[i] = OPEN[under[i]] ? under[i] : T.GRASS; }
    if (g.kind === 'road') {
      const path = findPath(tmp, gate.x, gate.y, t.cx, t.cy, w * h * 2);
      if (path) {
        for (const j of [i, ...path]) if (Math.abs((j % w) - t.cx) > 1 || Math.abs(((j / w) | 0) - t.cy) > 1) { terr[j] = T.ROAD; under[j] = T.ROAD; }
        gate.road = true;
      }
    }
    out.push(gate);
  }
  return out;
}

export function createWorld(cfg) {
  const t = makeTerrain(cfg), n = t.w * t.h;
  const f32 = () => new Float32Array(n);
  const world = {
    cfg: {...cfg}, climate: t.site.climate, calendar: {startDay: t.site.startDay},
    w: t.w, h: t.h, n, rng: t.rng, rngs: newStreams(cfg.seed), tick: Math.round(7 * HOUR),
    site: t.site, region: t.site.region, gates: t.gates,
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
