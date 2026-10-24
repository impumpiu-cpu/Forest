// Towns for the campaign's caravan (docs/CAMPAIGN.md, «Поселения»): every friendly town is a standing
// trader, a place to work, to heal, to hire and to winter. What a town offers follows from what it has
// built (data/townBuildings.js ids): a pasture breeds horses, a forge makes iron, an inn sends guides.
// Prices are in imperial gold, as everywhere; every price and coefficient here comes from data/balance/prices.js
// (CAMPAIGN), the one place to balance them.
import {CAMPAIGN} from './balance/prices.js';

// how a town stands to the caravan's realm: own — its own realm; friend — a realm it trades with and is
// not at war with; anyone else does not let the caravan in. × on what the caravan pays and gets
// (the numbers live in data/balance/prices.js CAMPAIGN: read through, so a table edit there reaches here)
export const STANDING = {
  get own() { return {...CAMPAIGN.standing.own, label: 'свои'}; },
  get friend() { return {...CAMPAIGN.standing.friend, label: 'друзья'}; },
};

export const MARKET = {
  // a ration of road food (grain, dried meat and fish): its base price; a town that feeds itself well sells
  // it cheaper — × (food − feeds × the town's food effect, data/townBuildings.js), never below `floor`
  get ration() { return CAMPAIGN.ration; }, get food() { return CAMPAIGN.food; },
  // the spoils of fights (worn arms and armour): × their worth
  get spoils() { return CAMPAIGN.spoils; },
  // what a town buys of the caravan's goods, × value; a tannery pays more for hides, a market for everything
  get sellBonus() { return CAMPAIGN.sellBonus; },
  // work in town: gold a day for each member who works (a squire with a tool, a knight hiring out as a guard);
  // × (1 + `perTier` × the tool's metal)
  get labour() { return CAMPAIGN.wages; },
  // healing in town: × on camp healing; more where a healer, a hospice or a temple stands
  heal: {base: 1.3, healer: 2},
  healers: ['healerhut', 'hospice', 'temple', 'bathhouse'],
};

// what a town sells besides food, and what of it it must have built (any of `at`); `price` for what has
// no `value` of its own. Beasts and vehicles join the baggage (data/transport.js), items the members' gear
export const OFFERS = [
  {kind: 'beast', id: 'horse', at: ['pasture', 'pen', 'caravanserai'], price: CAMPAIGN.beasts.horse},
  {kind: 'beast', id: 'mule', at: ['pasture', 'pen', 'caravanserai', 'market'], price: CAMPAIGN.beasts.mule},
  {kind: 'beast', id: 'camel', at: ['caravanserai'], price: CAMPAIGN.beasts.camel},
  {kind: 'vehicle', id: 'cart', at: ['crafthut', 'sawmill', 'woodcut'], price: CAMPAIGN.vehicles.cart},
  {kind: 'vehicle', id: 'wagon', at: ['sawmill', 'crafthut'], also: ['forge', 'smelter'], price: CAMPAIGN.vehicles.wagon},
  {kind: 'item', id: 'ironaxe', at: ['forge', 'smelter', 'foundry']},
  {kind: 'item', id: 'ironspear', at: ['forge', 'armory']},
  {kind: 'item', id: 'sword', at: ['forge', 'armory']},
  {kind: 'item', id: 'bow', at: ['bowyer']},
  {kind: 'item', id: 'shield', at: ['crafthut', 'armory']},
  {kind: 'item', id: 'hardleather', at: ['tannery']},
  {kind: 'item', id: 'lamellar', at: ['forge', 'armory']},
  {kind: 'item', id: 'chainmail', at: ['armory', 'foundry']},
  // steel: where a foundry tempers it (and the realm knows how: data/tech.js 'steelmaking')
  {kind: 'item', id: 'steelsword', at: ['foundry']},
  {kind: 'item', id: 'steelspear', at: ['foundry']},
  {kind: 'item', id: 'steellamellar', at: ['foundry']},
  {kind: 'item', id: 'furcoat', at: ['tannery', 'lodge']},
  // bonds for captives (data/captives.js): rope in any town, shackles where iron is worked
  {kind: 'goods', id: 'rope', n: 4, any: true, at: []},
  {kind: 'goods', id: 'shacklesIron', n: 1, at: ['forge', 'smelter', 'foundry']},
  {kind: 'goods', id: 'shacklesSteel', n: 1, at: ['foundry']},
  {kind: 'building', id: 'healerhut', at: ['healerhut', 'hospice'], price: CAMPAIGN.services.healerhut},
  {kind: 'building', id: 'forge', at: ['forge'], price: CAMPAIGN.services.forge},
  {kind: 'building', id: 'crafthut', at: ['crafthut'], price: CAMPAIGN.services.crafthut},
];

// what the caravan buys first when it has the gold: a list in order; each is bought when the caravan
// lacks it and can still keep `reserve` days of food money. Food — up to `foodDays` days; a starving caravan that cannot
// pay for `alms` days of it is fed that much for nothing by a friendly town (once a visit)
export const WANTS = {reserve: 6, foodDays: 20, alms: 5};

// hirelings: who can be hired where (any of `at`, or any town of `tier` and up), for how much a day, for how
// many days; what they bring. A guide knows the land: nights are quieter (× `night`), the fog lifts further
// (+ `sight`), the way is a little faster (× `pace`). A sellsword fights as a knight.
export const HIRES = {
  guide:     {label: 'проводник', plural: 'проводники', at: ['inn', 'caravanserai', 'toll', 'hiddenpaths'], tier: 1, wage: CAMPAIGN.hires.guide, days: [30, 60],
    gear: {hand: ['staff'], body: 'jerkin'}, night: 0.75, sight: 2, pace: 1.1},
  sellsword: {label: 'наёмник', plural: 'наёмники', at: ['barracks', 'warcamp', 'arena', 'inn'], tier: 2, wage: CAMPAIGN.hires.sellsword, days: [30, 60],
    gear: {hand: ['sword', 'shield'], body: 'lamellar'}},
  // the caravan hires when it has the gold for the whole term and keeps `reserve` days of food money; at most `max` of each
  max: 1, reserve: 8,
};

// companions: in a town of its own realm or a friendly one a few want to go along: for `fee`, or for nothing
// when the best talker's Charisma is at least `freeAt`. Of the town's people, or (with `minor`) of a minor
// people that lives near (data/races.js); they start with `loyalty`
export const COMPANIONS = {chance: {own: 0.2, friend: 0.08}, inn: 1.5, get fee() { return CAMPAIGN.companionFee; }, freeAt: 7, loyalty: 0.6,
  minor: 0.3, minorRaces: ['halfling', 'giant', 'gnoll'], gear: {hand: ['club'], body: 'clothes'}};

// the freed: after a won fight with those who take captives, `chance` of one or two set free; they may
// stay (loyalty starts at `loyalty`)
export const FREED = {chance: {tribe: 0.12, bandits: 0.08, army: 0.06, undead: 0.05}, loyalty: 0.25, gear: {hand: [], body: 'clothes'}};

// loyalty of those who joined on the way (not the core, not the hired): every day `daily` more, less when
// hungry (`hungry`) or after a lost fight (`lost`), more after a won one (`won`); every day one may leave
// with `leave` × (1 − loyalty)²; at 1 they stay for good
export const LOYALTY = {daily: 0.008, hungry: -0.04, lost: -0.1, won: 0.03, leave: 0.06,
  // stage 4 (docs/CAPTIVES.md): a badly wounded one loses heart (`hurt` a day under half health), a cut ration for
  // the captives is a hard sight (`cruel` a day), a leader with a way with words keeps them (`charm` × (best C − 5))
  hurt: -0.01, cruel: -0.004, charm: 0.002};

// a hireling's opinion of the service (0…1, from `start`): a day `daily`; a fight won `won`, lost `lost`; a hungry
// day `hungry`, a day badly wounded `hurt`. Below `desert` it may run off any day (`deserts` a day). At the end of the
// term: from `stay` it stays for good (a member, no wage); from `extend` it asks for another term of `days` at its
// wage — paid if the caravan has the gold beyond `reserve` days of food money, else it goes; below — it goes.
export const CONTRACT = {start: 0.5, daily: 0.006, won: 0.04, lost: -0.08, hungry: -0.04, hurt: -0.01,
  desert: 0.15, deserts: 0.08, stay: 0.8, extend: 0.45, days: 30, reserve: 6};

// what those who are not the core are called
export const ROLES = {companion: 'спутник', freed: 'вызволенный из плена', captive: 'пленный', former: 'бывший раб'};

// the most who walk with the caravan (the core included), and the most of those who joined on the way
// (companions and the freed); nobody joins beyond them
export const COMPANY_MAX = 12, JOINED_MAX = 4;

// the council's reasons to turn to a town on the way: it must be friendly and within `reach` days of the
// caravan's pace (`winterReach` for the winter; for food — sought once it lasts less than `foodAt` days — no further
// than the food lasts plus `foodSpare` days). Any way only for the winter and for the badly wounded; otherwise (food, shopping) only a
// town on the way: going through it costs at most `detour` × the way to the goal plus `slack` more
// (`hungryDetour` when they already starve); starving, any way (a friendly town feeds them: WANTS.alms), within
// `winterReach` days; after `retreat` days of hunger where the land does not feed them (CAMPAIGN.camp.foodLand) or that wears them
// down (their mean health below CAMPAIGN.camp.hp), within
// `retreatReach` — back the way they came if need be.
// After a town the
// next one is not sought for `every` days (the winter excepted); a stay lasts at most `stay` days, or the winter —
// wintered only where the winter is hard (its mean below `winterBelow`°: the land hardly feeds then). Too poor to stock
// up for the way, they stay up to `work` days in all hired out for board and pay (the town feeds them, the pay is kept)
// For the smith (SMITH): with at least `smithOre` units of ore worth forging and `smithGold` gold, a town with a smith
// on the way (a detour of `smithDetour`); none near — asked again after `smithRetry` days
export const VISIT = {foodAt: 1.5, smithOre: 4, smithGold: 0, smithDetour: 0.5, smithRetry: 10, reach: 8, winterReach: 14, retreat: 6, retreatReach: 120, work: 20, foodSpare: 2, detour: 0.3, hungryDetour: 0.6, slack: 3, every: 25, stay: 3, money: 20, winterBelow: -5};

// earning on the way: hides from hunting in camp (× the land's game), gold panned from a river's sand by
// the one with a pan (× the cell's gold sand level, data/regions.js placer)
export const EARN = {hide: 0.3, pan: 0.4};

// The smith of a friendly town forges from the caravan's own ore (campaign/town.js smithy): where one of `at`
// stands and the caravan carries the ore of the item's metal by its recipe (data/recipes.js: bars × `bar[metal].n`
// units of `bar[metal].ore` each), the item costs × `discount` (50–60% cheaper). What ore is left is sold.
// `reserve` — days of food money the caravan keeps after paying the smith
export const SMITH = {at: ['forge', 'smelter', 'foundry', 'armory'], discount: 0.45, reserve: 3,
  bar: {bronze: {ore: 'bronzeOre', n: 2}, iron: {ore: 'ironore', n: 2}, mithril: {ore: 'mithrilOre', n: 2}}};

