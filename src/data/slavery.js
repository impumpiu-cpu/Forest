// The trade in captives (docs/CAPTIVES.md): what a captive is worth, where it may be sold, how the
// company takes it. Used by the campaign's towns (campaign/slavery.js) and the settlement's trader
// (settlement/slavery.js).
//
// The price of a captive: base × body × strength × craft × temper, then × the town's or the trader's terms.
//   body     — hp share: lo + hi × share (a half-dead captive is worth little)
//   strength — 1 + perS × (S − 5)
//   craft    — 1 + perSkill × its best active skill (0–1): a captive who can work is worth more
//   temper   — × resigned for a resigned one, × unruly for one whose will to run reaches `unrulyFrom`
//
// The law by people (data/peoples.js): legal — sold and bought at × k; frowned — sold at × k, but every
// sale costs the town's realm's attitude to the caravan's realm `att` (−5…+5); banned — no trade at all.
// The settlement's trader (an imperial merchant) deals as `trader`.
//
// Who is sold: an unruly captive (will from `sell.will`, not resigned), or any captive when the food is short
// (less than `sell.foodDays` days a head); never one with `sell.service` or more — it is close to freedom.
// Who is bought: a town where it is legal offers one now and then (`buy.offer`), a trader with `buy.trader`;
// the caravan or the colony buys one while it has bonds for it, room among the captives, gold beyond its
// reserve, and fewer than `buy.want` captives.
//
// The company takes it ill: a sale costs every former slave `upset.former` of its tie (bond, loyalty), every
// companion and freed one `upset.joined`, a hireling `upset.hired` of its opinion; the captives left behind
// grow `upset.fear` more willing to run; a merciful colonist (mercy above 0) is troubled (a thought).
export const SLAVE = {
  base: 12,
  body: [0.35, 0.65], perS: 0.08, perSkill: 0.8,
  resigned: 1.3, unruly: 0.7, unrulyFrom: 0.6,
  law: {
    orcs:    {law: 'legal', k: 1.2},
    humans:  {law: 'legal', k: 1},
    dwarves: {law: 'banned'},   // they hate it: no slaves bought, sold or kept (docs/WORLD.md «Асимметрия народов»)
    elves:   {law: 'banned'},
  },
  trader: {law: 'legal', k: 0.9},
  // the peoples (and their races) who keep no captives at all: a fallen foe is dressed and let go (settlement/captives.js),
  // the caravan sets its captives free (campaign/slavery.js); none is ever sold or bought. Their one cause of war over
  // slaves: their own kin in bondage (atlas/deeds/liberate.js)
  frees: {peoples: ['dwarves'], races: ['dwarf']},
  // their war of liberation (atlas/deeds/liberate.js): a town of theirs within `reach` × DIPLOMACY.raidReach of a town that
  // holds their kin as slaves (t.slavesOf), or of a lair that holds them captive (lair.captives), goes to free them —
  // `chance` a year; against a realm it is war (the standing falls by `att`). A win brings `home` of the freed to the town
  // as free people; a loss costs the town `loss` of its people
  liberate: {reach: 1.5, chance: 0.6, att: 2, home: 0.8, loss: 0.08, least: 3},
  sell: {will: 0.6, foodDays: 3, service: 1, attFloor: -5},   // attFloor: a frowned-on sale lowers the realm's standing no further
  buy: {offer: 0.35, trader: 0.3, want: 2, mark: 1.3, will: 0.45, races: ['human', 'orc', 'goblin', 'gnoll', 'halfling'], reserveDays: 7},   // reserveDays: the food money kept after the buy (days of rations, campaign/town.js reserveFor)
  upset: {former: -0.15, joined: -0.05, hired: -0.04, fear: 0.1},
};

const best = skill => Math.max(0, ...Object.values(skill || {}).filter(v => typeof v === 'number'));

// the price of a captive before the terms: {hp (0–1), S, skill (an object), resigned, will}
export function captivePrice({hp = 1, S = 5, skill = null, resigned = false, will = 0.6}) {
  const P = SLAVE;
  const temper = resigned ? P.resigned : will >= P.unrulyFrom ? P.unruly : 1;
  return Math.round(P.base * (P.body[0] + P.body[1] * Math.max(0, Math.min(1, hp))) * (1 + P.perS * (S - 5)) * (1 + P.perSkill * best(skill)) * temper * 10) / 10;
}
// the law of a people; an unknown one is taken as legal at par
export const lawOf = people => SLAVE.law[people] || {law: 'legal', k: 1};
// does a people (or a colony of a race) let its captives go
export const freesCaptives = people => SLAVE.frees.peoples.includes(people);
export const raceFrees = race => SLAVE.frees.races.includes(race);
