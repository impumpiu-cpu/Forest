// How dangerous the next raid is. Grows with time, with every raid already sent and with how
// "fat" the colony has grown: more people, more weapons, more armour.
import {DAY} from '../core/time.js';
import {colonists} from './query.js';
import {handItems, def} from '../agents/equipment.js';
import {isWeapon} from '../data/items.js';

export function raidThreat(w) {
  const col = colonists(w);
  const armed = col.filter(a => handItems(a).some(it => isWeapon(def(it)))).length;
  const armour = col.reduce((s, a) => s + (a.gear?.armor || 0), 0);
  return w.tick / DAY * 0.4 + w.stats.raids * 1.0 + col.length * 0.25 + armed * 0.2 + armour * 2;
}

export const raidSize = w => (colonists(w).length ? Math.min(16, 2 + Math.floor(raidThreat(w) / 3)) : 0);

// settlers: the bigger the colony, the longer until the next one turns up
// (8 or fewer → 1 day, 9 → 2 days, 10 → 3 days…)
export const settlerWaitDays = pop => Math.max(1, pop - 7);
