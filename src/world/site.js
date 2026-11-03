// The site: what the generator is told about the land before it draws a single cell. It is a plain
// object — biome shares, how much water, rock and forest, the region — that the local map builds
// for itself today from the start menu and the rolled region, and that the world map will hand over
// instead when the two are sewn together (docs/WORLD.md). The generator (makeTerrain) reads only the
// site, never the menu.
//
//   seed, w, h  — the map;  region — data/regions.js, rolled from the seed (world/region.js)
//   biomes      — shares of the land by biome, summing to 1 (data/biomes.js); the painter gives the
//                 driest cells to the driest biome, the wettest to the bogs and lakes
//   water       — share of all cells that is open water (lakes, pools)
//   rock        — share of all cells that is bare rock
//   trees       — × on every biome's forest cover (data/biomes.js `trees`)
//   fert        — × on fertility everywhere
//   climate     — {meanT, trange, rain, regrow, ign, label} (data/presets.js CLIMATES), copied so that the world map can hand its own
//   startDay    — calendar day the game begins on (data/presets.js START)
//   gates       — where the outside world enters: [{kind: 'road', side, at}] — side north/south/west/east,
//                 `at` 0..1 along that edge. A road gate gets a road to the camp; a group that comes by
//                 road (caravans, settlers) enters there. How many road gates, the region's `road` says:
//                 the imperial road runs through (two gates), passes by (one) or is far (none).
//                 A river has two gates too, {kind: 'river', role: 'source' | 'mouth', wide}: the generator
//                 runs it from the one to the other along the low ground, and a road crosses it by a ford
// The menu's three sliders (water, forest, rock) are read here and nowhere else: they scale what
// the region's biomes ask for, so «many lakes» on a steppe still makes a drier land than a valley.
import {LAND_BIOMES} from '../data/worldLand.js';
import {SIZES, CLIMATES, START} from '../data/presets.js';
import {BIOMES} from '../data/biomes.js';
import {rollRegion} from './region.js';
import {clamp} from '../core/util.js';
import {mulberry, seedNumber} from '../core/rng.js';

// what the sliders mean: a base share for water and rock, a factor for forest
const WATER = [0.07, 0.12, 0.2], ROCK = [0.08, 0.13, 0.2], TREES = [0.75, 1, 1.25];

// The polygon's site: the region rolled from the seed, gates rolled by its road and river, a preset
// climate. A game on a cell of the world map carries the cell's plan in its settings (`cfg.cell`,
// made by seam/cell.js: the region, climate, gates, fertility, neighbours and where in the world it
// is); the map's size and the season of landing still come from the menu, the sliders do not.
export function makeSite(cfg) {
  if (cfg.cell) return siteFromRegion({...cfg, water: 1, rock: 1, forest: 1}, cfg.cell.region, {...cfg.cell.extra, world: cfg.cell.ref});
  const region = rollRegion(cfg.seed);
  return siteFromRegion(cfg, region, {climate: {id: cfg.climate, ...CLIMATES[cfg.climate]}, gates: rollGates(cfg.seed, region)});
}

// a site from a region: water, rock and forest from its biomes (scaled by the polygon's sliders, if
// any); `extra` gives what the caller knows better — the climate, the gates, fertility, neighbours
export function siteFromRegion(cfg, region, extra = {}) {
  const {w, h} = cfg.dims || SIZES[cfg.size];   // a campaign's camp has its own small map (data/camp.js)
  const biomes = {};
  for (const [id, v] of Object.entries(region.biomes)) if (BIOMES.has(id) && v > 0) biomes[id] = v;
  const share = id => biomes[id] || 0;
  const mountains = LAND_BIOMES.mountain.reduce((s, id) => s + share(id), 0);
  // open water: the slider's base, more where the region has lakes; rock: more where it has mountains
  const water = clamp(WATER[cfg.water ?? 1] * (0.5 + 3.5 * share('water')), 0.02, 0.45);
  const rock = clamp(ROCK[cfg.rock ?? 1] * (0.4 + 2.2 * mountains), 0.03, 0.5);
  return {seed: String(cfg.seed), w, h, region, biomes, water, rock, trees: TREES[cfg.forest ?? 1], fert: 1, startDay: START[cfg.start]?.day ?? 0, gates: [], ...extra};
}

export const SIDES = ['north', 'east', 'south', 'west'];
export const SIDE_FROM = {north: 'севера', east: 'востока', south: 'юга', west: 'запада'};
// the road gates, on their own random stream so they do not move the rest of the map
export function rollGates(seed, region) {
  const rnd = mulberry(seedNumber(String(seed) + ':gates'));
  const roads = region.road >= 1.1 ? 2 : region.road >= 0.8 ? 1 : 0;
  const gates = [], first = (rnd() * 4) | 0;
  for (let k = 0; k < roads; k++) gates.push({kind: 'road', side: SIDES[(first + 2 * k) % 4], at: 0.2 + rnd() * 0.6});
  if (rnd() < (region.river || 0)) {
    // across the map (opposite sides) or round a corner (adjacent sides, both gates away from that corner,
    // or the river would hug the edge); `at` runs west→east on the north and south edges, north→south on the others
    const a = (rnd() * 4) | 0, across = rnd() < 0.7, b = (a + (across ? 2 : 1)) % 4, wide = (region.river || 0) >= 1;
    const far = [[0.1, 0.45], [0.55, 0.9]];   // the half of an edge away from the corner, by side pair
    const AWAY = {0: [0, 1], 1: [0, 0], 2: [1, 0], 3: [1, 1]}[a];   // N→E, E→S, S→W, W→N
    const at = k => (across ? 0.15 + rnd() * 0.7 : far[AWAY[k]][0] + rnd() * (far[AWAY[k]][1] - far[AWAY[k]][0]));
    gates.push({kind: 'river', role: 'source', side: SIDES[a], at: at(0), wide}, {kind: 'river', role: 'mouth', side: SIDES[b], at: at(1), wide});
  }
  return gates;
}

// the site's land biomes in the order the painter lays them out: driest first, open water last
export function paintOrder(site) {
  return Object.entries(site.biomes).map(([id, v]) => [BIOMES.get(id), v]).filter(([b]) => b.id !== 'water')
    .sort((a, b) => a[0].dry - b[0].dry || a[0].id.localeCompare(b[0].id));
}
