// Doing things together: small joint actions that grow out of what colonists think of each other
// (data/relations.js opinion) and change it in turn. The old memory of the peoples and the values one
// holds give the starting attitude; what happens between two people — a quarrel, a hand in a fight,
// a wound dressed in the woods — is the part that changes (agent.grudge[id], ± REL caps; good
// memories fade slower than bad ones, settlement/relations.js).
//   escort — when beasts that hunt people roam the woods, someone goes along with a lone gatherer,
//            keeps close and takes on whatever comes for them. Two together are also less of a prey:
//            predators shy away from company (agents/behaviours/maul.js).
//   aid    — a badly hurt colonist out in the woods: a friend (or anyone merciful enough) goes to
//            dress the wounds and sees them home.
//   mates  — a job someone you like is doing tempts a little more, one with someone you cannot stand
//            a little less; working side by side brings people closer.
//   yield  — the healer's beds are full: a patient well on the mend gives the bed up to someone in a
//            worse way (unless they cannot stand them).
//   calm   — a quarrel is put off while danger is near (settlement/relations.js); shared trouble —
//            standing together against a raid — mends grudges.
// Counted in w.behave.social (settlement/behaviour.js).
import {JOBS} from '../data/jobs.js';
import {opinion, OPINION} from '../data/relations.js';
import {colonists} from './query.js';
import {agentInZone} from './zone.js';
import {perTick, clamp, esc, g, dist} from '../core/util.js';
import {HOUR, nightness} from '../core/time.js';
import {maxHp, hpShare} from '../agents/agent.js';
import {strength} from '../agents/squad.js';
import {approach} from '../agents/movement.js';
import {attack, reachOf, canSee, behindRock} from '../agents/combat.js';
import {think} from '../agents/mind.js';
import {log} from '../core/log.js';
import {REL} from './relations.js';
import {stabilize} from '../agents/wounds.js';
import {practice} from '../agents/skills.js';
import {liveById} from '../agents/lookup.js';
import {ALIGN, ALIGN_DRIFT, shiftAlign} from '../data/values.js';
import {TOGETHER} from '../data/colony.js';

export {TOGETHER};   // (data/colony.js)
const byId = liveById;
const social = w => w.behave?.social;

// personal history: what happened between a and b, on a's side
export function bond(w, a, b, v) {
  if (!a || !b || a === b) return;
  const gr = a.grudge ||= {};
  gr[b.id] = clamp((gr[b.id] || 0) + v, -OPINION.grudgeCap, OPINION.grudgeCap);
}

// how dangerous the woods are for someone alone right now, 0…1: beasts that hunt people and the
// nechist on the map, each weighed against an average colonist, more by night
export const outsideRisk = w => perTick(w, 'outsideRisk', () => {
  const col = colonists(w); if (!col.length) return 0;
  const avg = col.reduce((s, a) => s + strength(a), 0) / col.length || 1;
  let t = 0;
  for (const o of w.agents) if (!o.dead && !o.tame && (o.faction === 'predators' || o.faction === 'nechist')) t += strength(o) / avg;
  return clamp(0.1 * t * (0.7 + 0.5 * nightness(w)), 0, 1);
});

// ── escort
const OUT = new Set(['harvest', 'hunt']);
const outWork = a => a.task?.id === 'job' && OUT.has(JOBS.get(a.task.job).runner);
const escortOf = (w, a) => colonists(w).find(o => o.task?.id === 'company' && o.task.who === a.id);

// lone gatherers who would be better off with company
const walkers = w => perTick(w, 'walkers', () => (outsideRisk(w) < TOGETHER.riskFrom ? [] : colonists(w).filter(a => outWork(a) && !a.task.hauling && !escortOf(w, a))));

// the best person for `a` to go along with, and how much it tempts: [task, score, why] or null
export function escortOption(w, a) {
  const risk = outsideRisk(w);
  // already going along with someone: that one, while still needed
  if (a.task?.id === 'company') { const b = escortGoing(w, a, a.task); if (b) return [a.task, 0.2 + 0.6 * risk + (a.task.home ? 0.6 : 0), () => (a.task.home ? `ведёт ${b.name} к своим` : `в лесу опасно, ${b.name} не ${g(b, 'один', 'одна')}`)]; }
  const ws = walkers(w);
  if (!ws.length || hpShare(a) < 0.6 || a.mods.bravery < 0.6) return null;
  const col = colonists(w);
  if (col.filter(o => o.task?.id === 'company').length >= Math.max(1, Math.floor(col.length * TOGETHER.escortShare)) && a.task?.id !== 'company') return null;
  let best = null, bs = -Infinity, bop = 0;
  for (const b of ws) {
    if (b === a || dist(a, b) > TOGETHER.far) continue;
    const op = opinion(a, b);
    if (op < -1.5) continue;
    const s = 0.2 + 0.6 * risk + 0.05 * clamp(op, -2, 4) + 0.15 * (a.mods.bravery - 1) + (a.gear?.rangedReady || a.gear?.melee?.item ? 0.08 : 0);
    if (s > bs) { bs = s; best = b; bop = op; }
  }
  return best ? [{id: 'company', who: best.id}, bs, () => `в лесу опасно, ${best.name} ${g(best, 'один', 'одна')}${bop >= REL.friend ? ' — а это друг' : ''}`] : null;
}

// the foe closest to b within r: a beast that hunts people, the nechist, a raider.
// With `viewer`, only a foe that one can see and still fight (combat.js canSee; the fallen are out):
// a rusalka hidden under the water cannot be struck, so it must not keep a helper from the wounded.
const FOES = new Set(['predators', 'nechist', 'raiders']);
export function threatTo(w, b, r, viewer = null) {
  let best = null, bd = r;
  for (const o of w.agents) {
    if (o.dead || o.tame || !FOES.has(o.faction)) continue;
    if (viewer && (o.downed || !canSee(w, viewer, o))) continue;
    const d = dist(o, b); if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// one step of guarding `b` (the escort and aid tasks): fight what comes for them, else keep close.
// Returns 'fight' or 'near' or 'far'.
export function guardStep(w, a, b, task) {
  const foe = threatTo(w, b, TOGETHER.guard, a);
  if (foe) {
    task.fought ??= foe.id;
    const d = dist(a, foe);
    if (d > Math.min(0.9, reachOf(a)) || behindRock(w, a, foe)) approach(w, a, foe.x, foe.y, 1.15); else attack(w, a, foe);
    a.lastFight = w.tick;
    return 'fight';
  }
  if (task.fought != null) { bond(w, b, a, TOGETHER.bondDefend); think(w, b, 'stoodUp', {name: a.name, gender: a.gender}); task.fought = null; }
  if (dist(a, b) > TOGETHER.keep) { approach(w, a, b.x, b.y); return 'far'; }
  if (w.tick % HOUR === 0) { bond(w, a, b, TOGETHER.bondEscort); bond(w, b, a, TOGETHER.bondEscort); }
  return 'near';
}

// is the escort still needed?
export function escortGoing(w, a, task) {
  const b = byId(w, task.who);
  if (!b) return null;
  if (task.home) return agentInZone(w, b) ? null : b;   // seeing a wounded friend home
  return outWork(b) && outsideRisk(w) >= TOGETHER.riskTill ? b : null;
}

export function enterEscort(w, a, task) {
  const b = byId(w, task.who); if (!b) return;
  const s = social(w); if (s && !task.home) s.escort++;
  if (!task.home) think(w, b, 'escorted', {name: a.name, gender: a.gender});
}

// ── aid
const helper = (w, id) => colonists(w).find(o => o.task?.id === 'aid' && o.task.who === id);
// the fallen (agents/wounds.js) need help wherever they lie, and before anyone else
const needsAid = (w, b) => b.ledBy == null && (!!b.downed || (hpShare(b) < TOGETHER.aidBelow && !agentInZone(w, b) && !(b.task?.id === 'treat' && b.task.lying) &&
  !(w.tick - (b.aidedAt ?? -Infinity) < TOGETHER.aidEvery)));   // (one led away in bonds is rescued by the sword, not the bandage)
const aidScore = b => (b.downed ? TOGETHER.aidFallen : 0.5 + (TOGETHER.aidBelow - hpShare(b)) * 2);
const aidWhy = b => (b.downed ? `${b.name} ${g(b, 'упал', 'упала')} без сознания и истекает кровью` : `${b.name} ${g(b, 'ранен', 'ранена')} в лесу: здоровье ${Math.round(hpShare(b) * 100)}%`);

export function aidOption(w, a) {
  if (hpShare(a) < 0.5) return null;
  if (a.task?.id === 'aid') { const b = byId(w, a.task.who); if (b && needsAid(w, b)) return [a.task, aidScore(b), () => aidWhy(b)]; }
  let best = null, bs = -Infinity;
  for (const b of colonists(w)) {
    if (b === a || !needsAid(w, b) || dist(a, b) > TOGETHER.far) continue;
    const h = helper(w, b.id); if (h && h !== a) continue;
    const op = opinion(a, b);
    // the merciful help even those they cannot stand; a life at stake, anyone helps
    if (!b.downed && op <= REL.dislike && (a.align?.mercy ?? 0) < ALIGN.help) continue;
    const s = aidScore(b) + 0.05 * clamp(op, -2, 4);
    if (s > bs) { bs = s; best = b; }
  }
  return best ? [{id: 'aid', who: best.id, fallen: !!best.downed}, bs, () => aidWhy(best)] : null;
}

// arrived: dress the wounds, then see them home. For the fallen this is what saves the life
export function giveAid(w, a, b) {
  if (b.downed) {
    stabilize(w, a, b);
    bond(w, b, a, TOGETHER.bondAid * 2); bond(w, a, b, TOGETHER.bondAid * 0.5);
    shiftAlign(b, 'mercy', ALIGN_DRIFT.pawn.saved * 2);   // pulled back from death: kinder for it
    const s = social(w); if (s) s.aid++;
    practice(a, 'medicine', TOGETHER.aidPractice);
    return;
  }
  const amt = Math.min(maxHp(b) - b.hp, TOGETHER.aidHeal * maxHp(b) * (1 + (a.skill?.medicine || 0)));
  b.hp += amt; b.aidedAt = w.tick;
  bond(w, b, a, TOGETHER.bondAid); bond(w, a, b, TOGETHER.bondAid * 0.3);
  shiftAlign(b, 'mercy', ALIGN_DRIFT.pawn.saved);
  think(w, b, 'aided', {name: a.name, gender: a.gender}); think(w, a, 'gaveAid', {name: b.name});
  const s = social(w); if (s) s.aid++;
  log(w, `<b>${esc(a.name)}</b> ${g(a, 'перевязал', 'перевязала')} раны <b>${esc(b.name)}</b> прямо в лесу и ${g(a, 'повёл', 'повела')} к своим.`, 'people');
}

// ── work mates: a little pull towards jobs friends are doing, away from those of people one dislikes
export function mates(w, a) {
  const by = {};
  for (const o of colonists(w)) if (o !== a && o.task?.id === 'job') (by[o.task.job] ||= []).push(o);
  return job => {
    let v = 0, friend = null, foe = null;
    for (const o of by[job] || []) {
      const op = opinion(a, o);
      if (op >= REL.friend) { v += TOGETHER.mate; friend ??= o; } else if (op <= REL.dislike) { v -= TOGETHER.mate; foe ??= o; }
    }
    return {v: clamp(v, -TOGETHER.mateCap, TOGETHER.mateCap), friend, foe};
  };
}

// ── yield: the healer's beds are full; someone on the mend may give theirs up. Returns the freed bed's
// key, or null. `end` closes the patient's task (agents/lifecycle.js endTask).
export function askForBed(w, a, end) {
  const mine = hpShare(a);
  let best = null;
  for (const p of colonists(w)) {
    if (p === a || p.task?.id !== 'treat' || !p.task.bed) continue;
    const h = hpShare(p);
    if (h < TOGETHER.yieldFrom || h - mine < TOGETHER.yieldGap) continue;
    if (opinion(p, a) <= REL.dislike && (p.align?.mercy ?? 0) < ALIGN.guard) continue;
    if (!best || h > hpShare(best)) best = p;
  }
  if (!best) return null;
  const bed = best.task.bed;
  end(w, best, 'done');
  bond(w, a, best, TOGETHER.bondAid * 0.6);
  think(w, a, 'gotBed', {name: best.name, gender: best.gender}); think(w, best, 'yieldedBed', {name: a.name});
  const s = social(w); if (s) s.yield++;
  log(w, `<b>${esc(best.name)}</b> ${g(best, 'уступил', 'уступила')} койку у лекаря <b>${esc(a.name)}</b>: тому хуже.`, 'people');
  return bed;
}

// ── shared trouble: when a raid is over, those who fought it come out of it closer
export function afterRaid(w, since) {
  const fought = colonists(w).filter(a => (a.lastFight ?? -Infinity) >= since);
  for (let i = 0; i < fought.length; i++) for (let j = i + 1; j < fought.length; j++) {
    const a = fought[i], b = fought[j], foes = opinion(a, b) <= REL.dislike || opinion(b, a) <= REL.dislike;
    const v = foes ? TOGETHER.mendTrouble : TOGETHER.bondTrouble;
    bond(w, a, b, v); bond(w, b, a, v);
    if (foes) {
      const s = social(w); if (s) s.bond++;
      think(w, a, 'sharedTrouble', {name: b.name}); think(w, b, 'sharedTrouble', {name: a.name});
      log(w, `Общая беда сблизила <b>${esc(a.name)}</b> и <b>${esc(b.name)}</b>: плечом к плечу против налётчиков старые обиды забываются.`, 'people');
    }
  }
}

// once an hour (settlement/relations.js): working side by side brings people closer
export function workTogether(w) {
  const col = colonists(w);
  for (let i = 0; i < col.length; i++) for (let j = i + 1; j < col.length; j++) {
    const a = col[i], b = col[j];
    if (a.task?.id !== 'job' || b.task?.id !== 'job' || a.task.job !== b.task.job || dist(a, b) > 8) continue;
    if (opinion(a, b) <= REL.dislike || opinion(b, a) <= REL.dislike) continue;
    bond(w, a, b, TOGETHER.bondWork); bond(w, b, a, TOGETHER.bondWork);
  }
}

