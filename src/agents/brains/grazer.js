// Grazer brain (hares and other skittish animals): nibble around the meadows, sit still at night,
// bolt from people and fire, and now and then wander off the map for good.
import {SPECIES} from '../../data/species.js';
import {TERRAIN} from '../../data/terrain.js';
import {nightness} from '../../core/time.js';
import {cellOf, walkable, inBounds} from '../../world/grid.js';
import {moveToward, escapeHeat, nearFire, bolt, follow} from '../movement.js';
import {kill} from '../agent.js';

function threatsNear(w, a, radius) {
  const out = [];
  for (const o of w.agents) {
    if (o === a || o.dead || !SPECIES.get(o.species).sentient) continue;
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
    if (T > 45 || nearFire(w, a, 2)) { a.task = {id: 'bolt'}; escapeHeat(w, a, sp.flee.sprint); return; }

    const threats = threatsNear(w, a, sp.flee.radius);
    if (threats.length || a.spooked > 0) {
      a.spooked = Math.max(0, (a.spooked || 0) - 1);
      a.task = {id: 'bolt'};
      bolt(w, a, threats.length ? threats : w.agents.filter(o => SPECIES.get(o.species).sentient && (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 100), sp.flee.sprint);
      return;
    }
    if (a.task?.id === 'leave' || Math.random() < sp.leaveChance) {
      a.task = {id: 'leave'};
      if (follow(w, a, 'edge') === 'arrived') a.gone = true;
      return;
    }
    if (nightness(w.tick) > 0.7) { a.task = {id: 'rest'}; return; }

    // graze: hop to a nearby patch of preferred terrain, nibble berries on the way
    const t = a.task?.id === 'graze' ? a.task : (a.task = {id: 'graze'});
    if (!t.spot || Math.random() < 0.01) {
      const ok = new Set(sp.grazes.terrain.map(id => TERRAIN.get(id).code));
      for (let k = 0; k < 12; k++) {
        const x = a.x + (Math.random() * 12 - 6), y = a.y + (Math.random() * 12 - 6);
        if (!inBounds(w, x | 0, y | 0)) continue;
        const j = (y | 0) * w.w + (x | 0);
        if (walkable(w, j) && ok.has(w.grid.terr[j])) { t.spot = [x, y]; break; }
      }
    }
    if (t.spot && moveToward(w, a, t.spot[0], t.spot[1], 0.35) !== false) t.spot = null;
    if (w.grid.food[i] > 0.05) w.grid.food[i] = Math.max(0, w.grid.food[i] - sp.grazes.eatsBerries);
  },
};
