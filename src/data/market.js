// Towns for the campaign's caravan (docs/CAMPAIGN.md, «Поселения»): every friendly town is a standing
// trader, a place to work, to heal, to hire and to winter. What a town offers follows from what it has
// built (data/townBuildings.js ids): a pasture breeds horses, a forge makes iron, an inn sends guides.
// Prices are in imperial gold, as everywhere (data/resources.js `value`, data/items.js `value`).

// how a town stands to the caravan's realm: own — its own realm; friend — a realm it trades with and is
// not at war with; anyone else does not let the caravan in. × on what the caravan pays and gets
export const STANDING = {
  own:    {buy: 0.9, sell: 0.8, label: 'свои'},
  friend: {buy: 1.15, sell: 0.7, label: 'друзья'},
};

export const MARKET = {
  // a ration of road food (grain, dried meat and fish): its base price; a town that feeds itself well sells
  // it cheaper — × (food − feeds × the town's food effect, data/townBuildings.js), never below `floor`
  ration: 0.25, food: {base: 1.4, feeds: 0.6, floor: 0.7},
  // what a town buys of the caravan's goods, × value; a tannery pays more for hides, a market for everything
  sellBonus: {tannery: {hide: 1.3}, market: {all: 1.15}},
  // work in town: gold a day for each member who works (a squire with a tool, a knight hiring out as a guard);
  // × (1 + `perTier` × the tool's metal)
  labour: {squire: 0.45, knight: 0.4, other: 0.3, perTier: 0.25},
  // healing in town: × on camp healing; more where a healer, a hospice or a temple stands
  heal: {base: 1.3, healer: 2},
  healers: ['healerhut', 'hospice', 'temple', 'bathhouse'],
};

// what a town sells besides food, and what of it it must have built (any of `at`); `price` for what has
// no `value` of its own. Beasts and vehicles join the baggage (data/transport.js), items the members' gear
export const OFFERS = [
  {kind: 'beast', id: 'horse', at: ['pasture', 'pen', 'caravanserai'], price: 20},
  {kind: 'beast', id: 'mule', at: ['pasture', 'pen', 'caravanserai', 'market'], price: 12},
  {kind: 'beast', id: 'camel', at: ['caravanserai'], price: 20},
  {kind: 'vehicle', id: 'cart', at: ['crafthut', 'sawmill', 'woodcut'], price: 10},
  {kind: 'vehicle', id: 'wagon', at: ['sawmill', 'crafthut'], also: ['forge', 'smelter'], price: 25},
  {kind: 'item', id: 'ironaxe', at: ['forge', 'smelter', 'foundry']},
  {kind: 'item', id: 'ironspear', at: ['forge', 'armory']},
  {kind: 'item', id: 'sword', at: ['forge', 'armory']},
  {kind: 'item', id: 'bow', at: ['bowyer']},
  {kind: 'item', id: 'shield', at: ['crafthut', 'armory']},
  {kind: 'item', id: 'hardleather', at: ['tannery']},
  {kind: 'item', id: 'lamellar', at: ['forge', 'armory']},
  {kind: 'item', id: 'chainmail', at: ['armory', 'foundry']},
  {kind: 'item', id: 'furcoat', at: ['tannery', 'lodge']},
  {kind: 'building', id: 'healerhut', at: ['healerhut', 'hospice'], price: 15},
  {kind: 'building', id: 'forge', at: ['forge'], price: 30},
  {kind: 'building', id: 'crafthut', at: ['crafthut'], price: 12},
];

// what the caravan buys first when it has the gold: a list in order; each is bought when the caravan
// lacks it and can still keep `reserve` days of food money
export const WANTS = {reserve: 6, foodDays: 20};

// hirelings: who can be hired where (any of `at`, or any town of `tier` and up), for how much a day, for how
// many days; what they bring. A guide knows the land: nights are quieter (× `night`), the fog lifts further
// (+ `sight`), the way is a little faster (× `pace`). A sellsword fights as a knight.
export const HIRES = {
  guide:     {label: 'проводник', plural: 'проводники', at: ['inn', 'caravanserai', 'toll', 'hiddenpaths'], tier: 1, wage: 0.6, days: [30, 60],
    gear: {hand: ['staff'], body: 'jerkin'}, night: 0.75, sight: 2, pace: 1.1},
  sellsword: {label: 'наёмник', plural: 'наёмники', at: ['barracks', 'warcamp', 'arena', 'inn'], tier: 2, wage: 0.9, days: [30, 60],
    gear: {hand: ['sword', 'shield'], body: 'lamellar'}},
  // the caravan hires when it has the gold for the whole term and keeps `reserve` days of food money; at most `max` of each
  max: 1, reserve: 8,
};

// companions: in a town of its own realm or a friendly one a few want to go along: for `fee`, or for nothing
// when the best talker's Charisma is at least `freeAt`. Of the town's people, or (with `minor`) of a minor
// people that lives near (data/races.js); they start with `loyalty`
export const COMPANIONS = {chance: {own: 0.2, friend: 0.08}, inn: 1.5, fee: 8, freeAt: 7, loyalty: 0.6,
  minor: 0.3, minorRaces: ['halfling', 'giant', 'gnoll'], gear: {hand: ['club'], body: 'clothes'}};

// the freed: after a won fight with those who take captives, `chance` of one or two set free; they may
// stay (loyalty starts at `loyalty`)
export const FREED = {chance: {tribe: 0.12, bandits: 0.08, army: 0.06, undead: 0.05}, loyalty: 0.25, gear: {hand: [], body: 'clothes'}};

// loyalty of those who joined on the way (not the core, not the hired): every day `daily` more, less when
// hungry (`hungry`) or after a lost fight (`lost`), more after a won one (`won`); every day one may leave
// with `leave` × (1 − loyalty)²; at 1 they stay for good
export const LOYALTY = {daily: 0.008, hungry: -0.04, lost: -0.1, won: 0.03, leave: 0.06};

// what those who are not the core are called
export const ROLES = {companion: 'спутник', freed: 'вызволенный из плена'};

// the most who walk with the caravan (the core included), and the most of those who joined on the way
// (companions and the freed); nobody joins beyond them
export const COMPANY_MAX = 12, JOINED_MAX = 4;

// the council's reasons to turn to a town on the way: it must be friendly and within `reach` days of the
// caravan's pace (`winterReach` for the winter; for food, no further than the food lasts plus `foodSpare` days). Any way only for the winter and for the badly wounded; otherwise (food, shopping) only a
// town on the way: going through it costs at most `detour` × the way to the goal plus `slack` more
// (`hungryDetour` when they already starve); starving with gold enough for `hungryGold` days of food, any way.
// After a town the
// next one is not sought for `every` days (the winter excepted); a stay lasts at most `stay` days, or the winter —
// wintered only where the winter is hard (its mean below `winterBelow`°: the land hardly feeds then)
export const VISIT = {reach: 8, winterReach: 14, foodSpare: 2, detour: 0.3, hungryDetour: 0.6, hungryGold: 5, slack: 3, every: 25, stay: 3, money: 20, winterBelow: -5};

// earning on the way: hides from hunting in camp (× the land's game), gold panned from a river's sand by
// the one with a pan (× the cell's gold sand level, data/regions.js placer)
export const EARN = {hide: 0.3, pan: 0.4};
