// Hide: vermin keeps a hiding place in the brush a little way off the camp and waits there while anyone awake is by
// the stores (VERMIN.watch) — till its patience runs out; a raid on the stores (nibble) lasts VERMIN.grab, then it
// runs back to its hole and sits a while. The kikimora keeps to the marsh while it is light (`vermin.spoils`).
// In the `deep` mode (vanish) the nechist goes to a far home cell, unseen. Reads: vermin.
import {walkable, inMap} from '../../world/grid.js';
import {BY_CODE} from '../../data/terrain.js';
import {approach, sameLand} from '../movement.js';
import {nearAgents} from '../spatial.js';
import {VERMIN} from '../../data/behaviour.js';
import {deepHideStep} from './vanish.js';
import {dist} from '../../core/util.js';


// a hiding place: brush or wood a little way off the camp, outside the settlement zone if it can
function denOf(w, a) {
  if (a.den) return a.den;
  let best = null, bv = -Infinity;
  for (let k = 0; k < VERMIN.denTries; k++) {
    const ang = w.rngs.wild() * Math.PI * 2, r = VERMIN.den[0] + w.rngs.wild() * (VERMIN.den[1] - VERMIN.den[0]);
    const x = w.camp.x + 0.5 + Math.cos(ang) * r, y = w.camp.y + 0.5 + Math.sin(ang) * r;
    if (!inMap(w, x, y)) continue;
    const i = (y | 0) * w.w + (x | 0);
    if (!walkable(w, i) || !sameLand(w, a, i)) continue;
    const v = (BY_CODE[w.grid.terr[i]].shelter || w.grid.bush[i] ? 2 : 0) + (w.zone[i] ? 0 : 1) + w.rngs.wild() * VERMIN.denLuck;
    if (v > bv) { bv = v; best = [x, y]; }
  }
  return (a.den = best || [w.camp.x + 0.5 + VERMIN.den[0], w.camp.y + 0.5]);
}

// someone awake by the stores
const watched = w => { const c = {x: w.camp.x + 0.5, y: w.camp.y + 0.5}; return nearAgents(w, c.x, c.y, VERMIN.watch).some(o => o.faction === 'colony' && !o.dead && !o.sleeping && dist(o, c) < VERMIN.watch); };

export const hide = {
  want(w, a, {sp, night}) {
    const V = sp.vermin, t = a.task;
    // a raid that is under way runs its course, then it is back to the hole
    if (t?.id === 'nibble') { if (t.at != null && w.tick - t.at >= VERMIN.grab) { a.waited = w.tick; return [[{id: 'hide'}, VERMIN.want.hide, () => 'наелся: назад в нору']]; } return null; }
    const bold = w.tick - (a.waited ?? w.tick) > VERMIN.patience;
    if ((V.spoils && night < VERMIN.daylight) || (watched(w) && !bold) || (t?.id === 'hide' && w.tick - (a.waited ?? 0) < VERMIN.hideAfter)) {
      a.waited ??= w.tick;
      return [[{id: 'hide'}, VERMIN.want.hide, () => (V.spoils && night < VERMIN.daylight ? 'светло' : 'у припасов кто-то есть')]];
    }
    return null;
  },
  step(w, a, t) {
    if (t.mode === 'deep') { deepHideStep(w, a, t); return; }
    const [dx, dy] = denOf(w, a);
    if (dist(a, {x: dx, y: dy}) > VERMIN.denAt && approach(w, a, dx, dy, VERMIN.denPace) === null) a.den = null;   // no way there: find another hole
  },
};
