// Carrying and transport of the campaign's caravan (docs/CAMPAIGN.md, «Переноска и транспорт»).
// Everything is measured in units of goods: a ration of food is one unit; heavy goods take more room
// (data/resources.js `bulk`: a log takes 4, a lump of ore 2). Room is counted in cells (a back, a saddle
// bag — `CELL` units) and boxes (`BOX` units): a person has one cell on the back, a basket adds two,
// a riding beast four, a pack beast two boxes, a cart and a wagon four boxes each. The caravan's camp — its
// buildings — goes with it whatever it rides in (K.buildings; CAMP_FX below).
export const CELL = 6, BOX = 10;

// beasts the caravan can have (data/species.js ids): what they are for, the room they give, how they
// are had. `ride` carries a rider (who walks no more: the caravan goes at the beast's pace if everyone
// rides) and four cells; `pack` carries two boxes and walks; `draft` — what pulls a wagon: one beast
// of `pulls` 1, or two of 0.5. Speeds are the species' own (data/species.js `speed`).
export const BEASTS = {
  horse: {use: 'ride', cells: 4, pulls: 0.5, label: 'лошадь', plural: 'лошади', acc: 'лошадь'},
  camel: {use: 'ride', cells: 4, pulls: 0.5, label: 'верблюд', plural: 'верблюды', acc: 'верблюда'},
  mule:  {use: 'pack', boxes: 2, pulls: 1, label: 'мул', plural: 'мулы', acc: 'мула'},
  // the herd (CAMP_KIT.herd): it walks with the caravan for its milk and its meat
  goat:  {use: 'food', label: 'коза', plural: 'козы', acc: 'козу'},
  sheep: {use: 'food', label: 'овца', plural: 'овцы', acc: 'овцу'},
  // the dwarves' golems (data/constructs.js), bought in a dwarven town with a golem forge (data/market.js): they carry two
  // boxes and pull a wagon, eat nothing, stand guard over the camp (agents/behaviours/golem.js) and are mended only in a
  // town with a forge or by the camp's own forge (GOLEM_REPAIR.day); `golem` — the caravan has at most `max` of them
  bronzegolem:  {use: 'pack', boxes: 2, pulls: 1, golem: true, label: 'бронзовый голем', plural: 'бронзовые големы', acc: 'бронзового голема'},
  irongolem:    {use: 'pack', boxes: 2, pulls: 1, golem: true, label: 'железный голем', plural: 'железные големы', acc: 'железного голема'},
  steelgolem:   {use: 'pack', boxes: 2, pulls: 1, golem: true, label: 'стальной голем', plural: 'стальные големы', acc: 'стального голема'},
  mithrilgolem: {use: 'pack', boxes: 2, pulls: 1, golem: true, label: 'мифриловый голем', plural: 'мифриловые големы', acc: 'мифрилового голема'},
};
export const CARAVAN_GOLEMS = {max: 1};

// vehicles: room in boxes, what makes them, who pulls them.
//   tool: the least metal of a tool that can build it (1 — bronze, 2 — iron; data/items.js `bronze` / `iron`);
//   logs: wood felled on the spot (the camp must stand in wooded land); days: camp days to build;
//   pull: 'people' — two members haul it (the caravan slows to `haul`), 'draft' — draft beasts (see BEASTS).
// Wheels keep to the roads: off a road a step costs `offRoad` times more, and the biomes in `WHEEL_BLOCK`
// cannot be crossed at all without a road.
export const VEHICLES = {
  cart:  {label: 'тележка', boxes: 4, tool: 1, logs: 6, days: 3, pull: 'people', haul: 0.75},
  wagon: {label: 'повозка', boxes: 4, tool: 2, logs: 10, days: 5, pull: 'draft'},
};
export const WHEELS = {offRoad: 2, roadAt: 0.1, block: ['highlands', 'foothills', 'swamp', 'jungle', 'volcano', 'ice'], denseForest: 0.7};

// the caravan's camp (data/buildings.js `portable` — the buildings a caravan may have, one of each): built in the field
// when all they cost is wood (a day per `woodPerDay` of it), otherwise only bought. Once had, a building goes with the
// caravan everywhere and stands whole at every night's camp and stop (campaign/camp.js) till it is burnt — as a
// party's camp in the old games. In camp it helps:
//   heal × camp healing;  forage × camp food;  shelter — hunger wears them down × this;  build × camp days for vehicles
export const CAMP_FX = {
  healerhut: {heal: 2},
};
// The caravan's camp is a soldiers' camp, not a craftsmen's: it helps them rest, eat and heal, and makes nothing.
//   huts    — the shelters it may carry (at most `max`): by how many it has, × on camp healing (`heal`) and on what hunger
//             wears off them (`shelter`) — none: they sleep on the ground
//   start   — what every caravan sets out with: the healer's hut
//   cauldron — the pot over the fire, every caravan's: a hot meal of what the stop gives, by the people's own dish (`dish`):
//             × the stop's food (`food`), × camp healing (`heal`), × what hunger wears off (`shelter`)
//   herd    — goats or sheep that walk with it (BEASTS use 'food', at most `max`, the people's `herd` ×): on pasture each
//             gives `milk` rations a day; in hunger one is slaughtered for `meat` rations
export const CAMP_KIT = {
  huts: {max: 2, by: [{heal: 0.8, shelter: 1.2}, {}, {heal: 1.15, shelter: 0.8}]},
  start: ['healerhut'],
  herd: {max: 2, milk: 0.5, meat: 8},
  dish: {
    humans:  {label: 'похлёбка', food: 1.25},
    elves:   {label: 'травяной отвар', food: 1.25, heal: 1.15},
    dwarves: {label: 'пиво на привале', food: 1.25, shelter: 0.8},
    orcs:    {label: 'жаркое', food: 1.35},
  },
};
// What each people's caravan does its own way (campaign/march.js, town.js, potions.js, baggage.js):
//   tame     — × the chance to tame a riding beast, `regain` × its mending on grass (the humans' hitching post)
//   trade    — the town's terms: × what it buys at (`buy`), × what it pays (`sell`)
//   forage   — × the stop's food in wooded land (`wood`)
//   noPots   — the healer's hut brews of herbs alone, no pot
//   herd     — × the herd's room (0: none)
//   mine     — × what a stop to dig brings
//   forge    — the camp's own field forge: mends golems (and arms) like a town's (the dwarves)
//   bearers  — a captive carries a box besides its back (the greenskins)
export const PEOPLE_KIT = {
  humans:  {label: 'коновязь', tame: 1.5, regain: 1.5, trade: {buy: 0.9, sell: 1.1}},
  elves:   {label: 'дары леса', forage: {wood: 1.5}, noPots: true, herd: 0},
  dwarves: {label: 'походный горн', mine: 1.5, forge: true},
  orcs:    {label: 'стадо', herd: 2, bearers: 1},
};
export const kitOf = K => PEOPLE_KIT[K?.people] || {};
export const FIELD_BUILD = {woodPerDay: 6};

// how the caravan comes by things
export const GETTING = {
  // a day in camp where wild beasts of a kind live: the chance one is tamed, × how common they are here
  // (world/region.js faunaLevel) × the best handler's charm (Charisma, data/special.js)
  tame: 0.05,
  // the council camps on purpose to tame when such beasts are common enough here and the caravan lacks them,
  // at most once in `tameEvery` days
  tameLand: 0.8, tameEvery: 30,
  // the land's level counts up to `tameCap`; a beast tamed or bought comes at `hp` health
  tameCap: 1.6, hp: 0.8,
  // a basket woven in camp from bast and willow (a day's work, wooded or grassy land): +2 cells on its maker's back
  basket: {cells: 2, days: 1},
  // after a won fight with those who keep beasts: the chance a beast is taken from them
  spoil: {bandits: {mule: 0.3, horse: 0.15}, raiders: {mule: 0.25, horse: 0.15}, army: {horse: 0.3, mule: 0.2}, tribe: {mule: 0.15}, cultists: {mule: 0.1}},
  // …and the chance an iron tool is taken (the only way to an iron tool before the towns trade, stage 5):
  // it goes to a squire, in place of a worse tool
  spoilTool: {item: 'ironaxe', bandits: 0.08, raiders: 0.08, army: 0.15, cultists: 0.05},
  // a lost fight: the chance each beast is driven off or killed, each vehicle broken
  // (the quick mode: a building of the camp burnt with `building`; on the local map it burns as it burns)
  lose: {beast: 0.3, vehicle: 0.2, building: 0.1},
};

// beasts graze for free where grass grows; where it does not (richness of the plants below `graze`, or
// hard frost) each loses `starve` health a day and dies at none
export const FODDER = {graze: 0.35, starve: 0.03, regain: 0.03};

// the council keeps the wheels when the road takes at most `keep` × the straight way's days; otherwise the vehicles
// are left and the caravan goes straight (the camp's buildings go with it either way)
export const ROUTE = {keep: 1.6};
// The ferry (campaign/ferry.js): a goal over the water is reached with a boat hired in a town of the caravan's land.
//   from:  the buildings that have boats at the sea (a fishing hut, a pier, a harbour)
//   speed: cells of water a day (× the world's scale); sea: a cell of water against one of land, choosing the port
//   price: gold a day of the way (both ways paid at once): base + for each of the company, each beast, each vehicle;
//          short of it, they take what the treasury has
//   wait:  days the company waits at its landing for the boat back, [lo, hi]; fed: the rations a day of each aboard the
//          boat's catch gives (1 — they are fed)
export const FERRY = {from: ['fishhut', 'pier', 'harbor'], speed: 3, fed: 1, sea: 0.5, price: {base: 1, head: 0.3, beast: 0.3, wheels: 1}, wait: [1, 3]};
