// The tabled brain (docs/BEHAVIOUR.md): one brain for every creature that thinks by a list of behaviours
// (data/behaviours.js; the code in agents/behaviours/) — the species' own list, or a role's (agents/brains/index.js:
// a tamed beast, a raider, a trader, a colonist). Each step: the body, then what the behaviours do every tick
// (`always`: an aura, a veil), then the choice, then the task.
//
// The choice goes lane by lane (reflex > red > yellow > routine): the first lane with anything on offer is the one
// weighed, so an alarm interrupts the queue of ordinary things instead of competing with it, and when it is over the
// queue goes on. Within the lane the highest score wins; the task under way gets its behaviour's `keep` on top (a
// number of the catalogue, or the code's function of the task: work begun is held harder); a tie goes to the first
// in the list. A task that just ended blocked or impossible is skipped for a while (agents/lifecycle.js). Tasks are
// told apart by their key (lifecycle taskKey: a job by its job, a run to a cry by its flag): an offer of the task
// under way keeps the task object (its spot, its progress) and refreshes what the offer carries (its mode, its
// target); a new task is entered through the lifecycle, the one it drops is closed as interrupted with the reason
// (a `quiet` task — a meal giving way to sleep — just winds down), and the behaviour that offered it hears of it
// (`pick`: a hunt begins, the pack is called, a job is signed up for). The choice and the runner-up are written on
// the creature (a.why) for its card.
//
// A creature thinks every tick unless its role or row says otherwise (`heart`: ticks between thoughts, or a function
// of the creature — a colonist thinks when something happened, agents/attention.js wake); the two upper lanes are
// looked at every tick regardless, so a fire or a foe is never waited on. A role may put a thought off (`hold`: a
// delivery under way is finished first). A task that ends in its step makes room for the next one at once, unless the
// role takes a breath between two things (`breath`).
import {SPECIES} from '../../data/species.js';
import {nightness} from '../../core/time.js';
import {cellOf} from '../../world/grid.js';
import {tempAt} from '../../world/heat.js';
import {TASKS} from '../tasks.js';
import {BANDS, lanesOf} from '../../data/behaviours.js';
import {ACTS} from '../behaviours/index.js';
import {stepBody, heatHarm} from '../body.js';
import {kill, maxHp} from '../agent.js';
import {syncTask, skipped, taskKey} from '../lifecycle.js';
import {noteThink} from '../attention.js';

const key = t => (t ? taskKey(t) : '');
const label = t => TASKS.get(t.id).label(t);
const ALARMS = BANDS.slice(0, 2);

// the lanes on offer, first that has anything; `from` — only these lanes (the upper two, between thoughts)
function offers(w, a, ctx, lanes, from) {
  for (const band of from) {
    let opts = null;
    for (const d of lanes[band]) { const o = ACTS[d.id].want(w, a, ctx); if (a.dead) return null; if (o) for (const x of o) (opts ||= []).push([x[0], x[1], x[2], d, x[3]]); }   // (killed while asked — a rat caught at the stores: nothing more)   // [task, score, why, behaviour, what else the offer carried]
    if (opts) return [band, opts];
  }
  return null;
}

const keepOf = (w, a, d, t) => { const k = ACTS[d.id].keep; return typeof k === 'function' ? k(w, a, t) : d.keep || 0; };

function decide(w, a, ctx, from) {
  const found = offers(w, a, ctx, lanesOf(ctx.list), from);
  if (!found) return false;
  const [band, opts] = found, cur = key(a.task);
  let best = null, bs = -Infinity, bestWhy = null, by = null, alt = null, as = -Infinity, altWhy = null;
  for (const [t, s, why, d] of opts) {
    if (key(t) !== cur && !t.reflex && skipped(w, a, t)) continue;   // the task under way is never skipped, nor a reflex
    const sc = s + (key(t) === cur ? keepOf(w, a, d, t) : 0);
    if (sc > bs) { if (best && key(best) !== key(t)) { alt = best; as = bs; altWhy = bestWhy; } bs = sc; best = t; bestWhy = why; by = d; }
    else if (sc > as && key(t) !== key(best)) { alt = t; as = sc; altWhy = why; }
  }
  if (!best) return false;
  const kept = key(best) === cur, thought = from === BANDS || !kept;
  // a thought — a full one, or a look at the alarms between thoughts that found something new — is explained for the
  // card (what, why, the runner-up, whether it was kept, what woke the thinker) and noted; a look that found nothing
  // new is neither
  if (thought) {
    const woke = a.wakeWhy ?? ctx.brain.idleWake ?? 'думает';
    a.why = {t: w.tick, task: label(best), score: +bs.toFixed(2), why: bestWhy?.() || '', kept, alt: alt ? label(alt) : null, altScore: alt ? +as.toFixed(2) : null, altWhy: altWhy?.() || '', band, woke};
    if (ctx.brain.tallies) noteThink(w, a.wakeKind || (a.wakeWhy == null ? 'по привычке' : woke), kept);
    ctx.brain.decided?.(w, a, best, opts);
  }
  if (best !== a.task) {
    if (kept) { a.task.mode = best.mode; Object.assign(a.task, best); }   // the same task, refreshed by the offer
    else {
      // the task it drops is closed as interrupted by syncTask(), with this reason; a quiet one just winds down
      if (a.task) { if (TASKS.get(a.task.id).quiet) a.task.closed = 'done'; else a.switchWhy = `ради «${a.why.task}»: ${a.why.why}`; if (ctx.brain.tallies) w.behave.switches++; }
      a.task = best;
      ACTS[by.id].pick?.(w, a, best, bs);
    }
  }
  if (thought) { a.wakeWhy = null; a.wakeKind = null; }
  return thought ? 'thought' : 'kept';
}

function run(w, a) {
  syncTask(w, a);
  TASKS.get(a.task.id).step(w, a, a.task);
  syncTask(w, a);
}

// a beast's body: a creature with needs has the full one (hunger, cold, healing); one without only burns — as the
// nechist or as a beast (data/behaviour.js HEAT) — and mends if its row says so (`mends`). → T
function beastBody(w, a) {
  const sp = SPECIES.get(a.species);
  if (sp.needs.length) return stepBody(w, a);
  const T = tempAt(w, cellOf(w, a));
  if (heatHarm(a, sp, T, sp.kind === 'spirit' ? 'spirit' : 'beast') && a.hp <= 0) kill(w, a, 'огня');
  if (sp.mends && a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + sp.mends * maxHp(a));   // wounds close slowly (a mule, a bear)
  return T;
}

// one step of a creature that thinks by a list of behaviours. `brain` — the species row or the role
// (agents/brains/index.js): {behaviours, body?, heart?, hold?, breath?, fire?, decided?, tallies?, idleWake?}
export function tabledStep(w, a, brain) {
  const sp = SPECIES.get(a.species), list = brain.behaviours;
  const T = (brain.body || beastBody)(w, a);
  if (a.dead) return;
  const ctx = {sp, list, brain, T, night: nightness(w)};
  // what the behaviours do every tick whatever the task (an aura, a veil, a body's own healing, the gear swap at the camp)
  for (const id of list) ACTS[id].always?.(w, a, ctx);
  if (a.dead) return;
  // the choice: every `heart` ticks in full (or when woken: a.think = 0), the alarms every tick
  const heart = typeof brain.heart === 'function' ? brain.heart(w, a) : brain.heart ?? sp.heart ?? 1;
  // a task gone without the lifecycle (the council over, settlement/council.js) is still something that happened
  if (!a.task && a.wakeWhy == null) { a.wakeWhy = 'дело кончилось'; a.wakeKind = 'дело кончилось'; }
  const beat = () => { a.think = typeof brain.heart === 'function' ? brain.heart(w, a) : heart; };
  if (!a.task || heart === 1 || --a.think <= 0) {
    if (a.task && brain.hold?.(w, a)) { beat(); if (decide(w, a, ctx, ALARMS) === 'thought') beat(); }
    else { decide(w, a, ctx, BANDS); beat(); }
  } else if (decide(w, a, ctx, ALARMS) === 'thought') beat();   // an alarm answered counts as a thought: the heartbeat starts anew
  if (a.task && !a.dead) run(w, a);
  // the task ended by itself: the next one steps in at once — unless the role takes a breath between two things
  // (a colonist: its task's end is an event it thinks about at its next step)
  if (!a.task && !a.dead && !brain.breath && decide(w, a, ctx, BANDS)) run(w, a);
  if (a.cd > 0) a.cd--;
}

export const tabledBrain = {id: 'tabled', step(w, a) { tabledStep(w, a, SPECIES.get(a.species)); }};
