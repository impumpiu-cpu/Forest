// Flow fields. Each entry seeds a Dijkstra distance map; agents walk downhill to the nearest seed.
// `active` skips the rebuild when nobody can need the map; `hazard` scales how much fire,
// heat and smoke cost (the escape map makes fire nearly impassable); `prepare` runs once per rebuild.
import {Registry} from '../core/registry.js';
import {T} from './terrain.js';
import {has, openSites} from '../settlement/query.js';
import {nextToRock} from '../world/grid.js';
import {ambientTemp} from '../core/time.js';
import {SPECIES} from './species.js';
import {cellOf} from '../world/grid.js';
import {BUILDINGS} from './buildings.js';
import {inZone} from '../settlement/zone.js';
import {lakeBeside} from '../world/lakes.js';

export const NAVMAPS = new Registry('navmap');

NAVMAPS.registerAll([
  {id: 'camp', seed: (w, i) => w.camp.set.has(i)},
  {id: 'edge', seed: (w, i) => { const x = i % w.w, y = (i / w.w) | 0; return x === 0 || y === 0 || x === w.w - 1 || y === w.h - 1; }},
  {id: 'berries', seed: (w, i) => w.grid.food[i] > 0.35 && w.grid.fire[i] === 0},
  {id: 'trees', seed: (w, i) => w.grid.terr[i] === T.FOREST && w.grid.wood[i] > 0.3 && w.grid.fire[i] === 0},
  {id: 'rockface', active: w => has(w, 'quarry'),
    seed: (w, i) => w.grid.fire[i] === 0 && w.grid.bld[i] < 0 && nextToRock(w, i)},
  {id: 'sites', active: w => openSites(w).length > 0,
    prepare: w => new Set(openSites(w).flatMap(b => b.cells)),
    seed: (w, i, cells) => cells.has(i)},
  // shore of lakes that still have fish
  {id: 'shore', active: w => has(w, 'fishhut'),
    seed: (w, i) => w.grid.fire[i] === 0 && w.grid.bld[i] < 0 && !!lakeBeside(w, i)},
  // game animals: hunters and predators walk this field until they are close enough to go straight
  {id: 'prey', active: w => w.agents.some(a => a.task?.job === 'hunt' || a.brain === 'predator'),
    prepare: w => new Set(w.agents.filter(a => SPECIES.get(a.species).game).map(a => cellOf(w, a))),
    seed: (w, i, cells) => cells.has(i)},
  // the settlement zone: where people run when something hunts them
  {id: 'zone', seed: (w, i) => inZone(w, i)},
  // only fires that threaten the camp are worth fighting
  {id: 'fire', active: w => w.stats.fireCount > 0,
    seed: (w, i) => w.grid.fire[i] > 0.05 && ((i % w.w) - w.camp.x) ** 2 + (((i / w.w) | 0) - w.camp.y) ** 2 < 400},
  // escape map: seeds are cells barely warmer than the air; fire is made almost impassable
  {id: 'safe', active: w => w.stats.fireCount > 0, hazard: 25, urgent: true,
    prepare: w => ambientTemp(w) + 14,
    seed: (w, i, lim) => w.grid.temp[i] < lim && w.grid.fire[i] === 0 && w.grid.smoke[i] < 0.6},
]);

// one map per crafting station: its finished building cells
for (const b of BUILDINGS.filter(d => d.station)) {
  NAVMAPS.register({id: 'station:' + b.id, active: w => has(w, b.id),
    prepare: w => new Set(w.buildings.filter(x => x.key === b.id && x.done).flatMap(x => x.cells)),
    seed: (w, i, cells) => cells.has(i)});
}
