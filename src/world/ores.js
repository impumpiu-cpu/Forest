// Ore in the rocks. Every rock cell may hold one kind of ore (grid.ore, a code from ORE) and an
// amount (grid.oreLeft, units). Miners dig it from a walkable cell beside the rock face; a vein
// runs dry and becomes plain stone. Veins are laid out once, from their own random stream, so
// adding ore did not change the rest of a world made from the same seed.
import {mulberry, seedNumber} from '../core/rng.js';
import {T, WALKABLE} from '../data/terrain.js';
import {DX, DY} from './grid.js';

export const ORE = {iron: 1, coal: 2, gems: 3};
export const ORE_LABEL = {1: 'железная руда', 2: 'каменный уголь', 3: 'самоцветы'};

// how strongly cell i shows ore `code` on the resource layer (0 = none)
export function oreAt(w, i, code) {
  const g = w.grid;
  if (!g.ore || g.ore[i] !== code) return 0;
  return 0.75 + 0.25 * Math.min(1, g.oreLeft[i] / 10);
}

// a rock cell next to walkable cell i that still holds one of `codes` (a Set), or -1
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

// how much ore of each kind miners can reach right now: {code: units}
export function exposedOre(w) {
  const g = w.grid, out = {1: 0, 2: 0, 3: 0};
  if (!g.ore) return out;
  for (let i = 0; i < w.n; i++) if (g.ore[i] && g.oreLeft[i] > 0 && exposed(w, i)) out[g.ore[i]] += g.oreLeft[i];
  return out;
}

// lay out veins: iron and coal in broad seams, gems in rare pockets; makes sure each kind shows
// on the rock face at least once when the map has rock at all
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
  const ironN = seam(7), coalN = seam(8);
  const rocks = [];
  for (let i = 0; i < n; i++) {
    if (g.terr[i] !== T.ROCK) continue;
    rocks.push(i);
    const r = rnd();
    if (ironN(i) > 0.66) { g.ore[i] = ORE.iron; g.oreLeft[i] = 6 + Math.floor(r * 7); }
    else if (coalN(i) > 0.68) { g.ore[i] = ORE.coal; g.oreLeft[i] = 6 + Math.floor(r * 7); }
    else if (r < 0.035) { g.ore[i] = ORE.gems; g.oreLeft[i] = 2 + Math.floor(rnd() * 3); }
  }
  // every kind of ore should be reachable somewhere: plant a small vein on the rock face if not
  const face = rocks.filter(i => exposed(w, i));
  if (!face.length) return;
  const have = exposedOre(w);
  for (const code of [ORE.iron, ORE.coal, ORE.gems]) {
    if (have[code] >= (code === ORE.gems ? 4 : 12)) continue;
    const start = face[Math.floor(rnd() * face.length)], size = code === ORE.gems ? 2 : 5;
    const sx = start % w.w, sy = (start / w.w) | 0;
    let placed = 0;
    for (let rad = 0; rad <= 3 && placed < size; rad++) for (let yy = -rad; yy <= rad && placed < size; yy++) for (let xx = -rad; xx <= rad && placed < size; xx++) {
      const x = sx + xx, y = sy + yy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const j = y * w.w + x;
      if (g.terr[j] !== T.ROCK || g.ore[j] === code) continue;
      g.ore[j] = code; g.oreLeft[j] = code === ORE.gems ? 3 : 8; placed++;
    }
  }
}

// older saves have no ore yet: lay it out now (the world's own random stream is not touched)
export function ensureOre(w) { if (!w.grid.ore) layOre(w); }
