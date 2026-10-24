// Graze: nibble around the meadows. A lone beast hops to a nearby patch of its terrain (`grazes.terrain`),
// now and then wanders off to another meadow, and eats the berries on its way (`grazes.eatsBerries`);
// a herd beast grazes on its own patch of the herd's pasture (agents/wildHerd.js). In the `hay` mode
// (sniffHay) it stands and sniffs instead, keeping its spot. Reads: grazes {terrain, eatsBerries, shunZone?}; herd.
import {SPECIES} from '../../data/species.js';
import {grazeCodes} from '../../data/terrain.js';
import {walkable, inMap, cellOf} from '../../world/grid.js';
import {approach, recover, sameLand} from '../movement.js';
import {herdOf, toPatch} from '../wildHerd.js';
import {GRAZE, WANT} from '../../data/behaviour.js';

export const graze = {
  want() { return [[{id: 'graze'}, WANT.graze, () => 'щиплет траву']]; },
  step(w, a, t) {
    recover(a);
    if (t.mode === 'hay') return;
    const sp = SPECIES.get(a.species), i = cellOf(w, a), H = herdOf(w, a);
    if (H) toPatch(w, a, H, t, GRAZE.pace, approach);
    else {
      if (!t.spot || w.rngs.wild() < GRAZE.newSpot) {
        const ok = grazeCodes(sp.grazes.terrain);
        // mostly nibble nearby, now and then wander off to another meadow; of a few candidate
        // patches take the lushest one that is not hard against the map edge
        const reach = w.rngs.wild() < GRAZE.farOff ? GRAZE.far : GRAZE.near;
        let bestV = -Infinity;
        for (let k = 0; k < GRAZE.tries; k++) {
          const x = a.x + (w.rngs.wild() * 2 - 1) * reach, y = a.y + (w.rngs.wild() * 2 - 1) * reach;
          if (!inMap(w, x, y)) continue;
          const j = (y | 0) * w.w + (x | 0);
          if (!walkable(w, j) || !ok.has(w.grid.terr[j]) || !sameLand(w, a, j) || (sp.grazes.shunZone && w.zone[j])) continue;   // a mule keeps off the settlement
          const v = w.grid.fert[j] + Math.min(8, x, y, w.w - x, w.h - y) * GRAZE.edge + w.rngs.wild() * GRAZE.lush;
          if (v > bestV) { bestV = v; t.spot = [x, y]; }
        }
      }
      if (t.spot && approach(w, a, t.spot[0], t.spot[1], GRAZE.pace) !== false) t.spot = null;   // there, or unreachable: pick another
    }
    if (w.grid.food[i] > GRAZE.berries) w.grid.food[i] = Math.max(0, w.grid.food[i] - sp.grazes.eatsBerries);
  },
};
