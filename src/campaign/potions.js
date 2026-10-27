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
import {POTION, POTIONS, POTION_RES, BELT_ORDER, HOME_BY_USE, hutGrades, potionOf, sameKind} from '../data/potions.js';
import {alive} from './march.js';
import {hasBuilding} from './baggage.js';
import {gearDef} from '../agents/equipment.js';
import {CONDITIONS} from '../data/conditions.js';
import {useOfEffect, threatOf, rebelt, beltNeed} from '../agents/potions.js';
import {DAY} from '../core/time.js';

const carriers = K => alive(K).filter(m => !m.captive && !m.former);
const take = (K, id, n = 1) => { K.cargo[id] -= n; if (K.cargo[id] <= 0) delete K.cargo[id]; };
// a member's belt may take a poison for the blade only if it carries a blade (its hand gear has a melee weapon)
const bladeIn = m => (m.gear?.hand || []).some(tok => !!gearDef(tok)?.melee && !gearDef(tok)?.ranged);
const fitsBelt = (m, res) => potionOf(res)?.potion.use !== 'blade' || bladeIn(m);

// the foes the caravan expects: those of its last POTION.beltFights fights ({species: n})
export function foesOf(K) {
  const out = {};
  for (const f of (K.fights || []).slice(-POTION.beltFights)) for (const [id, n] of Object.entries(f.species || {})) out[id] = (out[id] || 0) + n;
  return out;
}
// the spare potions of the cargo into the slots and the belts, to whoever carries fewest
export function topUp(K) {
  for (;;) {
    if (!((K.cargo.potion || 0) >= 1)) break;
    const m = carriers(K).filter(x => (x.potions || 0) < POTION.slot).sort((p, q) => (p.potions || 0) - (q.potions || 0))[0];
    if (!m) break;
    m.potions = (m.potions || 0) + 1; take(K, 'potion');
  }
  // the belts by need against the foes of the last fights (agents/potions.js rebelt), traded when they change
  const threat = threatOf(foesOf(K));
  for (const m of carriers(K).sort((p, q) => (p.belt?.length || 0) - (q.belt?.length || 0)))
    rebelt(m, m.race, r => K.cargo[r] || 0, r => take(K, r), r => { K.cargo[r] = (K.cargo[r] || 0) + 1; }, r => fitsBelt(m, r), threat);
  marksUp(K);
}
// an elixir in the cargo (a home potion of use `mark`): drunk at once by a free member that lacks its mark — the knights
// first (m.marks; they go onto the local map with it, campaign/camp.js)
function marksUp(K) {
  for (const p of POTIONS.all().filter(x => x.use === 'mark')) for (const g of p.grades) {
    const mark = CONDITIONS.get(g.effect).mark;
    for (const m of carriers(K).sort((x, y) => (y.role === 'knight') - (x.role === 'knight'))) {
      if (!((K.cargo[g.res] || 0) >= 1)) break;
      if (m.marks?.includes(mark)) continue;
      (m.marks ||= []).push(mark); take(K, g.res); K.stats.elixirs = (K.stats.elixirs || 0) + 1;
    }
  }
}
// slots still empty, the spare in the cargo counted
export const potionRoom = K => carriers(K).reduce((s, m) => s + POTION.slot - (m.potions || 0), 0) - (K.cargo.potion || 0);
// would anyone of the caravan put this potion in its belt against the foes it expects (agents/potions.js beltNeed)
export function beltWanted(K, res, threat = threatOf(foesOf(K))) {
  return carriers(K).some(m => fitsBelt(m, res) && beltNeed(res, threat, m.race) > 0);
}
// belt places still empty, the spare of the cargo counted — only what someone would wear (a silver oil with no foe that
// fears silver takes no place)
export function beltRoom(K) {
  const threat = threatOf(foesOf(K));
  return carriers(K).reduce((s, m) => s + POTION.belt - (m.belt?.length || 0), 0) - BELT_ORDER.reduce((s, r) => s + ((K.cargo[r] || 0) && beltWanted(K, r, threat) ? K.cargo[r] : 0), 0);
}
// room for a brew of the stock (data/potions.js `stock`): as many as its share of the free people (of the captives),
// at least one while there is anyone, less what the cargo carries of it
export function homeRoom(K, potion) {
  // an elixir: one for each free member still without its mark
  if (potion.use === 'mark') { const mark = CONDITIONS.get(potion.grades[0].effect).mark; return carriers(K).filter(m => !m.marks?.includes(mark)).length - potion.grades.reduce((s, g) => s + (K.cargo[g.res] || 0), 0); }
  const S = potion.stock, heads = S.of === 'captives' ? alive(K).filter(m => m.captive).length : carriers(K).length;
  return heads ? Math.ceil(heads * (S.march ?? S.share)) - potion.grades.reduce((s, g) => s + (K.cargo[g.res] || 0), 0) : 0;
}
// belt room for a kind of potion (a belt takes one of a kind): the members who would wear it (it fits them, it is
// wanted against the foes expected), have a place free and none of its kind yet, less what the cargo carries of it
// (the plain healing one aside: it goes into the slots)
// (a full belt counts when it would trade its worst for this one; a strong grade: those who carry the plain one of its
// kind would take it too, one for one — agents/potions.js rebelt)
export function kindRoom(K, potion, res, threat = threatOf(foesOf(K))) {
  const fits = m => fitsBelt(m, res) && beltNeed(res, threat, m.race) > 0, ms = carriers(K);
  // a place free, or one it would trade for this (agents/potions.js rebelt: better than the worst it carries by beltSwap)
  const place = m => (m.belt?.length || 0) < POTION.belt || beltNeed(res, threat, m.race) >= Math.min(...m.belt.map(b => beltNeed(b, threat, m.race))) + POTION.beltSwap;
  const wear = ms.filter(m => fits(m) && !(m.belt || []).some(b => sameKind(b, res)) && place(m)).length;
  const k = potionOf(res)?.k || 0;
  const upgrade = k ? ms.filter(m => fits(m) && (m.belt || []).some(b => sameKind(b, res) && (potionOf(b)?.k || 0) < k)).length : 0;
  const carried = potion.grades.reduce((s, g, i) => s + (g.res === 'potion' || (upgrade && i < k) ? 0 : K.cargo[g.res] || 0), 0);
  return wear + upgrade - carried;
}
// room for this grade of a potion (`res`): the slot (the plain healing one), the brew's own, or a belt place for its
// kind (the strong healing one too: it goes into a belt)
export const roomFor = (K, potion, res) => (potion.home ? homeRoom(K, potion) : res === 'potion' ? potionRoom(K) : kindRoom(K, potion, res));
// the makings are in the cargo
const has = (K, cost) => Object.entries(cost).every(([r, n]) => (K.cargo[r] || 0) >= n);

// a day of camp: with the healer's hut in the camp each herb (POTION.camp.find) may be gathered; the plain potions the
// hut can brew are brewed from the cargo while there is room for them — the healing ones first. → the potions brewed
export function brewDay(K, r, wooded) {
  if (!hasBuilding(K, 'healerhut')) return 0;
  for (const [res, p] of Object.entries(POTION.camp.find)) if (r() < p * (wooded ? POTION.camp.wooded : 1) && (K.cargo[res] || 0) < POTION.camp.keep) K.cargo[res] = (K.cargo[res] || 0) + 1;
  let n = 0;
  for (const {potion, grade} of hutGrades()) {
    while (has(K, grade.cost) && roomFor(K, potion, grade.res) > 0) {
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
export function wearOff(K) {
  for (const m of alive(K)) {
    if (m.effects) { m.effects = m.effects.filter(e => e.day >= K.day); if (!m.effects.length) m.effects = null; }
    if (m.wounds) { m.wounds = m.wounds.filter(x => x.day == null || x.day >= K.day); if (!m.wounds.length) m.wounds = null; }   // a grave wound healed by its time
  }
}
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
// the wounds go the same way (agents/wounds.js: a grave wound heals by its time, a trauma never): on the world map
// m.wounds [{id, day}] — the last day it is borne (null — for life); onto the local map [{id, ticks}] (null — for life)
export const woundsOut = (K, m) => (m.wounds || []).filter(x => x.day == null || x.day >= K.day).map(x => ({id: x.id, ticks: x.day == null ? null : (x.day - K.day + 1) * DAY}));
export const woundsIn = (K, list) => (list?.length ? list.map(x => ({id: x.id, day: x.ticks == null ? null : K.day + Math.max(1, Math.ceil(x.ticks / DAY)) - 1})) : null);
// onto the local map: [{id, ticks}] — what is left of each, no more than its own length; and back: [{id, day}]
export const effectsOut = (K, m) => (m.effects || []).filter(e => e.day >= K.day).map(e => ({id: e.id, ticks: Math.min(CONDITIONS.get(e.id).ticks || DAY, (e.day - K.day + 1) * DAY)}));
export const effectsIn = (K, list) => (list?.length ? list.map(e => ({id: e.id, day: K.day + Math.max(1, Math.ceil(e.ticks / DAY)) - 1})) : null);

// what a potion gives a member as a share of its health (m.hp is a share: a potion heals its `heal` — «Состояния» potHeal —
// of a standard body, whatever the race's)
export const potionShare = m => CONDITIONS.get('potHeal').heal / (SPECIES.get(m.race)?.hp || 1);
// the quick mode: one hurt to the edge drinks — → true when it did
export function quaffMember(m) {
  if (m.captive || m.hp <= 0 || m.hp >= POTION.below) return false;
  if (m.potions > 0) { m.potions--; m.hp = Math.min(1, m.hp + potionShare(m)); return true; }
  // a strong one from the belt (the quick mode reads nothing else of it)
  const res = (m.belt || []).find(r => potionOf(r)?.potion.use === 'wounded'); if (!res) return false;
  m.belt.splice(m.belt.indexOf(res), 1); if (!m.belt.length) m.belt = null;
  m.hp = Math.min(1, m.hp + CONDITIONS.get(potionOf(res).grade.effect).heal / (SPECIES.get(m.race)?.hp || 1));
  return true;
}
// how many of a resource the caravan keeps, not sells (campaign/town.js): data/potions.js potionKeep
export {potionKeep} from '../data/potions.js';
