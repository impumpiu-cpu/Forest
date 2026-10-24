// The tabled brain (docs/BEHAVIOUR.md): one brain for every species whose row lists its behaviours
// (`behaviours: [...]`, agents/behaviours/). Each step: the body, then the choice, then the task.
//
// The choice goes lane by lane (reflex > red > yellow > routine): the first lane with anything on offer
// is the one weighed, so an alarm interrupts the queue of ordinary things instead of competing with it,
// and when it is over the queue goes on. Within the lane the highest score wins, the current task with
// its behaviour's `keep` on top; a tie goes to the first in the species' list. A task that just ended
// blocked or impossible is skipped for a while (agents/lifecycle.js), as it is for a colonist.
//
// A creature thinks every tick unless its row says otherwise (`heart`: ticks between thoughts); the two
// upper lanes are looked at every tick regardless, so a fire or a foe is never waited on. The choice is
// written on the creature (a.why), as it is for a colonist's card.
import {SPECIES} from '../../data/species.js';
import {nightness} from '../../core/time.js';
import {cellOf} from '../../world/grid.js';
import {tempAt} from '../../world/heat.js';
import {TASKS} from '../tasks.js';
import {BANDS, lanesOf} from '../../data/behaviours.js';
import {ACTS} from '../behaviours/index.js';
import {stepBody, heatHarm} from '../body.js';
import {kill} from '../agent.js';
import {syncTask, skipped} from '../lifecycle.js';

const key = t => (t ? (t.mode ? `${t.id}:${t.mode}` : t.id) : '');
const label = t => TASKS.get(t.id).label(t);

// the lanes on offer, first that has anything; `from` — only these lanes (the upper two, between thoughts)
function offers(w, a, ctx, lanes, from) {
  for (const band of from) {
    let opts = null;
    for (const d of lanes[band]) { const o = ACTS[d.id].want(w, a, ctx); if (o) for (const x of o) (opts ||= []).push([x[0], x[1], x[2], d]); }
    if (opts) return [band, opts];
  }
  return null;
}

function decide(w, a, ctx, from) {
  const found = offers(w, a, ctx, lanesOf(ctx.sp), from);
  if (!found) return false;
  const [band, opts] = found, cur = a.task?.id ?? '';
  let best = null, bs = -Infinity, bestWhy = null;
  for (const [t, s, why, d] of opts) {
    if (t.id !== cur && skipped(w, a, t)) continue;
    const sc = s + (t.id === cur ? d.keep || 0 : 0);
    if (sc > bs) { bs = sc; best = t; bestWhy = why; }
  }
  if (!best) return false;
  if (best.id !== cur) a.task = best;   // a new task; the same one keeps its object (spot, progress), only its mode moves
  else if (a.task.mode !== best.mode) a.task.mode = best.mode;
  if (key(best) !== a.lastWhy) { a.lastWhy = key(best); a.why = {t: w.tick, task: label(best), score: +bs.toFixed(2), why: bestWhy?.() || '', band, woke: 'думает'}; }
  return true;
}

export const tabledBrain = {
  id: 'tabled',
  step(w, a) {
    const sp = SPECIES.get(a.species);
    // the body: a creature with needs has the full one (hunger, cold, healing); one without only burns
    let T;
    if (sp.needs.length) T = stepBody(w, a);
    else { T = tempAt(w, cellOf(w, a)); if (heatHarm(a, sp, T, 'beast') && a.hp <= 0) kill(w, a, 'огня'); }
    if (a.dead) return;
    const ctx = {sp, T, night: nightness(w)};
    // the choice: every `heart` ticks in full, the alarms every tick
    const heart = sp.heart ?? 1;
    if (!a.task || --a.think <= 0) { decide(w, a, ctx, BANDS); a.think = heart; }
    else if (heart > 1) decide(w, a, ctx, BANDS.slice(0, 2));
    if (!a.task) return;
    syncTask(w, a);
    TASKS.get(a.task.id).step(w, a, a.task);
    syncTask(w, a);
    if (a.cd > 0) a.cd--;
  },
};
