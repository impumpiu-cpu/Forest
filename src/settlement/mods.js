// Colony-wide modifiers, recomputed whenever a building is finished or lost, an animal is tamed or
// lost, or a town-made tool comes or goes: finished buildings' `effects`, tame animals' work
// (data/species.js, tame.effects, for up to tame.stack of a kind) and keys in the stock
// (data/resources.js, `effects`, some only `with` a tame animal of a kind).
import {BUILDINGS} from '../data/buildings.js';
import {SPECIES} from '../data/species.js';
import {RESOURCES} from '../data/resources.js';

export function emptyMods() {
  return {
    add: {beds: 0, popCap: 0, coolCamp: 0, huntRange: 0, bedWarmth: 0},
    mul: {spoil: 1, defense: 1, loot: 1, douse: 1, wear: 1},
    yield: {}, jobSpeed: {}, toolWear: {}, best: {},
  };
}

function merge(m, e) {
  for (const [k, v] of Object.entries(e.add || {})) m.add[k] = (m.add[k] || 0) + v;
  for (const [k, v] of Object.entries(e.mul || {})) m.mul[k] = (m.mul[k] ?? 1) * v;
  for (const [k, v] of Object.entries(e.yield || {})) m.yield[k] = (m.yield[k] ?? 1) * v;
  for (const [k, v] of Object.entries(e.jobSpeed || {})) m.jobSpeed[k] = (m.jobSpeed[k] ?? 1) * v;
  for (const [k, v] of Object.entries(e.toolWear || {})) m.toolWear[k] = (m.toolWear[k] ?? 1) * v;
  for (const [k, v] of Object.entries(e.best || {})) m.best[k] = Math.max(m.best[k] ?? 1, v);
}

export function recomputeMods(w) {
  const m = emptyMods();
  for (const b of w.buildings) if (b.done) merge(m, BUILDINGS.get(b.key).effects || {});
  const tame = {};
  for (const a of w.agents) if (a.tame && !a.dead) tame[a.species] = (tame[a.species] || 0) + 1;
  for (const [sp, n] of Object.entries(tame)) {
    const T = SPECIES.get(sp).tame;
    if (T.effects) for (let k = 0; k < Math.min(n, T.stack || 1); k++) merge(m, T.effects);
  }
  for (const r of RESOURCES.filter(x => x.effects)) if ((w.stock[r.id] || 0) >= 1 && (!r.with || tame[r.with])) merge(m, r.effects);
  w.mods = m;
}

export const yieldOf = (w, res) => w.mods.yield[res] ?? 1;
export const jobSpeedOf = (w, job) => w.mods.jobSpeed[job] ?? 1;
