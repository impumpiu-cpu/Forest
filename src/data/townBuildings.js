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
//   ── what it does (a year at full strength; docs/WORLD.md «Потоки построек»)
//   house         people it houses: the town's room is TOWN_FX.room[0] + Σ house (the town does not grow past it)
//   jobs          hands it takes from the town's people to work at full strength
//   heat          fuel (good `coal`: charcoal and firewood alike) its hearths burn for warmth, × the climate
//                 (cold ×1.6, mild ×1, warm ×0.4); warmth takes the fuel first, the furnaces what is left (FUEL_ORDER)
//   repair        upkeep: what keeps the building standing — a wooden one logs or boards, a stone one stone, a tent hides
//   cycles        how many times a year it turns out its goods; every cycle spends one use of a tool. The building takes
//                 a tool from the stock, the tool brings TOOL_USES[its material] uses, and when they run out it takes the
//                 next one — so a working building needs tools all the time, and fewer of them the better they are
//   herd          head of beasts it keeps at full strength: milk comes from the herd, the slaughterhouse takes the increase
//   in, out       what it takes and gives in its work, in TOWN_GOODS ({good: amount})
//   works         a building that can work several ways (a furnace: bronze, iron or silver; a hearth: whatever raw food
//                 there is) has its ways in TOWN_WORKS below instead of in/out; it works the ones it has the makings for
//   quality       the material of the tools and arms it makes (TOOL_USES): bone, bronze, iron, steel, mithril
//   metals        the metals its realm's smiths work and its markets sell once one stands in the realm
//                 (data/balance/materials.js ids; a metal no building lists, everyone works)
//   fx            what it gives, per building (EFFECTS below)
//   `jobs`, `heat`, `repair`, `cycles`, `in` and `out` are the numbers of the flows: drafts, in the table and checked
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
// The goods of a town's flows: what a year of a building takes and gives. `res` — the stock resource it is priced as
// (data/balance/prices.js), × `per` units of it in one unit of the good; `price` — gold for a good with no resource
// of its own. Food of every kind is counted in people-years: one feeds one person a year (365 rations).
//   kind    base — got from the land with no making (logs, ore, raw food); made — the work of a building
//   raw     raw food: not eaten — only a hearth, a bakery, a smokehouse or the racks make food of it
//   chain   the branch it belongs to (CHAINS): how the goods are grouped on the chain map
//   start   what a town makes of it a year by its people's own hands, with no building — enough for the first
//           buildings, so that no chain waits for itself (the woodcutters' tools, the first logs)
//   need    what 100 people use up of it a season (food, clothes, herbs, drink, the gentry's luxury)
export const CHAINS = {wood: 'дерево', fuel: 'топливо', food: 'еда', stone: 'камень и глина', metal: 'металл', tools: 'орудия и оружие',
  beasts: 'скот и охота', cloth: 'ткани и одежда', herbs: 'травы и лечение', lux: 'роскошь, вера, деньги'};
const RATION_YEAR = () => CAMPAIGN.ration * 365;
export const TOWN_GOODS = new Registry('townGood');
TOWN_GOODS.registerAll([
  // food: raw (not eaten) and ready
  {id: 'grain', label: 'зерно', unit: 'чел.-год', kind: 'base', raw: true, chain: 'food', get price() { return RATION_YEAR() * 0.7; }, note: 'сырое: мельница и жернова мелют его в муку, очаг варит кашу, загон кормит им скот'},
  {id: 'produce', label: 'овощи, плоды, грибы', unit: 'чел.-год', kind: 'base', raw: true, chain: 'food', start: 10, get price() { return RATION_YEAR() * 0.7; }},
  {id: 'meat', label: 'мясо', unit: 'чел.-год', kind: 'base', raw: true, chain: 'food', get price() { return RATION_YEAR() * 0.8; }},
  {id: 'fish', label: 'рыба', unit: 'чел.-год', kind: 'base', raw: true, chain: 'food', get price() { return RATION_YEAR() * 0.7; }},
  {id: 'milk', label: 'молоко', unit: 'чел.-год', kind: 'base', raw: true, chain: 'food', get price() { return RATION_YEAR() * 0.6; }},
  {id: 'flour', label: 'мука', unit: 'чел.-год', kind: 'made', chain: 'food', get price() { return RATION_YEAR() * 0.8; }},
  {id: 'food', label: 'готовая еда', unit: 'чел.-год', kind: 'made', chain: 'food', start: 12, need: 25, get price() { return RATION_YEAR(); }, note: 'хлеб, каша, похлёбка: только её и заготовки едят жители'},
  {id: 'stores', label: 'заготовки', unit: 'чел.-год', kind: 'made', chain: 'food', price: 150, note: 'вяленое, солёное, копчёное: не портится, едят в голод и зимой'},
  {id: 'salt', label: 'соль', unit: 'шт.', kind: 'base', chain: 'food', res: 'salt'},
  {id: 'drink', label: 'брага и пиво', unit: 'шт.', kind: 'made', chain: 'food', need: 60, res: 'braga'},
  {id: 'honey', label: 'мёд и воск', unit: 'шт.', kind: 'base', chain: 'lux', price: 1.2},
  // wood and fuel
  {id: 'wood', label: 'брёвна', unit: 'шт.', kind: 'base', chain: 'wood', start: 60, res: 'wood'},
  {id: 'planks', label: 'тёс', unit: 'шт.', kind: 'made', chain: 'wood', res: 'planks'},
  {id: 'coal', label: 'уголь и дрова', unit: 'шт.', kind: 'base', chain: 'fuel', start: 20, res: 'coal', note: 'всё топливо: древесный уголь из ям, дрова, хворост и каменный уголь копей; сперва на тепло, потом горнам'},
  // stone and clay
  {id: 'stone', label: 'камень', unit: 'шт.', kind: 'base', chain: 'stone', start: 20, res: 'stone'},
  {id: 'clay', label: 'глина', unit: 'шт.', kind: 'base', chain: 'stone', start: 15, res: 'clay'},
  {id: 'pots', label: 'горшки', unit: 'шт.', kind: 'made', chain: 'stone', res: 'pots'},
  // ore and metal: each metal its own chain link
  {id: 'copperOre', label: 'медно-оловянная руда', unit: 'шт.', kind: 'base', chain: 'metal', res: 'bronzeOre'},
  {id: 'ironOre', label: 'железная руда', unit: 'шт.', kind: 'base', chain: 'metal', res: 'ironore'},
  {id: 'silverOre', label: 'серебряная руда', unit: 'шт.', kind: 'base', chain: 'metal', res: 'silverOre'},
  {id: 'mithrilOre', label: 'мифриловая руда', unit: 'шт.', kind: 'base', chain: 'metal', res: 'mithrilOre'},
  {id: 'bronze', label: 'бронза', unit: 'слитков', kind: 'made', chain: 'metal', res: 'bronze'},
  {id: 'iron', label: 'железо', unit: 'слитков', kind: 'made', chain: 'metal', res: 'iron'},
  {id: 'steel', label: 'сталь', unit: 'слитков', kind: 'made', chain: 'metal', res: 'steel'},
  {id: 'silver', label: 'серебро', unit: 'слитков', kind: 'made', chain: 'metal', res: 'silverBar'},
  {id: 'mithril', label: 'мифрил', unit: 'слитков', kind: 'made', chain: 'metal', price: 40},
  {id: 'gems', label: 'самоцветы', unit: 'шт.', kind: 'base', chain: 'lux', res: 'gems'},
  {id: 'gold', label: 'золото', unit: 'зол.', kind: 'base', chain: 'lux', res: 'gold'},
  // tools and arms: worn out in the work (a use each `cycle` of a building), their life set by what they are made of (TOOL_USES)
  {id: 'tools', label: 'орудия', unit: 'шт.', kind: 'made', chain: 'tools', start: 3, price: 3, note: 'топоры, кирки, серпы, пилы; каменные и костяные — своими руками на старте'},
  {id: 'arms', label: 'оружие', unit: 'шт.', kind: 'made', chain: 'tools', price: 6},
  {id: 'armor', label: 'броня', unit: 'шт.', kind: 'made', chain: 'tools', price: 15},
  // beasts and what they give
  {id: 'beasts', label: 'скот', unit: 'голов', kind: 'base', chain: 'beasts', get price() { return CAMPAIGN.beasts.mule; }, note: 'приплод стада: его забивают на бойне или продают'},
  {id: 'hide', label: 'шкуры', unit: 'шт.', kind: 'base', chain: 'beasts', start: 10, res: 'hide'},
  {id: 'bone', label: 'кость', unit: 'шт.', kind: 'base', chain: 'beasts', start: 10, res: 'bone'},
  {id: 'leather', label: 'кожа', unit: 'шт.', kind: 'made', chain: 'beasts', res: 'leather'},
  {id: 'wool', label: 'шерсть', unit: 'шт.', kind: 'base', chain: 'beasts', res: 'wool'},
  // cloth and clothes
  {id: 'fiber', label: 'волокно', unit: 'шт.', kind: 'base', chain: 'cloth', start: 15, price: 0.5, note: 'лён и крапива: на ткань, сети и снасти'},
  {id: 'cloth', label: 'ткань', unit: 'шт.', kind: 'made', chain: 'cloth', res: 'cloth'},
  {id: 'clothes', label: 'одежда', unit: 'шт.', kind: 'made', chain: 'cloth', need: 10, price: 2, note: 'из шкур, кожи, ткани или шерсти: снашивается'},
  // herbs and healing
  {id: 'herbs', label: 'травы', unit: 'шт.', kind: 'base', chain: 'herbs', start: 5, need: 4, res: 'herbs', note: 'лечат и дубят кожи'},
  {id: 'potions', label: 'зелья', unit: 'шт.', kind: 'made', chain: 'herbs', need: 1, res: 'potion'},
  // luxury
  {id: 'lux', label: 'роскошь', unit: 'шт.', kind: 'made', chain: 'lux', need: 1, price: 10, note: 'вина, украшения, стекло: знать, храмы и дворцы'},
]);
// gold for one unit of a good
export const goodPrice = id => { const G = TOWN_GOODS.get(id); return G.res ? PRICE[G.res].price * (G.per ?? 1) : G.price; };

// uses a tool brings, by what it is made of: one use a cycle of work (`cycles`), then the building takes the next tool
export const TOOL_USES = {bone: 4, bronze: 7, iron: 10, steel: 16, mithril: 30};
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
  B('hut', 'шалаши', 'pl', 'housing', 0, ALL, {}, {max: 2, local: 'hut', house: 100, heat: 80, repair: W(30)}),
  B('yurts', 'шатры', 'pl', 'housing', 0, O, {}, {max: 8, house: 150, heat: 50, repair: HD(20)}),
  B('house', 'избы', 'pl', 'housing', 1, [...H], {}, {max: 6, needsAny: ['forest', 'clay'], local: 'house', house: 200, heat: 40, repair: PL(15)}),
  B('longhouse', 'длинный дом', 'm', 'housing', 1, [...H, ...O], {prestige: 0.03}, {max: 4, needs: ['forest'], house: 250, heat: 50, repair: W(30)}),
  B('treehouse', 'дома на деревьях', 'pl', 'housing', 1, E, {}, {max: 8, needs: ['forest'], house: 300, heat: 20, repair: W(10)}),
  B('hallhomes', 'подгорные жилища', 'pl', 'housing', 1, D, {defence: 0.05}, {max: 8, needsAny: ['steep', 'caves'], house: 400, heat: 25, repair: S(10)}),
  B('stonehouse', 'каменные дома', 'pl', 'housing', 2, [...H, ...D], {defence: 0.03}, {max: 8, needs: ['stone'], requires: ['quarry'], house: 400, heat: 50, repair: S(15)}),
  B('barracks', 'казармы', 'pl', 'housing', 2, [...H, ...D, ...O], {defence: 0.25}, {requiresAny: ['armory', 'warcamp'], house: 100, jobs: 30, heat: 20, repair: W(10), in: {arms: 3, armor: 1}}),
  // ── food: the land gives it raw, the hearth, the bakery, the smokehouse and the racks make it food
  B('garden', 'огороды', 'pl', 'food', 0, ALL, {food: 0.15}, {max: 3, needs: ['fertile'], local: 'garden', site: true, jobs: 15, cycles: 20, repair: W(3), out: {produce: 35, herbs: 10}}),
  B('field', 'пашни', 'pl', 'food', 0, [...H, ...O], {food: 0.3}, {max: 4, needs: ['fertile', 'flat'], local: 'field', site: true, jobs: 30, cycles: 50, repair: W(5), out: {grain: 110, fiber: 100}}),
  B('grove', 'плодовые рощи', 'pl', 'food', 1, E, {food: 0.3}, {max: 4, needsAny: ['forest', 'fertile'], site: true, jobs: 12, cycles: 10, out: {produce: 45, wood: 20}}),
  B('mushrooms', 'грибные пещеры', 'pl', 'food', 1, D, {food: 0.3}, {max: 4, needsAny: ['caves', 'steep'], site: true, jobs: 15, cycles: 10, out: {produce: 50}}),
  // the herd is fed raw food (TOWN_WORKS); milk comes from its head, the increase goes to the slaughterhouse
  B('pen', 'загоны', 'pl', 'food', 0, [...H, ...D, ...O], {food: 0.15}, {max: 2, needs: ['pasture'], local: 'pen', site: true, jobs: 8, herd: 20, repair: W(5), works: true}),
  B('pasture', 'выгоны и стада', 'pl', 'food', 1, [...H, ...O], {food: 0.25, prod: 0.05}, {max: 3, needs: ['pasture'], site: true, jobs: 15, herd: 40, repair: W(8), works: true}),
  B('slaughter', 'бойня', 'f', 'food', 0, [...H, ...D, ...O], {food: 0.15, prod: 0.05}, {requiresAny: ['pen', 'pasture'], jobs: 6, cycles: 20, repair: W(5), in: {beasts: 10}, out: {meat: 25, hide: 80, bone: 80, wool: 150}}),
  B('lodge', 'охотничий навес', 'm', 'food', 0, ALL, {food: 0.1}, {needsAny: ['forest', 'pasture'], local: 'lodge', site: true, jobs: 10, repair: W(5), in: {arms: 2}, out: {meat: 25, hide: 80, bone: 80, wool: 10}}),
  B('fishhut', 'рыбацкие хижины', 'pl', 'food', 0, ALL, {food: 0.15}, {max: 2, needs: ['water'], local: 'fishhut', site: true, jobs: 10, cycles: 10, repair: W(5), in: {fiber: 20}, out: {fish: 30}}),
  B('pier', 'рыбная пристань', 'f', 'food', 1, [...H, ...E], {food: 0.25, trade: 0.05}, {needsAny: ['coast', 'lake'], site: true, jobs: 20, cycles: 20, repair: PL(15), in: {fiber: 30}, out: {fish: 70}}),
  B('quern', 'ручные жернова', 'pl', 'food', 0, ALL, {food: 0.05}, {local: 'quern', jobs: 2, cycles: 10, repair: S(2), in: {grain: 12}, out: {flour: 12}}),
  B('watermill', 'водяная мельница', 'f', 'food', 2, [...H, ...D], {food: 0.2, prod: 0.1}, {needs: ['river'], requiresAny: ['field', 'garden', 'mushrooms'], site: true, jobs: 4, cycles: 20, repair: W(10), in: {grain: 60}, out: {flour: 60}}),
  B('windmill', 'ветряная мельница', 'f', 'food', 2, H, {food: 0.15}, {needs: ['flat'], requires: ['field'], site: true, jobs: 4, cycles: 10, repair: W(10), in: {grain: 40}, out: {flour: 40}}),
  B('bakery', 'пекарня', 'f', 'food', 2, [...H, ...D], {food: 0.1, health: 0.05}, {requiresAny: ['watermill', 'windmill'], jobs: 4, cycles: 10, repair: S(5), in: {flour: 60, coal: 30}, out: {food: 60}}),
  B('smokehouse', 'коптильня', 'f', 'food', 1, ALL, {food: 0.1}, {requiresAny: ['lodge', 'fishhut', 'pen', 'slaughter'], local: 'smokehouse', jobs: 3, cycles: 10, repair: W(5), works: true}),
  B('dryrack', 'вешала и бочки', 'pl', 'food', 0, ALL, {food: 0.05}, {local: 'dryrack', jobs: 2, repair: W(3), works: true}),
  B('granary', 'амбар', 'm', 'food', 0, ALL, {food: 0.15}, {local: 'granary', jobs: 1, repair: W(5)}),
  B('cellar', 'погреба и ледники', 'pl', 'food', 2, [...H, ...D], {food: 0.1, health: 0.05}, {jobs: 1, repair: S(5)}),
  B('apiary', 'пасека', 'f', 'food', 1, [...H, ...E], {food: 0.05, prod: 0.05}, {needsAny: ['forest', 'fertile'], needs: ['warm'], site: true, jobs: 2, cycles: 10, repair: W(2), out: {honey: 60}}),
  B('brewery', 'пивоварня', 'f', 'food', 2, [...H, ...D, ...O], {prod: 0.1, prestige: 0.05}, {requiresAny: ['field', 'garden', 'mushrooms'], jobs: 4, cycles: 10, repair: W(5), in: {grain: 20, coal: 10}, out: {drink: 800}}),
  B('vineyard', 'виноградники', 'pl', 'food', 2, [...H, ...E], {trade: 0.15, prestige: 0.05}, {needs: ['warm', 'fertile'], site: true, jobs: 10, cycles: 20, repair: W(3), out: {lux: 20}}),
  // ── raw materials
  B('woodcut', 'лесосека', 'f', 'raw', 0, [...H, ...D, ...O], {prod: 0.1}, {needs: ['forest'], site: true, jobs: 8, cycles: 30, out: {wood: 600}}),
  // elves do not fell the wood: they take what it gives — deadwood and brushwood, hides, herbs, honey and wax
  B('forestry', 'лесной промысел', 'm', 'raw', 0, E, {prod: 0.15, trade: 0.05}, {needs: ['forest'], site: true, jobs: 6, cycles: 10, out: {wood: 200, coal: 60, hide: 20, herbs: 40, honey: 20}}),
  B('sawmill', 'лесопилка', 'f', 'raw', 1, [...H, ...D], {prod: 0.15}, {needs: ['forest'], local: 'sawmill', site: true, jobs: 4, cycles: 20, repair: W(5), in: {wood: 160}, out: {planks: 100}}),
  B('quarry', 'каменоломня', 'f', 'raw', 0, [...H, ...D], {prod: 0.1}, {needs: ['stone'], local: 'quarry', site: true, jobs: 8, cycles: 40, out: {stone: 500}}),
  B('claypit', 'глиняный карьер', 'm', 'raw', 0, [...H, ...D], {prod: 0.05}, {needs: ['clay'], site: true, jobs: 4, cycles: 10, out: {clay: 300}}),
  // which ore a mine gives is the place's geology (atlas/geology.js): the numbers are a shaft where all of them lie
  B('mineshaft', 'рудник', 'm', 'raw', 0, [...H, ...D, ...O], {prod: 0.25, trade: 0.1}, {needs: ['ore'], local: 'mineshaft', notable: true, site: true, jobs: 12, cycles: 60, repair: W(40), out: {ironOre: 120, copperOre: 100, silverOre: 20, gems: 4}}),
  B('deepmine', 'глубокие шахты', 'pl', 'raw', 2, D, {prod: 0.3, trade: 0.15}, {needsAny: ['ore', 'gems', 'precious'], requires: ['mineshaft'], site: true, jobs: 20, cycles: 100, repair: W(60), out: {ironOre: 220, copperOre: 150, silverOre: 60, mithrilOre: 10, gems: 15}}),
  B('charpit', 'углежогная яма', 'f', 'raw', 1, [...H, ...D, ...O], {prod: 0.05}, {needs: ['forest'], local: 'charpit', site: true, jobs: 3, cycles: 10, in: {wood: 200}, out: {coal: 150}}),
  B('coalpit', 'угольные копи', 'pl', 'raw', 1, [...H, ...D], {prod: 0.15}, {needs: ['coal'], site: true, jobs: 8, cycles: 30, repair: W(20), out: {coal: 300}}),
  B('saltworks', 'солеварня', 'f', 'raw', 1, [...H, ...D], {trade: 0.2, food: 0.05}, {needs: ['salt'], site: true, jobs: 5, cycles: 10, repair: W(5), in: {coal: 30}, out: {salt: 200}}),
  B('placer', 'золотой прииск', 'm', 'raw', 1, [...H, ...D, ...O], {trade: 0.2}, {needs: ['placer'], notable: true, site: true, jobs: 6, cycles: 20, repair: W(5), out: {gold: 200}}),
  // ── crafts
  B('loom', 'ткацкая', 'f', 'craft', 1, ALL, {prod: 0.1}, {local: 'loom', jobs: 4, cycles: 10, repair: W(3), works: true}),
  B('tailor', 'портняжная', 'f', 'craft', 0, ALL, {prod: 0.05, health: 0.05}, {jobs: 4, cycles: 10, repair: W(3), works: true}),
  B('potter', 'гончарня', 'f', 'craft', 1, [...H, ...D, ...E], {prod: 0.05}, {needs: ['clay'], local: 'potter', jobs: 3, cycles: 10, repair: S(2), in: {clay: 60, coal: 20}, out: {pots: 90}}),
  B('tannery', 'дубильня', 'f', 'craft', 1, [...H, ...D, ...O], {prod: 0.1}, {requiresAny: ['lodge', 'pen', 'pasture'], local: 'tannery', jobs: 3, cycles: 10, repair: W(3), in: {hide: 60, herbs: 10}, out: {leather: 60}}),
  B('crafthut', 'мастерская ремесленника', 'f', 'craft', 1, ALL, {prod: 0.1}, {local: 'crafthut', jobs: 4, repair: W(3), quality: 'bone', in: {wood: 40, bone: 20, leather: 20}, out: {tools: 15, arms: 10}}),
  // the furnace melts what the place has (TOWN_WORKS): copper-tin ore to bronze, iron ore to bloom iron, silver ore to silver;
  // and casts bronze tools
  B('smelter', 'плавильный горн', 'm', 'craft', 1, [...H, ...D, ...O], {prod: 0.15}, {requires: ['mineshaft'], local: 'smelter', jobs: 4, cycles: 10, repair: S(5), works: true, metals: ['bronze']}),
  B('forge', 'кузня', 'f', 'craft', 1, [...H, ...D, ...O], {prod: 0.2, defence: 0.1}, {requires: ['smelter'], local: 'forge', notable: true, jobs: 4, cycles: 10, repair: S(5), quality: 'iron', in: {iron: 50, coal: 25, leather: 10}, out: {tools: 15, arms: 10, armor: 2}, metals: ['iron']}),
  B('foundry', 'литейня', 'f', 'craft', 2, [...H, ...D], {prod: 0.25, trade: 0.1}, {requires: ['forge'], pop: 800, jobs: 10, cycles: 20, repair: S(10), works: true, metals: ['steel']}),
  B('magmaforge', 'магмовая кузня', 'f', 'craft', 2, D, {prod: 0.35, prestige: 0.2, defence: 0.1}, {needs: ['magma'], requires: ['forge'], local: 'magmaforge', pop: 800, jobs: 6, cycles: 10, repair: S(10), works: true, metals: ['mithril', 'steel']}),
  B('jeweler', 'ювелирная мастерская', 'f', 'craft', 2, [...H, ...D, ...E], {prod: 0.1, trade: 0.2, prestige: 0.1}, {needs: ['gems'], local: 'jeweler', jobs: 3, cycles: 10, repair: W(3), in: {gems: 8, silver: 4}, out: {lux: 10}, metals: ['silver']}),
  B('armory', 'оружейная', 'f', 'craft', 2, ALL, {defence: 0.2}, {requiresAny: ['crafthut', 'forge'], local: 'armory', jobs: 2, repair: W(5)}),
  B('bowyer', 'мастерская луков', 'f', 'craft', 1, [...E, ...H], {defence: 0.15}, {needs: ['forest'], jobs: 3, cycles: 10, repair: W(3), quality: 'bone', in: {wood: 30, leather: 8}, out: {arms: 20}}),
  B('shipyard', 'верфь', 'f', 'craft', 2, [...H, ...E], {trade: 0.25, prod: 0.1}, {needs: ['coast', 'forest'], jobs: 15, cycles: 40, repair: W(10), in: {planks: 200, fiber: 40, cloth: 30}}),
  B('glassworks', 'стеклодувня', 'f', 'craft', 2, [...H, ...D], {prod: 0.1, trade: 0.1, prestige: 0.05}, {needsAny: ['coast', 'clay'], pop: 800, jobs: 5, cycles: 10, repair: S(5), in: {clay: 60, coal: 60}, out: {lux: 8}}),
  B('alchemist', 'лаборатория алхимика', 'f', 'craft', 2, [...H, ...E, ...D], {lore: 0.15, health: 0.1}, {pop: 800, jobs: 2, cycles: 10, repair: S(3), in: {herbs: 40, pots: 20, coal: 10}, out: {potions: 20}}),
  // kitchens, one for each step of a town: they cook whatever raw food there is (TOWN_WORKS, KITCHENS); a bigger one
  // cooks more and wastes less — the campfire turns 10 raw into 8 food, the common hearth 20 into 20, the cookhouse 60 into 72
  B('campfire', 'кострище', 'n', 'life', 0, ALL, {health: 0.02}, {max: 2, jobs: 2, works: true}),
  B('hearth', 'общинный очаг', 'm', 'life', 1, ALL, {health: 0.05}, {local: 'hearth', jobs: 3, repair: S(2), works: true}),
  B('cookhouse', 'поварня', 'f', 'life', 2, ALL, {health: 0.1, food: 0.05}, {requires: ['hearth'], jobs: 6, cycles: 10, repair: S(5), works: true}),
  // ── trade and ways
  B('ferry', 'перевоз', 'm', 'trade', 0, [...H, ...E, ...O], {trade: 0.05}, {needs: ['river'], jobs: 2, repair: W(5), out: {gold: 20}}),
  B('bridge', 'мост', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, {needs: ['river'], requires: ['quarry'], repair: S(10)}),
  B('inn', 'постоялый двор', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, {needs: ['road'], jobs: 3, heat: 10, repair: W(5), in: {food: 4, drink: 100}, out: {gold: 60}}),
  B('toll', 'дорожная застава', 'f', 'trade', 1, [...H, ...D, ...O], {trade: 0.05, defence: 0.05}, {needs: ['road'], jobs: 3, repair: W(3), out: {gold: 40}}),
  B('market', 'рынок', 'm', 'trade', 1, ALL, {trade: 0.3, prestige: 0.05}, {jobs: 4, repair: W(5)}),
  B('warehouse', 'торговые склады', 'pl', 'trade', 2, [...H, ...D], {trade: 0.15}, {requires: ['market'], jobs: 2, repair: W(5)}),
  B('caravanserai', 'караван-сарай', 'm', 'trade', 2, [...H, ...O], {trade: 0.25}, {needs: ['road', 'dry'], jobs: 4, repair: S(5), in: {food: 12}, out: {gold: 80}}),
  // the harbour opens the sea lanes (atlas/sea.js): traffic to other harbours, faster than any road
  B('harbor', 'гавань', 'f', 'trade', 2, [...H, ...E], {trade: 0.35}, {needs: ['coast'], requiresAny: ['pier', 'shipyard'], notable: true, jobs: 10, repair: PL(20), out: {gold: 120}}),
  B('lighthouse', 'маяк', 'm', 'trade', 1, [...H, ...E], {trade: 0.1, defence: 0.05}, {needs: ['coast'], requiresAny: ['pier', 'fishhut'], jobs: 1, repair: S(3), in: {coal: 20}}),
  B('riverpier', 'речная пристань', 'f', 'trade', 1, [...H, ...E, ...O], {trade: 0.1, food: 0.05}, {needs: ['river'], requiresAny: ['ferry', 'fishhut'], jobs: 4, repair: PL(6), in: {fiber: 5}, out: {fish: 5, gold: 20}}),
  B('mint', 'монетный двор', 'm', 'trade', 2, [...H, ...D], {trade: 0.2, prestige: 0.15}, {needs: ['precious'], requires: ['market'], pop: 800, capital: true, jobs: 4, cycles: 10, repair: S(5), in: {gold: 100, silver: 20}, out: {gold: 160}}),
  // ── defence
  B('palisade', 'частокол', 'm', 'defence', 1, [...H, ...E, ...O], {defence: 0.25}, {needs: ['forest'], local: 'palisade', repair: W(40)}),
  B('watchtower', 'сторожевая вышка', 'f', 'defence', 1, ALL, {defence: 0.15}, {local: 'watchtower', jobs: 2, repair: W(5)}),
  B('hiddenpaths', 'тайные тропы', 'pl', 'defence', 1, E, {defence: 0.35}, {needs: ['forest'], jobs: 3}),
  B('warcamp', 'боевой стан', 'm', 'defence', 1, O, {defence: 0.3, prestige: 0.1}, {jobs: 30, repair: HD(10), in: {arms: 4, armor: 1}}),
  B('earthwall', 'земляной вал', 'm', 'defence', 1, O, {defence: 0.3}, {requires: ['warcamp']}),
  B('stonewall', 'каменные стены', 'pl', 'defence', 1, [...H, ...D], {defence: 0.5}, {needs: ['stone'], requires: ['quarry'], repair: S(30)}),
  B('tunnels', 'подземные ходы', 'pl', 'defence', 1, D, {defence: 0.2, trade: 0.1}, {needsAny: ['steep', 'caves'], jobs: 2, repair: W(10)}),
  B('tower', 'крепостные башни', 'pl', 'defence', 2, [...H, ...D], {defence: 0.3}, {requires: ['stonewall'], jobs: 10, repair: S(15), in: {arms: 2}}),
  B('citadel', 'цитадель', 'f', 'defence', 2, [...H, ...D], {defence: 0.6, prestige: 0.2}, {requires: ['tower'], pop: 800, jobs: 40, repair: S(40), in: {arms: 6, armor: 3}}),
  // ── faith
  B('shrine', 'святилище', 'n', 'faith', 0, ALL, {faith: 0.15}, {local: 'shrine', jobs: 1, repair: W(2), in: {honey: 5}}),
  B('shamanhut', 'хижина шамана', 'f', 'faith', 0, O, {faith: 0.15, health: 0.1}, {jobs: 1, repair: HD(2), in: {herbs: 15}}),
  B('sacredgrove', 'священная роща', 'f', 'faith', 0, E, {faith: 0.3}, {needs: ['forest'], jobs: 2}),
  B('stonecircle', 'каменный круг', 'm', 'faith', 0, [...H, ...O], {faith: 0.2}, {needsAny: ['stone', 'steep']}),
  B('ancestorhall', 'зал предков', 'm', 'faith', 1, D, {faith: 0.3, prestige: 0.1}, {requires: ['shrine'], jobs: 2, repair: S(5), in: {honey: 5}}),
  B('temple', 'храм', 'm', 'faith', 1, [...H, ...E, ...D], {faith: 0.3, prestige: 0.1}, {requires: ['shrine'], jobs: 4, repair: S(10), in: {honey: 15, lux: 1}}),
  B('crypt', 'усыпальница', 'f', 'faith', 2, [...H, ...D], {faith: 0.1}, {jobs: 1, repair: S(5)}),
  // by the barrows of old battles: the fallen are laid to rest, and the rot around fades (atlas/lairs.js stepRot)
  B('fallentemple', 'храм павших', 'm', 'faith', 1, ALL, {faith: 0.25, health: 0.05}, {needs: ['graves'], requires: ['shrine'], notable: true, jobs: 3, repair: S(5), in: {honey: 10}}),
  B('catacombs', 'катакомбы', 'pl', 'faith', 2, D, {faith: 0.1, health: 0.05}, {needs: ['caves'], requires: ['ancestorhall'], house: 100, jobs: 1, repair: S(5)}),
  B('cemetery', 'кладбище', 'n', 'faith', 1, ALL, {faith: 0.05, health: 0.05}, {jobs: 1}),
  // ── lore
  B('school', 'школа', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.15}, {jobs: 3, heat: 10, repair: W(5), in: {cloth: 5}}),
  B('library', 'библиотека', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.3, prestige: 0.1}, {requires: ['school'], pop: 800, jobs: 4, heat: 10, repair: S(5), in: {lux: 2}}),
  // the wards of a mage tower hold the dead off (atlas/lairs.js: the undead's raids on it fail oftener, the rot around fades)
  B('magetower', 'башня мага', 'f', 'lore', 2, [...H, ...E], {lore: 0.3, defence: 0.15, prestige: 0.15}, {pop: 800, notable: true, jobs: 3, repair: S(5), in: {potions: 5, lux: 2}}),
  // ── power and fame
  B('eldershall', 'дом старейшин', 'm', 'power', 0, ALL, {prestige: 0.1}, {jobs: 2, heat: 10, repair: W(5)}),
  B('townhall', 'ратуша', 'f', 'power', 2, [...H, ...D], {prestige: 0.2, trade: 0.05}, {requires: ['eldershall'], jobs: 6, heat: 15, repair: S(10)}),
  B('palace', 'дворец', 'm', 'power', 2, [...H, ...E], {prestige: 0.4}, {requiresAny: ['townhall', 'eldershall'], pop: 800, capital: true, jobs: 20, heat: 40, repair: S(20), in: {lux: 10, food: 10}}),
  B('arena', 'бойцовская яма', 'f', 'power', 2, [...O, ...H], {prestige: 0.15, defence: 0.05}, {jobs: 4, repair: W(5), in: {food: 5, drink: 100}}),
  B('monument', 'памятник', 'm', 'power', 2, ALL, {prestige: 0.15}, {pop: 800, repair: S(20)}),
  // the throne hall crowns a people's seat: one per realm, only its capital builds it (data/peoples.js CAPITAL)
  B('throne', 'тронный зал', 'm', 'power', 2, ALL, {prestige: 0.3, trade: 0.1, defence: 0.1}, {pop: 800, capital: true, unique: true, requiresAny: ['eldershall', 'townhall', 'ancestorhall', 'warcamp'], notable: true, jobs: 10, heat: 30, repair: S(10), in: {lux: 15}}),
  // ── life and health
  B('well', 'колодец', 'm', 'life', 1, ALL, {health: 0.1}, {local: 'well', repair: S(2)}),
  B('healerhut', 'хижина лекаря', 'f', 'life', 1, ALL, {health: 0.15}, {local: 'healerhut', jobs: 2, repair: W(3), in: {herbs: 20, pots: 10}, out: {potions: 10}}),
  B('hospice', 'лечебница', 'f', 'life', 2, [...H, ...E], {health: 0.25}, {requires: ['healerhut'], jobs: 6, heat: 15, repair: W(5), in: {herbs: 40, cloth: 10}}),
  B('bathhouse', 'баня', 'f', 'life', 2, [...H, ...D], {health: 0.15}, {needs: ['water'], jobs: 3, repair: W(5), in: {coal: 40}}),
  B('aqueduct', 'акведук', 'm', 'life', 2, H, {health: 0.2}, {needs: ['stone'], requires: ['well'], pop: 800, house: 100, jobs: 2, repair: S(20)}),
]);

// The ways of work of the buildings marked `works: true`: one row a way, {at, label, in, out, quality}. A building
// works the ways it has the makings for; how it shares its hands between them is the towns' flow step (docs/WORLD.md).
// the kitchens of the three steps of a town: raw food a year at full strength, fuel for it, food out of a unit of raw
export const KITCHENS = {campfire: {raw: 10, fuel: 8, yield: 0.8}, hearth: {raw: 20, fuel: 10, yield: 1}, cookhouse: {raw: 60, fuel: 20, yield: 1.2}};
const DISHES = {grain: 'каша', produce: 'похлёбка из овощей', meat: 'мясная похлёбка', fish: 'уха', milk: 'сыр и творог'};
const WK = (at, id, label, inn, out, more = {}) => ({id: `${at}.${id}`, at, label, in: inn, out, ...more});
export const TOWN_WORKS = new Registry('townWork');
TOWN_WORKS.registerAll([
  // the herd eats raw food and gives milk by its head; the increase (beasts) goes to the slaughterhouse
  WK('pen', 'grain', 'кормят зерном', {grain: 5}, {milk: 10, beasts: 4}),
  WK('pen', 'produce', 'кормят овощами', {produce: 5}, {milk: 10, beasts: 4}),
  WK('pasture', 'grain', 'кормят зерном', {grain: 8}, {milk: 20, beasts: 8}),
  WK('pasture', 'produce', 'кормят овощами', {produce: 8}, {milk: 20, beasts: 8}),
  // the kitchens: raw to ready, any raw (KITCHENS: how much each cooks a year and how much food a unit of raw gives)
  ...Object.entries(KITCHENS).flatMap(([at, K]) => Object.entries(DISHES).map(([raw, dish]) =>
    WK(at, raw, dish, {[raw]: K.raw, coal: Math.round(K.fuel * (raw === 'milk' ? 0.5 : 1))}, {food: Math.round(K.raw * K.yield * (raw === 'milk' ? 0.9 : 1))}))),
  WK('smokehouse', 'meat', 'копчёное мясо', {meat: 20, coal: 15}, {stores: 20}),
  WK('smokehouse', 'fish', 'копчёная рыба', {fish: 20, coal: 15}, {stores: 20}),
  WK('dryrack', 'meat', 'солонина', {meat: 12, salt: 6}, {stores: 12}),
  WK('dryrack', 'fish', 'солёная рыба', {fish: 12, salt: 6}, {stores: 12}),
  WK('dryrack', 'produce', 'соленья и сушка', {produce: 12, salt: 4}, {stores: 12}),
  // cloth and clothes
  WK('loom', 'fiber', 'льняная ткань', {fiber: 120}, {cloth: 40}),
  WK('loom', 'wool', 'сукно', {wool: 120}, {cloth: 40}),
  WK('tailor', 'hide', 'одежда из шкур', {hide: 30}, {clothes: 40}),
  WK('tailor', 'leather', 'кожаная одежда', {leather: 20}, {clothes: 40}),
  WK('tailor', 'cloth', 'одежда из ткани', {cloth: 20}, {clothes: 40}),
  WK('tailor', 'wool', 'вязаная шерсть', {wool: 40}, {clothes: 40}),
  // metal: the furnace melts what the place has and casts bronze; the foundry makes steel of iron; the magma forge mithril
  WK('smelter', 'bronze', 'бронза из медно-оловянной руды', {copperOre: 120, coal: 40}, {bronze: 60}),
  WK('smelter', 'iron', 'кричное железо', {ironOre: 120, coal: 80}, {iron: 50}),
  WK('smelter', 'silver', 'серебро из руды', {silverOre: 60, coal: 20}, {silver: 20}),
  WK('smelter', 'cast', 'литьё: бронзовые орудия и оружие', {bronze: 30, coal: 10}, {tools: 15, arms: 8}, {quality: 'bronze'}),
  WK('foundry', 'steel', 'сталь из железа', {iron: 60, coal: 60}, {steel: 40}),
  WK('foundry', 'forge', 'стальные орудия, оружие и броня', {steel: 40, coal: 20, leather: 10}, {tools: 30, arms: 10, armor: 6}, {quality: 'steel'}),
  WK('magmaforge', 'mithril', 'мифрил из руды', {mithrilOre: 20}, {mithril: 10}),
  WK('magmaforge', 'forge', 'мифриловое оружие и броня', {mithril: 10, steel: 10, leather: 5}, {arms: 15, armor: 5, lux: 3}, {quality: 'mithril'}),
]);
// the ways of a building: its rows of TOWN_WORKS, or its own in/out as the one way
export const worksOf = b => (b.works ? TOWN_WORKS.filter(w => w.at === b.id) : [{id: b.id, at: b.id, label: b.name, in: b.in || {}, out: b.out || {}, quality: b.quality}]);
// what a building takes a year besides its work: fuel for warmth, upkeep, and the tools its cycles wear out (with tools of
// this material; iron by default) ({good: amount})
export const toolsPerYear = (b, material = 'iron') => (b.cycles || 0) / TOOL_USES[material];
export const upkeepOf = (b, material = 'iron') => {
  const o = {...(b.repair || {})};
  if (b.heat) o.coal = (o.coal || 0) + b.heat;
  if (b.cycles) o.tools = (o.tools || 0) + toolsPerYear(b, material);
  return o;
};
// what a town makes by its people's own hands a year, and what 100 of its people use up a season (TOWN_GOODS start, need)
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
//   might:     √people × (1 + defence + mightProd × production) — its strength against raids and armies
//   raid:      the share of a raid's harm it takes: 1 − raidFaith × faith − raidHealth × health, never below raidFloor
//   needs:     what it wants to build, 0 … ~1.5 an effect: housing and food fill as people reach full[0] of room or of
//              what the land feeds, over full[1]; defence — the threat, + defence[1] while it was raided in the last
//              `raided` years, at most defence[0], + defence[2]; the others — a base + a step a tier (trade + its road,
//              + trade[2] from tier 2; lore only from tier 2, else lore[2]; health + health[2] after a raid)
export const TOWN_FX = {room: [120, 100], mightProd: 0.3, raidFloor: 0.4, raidFaith: 0.5, raidHealth: 0.5,
  needs: {full: [0.55, 0.4], housing: [1.5], food: [1.3], raided: 6, defence: [1.5, 0.8, 0.1], trade: [0.15, 0.6, 0.3], prod: [0.4, 0.1],
    faith: [0.25, 0.15], lore: [0.25, 0.1, 0.03], prestige: [0.15, 0.15], health: [0.25, 0.1, 0.3]}};

// What a town's place must have for a building (atlas/towns.js placeHas): cells around to look, and the thresholds —
// a lake, magma, gold sand, salt (a salt lake; or the coast where it is warmer than saltSea°), clay (alluvium), stone
// (rough ground below stoneFlat of flatness or above stoneHigh of the land's height), fertile soil, a forest (tree
// cover), steep and flat ground, graves (barrows), warm (°C), dry country; `near` — the cells around for the rest
export const PLACE_AT = {near: 2, lake: 2, magma: 3, placer: 1, salt: 4, saltSea: 14, clay: 0.3, stoneFlat: 0.75, stoneHigh: 0.2, fertile: 0.5,
  forest: 0.5, steep: 0.5, flat: 0.85, graves: 3, gravesAt: 0.2, warm: 12, dry: 3};
