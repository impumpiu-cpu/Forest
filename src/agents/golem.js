// The golems on the local map (data/constructs.js): made on the colony's side (the golem forge of a dwarven colony, a
// golem a caravan brought), they think by the brain `golem` (agents/behaviours/golem.js) and are mended only at a forge.
import {GOLEM_REPAIR, golemOf} from '../data/constructs.js';
import {SPECIES} from '../data/species.js';
import {createAgent, maxHp} from './agent.js';
import {perTick} from '../core/util.js';

// the forges of the map, once a tick: [{x, y}] of their middles
const forges = w => perTick(w, 'golemForges', () => (w.buildings || []).filter(b => b.done && GOLEM_REPAIR.at.includes(b.key)).map(b => ({x: b.x + b.w / 2, y: b.y + b.h / 2})));
// a mechanism by a forge mends a little each tick (tag «Механизм»: there is no other way)
export function mendAtForge(w, a) {
  if (a.dead || !(a.hp < maxHp(a)) || !SPECIES.get(a.species).mechanism) return;
  const R = GOLEM_REPAIR;
  if (forges(w).some(f => Math.hypot(f.x - a.x, f.y - a.y) <= R.reach)) a.hp = Math.min(maxHp(a), a.hp + R.rate * maxHp(a));
}
// a golem of a metal on the colony's side, standing at its post
export function makeGolem(w, metal, x, y, post = {x, y}) {
  const g = createAgent(w, golemOf(metal), 'allies', x, y);
  g.brain = 'golem'; g.post = {...post}; g.task = null;
  return g;
}
