// The facts of a caravan's camp on the local map (src/social/facts.js; plan claude/caravan-ver_d.md §4.3): when a member
// does something to another that counts — a wound dressed, one pulled back from death — the camp notes it as a fact, in the
// members' ids, with those who saw it. The bond it moves is moved where it happens (settlement/together.js bond): the fact is
// its reason and the memory of it, not a second sum. Outside a caravan's camp (no w.campaign) nothing is noted.
import {makeFact} from '../social/facts.js';
import {SOCIAL, FACT_KINDS} from '../data/social.js';
import {colonists} from './query.js';
import {canSee, darkness} from '../agents/combat.js';
import {dist} from '../core/util.js';

// awake, standing, near enough in this light, and the doer or the other in sight
const sees = (w, o, a, b) => !o.sleeping && !o.downed && !o.dead && [a, b].some(x => x && dist(o, x) <= SOCIAL.see * darkness(w, o) && canSee(w, o, x));

export function noteFact(w, kind, by, to, params = {}) {
  const C = w.campaign; if (!C?.memberOf) return null;
  const mb = by ? C.memberOf.get(by.id) : null, mt = to ? C.memberOf.get(to.id) : null;
  if ((by && mb == null) || (to && mt == null)) return null;   // one of them is not of the company
  // a deed that goes on (working side by side, an escort, a fight shoulder to shoulder): one fact a camp for the pair
  if (FACT_KINDS[kind].once) { const key = `${kind}:${[mb, mt].sort((p, q) => p - q).join(':')}`, D = (C.factOnce ||= new Set()); if (D.has(key)) return null; D.add(key); }
  const saw = colonists(w).filter(o => o !== by && o !== to && C.memberOf.has(o.id) && sees(w, o, by, to)).map(o => C.memberOf.get(o.id));
  const n = (C.factN = (C.factN || 0) + 1);
  const f = makeFact(`${C.S.seed}#${n}`, kind, {by: mb, to: mt, saw, day: C.S.day, tick: w.tick, session: C.S.seed, params});
  (C.facts ||= []).push(f);
  return f;
}
