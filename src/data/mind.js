// The realm's mind (docs/WORLD.md «Совет державы»; the code: atlas/mind.js). Three vectors, a wind rose: aggression, growth,
// economy. Every town building, deed of the court and article of the treasury leans along them; every people has its rose —
// the course it keeps to over the years (data/peoples.js `rose`). Each season the realm's council weighs where the realm has
// gone (its course: what it built and spent on), what the season needs (hunger, crowding, threat, the goods it lacks) and its
// people's rose, and blows a wind: three shares by which it spends its free money, flags its towns' roles and weighs the
// court's deeds. A town keeps its own mind: the role is a priority, not an order.

export const VECTORS = {agg: 'агрессия', grow: 'рост', econ: 'экономика'};
export const VECTOR_IDS = Object.keys(VECTORS);

// How a building's vector is counted where its row sets none (`vec` in «Постройки городов»):
//   fx      each effect (data/townBuildings.js EFFECTS) → the vectors it leans along; housing is the building's `house` / 100
//   cat     its category (data/townBuildings.js CATEGORIES) → a lean of its own: the food buildings feed by their flows, not
//           by an effect, and grow the realm
//   out     what it makes (its `out`): each good `per`, along its own vector (`goods`; food, grain, stores and herds grow) or `else`
export const VEC_RULES = {
  fx: {defence: {agg: 1}, housing: {grow: 1}, food: {grow: 1}, health: {grow: 1}, faith: {agg: 0.3, grow: 0.7}, prestige: {agg: 0.5, grow: 0.5},
    prod: {econ: 1}, trade: {econ: 1}, lore: {econ: 1}},
  cat: {food: {grow: 1}},
  out: {per: 0.12, goods: {arms: 'agg', armor: 'agg', food: 'grow', grain: 'grow', stores: 'grow', beasts: 'grow'}, else: 'econ'},
};

// The vector of each deed of the court (data/deeds.js): the deeds of a lane are drawn by
// weight × (1 + MIND.deed × the wind along the deed's vector) — a realm blown to war marches sooner than it scouts
export const DEED_VEC = {
  warOn: {agg: 1}, march: {agg: 1}, raidTown: {agg: 1}, captives: {agg: 1},
  clearLair: {agg: 0.5, grow: 0.5}, scout: {agg: 0.5, grow: 0.5}, makePeace: {econ: 1}, liberate: {agg: 0.6, grow: 0.4},
};

// The council (atlas/mind.js), each season after the households and before the treasury:
//   course      seasons the course remembers: what the realm did is averaged over about so many seasons
//   pull        how hard the realm pulls toward its rose: rose + pull × (rose − course), no less than nothing
//   needs       how hard the season's needs blow (× each flag) beside the rose
//   smooth      the wind keeps this share of the last season's (a council does not turn each month)
//   flags       the season's needs, 0 … 1: want — the people's basic needs met below `fed` (full at fed − fedSpan); crowding
//               above `crowd` (full at crowd + crowdSpan); threat — a war is 1, else the towns' threat; shortages — goods the
//               realm's towns lack, full at `short`; hoard — the realm's gold below `hoard` per 100 of its people (empty: 1)
//   hoard       gold per 100 people the treasury would hold before the council is easy
//   seat        the seat's share of each vector's grants (atlas/treasury.js realmSpend), and of the wind it leans its own building by
//   build       a town's want of a building × (1 + build × how it leans with the town's role × obedience); the seat leans with
//               the wind (`seat` of it)
//   deed        a deed's weight × (1 + deed × the wind along it)
//   obey        how far the towns follow: base + loyalty × the realm's loyalty, 0 … 1, × (1 − the corruption's share: `corrupt`
//               × its points, at most corruptMax)
//   role        roles are flagged once a year: a town's leaning along a vector is what it has built (`built`) and what its
//               place asks for — threat for aggression, the land's food for growth; a town keeps its role unless the
//               wind moves its count
//   turn        a new lead of the wind is told in the chronicle when it leads the old one by this much; `tell` — the flag
//               above which the line names the season's need as the cause (else the people's ways)
export const MIND = {course: 20, pull: 1, needs: 0.8, smooth: 0.7,
  flags: {fed: 0.95, fedSpan: 0.35, crowd: 0.6, crowdSpan: 0.4, short: 6},
  hoard: 5,
  build: 1.5, seat: 0.5, deed: 1.5,
  obey: {base: 0.4, loyalty: 0.4, corrupt: 0.03, corruptMax: 0.5},
  role: {built: 1, threat: 0.5, food: 0.5},
  turn: 0.05, tell: 0.3};

const norm = v => { const s = VECTOR_IDS.reduce((x, k) => x + (v[k] || 0), 0); return Object.fromEntries(VECTOR_IDS.map(k => [k, s > 0 ? (v[k] || 0) / s : 1 / VECTOR_IDS.length])); };
export const normVec = norm;

// a building's vector: its row's own `vec`, else from its effects and what it makes (VEC_RULES)
export function vectorOf(b) {
  if (!b) return norm({});
  if (b.vec) return norm(b.vec);
  const v = {}, R = VEC_RULES, add = (k, x) => { v[k] = (v[k] || 0) + x; };
  const fx = {...b.fx};
  if (b.house) fx.housing = (fx.housing || 0) + b.house / 100;
  for (const [k, x] of Object.entries(fx)) for (const [vk, w] of Object.entries(R.fx[k] || {})) add(vk, w * Math.abs(x));
  for (const [vk, w] of Object.entries(R.cat[b.cat] || {})) add(vk, w);
  for (const g of Object.keys(b.out || {})) add(R.out.goods[g] || R.out.else, R.out.per);
  return norm(v);
}
// a deed's vector (null — it leans nowhere: a lair's deed)
export const deedVector = id => (DEED_VEC[id] ? norm(DEED_VEC[id]) : null);
// the vector a lean leads along (the first of VECTOR_IDS on a tie)
export const leadOf = v => VECTOR_IDS.reduce((m, k) => ((v?.[k] || 0) > (v?.[m] || 0) ? k : m), VECTOR_IDS[0]);
// the dot of a vector and a wind, 0 … 1
export const along = (v, w) => VECTOR_IDS.reduce((x, k) => x + (v?.[k] || 0) * (w?.[k] || 0), 0);
