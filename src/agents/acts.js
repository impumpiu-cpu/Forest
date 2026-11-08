// The acts of a caravan's member on the local map (data/experience.js ACTS): written into the agent at the moment of the
// deed, by its own hand, and taken back with the camp's outcome (campaign/camp.js campOutcome → campaign/experience.js
// campActs). Only an agent that is a member of the caravan (`a.member`) keeps them: a settlement's colonist, a raider, a beast
// keep nothing, and the call costs them a check.
//   a.acts      — {act id: units}
//   a.practiced — {skill id: units of practice} (agents/skills.js practice: the work really done, before it becomes skill)
import {strengthOf} from './strength.js';
import {KILL} from '../data/experience.js';

export function noteAct(a, id, n = 1) {
  if (a?.member == null || !(n > 0)) return;
  const d = a.acts ||= {};
  d[id] = (d[id] || 0) + n;
}

export function notePractice(a, skill, units) {
  if (a?.member == null || !(units > 0)) return;
  const p = a.practiced ||= {};
  p[skill] = (p[skill] || 0) + units;
}

// the foes a kill is a fight's act for: raiders, beasts that hunt people, the nechist; game (the wild) is the hunt's
const FOE_FACTIONS = new Set(['raiders', 'predators', 'nechist']);
// a creature brought down by a member: a foe — a blow or a shot, worth its strength (КС / 100: a plain human with a spear
// is 1); game — the hunt's act
export function noteKill(a, by, shot) {
  if (by?.member == null || a.tame || a.member != null) return;
  if (a.faction === 'wild') { noteAct(by, 'game'); return; }
  if (!FOE_FACTIONS.has(a.faction)) return;
  noteAct(by, shot ? 'killShot' : 'killBlow', Math.max(KILL.least, Math.round(strengthOf(a) / KILL.per * KILL.round) / KILL.round));
}
