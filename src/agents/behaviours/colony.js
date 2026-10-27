// The colonist's smaller behaviours (docs/BEHAVIOUR.md «Люди»), each an offer the old decide() made, with its weight:
// idle, the council, the evening trade, the healer's hut, a prayer, a gloomy spell, a nechist's spell held, fighting a
// fire, the night watch, the alarm (muster at the fire, keeping out of harm's way), going along with a lone gatherer,
// helping the wounded, binding a fallen foe, learning beside a master. Each offers a task of agents/tasks.js and reads
// the settlement's systems that know the answer. Reads: nothing of its own.
import {nightness} from '../../core/time.js';
import {SPECIES} from '../../data/species.js';
import {councilDue} from '../../settlement/council.js';
import {tradeOpen} from '../../settlement/trade.js';
import {hurt, HEAL, freeBed} from '../../settlement/healing.js';
import {has, raidAlarm} from '../../settlement/query.js';
import {wantsPrayer} from '../../settlement/life.js';
import {maxHp, hpShare} from '../agent.js';
import {attackerOf, darkness} from '../combat.js';
import {agentInZone} from '../../settlement/zone.js';
import {escortOption, aidOption} from '../../settlement/together.js';
import {flagOptions, knownFoeWithin, redInSight, watchOption, BOARD} from '../../settlement/board.js';
import {bindOption, keepInside} from '../../settlement/captives.js';
import {assistOption} from '../../settlement/masters.js';
import {ROSTER, COLONIST} from '../../data/behaviour.js';

const on = (a, id) => a.task?.id === id;

export const idle = {want() { return [[{id: 'idle'}, COLONIST.want.idle, () => 'больше нечем заняться']]; }};

export const council = {want(w) { return councilDue(w) ? [[{id: 'council'}, COLONIST.want.council, () => 'время совета']] : null; }};

// right after the council, the second gathering of the evening
export const trade = {want(w) { return tradeOpen(w) ? [[{id: 'trade'}, COLONIST.want.trade, () => 'торг с купцом']] : null; }};

// badly hurt, with a healer's hut: go and lie there (more urgent the worse the wounds)
export const treat = {want(w, a) {
  if ((hurt(a) || (on(a, 'treat') && a.hp < maxHp(a) * HEAL.until)) && has(w, 'healerhut') && freeBed(w, a)) return [[{id: 'treat'}, (1 - a.hp / maxHp(a)) * COLONIST.want.treat[0] + COLONIST.want.treat[1], () => `ранен: здоровье ${Math.round(hpShare(a) * 100)}%`]];
  return null;
}};

// low spirits: a walk to the shrine may help
export const pray = {want(w, a, {night}) {
  const p = wantsPrayer(w, a);
  return p > COLONIST.prayFrom && night < COLONIST.night.pray ? [[{id: 'pray'}, COLONIST.want.pray[0] + p * COLONIST.want.pray[1], () => 'тяжело на душе']] : null;
}};

// a gloomy spell keeps its hold for a while (settlement/life.js starts it)
export const sulk = {want(w, a) { return on(a, 'sulk') && w.tick < a.task.until ? [[a.task, COLONIST.want.sulk, () => 'хандра: давно не в духе']] : null; }};

// a spell of the nechist holds until it wears off (or something more urgent: a fight, fire)
export const spellbound = {want(w, a) { return a.task?.spell && w.tick < a.task.until ? [[a.task, a.task.spell, () => 'чары нечисти']] : null; }};

export const douse = {want(w, a) {
  const brave = a.mods.bravery;
  return w.stats.fireNearCamp > 0 && hpShare(a) > COLONIST.want.douseHp && brave > COLONIST.want.douseBrave ? [[{id: 'douse'}, COLONIST.want.douse * brave, () => 'пожар у лагеря']] : null;
}};

// something is hunting me (a beast mauls, a raider fights): brave and healthy people fight back, the rest run for
// the camp — nobody keeps digging clay, lies at the healer's or sits at the council under the blows. Above every
// bodily need: nobody sleeps on while being mauled. Already inside the settlement there is nowhere to run to: stand
// and fight, however badly hurt. A reflex: no skip from an earlier fight with the same foe holds it back
export const defend = {want(w, a) {
  const hunter = attackerOf(w, a);
  if (!hunter) return null;
  const who = SPECIES.get(hunter.species).label, brave = a.mods.bravery;
  const stand = brave * hpShare(a) > COLONIST.standHp || agentInZone(w, a);
  return [stand ? [{id: 'fight', target: hunter, reflex: true}, ROSTER.attacked, () => `напал ${who}: смелости хватает дать отпор`] : [{id: 'runHome'}, ROSTER.attacked, () => `напал ${who}: бежать к своим`]];
}, pick(w, a, t) {   // (taken up: a wolf's attack remembered once — the palisade and the watchtower read it, data/buildings.js)
  const hunter = attackerOf(w, a); if (hunter?.species === 'wolf') a.mem.wolf += COLONIST.memWolf;
}};

// the night watch (settlement/board.js): the council's rule — one place, taken by whoever wants it
export const watch = {want(w, a) { const o = watchOption(w, a); return o ? [o] : null; }};

// the colony's board (settlement/board.js): the threats this colonist knows of — seen or heard of — each weighed by
// the colonist itself: how much of it nobody covers yet, courage, distance. A run to a cry is weighed afresh every
// time: a heavier cry wins
export const flags = {want(w, a) { const o = flagOptions(w, a); return o.length ? o : null; }, keep: (w, a, t) => (t.id === 'answer' ? 0 : ROSTER.keep)};

// how far this one sees: by night less, unless it sees in the dark (data/tongues.js)
const seenBy = (w, a) => BOARD.sight * (a.mods.sight ?? 1) * darkness(w, a);

// alarm: while raiders are on the map everyone who has no foe in sight gathers inside the settlement zone and meets
// them together; one who sees a foe weighs its flag instead
export const muster = {want(w, a) {
  return raidAlarm(w) && !knownFoeWithin(w, a, seenBy(w, a)) ? [[{id: 'muster'}, COLONIST.want.muster, () => 'тревога: враги подходят к лагерю']] : null;
}};

// a red alarm in sight (a raid, an attack on one of ours) cannot be ignored: who does not go to the fight keeps out
// of harm's way — at the fire while raiders are about, else back to the settlement — instead of going on with the
// work (settlement/board.js); the wounded fall back. Weighed afresh every time
export const reserve = {want(w, a) {
  const seen = seenBy(w, a), raid = raidAlarm(w), red = redInSight(w, a, seen), out = [];
  if (red && (raid || red.kind === 'raid')) out.push([{id: 'reserve'}, BOARD.reserve, () => `тревога: ${red.label} ${red.where}, держится у огня`]);
  else if (red && !agentInZone(w, a)) out.push([{id: 'runHome'}, BOARD.reserve, () => `тревога: ${red.label} ${red.where}, к своим`]);
  if (knownFoeWithin(w, a, seen) && hpShare(a) <= BOARD.hurt && !agentInZone(w, a)) out.push([{id: 'runHome'}, COLONIST.want.hurtEnemy, () => 'тяжело ранен, а враг рядом']);
  return out.length ? out : null;
}, keep: (w, a, t) => (t.id === 'reserve' ? 0 : ROSTER.keep)};

// together (settlement/together.js): go along with a lone gatherer when beasts roam, help the wounded
export const company = {want(w, a) { const o = escortOption(w, a); return o ? [o] : null; }};
export const aid = {want(w, a) { const o = aidOption(w, a); return o ? [o] : null; }};
// after the fight: a foe lying senseless may be bound and taken (settlement/captives.js)
export const bind = {want(w, a) { const o = bindOption(w, a); return o ? [o] : null; }};
// a learner's place beside a master at work (settlement/masters.js)
export const assist = {want(w, a) { const o = assistOption(w, a); return o ? [o] : null; }};

// a captive may not leave the settlement zone: turned back to the fire (settlement/captives.js)
export const keepIn = {always(w, a) { keepInside(w, a, agentInZone(w, a)); }, want() { return null; }};
