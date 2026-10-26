// Feed: eat from a carcass (agents/carcass.js) — the pack's own kill, or one it smells while hungry (a scavenger
// takes anyone's). Keeps eating until full, the carcass is bare, or it cannot get to it. A meal from before
// carcasses were things on the map (an old save) runs down by its timer. Reads: predator {sated, meal, feedTicks}.
import {approach, recover} from '../movement.js';
import {carcassById, smellCarcass, eat, CARCASS} from '../carcass.js';
import {endTask} from '../lifecycle.js';
import {dist, paramsOf} from '../hunting.js';
import {PROWL} from '../../data/behaviour.js';

export const feed = {
  want(w, a, {sp}) {
    const P = sp.predator, W = PROWL.want;
    if (a.task?.id === 'feed') return [[a.task, W.feedOn, () => 'ест добычу']];
    // a carcass it knows of: back to it while hungry — not while a try at people has it scared off
    if (a.needs.food < P.sated - PROWL.smellBelow && !(w.tick < (a.calmUntil || 0) && a.task?.id === 'bolt')) {
      const c = smellCarcass(w, a);
      if (c) return [[{id: 'feed', c: c.id}, W.carcass, () => 'чует тушу']];
    }
    return null;
  },
  step(w, a, t) {
    recover(a);
    if (t.left != null) { a.needs.food = Math.min(1, a.needs.food + t.gain); if (--t.left <= 0) endTask(w, a); return; }
    const c = carcassById(w, t.c), F = PROWL.feed;
    if (!c || c.food < F.least || a.needs.food >= F.done) { endTask(w, a); return; }
    if (dist(a, c) > CARCASS.eatAt) { if (approach(w, a, c.x, c.y, F.pace) === null) endTask(w, a, 'impossible', 'к туше не подойти'); return; }
    const P = paramsOf(a);
    if (!eat(w, a, c, P.meal / P.feedTicks)) endTask(w, a);
  },
};
