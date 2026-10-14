// Needs, harm and healing for any agent, driven by NEEDS and the agent's species.
import {NEEDS} from '../data/needs.js';
import {SPECIES} from '../data/species.js';
import {cellOf} from '../world/grid.js';
import {kill, maxHp} from './agent.js';
import {think} from './mind.js';

const NEED_THOUGHT = {food: 'starving', warmth: 'freezing', rest: 'exhausted'};

// remembered hardships use the need's `memory` key once the level drops below `remember`
const REMEMBER_BELOW = {food: 0.3, rest: 0.25, warmth: 0.4};

export function stepBody(w, a) {
  const sp = SPECIES.get(a.species), T = w.grid.temp[cellOf(w, a)];
  let starving = null;
  for (const id of sp.needs) {
    const n = NEEDS.get(id);
    a.needs[id] = Math.min(1, Math.max(0, a.needs[id] - n.decay(w, a, T)));
    if (a.needs[id] <= (n.harmBelow ?? 0) && n.harm) { a.hp -= n.harm; starving = n.cause; }
    if (n.memory && a.needs[id] < (REMEMBER_BELOW[id] ?? 0.3)) a.mem[n.memory] += 0.004;
    if (a.diary && a.needs[id] < 0.15) think(w, a, NEED_THOUGHT[id]);
  }
  if (T > sp.heatHarm) a.hp -= Math.min(0.005, (T - sp.heatHarm) * 0.00004);
  // venom from a bite (agents/combat.js): it wears off by itself
  if (a.poison) { if (w.tick < a.poison.until) { a.hp -= a.poison.dmg; starving = starving || 'яда'; } else a.poison = null; }
  const comfy = sp.needs.every(id => a.needs[id] > 0.4);
  // wounds close faster in some races (orcs, trolls: mods.regen); fire close by stops a troll's
  const regen = a.mods.regen > 1 && T > 30 ? 1 : a.mods.regen ?? 1;
  if (comfy && T < 45) a.hp = Math.min(maxHp(a), a.hp + 0.0003 * maxHp(a) * regen);
  if (a.hp <= 0) kill(w, a, starving || (T > 60 ? 'пожара' : 'ран'));
  return T;
}
