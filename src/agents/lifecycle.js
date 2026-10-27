// The life of a task. Every task a colonist takes is entered once and closed once, with an outcome:
//   done        — finished (the load delivered, the meal eaten, the grave dug);
//   blocked     — nothing to do there right now (no order at the workshop, no free bed, no game in sight):
//                 not taken again for BLOCKED_SKIP ticks;
//   impossible  — no way there at all: not taken again for IMPOSSIBLE_SKIP ticks;
//   interrupted — something else came first (an attack, the council, a better job, a spell).
// Closing a task does the same cleanup whatever the outcome: it gives back every reservation the
// colonist held (settlement/reserve.js), drops the stalk and the planned path, and lets the task's own
// exit hook keep what is worth keeping (the work done on a bush, to go on with it later). The load in
// the hands stays with the colonist (agents/jobRunners.js). A task that did not end in `done` is shown
// on the card with its reason (a.lastStop).
//
// Runners and tasks end themselves with endTask(); a task replaced from outside (decide() picks
// something else, a reflex, a spell, the alarm) is caught by syncTask(), which the colonist brain calls
// around every step.
import {releaseAll} from '../settlement/reserve.js';
import {TASKS} from './tasks.js';
import {wake} from './attention.js';

export const OUTCOMES = {
  done:        {label: 'сделано', skip: 0},
  blocked:     {label: 'заблокировано', skip: 120},
  impossible:  {label: 'невозможно', skip: 600},
  interrupted: {label: 'прервано', skip: 0},
};

// a task's key for skipping: a job by its job id, anything else by its task id. A fight and help are
// keyed by whom: «the foe slipped away» or «could not reach the wounded» keeps one from that one, not
// from the next foe or the next wounded (a band's healer too: agents/tasks.js mend); a cry answered in vain keeps one from that cry, not from the next;
// a carcass a beast cannot reach keeps it from that carcass, a victim it cannot get at from that victim (agents/behaviours/feed.js, maul.js)
export const taskKey = t => (t.id === 'job' ? 'job:' + t.job : t.id === 'fight' ? 'fight:' + (t.target?.id ?? '') : t.id === 'aid' ? 'aid:' + t.who : t.id === 'mend' ? 'mend:' + t.who : t.id === 'answer' ? 'answer:' + t.flag : t.id === 'feed' ? 'feed:' + t.c : t.id === 'maul' ? 'maul:' + (t.target?.id ?? '') : t.id);
// the reflexes are never skipped: running from fire or home, the alarm, the firefighting
const REFLEX = new Set(['runHome', 'flee', 'muster', 'reserve', 'douse']);
export const skipped = (w, a, t) => !REFLEX.has(t.id) && (a.skips?.[taskKey(t)] ?? -1) > w.tick;
const label = t => TASKS.get(t.id).label(t);

// exit hooks for job runners (agents/jobRunners.js registers them): (w, a, task, outcome)
export const RUNNER_EXIT = {};

function close(w, a, t, outcome, why) {
  if (!t || t.closed) return;
  t.closed = outcome;
  releaseAll(w, a);
  a.stalking = false; a.path = null; a.approachGuard = null;
  const def = TASKS.get(t.id);
  def.exit?.(w, a, t, outcome);
  if (t.id === 'job') RUNNER_EXIT[def.runnerOf?.(t)]?.(w, a, t, outcome);
  const skip = OUTCOMES[outcome].skip;
  if (skip && !REFLEX.has(t.id)) {
    const sk = a.skips ||= {};
    for (const k in sk) if (sk[k] <= w.tick) delete sk[k];   // spent pauses go (a fight or a cry per foe would pile up)
    sk[taskKey(t)] = w.tick + skip;
  }
  const b = w.behave;
  if (b && t.id === 'job') (b.outcomes ||= {})[outcome] = (b.outcomes[outcome] || 0) + 1;
  // the card shows refusals of any task, and interruptions of work (a council or a meal giving way to
  // sleep is just the evening going on)
  if (outcome !== 'done' && why && (outcome !== 'interrupted' || t.id === 'job')) {
    a.lastStop = {t: w.tick, task: label(t), why, outcome};
    if (b) b.stops++;
  }
}

// a task ends itself: done, blocked or impossible (with the reason for the card)
export function endTask(w, a, outcome = 'done', why = null) {
  const t = a.task;
  a.task = null; wake(a, outcome === 'done' ? 'дело сделано' : `не вышло: ${why || OUTCOMES[outcome].label}`, outcome === 'done' ? 'дело сделано' : 'дело не вышло');
  close(w, a, t, outcome, why);
}

// called by the brain before and after each step: a task replaced from outside is closed as
// interrupted (its reason: what decide() chose instead, or the task that took its place), and a new
// task is entered
export function syncTask(w, a) {
  const last = a.lastTask;
  if (last && last !== a.task && !last.closed) close(w, a, last, 'interrupted', a.switchWhy || (a.task ? `отвлёкся: ${label(a.task)}` : null));
  a.switchWhy = null;
  if (a.task && a.task !== last) { a.task.since ??= w.tick; TASKS.get(a.task.id).enter?.(w, a, a.task); }
  a.lastTask = a.task;
}
