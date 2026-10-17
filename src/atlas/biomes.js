// Biomes, soils and forests of the world map.
//
// Biomes (data/biomes.js) after Köppen: the warmest and coldest month (the yearly mean ± half the
// year's swing), the yearly rain against the dryness threshold P_dry = 20·T + 140 mm, the height and
// steepness of the ground, and what the ground is wet with. In order:
//   lakes and great rivers → water;  live volcanoes → volcano;
//   the warmest month below 0° → ice, below 10° → tundra (alpine belt in the mountains);
//   rain below P_dry/2 → desert, below P_dry → steppe (savanna when hot);
//   waterlogged flat lowland → swamp;
//   the coldest month at 18° or more → jungle where the rain never fails, otherwise savanna;
//   a snowy winter (coldest month below −3°) → taiga where the year is cold, broadleaf forest where
//   it is mild, forest steppe where the rain only just suffices;
//   mild winters → dry-summer scrub in warm dry lands, forest steppe or broadleaf forest otherwise;
//   steep ground of any zone below the tree line → foothills, high steep ground → highlands.
// Soils (data/soils.js) follow the biome, the rain, the floodplains and the rock.
// Forests grow as a cellular automaton of growth and fire (Drossel–Schwabl): trees spread from
// their neighbours towards what the biome allows, lightning starts fires that run through dry
// woods, and what burns grows back. Dry lands end up patchy, wet ones closed.
//
// Fields (a.f): biome (Uint8, index into BIOME_LIST + 1; 0 — ocean), soil (index into SOIL_LIST + 1),
// fert (0..1), trees (0..1), burnt (times a cell burnt).
import {BIOMES, KOPPEN} from '../data/biomes.js';
import {SOILS, ROCK_FERT, ALLUVIAL_FROM} from '../data/soils.js';
import {ROCK_BY_CODE} from '../data/geology.js';
import {RIVERS} from '../data/hydrology.js';
import {scaleOf} from './tectonics.js';
import {DIRS8} from './heap.js';

export const BIOME_LIST = BIOMES.all(), SOIL_LIST = SOILS.all();
const B = id => BIOME_LIST.findIndex(b => b.id === id) + 1;
export const biomeAt = (a, i) => (a.f.biome && a.f.biome[i] ? BIOME_LIST[a.f.biome[i] - 1] : null);
export const soilAt = (a, i) => (a.f.soil && a.f.soil[i] ? SOIL_LIST[a.f.soil[i] - 1] : null);
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export const dryness = T => KOPPEN.dryness[0] * T + KOPPEN.dryness[1];

// the Köppen-style choice for one cell
export function classify(c) {
  const K = KOPPEN, Tw = c.T + c.range / 2, Tc = c.T - c.range / 2, Pd = Math.max(1, dryness(c.T));
  if (c.water) return 'water';
  if (c.volc) return 'volcano';
  if (Tw < 0) return 'ice';
  if (Tw < K.treeline) return c.rel > K.mountain ? 'highlands' : 'tundra';
  let z;
  if (c.P < Pd / 2) z = 'desert';
  else if (c.P < Pd) z = c.T >= K.tropics ? 'savanna' : 'steppe';
  else if (c.wet) z = 'swamp';
  else if (Tc >= K.tropics) z = c.P >= K.jungle ? 'jungle' : 'savanna';
  else if (Tc < K.continental) z = c.T < K.taiga ? 'taiga' : c.P < K.forestSteppe * Pd ? 'meadow' : 'forest';
  else if (c.T >= K.warmTemperate && c.P < K.mediterranean * Pd) z = 'shrubland';
  else z = c.P < K.forestSteppe * Pd ? 'meadow' : 'forest';
  // mountain belts: steep high ground; the alpine belt where the summer is too cool for trees came first
  if (c.steep && c.rel > K.mountain && z !== 'swamp') z = c.rel > 0.6 ? 'highlands' : 'foothills';
  return z;
}

export function biomes(a) {
  const f = a.f, n = a.n, k2 = scaleOf(a) ** 2, out = new Uint8Array(n), cnt = {};
  for (let i = 0; i < n; i++) {
    if (f.ocean[i]) continue;
    const rel = (f.elev[i] - a.sea) / (1 - a.sea);
    const id = classify({
      T: f.temp[i], range: f.trange[i], P: f.rain[i], rel,
      water: f.lake[i] >= 0 || f.flow[i] >= RIVERS.great * k2,
      volc: f.volc[i] > 0.65,
      steep: f.flat[i] < 0.45,
      // waterlogged: a flat valley floor or lowland where more falls than the zone can dry
      wet: f.flat[i] > 0.85 && rel < 0.1 && (f.alluvium[i] > 0.6 || f.rain[i] > 2.2 * Math.max(1, dryness(f.temp[i]))),
    });
    out[i] = B(id); cnt[id] = (cnt[id] || 0) + 1;
  }
  f.biome = out;
  return cnt;
}

export function soils(a) {
  const f = a.f, n = a.n, soil = new Uint8Array(n), fert = new Float32Array(n);
  const byBiome = {};
  for (const s of SOIL_LIST) for (const b of s.biomes || []) (byBiome[b] ??= []).push(s);
  const alluvial = SOIL_LIST.findIndex(s => s.id === 'alluvial');
  for (let i = 0; i < n; i++) {
    const b = biomeAt(a, i); if (!b) continue;
    let s;
    if (f.alluvium[i] >= ALLUVIAL_FROM && b.id !== 'water' && b.id !== 'ice') s = SOIL_LIST[alluvial];
    else s = (byBiome[b.id] || []).find(x => !x.rain || (f.rain[i] >= x.rain[0] && f.rain[i] < x.rain[1])) || SOILS.get('none');
    soil[i] = SOIL_LIST.indexOf(s) + 1;
    fert[i] = s.fert > 0 ? clamp01(s.fert + (ROCK_FERT[ROCK_BY_CODE[f.rock[i]]?.id] || 0)) : 0;
  }
  f.soil = soil; f.fert = fert;
}

// the forest automaton
export function vegetation(a, rnd) {
  const {w, h, n} = a, f = a.f, cap = new Float32Array(n), fire = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = biomeAt(a, i); if (!b) continue;
    cap[i] = b.trees;
    const Pd = Math.max(1, dryness(f.temp[i]));
    // lightning finds dry warm woods: the drier the year against the zone, the more fires
    fire[i] = clamp01(1.4 - f.rain[i] / (1.6 * Pd)) * clamp01((f.temp[i] + f.trange[i] / 2) / 25);
  }
  let t = new Float32Array(n), t2 = new Float32Array(n);
  for (let i = 0; i < n; i++) t[i] = cap[i] * rnd() * 0.5;
  const burnt = new Uint8Array(n), steps = 70, stack = [];
  for (let s = 0; s < steps; s++) {
    // growth: towards the cap, faster with wooded neighbours to seed from
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!cap[i]) { t2[i] = 0; continue; }
      let nb = 0, c = 0;
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        nb += t[ny * w + nx]; c++;
      }
      const seed = 0.02 + 0.25 * nb / c;
      t2[i] = t[i] + seed * (cap[i] - t[i]) * (0.6 + 0.4 * rnd());
    }
    [t, t2] = [t2, t];
    // fire: a few strikes, each running through the dry wooded cells around it
    const strikes = Math.max(1, Math.round(n / 12000));
    for (let q = 0; q < strikes; q++) {
      const i0 = (rnd() * n) | 0;
      if (t[i0] < 0.3 || rnd() > fire[i0]) continue;
      stack.push(i0); burnt[i0]++;
      while (stack.length) {
        const c = stack.pop(); t[c] *= 0.1;
        const x = c % w, y = (c / w) | 0;
        for (const [dx, dy] of DIRS8) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (t[j] > 0.3 && rnd() < 0.2 + 0.65 * fire[j]) { t[j] *= 0.1; burnt[j]++; stack.push(j); }
        }
      }
    }
  }
  f.trees = t; f.burnt = burnt;
  let wood = 0, land = 0;
  for (let i = 0; i < n; i++) if (!f.ocean[i]) { land++; wood += t[i]; }
  return wood / (land || 1);
}

// The biomes of a world cell as a region would have them: shares over the cell and its neighbours
// (closer counts more). A forest zone that has burnt or thinned out counts partly as forest steppe,
// and caves add some underground where the rock has them (limestone karst, basalt lava tubes).
export function cellBiomes(a, i, r = 2) {
  const f = a.f, w = a.w, x0 = i % w, y0 = (i / w) | 0, acc = {};
  let tot = 0;
  const add = (id, v) => { acc[id] = (acc[id] || 0) + v; tot += v; };
  for (let y = Math.max(0, y0 - r); y <= Math.min(a.h - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(w - 1, x0 + r); x++) {
    const j = y * w + x, b = biomeAt(a, j); if (!b) continue;
    const wt = 1 / (1 + (x - x0) ** 2 + (y - y0) ** 2);
    const wooded = b.trees > 0.6 ? clamp01(f.trees[j] / b.trees) : 1;
    add(b.id, wt * wooded);
    if (wooded < 1) add('meadow', wt * (1 - wooded));
    const rock = ROCK_BY_CODE[f.rock[j]]?.id, cave = rock === 'limestone' ? 0.15 : rock === 'basalt' ? 0.08 : 0;
    if (cave) add('underground', wt * cave);
  }
  const out = {};
  for (const [id, v] of Object.entries(acc)) { const s = Math.round(v / tot * 100) / 100; if (s >= 0.02) out[id] = s; }
  return out;
}
