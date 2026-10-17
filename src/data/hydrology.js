// Water on the world map: erosion, rivers and lakes. The systems are in src/atlas/hydrology.js.
//
// Erosion runs in epochs. Each epoch: fill the hollows and find where water flows (Priority-Flood),
// add up the water from upstream, cut the ground by the stream power law, let slopes creep, and
// give the ranges back a little of their tectonic uplift so they do not wear flat.
//   epochs:   how many rounds
//   k:        stream power: how hard a river of a given size cuts (implicit solver, so any value is stable)
//   m:        exponent on the upstream water (0.5 as in the stream power law)
//   creep:    slope creep (hillslope diffusion) per epoch, and its passes
//   uplift:   share of the tectonic uplift returned each epoch
//   lakeEps:  water deeper than this over the ground (elevation units) makes a lake cell
export const EROSION = {epochs: 4, k: 0.35, m: 0.5, creep: 0.12, creepPasses: 2, uplift: 0.08, lakeEps: 0.006};

// Rivers and lakes.
//   flow is the water a cell gathers from upstream: Σ yearly rain (mm) over the cells that drain
//   through it, divided by `unit` — so 1 is one cell's worth of an ordinary 500 mm rain
//   stream / river / great: flow (in units, scaled to a 192-cell-high world by area) to be drawn as
//   a brook, a river, a great river
//   evap:     mm a year a lake loses to the air at 0 °C, growing with warmth (×(1 + T/15)); a lake
//             that loses more than flows in has no outlet: a salt lake, and nothing leaves it
//   alluvium: flow from which a flat valley floor counts as a floodplain
export const RIVERS = {unit: 500, stream: 25, river: 120, great: 900, evap: 700, alluvium: 60};

