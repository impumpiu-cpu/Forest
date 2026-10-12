// Spawns an arriving group at a reachable map edge. Who comes and when is decided by the
// border with the outside world (src/outside/); this file only puts them on the map.
import {MIGRATIONS} from '../data/migrations.js';
import {log} from '../core/log.js';
import {createAgent} from '../agents/agent.js';
import {walkable} from '../world/grid.js';
import {clamp} from '../core/util.js';
import {FAR} from '../nav/navigation.js';
import {dress} from '../agents/equipment.js';
import {think} from '../agents/mind.js';

const SIDE = ['запада', 'востока', 'севера', 'юга'];

// an edge cell connected to the camp and at least minDist away from it
function edgeCell(w, minDist) {
  const dCamp = w.nav.get('camp');
  for (let k = 0; k < 300; k++) {
    const s = (w.rng() * 4) | 0, t = w.rng();
    const x = s === 0 ? 0 : s === 1 ? w.w - 1 : (t * w.w) | 0, y = s === 2 ? 0 : s === 3 ? w.h - 1 : (t * w.h) | 0;
    const i = y * w.w + x;
    if (walkable(w, i) && dCamp[i] < FAR && dCamp[i] > minDist) return [i, SIDE[s]];
  }
  return [-1, ''];
}

export function spawnGroup(w, id, n) {
  const def = MIGRATIONS.get(id);
  if (!n) return [];
  const [e, side] = edgeCell(w, def.minDist ?? 30);
  if (e < 0) { if (id === 'raiders') log(w, 'Налётчики не нашли дороги к лагерю.', 'danger', 'notice'); return []; }
  const ex = e % w.w, ey = (e / w.w) | 0, group = [];
  for (let k = 0; k < n; k++) {
    let x = clamp(ex + 0.5 + w.rng() * 3 - 1.5, 0.2, w.w - 0.2), y = clamp(ey + 0.5 + w.rng() * 3 - 1.5, 0.2, w.h - 0.2);
    if (!walkable(w, (y | 0) * w.w + (x | 0))) { x = ex + 0.5; y = ey + 0.5; }
    const a = createAgent(w, def.species, def.faction, x, y);
    if (def.init) def.init(a, w);
    if (def.kit && a.equip) dress(a, def.kit(w.rng, w), def.ammo || 0);
    group.push(a);
  }
  if (def.groupInit) def.groupInit(group, w);
  for (const a of group) think(w, a, 'arrived');
  const msg = def.message?.(w, group, side);
  if (msg) log(w, msg, def.topic || 'people', def.level);
  return group;
}
