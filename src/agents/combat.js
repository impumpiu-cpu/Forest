// Melee between hostile agents.
import {isHostile} from '../data/factions.js';
import {kill} from './agent.js';
import {cellOf} from '../world/grid.js';

export function nearestHostile(w, a, r) {
  let best = null, bd = r * r;
  for (const o of w.agents) {
    if (o === a || o.dead || !isHostile(a, o)) continue;
    const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function attack(w, a, t) {
  if (a.cd > 0) return;
  const dCamp = w.nav.get('camp');
  const home = a.faction === 'colony' && dCamp[cellOf(w, a)] < 8 ? 1.5 : 1;          // defenders fight harder at home
  const wall = t.faction === 'colony' && dCamp[cellOf(w, t)] < 8 ? w.mods.mul.defense : 1;
  a.cd = 12; a.flash = 4;
  t.hp -= (0.1 + Math.random() * 0.12) * home * wall;
  if (t.faction === 'colony') t.mem.raid += 0.25; else if (a.faction === 'colony') a.mem.raid += 0.1;
  if (t.hp <= 0) kill(w, t, 'ран', a);
}
