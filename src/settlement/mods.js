// Colony-wide modifiers, recomputed from finished buildings whenever one is finished or lost.
import {BUILDINGS} from '../data/buildings.js';

export function emptyMods() {
  return {
    add: {beds: 0, popCap: 0, coolCamp: 0, huntRange: 0},
    mul: {spoil: 1, defense: 1, loot: 1, douse: 1},
    yield: {}, jobSpeed: {},
  };
}

export function recomputeMods(w) {
  const m = emptyMods();
  for (const b of w.buildings) {
    if (!b.done) continue;
    const e = BUILDINGS.get(b.key).effects || {};
    for (const [k, v] of Object.entries(e.add || {})) m.add[k] = (m.add[k] || 0) + v;
    for (const [k, v] of Object.entries(e.mul || {})) m.mul[k] = (m.mul[k] ?? 1) * v;
    for (const [k, v] of Object.entries(e.yield || {})) m.yield[k] = (m.yield[k] ?? 1) * v;
    for (const [k, v] of Object.entries(e.jobSpeed || {})) m.jobSpeed[k] = (m.jobSpeed[k] ?? 1) * v;
  }
  w.mods = m;
}

export const yieldOf = (w, res) => w.mods.yield[res] ?? 1;
export const jobSpeedOf = (w, job) => w.mods.jobSpeed[job] ?? 1;
