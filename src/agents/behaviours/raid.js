// Raid: march on the camp, fight whoever stands in the way, grab loot, leave. A band that came with a plan
// (agents/squad.js) follows it: its goal, each member's role, retreat when morale breaks. Without a plan (or when it
// has nothing to say): the nearest foe, else the stores — the mindless dead and the war beasts never loot, they go
// for the nearest living soul and wander the camp (`haunt`) waiting for one. The tasks are the shared ones of
// agents/tasks.js fight and agents/tasks/raid.js: assault, haunt, torch, scout, leave. Reads: nothing of its own.
import {nearestHostile} from '../combat.js';
import {squadOf, planFor} from '../squad.js';
import {RAID, TORCH} from '../../data/behaviour.js';
import {isMindless} from '../../data/species.js';
import {BUILDINGS} from '../../data/buildings.js';
import {throwTorch} from '../equipment.js';
import {distToCell} from '../../world/grid.js';

// a cell of a wooden building within `r` of the raider, the nearest (the buildings, not the creatures, are walked)
function woodenWithin(w, a, r) {
  let best = null, bd = r;
  for (const b of w.buildings) {
    if (!b.done || !BUILDINGS.get(b.key).wooden || b.plots) continue;   // (a field is no wall)
    for (const c of b.cells) { const d = distToCell(w, a, c); if (d <= bd) { bd = d; best = c; } }
  }
  return best;
}

export const raid = {
  want(w, a, {sp}) {
    const mindless = isMindless(sp) || a.warBeast, W = RAID.want;
    const radius = isMindless(sp) ? RAID.hunt : mindless ? RAID.hunt : RAID.near;
    // a torch in hand: now and then it flies at a wooden building close by, while no foe is near (data/behaviour.js TORCH)
    const T = !mindless && a.task?.id !== 'hurlTorch' ? throwTorch(a) : null;
    if (T && w.rngs.outside() < TORCH.casual && !nearestHostile(w, a, TORCH.clear)) {
      const cell = woodenWithin(w, a, T.range);
      if (cell != null) return [[{id: 'hurlTorch', cell}, W.plan, () => 'факел — в деревянную постройку']];
    }
    const sq = squadOf(w, a), plan = sq ? planFor(w, a, sq, radius) : null;
    if (plan) return [[plan, W.plan, () => `план отряда: ${plan.id}`]];
    const e = nearestHostile(w, a, radius);
    if (e) return [[a.task?.id === 'fight' && a.task.target === e ? a.task : {id: 'fight', target: e, since: w.tick}, W.fight, () => `враг рядом: ${e.name}`]];
    if (sq?.goal === 'hold') return null;   // (a guard of its own home: no stores of the caravan's for it — agents/squad.js holdPlan)
    const id = a.looted ? 'leave' : mindless ? 'haunt' : 'assault';
    return [[a.task?.id === id ? a.task : {id}, W.go, () => (a.looted ? 'с добычей домой' : mindless ? 'бредёт к лагерю' : 'к складу')]];
  },
};
