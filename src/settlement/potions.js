// The healing potions of the stock go into its people's slots (data/potions.js POTION): every POTION.hand ticks one each
// to those who carry fewest, up to POTION.slot; what is left waits in the stock (the caravan carries it on: campaign/camp.js).
// Captives and former slaves carry none — they keep out of the fighting.
import {colonists} from './query.js';
import {POTION} from '../data/potions.js';

export function stepPotions(w) {
  if (w.tick % POTION.hand || !(w.stock.potion >= 1)) return;
  const ppl = colonists(w).filter(a => !a.dead && a.diary && !a.captive && !a.former && (a.potions || 0) < POTION.slot).sort((p, q) => (p.potions || 0) - (q.potions || 0));
  for (const a of ppl) { if (!(w.stock.potion >= 1)) break; a.potions = (a.potions || 0) + 1; w.stock.potion--; }
}
