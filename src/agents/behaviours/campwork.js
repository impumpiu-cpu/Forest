// Camp work: the evening's chores of the caravan's camp (campaign/works.js; data/camp.js CAMP_WORKS) — the cart drawn up,
// the beasts tethered, the hides on their poles, the spit, the smoking rack, the stakes. Whoever is on its feet and not
// badly hurt takes the nearest chore nobody is at; in the first hours after the camp opens the chores come before sleep
// (CAMP_WORKS.setup), later they wait for an idle hour. A chore begun is held on to (ROSTER.keep); one that cannot be
// reached is let go. Reads: nothing of its own.
import {approach} from '../movement.js';
import {hpShare} from '../agent.js';
import {endTask} from '../lifecycle.js';
import {raidAlarm} from '../../settlement/query.js';
import {workFor, workById, workOn, inSetup} from '../../campaign/works.js';
import {CAMP_WORKS} from '../../data/camp.js';

export const campwork = {
  want(w, a) {
    if (!w.campaign || !w.works?.length || a.downed || raidAlarm(w) || hpShare(a) < CAMP_WORKS.setup.hurt) return null;
    const mine = a.task?.id === 'campwork' ? workById(w, a.task.work) : null;
    const x = mine && !mine.done ? mine : workFor(w, a);
    if (!x) return null;
    const label = CAMP_WORKS[x.key].label;
    return [[mine === x ? a.task : {id: 'campwork', work: x.id}, inSetup(w) ? CAMP_WORKS.setup.want : CAMP_WORKS.setup.idle, () => `обустраивает стоянку: ${label}`]];
  },
  step(w, a, t) {
    const x = workById(w, t.work);
    if (!x || x.done || (x.by != null && x.by !== a.id)) { endTask(w, a, 'done'); return; }
    if (Math.hypot(x.x - a.x, x.y - a.y) > CAMP_WORKS.setup.reach) { if (approach(w, a, x.x, x.y, CAMP_WORKS.setup.pace) === null) { endTask(w, a, 'blocked', 'не подойти'); } return; }
    workOn(w, a, x);
  },
  // let go: the chore is nobody's again
  exit(w, a, t) { const x = workById(w, t.work); if (x && x.by === a.id && !x.done) x.by = null; },
};
