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
};

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
  hut:       {heal: 1.4, shelter: 0.6},
  healerhut: {heal: 2},
  lodge:     {forage: 1.25},
  fishhut:   {forage: 1.15},
  crafthut:  {build: 0.6},
  forge:     {build: 0.8},
};
export const FIELD_BUILD = {woodPerDay: 6};

// how the caravan comes by things
export const GETTING = {
  // a day in camp where wild beasts of a kind live: the chance one is tamed, × how common they are here
  // (world/region.js faunaLevel) × the best handler's charm (Charisma, data/special.js)
  tame: 0.05,
  // the council camps on purpose to tame when such beasts are common enough here and the caravan lacks them,
  // at most once in `tameEvery` days
  tameLand: 0.8, tameEvery: 30,
  // a basket woven in camp from bast and willow (a day's work, wooded or grassy land): +2 cells on its maker's back
  basket: {cells: 2, days: 1},
  // after a won fight with those who keep beasts: the chance a beast is taken from them
  spoil: {bandits: {mule: 0.3, horse: 0.15}, army: {horse: 0.3, mule: 0.2}, tribe: {mule: 0.15}},
  // …and the chance an iron tool is taken (the only way to an iron tool before the towns trade, stage 5):
  // it goes to a squire, in place of a worse tool
  spoilTool: {item: 'ironaxe', bandits: 0.08, army: 0.15},
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
