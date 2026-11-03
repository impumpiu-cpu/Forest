// What the systems of the world map ask of the land by its kinds — the biomes, rocks and ores that count as this or
// that — and of the town buildings by their roles. The systems (atlas/towns.js placeHas, atlas/lairs.js groundKind,
// atlas/fauna.js, atlas/biomes.js, atlas/realms.js, atlas/peoples.js, …) look these up and hold no lists of their own:
// a new biome that is grazing land, a new rock with caves, a new ore that names a realm — one line here.

// biomes by what they are to the peoples and the lairs
export const LAND_BIOMES = {
  // the open land a nomad people's herds and hunts use (the greenskins' pasture: data/peoples.js placeNeed)
  grazing: ['meadow', 'steppe', 'savanna', 'tundra', 'shrubland', 'desert', 'foothills', 'highlands'],
  pasture: ['meadow', 'steppe', 'savanna'],   // a town's pasture
  dry: ['steppe', 'desert', 'savanna'],       // dry country
  deep: ['forest', 'jungle', 'swamp', 'taiga'],   // the deep wood a lair hides in (with trees over LAIR_GROUND.deepTrees)
  open: ['tundra', 'taiga', 'steppe', 'meadow'],  // open country of the beasts that need it
  barrowLand: ['steppe', 'meadow', 'tundra', 'shrubland', 'savanna', 'foothills'],   // where the barrows older than the chronicle lie
  barren: ['water', 'ice'],   // no town stands on it, no alluvium lies on it
  mountain: ['foothills', 'highlands', 'underground', 'volcano'],   // the local map's mountain biomes (world/site.js, world/generate.js)
};
// the ground a lair kind asks for (data/lairs.js `ground`): heights — the land's relative height and flatness; a
// volcano — the field of live volcanoes; deep — the trees; a rift — a volcano or a plate seam that high
export const LAIR_GROUND = {heights: {rel: 0.35, flat: 0.6}, volcano: 0.4, deepTrees: 0.5, rift: {volc: 0.6, rel: 0.3}, barrows: 0.25, ruins: 3};

// rocks by what they hold: caves (the share of underground they add to a cell's biomes: limestone karst, basalt lava
// tubes) and clay
export const ROCK_CAVES = {limestone: 0.15, basalt: 0.08};
export const ROCK_CLAY = ['shale', 'limestone'];

// ores by what they are: a town's «ore» (iron, copper, silver — enough for a mine), the precious (its gold, silver and
// gold sand), the wealth a people of the rock settles by, the ores that name a realm (data/peoples.js EPITHETS.ores, in
// this order) and a local map's region ores that never shift into being (world/region.js)
export const ORE_KINDS = {
  ore: ['iron', 'bronze', 'silver'],
  precious: ['gold', 'silver', 'placer'],
  wealth: ['iron', 'bronze', 'silver', 'gold', 'gems'],
  epithets: ['gold', 'silver', 'gems', 'bronze', 'iron', 'coal'],
  rare: ['mithril'],
  mineFallback: 'iron',   // what a mine digs on a cell rich in none of its ores (atlas/economy.js digOf)
};

// town buildings by their role in the world's systems (data/townBuildings.js ids)
export const TOWN_ROLES = {
  harbor: ['harbor'],                  // a harbour: ships sail from it (atlas/sea.js), a schism counts it as distance (atlas/realms.js)
  seaReach: ['lighthouse'],            // sends ships further: × data/roads.js SEA.lighthouse (atlas/sea.js)
  crossing: {bridge: 1, ferry: 0.5},   // the ford it takes out of the roads' cost (atlas/peoples.js markCrossing)
  crowns: ['throne'],                  // the building that makes a town the realm's seat (the chronicle's line)
  coinRoutes: ['mint', 'tradepost'],   // a trade route of a town with one counts twice (atlas/diplomacy.js)
  rotWard: {magetower: 'wardMage', fallentemple: 'wardTemple'},   // the wards against the rot (data/lairs.js ROT)
  deadWard: ['magetower'],             // stands the stronger against the dead (ROT.wardMight)
  golemForge: 'golemforge',            // makes golems (atlas/golems.js)
  pits: 'fightpits',                   // breaks war beasts (atlas/beasts.js)
};

