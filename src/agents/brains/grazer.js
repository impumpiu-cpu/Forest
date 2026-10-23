// Grazer brain (hares and other skittish animals): nibble around the meadows, sit still at night,
// bolt from people and fire, and now and then wander off the map for good. A herd beast (deer, goats:
// species `herd`, agents/wildHerd.js) trusts its herd's lookouts instead of its own eyes, grazes on the
// herd's pasture, and decides by itself when to bolt at the herd's alarm.
import {SPECIES, matchesKind} from '../../data/species.js';
import {grazeCodes} from '../../data/terrain.js';
import {nightness} from '../../core/time.js';
import {cellOf, walkable, inBounds, inMap} from '../../world/grid.js';
import {moveToward, escapeHeat, nearFire, bolt, follow, sprintMul, recover, approach, shunsHeat, sameLand} from '../movement.js';
import {kill} from '../agent.js';
import {tempAt} from '../../world/heat.js';
import {nearAgents} from '../spatial.js';
import {herdOf, herdAlarm, bolts, toPatch, threatsNear, calmHerders} from '../wildHerd.js';
import {hpShare} from '../agent.js';
import {heatHarm} from '../body.js';

// a herder holding out hay close by: it stops and sniffs at it
const hay = (w, a) => calmHerders(w).some(o => o.task?.tame === a.id && (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 9);

// a herd beast's step after the reflexes (heat): the herd's alarm, its pasture
function herdStep(w, a, sp, H, i) {
  const al = herdAlarm(w, H);
  if ((al && bolts(w, a, al, sp)) || a.spooked > 0) {
    a.spooked = Math.max(0, (a.spooked || 0) - 1);
    if (a.task?.id !== 'bolt') a.boltAt = w.tick;
    a.task = {id: 'bolt'};
    const from = al ? al.threats : threatsNear(w, a, 10, sp.flee.from);
    // a wounded one cannot keep up: it falls behind the herd
    bolt(w, a, from, sprintMul(a, sp.flee.sprint, sp.flee.stamina) * (0.55 + 0.45 * hpShare(a)));
    return;
  }
  recover(a);
  if (al) { a.task = {id: 'alert'}; return; }   // heads up, not yet running: its own nerve holds it
  if (hay(w, a)) { a.task = {id: 'graze'}; return; }
  if (a.task?.id === 'leave' || w.rngs.wild() < sp.leaveChance) {
    a.task = {id: 'leave'};
    if (follow(w, a, 'edge') === 'arrived') a.gone = true;
    return;
  }
  if (nightness(w) > 0.7) { a.task = {id: 'rest'}; return; }
  // graze on its own patch of the herd's pasture
  const t = a.task?.id === 'graze' ? a.task : (a.task = {id: 'graze'});
  toPatch(w, a, H, t, 0.35, approach);
  if (w.grid.food[i] > 0.05) w.grid.food[i] = Math.max(0, w.grid.food[i] - sp.grazes.eatsBerries);
}

export const grazerBrain = {
  id: 'grazer',
  step(w, a) {
    const sp = SPECIES.get(a.species), i = cellOf(w, a), T = tempAt(w, i);
    if (heatHarm(a, sp, T, 'beast')) { if (a.hp <= 0) { kill(w, a, 'огня'); return; } }
    if (shunsHeat(w, a, sp, T, 2)) { a.task = {id: 'bolt'}; escapeHeat(w, a, sp.flee.sprint); return; }
    const H = herdOf(w, a);
    if (H) { herdStep(w, a, sp, H, i); return; }

    const threats = threatsNear(w, a, sp.flee.radius, sp.flee.from);
    if (threats.length || a.spooked > 0) {
      a.spooked = Math.max(0, (a.spooked || 0) - 1);
      a.task = {id: 'bolt'};
      const from = threats.length ? threats : threatsNear(w, a, 10, sp.flee.from);
      bolt(w, a, from, sprintMul(a, sp.flee.sprint, sp.flee.stamina));
      return;
    }
    recover(a);
    // a herder holding out hay: it stops and sniffs at it
    if (hay(w, a)) { a.task = {id: 'graze'}; return; }
    if (a.task?.id === 'leave' || w.rngs.wild() < sp.leaveChance) {
      a.task = {id: 'leave'};
      if (follow(w, a, 'edge') === 'arrived') a.gone = true;
      return;
    }
    if (nightness(w) > 0.7) { a.task = {id: 'rest'}; return; }

    // graze: hop to a nearby patch of preferred terrain, nibble berries on the way
    const t = a.task?.id === 'graze' ? a.task : (a.task = {id: 'graze'});
    if (!t.spot || w.rngs.wild() < 0.01) {
      const ok = grazeCodes(sp.grazes.terrain);
      // mostly nibble nearby, now and then wander off to another meadow; of a few candidate
      // patches take the lushest one that is not hard against the map edge
      const reach = w.rngs.wild() < 0.15 ? 30 : 7;
      let bestV = -Infinity;
      for (let k = 0; k < 12; k++) {
        const x = a.x + (w.rngs.wild() * 2 - 1) * reach, y = a.y + (w.rngs.wild() * 2 - 1) * reach;
        if (!inMap(w, x, y)) continue;
        const j = (y | 0) * w.w + (x | 0);
        if (!walkable(w, j) || !ok.has(w.grid.terr[j]) || !sameLand(w, a, j)) continue;
        const v = w.grid.fert[j] + Math.min(8, x, y, w.w - x, w.h - y) * 0.12 + w.rngs.wild() * 0.3;
        if (v > bestV) { bestV = v; t.spot = [x, y]; }
      }
    }
    if (t.spot && approach(w, a, t.spot[0], t.spot[1], 0.35) !== false) t.spot = null;   // there, or unreachable: pick another
    if (w.grid.food[i] > 0.05) w.grid.food[i] = Math.max(0, w.grid.food[i] - sp.grazes.eatsBerries);
  },
};
