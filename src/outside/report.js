// What the colony shows to the world. Once a day (and on demand) the settlement sends out a
// report — what travellers, traders and spies would tell about it. The outside world only ever
// sees this report, never the colony itself; raiders size their bands by it.
import {colonists, foodTotal} from '../settlement/query.js';
import {handItems, def} from '../agents/equipment.js';
import {isWeapon} from '../data/items.js';
import {dayOf} from '../core/time.js';
import {strengthOf} from '../agents/strength.js';

export function colonyReport(w) {
  const col = colonists(w);
  return {
    tick: w.tick, day: dayOf(w.tick),
    pop: col.length,
    armed: col.filter(a => handItems(a).some(it => isWeapon(def(it)))).length,
    armour: +col.reduce((s, a) => s + (a.gear?.armor || 0), 0).toFixed(3),
    // the colony's strength rating as the rumours tell it: everyone at full health, as they are armed
    ks: Math.round(col.reduce((s, a) => s + strengthOf(a), 0)),
    buildings: w.buildings.filter(b => b.done).length,
    food: Math.round(foodTotal(w)),
    wealth: Math.round(Object.values(w.stock).reduce((s, v) => s + v, 0)),
    fallen: !!w.over,
  };
}
