// Grazer brain (hares and other skittish animals): nibble around the meadows, sit still at night,
// bolt from people and fire, and now and then wander off the map for good.
import {SPECIES, matchesKind} from '../../data/species.js';
import {TERRAIN} from '../../data/terrain.js';
import {nightness} from '../../core/time.js';
import {cellOf, walkable, inBounds, inMap} from '../../world/grid.js';
import {moveToward, escapeHeat, nearFire, bolt, follow, sprintMul, recover, approach, shunsHeat, sameLand} from '../movement.js';
import {kill} from '../agent.js';

function threatsNear(w, a, radius, from) {
  const out = [];
  for (const o of w.agents) {
    if (o === a || o.dead || !matchesKind(o.species, from)) continue;
    if (o.task?.tame === a.id) continue;   // the herder coming with bait moves slowly: it lets them come
    const r = radius * (o.stalking ? 0.55 : 1);   // a creeping hunter is noticed much later
    if ((o.x - a.x) ** 2 + (o.y - a.y) ** 2 < r * r) out.push(o);
  }
  return out;
}

export const grazerBrain = {
  id: 'grazer',
  step(w, a) {
    const sp = SPECIES.get(a.species), i = cellOf(w, a), T = w.grid.temp[i];
    if (T > sp.heatHarm) { a.hp -= Math.min(0.01, (T - sp.heatHarm) * 0.0001); if (a.hp <= 0) { kill(w, a, 'огня'); return; } }
    if (shunsHeat(w, a, sp, T, 2)) { a.task = {id: 'bolt'}; escapeHeat(w, a, sp.flee.sprint); return; }

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
    if (w.agents.some(o => o.task?.tame === a.id && o.task.calm && (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 9)) { a.task = {id: 'graze'}; return; }
    if (a.task?.id === 'leave' || w.rngs.wild() < sp.leaveChance) {
      a.task = {id: 'leave'};
      if (follow(w, a, 'edge') === 'arrived') a.gone = true;
      return;
    }
    if (nightness(w.tick) > 0.7) { a.task = {id: 'rest'}; return; }

    // graze: hop to a nearby patch of preferred terrain, nibble berries on the way
    const t = a.task?.id === 'graze' ? a.task : (a.task = {id: 'graze'});
    if (!t.spot || w.rngs.wild() < 0.01) {
      const ok = new Set(sp.grazes.terrain.map(id => TERRAIN.get(id).code));
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
