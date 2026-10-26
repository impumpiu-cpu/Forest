// The caravan's healing potions (data/potions.js POTION): each member's slot (m.potions, at most POTION.slot), the spare
// ones and the herbs in the cargo (K.cargo.potion, K.cargo.herbs). On the local map the slots go with the people
// (campaign/camp.js) and the stock fills them (settlement/potions.js); on the world map the cargo tops them up, a day of
// camp with the healer's hut gathers herbs and brews them (campaign/march.js campWork), and the quick mode's fight lets
// a member at the edge drink one (campaign/fight.js autoFight).
import {SPECIES} from '../data/species.js';
import {POTION} from '../data/potions.js';
import {alive} from './march.js';
import {hasBuilding} from './baggage.js';

const carriers = K => alive(K).filter(m => !m.captive && !m.former);
// the spare potions of the cargo into the slots, to whoever carries fewest
export function topUp(K) {
  for (;;) {
    if (!((K.cargo.potion || 0) >= 1)) return;
    const m = carriers(K).filter(x => (x.potions || 0) < POTION.slot).sort((p, q) => (p.potions || 0) - (q.potions || 0))[0];
    if (!m) return;
    m.potions = (m.potions || 0) + 1; K.cargo.potion--;
    if (!K.cargo.potion) delete K.cargo.potion;
  }
}
// slots still empty, the spare in the cargo counted
export const potionRoom = K => carriers(K).reduce((s, m) => s + POTION.slot - (m.potions || 0), 0) - (K.cargo.potion || 0);
// a day of camp: with the healer's hut in the camp a healing herb may be gathered; herbs are brewed while there is room.
// → the potions brewed
export function brewDay(K, r, wooded) {
  if (!hasBuilding(K, 'healerhut')) return 0;
  if (r() < POTION.camp.herbs * (wooded ? POTION.camp.wooded : 1)) K.cargo.herbs = (K.cargo.herbs || 0) + 1;
  let n = 0;
  while ((K.cargo.herbs || 0) >= POTION.herbs && potionRoom(K) > 0) { K.cargo.herbs -= POTION.herbs; K.cargo.potion = (K.cargo.potion || 0) + 1; n++; }
  if (K.cargo.herbs === 0) delete K.cargo.herbs;
  topUp(K);
  return n;
}
// what a potion gives a member as a share of its health (m.hp is a share: a potion heals POTION.heal of a body of its race's)
export const potionShare = m => POTION.heal / (SPECIES.get(m.race)?.hp || 1);
// the quick mode: one hurt to the edge drinks — → true when it did
export function quaffMember(m) {
  if (!(m.potions > 0) || m.captive || m.hp <= 0 || m.hp >= POTION.below) return false;
  m.potions--; m.hp = Math.min(1, m.hp + potionShare(m));
  return true;
}
