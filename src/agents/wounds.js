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
import {sunTicks} from '../core/time.js';
import {NORM} from '../data/special.js';
import {DEATHBLOW, CAN_FALL, WOUNDS, luckChance, GRAVE_TICKS, bleedTicks, MAIM_OF} from '../data/wounds.js';
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
import {caughtFrom} from '../data/afflictions.js';
import {catchIll} from './afflictions.js';
import {noteKill, noteAct} from './acts.js';
import {perkOf, hasPerkA, PERKS} from '../data/perks.js';
import {CONDITIONS} from '../data/conditions.js';

const luckOf = a => a.special?.L ?? NORM;
// the colony's own falls; a foe's are counted apart (they may be taken captive: settlement/captives.js)
const tally = (w, a) => (a.faction === 'colony' ? (w.chronicle.falls ||= {down: 0, saved: 0, bled: 0, killed: 0, traumas: 0}) : (w.chronicle.foeFalls ||= {down: 0, bled: 0, killed: 0}));

export const critChance = by => luckChance('crit', luckOf(by));

// the traumas a deadly wound may leave where the last blow landed (data/anatomy.js `traumas` of the place); all of
// them when the place is not known (a save from before places were drawn)
export function traumasAt(t) {
  const all = WOUNDS.filter(x => x.trauma && x.drawn !== false), place = t.hitAt && HIT_LOCATIONS.has(t.hitAt) ? HIT_LOCATIONS.get(t.hitAt) : null;
  const here = place ? all.filter(x => place.traumas.includes(x.id)) : [];
  return here.length ? here : all;
}

// still healing the wound of an earlier fall: luck is spent until it closes
const fallSpent = a => !!a.downed || (a.wounds || []).some(x => x.id === 'grave');

// A blow took the last health. Returns true if the creature fell instead of dying.
export function lethal(w, t, cause, by) {
  if (t.dead) return false;
  const sp = SPECIES.get(t.species);
  if (t.downed) tally(w, t).killed++;
  // a caravan's member may be maimed instead of dying (data/wounds.js DEATHBLOW.maim, the author's call): not when finished off
  // where it lies, not by a blow past all health, not by what is no wound; with its last maim borne the deadly wound kills
  const M = DEATHBLOW.maim, maimable = M.on && t.member != null && !t.captive && !t.downed && CAN_FALL(sp, t) && DEATHBLOW.causes.includes(cause) && t.hp >= -DEATHBLOW.overkill * maxHp(t);
  if (maimable && (t.maims || 0) >= M.max) { kill(w, t, cause, by); return false; }
  if (fallSpent(t) || !CAN_FALL(sp, t) || !DEATHBLOW.causes.includes(cause) || t.hp < -DEATHBLOW.overkill * maxHp(t)) { if (maimable) { maimFall(w, t, cause, by); return true; } kill(w, t, cause, by); return false; }
  const L = luckOf(t);
  // a check with four degrees (data/checks.js): a critical success may leave the wound clean, with no second check
  const pSurvive = luckChance('survive', L), deg = degreeOf(w.rngs.combat(), pSurvive);
  if (!passed(deg)) { if (maimable) { maimFall(w, t, cause, by); return true; } kill(w, t, cause, by); return false; }
  const sure = deg === 'critSuccess' && degreeValue('survive', 'critSuccess') >= 1;
  // the second check, made now and kept: what the wound will leave if the fallen is saved
  const clean = sure || w.rngs.combat() < luckChance('clean', L);
  const trauma = clean ? null : weighted(w.rngs.combat, traumasAt(t).map(x => [x.id, x.weight ?? 1]));
  if (clean) noteAct(t, 'clean');   // survived a deadly wound with no mark: a member's count («Везучий», data/perks.js)
  fall(w, t, cause, by, trauma);
  return true;
}
// a maim instead of death: the deadly blow's place picks it (the trauma of the place made worse: MAIM_OF); it falls senseless but
// does not bleed out — a dressing wakes it (dressWound), and the camp's end binds it if nobody did (campaign/camp.js)
function maimFall(w, t, cause, by) {
  const at = traumasAt(t).filter(x => MAIM_OF[x.id]), pick = at.length ? weighted(w.rngs.combat, at.map(x => [x.id, x.weight ?? 1])) : Object.keys(MAIM_OF)[Math.floor(w.rngs.combat() * 4) % 4];
  const maim = MAIM_OF[pick];
  fall(w, t, cause, by, null);
  t.downed.maim = maim; t.downed.until = Number.MAX_SAFE_INTEGER;   // (stable: it does not bleed out)
  t.maims = (t.maims || 0) + 1; (t.maimedNow ||= []).push(maim);
  log(w, `<b>${esc(t.name)}</b> ${g(t, 'не умер', 'не умерла')}: ${WOUNDS.get(maim).label} — на всю жизнь.`, 'danger', 'notice');
}

// senseless on the ground, bleeding: the task ends, what it held is let go, foes lose interest
function fall(w, a, cause, by, trauma) {
  // the old task is closed as interrupted by the brain's syncTask (agents/lifecycle.js), with this reason
  if (a.task) a.switchWhy = 'упал без сознания';
  releaseAll(w, a);
  noteHuntDeath(w, a);
  for (const s of Object.values(w.squads || {})) if (s.target === a.id) s.targetDown = true;   // the one they came for is down
  if (a.member != null) bloodPrice(w, a);   // one of the caravan down: the orcs who took the blood price rage (data/perks.js)
  if (a.faction !== 'colony') { noteFallen(w, a); noteKill(a, by, a.hurtBy?.id === by?.id && !!a.hurtBy?.far, false); }   // a raider down is one lost to its band (agents/squad.js), and the downer's act (agents/acts.js)
  a.downed = {since: w.tick, until: w.tick + bleedTicks(a.special?.E ?? NORM), cause, by: by?.id ?? null, trauma};
  if (a.bleeding) a.bleeding = null; if (a.stunned) a.stunned = null;   // the fall is the wound now: it bleeds by its own clock (the curve 'bleed')
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

// the wound dressed: the fall is over, a grave wound (and the trauma, if any) in its place, the bleeding stopped,
// some health back (more for a skilled healer; a raider's rough knots: none). Returns what it lay with
export function dressWound(w, a, medicine = 0) {
  const d = a.downed; if (!d) return null;
  a.downed = null; if (a.bleeding) a.bleeding = null;   // the dressing stops the bleeding too
  if (a.task?.id === 'downed') a.task.closed = 'done';   // the fall is over, not broken off
  a.wounds = [...(a.wounds || []), {id: 'grave', until: w.tick + sunTicks(w, GRAVE_TICKS('grave'))}];   // (a wound's days are the sun's: core/time.js dayScale)
  if (d.trauma) a.wounds.push({id: d.trauma});
  if (d.maim) a.wounds.push({id: d.maim});   // (a maim instead of death: for life)
  refreshBody(a);
  a.hp = Math.max(a.hp, DEATHBLOW.stableHp * maxHp(a) * (1 + medicine));
  return d;
}

// someone dressed the wound in time
export function stabilize(w, helper, a) {
  if (a.downed?.trauma && w.rngs.colony() < perkOf(helper, 'cleanHelp')) a.downed.trauma = null;   // a bone-setter's hands: no trauma left («Костоправ», data/perks.js)
  const d = dressWound(w, a, helper?.skill?.medicine || 0); if (!d) return;
  const up = perkOf(helper, 'dressHp'); if (up > 0) a.hp = Math.min(maxHp(a), a.hp + up * maxHp(a));   // stands up stronger (a perk: «Полевая перевязь», data/perks.js)
  // the dressed wound may fester (data/afflictions.js fever `catch`, less for a skilled healer; 0 — never)
  const FV = caughtFrom('dressed');
  if (FV && FV.catch > 0 && w.rngs.colony() < FV.catch * (1 - (helper?.skill?.medicine || 0))) catchIll(w, a, FV.id);
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


// «Кровная плата» (data/perks.js): one of the caravan falls — those of its own who took the perk and stand within reach
// of it are seized by a rage (data/conditions.js 'bloodrage': its strength, pace and nerve for its time)
function bloodPrice(w, a) {
  const P = PERKS.get('bloodPrice').fight;
  for (const o of w.agents) {
    if (o === a || o.dead || o.downed || o.member == null || !hasPerkA(o, 'bloodPrice')) continue;
    if (Math.hypot(o.x - a.x, o.y - a.y) > P.bloodReach) continue;
    if ((o.effects || []).some(e => e.id === P.bloodrage && w.tick < e.until)) continue;
    o.effects = [...(o.effects || []), {id: P.bloodrage, until: w.tick + sunTicks(w, CONDITIONS.get(P.bloodrage).ticks)}];
    refreshBody(o); o.flash = 4;
  }
}
