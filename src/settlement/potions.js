// The potions of the stock go to its people (data/potions.js POTION): every POTION.hand ticks the healing ones into the
// slots (one each to those who carry fewest, up to POTION.slot), the others into the belts (POTION.belt places): to each
// in turn the most wanted of the stock against the foes expected (agents/potions.js rebelt: need of data/potions.js; one
// of a kind; a poison or silver oil for the blade only to one with a blade in hand), traded when the foes change. What is left waits in the
// stock (the caravan carries it on: campaign/camp.js). Captives and former slaves carry none — they keep out of the fighting.
// The brews (data/potions.js `home`) stay in the stock: at the same hand-out one freezing drinks a warming one, one worn
// out on the night watch or in an alarm an invigorating one, one hurt or with a grave wound a strengthening one
// (POTION.home); one of a kind at a time.
import {colonists, raidAlarm} from './query.js';
import {POTION, BELT_ORDER, HOME_RES, potionOf, sameKind} from '../data/potions.js';
import {holdsBlade, brewFor, drinkFor, threatOf, rebelt} from '../agents/potions.js';
import {nightness} from '../core/time.js';
import {darkness} from '../agents/combat.js';
import {maxHp} from '../agents/agent.js';

// may this one carry this potion in its belt (a poison for the blade — one who holds a blade)
export const beltFits = (a, res) => potionOf(res)?.potion.use !== 'blade' || holdsBlade(a);

// the foes the colony expects (agents/potions.js threatOf): who is on the map against it now, and who has come before
// (w.chronicle.met, settlement/migration.js) — those on the map count POTION.beltNow times
const FOE_SIDES = new Set(['raiders', 'predators', 'nechist']);
export function expectedFoes(w) {
  const out = {...(w.chronicle.met || {})};
  for (const o of w.agents) if (!o.dead && FOE_SIDES.has(o.faction)) out[o.species] = (out[o.species] || 0) + POTION.beltNow;   // scan: once a hand-out (every POTION.hand ticks)
  return out;
}

export function stepPotions(w) {
  if (w.tick % POTION.hand) return;
  const ppl = colonists(w).filter(a => !a.dead && a.diary && !a.captive && !a.former);
  if (w.stock.potion >= 1) {
    const slots = ppl.filter(a => (a.potions || 0) < POTION.slot).sort((p, q) => (p.potions || 0) - (q.potions || 0));
    for (const a of slots) { if (!(w.stock.potion >= 1)) break; a.potions = (a.potions || 0) + 1; w.stock.potion--; }
  }
  // the belts by need (agents/potions.js rebelt): the most wanted against the foes expected, traded when the foes change
  if (BELT_ORDER.some(res => w.stock[res] >= 1)) {
    const threat = threatOf(expectedFoes(w)), S = w.stock;
    for (const a of ppl.slice().sort((p, q) => (p.belt?.length || 0) - (q.belt?.length || 0)))
      rebelt(a, a.species, r => S[r] || 0, r => { S[r]--; }, r => { S[r] = (S[r] || 0) + 1; }, r => beltFits(a, r), threat);
  }
  if (HOME_RES.some(res => w.stock[res] >= 1)) homeBrews(w, ppl);
  // the cat's eye: the night watch drinks it from its belt once the night is deep
  if (nightness(w) > POTION.dark) for (const a of ppl) if (a.task?.id === 'watch' && a.belt?.length && darkness(w, a) < 1) drinkFor(w, a, 'dark');
}

// the brews of the stock, to whoever's moment has come
function homeBrews(w, ppl) {
  const H = POTION.home;
  for (const a of ppl) {
    if (a.needs?.warmth != null && a.needs.warmth < H.cold) brewFor(w, a, 'cold', w.stock);
    if (a.needs?.rest != null && a.needs.rest < H.tired && !a.sleeping && (a.task?.id === 'watch' || raidAlarm(w))) brewFor(w, a, 'tired', w.stock);
    if (a.hp < H.hurt * maxHp(a) || (a.wounds || []).some(x => x.until != null && x.until > w.tick)) brewFor(w, a, 'mending', w.stock);
    brewFor(w, a, 'mark', w.stock);   // an elixir: whoever lacks its mark (agents/potions.js: never twice)
  }
}
