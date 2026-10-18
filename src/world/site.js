// The site: what the generator is told about the land before it draws a single cell. It is a plain
// object — biome shares, how much water, rock and forest, the region — that the local map builds
// for itself today from the start menu and the rolled region, and that the world map will hand over
// instead when the two are sewn together (docs/SEAM.md). The generator (makeTerrain) reads only the
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
// The menu's three sliders (water, forest, rock) are read here and nowhere else: they scale what
// the region's biomes ask for, so «many lakes» on a steppe still makes a drier land than a valley.
import {SIZES, CLIMATES, START} from '../data/presets.js';
import {BIOMES} from '../data/biomes.js';
import {rollRegion} from './region.js';
import {clamp} from '../core/util.js';

// what the sliders mean: a base share for water and rock, a factor for forest
const WATER = [0.07, 0.12, 0.2], ROCK = [0.08, 0.13, 0.2], TREES = [0.75, 1, 1.25];
const MOUNTAIN = ['foothills', 'highlands', 'underground', 'volcano'];

export function makeSite(cfg) {
  const {w, h} = SIZES[cfg.size], region = rollRegion(cfg.seed);
  const biomes = {};
  for (const [id, v] of Object.entries(region.biomes)) if (BIOMES.has(id) && v > 0) biomes[id] = v;
  const share = id => biomes[id] || 0;
  const mountains = MOUNTAIN.reduce((s, id) => s + share(id), 0);
  // open water: the slider's base, more where the region has lakes; rock: more where it has mountains
  const water = clamp(WATER[cfg.water ?? 1] * (0.5 + 3.5 * share('water')), 0.02, 0.45);
  const rock = clamp(ROCK[cfg.rock ?? 1] * (0.4 + 2.2 * mountains), 0.03, 0.5);
  const climate = {id: cfg.climate, ...CLIMATES[cfg.climate]};
  return {seed: String(cfg.seed), w, h, region, biomes, water, rock, trees: TREES[cfg.forest ?? 1], fert: 1, climate, startDay: START[cfg.start]?.day ?? 0};
}

// the site's land biomes in the order the painter lays them out: driest first, open water last
export function paintOrder(site) {
  return Object.entries(site.biomes).map(([id, v]) => [BIOMES.get(id), v]).filter(([b]) => b.id !== 'water')
    .sort((a, b) => a[0].dry - b[0].dry || a[0].id.localeCompare(b[0].id));
}
