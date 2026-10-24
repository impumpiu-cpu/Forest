// Lurk: the nechist keeps to its home ground — deep wood, open grass, the shore — drifting from spot to spot and
// out of the settlement's way (`spirit.keepOff` cells from the camp); with no home ground close by it looks across
// the map now and then. The rusalka's `sing` walks the same way (lure.js). Reads: spirit {home, keepOff}.
import {SPECIES} from '../../data/species.js';
import {inMap} from '../../world/grid.js';
import {approach, sameLand} from '../movement.js';
import {isHome, homeCell, dist} from '../nechist.js';
import {NECHIST} from '../../data/behaviour.js';

export function wanderStep(w, a, t) {
  const S = SPECIES.get(a.species).spirit, R = NECHIST.wander;
  if (!t.spot || dist(a, {x: t.spot[0], y: t.spot[1]}) < R.near || w.rngs.nechist() < R.newSpot) {
    t.spot = null;
    for (let k = 0; k < R.tries; k++) {
      const x = a.x + (w.rngs.nechist() * 2 - 1) * R.reach, y = a.y + (w.rngs.nechist() * 2 - 1) * R.reach;
      if (!inMap(w, x, y)) continue;
      // home ground, and out of the settlement's way (`keepOff` cells from the camp)
      if (isHome(w, (y | 0) * w.w + (x | 0), S.home) && sameLand(w, a, (y | 0) * w.w + (x | 0)) && Math.hypot(x - w.camp.x, y - w.camp.y) > (S.keepOff || 0)) { t.spot = [x, y]; break; }
    }
    // no home ground close by: look across the map, but not more than once in a while
    if (!t.spot && w.tick - (t.searched ?? -1e9) > R.searchAgain) { t.searched = w.tick; const i = homeCell(w, S.home, S.keepOff || 0); if (i >= 0) t.spot = [i % w.w + 0.5, ((i / w.w) | 0) + 0.5]; }
  }
  if (t.spot && approach(w, a, t.spot[0], t.spot[1], R.pace) === null) t.spot = null;
}

export const lurk = {
  want(w, a) { return [[a.task?.id === 'lurk' ? a.task : {id: 'lurk'}, NECHIST.want.lurk, () => 'таится на своей земле']]; },
  step: wanderStep,
};
