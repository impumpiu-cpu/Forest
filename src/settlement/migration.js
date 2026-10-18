// Spawns an arriving group at a reachable map edge. Who comes and when is decided by the
// border with the outside world (src/outside/); this file only puts them on the map.
import {MIGRATIONS} from '../data/migrations.js';
import {SPECIES} from '../data/species.js';
import {log} from '../core/log.js';
import {createAgent} from '../agents/agent.js';
import {walkable} from '../world/grid.js';
import {clamp} from '../core/util.js';
import {FAR} from '../nav/navigation.js';
import {dress} from '../agents/equipment.js';
import {think} from '../agents/mind.js';

import {SIDE_FROM} from '../world/site.js';

const SIDE = ['запада', 'востока', 'севера', 'юга'];

// an edge cell connected to the camp and at least minDist away from it
function edgeCell(w, minDist) {
  const dCamp = w.nav.get('camp');
  for (let k = 0; k < 300; k++) {
    const s = (w.rngs.outside() * 4) | 0, t = w.rngs.outside();
    const x = s === 0 ? 0 : s === 1 ? w.w - 1 : (t * w.w) | 0, y = s === 2 ? 0 : s === 3 ? w.h - 1 : (t * w.h) | 0;
    const i = y * w.w + x;
    if (walkable(w, i) && dCamp[i] < FAR && dCamp[i] > minDist) return [i, SIDE[s]];
  }
  return [-1, ''];
}

// a gate of the given kind that is joined to the camp (world/site.js gates), or null
export function gateCell(w, kind) {
  const dCamp = w.nav.get('camp'), open = (w.gates || []).filter(g => g.kind === kind && walkable(w, g.i) && dCamp[g.i] < FAR);
  if (!open.length) return null;
  const g = open[(w.rngs.outside() * open.length) | 0];
  return [g.i, SIDE_FROM[g.side]];
}

export function spawnGroup(w, id, n, opts = {}) {
  const def = MIGRATIONS.get(id);
  if (!n) return [];
  // most groups walk in from a map edge; some come by road through its gate (`gate`), some appear at
  // their own ground (`spawnAt`, the nechist)
  const home = def.spawnAt ? def.spawnAt(w) : -1;
  const [e, side] = home >= 0 ? [home, ''] : (def.gate && gateCell(w, def.gate)) || edgeCell(w, def.minDist ?? 30);
  if (e < 0) { if (id === 'raiders') log(w, 'Налётчики не нашли дороги к лагерю.', 'danger', 'notice'); return []; }
  const ex = e % w.w, ey = (e / w.w) | 0, group = [];
  // a mixed group (a caravan) lists its members; otherwise n of the one species
  const plan = def.members ? def.members(w, w.rngs.outside, n, opts) : Array.from({length: n}, () => ({}));
  for (const m of plan) {
    let x = clamp(ex + 0.5 + w.rngs.outside() * 3 - 1.5, 0.2, w.w - 0.2), y = clamp(ey + 0.5 + w.rngs.outside() * 3 - 1.5, 0.2, w.h - 0.2);
    if (!walkable(w, (y | 0) * w.w + (x | 0))) { x = ex + 0.5; y = ey + 0.5; }
    const a = createAgent(w, m.species || def.species, m.faction || def.faction, x, y);
    if (def.init) def.init(a, w);
    if (m.init) m.init(a, w);
    if (def.kit && a.equip) dress(a, def.kit(w.rngs.outside, w), def.ammo || 0);
    if (m.kit?.length && a.equip) dress(a, m.kit, def.ammo || 0);
    group.push(a);
  }
  if (def.groupInit) def.groupInit(group, w);
  // once the colony has seen what fears silver, it wants silver blades (recipes, trade, gear)
  if (group.some(a => SPECIES.get(a.species).weakTo?.includes('silver'))) w.chronicle.silverFoes = (w.chronicle.silverFoes || 0) + 1;
  for (const a of group) think(w, a, 'arrived');
  const msg = def.message?.(w, group, side);
  if (msg) log(w, msg, def.topic || 'people', def.level);
  return group;
}
