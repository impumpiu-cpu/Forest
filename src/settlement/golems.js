// The golems of a dwarven colony (data/constructs.js GOLEM_LOCAL): its golem forge makes one at the start of each season,
// of the best metal in the stock, while the colony has fewer than its share; it stands guard by the forge
// (agents/behaviours/golem.js) and is mended there.
import {GOLEM_LOCAL} from '../data/constructs.js';
import {SPECIES} from '../data/species.js';
import {seasonStarts} from '../data/seasons.js';
import {DAY, HOUR} from '../core/time.js';
import {makeGolem} from '../agents/golem.js';
import {colonists} from './query.js';
import {log} from '../core/log.js';

const golems = w => w.agents.filter(a => !a.dead && a.faction === 'allies' && SPECIES.get(a.species).mechanism);

// → the golem made, or null
export function forgeGolem(w) {
  const b = w.buildings.find(x => x.key === 'golemforge' && x.done); if (!b) return null;
  const G = GOLEM_LOCAL, people = colonists(w).filter(a => !a.dead && !a.captive).length;
  if (golems(w).length >= 1 + Math.floor(people / G.per)) return null;
  const metal = G.metals.find(m => (w.stock[m] || 0) >= G.cost); if (!metal || (w.stock.coal || 0) < G.coal) return null;
  w.stock[metal] -= G.cost; w.stock.coal -= G.coal;
  const x = b.x + b.w / 2, y = b.y + b.h + 1, g = makeGolem(w, metal, x, y);
  g.name = SPECIES.get(g.species).label.replace(/^./, c => c.toUpperCase());
  log(w, `Кузня големов выпустила ${SPECIES.get(g.species).labelAcc}: он встал на стражу у горна.`, 'build', 'notice');
  return g;
}
export function stepColonyGolems(w) {
  if (w.tick % DAY !== 7 * HOUR || !seasonStarts(w, w.tick)) return;
  forgeGolem(w);
}
