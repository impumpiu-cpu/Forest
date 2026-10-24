// The local map's nature tuning moved out of the logic (docs/TABLE.md, «Ревизия»): fire, snow, fishing.
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
