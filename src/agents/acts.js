// The acts of a caravan's member on the local map (data/experience.js ACTS): written into the agent at the moment of the
// deed, by its own hand, and taken back with the camp's outcome (campaign/camp.js campOutcome → campaign/experience.js
// campActs). Only an agent that is a member of the caravan (`a.member`) keeps them: a settlement's colonist, a raider, a beast
// keep nothing, and the call costs them a check.
//   a.acts      — {act id: units}
//   a.actXp     — {act id: experience}: for an act worth more than its count (a foe brought down: its weight)
//   a.practiced — {skill id: units of practice} (agents/skills.js practice: the work really done, before it becomes skill)
import {strengthOf} from './strength.js';
import {KILL} from '../data/experience.js';

export function noteAct(a, id, n = 1, xp = null) {
  if (a?.member == null || !(n > 0)) return;
  const d = a.acts ||= {};
  d[id] = (d[id] || 0) + n;
  if (xp != null) { const x = a.actXp ||= {}; x[id] = (x[id] || 0) + xp; }
}

export function notePractice(a, skill, units) {
  if (a?.member == null || !(units > 0)) return;
  const p = a.practiced ||= {};
  p[skill] = (p[skill] || 0) + units;
}

// the foes a kill is a fight's act for: raiders, beasts that hunt people, the nechist; game (the wild) is the hunt's
const FOE_FACTIONS = new Set(['raiders', 'predators', 'nechist']);
// a creature brought down by a member (agents/agent.js kill, agents/wounds.js fall): a foe — one brought down, by a blow or a
// shot, once a foe (the downed one killed later is not brought down again), its experience by its strength (КС / 100: a plain
// human with a spear is 1); its death — `slew`, apart (a downed foe taken alive was brought down, not slain); game — the hunt's
//   dies — the foe dies of it (kill), not only falls (fall)
export function noteKill(a, by, shot, dies) {
  if (by?.member == null || a.tame || a.member != null) return;
  if (a.faction === 'wild') { if (dies) noteAct(by, 'game'); return; }
  if (!FOE_FACTIONS.has(a.faction)) return;
  if (!a.downed && !a.broughtDown) a.broughtDown = by.member, noteAct(by, shot ? 'killShot' : 'killBlow', 1, Math.max(KILL.least, Math.round(strengthOf(a) / KILL.per * KILL.round) / KILL.round) * KILL.xp);
  if (dies) noteAct(by, 'slew');
}
