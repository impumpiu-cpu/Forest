// Retreat: a raider leaves the map when its band is gone from under it — the dead whose necromancer fell stagger off,
// a war beast (a warg, a hyena) goes home once no rider or handler of its band is left — when the sun is up for the
// sun-shy, or when badly hurt (the mindless never leave hurt); once going, it goes. The shared `leave` task.
// Reads: nothing of its own (a.master, a.warBeast, a.band).
import {nightness} from '../../core/time.js';
import {maxHp} from '../agent.js';
import {liveById} from '../lookup.js';
import {holdsGround} from '../auras.js';
import {RAID} from '../../data/behaviour.js';

export const retreat = {
  always(w, a) {
    if (a.master != null && !liveById(w, a.master)) { a.master = null; a.lost = true; }
    if (a.warBeast && !a.lost && !w.agents.some(o => o.band === a.band && !o.warBeast && !o.dead && !o.gone && o.task?.id !== 'leave')) a.lost = true;   // scan: war beasts only, a few per band
  },
  want(w, a, {sp, night}) {
    if (a.task?.id === 'leave') return [[a.task, RAID.want.leave, () => 'уходит']];
    if (a.lost) return [[{id: 'leave'}, RAID.want.leave, () => 'некому вести']];
    if (sp.sun && 1 - night > RAID.sunLeaves) return [[{id: 'leave'}, RAID.want.leave, () => 'солнце встало']];
    if (!sp.mindless && a.hp < RAID.hurtBelow * maxHp(a) && !holdsGround(w, a)) return [[{id: 'leave'}, RAID.want.leave, () => 'тяжело ранен']];   // (a boss's aura: agents/auras.js)
    return null;
  },
};
