// World generation. makeTerrain is pure (the menu preview uses it too); createWorld builds the full state.
import {newBehaviour} from '../settlement/behaviour.js';
import {mulberry, seedNumber, newStreams} from '../core/rng.js';
import {clamp} from '../core/util.js';
import {HOUR} from '../core/time.js';
import {T, BY_CODE} from '../data/terrain.js';
import {SIZES, CLIMATES, STOCKS} from '../data/presets.js';
import {RESOURCES} from '../data/resources.js';
import {initOutside} from '../outside/index.js';
import {emptyMods} from '../settlement/mods.js';
import {isCampArea} from './grid.js';
import {setWind} from './weather.js';
import {recomputeZone} from '../settlement/zone.js';
import {newChronicle} from '../settlement/chronicle.js';
import {findLakes} from './lakes.js';
import {layOre} from './ores.js';
import {rollRegion} from './region.js';
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
function fbm(rnd, w, h) {
  const k = Math.sqrt(w * h / (128 * 96));
  const layers = [[36 * Math.min(k, 1.3), 0.5], [18, 0.27], [9, 0.15], [4, 0.08]].map(([c, wt]) => [noiseLayer(rnd, w, h, c), wt]);
  const n = w * h, o = new Float32Array(n); let mn = 1e9, mx = -1e9;
  for (let i = 0; i < n; i++) { let v = 0; for (const [l, wt] of layers) v += l[i] * wt; o[i] = v; if (v < mn) mn = v; if (v > mx) mx = v; }
  for (let i = 0; i < n; i++) o[i] = (o[i] - mn) / (mx - mn);
  return o;
}

export function makeTerrain(cfg) {
  const {w, h} = SIZES[cfg.size], n = w * h;
  const rng = mulberry(seedNumber(cfg.seed));
  const hgt = fbm(rng, w, h), moist = fbm(rng, w, h);
  const waterLvl = [0.2, 0.3, 0.4][cfg.water], rockLvl = [0.88, 0.8, 0.7][cfg.rock], forestLvl = [0.66, 0.56, 0.44][cfg.forest];
  const terr = new Uint8Array(n), fert = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const hh = hgt[i], m = moist[i];
    terr[i] = hh < waterLvl ? T.WATER : hh > rockLvl ? T.ROCK : m > forestLvl ? T.FOREST : T.GRASS;
    fert[i] = clamp(m * 1.25 - (hh - 0.5) * 0.6, 0.05, 1);
  }
  // camp: dry spot nearest to the centre with a clear 7×7 around it
  let best = -1, bd = 1e9;
  const mx = Math.round(w * 0.12), my = Math.round(h * 0.12);
  const blocked = t => !BY_CODE[t].walkable;
  for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) {
    if (blocked(terr[y * w + x])) continue;
    let ok = true;
    for (let yy = -3; yy <= 3 && ok; yy++) for (let xx = -3; xx <= 3; xx++) if (blocked(terr[(y + yy) * w + x + xx])) { ok = false; break; }
    if (!ok) continue;
    const d = (x - w / 2) ** 2 + (y - h / 2) ** 2; if (d < bd) { bd = d; best = y * w + x; }
  }
  if (best < 0) best = (h >> 1) * w + (w >> 1);
  const cx = best % w, cy = (best / w) | 0;
  for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) terr[(cy + yy) * w + cx + xx] = T.GRASS;
  return {w, h, terr, hgt, fert, cx, cy, rng};
}

export function createWorld(cfg) {
  const t = makeTerrain(cfg), n = t.w * t.h;
  const f32 = () => new Float32Array(n);
  const world = {
    cfg: {...cfg}, climate: CLIMATES[cfg.climate],
    w: t.w, h: t.h, n, rng: t.rng, rngs: newStreams(cfg.seed), tick: Math.round(7 * HOUR),
    grid: {terr: t.terr, hgt: t.hgt, fert: t.fert, food: f32(), wood: f32(), fuel: f32(), fire: f32(),
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
    else if (tt === T.GRASS && t.rng() < 0.07 * g.fert[i] && !isCampArea(world, i)) { g.bush[i] = 1; g.food[i] = 0.5 + 0.5 * t.rng(); g.fuel[i] += 0.2; }
  }
  for (const r of RESOURCES.all()) world.stock[r.id] = STOCKS[cfg.stock].stock[r.id] || 0;
  findLakes(world);
  world.region = rollRegion(cfg.seed);
  layOre(world);
  layPlants(world);
  recomputeZone(world);
  initOutside(world);
  setWind(world);
  return world;
}
