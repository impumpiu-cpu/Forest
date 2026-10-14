// Ore in the rocks. Every rock cell may hold one kind of ore (grid.ore, a `code` from data/ores.js)
// and an amount (grid.oreLeft, units). Miners dig it from a walkable cell beside the rock face;
// a worked-out vein leaves a passage. Veins are laid out once, from their own random stream, so
// ore does not change the rest of a world made from the same seed.
import {mulberry, seedNumber} from '../core/rng.js';
import {T, WALKABLE} from '../data/terrain.js';
import {ORES, ORE_BY_CODE} from '../data/ores.js';
import {DX, DY} from './grid.js';
import {oreLevel} from './region.js';

export const oreOf = (w, i) => (w.grid.ore?.[i] ? ORE_BY_CODE[w.grid.ore[i]] : null);

// how strongly cell i shows ore `code` on the resource layer (0 = none)
export function oreAt(w, i, code) {
  const g = w.grid;
  if (!g.ore || g.ore[i] !== code) return 0;
  return 0.75 + 0.25 * Math.min(1, g.oreLeft[i] / 10);
}

// a rock cell next to walkable cell i that still holds ore with a code in `codes` (a Set; null = any), or -1
export function oreBeside(w, i, codes) {
  const g = w.grid; if (!g.ore) return -1;
  const x = i % w.w, y = (i / w.w) | 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k], ny = y + DY[k];
    if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
    const j = ny * w.w + nx;
    if (g.ore[j] && g.oreLeft[j] > 0 && (!codes || codes.has(g.ore[j]))) return j;
  }
  return -1;
}

// a rock cell that a miner can reach: it touches a walkable cell
function exposed(w, i) {
  const x = i % w.w, y = (i / w.w) | 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k], ny = y + DY[k];
    if (nx >= 0 && ny >= 0 && nx < w.w && ny < w.h && WALKABLE[w.grid.terr[ny * w.w + nx]]) return true;
  }
  return false;
}

function countExposed(w) {
  const g = w.grid, out = Object.fromEntries(ORES.all().map(o => [o.id, 0]));
  if (!g.ore) return out;
  for (let i = 0; i < w.n; i++) if (g.ore[i] && g.oreLeft[i] > 0 && exposed(w, i)) out[ORE_BY_CODE[g.ore[i]].id] += g.oreLeft[i];
  return out;
}

// how much ore of each kind miners can reach: {oreId: units}. A full map scan, so the answer is
// kept for a game hour (panels and the council ask often, the rock face changes slowly)
export function exposedOre(w) {
  const c = w.cache.exposedOre;
  if (c && w.tick - c.tick < 50 && w.tick >= c.tick) return c.v;
  const v = countExposed(w);
  w.cache.exposedOre = {tick: w.tick, v};
  return v;
}
export const oreSeen = w => Object.values(exposedOre(w)).some(v => v > 0);

// lay out veins (see data/ores.js); makes sure each kind shows on the rock face when the map has rock
export function layOre(w) {
  const n = w.n, g = w.grid, rnd = mulberry(seedNumber(String(w.cfg.seed) + ':ore'));
  g.ore = new Uint8Array(n); g.oreLeft = new Float32Array(n);
  const seam = cell => {
    const gw = Math.ceil(w.w / cell) + 2, gh = Math.ceil(w.h / cell) + 2, pts = new Float32Array(gw * gh).map(() => rnd());
    return i => {
      const fx = (i % w.w) / cell, fy = ((i / w.w) | 0) / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      const a = pts[iy * gw + ix], b = pts[iy * gw + ix + 1], c = pts[(iy + 1) * gw + ix], d = pts[(iy + 1) * gw + ix + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
  };
  // the region decides which ores there are and how much: a richer level lowers a seam's threshold
  // and makes pockets more frequent (data/regions.js)
  const kinds = ORES.filter(o => !o.event && oreLevel(w, o.id) > 0).map(o => ({o, lvl: oreLevel(w, o.id), noise: o.vein.seam ? seam(o.vein.seam) : null}));
  const amount = ([lo, hi], r) => lo + Math.floor(r * (hi - lo + 1));
  const face = [];
  for (let i = 0; i < n; i++) {
    if (g.terr[i] !== T.ROCK) continue;
    if (exposed(w, i)) face.push(i);
    const r = rnd();
    for (const {o, lvl, noise} of kinds) {
      const v = o.vein;
      if (noise ? noise(i) > v.above + (1 - lvl) * 0.07 : r < v.pocket * lvl) {
        g.ore[i] = o.code; g.oreLeft[i] = amount(v.amount, noise ? r : rnd());
        break;
      }
    }
  }
  // every kind should be reachable somewhere: plant a small vein on the rock face if not
  if (!face.length) return;
  const have = countExposed(w);
  for (const {o, lvl} of kinds) {
    if (have[o.id] >= (o.reach || 0) * Math.min(1, lvl)) continue;
    const start = face[Math.floor(rnd() * face.length)], sx = start % w.w, sy = (start / w.w) | 0;
    let placed = 0;
    for (let rad = 0; rad <= 3 && placed < o.plant; rad++) for (let yy = -rad; yy <= rad && placed < o.plant; yy++) for (let xx = -rad; xx <= rad && placed < o.plant; xx++) {
      const x = sx + xx, y = sy + yy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const j = y * w.w + x;
      if (g.terr[j] !== T.ROCK || g.ore[j] === o.code) continue;
      g.ore[j] = o.code; g.oreLeft[j] = Math.max(1, Math.round(o.plantAmount * Math.min(1, lvl))); placed++;
    }
  }
}

// older saves have no ore yet: lay it out now (the world's own random stream is not touched)
export function ensureOre(w) { if (!w.grid.ore) layOre(w); }
