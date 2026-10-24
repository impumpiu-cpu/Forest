// The local map's nature tuning moved out of the logic (docs/SETTLEMENT.md): fire, snow, fishing.
// The logic files import these; the tables (data/schema/index.js) show and edit them.

// Fire model knobs. Wet ground (high fertility) is harder to ignite and puts fires out by itself.
export const FIRE = {cap: 320, heat: 46, pF: 0.011, pG: 0.005, burn: 0.03, wetIgn: 80, outBase: 0.002, outWet: 0.012, ignForest: 80, ignGrass: 120};

// Snow cover, 0 (bare) … 1 (deep): it builds while the days are freezing (faster when it snows) and
// melts when they are not. One depth for the whole map: what matters is that it lies, and how deep
export const SNOW = {fall: 0.0004, storm: 0.0016, melt: 0.0012, slow: 0.35, cost: 0.6};

export const FISHING = {
  minCells: 40,        // smaller ponds have no fish worth catching
  perCell: 0.3,        // fish a lake can hold per cell of water…
  maxStock: 90,        // …up to this many
  growth: 0.25,        // logistic growth per day: fastest when the lake is half full, none when full
  trickle: 0.008,      // share of capacity that swims in per day even into an emptied lake
  reopenAt: 0.5,       // a fished-out lake is left alone until it is this full again
};

// How the local map grows back (world/fields.js). Garden bushes ripen `garden` a tick × the season × (`gardenSoil[0]`
// + `gardenSoil[1]` × fertility); ripe from `ripe`. The well cools the camp within `coolRadius` cells to `coolTo`
// degrees above the air, taking `coolRate` of the excess a tick. Wild ground: `samples` cells a tick per `samplesPer`
// cells of map (× the climate's regrow); a burnt cell turns back with `burnt` (fuel `burntFuel`); fuel creeps back
// `fuel`; a bush ripens `bush` × fertility × the season, withers × `wither` the season's; a new bush springs up with
// `newBush` × fertility × the ground's bushes (food `newBushFood`, fuel `newBushFuel`); a wood seeds with `newWood`
// × fertility × the ground's woods where fertility is above `woodFert` (wood `newWoodWood`, fuel `newWoodFuel`); a
// forest thickens `forest` a tick (fuel `forestFuel` + its wood).
export const GROWTH = {
  garden: 0.0035, gardenSoil: [0.4, 1.2], ripe: 0.35, ripeTo: 0.354, coolRadius: 6, coolTo: 40, coolRate: 0.08,
  samples: 160, samplesPer: 12288, burnt: 0.02, burntFuel: 0.1, fuel: 0.02, bush: 0.05, wither: 4,
  newBush: 0.0025, newBushFood: 0.1, newBushFuel: 0.2, newWood: 0.0015, woodFert: 0.55, newWoodWood: 0.3, newWoodFuel: 1.5,
  forest: 0.03, forestFuel: 1.2,
};
