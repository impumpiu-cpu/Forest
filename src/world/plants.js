// Wild plant beds (data/plants.js): laid out once when the world is made, from their own random
// stream (so they do not change the rest of a world made from the same seed), regrowing every few
// ticks. A bed under fire loses its plant; burnt ground stays bare until grass comes back.
import {mulberry, seedNumber} from '../core/rng.js';
import {TERRAIN, T, isWater} from '../data/terrain.js';
import {PLANTS, plantLayer} from '../data/plants.js';
import {isCampArea, DX, DY} from './grid.js';
import {season} from '../data/seasons.js';
import {floraLevel} from './region.js';

const EVERY = 10;   // regrow beds this often (ticks)

export function layPlants(w) {
  w.plantBeds ??= {};
  for (const p of PLANTS.all()) {
    const key = plantLayer(p.id);
    if (w.grid[key] && w.plantBeds[p.id]) continue;
    const rnd = mulberry(seedNumber(String(w.cfg.seed) + ':' + key)), g = w.grid, lvl = floraLevel(w, p.id);   // the region's share of these beds
    const layer = new Float32Array(w.n), beds = [], ok = new Set(p.terrain.map(t => TERRAIN.get(t).code));
    const byWater = i => { const x = i % w.w, y = (i / w.w) | 0; for (let k = 0; k < 4; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx >= 0 && ny >= 0 && nx < w.w && ny < w.h && isWater(g.terr[ny * w.w + nx])) return true; } return false; };
    for (let i = 0; i < w.n; i++) {
      if (!ok.has(g.terr[i]) || g.fert[i] < (p.fertMin || 0) || isCampArea(w, i) || (p.nearWater && !byWater(i))) continue;
      if (rnd() < p.chance * lvl) { beds.push(i); layer[i] = p.start[0] + rnd() * (p.start[1] - p.start[0]); }
    }
    g[key] = layer; w.plantBeds[p.id] = beds;
  }
}

export function stepPlants(w) {
  if (w.tick % EVERY) return;
  const g = w.grid, sgrow = season(w).grow;
  for (const p of PLANTS.all()) {
    const grow = p.hardy ? 1 : sgrow;   // nothing grows in winter, but a clay pit still fills
    const layer = g[plantLayer(p.id)], beds = w.plantBeds[p.id]; if (!layer || !grow) continue;
    let ripened = false;
    for (const i of beds) {
      if (g.fire[i] > 0 || g.terr[i] === T.BURNT || g.bld[i] >= 0) { layer[i] = 0; continue; }
      if (layer[i] >= 1) continue;
      const was = layer[i];
      layer[i] = Math.min(1, was + p.regrow * EVERY * grow);
      if (was < p.ripe && layer[i] >= p.ripe) ripened = true;
    }
    if (ripened) w.nav.dirty(plantLayer(p.id));
  }
}

// older saves have no plant beds yet
export const ensurePlants = layPlants;
