// Melee between hostile agents.
import {isHostile} from '../data/factions.js';
import {kill} from './agent.js';
import {cellOf} from '../world/grid.js';
import {SPECIES} from '../data/species.js';

// an agent that is attacking one of ours counts as an enemy even without a war between factions
export const aggressor = (a, o) => o.task?.id === 'maul' && o.task.target && (o.task.target === a || o.task.target.faction === a.faction);

export function nearestHostile(w, a, r) {
  let best = null, bd = r * r;
  for (const o of w.agents) {
    if (o === a || o.dead || !(isHostile(a, o) || aggressor(a, o))) continue;
    const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function attack(w, a, t) {
  if (a.cd > 0) return;
  const dCamp = w.nav.get('camp');
  const home = a.faction === 'colony' && dCamp[cellOf(w, a)] < 8 ? 1.5 : 1;          // defenders fight harder at home
  const wall = t.faction === 'colony' && dCamp[cellOf(w, t)] < 8 ? w.mods.mul.defense : 1;
  const atk = SPECIES.get(a.species).attack || {power: 1, cooldown: 12};
  a.cd = atk.cooldown; a.flash = 4;
  t.hp -= (0.1 + Math.random() * 0.12) * atk.power * home * wall;
  const memKey = a.species === 'wolf' || t.species === 'wolf' ? 'wolf' : 'raid';
  if (t.faction === 'colony') t.mem[memKey] += 0.25; else if (a.faction === 'colony') a.mem[memKey] += 0.1;
  if (t.hp <= 0) kill(w, t, 'ран', a);
}
