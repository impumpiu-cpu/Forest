// The colony's tasks for one another (agents/tasks.js registers them in order): going along with someone,
// helping the wounded, binding a fallen foe, learning beside a master.
import {approach} from '../movement.js';
import {enterEscort, escortGoing, guardStep, giveAid} from '../../settlement/together.js';
import {agentInZone} from '../../settlement/zone.js';
import {liveById} from '../lookup.js';
import {bindStillOn, bindCaptive} from '../../settlement/captives.js';
import {CAPTIVE} from '../../data/captives.js';
import {assistStillOn} from '../../settlement/masters.js';
import {done, fail} from './common.js';

// a function declaration, so that agents/tasks.js can call it even when this file is the one loaded first
export function socialTasks() {
  return [
    // going along with someone in the woods (settlement/together.js): keep close, take on what comes
    {id: 'company', label: t => (t.captive ? 'ведёт пленного в лагерь' : t.home ? 'ведёт раненого к своим' : 'сопровождает в лесу'), enter: enterEscort, step(w, a, task) {
      const b = escortGoing(w, a, task);
      if (!b) { done(w, a); return; }
      guardStep(w, a, b, task);
    }},
    // a wounded colonist out in the woods: go, dress the wounds, see them home. One who fell senseless
    // (agents/wounds.js) is helped anywhere, inside the camp too: dressing the wound in time saves a life
    {id: 'aid', label: t => (t.fallen ? 'спешит к упавшему' : 'спешит на помощь раненому'), step(w, a, task) {
      const b = liveById(w, task.who);
      if (!b || (agentInZone(w, b) && !b.downed)) { done(w, a); return; }
      if (guardStep(w, a, b, task) === 'fight') return;
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1.4) { if (approach(w, a, b.x, b.y, 1.2) === null) fail(w, a, 'к раненому не подойти', 'impossible'); return; }
      const fallen = !!b.downed;
      giveAid(w, a, b);
      if (fallen || agentInZone(w, b)) done(w, a); else a.task = {id: 'company', who: b.id, home: true};
    }},

    // a foe lying senseless after the fight (settlement/captives.js): go, dress the wound, tie it up, see it
    // into the camp. Gone (bled out, bound by another), no bonds left, a foe close by again — the task is over
    {id: 'bind', label: () => 'вяжет упавшего врага', step(w, a, task) {
      const f = bindStillOn(w, a, task);
      if (!f) { done(w, a); return; }
      if (Math.hypot(f.x - a.x, f.y - a.y) > 1.3) { task.work = 0; if (approach(w, a, f.x, f.y, 1.2) === null) fail(w, a, 'к упавшему не подойти', 'impossible'); return; }
      if ((task.work = (task.work || 0) + 1) < CAPTIVE.bindTicks) return;
      if (!bindCaptive(w, a, f)) { fail(w, a, 'нечем связать'); return; }
      if (agentInZone(w, f)) done(w, a); else a.task = {id: 'company', who: f.id, home: true, captive: true};
    }},

    // a learner beside a master (settlement/masters.js): keep close while the master works; the learning and the
    // master's speed are the master's work itself (agents/jobRunners.js workRate, settlement/masters.js stepMasters)
    {id: 'assist', quiet: true, label: () => 'учится у мастера', step(w, a, task) {
      const m = assistStillOn(w, a, task);
      if (!m) { done(w, a); return; }
      if (Math.hypot(m.x - a.x, m.y - a.y) > 1.6) { if (approach(w, a, m.x, m.y, 1.1) === null) fail(w, a, 'к мастеру не подойти', 'impossible'); }
    }},
  ];
}
