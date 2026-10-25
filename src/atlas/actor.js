// The brain of a world-map actor — a lair's leader (atlas/leaders.js), and the lairs and realms to come — the way
// agents/brains/tabled.js is the brain of a creature: a list of deeds from the species row (data/deeds.js, the code in
// atlas/deeds/), each offering plans with weights, a choice by lanes (reflex > red > yellow > routine), the chosen plan
// carried out by a party (atlas/parties.js) or on the spot.
//
// What differs from a creature's: the tick is a season, not a moment; the lane weighed is drawn by weight rather than
// taken by the highest (a lair or a court is many wills, and the chronicle keeps its variety); and the actor's task is
// the party it has out — while one is out only the upper lanes are looked at, and a plan they choose calls the party
// home first. The choice is written on the actor (`why`) for the readout, as a creature's is.
import {DEED_BANDS, deedLanes} from '../data/deeds.js';
import {DOES} from './deeds/index.js';
import {goHome} from './parties.js';

const ALARMS = DEED_BANDS.slice(0, 2);
const THOUGHTS = 8;   // how many of an actor's last choices are kept for its card

// the lanes on offer, first that has anything: [band, [[plan, weight, why, deed], …]]
function offers(a, actor, ctx, lanes, from) {
  for (const band of from) {
    let opts = null;
    for (const d of lanes[band]) { const o = DOES[d.id].want(a, actor, ctx); if (o) for (const x of o) (opts ||= []).push([x[0], x[1], x[2], d]); }
    if (opts) return [band, opts];
  }
  return null;
}

// one thought of an actor. `brain` — the role: {list, party(a, actor) → the party it has out, setOut(a, actor, choice, ctx)};
// `ctx` carries what the deeds read and the stream to draw from (`r`). Returns the choice [plan, weight, why, deed] or null
export function actorStep(a, actor, brain, ctx) {
  const out = brain.party?.(a, actor) || null;
  const found = offers(a, actor, ctx, deedLanes(brain.list), out ? ALARMS : DEED_BANDS);
  if (!found) return null;
  const [band, opts] = found;
  // the world's choice: a draw by weight, in the list's order (a single offer draws nothing)
  let o = opts[0];
  if (opts.length > 1) { let u = ctx.r() * opts.reduce((s, x) => s + x[1], 0); for (const x of opts) { u -= x[1]; if (u <= 0) { o = x; break; } } }
  const alt = opts.filter(x => x !== o).sort((p, q) => q[1] - p[1])[0];
  actor.why = {year: a.hist.year, season: a.hist.season, deed: o[3].id, weight: +o[1].toFixed(2), why: o[2]?.() || '', band, alt: alt ? alt[3].id : null, altWhy: alt?.[2]?.() || ''};
  // the trail of its thoughts, the last few, for the card (ui/inspect.js)
  const T = actor.thoughts ||= []; T.push(actor.why); if (T.length > THOUGHTS) T.splice(0, T.length - THOUGHTS);
  if (out) goHome(a, out);   // an alarm answered: the party out is called back
  const n0 = a.parties?.length || 0;
  brain.setOut(a, actor, o, ctx);
  for (let k = n0; k < (a.parties?.length || 0); k++) a.parties[k].why = actor.why.why;   // the party carries why it was sent
  return o;
}
