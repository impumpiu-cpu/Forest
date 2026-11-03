// The contract of a decision (docs/BEHAVIOUR.md «Договор решения»): every mind of the game — a creature's (agents/brains/
// tabled.js), a world actor's (atlas/actor.js), a town's (atlas/build.js, atlas/peoples.js), the caravan's (campaign/march.js)
// — makes its choices the same way, whatever its clock:
//   command   a row of the catalogue (data/commands.js): a full id (`local.behaviour.raid`, `world.deed.raid`, `town.project.build`,
//             `caravan.camp.food`), the decision point it is asked at, its lane, its marks;
//   option    what a command offers at a point: the command, its target and parameters, a score, why;
//   policy    how a point picks among the options of its lane: the highest (`max`), a draw by weight (`draw`), the first in
//             the old order (`first` — a mind moved onto the contract as it was, before its choices get weights);
//   trace     what was asked and what was picked, kept outside the game's state, never drawing on its streams.
// This file is the part that knows nothing of the game: the policies and the trace. Which commands a run allows is its
// profile (data/commands.js maskOf), read by each mind before it asks a command.

// ── the policies. `opts` — [{score, …}] in the order they were asked; the result — the picked one, or null
// the highest score; a tie goes to the first asked; nothing above `floor` — nothing
export function pickMax(opts, floor = -Infinity) {
  let best = null, bs = floor;
  for (const o of opts) if (o.score > bs) { bs = o.score; best = o; }
  return best;
}
// a draw by weight in the order asked (a single option draws nothing); `r` — the stream to draw from
export function pickDraw(opts, r) {
  if (!opts.length) return null;
  let o = opts[0];
  if (opts.length > 1) { let u = r() * opts.reduce((s, x) => s + x.score, 0); for (const x of opts) { u -= x.score; if (u <= 0) { o = x; break; } } }
  return o;
}
// the old order: the commands are asked one by one, and the first that offers anything is taken — the rest are not asked
// (`ask(cmd)` → an option or null; `allowed(cmd)` — the run's profile). → {option, asked: [ids asked]} or {option: null, asked}
export function pickFirst(cmds, ask, allowed = () => true) {
  const asked = [];
  for (const c of cmds) {
    if (!allowed(c)) continue;
    asked.push(c);
    const o = ask(c);
    if (o) return {option: o, asked};
  }
  return {option: null, asked};
}

// the council's way, as a court's (atlas/actor.js): the commands lane by lane (`bands`, the upper first), each lane's allowed
// commands all asked in the old order, the first lane with anything on offer drawn from by weight; the lanes below it are not
// asked. `ask(cmd)` → an option {score, …} or null. → {option, band, opts, asked: [commands asked]}
export function pickLanes(cmds, ask, r, {allowed = () => true, bands = ['reflex', 'red', 'yellow', 'routine']} = {}) {
  const asked = [];
  for (const band of bands) {
    const opts = [];
    for (const c of cmds) {
      if (c.band !== band || !allowed(c)) continue;
      asked.push(c);
      const o = ask(c);
      if (o && o.score > 0) opts.push(o);
    }
    if (opts.length) return {option: pickDraw(opts, r), band, opts, asked};
  }
  return {option: null, band: null, opts: [], asked};
}

// ── the trace. Off by default: the game keeps only its own readout (a.why, actor.why). On, every decision is a record
//   {id, point, who, at, band, policy, opts: [{cmd, key, score}], pick: key | null, alt: key | null, unasked: [lanes or commands]}
// and its outcome is joined later by its id (noteOutcome). Modes:
//   off      nothing kept
//   debug    the last `keep` records of the subjects `who` lets through, in a ring
//   collect  every record handed to `sink` (a file, a stream), nothing kept in memory
// The trace never draws on a game stream, never writes into the game's objects (a record's id rides on a task only while
// tracing: agents/brains/tabled.js) and never asks a command a second time: it records what the choice asked anyway.
export const TRACE = {mode: 'off', who: null, keep: 400, sink: null, seq: 0, buf: [], outcomes: new Map()};
export const tracing = () => TRACE.mode !== 'off';
export function traceMode(mode, {who = null, keep = 400, sink = null} = {}) {
  Object.assign(TRACE, {mode, who, keep, sink, seq: 0, buf: [], outcomes: new Map()});
}
// a decision made: its record kept (debug), handed on (collect) or dropped; → its id, or 0 when nothing was kept
export function noteDecision(rec) {
  if (TRACE.mode === 'off' || (TRACE.who && !TRACE.who(rec))) return 0;
  rec.id = ++TRACE.seq;
  if (TRACE.mode === 'collect') TRACE.sink?.(rec);
  else { TRACE.buf.push(rec); if (TRACE.buf.length > TRACE.keep) TRACE.buf.splice(0, TRACE.buf.length - TRACE.keep); }
  return rec.id;
}
// what came of a decision (done, blocked, impossible, interrupted…), joined by its id
export function noteOutcome(id, outcome, more = null) {
  if (!id || TRACE.mode === 'off') return;
  const o = {id, outcome, ...(more || {})};
  if (TRACE.mode === 'collect') TRACE.sink?.({outcome: o});
  else { TRACE.outcomes.set(id, o); if (TRACE.outcomes.size > TRACE.keep) TRACE.outcomes.delete(TRACE.outcomes.keys().next().value); }
}
// the records kept (debug): the last first, with their outcomes
export const traceRecords = () => TRACE.buf.slice().reverse().map(r => ({...r, outcome: TRACE.outcomes.get(r.id)?.outcome ?? null}));
// a number for a record: rounded so that a record reads the same in every run
export const r3 = v => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);
