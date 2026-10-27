// The caravan's potions (data/potions.js): each member's slot of healing potions (m.potions, at most POTION.slot) and
// belt of the others (m.belt, POTION.belt places), the spare ones and their makings in the cargo (K.cargo). On the local
// map slot and belt go with the people (campaign/camp.js) and the stock fills them (settlement/potions.js); on the world
// map the cargo tops them up, a day of camp with the healer's hut gathers herbs and brews the plain grades it can from
// the cargo — always into a pot (campaign/march.js campWork), a town's laboratory brews the strong ones from the
// caravan's makings (campaign/town.js alchemy), and the quick mode's fight lets a member at the edge drink a healing one
// (campaign/fight.js autoFight).
import {SPECIES} from '../data/species.js';
import {POTION, POTION_RES, BELT_ORDER, hutGrades, potionOf, sameKind} from '../data/potions.js';
import {alive} from './march.js';
import {hasBuilding} from './baggage.js';
import {gearDef} from '../agents/equipment.js';
import {CONDITIONS} from '../data/conditions.js';

const carriers = K => alive(K).filter(m => !m.captive && !m.former);
const take = (K, id, n = 1) => { K.cargo[id] -= n; if (K.cargo[id] <= 0) delete K.cargo[id]; };
// a member's belt may take a poison for the blade only if it carries a blade (its hand gear has a melee weapon)
const bladeIn = m => (m.gear?.hand || []).some(tok => !!gearDef(tok)?.melee && !gearDef(tok)?.ranged);
const fitsBelt = (m, res) => potionOf(res)?.potion.use !== 'blade' || bladeIn(m);

// the spare potions of the cargo into the slots and the belts, to whoever carries fewest
export function topUp(K) {
  for (;;) {
    if (!((K.cargo.potion || 0) >= 1)) break;
    const m = carriers(K).filter(x => (x.potions || 0) < POTION.slot).sort((p, q) => (p.potions || 0) - (q.potions || 0))[0];
    if (!m) break;
    m.potions = (m.potions || 0) + 1; take(K, 'potion');
  }
  for (const m of carriers(K).sort((p, q) => (p.belt?.length || 0) - (q.belt?.length || 0))) {
    while ((m.belt?.length || 0) < POTION.belt) {
      const res = BELT_ORDER.find(r => (K.cargo[r] || 0) >= 1 && !(m.belt || []).some(b => sameKind(b, r)) && fitsBelt(m, r));
      if (!res) break;
      (m.belt ||= []).push(res); take(K, res);
    }
  }
}
// slots still empty, the spare in the cargo counted
export const potionRoom = K => carriers(K).reduce((s, m) => s + POTION.slot - (m.potions || 0), 0) - (K.cargo.potion || 0);
// belt places still empty, the spare of the cargo counted
export const beltRoom = K => carriers(K).reduce((s, m) => s + POTION.belt - (m.belt?.length || 0), 0) - BELT_ORDER.reduce((s, r) => s + (K.cargo[r] || 0), 0);
// the makings are in the cargo
const has = (K, cost) => Object.entries(cost).every(([r, n]) => (K.cargo[r] || 0) >= n);

// a day of camp: with the healer's hut in the camp a healing herb may be gathered; the plain potions the hut can brew are
// brewed from the cargo while there is room for them — the healing ones first. → the potions brewed
export function brewDay(K, r, wooded) {
  if (!hasBuilding(K, 'healerhut')) return 0;
  if (r() < POTION.camp.herbs * (wooded ? POTION.camp.wooded : 1)) K.cargo.herbs = (K.cargo.herbs || 0) + 1;
  let n = 0;
  for (const {potion, grade} of hutGrades()) {
    const room = () => (potion.id === 'heal' ? potionRoom(K) : beltRoom(K));
    while (has(K, grade.cost) && room() > 0) {
      for (const [res, k] of Object.entries(grade.cost)) take(K, res, k);
      K.cargo[grade.res] = (K.cargo[grade.res] || 0) + 1; n++;
    }
  }
  topUp(K);
  return n;
}
// what a potion gives a member as a share of its health (m.hp is a share: a potion heals its `heal` — «Состояния» potHeal —
// of a standard body, whatever the race's)
export const potionShare = m => CONDITIONS.get('potHeal').heal / (SPECIES.get(m.race)?.hp || 1);
// the quick mode: one hurt to the edge drinks — → true when it did
export function quaffMember(m) {
  if (!(m.potions > 0) || m.captive || m.hp <= 0 || m.hp >= POTION.below) return false;
  m.potions--; m.hp = Math.min(1, m.hp + potionShare(m));
  return true;
}
// the potions and their makings a caravan keeps, not sells (campaign/town.js): data/potions.js POTION_KEEP
export {POTION_KEEP as ALCHEMY_KEEP} from '../data/potions.js';
