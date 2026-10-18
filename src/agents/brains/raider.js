// Raider brain: march on the camp, fight whoever stands in the way, grab loot, leave. A band that came
// with a plan (agents/squad.js) follows it: its goal, each member's role, retreat when morale breaks.
// Monsters bend it a little (data/monsters.js):
//   mindless — the dead (and war beasts: wargs, hyenas) do not loot: they go for the nearest living soul;
//   rots / sun — the rot loses its hold in warmth and daylight; upyrs and vampires leave at dawn;
//   master — the dead follow their necromancer; once he falls they stagger off.
import {cellOf} from '../../world/grid.js';
import {escapeHeat, nearFire} from '../movement.js';
import {nearestHostile} from '../combat.js';
import {TASKS} from '../tasks.js';
import {SPECIES} from '../../data/species.js';
import {nightness} from '../../core/time.js';
import {maxHp, kill} from '../agent.js';
import {squadOf, planFor} from '../squad.js';
import {tempAt} from '../../world/heat.js';

// the mindless dead go for whoever is this close; anyone further off they find by shambling to the camp
// (the camp flow field always leads there; a long A* chase across the map would stall instead)
const HUNT_RADIUS = 16;

export const raiderBrain = {
  id: 'raider',
  step(w, a) {
    const T = tempAt(w, cellOf(w, a)), sp = SPECIES.get(a.species), mindless = sp.mindless || a.warBeast;   // goes for people, never for the stores
    // the dead burn twice as easily as the living
    let cause = null;
    if (T > sp.heatHarm) { a.hp -= Math.min(sp.undead ? 0.012 : 0.006, (T - sp.heatHarm) * (sp.undead ? 0.0001 : 0.00005)); cause = 'огня'; }
    if (sp.rots && T > 12) { a.hp -= sp.rots * (T - 12); cause ??= 'тепла'; }
    const day = 1 - nightness(w.tick);
    if (sp.sun && day > 0.5) { a.hp -= sp.sun * day; cause ??= 'солнца'; }
    if (a.hp <= 0) { kill(w, a, cause || 'ран'); return; }   // one way to die: the common kill (agents/agent.js)
    // orcs and trolls close their wounds even on a raid; fire close by stops a troll's
    if (a.mods.regen > 1 && T < 30 && a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + 0.0003 * maxHp(a) * (a.mods.regen - 1));
    if (!sp.mindless && (T > 50 || nearFire(w, a, 1.5))) { escapeHeat(w, a); return; }
    const lost = a.master != null && !w.agents.some(o => o.id === a.master && !o.dead);
    if (lost) a.master = null, a.lost = true;
    // a war beast goes home with its masters: once no rider or handler of its band is left, it leaves
    if (a.warBeast && !w.agents.some(o => o.band === a.band && !o.warBeast && !o.dead && !o.gone && o.task?.id !== 'leave')) a.lost = true;
    if (a.lost || (sp.sun && day > 0.6)) a.task = {id: 'leave'};
    else if (!sp.mindless && a.hp < 0.3 * maxHp(a)) a.task = {id: 'leave'};
    if (a.task?.id !== 'leave') {
      const radius = sp.mindless ? HUNT_RADIUS : mindless ? 16 : 10;
      // a band with a plan (agents/squad.js): the plan says what to do; without one (or when it has
      // nothing to say) the old way: the nearest foe, else the stores or the camp
      const sq = squadOf(w, a), plan = sq ? planFor(w, a, sq, radius) : null;
      if (plan) a.task = plan;
      else {
        const e = nearestHostile(w, a, radius);
        if (e) { if (a.task?.id !== 'fight' || a.task.target !== e) a.task = {id: 'fight', target: e, since: w.tick}; }
        else if (!a.task || a.task.id === 'fight') a.task = {id: a.looted ? 'leave' : mindless ? 'haunt' : 'assault'};
      }
    }
    TASKS.get(a.task.id).step(w, a, a.task);
    if (!a.task) a.task = {id: a.looted ? 'leave' : mindless ? 'haunt' : 'assault'};
    if (a.cd > 0) a.cd--;
  },
};
