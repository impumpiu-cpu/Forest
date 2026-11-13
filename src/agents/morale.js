// Morale in a fight: one's own (data/morale.js MORALE; plan claude/combat-plan.md Бой-1, the author's word 13.11). A number
// 0…100 under a ladder of states (confident, steady, wavering, breaking, fleeing). Events strike it — one of one's side falls
// within sight, a blow taken, a foe slain — and every `think` ticks one weighs where it stands: the strength of the foes
// nearby against one's side's, a ring of foes about it, an officer near. A loss × (110 − resolve) / 100, softened by an officer;
// a gain × (resolve + 10) / 100. A fleeing one runs (agents/behaviours/rout.js) until it rallies; the state × its blows
// (agents/combat.js). The mindless dead, the mechanisms, a summoned beast and a tame one have none.
//   a.morale = {v, state, since, last: {why, t}} — on the agent, saved with it
import {MORALE} from '../data/morale.js';
import {SPECIES, isMindless} from '../data/species.js';
import {isHostile} from '../data/factions.js';
import {hasMark} from '../data/conditions.js';
import {opinion} from '../data/relations.js';
import {nearAgents} from './spatial.js';
import {ours} from './lookup.js';
import {strength} from './squad.js';
import {maxHp} from './agent.js';
import {log} from '../core/log.js';
import {esc} from '../core/util.js';

const clamp100 = v => Math.max(0, Math.min(100, v));
const strengthOf = a => strength(a);   // (agents/squad.js: the same measure the bands weigh by; read at the call, the two import each other)
const NONE = new Set(['summoned', 'golem', 'led']);

// who has a morale at all: the living who fight — not the mindless dead, a mechanism, a summoned or tame beast, a captive
export function hasMorale(a) {
  if (!a || a.dead || a.captive) return false;
  const sp = SPECIES.get(a.species);
  if (isMindless(sp) || sp.mechanism || sp.undead) return false;
  if (NONE.has(a.brain) || (a.tame && !a.warBeast)) return false;
  return true;
}
// one's resolve 0…100: its species' (else its kind's), its own bravery, its level
export function resolveOf(w, a) {
  const R = MORALE.resolve, sp = SPECIES.get(a.species);
  const base = R.species[a.species] ?? R.kind[sp.kind] ?? R.kind.race;
  const brave = R.bravery * ((a.mods?.bravery ?? 1) - 1);
  const lv = Math.min(R.levelCap, R.level * Math.max(0, (a.level || 1) - 1));
  const home = holdsHome(w, a) ? MORALE.home : 0;
  return clamp100(base + brave + lv + home);
}
// one holding its own home: the defenders of a lair stormed, the caravan's people when their camp is attacked
function holdsHome(w, a) {
  const k = w.campaign?.S?.kind; if (!k || k === 'stop') return false;
  return k === 'guard' ? a.faction !== 'colony' : a.faction === 'colony';
}
const temperOf = a => MORALE.temper[MORALE.tempers[a.species]] || null;
const tempered = (a, kind) => temperOf(a)?.[kind] ?? 1;
export const moraleOf = a => a.morale?.v ?? MORALE.start;
export function stateOf(a) {
  const id = a.morale?.state;
  return MORALE.ladder.find(s => s.id === id) || ladderAt(moraleOf(a));
}
const ladderAt = v => MORALE.ladder.find(s => v >= s.at) || MORALE.ladder.at(-1);
// × one's blows and shots; × the blows one takes (agents/combat.js)
export const moraleBlow = a => (a.morale ? stateOf(a).fight : 1);
export const moraleGuard = a => (a.morale ? stateOf(a).guard : 1);
export const fleeing = a => a.morale?.state === 'fleeing';

// the officer nearest one's heart: an officer of one's side within reach softens a loss (the best of them)
function officerBonus(w, a) {
  const O = MORALE.officer, C = w.campaign;
  let best = 0;
  for (const o of nearAgents(w, a.x, a.y, O.near)) {
    if (o === a || o.dead || o.downed || !ours(a, o)) continue;
    const b = C?.boss === o ? O.boss : o.squad != null && w.squads?.[o.squad]?.leader === o.id ? O.leader : hasMark(o, 'officer') ? O.officer : 0;
    if (b > best) best = b;
  }
  return best;
}
function ensure(w, a) { return (a.morale ||= {v: MORALE.start, state: ladderAt(MORALE.start).id, since: w.tick}); }
function setState(w, a, why) {
  const M = a.morale, was = M.state;
  let next = ladderAt(M.v).id;
  // a fleeing one keeps running until it has rallied (its morale back to `rally.at`, no foe close)
  if (was === 'fleeing' && next !== 'fleeing') {
    const far = !nearAgents(w, a.x, a.y, MORALE.rally.far).some(o => !o.dead && !o.downed && isHostile(a, o));
    if (M.v < MORALE.rally.at || !far) next = 'fleeing';
  }
  if (next === was) return;
  M.state = next; M.since = w.tick;
  if (next === 'fleeing' && a.faction === 'colony') log(w, `<b>${esc(a.name)}</b> ${a.gender === 'f' ? 'дрогнула' : 'дрогнул'} и бежит${why ? ` (${why})` : ''}.`, 'danger');
  else if (was === 'fleeing' && a.faction === 'colony') log(w, `<b>${esc(a.name)}</b> ${a.gender === 'f' ? 'опомнилась' : 'опомнился'}.`, 'notice');
}
// a loss: × the kind's temper, × (110 − resolve) / 100, ÷ (1 + an officer's bonus)
export function moraleShock(w, a, pts, kind, why) {
  if (!hasMorale(a) || !(pts > 0)) return;
  const M = ensure(w, a), R = resolveOf(w, a);
  M.v = clamp100(M.v - pts * tempered(a, kind) * (110 - R) / 100 / (1 + officerBonus(w, a)));
  M.last = {why, t: w.tick};
  setState(w, a, why);
}
export function moraleLift(w, a, pts, why) {
  if (!hasMorale(a) || !(pts > 0)) return;
  const M = ensure(w, a), R = resolveOf(w, a);
  M.v = clamp100(M.v + pts * (R + 10) / 100);
  M.last = {why, t: w.tick};
  setState(w, a, why);
}

// ── the events
// one fell (dead, or senseless): its side within sight shaken — the more for one close, one's kin or friend, an officer, the
// leader; the foes who saw it heartened, the one who struck the more
export function moraleFell(w, dead, by) {
  const F = MORALE.fell, Kd = MORALE.killed, V = MORALE.view, C = w.campaign;
  const leader = C?.boss === dead || (dead.squad != null && w.squads?.[dead.squad]?.leader === dead.id);
  const officer = hasMark(dead, 'officer');
  for (const o of nearAgents(w, dead.x, dead.y, V)) {
    if (o === dead || o.dead || o.downed || !hasMorale(o)) continue;
    if (ours(o, dead)) {
      const d = Math.hypot(o.x - dead.x, o.y - dead.y);
      let pts = F.base * (d <= F.close ? F.near : 1);
      if (o.faction === 'colony' && dead.faction === 'colony' && opinion(o, dead) > 2) pts *= F.friend;
      if (leader) pts *= F.leader; else if (officer) pts *= F.officer;
      moraleShock(w, o, pts, 'fell', `пал ${dead.name || SPECIES.get(dead.species).label}`);
    } else if (isHostile(o, dead)) moraleLift(w, o, (o === by ? Kd.own : Kd.seen) + (leader ? Kd.leader : 0), 'враг пал');
  }
  if (by && by !== dead && !by.dead && hasMorale(by) && Math.hypot(by.x - dead.x, by.y - dead.y) > V) moraleLift(w, by, Kd.own, 'сразил врага');
}
// a blow taken: × the share of the body it took
export function moraleWound(w, t, dmg) {
  if (!(dmg > 0) || t.dead || !hasMorale(t)) return;
  moraleShock(w, t, MORALE.wound.per * dmg / Math.max(1e-6, maxHp(t)), 'wound', 'тяжёлая рана');
}

// ── each tick (sim.js): every `think` ticks one weighs where it stands
export function stepMorale(w) {
  const M = MORALE;
  for (const a of w.agents) {
    if ((w.tick + a.id) % M.think || a.dead || a.downed || a.gone || !hasMorale(a)) continue;
    let foeS = 0, ownS = 0, foes = 0, own = 0, ring = 0;
    for (const o of nearAgents(w, a.x, a.y, M.view)) {
      if (o.dead || o.downed || o.gone || o.captive) continue;
      if (ours(a, o)) { ownS += strengthOf(o); own++; }
      else if (isHostile(a, o)) { foeS += strengthOf(o); foes++; if (Math.hypot(o.x - a.x, o.y - a.y) <= M.close) ring++; }
    }
    if (!foes && !a.morale) continue;
    const S = ensure(w, a), R = resolveOf(w, a), soft = (110 - R) / 100 / (1 + officerBonus(w, a));
    // where it settles here: the odds, the ring (a skittish kind counts heads: its side's numbers lift it as strength would)
    let stand = M.calm.to;
    if (foes) {
      if (temperOf(a)?.numbers) ownS *= Math.max(1, own / foes);
      const ratio = foeS / Math.max(1e-6, ownS);
      if (ratio > 1) stand -= M.odds.per * Math.min(M.odds.cap, ratio - 1) * tempered(a, 'odds') * soft;
      else if (ratio > 0) stand += M.odds.gain * Math.min(M.odds.cap, 1 / ratio - 1) * (R + 10) / 100;
      if (ring > M.ring.from) stand -= M.ring.per * (ring - M.ring.from) * tempered(a, 'ring') * soft;
    }
    S.v = clamp100(S.v + (clamp100(stand) - S.v) * M.drift);
    setState(w, a, stand < M.calm.to ? (ring > M.ring.from ? 'окружён' : 'врагов больше') : null);
  }
}

// a band's word on its members' morale (agents/squad.js): broken — this share of them breaking or fleeing
export function brokenShare(ms) {
  if (!ms.length) return 0;
  return ms.filter(m => m.morale && (m.morale.state === 'breaking' || m.morale.state === 'fleeing')).length / ms.length;
}
