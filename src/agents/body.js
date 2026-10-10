// Needs, harm and healing for any agent, driven by NEEDS and the agent's species.
import {NEEDS} from '../data/needs.js';
import {SPECIES} from '../data/species.js';
import {cellOf} from '../world/grid.js';
import {kill} from './agent.js';

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
  }
  if (T > sp.heatHarm) a.hp -= Math.min(0.005, (T - sp.heatHarm) * 0.00004);
  const comfy = sp.needs.every(id => a.needs[id] > 0.4);
  if (comfy && T < 45) a.hp = Math.min(sp.hp, a.hp + 0.0003 * sp.hp);
  if (a.hp <= 0) kill(w, a, starving || (T > 60 ? 'пожара' : 'ран'));
  return T;
}
