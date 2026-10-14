// Raider brain: march on the camp, fight whoever stands in the way, grab loot, leave.
// Monsters bend it a little (data/monsters.js):
//   mindless — the dead do not loot or fear fire: they go for the nearest living soul and keep at it;
//   rots / sun — the rot loses its hold in warmth and daylight; upyrs and vampires leave at dawn;
//   master — the dead follow their necromancer; once he falls they stagger off.
import {cellOf} from '../../world/grid.js';
import {escapeHeat, nearFire} from '../movement.js';
import {nearestHostile} from '../combat.js';
import {TASKS} from '../tasks.js';
import {SPECIES} from '../../data/species.js';
import {nightness} from '../../core/time.js';
import {maxHp} from '../agent.js';

const HUNT_RADIUS = 60;

export const raiderBrain = {
  id: 'raider',
  step(w, a) {
    const T = w.grid.temp[cellOf(w, a)], sp = SPECIES.get(a.species);
    // the dead burn twice as easily as the living
    if (T > sp.heatHarm) a.hp -= Math.min(sp.undead ? 0.012 : 0.006, (T - sp.heatHarm) * (sp.undead ? 0.0001 : 0.00005));
    if (sp.rots && T > 12) a.hp -= sp.rots * (T - 12);
    const day = 1 - nightness(w.tick);
    if (sp.sun && day > 0.5) a.hp -= sp.sun * day;
    if (a.hp <= 0) { a.dead = true; return; }
    // orcs and trolls close their wounds even on a raid; fire close by stops a troll's
    if (a.mods.regen > 1 && T < 30 && a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + 0.0003 * maxHp(a) * (a.mods.regen - 1));
    if (!sp.mindless && (T > 50 || nearFire(w, a, 1.5))) { escapeHeat(w, a); return; }
    const lost = a.master != null && !w.agents.some(o => o.id === a.master && !o.dead);
    if (lost) a.master = null, a.lost = true;
    if (a.lost || (sp.sun && day > 0.6)) a.task = {id: 'leave'};
    else if (!sp.mindless && a.hp < 0.3 * maxHp(a)) a.task = {id: 'leave'};
    if (a.task?.id !== 'leave') {
      const e = nearestHostile(w, a, sp.mindless ? HUNT_RADIUS : 10);
      if (e) { if (a.task?.id !== 'fight' || a.task.target !== e) a.task = {id: 'fight', target: e}; }
      else if (!a.task || a.task.id === 'fight') a.task = {id: a.looted ? 'leave' : sp.mindless ? 'haunt' : 'assault'};
    }
    TASKS.get(a.task.id).step(w, a, a.task);
    if (!a.task) a.task = {id: a.looted ? 'leave' : sp.mindless ? 'haunt' : 'assault'};
    if (a.cd > 0) a.cd--;
  },
};
