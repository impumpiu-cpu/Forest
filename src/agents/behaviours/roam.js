// Roam: the pack's default — the leader picks where to go, the others keep close behind it. Hungry, the leader
// follows the scent of the nearest animal it hunts (A* around lakes and rocks; the trail is picked again now and
// then, one that leads nowhere is dropped for a while); otherwise it heads for a spot of open land away from the
// settlement, choosing another when there or when stuck. In the `shy` mode (scare) it walks uphill out of the
// settlement zone. Reads: predator {hungry, prey, zoneShyNight}.
import {walkable} from '../../world/grid.js';
import {nightness} from '../../core/time.js';
import {approach, ascend, bolt, recover, sameLand} from '../movement.js';
import {agentInZone} from '../../settlement/zone.js';
import {liveById} from '../lookup.js';
import {dist, packOf, paramsOf, nearest, ignoreFor} from '../hunting.js';
import {PROWL} from '../../data/behaviour.js';

export const roam = {
  want() { return [[{id: 'roam'}, PROWL.want.roam, () => 'рыщет']]; },
  step(w, a, r) {
    recover(a);
    if (r.mode === 'shy') { if (!ascend(w, a, 'zone', 1)) bolt(w, a, [{x: w.camp.x + 0.5, y: w.camp.y + 0.5}], 1); return; }
    const R = PROWL.roam, P = paramsOf(a), leader = packOf(w, a)[0];
    if (leader && leader !== a) {
      if (dist(a, leader) > R.follow) approach(w, a, leader.x + (a.id % 3 - 1), leader.y + ((a.id >> 1) % 3 - 1), R.followPace);
      return;
    }
    if (a.needs.food < P.hungry) {
      let s = [liveById(w, r.scent)].find(o => o && !o.tame) || null;
      if (!s || w.tick - (r.scentAt || 0) > PROWL.scentAgain) {
        s = nearest(w, a, P.prey, PROWL.scent, o => !agentInZone(w, o) && !(a.ignore?.get(o.id) > w.tick));
        r.scent = s?.id ?? null; r.scentAt = w.tick;
      }
      if (s) {
        if (approach(w, a, s.x, s.y, R.scentPace) !== null) return;
        ignoreFor(w, a, s.id, PROWL.chase.ignoreFor); r.scent = null;
      }
    }
    // pick a new spot when there or when stuck (no progress for a while, e.g. a lake in the way)
    const d = r.spot ? dist(a, {x: r.spot[0], y: r.spot[1]}) : 0;
    if (r.spot && d < r.bestD - 0.5) { r.bestD = d; r.since = w.tick; }
    if (!r.spot || d < R.spotNear || w.tick - (r.since || 0) > R.stuck) {
      for (let k = 0; k < R.tries; k++) {
        const x = 2 + w.rngs.wild() * (w.w - 4), y = 2 + w.rngs.wild() * (w.h - 4);
        const j = (y | 0) * w.w + (x | 0);
        if (!walkable(w, j) || w.nav.get('zone')[j] < P.zoneShyNight + R.margin || !sameLand(w, a, j)) continue;
        r.spot = [x, y]; r.bestD = Infinity; r.since = w.tick; break;
      }
    }
    if (r.spot && approach(w, a, r.spot[0], r.spot[1], nightness(w) > PROWL.nightLit ? R.nightPace : R.dayPace) === null) r.spot = null;   // across the water: choose again
  },
};
