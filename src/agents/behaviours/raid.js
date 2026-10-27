// Raid: march on the camp, fight whoever stands in the way, grab loot, leave. A band that came with a plan
// (agents/squad.js) follows it: its goal, each member's role, retreat when morale breaks. Without a plan (or when it
// has nothing to say): the nearest foe, else the stores — the mindless dead and the war beasts never loot, they go
// for the nearest living soul and wander the camp (`haunt`) waiting for one. The tasks are the shared ones of
// agents/tasks.js: fight, assault, haunt, torch, scout, leave. Reads: nothing of its own.
import {nearestHostile} from '../combat.js';
import {squadOf, planFor} from '../squad.js';
import {RAID} from '../../data/behaviour.js';
import {isMindless} from '../../data/species.js';

export const raid = {
  want(w, a, {sp}) {
    const mindless = isMindless(sp) || a.warBeast, W = RAID.want;
    const radius = isMindless(sp) ? RAID.hunt : mindless ? RAID.hunt : RAID.near;
    const sq = squadOf(w, a), plan = sq ? planFor(w, a, sq, radius) : null;
    if (plan) return [[plan, W.plan, () => `план отряда: ${plan.id}`]];
    const e = nearestHostile(w, a, radius);
    if (e) return [[a.task?.id === 'fight' && a.task.target === e ? a.task : {id: 'fight', target: e, since: w.tick}, W.fight, () => `враг рядом: ${e.name}`]];
    const id = a.looted ? 'leave' : mindless ? 'haunt' : 'assault';
    return [[a.task?.id === id ? a.task : {id}, W.go, () => (a.looted ? 'с добычей домой' : mindless ? 'бредёт к лагерю' : 'к складу')]];
  },
};
