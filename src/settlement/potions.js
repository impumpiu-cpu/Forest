// The potions of the stock go to its people (data/potions.js POTION): every POTION.hand ticks the healing ones into the
// slots (one each to those who carry fewest, up to POTION.slot), the others into the belts (POTION.belt places): to each
// in turn the first potion of the stock of a kind it does not carry yet, in the table's order — a strong healing one, an
// antidote, a bear's brew, a poison for the blade (only to one with a blade in hand), each kind its strong grade first. What is left waits in the
// stock (the caravan carries it on: campaign/camp.js). Captives and former slaves carry none — they keep out of the fighting.
// The brews (data/potions.js `home`) stay in the stock: at the same hand-out one freezing drinks a warming one, one worn
// out on the night watch or in an alarm an invigorating one, one hurt or with a grave wound a strengthening one
// (POTION.home); one of a kind at a time.
import {colonists, raidAlarm} from './query.js';
import {POTION, BELT_ORDER, HOME_RES, potionOf, sameKind} from '../data/potions.js';
import {holdsBlade, brewFor} from '../agents/potions.js';
import {maxHp} from '../agents/agent.js';

// may this one carry this potion in its belt (a poison for the blade — one who holds a blade)
export const beltFits = (a, res) => potionOf(res)?.potion.use !== 'blade' || holdsBlade(a);

// what to put into one's belt from what there is (`have(res)` — how many are left): → the resource, or null
export function nextForBelt(a, have) {
  if ((a.belt?.length || 0) >= POTION.belt) return null;
  return BELT_ORDER.find(res => have(res) >= 1 && !(a.belt || []).some(b => sameKind(b, res)) && beltFits(a, res)) || null;
}

export function stepPotions(w) {
  if (w.tick % POTION.hand) return;
  const ppl = colonists(w).filter(a => !a.dead && a.diary && !a.captive && !a.former);
  if (w.stock.potion >= 1) {
    const slots = ppl.filter(a => (a.potions || 0) < POTION.slot).sort((p, q) => (p.potions || 0) - (q.potions || 0));
    for (const a of slots) { if (!(w.stock.potion >= 1)) break; a.potions = (a.potions || 0) + 1; w.stock.potion--; }
  }
  if (BELT_ORDER.some(res => w.stock[res] >= 1)) {
    for (const a of ppl.slice().sort((p, q) => (p.belt?.length || 0) - (q.belt?.length || 0))) {
      const res = nextForBelt(a, r => w.stock[r] || 0);
      if (res) { (a.belt ||= []).push(res); w.stock[res]--; }
    }
  }
  if (HOME_RES.some(res => w.stock[res] >= 1)) homeBrews(w, ppl);
}

// the brews of the stock, to whoever's moment has come
function homeBrews(w, ppl) {
  const H = POTION.home;
  for (const a of ppl) {
    if (a.needs?.warmth != null && a.needs.warmth < H.cold) brewFor(w, a, 'cold', w.stock);
    if (a.needs?.rest != null && a.needs.rest < H.tired && !a.sleeping && (a.task?.id === 'watch' || raidAlarm(w))) brewFor(w, a, 'tired', w.stock);
    if (a.hp < H.hurt * maxHp(a) || (a.wounds || []).some(x => x.until != null && x.until > w.tick)) brewFor(w, a, 'mending', w.stock);
  }
}
