// The colony's tasks at the camp in an alarm, a watch, a sickbed, a trade (agents/tasks.js registers them in order):
// gathering by the fire, the reserve, the night watch, the run home, the healer's hut, the caravan.
import {endTask} from '../lifecycle.js';
import {maxHp} from '../agent.js';
import {follow, moveToward, approach} from '../movement.js';
import {think} from '../mind.js';
import {tradeOpen, attendTrade} from '../../settlement/trade.js';
import {HEAL, freeBed, hasHut} from '../../settlement/healing.js';
import {reserve} from '../../settlement/reserve.js';
import {raidAlarm} from '../../settlement/query.js';
import {askForBed} from '../../settlement/together.js';
import {liveById} from '../lookup.js';
import {raidOnBoard} from '../../settlement/board.js';
import {TASK} from '../../data/behaviour.js';
import {done, fail, campMill} from './common.js';

// a function declaration, so that agents/tasks.js can call it even when this file is the one loaded first
export function campTasks() {
  return [
    // gather by the fire when raiders come; done as soon as the alarm is over
    {id: 'muster', quiet: true, label: () => 'собирается по тревоге', step(w, a, task) {
      if (!raidAlarm(w) && !raidOnBoard(w)) { done(w, a); return; }
      think(w, a, 'raidAlarm');
      campMill(w, a, task, ...TASK.mill.muster, TASK.mill.musterPace);
    }},

    // a red alarm in sight that one does not go to fight (settlement/board.js): stand at the fire with the
    // others, out of harm's way, while the raid lasts. Not held on to (colonist.js gives it no keep), so
    // at every think it is weighed afresh against going to the fight
    {id: 'reserve', quiet: true, label: () => 'держится у огня', step(w, a, task) {
      if (!raidAlarm(w) && !raidOnBoard(w)) { done(w, a); return; }
      campMill(w, a, task, ...TASK.mill.muster, TASK.mill.musterPace);
    }},

    // the night watch (settlement/board.js): by the fire all night, looking round for everyone; done at dawn
    {id: 'watch', quiet: true, label: () => 'дежурит у огня', step(w, a, task) {
      if (task.over) { done(w, a); return; }
      campMill(w, a, task, ...TASK.mill.muster);
    }},

    // run for the settlement zone when something is hunting you
    {id: 'runHome', label: () => 'бежит к поселению', step(w, a) {
      if (follow(w, a, 'zone', TASK.runPace) === 'arrived') done(w, a);
    }},

    // a wounded colonist lies in the healer's hut until mostly healed (settlement/healing.js)
    {id: 'treat', label: t => (t.lying ? (t.healer != null ? 'лечится у лекаря' : 'лежит в хижине лекаря') : 'идёт к лекарю'), step(w, a, task) {
      if (!hasHut(w)) { fail(w, a, 'хижины лекаря нет'); return; }
      const max = maxHp(a);
      if (a.hp >= max * HEAL.until) {
        const healer = liveById(w, task.healer);
        if (healer) { think(w, a, 'treated', {name: healer.name}); think(w, healer, 'healedSomeone', {name: a.name}); }
        done(w, a); return;
      }
      // a bed of one's own, held on the way and while lying there
      // a bed of one's own; when all are taken, someone on the mend may give theirs up (settlement/together.js)
      const bed = freeBed(w, a) || (!task.bed && askForBed(w, a, endTask));
      if (!bed || !reserve(w, bed, a)) { fail(w, a, 'в хижине лекаря нет места'); a.think = TASK.think.treat; return; }
      task.bed = bed;
      if (!task.lying) {
        const r = follow(w, a, 'healer');
        if (r === 'arrived') task.lying = true;
        else if (r === 'none' && !w.nav.dirtySet.has('healer')) { w.nav.dirty('healer'); fail(w, a, 'к лекарю нет пути', 'impossible'); a.think = TASK.think.treat; }
        return;
      }
      a.sleeping = true;   // lies still: drawn dimmed, does not tire
    }},

    // the evening trade with a caravan: gather round the trader's goods, a few steps from the fire
    {id: 'trade', quiet: true, label: () => 'торгуется с купцом', step(w, a, task) {
      if (!tradeOpen(w)) { done(w, a); return; }
      const spot = w.caravan.spot;
      if (!spot) { follow(w, a, 'camp'); return; }
      if (!task.at) {
        if (Math.hypot(spot[0] - a.x, spot[1] - a.y) < TASK.trade.at) { task.at = true; if (!task.met) { task.met = true; attendTrade(w, a); } }
        else if (approach(w, a, spot[0], spot[1]) === null) follow(w, a, 'camp');
        return;
      }
      if (!task.spot || w.rngs.colony() < TASK.mill.respot) { const [r0, r1] = TASK.trade.ring, ang = w.rngs.colony() * Math.PI * 2, r = r0 + w.rngs.colony() * r1; task.spot = [spot[0] + Math.cos(ang) * r, spot[1] + Math.sin(ang) * r]; }
      moveToward(w, a, task.spot[0], task.spot[1], TASK.mill.pace);
    }},
  ];
}
