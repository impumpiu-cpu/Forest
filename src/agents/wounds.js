// Luck at the edge of death, and the wounds a fight leaves (numbers and wounds: data/wounds.js).
//   critChance(by)      — the attacker's chance of a critical blow (agents/combat.js asks it once a hit lands)
//   lethal(w, t, …)     — what happens when a blow takes the last health: death, or a fall
//   stepDowned(w, a)    — the fallen bleed; the time runs out — death
//   stabilize(w, h, a)  — someone dressed the wound: the fall is over, the grave wound (and the trauma, if
//                         the second check failed) stay on the body
//   healWounds(w, a)    — a grave wound heals in its days; a trauma never does
// One check per fall: a creature lying senseless, or still healing the grave wound of its last fall, gets
// no second chance — the next deadly blow kills. The checks use the combat stream, at the moment of the
// blow, and their outcome is kept on the creature, so a save and a load never roll again.
import {SPECIES} from '../data/species.js';
import {NORM} from '../data/special.js';
import {CRIT, DEATHBLOW, CAN_FALL, WOUNDS, luckChance, GRAVE_TICKS, bleedTicks} from '../data/wounds.js';
import {kill, maxHp} from './agent.js';
import {refreshBody} from './special.js';
import {think} from './mind.js';
import {releaseAll} from '../settlement/reserve.js';
import {noteHuntDeath} from './carcass.js';
import {log} from '../core/log.js';
import {esc, g, weighted} from '../core/util.js';
import {agentById} from './lookup.js';
import {wake} from './attention.js';
import {noteFallen} from './squad.js';
import {HIT_LOCATIONS} from '../data/anatomy.js';
import {degreeOf, passed, degreeValue} from '../data/checks.js';

const luckOf = a => a.special?.L ?? NORM;
// the colony's own falls; a foe's are counted apart (they may be taken captive: settlement/captives.js)
const tally = (w, a) => (a.faction === 'colony' ? (w.chronicle.falls ||= {down: 0, saved: 0, bled: 0, killed: 0, traumas: 0}) : (w.chronicle.foeFalls ||= {down: 0, bled: 0, killed: 0}));

export const critChance = by => luckChance('crit', luckOf(by));

// the traumas a deadly wound may leave where the last blow landed (data/anatomy.js `traumas` of the place); all of
// them when the place is not known (a save from before places were drawn)
export function traumasAt(t) {
  const all = WOUNDS.filter(x => x.trauma), place = t.hitAt && HIT_LOCATIONS.has(t.hitAt) ? HIT_LOCATIONS.get(t.hitAt) : null;
  const here = place ? all.filter(x => place.traumas.includes(x.id)) : [];
  return here.length ? here : all;
}

// still healing the wound of an earlier fall: luck is spent until it closes
export const fallSpent = a => !!a.downed || (a.wounds || []).some(x => x.id === 'grave');

// A blow took the last health. Returns true if the creature fell instead of dying.
export function lethal(w, t, cause, by) {
  if (t.dead) return false;
  const sp = SPECIES.get(t.species);
  if (t.downed) tally(w, t).killed++;
  if (fallSpent(t) || !CAN_FALL(sp, t) || !DEATHBLOW.causes.includes(cause) || t.hp < -DEATHBLOW.overkill * maxHp(t)) { kill(w, t, cause, by); return false; }
  const L = luckOf(t);
  // a check with four degrees (data/checks.js): a critical success may leave the wound clean, with no second check
  const pSurvive = luckChance('survive', L), deg = degreeOf(w.rngs.combat(), pSurvive);
  if (!passed(deg)) { kill(w, t, cause, by); return false; }
  const sure = deg === 'critSuccess' && degreeValue('survive', 'critSuccess') >= 1;
  // the second check, made now and kept: what the wound will leave if the fallen is saved
  const clean = sure || w.rngs.combat() < luckChance('clean', L);
  const trauma = clean ? null : weighted(w.rngs.combat, traumasAt(t).map(x => [x.id, x.weight ?? 1]));
  fall(w, t, cause, by, trauma);
  return true;
}

// senseless on the ground, bleeding: the task ends, what it held is let go, foes lose interest
function fall(w, a, cause, by, trauma) {
  // the old task is closed as interrupted by the brain's syncTask (agents/lifecycle.js), with this reason
  if (a.task) a.switchWhy = 'упал без сознания';
  releaseAll(w, a);
  noteHuntDeath(w, a);
  for (const s of Object.values(w.squads || {})) if (s.target === a.id) s.targetDown = true;   // the one they came for is down
  if (a.faction !== 'colony') noteFallen(w, a);   // a raider down is one lost to its band (agents/squad.js)
  a.downed = {since: w.tick, until: w.tick + bleedTicks(a.special?.E ?? NORM), cause, by: by?.id ?? null, trauma};
  a.hp = DEATHBLOW.hpLeft * maxHp(a);
  a.task = {id: 'downed'}; a.sleeping = false; a.stalking = false;
  tally(w, a).down++;
  think(w, a, 'fell');
  if (a.faction === 'colony') log(w, `<b>${esc(a.name)}</b> ${g(a, 'упал', 'упала')} без сознания${by ? ` от удара (${SPECIES.get(by.species).label})` : ''}. Без помощи истечёт кровью.`, 'danger', 'notice');
  else log(w, `${esc(a.name)} (${SPECIES.get(a.species).label}) ${g(a, 'упал', 'упала')} без сознания${by ? ` от удара <b>${esc(by.name)}</b>` : ''}. Можно связать и взять в плен.`, 'danger');
}

// once a tick for the fallen (agents/brains/colonist.js): help came too late
export function stepDowned(w, a) {
  if (w.tick < a.downed.until) return;
  const by = agentById(w, a.downed.by);
  tally(w, a).bled++;
  if (a.faction === 'colony') log(w, `<b>${esc(a.name)}</b> ${g(a, 'истёк', 'истекла')} кровью: помощь не успела.`, 'death');
  kill(w, a, a.downed.cause, by || undefined, {quiet: true});
}

// someone dressed the wound in time
export function stabilize(w, helper, a) {
  const d = a.downed; if (!d) return;
  a.downed = null;
  if (a.task?.id === 'downed') a.task.closed = 'done';   // the fall is over, not broken off
  a.wounds = [...(a.wounds || []), {id: 'grave', until: w.tick + GRAVE_TICKS('grave')}];
  if (d.trauma) a.wounds.push({id: d.trauma});
  refreshBody(a);
  a.hp = Math.max(a.hp, DEATHBLOW.stableHp * maxHp(a) * (1 + (helper?.skill?.medicine || 0)));
  a.task = null; wake(a, 'очнулся после раны', 'очнулся');
  const f = tally(w, a); f.saved++; if (d.trauma) f.traumas++;
  think(w, a, 'survived', {name: helper?.name, gender: helper?.gender});
  if (d.trauma) think(w, a, 'trauma', {what: WOUNDS.get(d.trauma).label});
  log(w, `<b>${esc(helper?.name || 'Кто-то')}</b> ${g(helper || a, 'вытащил', 'вытащила')} <b>${esc(a.name)}</b> с того света.${d.trauma ? ` Но ${WOUNDS.get(d.trauma).label} останется на всю жизнь.` : ' Рана тяжёлая, но заживёт.'}`, 'people', 'notice');
}

// a grave wound closes when its time is up (checked every 50 ticks per creature)
export function healWounds(w, a) {
  if (!a.wounds?.length || (w.tick + a.id) % 50) return;
  const left = a.wounds.filter(x => x.until == null || x.until > w.tick);
  if (left.length === a.wounds.length) return;
  a.wounds = left;
  refreshBody(a);
  think(w, a, 'woundHealed');
}

// the wounds a creature carries, for the card
export const woundsText = a => (a.wounds || []).map(x => WOUNDS.get(x.id).label);
