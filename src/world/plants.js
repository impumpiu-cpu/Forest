// Wild plant beds (data/plants.js): laid out once when the world is made, from their own random
// stream (so they do not change the rest of a world made from the same seed), regrowing every few
// ticks. A bed under fire loses its plant; burnt ground stays bare until grass comes back.
import {mulberry, seedNumber} from '../core/rng.js';
import {TERRAIN, T} from '../data/terrain.js';
import {PLANTS, plantLayer} from '../data/plants.js';
import {isCampArea} from './grid.js';
import {season} from '../data/seasons.js';

const EVERY = 10;   // regrow beds this often (ticks)

export function layPlants(w) {
  w.plantBeds ??= {};
  for (const p of PLANTS.all()) {
    const key = plantLayer(p.id);
    if (w.grid[key]) continue;
    const rnd = mulberry(seedNumber(String(w.cfg.seed) + ':' + key)), g = w.grid;
    const layer = new Float32Array(w.n), beds = [], ok = new Set(p.terrain.map(t => TERRAIN.get(t).code));
    for (let i = 0; i < w.n; i++) {
      if (!ok.has(g.terr[i]) || g.fert[i] < p.fertMin || isCampArea(w, i)) continue;
      if (rnd() < p.chance) { beds.push(i); layer[i] = p.start[0] + rnd() * (p.start[1] - p.start[0]); }
    }
    g[key] = layer; w.plantBeds[p.id] = beds;
  }
}

export function stepPlants(w) {
  if (w.tick % EVERY) return;
  const g = w.grid, grow = season(w).grow;
  if (!grow) return;   // nothing grows in winter
  for (const p of PLANTS.all()) {
    const layer = g[plantLayer(p.id)], beds = w.plantBeds[p.id]; if (!layer) continue;
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
