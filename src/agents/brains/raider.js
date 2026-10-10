// Raider brain: march on the camp, fight whoever stands in the way, grab loot, leave.
import {cellOf} from '../../world/grid.js';
import {escapeHeat, nearFire} from '../movement.js';
import {nearestHostile} from '../combat.js';
import {TASKS} from '../tasks.js';
import {SPECIES} from '../../data/species.js';

export const raiderBrain = {
  id: 'raider',
  step(w, a) {
    const T = w.grid.temp[cellOf(w, a)], sp = SPECIES.get(a.species);
    if (T > sp.heatHarm) a.hp -= Math.min(0.006, (T - sp.heatHarm) * 0.00005);
    if (a.hp <= 0) { a.dead = true; return; }
    if (T > 50 || nearFire(w, a, 1.5)) { escapeHeat(w, a); return; }
    if (a.hp < 0.3) a.task = {id: 'leave'};
    if (a.task?.id !== 'leave') {
      const e = nearestHostile(w, a, 10);
      if (e) { if (a.task?.id !== 'fight' || a.task.target !== e) a.task = {id: 'fight', target: e}; }
      else if (!a.task || a.task.id === 'fight') a.task = {id: a.looted ? 'leave' : 'assault'};
    }
    TASKS.get(a.task.id).step(w, a, a.task);
    if (!a.task) a.task = {id: a.looted ? 'leave' : 'assault'};
    if (a.cd > 0) a.cd--;
  },
};
