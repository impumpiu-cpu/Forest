// Buildings of the world map's towns. What a town has built decides how it lives: how many it
// houses, how much it feeds, what it makes and trades, how it holds off the wild, what it believes
// and knows, how far its name carries. Towns choose what to build by their needs (atlas/towns.js),
// the way the colonists' council does on the local map.
//
// This table is the one truth about a building of the world: who may build it, what its realm must have first,
// what it houses, employs, takes and gives. The local map's buildings (data/buildings.js) read their races from here
// through `local`; the smiths and markets of the campaign read the metals a realm works from here (`metals`).
//
// Fields of an entry:
//   name, g       what it is called (the chronicle says «появилась кузня»), and the gender of the word
//   cat           category (CATEGORIES below)
//   ── who and when
//   peoples       races: the peoples that build it (data/peoples.js ids); none — anyone
//   requires      in the realm: buildings that must stand in some town of the town's realm, all of them;
//                 requiresAny — at least one of them. Each town builds for itself; what it may build, its realm decides
//   tier          from which town step it can be built (data/peoples.js TIERS: 0 hamlet, 1 village, 2 town);
//                 the buildings that earn a step (TIERS needsAny) are built one step earlier
//   pop           and at least this many people (the great works of a big town)
//   capital       only the seat of a people's realm builds it (data/peoples.js CAPITAL, `crowned`)
//   unique        one for the whole realm (for now: the people)
//   needs         conditions of the place, all of them (PLACE_NEEDS below); needsAny — at least one
//   max           how many a town may have (houses and fields can be many), 1 if not said
//   ── what it does (a day at full strength; docs/WORLD.md «Потоки построек»). Every flow is a rate a day, a float:
//   the world steps a season at a time and a town takes rate × days; food is counted in rations (one feeds one a day)
//   house         people it houses: the town's room is TOWN_FX.room[0] + Σ house (the town does not grow past it)
//   jobs          hands it takes from the town's people to work at full strength
//   heat          cycles of warmth a day its hearths keep up, × the climate (cold ×1.6, mild ×1, warm ×0.4)
//   fire          cycles of fire its work burns a day (an oven, a furnace, a kiln); a way of TOWN_WORKS has its own.
//                 Fuel goes by charges, as tools do: the building takes a unit of fuel (good `coal`: charcoal and
//                 firewood alike), the unit brings FUEL.uses cycles, each cycle of warmth or fire spends one, and when
//                 they run out it takes the next. Warmth takes the fuel first, the furnaces what is left (FUEL_ORDER)
//   repair        upkeep: what keeps the building standing — a wooden one logs or boards, a stone one stone, a tent hides
//   tools         tools in its hands at work. A tool is taken whole from the stock and serves TOOLS[its material].days
//                 working days, then the next one is taken — so a working building needs tools all the time, and fewer of
//                 them the better they are. Tools, arms and armour in the stock are counted by worth (TOOLS[...].price a
//                 piece), as luxury is: a forge turns out worth, a caravan buys a piece of that worth
//   herd          head of beasts it keeps at full strength: milk comes from the herd, the slaughterhouse takes the increase
//   in, out       what it takes and gives in its work, in TOWN_GOODS ({good: amount})
//   works         a building that can work several ways — one way at a time, switched when its makings run out — (a furnace: bronze, iron or silver; a hearth: whatever raw food
//                 there is) has its ways in TOWN_WORKS below instead of in/out; it works the ones it has the makings for
//   quality       the material of the tools and arms it makes (TOOLS): bone, bronze, ironwood, iron, holywood, steel, mithril
//   metals        the metals its realm's smiths work and its markets sell once one stands in the realm
//                 (data/balance/materials.js ids; a metal no building lists, everyone works)
//   fx            what it gives, per building (EFFECTS below)
//   `jobs`, `heat`, `fire`, `repair`, `tools`, `in` and `out` are the numbers of the flows: drafts, in the table and checked
//   (`npm run buildings`), not yet run by the towns — the next step. `house` runs now.
//   What some buildings do beyond their effects: a bridge or ferry takes the ford out of the road's cost
//   at the town (atlas/roads.js), a mint doubles the warmth of the town's trade routes (atlas/diplomacy.js),
//   a harbour opens the sea lanes (atlas/sea.js), a mage tower and a temple of the fallen hold the rot
//   off (atlas/lairs.js).
//   site          stands outside the town, in a cell of its own within the town's reach (data/sites.js,
//                 atlas/sites.js): fields, pastures, mines, quarries; its place needs hold at that cell
//   local         the building of the local map it stands for (data/buildings.js id), if there is one;
//                 the rest exist only on the world map for now
//   notable       the chronicle tells when it is built (also everything from tier 2 up)
import {Registry} from '../core/registry.js';
import {RESOURCES as PRICE, CAMPAIGN} from './balance/prices.js';

export const CATEGORIES = {
  housing: 'жильё', food: 'еда', raw: 'добыча', craft: 'ремесло', trade: 'торговля и пути',
  defence: 'оборона', faith: 'вера', lore: 'знание', power: 'власть и слава', life: 'быт и здоровье',
};

// What the effects mean in a town's evaluation (atlas/towns.js):
//   housing   not set by hand: Σ `house` / 100 of the buildings (atlas/towns.js townFx), so the town's needs and
//             its people's taste still weigh room as before
//   food      + share of what the land around feeds
//   prod      making: wealth of the town, and the might of its arms with defence
//   trade     + share of the traffic it sends down the roads, and of its growth
//   defence   + share of its might against monsters and raids
//   faith     steadiness: a raid costs less;  lore — knowledge (magic and schooling later)
//   prestige  draws settlers: faster growth, and its people's land spreads further from it
//   health    fewer die in a raid or a murrain
//
// The goods of a town's flows: what a day of a building takes and gives. `res` — the stock resource it is priced as
// (data/balance/prices.js), × `per` units of it in one unit of the good; `price` — gold for a good with no resource
// of its own. Food of every kind is counted in rations: one feeds one person a day.
//   kind    base — got from the land with no making (logs, ore, raw food); made — the work of a building
//   raw     raw food: not eaten — only a hearth, a bakery, a smokehouse or the racks make food of it
//   chain   the branch it belongs to (CHAINS): how the goods are grouped on the chain map
//   start   what a town makes of it a day by its people's own hands, with no building — enough for the first
//           buildings, so that no chain waits for itself (the woodcutters' tools, the first logs)
//   need    what 100 people use up of it a day (food, clothes, herbs, drink, the gentry's luxury)
//   eaten   peoples that eat it raw (the elves live on what the grove gives as it is): for them it feeds as food does
//   buy     peoples that only buy it (the elves do not mine silver): their towns get it at the market, never make it
//   needFrom from which step of a town (0 hamlet, 1 village, 2 town) its people ask for it: a hamlet wants food, clothes
//           and herbs; drink and potions come with a village, luxury with a town
//   needOf  what 100 people of a people use up a day instead of `need` ({orcs: 0}: the orcs want no luxury, they want arms)
//   spoil   the share of the stock that rots a day (raw food fast, stores hardly); a granary or a cellar slows it (STORAGE)
export const CHAINS = {wood: 'дерево', fuel: 'топливо', food: 'еда', stone: 'камень и глина', metal: 'металл', tools: 'орудия и оружие',
  beasts: 'скот и охота', cloth: 'ткани и одежда', herbs: 'травы и лечение', lux: 'роскошь, вера, деньги'};
const RATION = () => CAMPAIGN.ration;   // the price of a ration of ready food
export const TOWN_GOODS = new Registry('townGood');
TOWN_GOODS.registerAll([
  // food: raw (not eaten) and ready
  {id: 'grain', label: 'зерно', unit: 'рацион', kind: 'base', raw: true, spoil: 0.002, chain: 'food', get price() { return RATION() * 0.7; }, note: 'сырое: мельница и жернова мелют его в муку, очаг варит кашу, загон кормит им скот'},
  {id: 'produce', label: 'овощи и плоды', unit: 'рацион', kind: 'base', raw: true, eaten: ['elves'], spoil: 0.01, chain: 'food', start: 10, get price() { return RATION() * 0.7; }},
  {id: 'mushrooms', label: 'грибы', unit: 'рацион', kind: 'base', raw: true, spoil: 0.01, chain: 'food', get price() { return RATION() * 0.6; }, note: 'сырое: грибные пещеры гномов; варят похлёбку, мелют грибную муку, ставят грибное пиво'},
  {id: 'meat', label: 'мясо', unit: 'рацион', kind: 'base', raw: true, spoil: 0.02, chain: 'food', get price() { return RATION() * 0.8; }},
  {id: 'fish', label: 'рыба', unit: 'рацион', kind: 'base', raw: true, spoil: 0.03, chain: 'food', get price() { return RATION() * 0.7; }},
  {id: 'milk', label: 'молоко', unit: 'рацион', kind: 'base', raw: true, spoil: 0.05, chain: 'food', get price() { return RATION() * 0.6; }},
  {id: 'flour', label: 'мука', unit: 'рацион', kind: 'made', spoil: 0.003, chain: 'food', get price() { return RATION() * 0.8; }},
  {id: 'food', label: 'готовая еда', unit: 'рацион', kind: 'made', spoil: 0.02, chain: 'food', start: 12, need: 100, get price() { return RATION(); }, note: 'хлеб, каша, похлёбка: только её и заготовки едят жители'},
  {id: 'stores', label: 'заготовки', unit: 'рацион', kind: 'made', spoil: 0.0005, chain: 'food', price: 150, note: 'вяленое, солёное, копчёное: не портится, едят в голод и зимой'},
  {id: 'salt', label: 'соль', unit: 'шт.', kind: 'base', chain: 'food', res: 'salt'},
  {id: 'drink', needFrom: 1, label: 'брага и пиво', unit: 'шт.', kind: 'made', chain: 'food', need: 2, res: 'braga'},
  {id: 'honey', label: 'мёд и воск', unit: 'шт.', kind: 'base', chain: 'lux', price: 1.2},
  // wood and fuel
  {id: 'wood', label: 'брёвна', unit: 'шт.', kind: 'base', chain: 'wood', start: 0.5, res: 'wood'},
  {id: 'planks', label: 'тёс', unit: 'шт.', kind: 'made', chain: 'wood', res: 'planks'},
  {id: 'coal', label: 'уголь и дрова', unit: 'шт.', kind: 'base', chain: 'fuel', start: 0.167, res: 'coal', note: 'всё топливо: древесный уголь из ям, дрова, хворост и каменный уголь копей; сперва на тепло, потом горнам'},
  // stone and clay
  {id: 'stone', label: 'камень', unit: 'шт.', kind: 'base', chain: 'stone', start: 0.167, res: 'stone'},
  {id: 'clay', label: 'глина', unit: 'шт.', kind: 'base', chain: 'stone', start: 0.125, res: 'clay'},
  {id: 'pots', label: 'горшки', unit: 'шт.', kind: 'made', chain: 'stone', res: 'pots'},
  // ore and metal: each metal its own chain link
  {id: 'copperOre', label: 'медно-оловянная руда', unit: 'шт.', kind: 'base', chain: 'metal', res: 'bronzeOre'},
  {id: 'ironOre', label: 'железная руда', unit: 'шт.', kind: 'base', chain: 'metal', res: 'ironore'},
  {id: 'silverOre', label: 'серебряная руда', unit: 'шт.', kind: 'base', chain: 'metal', res: 'silverOre'},
  {id: 'mithrilOre', label: 'мифриловая руда', unit: 'шт.', kind: 'base', chain: 'metal', res: 'mithrilOre'},
  {id: 'bronze', label: 'бронза', unit: 'слитков', kind: 'made', chain: 'metal', res: 'bronze'},
  {id: 'iron', label: 'железо', unit: 'слитков', kind: 'made', chain: 'metal', res: 'iron'},
  {id: 'steel', label: 'сталь', unit: 'слитков', kind: 'made', chain: 'metal', res: 'steel'},
  {id: 'silver', label: 'серебро', unit: 'слитков', kind: 'made', chain: 'metal', buy: ['elves'], res: 'silverBar', note: 'эльфы серебро не добывают, только покупают: против нечисти у них святое дерево'},
  {id: 'mithril', label: 'мифрил', unit: 'слитков', kind: 'made', chain: 'metal', price: 40},
  {id: 'gems', label: 'самоцветы', unit: 'шт.', kind: 'base', chain: 'lux', res: 'gems'},
  {id: 'gold', label: 'золото', unit: 'зол.', kind: 'base', chain: 'lux', res: 'gold'},
  // tools, arms and armour: counted by worth (a piece is TOOLS[material].price); a tool serves TOOLS[material].days at work
  {id: 'tools', label: 'орудия', unit: 'зол. ценности', kind: 'made', chain: 'tools', start: 0.075, price: 1, note: 'топоры, кирки, серпы, пилы; каменные и костяные — своими руками на старте'},
  {id: 'arms', label: 'оружие', unit: 'зол. ценности', kind: 'made', chain: 'tools', price: 1, needOf: {orcs: 1}, note: 'орки ценят оружие, как прочие роскошь: оно им — нужда'},
  {id: 'armor', label: 'броня', unit: 'зол. ценности', kind: 'made', chain: 'tools', price: 1},
  // beasts and what they give
  {id: 'beasts', label: 'скот', unit: 'голов', kind: 'base', chain: 'beasts', get price() { return CAMPAIGN.beasts.mule; }, note: 'приплод стада: его забивают на бойне или продают'},
  {id: 'hide', label: 'шкуры', unit: 'шт.', kind: 'base', spoil: 0.004, chain: 'beasts', start: 0.083, res: 'hide'},
  {id: 'bone', label: 'кость', unit: 'шт.', kind: 'base', chain: 'beasts', start: 0.083, res: 'bone'},
  {id: 'waterskins', label: 'бурдюки', unit: 'шт.', kind: 'made', chain: 'herbs', price: 0.8, note: 'из кожи: орки льют в них зелья вместо горшков'},
  {id: 'leather', label: 'кожа', unit: 'шт.', kind: 'made', chain: 'beasts', res: 'leather'},
  {id: 'wool', label: 'шерсть', unit: 'шт.', kind: 'base', chain: 'beasts', res: 'wool'},
  // cloth and clothes
  {id: 'fiber', label: 'волокно', unit: 'шт.', kind: 'base', chain: 'cloth', start: 0.125, price: 0.5, note: 'лён и крапива: на ткань, сети и снасти'},
  {id: 'cloth', label: 'ткань', unit: 'шт.', kind: 'made', chain: 'cloth', res: 'cloth'},
  {id: 'clothes', label: 'одежда', unit: 'шт.', kind: 'made', chain: 'cloth', need: 0.333, price: 2, note: 'из шкур, кожи, ткани или шерсти: снашивается'},
  // herbs and healing
  {id: 'herbs', label: 'травы', unit: 'шт.', kind: 'base', spoil: 0.01, chain: 'herbs', start: 0.042, need: 0.133, res: 'herbs', note: 'лечат и дубят кожи'},
  {id: 'potions', needFrom: 2, label: 'зелья', unit: 'шт.', kind: 'made', chain: 'herbs', need: 0.033, res: 'potion'},
  // luxury
  // luxury is counted by what it is worth: a unit is a gold piece of value, so a gold-and-gems torque is many units, a carved
  // wooden box few; the stock holds its worth, and the people and the temples use up worth, not pieces
  {id: 'lux', needFrom: 2, label: 'роскошь', unit: 'зол. ценности', kind: 'made', chain: 'lux', need: 0.333, needOf: {orcs: 0}, price: 1, note: 'вина, украшения, стекло, резная утварь: считается по стоимости, её ценность — от сырья'},
]);
// gold for one unit of a good
export const goodPrice = id => { const G = TOWN_GOODS.get(id); return G.res ? PRICE[G.res].price * (G.per ?? 1) : G.price; };

// a tool by what it is made of: how many working days it serves, and its worth (a piece of the stock's tools, arms or armour)
export const TOOLS = {bone: {days: 40, price: 1}, bronze: {days: 70, price: 2}, ironwood: {days: 90, price: 2.5}, iron: {days: 100, price: 3},
  holywood: {days: 140, price: 5}, steel: {days: 160, price: 6}, mithril: {days: 300, price: 20}};
// (the uses of a tool are its days at work)
export const TOOL_USES = Object.fromEntries(Object.entries(TOOLS).map(([k, v]) => [k, v.days]));
// cycles of warmth or fire one unit of fuel brings (`heat`, `fire`): then the building takes the next unit
export const FUEL = {uses: 4};
// what a granary or a cellar keeps: the spoil of these goods × keep while one stands in the town
export const STORAGE = {granary: {goods: ['grain', 'flour', 'produce', 'mushrooms'], keep: 0.3}, cellar: {goods: ['meat', 'fish', 'milk', 'produce', 'food'], keep: 0.4}};
// a people that sells some goods as soon as it has them and buys another with the gold: the orcs, nomads and warriors,
// trade luxury, gems and silver for arms at `rate` of the worth
export const TRADE_UP = {orcs: {sells: ['lux', 'gems', 'silver'], buys: 'arms', rate: 0.8}};
// who gets the fuel first when there is not enough of it: warmth, then the kitchens, then the crafts, then the furnaces
export const FUEL_ORDER = ['heat', 'food', 'craft', 'metal'];

export const EFFECTS = {housing: 'жильё', food: 'еда', prod: 'ремесло', trade: 'торговля', defence: 'оборона', faith: 'вера', lore: 'знание', prestige: 'слава', health: 'здоровье'};

// Conditions of the place a building can ask for (atlas/towns.js placeHas)
export const PLACE_NEEDS = {
  water: 'река, озеро или море рядом', river: 'река', coast: 'морской берег', lake: 'озеро рядом',
  ore: 'железо, медь или серебро не хуже «есть»', gems: 'самоцветы', coal: 'уголь', magma: 'магма поблизости',
  precious: 'золото или серебро', placer: 'золотой песок', salt: 'солёное озеро или тёплый морской берег',
  clay: 'глина: пойма, глинистый сланец или известняк', stone: 'камень: склоны или скалы рядом',
  fertile: 'плодородная земля', forest: 'лес рядом', pasture: 'луга, степь или саванна рядом',
  steep: 'крутые склоны', flat: 'ровная земля', caves: 'пещеры: известняк или базальт', road: 'наезженная дорога',
  warm: 'тёплый климат', dry: 'степь, пустыня или саванна рядом', graves: 'курганы былых битв рядом',
};

const B = (id, name, g, cat, tier, peoples, fx, more = {}) => ({id, name, g, cat, tier, peoples, fx, max: 1, ...more});
const ALL = null, E = ['elves'], D = ['dwarves'], H = ['humans'], O = ['orcs'];
// upkeep, for short
const W = n => ({wood: n}), S = n => ({stone: n}), PL = n => ({planks: n}), HD = n => ({hide: n});

export const TOWN_BUILDINGS = new Registry('townBuilding');
TOWN_BUILDINGS.registerAll([
  // ── housing
  B('hut', 'шалаши', 'pl', 'housing', 0, ALL, {}, {max: 2, local: 'hut', house: 100, heat: 2.667, repair: W(0.25)}),
  B('yurts', 'шатры', 'pl', 'housing', 0, O, {}, {max: 8, house: 150, heat: 1.667, repair: HD(0.167)}),
  B('house', 'избы', 'pl', 'housing', 1, [...H], {}, {max: 6, needsAny: ['forest', 'clay'], local: 'house', house: 200, heat: 1.333, repair: PL(0.125)}),
  B('longhouse', 'длинный дом', 'm', 'housing', 1, [...H, ...O], {prestige: 0.03}, {max: 4, needs: ['forest'], house: 250, heat: 1.667, repair: W(0.25)}),
  B('treehouse', 'дома на деревьях', 'pl', 'housing', 1, E, {}, {max: 8, needs: ['forest'], house: 300, heat: 0.667, repair: W(0.083)}),
  B('hallhomes', 'подгорные жилища', 'pl', 'housing', 1, D, {defence: 0.05}, {max: 8, needsAny: ['steep', 'caves'], house: 400, heat: 0.833, repair: S(0.083)}),
  B('stonehouse', 'каменные дома', 'pl', 'housing', 2, [...H, ...D], {defence: 0.03}, {max: 8, needs: ['stone'], requires: ['quarry'], house: 400, heat: 1.667, repair: S(0.125)}),
  B('barracks', 'казармы', 'pl', 'housing', 2, [...H, ...D, ...O], {defence: 0.25}, {requiresAny: ['armory', 'warcamp'], house: 100, jobs: 30, heat: 0.667, repair: W(0.083), in: {arms: 0.15, armor: 0.125}}),
  // ── food: the land gives it raw, the hearth, the bakery, the smokehouse and the racks make it food
  B('garden', 'огороды', 'pl', 'food', 0, ALL, {food: 0.15}, {max: 3, needs: ['fertile'], local: 'garden', site: true, jobs: 15, tools: 2, repair: W(0.025), out: {produce: 116.645, herbs: 0.839}}),
  B('field', 'пашни', 'pl', 'food', 0, [...H, ...O], {food: 0.3}, {max: 4, needs: ['fertile', 'flat'], local: 'field', site: true, jobs: 30, tools: 4, repair: W(0.042), out: {grain: 132.613, fiber: 0.076}}),
  B('grove', 'плодовые рощи', 'pl', 'food', 1, E, {food: 0.3}, {max: 4, needsAny: ['forest', 'fertile'], site: true, jobs: 12, tools: 1, out: {produce: 67.788, wood: 0.222}}),
  B('mushrooms', 'грибные пещеры', 'pl', 'food', 1, D, {food: 0.3}, {max: 4, needsAny: ['caves', 'steep'], site: true, jobs: 15, tools: 1, out: {mushrooms: 55.996}}),
  // the herd is fed raw food (TOWN_WORKS); milk comes from its head, the increase goes to the slaughterhouse
  B('pen', 'загоны', 'pl', 'food', 0, [...H, ...D, ...O], {food: 0.15}, {max: 2, needs: ['pasture'], local: 'pen', site: true, jobs: 8, herd: 20, repair: W(0.042), works: true}),
  B('pasture', 'выгоны и стада', 'pl', 'food', 1, [...H, ...O], {food: 0.25, prod: 0.05}, {max: 3, needs: ['pasture'], site: true, jobs: 15, herd: 40, repair: W(0.067), works: true}),
  B('slaughter', 'бойня', 'f', 'food', 0, [...H, ...D, ...O], {food: 0.15, prod: 0.05}, {requiresAny: ['pen', 'pasture'], jobs: 6, tools: 2, repair: W(0.042), in: {beasts: 0.083}, out: {meat: 19.13, hide: 1.955, bone: 0.411, wool: 1.445}}),
  B('lodge', 'охотничий навес', 'm', 'food', 0, ALL, {food: 0.1}, {needsAny: ['forest', 'pasture'], local: 'lodge', site: true, jobs: 10, repair: W(0.042), in: {arms: 0.1}, out: {meat: 19.27, hide: 0.813, bone: 0.167, wool: 0.078}}),
  B('fishhut', 'рыбацкие хижины', 'pl', 'food', 0, ALL, {food: 0.15}, {max: 2, needs: ['water'], local: 'fishhut', site: true, jobs: 10, tools: 1, repair: W(0.042), works: true}),
  B('pier', 'рыбная пристань', 'f', 'food', 1, [...H, ...E], {food: 0.25, trade: 0.05}, {needsAny: ['coast', 'lake'], site: true, jobs: 20, tools: 2, repair: PL(0.125), works: true}),
  B('quern', 'ручные жернова', 'pl', 'food', 0, [...H, ...D, ...O], {food: 0.05}, {local: 'quern', jobs: 2, tools: 1, repair: S(0.017), works: true}),
  B('watermill', 'водяная мельница', 'f', 'food', 2, [...H, ...D], {food: 0.2, prod: 0.1}, {needs: ['river'], requiresAny: ['field', 'garden', 'mushrooms'], site: true, jobs: 4, tools: 2, repair: W(0.083), works: true}),
  B('windmill', 'ветряная мельница', 'f', 'food', 2, H, {food: 0.15}, {needs: ['flat'], requires: ['field'], site: true, jobs: 4, tools: 1, repair: W(0.083), in: {grain: 40}, out: {flour: 908564.365}}),
  B('bakery', 'пекарня', 'f', 'food', 2, [...H, ...D], {food: 0.1, health: 0.05}, {requiresAny: ['watermill', 'windmill'], jobs: 4, tools: 1, repair: S(0.042), in: {flour: 60}, fire: 1, out: {food: 143.284}}),
  B('smokehouse', 'коптильня', 'f', 'food', 1, ALL, {food: 0.1}, {requiresAny: ['lodge', 'fishhut', 'pen', 'slaughter'], local: 'smokehouse', jobs: 3, tools: 1, repair: W(0.042), works: true}),
  B('dryrack', 'вешала и бочки', 'pl', 'food', 0, ALL, {food: 0.05}, {local: 'dryrack', jobs: 2, repair: W(0.025), works: true}),
  B('granary', 'амбар', 'm', 'food', 0, ALL, {food: 0.15}, {local: 'granary', jobs: 1, repair: W(0.042)}),
  B('cellar', 'погреба и ледники', 'pl', 'food', 2, [...H, ...D], {food: 0.1, health: 0.05}, {jobs: 1, repair: S(0.042)}),
  B('apiary', 'пасека', 'f', 'food', 1, [...H, ...E], {food: 0.05, prod: 0.05}, {needsAny: ['forest', 'fertile'], needs: ['warm'], site: true, jobs: 2, tools: 1, repair: W(0.017), out: {honey: 0.695}}),
  B('brewery', 'пивоварня', 'f', 'food', 2, [...H, ...D, ...O, ...E], {prod: 0.1, prestige: 0.05}, {requiresAny: ['field', 'garden', 'mushrooms'], jobs: 4, tools: 1, repair: W(0.042), works: true}),
  B('vineyard', 'виноградники', 'pl', 'food', 2, [...H, ...E], {trade: 0.15, prestige: 0.05}, {needs: ['warm', 'fertile'], site: true, jobs: 10, tools: 2, repair: W(0.025), out: {lux: 9.842}}),
  // ── raw materials
  B('woodcut', 'лесосека', 'f', 'raw', 0, [...H, ...D, ...O], {prod: 0.1}, {needs: ['forest'], site: true, jobs: 8, tools: 2, out: {wood: 3.48}}),
  // elves do not fell the wood: they take what it gives — deadwood and brushwood, hides, herbs, honey and wax
  B('forestry', 'лесной промысел', 'm', 'raw', 0, E, {prod: 0.15, trade: 0.05}, {needs: ['forest'], site: true, jobs: 6, tools: 1, out: {wood: 2.232, coal: 6.336, hide: 0.041, herbs: 0.233, honey: 0.252, fiber: 1.032}}),
  // the elves' own: boards split and dressed from deadfall and the trees the grove gives up, no saw-pit
  B('timberyard', 'заготовка брёвен', 'f', 'raw', 1, E, {prod: 0.1}, {needs: ['forest'], site: true, jobs: 4, tools: 2, in: {wood: 1}, out: {planks: 0.478}}),
  B('sawmill', 'лесопилка', 'f', 'raw', 1, [...H, ...O], {prod: 0.15}, {needs: ['forest'], local: 'sawmill', site: true, jobs: 4, tools: 2, repair: W(0.042), in: {wood: 1.333}, out: {planks: 4.312}}),
  B('quarry', 'каменоломня', 'f', 'raw', 0, [...H, ...D], {prod: 0.1}, {needs: ['stone'], local: 'quarry', site: true, jobs: 8, tools: 3, out: {stone: 1.513}}),
  B('claypit', 'глиняный карьер', 'm', 'raw', 0, [...H, ...D, ...O], {prod: 0.05}, {needs: ['clay'], site: true, jobs: 4, tools: 1, out: {clay: 0.335}}),
  // which ore a mine gives is the place's geology (atlas/geology.js): the numbers are a shaft where all of them lie
  B('mineshaft', 'рудник', 'm', 'raw', 0, [...H, ...D, ...O], {prod: 0.25, trade: 0.1}, {needs: ['ore'], local: 'mineshaft', notable: true, site: true, jobs: 12, tools: 5, repair: W(0.333), out: {ironOre: 0.366, copperOre: 0.828, silverOre: 0.167, gems: 0.035}}),
  B('deepmine', 'глубокие шахты', 'pl', 'raw', 2, D, {prod: 0.3, trade: 0.15}, {needsAny: ['ore', 'gems', 'precious'], requires: ['mineshaft'], site: true, jobs: 20, tools: 8, repair: W(0.5), out: {ironOre: 0.747, copperOre: 0.113, silverOre: 0.5, mithrilOre: 0.033, gems: 0.141}}),
  B('charpit', 'углежогная яма', 'f', 'raw', 1, [...H, ...D, ...O], {prod: 0.05}, {needs: ['forest'], local: 'charpit', site: true, jobs: 3, tools: 1, in: {wood: 1.667}, out: {coal: 16.222}}),
  B('coalpit', 'угольные копи', 'pl', 'raw', 1, [...H, ...D], {prod: 0.15}, {needs: ['coal'], site: true, jobs: 8, tools: 2, repair: W(0.167), out: {coal: 11.612}}),
  B('saltworks', 'солеварня', 'f', 'raw', 1, [...H, ...D], {trade: 0.2, food: 0.05}, {needs: ['salt'], site: true, jobs: 5, tools: 1, repair: W(0.042), fire: 1, out: {salt: 1.667}}),
  // the elves' own salt: crusts gathered where a salty spring comes up — no fire, little salt
  B('saltspring', 'соляной ручей', 'm', 'raw', 1, E, {food: 0.03}, {needs: ['salt'], site: true, jobs: 2, tools: 1, out: {salt: 0.333}}),
  B('placer', 'золотой прииск', 'm', 'raw', 1, [...H, ...D, ...O], {trade: 0.2}, {needs: ['placer'], notable: true, site: true, jobs: 6, tools: 2, repair: W(0.042), out: {gold: 0.701}}),
  // ── crafts
  B('loom', 'ткацкая', 'f', 'craft', 1, ALL, {prod: 0.1}, {local: 'loom', jobs: 4, tools: 1, repair: W(0.025), works: true}),
  B('tailor', 'портняжная', 'f', 'craft', 0, ALL, {prod: 0.05, health: 0.05}, {max: 2, jobs: 4, tools: 1, repair: W(0.025), works: true}),
  B('potter', 'гончарня', 'f', 'craft', 1, [...H, ...D, ...E], {prod: 0.05}, {needs: ['clay'], local: 'potter', jobs: 3, tools: 1, repair: S(0.017), in: {clay: 0.5}, fire: 0.667, out: {pots: 2.203}}),
  B('tannery', 'дубильня', 'f', 'craft', 1, [...H, ...D, ...O], {prod: 0.1}, {requiresAny: ['lodge', 'pen', 'pasture'], local: 'tannery', jobs: 3, tools: 1, repair: W(0.025), in: {hide: 0.5, herbs: 0.083}, out: {leather: 0.785}}),
  B('crafthut', 'мастерская ремесленника', 'f', 'craft', 1, ALL, {prod: 0.1}, {local: 'crafthut', jobs: 4, repair: W(0.025), works: true}),
  // the furnace melts what the place has (TOWN_WORKS): copper-tin ore to bronze, iron ore to bloom iron, silver ore to silver;
  // and casts bronze tools
  B('smelter', 'плавильный горн', 'm', 'craft', 1, [...H, ...D, ...O], {prod: 0.15}, {requires: ['mineshaft'], local: 'smelter', jobs: 4, tools: 1, repair: S(0.042), works: true, metals: ['bronze']}),
  B('forge', 'кузня', 'f', 'craft', 1, [...H, ...D, ...O], {prod: 0.2, defence: 0.1}, {requires: ['smelter'], local: 'forge', notable: true, jobs: 4, tools: 1, repair: S(0.042), quality: 'iron', in: {iron: 0.417, leather: 0.083}, fire: 0.833, out: {tools: 1.048, arms: 8.56, armor: 0.328}, metals: ['iron']}),
  B('foundry', 'литейня', 'f', 'craft', 2, [...H, ...D], {prod: 0.25, trade: 0.1}, {requires: ['forge'], pop: 800, jobs: 10, tools: 2, repair: S(0.083), works: true, metals: ['steel']}),
  B('magmaforge', 'магмовая кузня', 'f', 'craft', 2, D, {prod: 0.35, prestige: 0.2, defence: 0.1}, {needs: ['magma'], requires: ['forge'], local: 'magmaforge', pop: 800, jobs: 6, tools: 1, repair: S(0.083), works: true, metals: ['mithril', 'steel']}),
  // fine work of any two of wood, stone, gems and the metals (TOWN_WORKS, LUX): its worth is that of what went into it
  B('jeweler', 'мастерская роскоши', 'f', 'craft', 2, [...H, ...D, ...E], {prod: 0.1, trade: 0.2, prestige: 0.1}, {local: 'jeweler', jobs: 3, tools: 1, repair: W(0.025), works: true, metals: ['silver']}),
  B('armory', 'оружейная', 'f', 'craft', 2, ALL, {defence: 0.2}, {requiresAny: ['crafthut', 'forge'], local: 'armory', jobs: 2, repair: W(0.042)}),
  B('bowyer', 'мастерская луков', 'f', 'craft', 1, [...E, ...H], {defence: 0.15}, {needs: ['forest'], jobs: 3, tools: 1, repair: W(0.025), works: true}),
  B('shipyard', 'верфь', 'f', 'craft', 2, [...H, ...E], {trade: 0.25, prod: 0.1}, {needs: ['coast', 'forest'], jobs: 15, tools: 3, repair: W(0.083), in: {planks: 1.667, fiber: 0.333, cloth: 0.25}}),
  B('glassworks', 'стеклодувня', 'f', 'craft', 2, [...H, ...D], {prod: 0.1, trade: 0.1, prestige: 0.05}, {needsAny: ['coast', 'clay'], pop: 800, jobs: 5, tools: 1, repair: S(0.042), in: {clay: 0.5}, fire: 2, out: {lux: 19.435}}),
  B('alchemist', 'лаборатория алхимика', 'f', 'craft', 2, [...H, ...E, ...D], {lore: 0.15, health: 0.1}, {pop: 800, jobs: 2, tools: 1, repair: S(0.025), in: {herbs: 0.333, pots: 0.167}, fire: 0.333, out: {potions: 0.485}}),
  // kitchens, one for each step of a town: they cook whatever raw food there is (TOWN_WORKS, KITCHENS); a bigger one
  // cooks more and wastes less — the campfire turns 10 raw into 8 food, the common hearth 20 into 20, the cookhouse 60 into 72
  B('campfire', 'кострище', 'n', 'life', 0, ALL, {health: 0.02}, {max: 4, jobs: 2, works: true}),
  B('hearth', 'общинный очаг', 'm', 'life', 1, ALL, {health: 0.05}, {max: 3, local: 'hearth', jobs: 3, repair: S(0.017), works: true}),
  B('cookhouse', 'поварня', 'f', 'life', 2, ALL, {health: 0.1, food: 0.05}, {max: 3, requires: ['hearth'], jobs: 6, tools: 1, repair: S(0.042), works: true}),
  // ── trade and ways
  B('ferry', 'перевоз', 'm', 'trade', 0, [...H, ...E, ...O], {trade: 0.05}, {needs: ['river'], jobs: 2, repair: W(0.042), out: {gold: 0.37}}),
  B('bridge', 'мост', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, {needs: ['river'], requires: ['quarry'], repair: S(0.083)}),
  B('inn', 'постоялый двор', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, {needs: ['road'], jobs: 3, heat: 0.333, repair: W(0.042), in: {food: 4, drink: 0.833}, out: {gold: 0.212}}),
  B('toll', 'дорожная застава', 'f', 'trade', 1, [...H, ...D, ...O], {trade: 0.05, defence: 0.05}, {needs: ['road'], jobs: 3, repair: W(0.025), out: {gold: 0.14}}),
  B('market', 'рынок', 'm', 'trade', 1, ALL, {trade: 0.3, prestige: 0.05}, {jobs: 4, repair: W(0.042)}),
  B('warehouse', 'торговые склады', 'pl', 'trade', 2, [...H, ...D], {trade: 0.15}, {requires: ['market'], jobs: 2, repair: W(0.042)}),
  B('caravanserai', 'караван-сарай', 'm', 'trade', 2, [...H, ...O], {trade: 0.25}, {needs: ['road', 'dry'], jobs: 4, repair: S(0.042), in: {food: 12}, out: {gold: 0.002}}),
  // the harbour opens the sea lanes (atlas/sea.js): traffic to other harbours, faster than any road
  B('harbor', 'гавань', 'f', 'trade', 2, [...H, ...E], {trade: 0.35}, {needs: ['coast'], requiresAny: ['pier', 'shipyard'], notable: true, jobs: 10, repair: PL(0.167), out: {gold: 2.21}}),
  B('lighthouse', 'маяк', 'm', 'trade', 1, [...H, ...E], {trade: 0.1, defence: 0.05}, {needs: ['coast'], requiresAny: ['pier', 'fishhut'], jobs: 1, repair: S(0.025), fire: 0.667}),
  B('riverpier', 'речная пристань', 'f', 'trade', 1, [...H, ...E, ...O], {trade: 0.1, food: 0.05}, {needs: ['river'], requiresAny: ['ferry', 'fishhut'], jobs: 4, repair: PL(0.05), in: {fiber: 0.042}, out: {fish: 0.45, gold: 0.37}}),
  B('mint', 'монетный двор', 'm', 'trade', 2, [...H, ...D], {trade: 0.2, prestige: 0.15}, {needs: ['precious'], requires: ['market'], pop: 800, capital: true, jobs: 4, tools: 1, repair: S(0.042), works: true}),
  // ── defence
  B('palisade', 'частокол', 'm', 'defence', 1, [...H, ...E, ...O], {defence: 0.25}, {needs: ['forest'], local: 'palisade', repair: W(0.333)}),
  B('watchtower', 'сторожевая вышка', 'f', 'defence', 1, ALL, {defence: 0.15}, {local: 'watchtower', jobs: 2, repair: W(0.042)}),
  B('hiddenpaths', 'тайные тропы', 'pl', 'defence', 1, E, {defence: 0.35}, {needs: ['forest'], jobs: 3}),
  B('warcamp', 'боевой стан', 'm', 'defence', 1, O, {defence: 0.3, prestige: 0.1}, {jobs: 30, repair: HD(0.083), in: {arms: 0.2, armor: 0.125}}),
  B('earthwall', 'земляной вал', 'm', 'defence', 1, O, {defence: 0.3}, {requires: ['warcamp'], repair: {clay: 0.1}}),
  B('stonewall', 'каменные стены', 'pl', 'defence', 1, [...H, ...D], {defence: 0.5}, {needs: ['stone'], requires: ['quarry'], repair: S(0.25)}),
  B('tunnels', 'подземные ходы', 'pl', 'defence', 1, D, {defence: 0.2, trade: 0.1}, {needsAny: ['steep', 'caves'], jobs: 2, repair: W(0.083)}),
  B('tower', 'крепостные башни', 'pl', 'defence', 2, [...H, ...D], {defence: 0.3}, {requires: ['stonewall'], jobs: 10, repair: S(0.125), in: {arms: 0.1}}),
  B('citadel', 'цитадель', 'f', 'defence', 2, [...H, ...D], {defence: 0.6, prestige: 0.2}, {requires: ['tower'], pop: 800, jobs: 40, repair: S(0.333), in: {arms: 0.3, armor: 0.375}}),
  // ── faith
  B('shrine', 'святилище', 'n', 'faith', 0, ALL, {faith: 0.15}, {local: 'shrine', jobs: 1, repair: W(0.017), works: true}),
  B('shamanhut', 'хижина шамана', 'f', 'faith', 0, O, {faith: 0.15, health: 0.1}, {jobs: 1, repair: HD(0.017), in: {herbs: 0.125}}),
  B('sacredgrove', 'священная роща', 'f', 'faith', 0, E, {faith: 0.3}, {needs: ['forest'], jobs: 2}),
  B('stonecircle', 'каменный круг', 'm', 'faith', 0, [...H, ...O], {faith: 0.2}, {needsAny: ['stone', 'steep']}),
  B('ancestorhall', 'зал предков', 'm', 'faith', 1, D, {faith: 0.3, prestige: 0.1}, {requires: ['shrine'], jobs: 2, repair: S(0.042), works: true}),
  B('temple', 'храм', 'm', 'faith', 1, [...H, ...E, ...D], {faith: 0.3, prestige: 0.1}, {requires: ['shrine'], jobs: 4, repair: S(0.083), works: true}),
  B('crypt', 'усыпальница', 'f', 'faith', 2, [...H, ...D], {faith: 0.1}, {jobs: 1, repair: S(0.042)}),
  // by the barrows of old battles: the fallen are laid to rest, and the rot around fades (atlas/lairs.js stepRot)
  B('fallentemple', 'храм павших', 'm', 'faith', 1, ALL, {faith: 0.25, health: 0.05}, {needs: ['graves'], requires: ['shrine'], notable: true, jobs: 3, repair: S(0.042), works: true}),
  B('catacombs', 'катакомбы', 'pl', 'faith', 2, D, {faith: 0.1, health: 0.05}, {needs: ['caves'], requires: ['ancestorhall'], house: 100, jobs: 1, repair: S(0.042)}),
  B('cemetery', 'кладбище', 'n', 'faith', 1, ALL, {faith: 0.05, health: 0.05}, {jobs: 1}),
  // ── lore
  B('school', 'школа', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.15}, {jobs: 3, heat: 0.333, repair: W(0.042), in: {cloth: 0.042}}),
  B('library', 'библиотека', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.3, prestige: 0.1}, {requires: ['school'], pop: 800, jobs: 4, heat: 0.333, repair: S(0.042), in: {lux: 0.167}}),
  // the wards of a mage tower hold the dead off (atlas/lairs.js: the undead's raids on it fail oftener, the rot around fades)
  B('magetower', 'башня мага', 'f', 'lore', 2, [...H, ...E], {lore: 0.3, defence: 0.15, prestige: 0.15}, {pop: 800, notable: true, jobs: 3, repair: S(0.042), in: {potions: 0.042, lux: 0.167}}),
  // ── power and fame
  B('eldershall', 'дом старейшин', 'm', 'power', 0, ALL, {prestige: 0.1}, {jobs: 2, heat: 0.333, repair: W(0.042)}),
  B('townhall', 'ратуша', 'f', 'power', 2, [...H, ...D], {prestige: 0.2, trade: 0.05}, {requires: ['eldershall'], jobs: 6, heat: 0.5, repair: S(0.083)}),
  B('palace', 'дворец', 'm', 'power', 2, [...H, ...E], {prestige: 0.4}, {requiresAny: ['townhall', 'eldershall'], pop: 800, capital: true, jobs: 20, heat: 1.333, repair: S(0.167), in: {lux: 0.833, food: 10}}),
  B('arena', 'бойцовская яма', 'f', 'power', 2, [...O, ...H], {prestige: 0.15, defence: 0.05}, {jobs: 4, repair: W(0.042), in: {food: 5, drink: 0.833}}),
  B('monument', 'памятник', 'm', 'power', 2, ALL, {prestige: 0.15}, {pop: 800, repair: S(0.167)}),
  // the throne hall crowns a people's seat: one per realm, only its capital builds it (data/peoples.js CAPITAL)
  B('throne', 'тронный зал', 'm', 'power', 2, ALL, {prestige: 0.3, trade: 0.1, defence: 0.1}, {pop: 800, capital: true, unique: true, requiresAny: ['eldershall', 'townhall', 'ancestorhall', 'warcamp'], notable: true, jobs: 10, heat: 1, repair: S(0.083), works: true}),
  // ── life and health
  B('well', 'колодец', 'm', 'life', 1, ALL, {health: 0.1}, {local: 'well', repair: S(0.017)}),
  B('healerhut', 'хижина лекаря', 'f', 'life', 1, ALL, {health: 0.15}, {local: 'healerhut', jobs: 2, repair: W(0.025), works: true}),
  B('hospice', 'лечебница', 'f', 'life', 2, [...H, ...E], {health: 0.25}, {requires: ['healerhut'], jobs: 6, heat: 0.5, repair: W(0.042), in: {herbs: 0.333, cloth: 0.083}}),
  B('bathhouse', 'баня', 'f', 'life', 2, [...H, ...D], {health: 0.15}, {needs: ['water'], jobs: 3, repair: W(0.042), fire: 1.333}),
  B('aqueduct', 'акведук', 'm', 'life', 2, H, {health: 0.2}, {needs: ['stone'], requires: ['well'], pop: 800, house: 100, jobs: 2, repair: S(0.167)}),
]);

// The ways of work of the buildings marked `works: true`: one row a way, {at, label, in, out, quality, fire, peoples} —
// `peoples`: only these peoples work it this way (the elves' wooden weapons, the dwarves' rites); none — anyone. A building
// works the ways it has the makings for; how it shares its hands between them is the towns' flow step (docs/WORLD.md).
const r3 = v => Math.round(v * 1000) / 1000;
// the kitchens of the three steps of a town: raw food a day (rations) at full strength, cycles of fire for it, food out of a unit of raw
export const KITCHENS = {campfire: {raw: 35.821, fire: 0.956, yield: 0.8}, hearth: {raw: 95.522, fire: 1.672, yield: 1}, cookhouse: {raw: 286.567, fire: 3.343, yield: 1.2}};
const DISHES = {flour: 'лепёшки', grain: 'каша', produce: 'похлёбка из овощей', mushrooms: 'грибная похлёбка', meat: 'мясная похлёбка', fish: 'уха', milk: 'сыр и творог'};
// fine work of the luxury workshop: how much of each material a day goes into it (any two of them make a way), and how
// much more the piece is worth than its makings
export const LUX = {markup: 1.5, take: {wood: 0.75, stone: 0.75, gems: 0.075, bronze: 0.15, iron: 0.15, steel: 0.1, silver: 0.1, gold: 0.75, mithril: 0.025}};
const LUX_WORDS = {wood: 'дерево', stone: 'камень', gems: 'самоцветы', bronze: 'бронза', iron: 'железо', steel: 'сталь', silver: 'серебро', gold: 'золото', mithril: 'мифрил'};
function luxWays() {
  const ids = Object.keys(LUX.take), out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    // (the worth follows the prices until the table «Переделы построек» sets it by hand)
    let set = null;
    out.push(WK('jeweler', `${a}-${b}`, `${LUX_WORDS[a]} и ${LUX_WORDS[b]}`, {[a]: LUX.take[a], [b]: LUX.take[b]},
      {get lux() { return set ?? r3((goodPrice(a) * LUX.take[a] + goodPrice(b) * LUX.take[b]) * LUX.markup); }, set lux(v) { set = v; }}));
  }
  return out;
}
// a rite of so much worth a day in one good: the amount follows its price, the dearer the less (until set by hand)
export const RITE_WORTH = {fallentemple: 0.17};
function worthWay(at, id, label, good, worth, more = {}) {
  let set = null;
  return WK(at, id, label, {get [good]() { return set ?? r3(worth() / goodPrice(good)); }, set [good](v) { set = v; }}, {}, more);
}
// the mint: what goes into a day of coin, and how much more the coin is worth
export const MINT = {markup: 1.6, take: {gold: 0.83, silver: 0.25, gems: 0.21}};
const WK = (at, id, label, inn, out, more = {}) => ({id: `${at}.${id}`, at, label, in: inn, out, ...more});
export const TOWN_WORKS = new Registry('townWork');
TOWN_WORKS.registerAll([
  // the herd eats raw food and gives milk by its head; the increase (beasts) goes to the slaughterhouse
  WK('pen', 'grain', 'кормят зерном', {grain: 5}, {milk: 28.472, beasts: 0.087}),
  WK('pen', 'produce', 'кормят овощами', {produce: 5}, {milk: 28.472, beasts: 0.087}),
  WK('pasture', 'grain', 'кормят зерном', {grain: 8}, {milk: 19.282, beasts: 0.126}),
  WK('pasture', 'produce', 'кормят овощами', {produce: 8}, {milk: 19.282, beasts: 0.126}),
  // the kitchens: raw to ready, any raw (KITCHENS: how much each cooks a day and how much food a unit of raw gives)
  ...Object.entries(KITCHENS).flatMap(([at, K]) => Object.entries(DISHES).map(([raw, dish]) =>
    WK(at, raw, dish, {[raw]: K.raw}, {food: r3(K.raw * K.yield * (raw === 'milk' ? 0.9 : 1))}, {fire: r3(K.fire * (raw === 'milk' ? 0.5 : 1))}))),
  // milling and brewing: grain, or the dwarves' mushrooms
  WK('quern', 'grain', 'мука из зерна', {grain: 12}, {flour: 334.259}),
  WK('quern', 'mushrooms', 'грибная мука', {mushrooms: 14}, {flour: 334.259}),
  WK('quern', 'bone', 'костяная мука', {bone: 0.3}, {flour: 668.345}, {peoples: O}),
  WK('watermill', 'grain', 'мука из зерна', {grain: 60}, {flour: 618.6}),
  WK('watermill', 'mushrooms', 'грибная мука', {mushrooms: 70}, {flour: 618.6}),
  WK('brewery', 'grain', 'пиво и брага', {grain: 20}, {drink: 17.328}, {fire: 0.333}),
  WK('brewery', 'mushrooms', 'грибное пиво', {mushrooms: 25}, {drink: 15.161}, {fire: 0.333}),
  WK('brewery', 'produce', 'плодовая брага', {produce: 25}, {drink: 15.161}, {fire: 0.25}),
  // fishing: nets of fibre, lines of wool, or hooks of bone — whatever the town has
  WK('fishhut', 'nets', 'сети', {fiber: 0.167}, {fish: 2.106}),
  WK('fishhut', 'lines', 'шерстяные лески', {wool: 0.2}, {fish: 1.755}),
  WK('fishhut', 'hooks', 'костяные крючки', {bone: 0.2}, {fish: 1.405}),
  WK('pier', 'nets', 'сети', {fiber: 0.25}, {fish: 6.3}),
  WK('pier', 'lines', 'шерстяные лески', {wool: 0.3}, {fish: 5.4}),
  // home brew in the kitchens of the hamlets and villages: little of it, from grain or from fruit
  ...['campfire', 'hearth'].flatMap(at => [WK(at, 'brewGrain', 'домашняя брага из зерна', {grain: 2}, {drink: 0.5}, {fire: 0.1}), WK(at, 'brewFruit', 'домашняя брага из плодов', {produce: 2}, {drink: 0.5}, {fire: 0.1})]),
  // the healer pours into pots, or the orcs into waterskins
  WK('healerhut', 'pots', 'зелья в горшках', {herbs: 0.167, pots: 0.083}, {potions: 0.243}),
  WK('healerhut', 'skins', 'зелья в бурдюках', {herbs: 0.167, waterskins: 0.083}, {potions: 0.243}),
  WK('tailor', 'waterskins', 'бурдюки', {leather: 0.15}, {waterskins: 0.15}, {peoples: O}),
  // the throne hall: luxury for the courts, arms for the orcs' warlord
  WK('throne', 'lux', 'роскошь двора', {lux: 1.25}, {}),
  WK('throne', 'arms', 'оружие вождя', {arms: 1.25}, {}, {peoples: O}),
  // tools and arms: of bone and leather anyone; the elves of ironwood and the sacred tree, no leather, no iron
  WK('crafthut', 'bone', 'костяные орудия и оружие', {wood: 0.333, bone: 0.167, leather: 0.167}, {tools: 0.409, arms: 2.262}, {quality: 'bone'}),
  WK('crafthut', 'ironwood', 'орудия и оружие из железного дерева', {wood: 0.5, bone: 0.083, fiber: 0.083}, {tools: 1.197, arms: 0.05}, {quality: 'ironwood', peoples: E}),
  WK('bowyer', 'leather', 'луки и стрелы', {wood: 0.25, leather: 0.067}, {arms: 0.066}, {quality: 'bone'}),
  WK('bowyer', 'ironwood', 'луки из железного дерева', {wood: 0.333, fiber: 0.067}, {arms: 0.085}, {quality: 'ironwood', peoples: E}),
  WK('bowyer', 'holywood', 'луки и клинки святого дерева', {wood: 0.167, fiber: 0.042, herbs: 0.083}, {arms: 0.067}, {quality: 'holywood', peoples: E}),
  // fine work: any two materials; worth = their price × LUX.markup (a getter, so an edit of a price reaches it)
  ...luxWays(),
  // rites: honey and wax for most; the dwarves give their gods gems, metal and fine work of metal, stone and gems
  WK('shrine', 'honey', 'свечи и мёд', {honey: 0.042}, {}),
  WK('shrine', 'arms', 'оружие в дар', {arms: 0.1}, {}, {peoples: O}),
  WK('shrine', 'gems', 'самоцветы в дар', {gems: 0.017}, {}, {peoples: D}),
  WK('shrine', 'metal', 'железо в дар', {iron: 0.042}, {}, {peoples: D}),
  WK('shrine', 'lux', 'изделия в дар', {lux: 0.083}, {}, {peoples: D}),
  WK('ancestorhall', 'gems', 'самоцветы предкам', {gems: 0.025}, {}),
  WK('ancestorhall', 'metal', 'серебро предкам', {silver: 0.025}, {}),
  WK('ancestorhall', 'lux', 'изделия предкам', {lux: 0.083}, {}),
  WK('temple', 'honey', 'свечи, мёд и утварь', {honey: 0.125, lux: 0.083}, {}),
  WK('temple', 'gems', 'самоцветы и утварь', {gems: 0.042, lux: 0.083}, {}, {peoples: D}),
  WK('temple', 'metal', 'серебро и утварь', {silver: 0.042, lux: 0.083}, {}, {peoples: D}),
  WK('fallentemple', 'honey', 'свечи и мёд павшим', {honey: 0.083}, {}),
  WK('fallentemple', 'gems', 'самоцветы павшим', {gems: 0.025}, {}, {peoples: D}),
  // any metal to the fallen, by worth: the dearer the metal, the less of it a rite takes (RITE_WORTH)
  ...['bronze', 'iron', 'steel', 'silver', 'gold', 'mithril'].map(m => worthWay('fallentemple', m, `${LUX_WORDS[m]} павшим`, m, () => RITE_WORTH.fallentemple)),
  // the mint strikes coin of gold, of silver or of gems, worth more than what went in (MINT)
  ...Object.entries(MINT.take).map(([g, n]) => {
    let set = null;
    return WK('mint', g, `монета из: ${LUX_WORDS[g]}`, {[g]: n}, {get gold() { return set ?? r3(goodPrice(g) * n * MINT.markup); }, set gold(v) { set = v; }});
  }),
  WK('smokehouse', 'meat', 'копчёное мясо', {meat: 20}, {stores: 20}, {fire: 0.5}),
  WK('smokehouse', 'fish', 'копчёная рыба', {fish: 20}, {stores: 20}, {fire: 0.5}),
  WK('dryrack', 'meat', 'солонина', {meat: 12, salt: 0.05}, {stores: 12}),
  WK('dryrack', 'fish', 'солёная рыба', {fish: 12, salt: 0.05}, {stores: 12}),
  WK('dryrack', 'produce', 'соленья и сушка', {produce: 12, salt: 0.033}, {stores: 12}),
  // cloth and clothes
  WK('loom', 'fiber', 'льняная ткань', {fiber: 1}, {cloth: 0.245}),
  WK('loom', 'wool', 'сукно', {wool: 1}, {cloth: 0.245}),
  WK('tailor', 'hide', 'одежда из шкур', {hide: 0.25}, {clothes: 0.973}),
  WK('tailor', 'leather', 'кожаная одежда', {leather: 0.167}, {clothes: 0.973}),
  WK('tailor', 'cloth', 'одежда из ткани', {cloth: 0.167}, {clothes: 0.973}),
  WK('tailor', 'wool', 'вязаная шерсть', {wool: 0.333}, {clothes: 0.973}),
  // metal: the furnace melts what the place has and casts bronze; the foundry makes steel of iron; the magma forge mithril
  WK('smelter', 'bronze', 'бронза из медно-оловянной руды', {copperOre: 1}, {bronze: 0.065}, {fire: 1.333}),
  WK('smelter', 'iron', 'кричное железо', {ironOre: 1}, {iron: 1.362}, {fire: 2.667}),
  WK('smelter', 'silver', 'серебро из руды', {silverOre: 0.5}, {silver: 0.167}, {fire: 0.667}),
  WK('smelter', 'cast', 'литьё: бронзовые орудия и оружие', {bronze: 0.25}, {tools: 0.697, arms: 4.569}, {quality: 'bronze', fire: 0.333}),
  WK('foundry', 'steel', 'сталь из железа', {iron: 0.5}, {steel: 0.04}, {fire: 2}),
  WK('foundry', 'forge', 'стальные орудия, оружие и броня', {steel: 0.333, leather: 0.083}, {tools: 1.067, arms: 0.098, armor: 1.844}, {quality: 'steel', fire: 0.667}),
  WK('magmaforge', 'mithril', 'мифрил из руды', {mithrilOre: 0.167}, {mithril: 0.016}),
  WK('magmaforge', 'forge', 'мифриловое оружие и броня', {mithril: 0.083, steel: 0.083, leather: 0.042}, {arms: 0.45, armor: 5.126, lux: 9.465}, {quality: 'mithril'}),
]);
// the ways of a building: its rows of TOWN_WORKS, or its own in/out as the one way
export const worksOf = b => (b.works ? TOWN_WORKS.filter(w => w.at === b.id) : [{id: b.id, at: b.id, label: b.name, in: b.in || {}, out: b.out || {}, quality: b.quality, fire: b.fire}]);
// fuel a day: units for so many cycles of warmth or fire
export const fuelFor = cycles => (cycles || 0) / FUEL.uses;
// the worth of tools a building wears out a day, with tools of this material
export const toolWear = (b, material = 'iron') => (b.tools || 0) * TOOLS[material].price / TOOLS[material].days;
// what a building takes a day besides its work: fuel for warmth (units), upkeep, and the worth of the tools it wears out (with
// tools of this material; iron by default) ({good: amount})
export const upkeepOf = (b, material = 'iron') => {
  const o = {...(b.repair || {})};
  if (b.heat) o.coal = (o.coal || 0) + fuelFor(b.heat);
  if (b.tools) o.tools = (o.tools || 0) + toolWear(b, material);
  return o;
};
// what a town makes by its people's own hands a day, and what 100 of its people use up a day (TOWN_GOODS start, need)
export const townStart = () => Object.fromEntries(TOWN_GOODS.filter(g => g.start).map(g => [g.id, g.start]));
export const townNeeds = () => Object.fromEntries(TOWN_GOODS.filter(g => g.need).map(g => [g.id, g.need]));

// what a building gives, as one number for each effect (0 where it gives nothing)
export const fxOf = (b, key) => (key === 'housing' ? (b.house || 0) / TOWN_FX.room[1] : b.fx[key] || 0);

// the buildings that let a realm work a metal (`metals`); none — everyone works it
export const metalBuildings = m => TOWN_BUILDINGS.filter(b => b.metals?.includes(m)).map(b => b.id);
// the races of a local building (data/buildings.js id): the peoples of the town building that stands for it (`local`);
// null — anyone (or no town building stands for it). One truth: they are edited here, in «Постройки городов»
export const localPeoples = localId => TOWN_BUILDINGS.all().find(b => b.local === localId)?.peoples || null;
// whether a people (data/peoples.js id) builds this local building — not enforced on the local map yet (docs/TODO.md)
export const peopleBuildsLocal = (people, localId) => { const p = localPeoples(localId); return !p || p.includes(people); };
// every metal some building opens, and its word for the cards
export const gatedMetals = () => [...new Set(TOWN_BUILDINGS.all().flatMap(b => b.metals || []))];
export const METAL_WORDS = {bronze: 'бронза', iron: 'железо', steel: 'сталь', silver: 'серебро', mithril: 'мифрил'};

// How a town's buildings work (atlas/towns.js), on top of their effects:
//   room:      the people its houses hold: room[0] + Σ house (room[1] — people a point of the `housing` need stands for)
//   econ:      what its household lacks (atlas/economy.js): econ[0] toward a building for each lacking good it makes, at most econ[1]
//   might:     √people × (1 + defence + mightProd × production) — its strength against raids and armies
//   raid:      the share of a raid's harm it takes: 1 − raidFaith × faith − raidHealth × health, never below raidFloor
//   needs:     what it wants to build, 0 … ~1.5 an effect: housing and food fill as people reach full[0] of room or of
//              what the land feeds, over full[1]; defence — the threat, + defence[1] while it was raided in the last
//              `raided` years, at most defence[0], + defence[2]; the others — a base + a step a tier (trade + its road,
//              + trade[2] from tier 2; lore only from tier 2, else lore[2]; health + health[2] after a raid)
export const TOWN_FX = {room: [120, 100], mightProd: 0.3, raidFloor: 0.4, raidFaith: 0.5, raidHealth: 0.5, econ: [0.15, 0.45],
  needs: {full: [0.55, 0.4], housing: [1.5], food: [1.3], raided: 6, defence: [1.5, 0.8, 0.1], trade: [0.15, 0.6, 0.3], prod: [0.4, 0.1],
    faith: [0.25, 0.15], lore: [0.25, 0.1, 0.03], prestige: [0.15, 0.15], health: [0.25, 0.1, 0.3]}};

// What a town's place must have for a building (atlas/towns.js placeHas): cells around to look, and the thresholds —
// a lake, magma, gold sand, salt (a salt lake; or the coast where it is warmer than saltSea°), clay (alluvium), stone
// (rough ground below stoneFlat of flatness or above stoneHigh of the land's height), fertile soil, a forest (tree
// cover), steep and flat ground, graves (barrows), warm (°C), dry country; `near` — the cells around for the rest
export const PLACE_AT = {near: 2, lake: 2, magma: 3, placer: 1, salt: 4, saltSea: 14, clay: 0.3, stoneFlat: 0.75, stoneHigh: 0.2, fertile: 0.5,
  forest: 0.5, steep: 0.5, flat: 0.85, graves: 3, gravesAt: 0.2, warm: 12, dry: 3};
