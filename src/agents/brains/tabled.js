// The tabled brain (docs/BEHAVIOUR.md): one brain for every species whose row lists its behaviours
// (`behaviours: [...]`, data/behaviours.js; the code in agents/behaviours/). Each step: the body, then the
// choice, then the task.
//
// The choice goes lane by lane (reflex > red > yellow > routine): the first lane with anything on offer
// is the one weighed, so an alarm interrupts the queue of ordinary things instead of competing with it,
// and when it is over the queue goes on. Within the lane the highest score wins, the current task with
// its behaviour's `keep` on top; a tie goes to the first in the species' list. A task that just ended
// blocked or impossible is skipped for a while (agents/lifecycle.js), as it is for a colonist. An offer of
// the task already under way keeps the task object (its spot, its progress) and refreshes what the offer
// carries (its mode, its target); a new task is entered through the lifecycle, and the behaviour that
// offered it hears of it (`pick`: a hunt begins, the pack is called).
//
// A behaviour may also act every tick whatever the task (`always`: an aura, a veil, a body's own healing).
//
// A creature thinks every tick unless its row says otherwise (`heart`: ticks between thoughts); the two
// upper lanes are looked at every tick regardless, so a fire or a foe is never waited on. A task that ends
// in its step makes room for the next one at once: the choice is made again and the new task steps in the
// same tick, so nobody stands still for a tick between two things. The choice is written on the creature
// (a.why), as it is for a colonist's card.
import {SPECIES} from '../../data/species.js';
import {nightness} from '../../core/time.js';
import {cellOf} from '../../world/grid.js';
import {tempAt} from '../../world/heat.js';
import {TASKS} from '../tasks.js';
import {BANDS, lanesOf} from '../../data/behaviours.js';
import {ACTS} from '../behaviours/index.js';
import {stepBody, heatHarm} from '../body.js';
import {kill, maxHp} from '../agent.js';
import {syncTask, skipped} from '../lifecycle.js';

const key = t => (t ? (t.mode ? `${t.id}:${t.mode}` : t.id) : '');
const label = t => TASKS.get(t.id).label(t);
const ALARMS = BANDS.slice(0, 2);

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
  const found = offers(w, a, ctx, lanesOf(ctx.list), from);
  if (!found) return false;
  const [band, opts] = found, cur = a.task?.id ?? '';
  let best = null, bs = -Infinity, bestWhy = null, by = null;
  for (const [t, s, why, d] of opts) {
    if (t !== a.task && skipped(w, a, t)) continue;
    const sc = s + (t.id === cur ? d.keep || 0 : 0);
    if (sc > bs) { bs = sc; best = t; bestWhy = why; by = d; }
  }
  if (!best) return false;
  if (best !== a.task) {
    if (best.id === cur) { a.task.mode = best.mode; Object.assign(a.task, best); }   // the same task, refreshed by the offer
    else { a.task = best; ACTS[by.id].pick?.(w, a, best); }
  }
  if (key(best) !== a.lastWhy) { a.lastWhy = key(best); a.why = {t: w.tick, task: label(a.task), score: +bs.toFixed(2), why: bestWhy?.() || '', band, woke: 'думает'}; }
  return true;
}

function run(w, a) {
  syncTask(w, a);
  TASKS.get(a.task.id).step(w, a, a.task);
  syncTask(w, a);
}

// one step of a creature that thinks by a list of behaviours: the species' own, or the list a brain carries (a
// tamed beast thinks as livestock whatever its species: agents/brains/index.js)
export function tabledStep(w, a, list) {
  const sp = SPECIES.get(a.species);
  // the body: a creature with needs has the full one (hunger, cold, healing); one without only burns — as the
  // nechist or as a beast (data/behaviour.js HEAT) — and mends if its row says so (`mends`)
  let T;
  if (sp.needs.length) T = stepBody(w, a);
  else {
    T = tempAt(w, cellOf(w, a)); if (heatHarm(a, sp, T, sp.kind === 'spirit' ? 'spirit' : 'beast') && a.hp <= 0) kill(w, a, 'огня');
    if (sp.mends && a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + sp.mends * maxHp(a));   // wounds close slowly (a mule, a bear)
  }
  if (a.dead) return;
  const ctx = {sp, list, T, night: nightness(w)};
  // what the behaviours do every tick whatever the task (an aura, a veil, a body's own healing)
  for (const id of list) ACTS[id].always?.(w, a, ctx);
  if (a.dead) return;
  // the choice: every `heart` ticks in full, the alarms every tick
  const heart = sp.heart ?? 1;
  if (!a.task || heart === 1 || --a.think <= 0) { decide(w, a, ctx, BANDS); a.think = heart; }
  else decide(w, a, ctx, ALARMS);
  if (a.task) run(w, a);
  // the task ended by itself: the next one steps in at once
  if (!a.task && decide(w, a, ctx, BANDS)) run(w, a);
  if (a.cd > 0) a.cd--;
}

export const tabledBrain = {id: 'tabled', step(w, a) { tabledStep(w, a, SPECIES.get(a.species).behaviours); }};
