// Flow fields. Each entry seeds a Dijkstra distance map; agents walk downhill to the nearest seed.
// `active` skips the rebuild when nobody can need the map; `hazard` scales how much fire,
// heat and smoke cost (the escape map makes fire nearly impassable); `prepare` runs once per rebuild.
// Pacing (see nav/navigation.js): a dirty map waits at least `minGap` ticks between rebuilds,
// a clean one is refreshed every `period` ticks (fields that follow moving things need a short one).
import {Registry} from '../core/registry.js';
import {T} from './terrain.js';
import {has, openSites} from '../settlement/query.js';
import {nextToRock} from '../world/grid.js';
import {ambientTemp} from '../core/time.js';
import {SPECIES} from './species.js';
import {cellOf} from '../world/grid.js';
import {BUILDINGS} from './buildings.js';
import {inZone} from '../settlement/zone.js';
import {perTick} from '../core/util.js';
import {lakeBeside} from '../world/lakes.js';
import {oreBeside} from '../world/ores.js';
import {wantedOre} from '../settlement/query.js';
import {PLANTS, plantLayer} from './plants.js';
import {season} from './seasons.js';
import {fields, needsWork} from '../settlement/farming.js';

export const NAVMAPS = new Registry('navmap');

// Maps that only matter while someone walks them (a resource bed, a workshop, a field): `onDemand`
// maps are rebuilt only while a colonist's current task uses them. A stale map still points the
// right way; a worker who arrives at a spent bed marks the map dirty and it is rebuilt at once.
export const inUse = w => perTick(w, 'navInUse', () => {
  const s = new Set();
  for (const a of w.agents) {
    const t = a.task; if (!t) continue;
    if (t.id === 'job') { const j = JOBS_REF.get(t.job); if (j?.nav) s.add(j.nav); if (t.station) s.add('station:' + t.station); }
    else if (t.id === 'treat') s.add('healer');
    else if (t.id === 'warm') s.add('warm');
    else if (t.id === 'pray') s.add('station:shrine');
  }
  return s;
});
// set by data/jobs.js (jobs import navmaps indirectly, so the registry is handed over instead of imported)
let JOBS_REF = null;
export const useJobs = reg => { JOBS_REF = reg; };
const onDemand = id => w => inUse(w).has(id);

NAVMAPS.registerAll([
  {id: 'camp', seed: (w, i) => w.camp.set.has(i)},
  // where to get warm: the camp fire and every finished lived-in building (heated while the fire burns)
  {id: 'warm', prepare: w => new Set(w.buildings.filter(b => b.done && BUILDINGS.get(b.key).heat).flatMap(b => b.cells)),
    seed: (w, i, huts) => w.camp.set.has(i) || huts.has(i)},
  {id: 'edge', seed: (w, i) => { const x = i % w.w, y = (i / w.w) | 0; return x === 0 || y === 0 || x === w.w - 1 || y === w.h - 1; }},
  // bushes ripen almost every tick somewhere: the map follows them only while someone picks, and at most every 40 ticks
  {id: 'berries', minGap: 40, active: w => inUse(w).has('berries'), seed: (w, i) => w.grid.food[i] > 0.35 && w.grid.fire[i] === 0},
  {id: 'trees', minGap: 40, active: w => inUse(w).has('trees'), seed: (w, i) => w.grid.terr[i] === T.FOREST && w.grid.wood[i] > 0.3 && w.grid.fire[i] === 0},
  {id: 'rockface', active: w => has(w, 'quarry') && inUse(w).has('rockface'),
    seed: (w, i) => w.grid.fire[i] === 0 && w.grid.bld[i] < 0 && nextToRock(w, i)},
  {id: 'sites', minGap: 4, active: w => openSites(w).length > 0,
    prepare: w => new Set(openSites(w).flatMap(b => b.cells)),
    seed: (w, i, cells) => cells.has(i)},
  // the rock face where the ore the colony is short of can be dug
  {id: 'ore', period: 240, active: w => has(w, 'mineshaft') && inUse(w).has('ore'),
    prepare: w => wantedOre(w),
    seed: (w, i, codes) => codes.size > 0 && w.grid.fire[i] === 0 && w.grid.bld[i] < 0 && oreBeside(w, i, codes) >= 0},
  // shore of lakes that still have fish
  {id: 'shore', active: w => inUse(w).has('shore'),
    seed: (w, i) => w.grid.fire[i] === 0 && w.grid.bld[i] < 0 && !!lakeBeside(w, i)},
  // game animals: hunters and predators walk this field until they are close enough to go straight
  // only while a hunter is out or a hungry predator follows the scent (fed wolves roam without it)
  {id: 'prey', period: 20, minGap: 10, active: w => w.agents.some(a => a.task?.job === 'hunt' || (a.brain === 'predator' && a.needs.food < (SPECIES.get(a.species).predator?.hungry ?? 1))),
    prepare: w => new Set(w.agents.filter(a => SPECIES.get(a.species).game && !a.tame).map(a => cellOf(w, a))),
    seed: (w, i, cells) => cells.has(i)},
  // field plots that need sowing or reaping
  {id: 'fieldwork', period: 120, active: w => fields(w).length > 0 && inUse(w).has('fieldwork'),
    prepare: w => new Set(fields(w).flatMap(b => b.plots.filter(p => needsWork(w, p)).map(p => p.i))),
    seed: (w, i, cells) => cells.has(i)},
  // the settlement zone: where people run when something hunts them
  {id: 'zone', seed: (w, i) => inZone(w, i)},
  // only fires that threaten the camp are worth fighting
  {id: 'fire', period: 12, minGap: 4, active: w => w.stats.fireCount > 0,
    seed: (w, i) => w.grid.fire[i] > 0.05 && ((i % w.w) - w.camp.x) ** 2 + (((i / w.w) | 0) - w.camp.y) ** 2 < 400},
  // escape map: seeds are cells barely warmer than the air; fire is made almost impassable
  {id: 'safe', active: w => w.stats.fireCount > 0, hazard: 25, urgent: true,
    prepare: w => ambientTemp(w) + 14,
    seed: (w, i, lim) => w.grid.temp[i] < lim && w.grid.fire[i] === 0 && w.grid.smoke[i] < 0.6},
]);

// one map per wild plant (data/plants.js): its ripe beds
for (const p of PLANTS.all()) {
  const key = plantLayer(p.id);
  NAVMAPS.register({id: key, period: 300, active: w => (!p.seasons || p.seasons.includes(season(w).id)) && inUse(w).has(key),
    seed: (w, i) => w.grid[key]?.[i] >= p.ripe && w.grid.fire[i] === 0});
}

// the healer's hut: where the wounded lie and the healer works
NAVMAPS.register({id: 'healer', active: w => has(w, 'healerhut') && inUse(w).has('healer'),
  prepare: w => new Set(w.buildings.filter(x => x.key === 'healerhut' && x.done).flatMap(x => x.cells)),
  seed: (w, i, cells) => cells.has(i)});

// one map per crafting station (and per building people walk to for other reasons, `walkTo`): its finished building cells
for (const b of BUILDINGS.filter(d => d.station || d.walkTo)) {
  NAVMAPS.register({id: 'station:' + b.id, active: w => has(w, b.id) && inUse(w).has('station:' + b.id),
    prepare: w => new Set(w.buildings.filter(x => x.key === b.id && x.done).flatMap(x => x.cells)),
    seed: (w, i, cells) => cells.has(i)});
}
