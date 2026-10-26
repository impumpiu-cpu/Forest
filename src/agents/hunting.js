// What a predator shares with its pack (docs/BEHAVIOUR.md), as agents/wildHerd.js is for the herd beasts:
// how bold hunger has made it, what a chase is worth, whom it picks, how a hunt of game or an attack on a
// person begins and how the pack sits down to the kill. The behaviours (agents/behaviours/: chase, maul,
// feed, roam…) read these; the species' numbers are its `predator` block (data/species.js), the common ones
// PROWL (data/behaviour.js).
import {SPECIES, matchesKind} from '../data/species.js';
import {nearAgents} from './spatial.js';
import {packMembers, noteAttacker} from './lookup.js';
import {agentInZone} from '../settlement/zone.js';
import {maxHp} from './agent.js';
import {clamp, esc, dist} from '../core/util.js';
import {log} from '../core/log.js';
import {think} from './mind.js';
import {dropCarcass, startHunt} from './carcass.js';
import {stragglerOf} from './wildHerd.js';
import {PROWL} from '../data/behaviour.js';

export {dist} from '../core/util.js';   // (one for all: core/util.js)
// a hunter already at it — eating, chasing, mauling — or still winded from it does not start another (chase, maul)
const HUNTING = new Set(['feed', 'chase', 'maul']);
export const busyHunting = (a, rested) => HUNTING.has(a.task?.id) || (a.task?.id === 'rest' && a.stamina < rested);
export const packOf = (w, a) => packMembers(w, a.pack);
export const paramsOf = a => SPECIES.get(a.species).predator;

// boldness: 0 when fed (food ≥ hungry), 1 when starving (food ≤ starving)
export const boldness = (a, P) => clamp((P.hungry - a.needs.food) / (P.hungry - P.starving), 0, 1);

// the nearest living creature of these kinds within r that passes `filter`; the pen's animals are not prey
export function nearest(w, a, species, r, filter = () => true) {
  let best = null, bd = Infinity;
  for (const o of nearAgents(w, a.x, a.y, r)) {
    if (o.dead || o.tame || !matchesKind(o.species, species) || !filter(o)) continue;
    const d = dist(a, o); if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// how many others of the victim's kind stand close to it
export const company = (w, v, r) => nearAgents(w, v.x, v.y, r).filter(o => o !== v && !o.dead && (o.species === v.species || (!!SPECIES.get(o.species).rel && !!SPECIES.get(v.species).rel)) && dist(o, v) < r).length;

// big game (a mule) is prey only once it is badly hurt
const weakEnough = (o, P) => !(P.weakPrey || []).includes(o.species) || o.hp < maxHp(o) * P.weakBelow;
const preyKinds = P => [...P.prey, ...(P.weakPrey || [])];

// what a chase is worth: food per head × the chance to catch it, less for the way there and the risk
// (big game kicks back). The hungrier, the less it takes to set off.
export function preyValue(w, a, P, o, packSize) {
  const ps = SPECIES.get(o.species), big = !!ps.big, V = PROWL.value;
  const perHead = (big ? P.bigMeal : P.meal) / Math.max(1, packSize);
  const mine = SPECIES.get(a.species).speed * P.sprint * (V.winded + (1 - V.winded) * a.stamina);
  const theirs = ps.speed * (ps.flee?.sprint || 1);
  // a straggler — a herd beast far from its herd, or hurt and lagging — is easier to catch (agents/wildHerd.js)
  const caught = big ? 1 : clamp(mine / (theirs || 0.1) * V.catchOdds * (stragglerOf(w, o) ? V.straggler : 1), V.catchMin, 1);
  const way = 1 - V.way * clamp(dist(a, o) / P.sight, 0, 1);
  const risk = big ? V.bigRisk * (o.hp / maxHp(o)) : 0;
  return perHead * caught * way - risk;
}

// the best prey within reach for a pack of this size, or null
export function bestPrey(w, a, P, reach, packSize) {
  let best = null, bv = PROWL.value.least;
  const kinds = preyKinds(P);
  for (const o of nearAgents(w, a.x, a.y, reach)) {
    if (o.dead || o.tame || !matchesKind(o.species, kinds) || dist(a, o) > reach) continue;
    if (!weakEnough(o, P) || agentInZone(w, o) || a.ignore?.get(o.id) > w.tick) continue;
    const v = preyValue(w, a, P, o, packSize);
    if (v > bv) { bv = v; best = o; }
  }
  return best;
}

// leave prey `id` alone for `ticks`; marks that ran out are dropped here, so the list (it is saved) stays small
export function ignoreFor(w, a, id, ticks) {
  const m = a.ignore || (a.ignore = new Map());
  for (const [k, t] of m) if (t <= w.tick) m.delete(k);
  m.set(id, w.tick + ticks);
}

// the pack sits down to the kill: everyone close enough eats from the carcass
export function toTheKill(w, a, prey, food, pack) {
  const c = dropCarcass(w, prey, food, a);
  for (const m of pack) if (m === a || dist(m, a) < PROWL.killCall) m.task = {id: 'feed', c: c.id};
  return c;
}

// the pack goes for a person: one try at a time (calmUntil), those near join, the victim and the log hear of it
export function startMaul(w, a, v, b) {
  const P = paramsOf(a), pack = packOf(w, a);
  for (const m of pack) m.calmUntil = w.tick + P.calm * (1 - PROWL.calmBold * b);
  const join = pack.filter(m => (m === a || dist(m, a) < PROWL.joinNear) && m.task?.id !== 'feed');
  const h = startHunt(w, join, v, 'person');
  for (const m of join) { if (m !== a) m.task = {id: 'maul', target: v, hunt: h.id}; noteAttacker(w, m); }   // a's own task is the one being taken (agents/behaviours/maul.js pick)
  w.stats.wolfAttacks++;
  const sp = SPECIES.get(a.species), many = pack.length > 1, who = many ? sp.plural : sp.label;
  think(w, v, 'wolfAttack', {who: sp.plural});
  const n = company(w, v, P.loneRadius);
  log(w, b > PROWL.desperate && n ? `Изголодавшиеся ${sp.plural} бросаются на людей! <b>${esc(v.name)}</b> и спутник(и) вдали от лагеря.`
    : `${who[0].toUpperCase() + who.slice(1)} ${many ? 'нападают' : 'нападает'}! <b>${esc(v.name)}</b> далеко от лагеря и без помощи.`, 'danger');
  return h;
}

// a chance given «a tick», rolled when the behaviour is asked (a full thought every few ticks): the chance over all the
// ticks since this one was last rolled — 1 − (1 − p)^Δ — so a beast thinking every 8 ticks leaves as often as one thinking
// every tick (a.rolled keeps the tick of each roll by key)
export function perTick(w, a, key, p) {
  const R = (a.rolled ||= {}), dt = Math.max(0, w.tick - (R[key] ?? w.tick - 1));
  R[key] = w.tick;
  return dt <= 1 ? (dt ? p : 0) : 1 - Math.pow(1 - p, dt);
}
