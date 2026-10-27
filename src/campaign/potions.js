// The caravan's potions (data/potions.js): each member's slot of healing potions (m.potions, at most POTION.slot) and
// belt of the others (m.belt, POTION.belt places), the spare ones and their makings in the cargo (K.cargo). On the local
// map slot and belt go with the people (campaign/camp.js) and the stock fills them (settlement/potions.js); on the world
// map the cargo tops them up, a day of camp with the healer's hut gathers herbs and brews the plain grades it can from
// the cargo — always into a pot (campaign/march.js campWork), a town's laboratory brews the strong ones from the
// caravan's makings (campaign/town.js alchemy), and the quick mode's fight lets a member at the edge drink a healing one
// (campaign/fight.js autoFight). The brews (`home`) stay in the cargo, as many as their `stock` asks (homeRoom): drunk on
// the camp's map out of its stock (settlement/potions.js), the strengthening one by the wounded on the world map
// (mendDay), the sleeping one given to a captive set on running (campaign/captives.js).
import {SPECIES} from '../data/species.js';
import {POTION, POTION_RES, BELT_ORDER, HOME_BY_USE, hutGrades, potionOf, sameKind} from '../data/potions.js';
import {alive} from './march.js';
import {hasBuilding} from './baggage.js';
import {gearDef} from '../agents/equipment.js';
import {CONDITIONS} from '../data/conditions.js';
import {useOfEffect} from '../agents/potions.js';
import {DAY} from '../core/time.js';

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
// room for a brew of the stock (data/potions.js `stock`): as many as its share of the free people (of the captives),
// at least one while there is anyone, less what the cargo carries of it
export function homeRoom(K, potion) {
  const S = potion.stock, heads = S.of === 'captives' ? alive(K).filter(m => m.captive).length : carriers(K).length;
  return heads ? Math.ceil(heads * (S.march ?? S.share)) - potion.grades.reduce((s, g) => s + (K.cargo[g.res] || 0), 0) : 0;
}
// room for this potion: the slots (the plain healing one), the belts, or the brew's own
export const roomFor = (K, potion) => (potion.home ? homeRoom(K, potion) : potion.id === 'heal' ? potionRoom(K) : beltRoom(K));
// the makings are in the cargo
const has = (K, cost) => Object.entries(cost).every(([r, n]) => (K.cargo[r] || 0) >= n);

// a day of camp: with the healer's hut in the camp each herb (POTION.camp.find) may be gathered; the plain potions the
// hut can brew are brewed from the cargo while there is room for them — the healing ones first. → the potions brewed
export function brewDay(K, r, wooded) {
  if (!hasBuilding(K, 'healerhut')) return 0;
  for (const [res, p] of Object.entries(POTION.camp.find)) if (r() < p * (wooded ? POTION.camp.wooded : 1) && (K.cargo[res] || 0) < POTION.camp.keep) K.cargo[res] = (K.cargo[res] || 0) + 1;
  let n = 0;
  for (const {potion, grade} of hutGrades()) {
    while (has(K, grade.cost) && roomFor(K, potion) > 0) {
      for (const [res, k] of Object.entries(grade.cost)) take(K, res, k);
      K.cargo[grade.res] = (K.cargo[grade.res] || 0) + 1; n++;
    }
  }
  topUp(K);
  return n;
}
// a day on the world map: one badly hurt drinks a strengthening brew from the cargo (the strong first; one a day) — its
// `march` of health. → how many drank
export function mendDay(K) {
  let n = 0;
  for (const m of carriers(K)) {
    if (!(m.hp > 0) || m.hp >= POTION.home.hurt) continue;
    const res = (HOME_BY_USE.mending || []).find(r => (K.cargo[r] || 0) >= 1); if (!res) break;
    take(K, res); m.hp = Math.min(1, m.hp + (CONDITIONS.get(potionOf(res).grade.effect).march || 0)); n++;
  }
  return n;
}
// ── the brews at work on the world map: a member's m.effects — [{id, day}]: the row of «Состояний», the last day it works
// (a brew of `ticks` lasts ⌈ticks / DAY⌉ days). They go with it onto the local map and back (campaign/camp.js).
const daysOf = id => Math.max(1, Math.ceil((CONDITIONS.get(id).ticks || DAY) / DAY));
export const workingOn = (K, m, use) => (m.effects || []).some(e => e.day >= K.day && useOfEffect(e.id) === use);
// the morning: what ran out is gone
export function wearOff(K) { for (const m of alive(K)) if (m.effects) { m.effects = m.effects.filter(e => e.day >= K.day); if (!m.effects.length) m.effects = null; } }
// everyone of `ms` without a brew of this use at work drinks of it: a kettle from the cargo (the strong first) serves
// POTION.home.kettle of them — only when there are kettles enough for them all: one left out holds the whole caravan
// back as before. → true when all of them have one at work
export function brewTheDay(K, use, ms) {
  const need = ms.filter(m => !workingOn(K, m, use)), grades = HOME_BY_USE[use] || [], per = POTION.home.kettle;
  if (!need.length) return true;
  const kettles = Math.ceil(need.length / per);
  if (grades.reduce((s, r) => s + (K.cargo[r] || 0), 0) < kettles) return false;
  for (let k = 0; k < kettles; k++) {
    const res = grades.find(r => (K.cargo[r] || 0) >= 1), id = potionOf(res).grade.effect; take(K, res);
    for (const m of need.slice(k * per, (k + 1) * per)) (m.effects ||= []).push({id, day: K.day + daysOf(id) - 1});
  }
  (K.stats.brews ||= {})[use] = (K.stats.brews[use] || 0) + kettles;
  return true;
}
// onto the local map: [{id, ticks}] — what is left of each, no more than its own length; and back: [{id, day}]
export const effectsOut = (K, m) => (m.effects || []).filter(e => e.day >= K.day).map(e => ({id: e.id, ticks: Math.min(CONDITIONS.get(e.id).ticks || DAY, (e.day - K.day + 1) * DAY)}));
export const effectsIn = (K, list) => (list?.length ? list.map(e => ({id: e.id, day: K.day + Math.max(1, Math.ceil(e.ticks / DAY)) - 1})) : null);

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
