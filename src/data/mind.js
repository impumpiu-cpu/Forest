// The realm's mind (docs/WORLD.md «Совет державы»; the code: atlas/mind.js). Three vectors, a wind rose: aggression, growth,
// economy. Every town building, deed of the court and article of the treasury leans along them; every people has its rose —
// the course it keeps to over the years (data/peoples.js `rose`). Each season the realm's council weighs where the realm has
// gone (its course: what it built and spent on), what the season needs (hunger, crowding, threat, the goods it lacks) and its
// people's rose, and blows a wind: three shares by which it spends its free money, flags its towns' roles and weighs the
// court's deeds. A town keeps its own mind: the role is a priority, not an order.
import {TOWN_GOODS, worksOf} from './townBuildings.js';

export const VECTORS = {agg: 'агрессия', grow: 'рост', econ: 'экономика'};
export const VECTOR_IDS = Object.keys(VECTORS);

// How a building's vector is counted where its row sets none (`vec` in «Постройки городов»):
//   fx      each effect (data/townBuildings.js EFFECTS) → the vectors it leans along; housing is the building's `house` / 100
//   out     what its ways make: each good `per`, along its own vector (`goods`), its chain's (`chains`) or `else`
export const VEC_RULES = {
  fx: {defence: {agg: 1}, housing: {grow: 1}, food: {grow: 1}, health: {grow: 1}, faith: {agg: 0.3, grow: 0.7}, prestige: {agg: 0.5, grow: 0.5},
    prod: {econ: 1}, trade: {econ: 1}, lore: {econ: 1}},
  out: {per: 0.12, goods: {arms: 'agg', armor: 'agg'}, chains: {food: 'grow'}, else: 'econ'},
};

// The vector of each deed of the court (data/deeds.js), and of settlers (atlas/build.js): the deeds of a lane are drawn by
// weight × (1 + MIND.deed × the wind along the deed's vector) — a realm blown to war marches sooner than it scouts
export const DEED_VEC = {
  warOn: {agg: 1}, march: {agg: 1}, raidTown: {agg: 1}, captives: {agg: 1},
  clearLair: {agg: 0.5, grow: 0.5}, scout: {agg: 0.5, grow: 0.5}, makePeace: {econ: 1}, settlers: {grow: 1},
};

// The council (atlas/mind.js), each season after the households and before the treasury:
//   course      seasons the course remembers: what the realm did is averaged over about so many seasons
//   dayWorth    gold's worth of a work-day of building, to weigh the builders' work against the treasury's spending
//   pull        how hard the realm pulls toward its rose: rose + pull × (rose − course), no less than nothing
//   needs       how hard the season's needs blow (× each flag) beside the rose
//   smooth      the wind keeps this share of the last season's (a council does not turn each month)
//   flags       the season's needs, 0 … 1: hunger below `fed` (full at fed − fedSpan); crowding above `crowd` (full at
//               crowd + crowdSpan); threat — a war is 1, else the towns' threat; shortages — goods the realm lacks, full at `short`;
//               hoard — the treasury below `reserve` seasons of its spending
//   reserve     seasons of the treasury's spending it keeps before it spends freely
//   spend       share of what it holds beyond its reserve the council spends a season (× 1 − hoard)
//   grants      of each vector's money: `works` goes to the buildings under way along it (their missing materials, then their
//               masters' pay), the rest as coin to the towns of the role (their purse: they pay their masters and buy at market)
//   build       a town's want of a building × (1 + build × how it leans with the town's role × obedience); the seat leans with
//               the wind (`seat` of it)
//   deed        a deed's weight × (1 + deed × the wind along it)
//   obey        how far the towns follow: base + loyalty × the realm's loyalty, 0 … 1, × (1 − the corruption's share)
//   role        roles are flagged once a year: a town's leaning along a vector is what it has built (`built`) and what its
//               place asks for — threat for aggression, the land's food for growth; a town keeps its role unless the
//               wind moves its count
//   turn        a new lead of the wind is told in the chronicle when it leads the old one by this much; `tell` — the flag
//               above which the line names the season's need as the cause (else the people's ways)
//   march       a realm whose treasury cannot pay its armies (hoard above this) puts off its march
export const MIND = {course: 20, dayWorth: 0.5, pull: 1, needs: 0.8, smooth: 0.7,
  flags: {fed: 0.95, fedSpan: 0.35, crowd: 0.6, crowdSpan: 0.4, short: 6},
  reserve: 4, spend: 0.25, grants: {works: 0.5},
  build: 1.5, seat: 0.5, deed: 1.5,
  obey: {base: 0.4, loyalty: 0.4},
  role: {built: 1, threat: 0.5, food: 0.5},
  turn: 0.05, tell: 0.3, march: 0.6};

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
  for (const w of worksOf(b)) for (const g of Object.keys(w.out || {})) {
    const chain = TOWN_GOODS.has(g) ? TOWN_GOODS.get(g).chain : null;
    add(R.out.goods[g] || R.out.chains[chain] || R.out.else, R.out.per);
  }
  return norm(v);
}
// a deed's vector (null — it leans nowhere: a lair's deed)
export const deedVector = id => (DEED_VEC[id] ? norm(DEED_VEC[id]) : null);
// the dot of a vector and a wind, 0 … 1
export const along = (v, w) => VECTOR_IDS.reduce((x, k) => x + (v?.[k] || 0) * (w?.[k] || 0), 0);
