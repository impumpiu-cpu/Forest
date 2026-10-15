// Behaviour counters: how well creatures act, not what the colony has. They feed the balance run
// (data/metrics.js, group «Поведение») so that every ordinary game checks what tools/logic-check.mjs
// checks in staged scenes. Plain numbers in w.behave, saved with the world.
//   ticks      — colonist-ticks counted (the denominator for shares and «per person per day»)
//   idle       — colonist-ticks with nothing to do (no task, or «idle»)
//   muster     — colonist-ticks spent gathering at the fire by the alarm
//   company    — colonist-ticks spent going along with someone or helping the wounded (settlement/together.js)
//   switches   — times a colonist changed what it was doing (agents/brains/colonist.js decide)
//   stops      — tasks closed before done, with a reason on the card (agents/lifecycle.js)
//   outcomes   — how jobs ended: {done, blocked, impossible, interrupted} (agents/lifecycle.js)
//   noPath     — A* refusals: no way to a point (agents/movement.js approach)
//   react      — {sum, n}: ticks from being attacked to fighting back or running; missed — attacks
//                that ended before any reaction
//   squads     — raider bands (agents/squad.js): started, and how they ended: goal (reached it and
//                went), retreat (morale broke), wiped (none left alive)
//   social     — joint actions of colonists (settlement/together.js): escort, aid, yield (a bed given
//                up for someone worse off), calm (a quarrel put off because of danger), bond (shared
//                trouble that mended a grudge)
//   invalid    — creature-ticks in a state that must never happen: in rock or water, off the map,
//                or a load whose total does not match its contents. Should stay 0.
import {colonists} from './query.js';
import {walkable} from '../world/grid.js';

export const newBehaviour = () => ({ticks: 0, idle: 0, muster: 0, company: 0, switches: 0, stops: 0, outcomes: {}, noPath: 0,
  react: {sum: 0, n: 0, missed: 0}, invalid: 0, invalidWhat: {},
  squads: {started: 0, goal: 0, retreat: 0, wiped: 0}, social: {escort: 0, aid: 0, yield: 0, calm: 0, bond: 0}});

const REACT = new Set(['fight', 'runHome', 'flee']);
const THINK = 15;   // a colonist thinks again at least this often (agents/brains/colonist.js)

function bad(w, what) {
  const b = w.behave;
  b.invalid++; b.invalidWhat[what] = (b.invalidWhat[what] || 0) + 1;
}

// once a tick, after every brain has stepped
export function sampleBehaviour(w) {
  const b = w.behave || (w.behave = newBehaviour());
  for (const a of w.agents) {
    if (a.dead || a.gone) continue;
    if (!(a.x >= 0 && a.y >= 0 && a.x < w.w && a.y < w.h)) { bad(w, 'за картой'); continue; }
    if (!walkable(w, (a.y | 0) * w.w + (a.x | 0))) bad(w, 'в скале или воде');
  }
  for (const a of colonists(w)) {
    b.ticks++;
    const t = a.task?.id;
    if (!t || t === 'idle') b.idle++;
    if (t === 'muster') b.muster++;
    if (t === 'company' || t === 'aid') b.company = (b.company || 0) + 1;
    if (a.carry && a.carry.n !== Object.values(a.carry.res).reduce((s, v) => s + v, 0)) bad(w, 'груз не сходится');
    // reaction to an attack: from the first tick something mauls it to the first tick it fights or runs
    const attacked = w.agents.some(o => o.task?.id === 'maul' && o.task.target === a && !o.dead);
    if (attacked && a.attackedAt == null) a.attackedAt = w.tick;
    if (a.attackedAt != null && REACT.has(t)) { b.react.sum += w.tick - a.attackedAt; b.react.n++; a.attackedAt = null; }
    // an attack broken off within one think (the beast saw company and backed away) needed no answer
    else if (a.attackedAt != null && !attacked) { if (w.tick - a.attackedAt > THINK) b.react.missed++; a.attackedAt = null; }
  }
}
