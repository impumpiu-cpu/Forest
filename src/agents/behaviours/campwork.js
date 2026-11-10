// Camp work: the evening's chores of the caravan's camp (campaign/works.js; data/camp.js CAMP_WORKS) — the cart drawn up,
// the beasts tethered, the hides on their poles, the spit, the smoking rack, the stakes, a cache found. Whoever is on its
// feet and not badly hurt takes the nearest chore with room in its crew (each takes its `hands`; a free one before joining
// one begun — the camp's overmind, settlement/campMind.js); in the first hours after the camp opens the chores come before
// sleep (CAMP_WORKS.setup), later they wait for an idle hour. A place in a crew is taken from the first step towards the
// chore, so the company spreads over them instead of running all to the same; held on to (ROSTER.keep); one that cannot
// be reached is let go, and so is the place. The one the overmind sends to look round the camp walks its ring (the scout).
// Reads: nothing of its own.
import {approach} from '../movement.js';
import {hpShare} from '../agent.js';
import {endTask} from '../lifecycle.js';
import {raidAlarm} from '../../settlement/query.js';
import {workFor, workById, workOn, inSetup, claimWork, releaseWork} from '../../settlement/works.js';
import {mindOf, scoutStep, scoutLeft} from '../../settlement/campMind.js';
import {CAMP_WORKS} from '../../data/camp.js';

export const campwork = {
  want(w, a) {
    if (!w.campaign || a.downed || raidAlarm(w)) return null;
    // sent to look round the camp (settlement/campMind.js)
    const S = mindOf(w)?.scout;
    if (S?.who === a.id) return [[a.task?.id === 'campwork' && a.task.scout ? a.task : {id: 'campwork', scout: true}, CAMP_WORKS.scout.want, () => 'разведывает округу стоянки']];
    if (!w.works?.length || hpShare(a) < CAMP_WORKS.setup.hurt) return null;
    const mine = a.task?.id === 'campwork' && !a.task.scout ? workById(w, a.task.work) : null;
    const x = mine && !mine.done ? mine : workFor(w, a);
    if (!x) return null;
    const label = CAMP_WORKS[x.key].label;
    return [[mine === x ? a.task : {id: 'campwork', work: x.id}, inSetup(w) ? CAMP_WORKS.setup.want : CAMP_WORKS.setup.idle, () => `обустраивает стоянку: ${label}`]];
  },
  step(w, a, t) {
    const {reach, pace} = CAMP_WORKS.setup;
    if (t.scout) { if (scoutStep(w, a, approach, reach, pace) === 'done') endTask(w, a, 'done'); return; }
    const x = workById(w, t.work);
    if (!x || x.done || !claimWork(w, a, x)) { endTask(w, a, 'done'); return; }   // (a place in its crew from the first step: «занято»)
    if (Math.hypot(x.x - a.x, x.y - a.y) > reach) { if (approach(w, a, x.x, x.y, pace) === null) { endTask(w, a, 'blocked', 'не подойти'); } return; }
    workOn(w, a, x);
  },
  // let go: the place in the crew is free again; a scout called away — the walk is off
  exit(w, a, t) {
    if (t.scout) { scoutLeft(w, a); return; }
    const x = workById(w, t.work); if (x && !x.done) releaseWork(w, a, x);
  },
};
