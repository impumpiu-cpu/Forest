// The outlying works of a town and the net of supply between towns (atlas/sites.js, docs/WORLD.md
// «Пригород»). A town's fields, pastures, mines and quarries do not stand in it: each is a site — a
// node in its own cell within the town's reach, joined to the town by a track. What a site yields
// goes to its town; what a town has over its need flows to the towns it trades with, the way a slime
// mould feeds through its veins: a vein that carries flow thickens, one that carries none wastes
// away. The thick veins are the roads (atlas/roads.js wears them by the flow).
export const SITES = {
  // how far from the town's middle a site may stand, in cells of a 192-cell-high world, by the
  // town's step (data/peoples.js TIERS); and how many cells around its middle the town itself takes
  radius: [2, 3, 4],
  footprint: [0, 0, 1],
  // choosing the cell: how well the ground fits, less `close` a cell of distance, plus `beside` for
  // each neighbouring cell that already has a site or a road (the works cluster along the tracks)
  close: 0.1, beside: 0.06,
  // a raid on a town burns one of its sites this often; a razed town loses them all
  burn: 0.7,
  // a dead site is remembered (drawn as a stump) this many years, then forgotten
  remember: 12,
};

// The net of supply. Each spring every town counts what its land and its living sites feed
// (`feeds`, in people). A town with more than `keep` × its people has a surplus and sends up to
// `give` of it down its links; a town whose houses hold more than its land feeds (up to `want` × its
// people) lacks, and takes; a town is one or the other, never both in one year. A link to a razed town
// is dropped at once. A link's conductance c (0 … 1) decides how much may pass:
//   flow p→q = c · min(share of p's surplus for this link, q's lack),  share ∝ c among p's links
//   c grows by `grow` × (flow / need of q) a year and wastes by `decay` without flow; a link below
//   `min` is dropped. New links start at `start`. Links join the `links` nearest towns within `reach`
//   cells that trade (atlas/diplomacy.js). `wear`: people of flow that wear one unit into the road.
export const NET = {links: 3, reach: 70, start: 0.12, grow: 0.5, decay: 0.12, min: 0.03, wear: 500, keep: 1.15, give: 0.6, want: 1.5,
  // a town that gets at least `fedBy` of its food from its links for `years` years lives by them: told once
  fedBy: 0.35, years: 3};
