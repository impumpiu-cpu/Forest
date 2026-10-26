// Retreat: a raider leaves the map when its band is gone from under it — the dead whose necromancer fell stagger off,
// a war beast (a warg, a hyena) goes home once no rider or handler of its band is left — when the sun is up for the
// sun-shy, or when badly hurt (the mindless never leave hurt); once going, it goes. The shared `leave` task.
// Reads: nothing of its own (a.master, a.warBeast, a.band; a trained beast's mark, data/conditions.js stay).
import {maxHp} from '../agent.js';
import {liveById} from '../lookup.js';
import {holdsGround} from '../auras.js';
import {RAID} from '../../data/behaviour.js';
import {marksOf} from '../../data/conditions.js';

// how long a beast fights on once nobody of its band is left to follow (a trained one: its mark's `stay`)
const stayOf = a => Math.max(0, ...marksOf(a).map(r => r.stay || 0));

export const retreat = {
  always(w, a) {
    // its master fell: the one above it, if it stands (a wight's link to the necromancer), else it loses its way
    if (a.master != null && !liveById(w, a.master)) {
      const up = a.masterUp != null ? liveById(w, a.masterUp) : null;
      a.masterUp = null;
      if (up && !up.gone) a.master = up.id; else { a.master = null; a.lost = true; }
    }
    if (a.warBeast && !a.lost && !w.agents.some(o => o.band === a.band && !o.warBeast && !o.dead && !o.gone && o.task?.id !== 'leave')) {   // scan: war beasts only, a few per band
      a.orphanAt ??= w.tick;
      if (w.tick - a.orphanAt >= stayOf(a)) a.lost = true;   // a trained one fights on a while
    }
  },
  want(w, a, {sp, night}) {
    if (a.task?.id === 'leave') return [[a.task, RAID.want.leave, () => 'уходит']];
    if (a.lost) return [[{id: 'leave'}, RAID.want.leave, () => 'некому вести']];
    if (sp.sun && 1 - night > RAID.sunLeaves) return [[{id: 'leave'}, RAID.want.leave, () => 'солнце встало']];
    if (!sp.mindless && a.hp < RAID.hurtBelow * maxHp(a) && !holdsGround(w, a)) return [[{id: 'leave'}, RAID.want.leave, () => 'тяжело ранен']];   // (a boss's aura: agents/auras.js)
    return null;
  },
};
