// Rocks and ores of the world map, from the tectonics (atlas/tectonics.js) and the relief.
// Each rock scores the cell by how well the setting suits it; a patch of noise per rock breaks up the
// edges, and the best score wins. Ores follow the rocks and the setting (data/geology.js ORE_GENESIS),
// gathered into districts by a province noise per ore.
import {fbm} from './noise.js';
import {warmth} from './latitude.js';
import {scaleOf} from './tectonics.js';
import {ROCKS, ROCK_BY_CODE, ORE_GENESIS} from '../data/geology.js';
import {LEVELS} from '../data/regions.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// the setting factors of one cell, 0..1 (the names ORE_GENESIS `settings` use)
//   low  — flat lowland near sea level;  hill — raised ground;
//   warm — the warmth the rocks were laid down in: today's latitude mixed with the old one (paleo),
//          since continents drift and an old warm sea can lie in today's north
function settingOf(a, i, flat) {
  const f = a.f, e = f.elev[i], rel = (e - a.sea) / (1 - a.sea), y = (i / a.w) | 0;
  const low = f.land[i] ? clamp01(1 - rel / 0.25) * (0.4 + 0.6 * flat) : 0;
  const warm = 0.4 * warmth(a, y) + 0.6 * (f.paleo ? f.paleo[i] : 0.5);
  return {coll: f.coll[i], arc: f.arc[i], basv: f.basv[i], volc: f.volc[i], oldv: f.oldv[i], craton: f.craton[i], low, hill: clamp01(rel / 0.25), warm, rel};
}

// how flat the ground is around a cell: 1 on a plain, 0 on a steep slope
function flatness(a) {
  const {w, h, n} = a, e = a.f.elev, out = new Float32Array(n), k = scaleOf(a);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, gx = e[y * w + Math.min(w - 1, x + 1)] - e[y * w + Math.max(0, x - 1)], gy = e[Math.min(h - 1, y + 1) * w + x] - e[Math.max(0, y - 1) * w + x];
    out[i] = clamp01(1 - Math.hypot(gx, gy) * 30 * k);
  }
  return out;
}

// how well each rock suits a cell; roughly 0..1, the best wins
const SCORE = {
  basalt: s => 1.15 * s.basv,
  andesite: s => 1.5 * s.arc * (0.4 + s.volc),
  granite: s => 0.12 + 0.6 * s.arc + 0.35 * s.coll + 0.25 * s.craton + 0.35 * s.hill * (1 - s.coll),
  gneiss: s => 0.9 * s.craton * s.craton + 0.3 * s.coll * (s.rel > 0.4 ? 1 : 0),
  schist: s => 0.85 * s.coll,
  sandstone: s => 0.3 + 0.35 * s.hill * (1 - s.craton),
  limestone: s => 1.1 * s.low * s.warm + (s.shelf ? 0.7 * s.warm : 0),
  shale: s => 1.1 * s.low * (1 - 0.55 * s.warm),
};

export function rocks(a, rnd) {
  const {w, h, n} = a, all = ROCKS.all();
  const jitter = all.map(() => fbm(rnd, w, h, Math.max(w, h) / 12, 6, 0.6));
  a.f.paleo = fbm(rnd, w, h, Math.max(w, h) / 3, 3, 0.5);
  const flat = flatness(a), rock = new Uint8Array(n), cnt = {};
  for (let i = 0; i < n; i++) {
    const s = settingOf(a, i, flat[i]);
    const depth = a.f.land[i] ? 0 : (a.sea - a.f.elev[i]) / (a.sea || 1);
    s.shelf = !a.f.land[i] && depth < 0.12;
    let best = 'basalt', bs = -Infinity;
    if (a.f.land[i] || s.shelf) for (let r = 0; r < all.length; r++) {
      const v = SCORE[all[r].id](s) + 0.35 * (jitter[r][i] - 0.5);
      if (v > bs) { bs = v; best = all[r].id; }
    }
    rock[i] = ROCKS.get(best).code;
    if (a.f.land[i]) { const kd = ROCKS.get(best).kind; cnt[kd] = (cnt[kd] || 0) + 1; }
  }
  a.f.rock = rock; a.f.flat = flat;
  return cnt;
}

export const levelOf = (pot, lv) => (pot < lv[0] ? LEVELS[0] : pot < lv[1] ? LEVELS[1] : pot < lv[2] ? LEVELS[2] : LEVELS[3]);

export function ores(a, rnd) {
  const {w, h, n} = a, rich = {}, f = a.f;
  // the setting factors as whole fields, worked out once for every ore
  const low = new Float32Array(n), warm = new Float32Array(n);
  for (let i = 0; i < n; i++) { const s = settingOf(a, i, f.flat[i]); low[i] = s.low; warm[i] = s.warm; }
  const fields = {coll: f.coll, arc: f.arc, basv: f.basv, volc: f.volc, oldv: f.oldv, craton: f.craton, low, warm};
  for (const o of ORE_GENESIS.filter(x => !x.from)) {
    const prov = fbm(rnd, w, h, Math.max(w, h) / 9, 4, 0.55), pot = new Float32Array(n);
    const byRock = [], sets = Object.entries(o.settings).map(([key, wt]) => [fields[key], wt]);
    for (const r of ROCK_BY_CODE) if (r) byRock[r.code] = o.rocks[r.id] || 0;
    let r = 0;
    for (let i = 0; i < n; i++) {
      let v = byRock[f.rock[i]] || 0;
      for (const [fld, wt] of sets) v += wt * fld[i];
      pot[i] = clamp01(Math.min(1, v) * (0.2 + prov[i]));
      if (f.land[i] && pot[i] >= o.levels[2]) r++;
    }
    f[`ore_${o.id}`] = pot; rich[o.id] = r;
  }
  return rich;
}

// what a cell holds, in the terms of a region (data/regions.js): the first piece of the seam
export function cellGeology(a, i) {
  const out = {rock: ROCK_BY_CODE[a.f.rock?.[i]] || null, ores: {}, flags: {}};
  if (!a.f.rock) return out;
  for (const o of ORE_GENESIS.all()) {
    const pot = a.f[`ore_${o.id}`]; if (!pot) continue;
    const lv = levelOf(pot[i], o.levels);
    if (o.region === 'goldVein' || o.region === 'magma') out.flags[o.region] = lv >= 1;
    else if (o.region === 'placer') out.placer = lv;
    else out.ores[o.region] = lv;
  }
  return out;
}
