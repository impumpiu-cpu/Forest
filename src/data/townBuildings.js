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
//   here          in the town itself: at least one of these stands in it (a harbour wants its own pier)
//   tier          from which town step it can be built (data/peoples.js TIERS: 0 hamlet, 1 village, 2 town);
//                 the buildings that earn a step (TIERS needsAny) are built one step earlier
//   pop           and at least this many people (the great works of a big town)
//   capital       only the seat of a people's realm builds it (data/peoples.js CAPITAL, `crowned`)
//   unique        one for the whole realm (for now: the people)
//   needs         conditions of the place, all of them (PLACE_NEEDS below); needsAny — at least one
//   max           how many a town may have (houses and fields can be many), 1 if not said
//   per           a unit of work (atlas/economy.js): one more of it may stand for every `per` people of the town, beyond `max`
//                 — a field feeds a village; a town of two thousand has a dozen of them
//   ── what it does
//   house         people it houses: the town's room is TOWN_FX.room[0] + Σ house (the town does not grow past it)
//   jobs          hands it takes from the town's people to work at full strength
//   heat          wood a year its hearths burn, × the climate (cold ×1.6, mild ×1, warm ×0.4)
//   in, out       what it takes and gives a year at full strength, in TOWN_GOODS ({good: amount})
//   upgrades      housing built over an older one in place: one of these (the first the town has) gives way to it
//                 (atlas/peoples.js): the town's room grows by the difference, not by the whole
//   metals        the metals its realm's smiths work and its markets sell once one stands in the realm
//                 (data/balance/materials.js ids; a metal no building lists, everyone works)
//   fx            what it gives, per building (EFFECTS below)
//   `jobs`, `heat`, `in` and `out` are the numbers of the flows (docs/WORLD.md «Потоки построек»): drafts, in the
//   table and checked, not yet run by the towns — the next step. `house` runs now.
//   What some buildings do beyond their effects: a bridge or ferry takes the ford out of the road's cost
//   at the town (atlas/roads.js), a mint doubles the warmth of the town's trade routes (atlas/diplomacy.js),
//   a harbour opens the sea lanes (atlas/sea.js), a mage tower and a temple of the fallen hold the rot
//   off (atlas/lairs.js).
//   site          stands outside the town, in a cell of its own within the town's reach (data/sites.js,
//                 atlas/sites.js): fields, pastures, mines, quarries; its place needs hold at that cell
//   kin           the kind of a people of many kinds it is the own building of (data/peoples.js `kin`: the warg den — the
//                 orcs'): the town must hold that kind at KIN.least of its people (atlas/towns.js canBuild)
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
// The goods of a town's flows (`in`, `out`): what a year of a building takes and gives. `soft` — a good a building does
// without at half its strength (tools, arms, honey, pots); any other it cannot work without (ore for a furnace). `res` — the stock resource
// it is priced as (data/balance/prices.js), × `per` units of it in one unit of the good; `price` — gold for a good
// with no resource of its own. Food is counted in people-years: one feeds one person a year (365 rations).
export const TOWN_GOODS = new Registry('townGood');
TOWN_GOODS.registerAll([
  {id: 'food', label: 'еда', unit: 'чел.-год', get price() { return CAMPAIGN.ration * 365; }},
  {id: 'grain', label: 'зерно', unit: 'чел.-год', get price() { return CAMPAIGN.ration * 365; }, note: 'сытнее сырым на 0,8 от еды; мельница и пекарня делают из него еду'},
  {id: 'stores', label: 'заготовки', unit: 'чел.-год', price: 150, note: 'вяленое, солёное, копчёное: не портится'},
  {id: 'wood', label: 'брёвна', unit: 'шт.', res: 'wood'},
  {id: 'planks', label: 'тёс', unit: 'шт.', res: 'planks'},
  {id: 'stone', label: 'камень', unit: 'шт.', res: 'stone'},
  {id: 'clay', label: 'глина', unit: 'шт.', res: 'clay'},
  {id: 'ore', label: 'руда', unit: 'шт.', res: 'ironore', note: 'какая — по геологии места'},
  {id: 'gems', label: 'самоцветы', unit: 'шт.', res: 'gems'},
  {id: 'coal', label: 'уголь', unit: 'шт.', res: 'coal'},
  {id: 'metal', label: 'металл', unit: 'слитков', res: 'iron'},
  {id: 'fiber', label: 'волокно и шерсть', unit: 'шт.', price: 0.5},
  {id: 'cloth', label: 'ткань', unit: 'шт.', res: 'cloth'},
  {id: 'hide', label: 'шкуры', unit: 'шт.', res: 'hide'},
  {id: 'bone', label: 'кость', unit: 'шт.', res: 'bone'},
  {id: 'leather', label: 'кожа', unit: 'шт.', res: 'leather'},
  {id: 'salt', label: 'соль', unit: 'шт.', res: 'salt', soft: true, note: 'вялят и без неё, но вдвое меньше'},
  {id: 'pots', label: 'горшки', unit: 'шт.', res: 'pots', soft: true},
  {id: 'tools', label: 'орудия', unit: 'шт.', price: 3, soft: true},
  {id: 'arms', label: 'оружие', unit: 'шт.', price: 6, soft: true},
  {id: 'armor', label: 'броня', unit: 'шт.', price: 15, soft: true},
  {id: 'herbs', label: 'травы', unit: 'шт.', res: 'herbs', soft: true},
  {id: 'potions', label: 'зелья', unit: 'шт.', res: 'potion', soft: true},
  {id: 'honey', label: 'мёд и воск', unit: 'шт.', price: 1.2, soft: true},
  {id: 'drink', label: 'брага и пиво', unit: 'шт.', res: 'braga', soft: true},
  {id: 'lux', label: 'роскошь', unit: 'шт.', price: 10, soft: true},
  {id: 'gold', label: 'золото', unit: 'зол.', res: 'gold'},
  {id: 'beasts', label: 'скот', unit: 'голов', get price() { return CAMPAIGN.beasts.mule; }},
]);
// gold for one unit of a good
export const goodPrice = id => { const G = TOWN_GOODS.get(id); return G.res ? PRICE[G.res].price * (G.per ?? 1) : G.price; };

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

export const TOWN_BUILDINGS = new Registry('townBuilding');
TOWN_BUILDINGS.registerAll([
  // ── housing
  B('hut', 'шалаши', 'pl', 'housing', 0, ALL, {}, {max: 2, local: 'hut', house: 100, heat: 250, in: {wood: 30}}),
  B('yurts', 'шатры', 'pl', 'housing', 0, O, {}, {max: 8, house: 200, heat: 150, in: {hide: 20}}),   // (× the greenskins' house 0.75: 150)
  // the greenskins' horde camp: tents and wagons round a war-chief's hall on step 2, in place of the tents (× 0.75: 300)
  B('hordecamp', 'стан орды', 'm', 'housing', 2, O, {defence: 0.1, prestige: 0.05}, {max: 8, upgrades: ['yurts'], house: 400, heat: 120, in: {hide: 25, wood: 20}}),
  B('house', 'избы', 'pl', 'housing', 1, [...H], {}, {max: 6, needsAny: ['forest', 'clay'], local: 'house', upgrades: ['hut'], house: 200, heat: 120, in: {planks: 15}}),
  B('longhouse', 'длинный дом', 'm', 'housing', 1, [...H, ...O], {prestige: 0.03}, {max: 4, needs: ['forest'], upgrades: ['yurts', 'hut'], house: 250, heat: 150, in: {wood: 30}}),
  B('treehouse', 'дома на деревьях', 'pl', 'housing', 1, E, {}, {max: 8, needs: ['forest'], house: 300, heat: 60, in: {wood: 10}, out: {wood: 15}, upgrades: ['hut']}),
  // the elves' hall in the crowns of the old trees: the tree-houses of a big town grown together; the wood still gives
  B('elfhall', 'древесный чертог', 'm', 'housing', 2, E, {prestige: 0.05}, {max: 8, needs: ['forest'], house: 450, heat: 50, in: {wood: 15}, out: {wood: 20}, upgrades: ['treehouse']}),
  B('hallhomes', 'подгорные жилища', 'pl', 'housing', 1, D, {defence: 0.05}, {max: 8, needsAny: ['steep', 'caves'], local: 'hallhome', upgrades: ['hut'], house: 400, heat: 40, in: {stone: 10}}),   // the mountain keeps the warmth: little wood to heat
  // the dwarves' deep hall: their homes under the mountain grown into one — the densest housing of the world
  B('deephall', 'подгорный чертог', 'm', 'housing', 2, D, {defence: 0.08, prestige: 0.05}, {max: 8, needsAny: ['steep', 'caves'], upgrades: ['hallhomes'], house: 700, heat: 30, in: {stone: 15}}),
  B('stonehouse', 'каменные дома', 'pl', 'housing', 2, [...H, ...D], {defence: 0.03}, {max: 8, needs: ['stone'], requires: ['quarry'], upgrades: ['house', 'hut'], house: 400, heat: 150, in: {stone: 15}}),
  B('barracks', 'казармы', 'pl', 'housing', 2, [...H, ...D, ...O], {defence: 0.25}, {requiresAny: ['armory', 'warcamp'], house: 100, jobs: 30, heat: 60, in: {arms: 3, armor: 1}}),
  // ── food
  B('garden', 'огороды', 'pl', 'food', 0, ALL, {food: 0.15}, {per: 250, max: 3, needs: ['fertile'], local: 'garden', site: true, jobs: 15, out: {food: 35, herbs: 10}}),
  B('field', 'пашни', 'pl', 'food', 0, [...H, ...E, ...O], {food: 0.3}, {per: 150, max: 4, needs: ['fertile', 'flat'], local: 'field', site: true, jobs: 30, in: {tools: 5}, out: {grain: 110, fiber: 100}}),
  B('grove', 'плодовые рощи', 'pl', 'food', 1, E, {food: 0.3}, {per: 150, max: 4, needsAny: ['forest', 'fertile'], site: true, jobs: 12, out: {food: 45, wood: 20, herbs: 7, fiber: 30}}),
  B('mushrooms', 'грибные пещеры', 'pl', 'food', 1, D, {food: 0.3}, {per: 150, max: 4, needsAny: ['caves', 'steep'], local: 'mushcave', site: true, jobs: 15, out: {food: 50, grain: 20}}),   // and mushroom malt: the mill, the quern and the brewery live on it
  B('pen', 'загоны', 'pl', 'food', 0, [...H, ...D], {food: 0.15}, {per: 300, max: 2, needs: ['pasture'], local: 'pen', site: true, jobs: 8, out: {food: 20, fiber: 120, hide: 30, beasts: 4}}),
  // the greenskins' pens: big herds for meat and for war — more room, more food (on the local map their pen holds twice as
  // many: data/buildings.js penRoom)
  B('grpens', 'загоны зеленокожих', 'pl', 'food', 0, O, {food: 0.25}, {per: 200, max: 4, needs: ['pasture'], local: 'pen', site: true, jobs: 10, out: {food: 40, fiber: 100, hide: 50, bone: 30, beasts: 8}}),
  // the kinds' own (data/peoples.js `kin`: each wants its kind in the town): the gnolls' hyena dens, the ogres' meat pots
  B('hyenadens', 'гиеньи норы', 'pl', 'food', 0, O, {food: 0.1, defence: 0.1}, {kin: 'gnoll', per: 600, max: 2, jobs: 4, out: {food: 15, bone: 40, beasts: 2}}),
  B('meatpots', 'мясные котлы', 'pl', 'food', 1, O, {food: 0.2}, {kin: 'ogre', per: 800, requiresAny: ['lodge', 'grpens', 'pasture'], jobs: 3, in: {wood: 30}, out: {food: 40, bone: 20}}),
  B('pasture', 'выгоны и стада', 'pl', 'food', 1, [...H, ...O], {food: 0.25, prod: 0.05}, {per: 300, max: 3, needs: ['pasture'], site: true, jobs: 15, out: {food: 40, fiber: 200, hide: 60, beasts: 8}}),
  B('lodge', 'охотничий навес', 'm', 'food', 0, ALL, {food: 0.1}, {per: 400, needsAny: ['forest', 'pasture'], local: 'lodge', site: true, jobs: 10, in: {arms: 2}, out: {food: 25, hide: 80, bone: 80}}),
  B('fishhut', 'рыбацкие хижины', 'pl', 'food', 0, ALL, {food: 0.15}, {per: 300, max: 2, needs: ['water'], local: 'fishhut', site: true, jobs: 10, in: {fiber: 20}, out: {food: 30}}),
  B('pier', 'рыбная пристань', 'f', 'food', 1, ALL, {food: 0.25, trade: 0.05}, {per: 600, needsAny: ['coast', 'lake'], site: true, jobs: 20, in: {planks: 15, fiber: 30}, out: {food: 70}}),
  B('quern', 'ручные жернова', 'pl', 'food', 0, ALL, {food: 0.05}, {per: 600, local: 'quern', jobs: 2, in: {grain: 12}, out: {food: 14}}),
  B('watermill', 'водяная мельница', 'f', 'food', 2, [...H, ...D], {food: 0.2, prod: 0.1}, {per: 1500, needs: ['river'], requiresAny: ['field', 'garden', 'mushrooms'], site: true, jobs: 4, in: {grain: 60}, out: {food: 72}}),
  B('windmill', 'ветряная мельница', 'f', 'food', 1, H, {food: 0.15}, {per: 1500, needs: ['flat'], requires: ['field'], site: true, jobs: 4, in: {grain: 40}, out: {food: 48}}),
  B('bakery', 'пекарня', 'f', 'food', 2, [...H, ...D], {food: 0.1, health: 0.05}, {per: 1000, requiresAny: ['watermill', 'windmill'], jobs: 4, in: {food: 60, wood: 80}, out: {food: 75}}),
  B('smokehouse', 'коптильня', 'f', 'food', 1, ALL, {food: 0.1}, {per: 800, requiresAny: ['lodge', 'fishhut', 'pen'], local: 'smokehouse', jobs: 3, in: {food: 20, wood: 40}, out: {stores: 28}}),
  B('dryrack', 'вешала и бочки', 'pl', 'food', 0, ALL, {food: 0.05}, {per: 600, local: 'dryrack', jobs: 2, in: {food: 12, salt: 6}, out: {stores: 12}}),
  B('granary', 'амбар', 'm', 'food', 0, ALL, {food: 0.15}, {local: 'granary', jobs: 1}),
  B('cellar', 'погреба и ледники', 'pl', 'food', 2, [...H, ...D], {food: 0.1, health: 0.05}, {jobs: 1}),
  B('apiary', 'пасека', 'f', 'food', 1, [...H, ...E], {food: 0.05, prod: 0.05}, {per: 1500, needsAny: ['forest', 'fertile'], needs: ['warm'], site: true, jobs: 2, out: {honey: 60}}),
  B('brewery', 'пивоварня', 'f', 'food', 2, [...H, ...D, ...O], {prod: 0.1, prestige: 0.05}, {per: 1500, requiresAny: ['field', 'garden', 'mushrooms'], jobs: 4, in: {grain: 20}, out: {drink: 800}}),
  B('vineyard', 'виноградники', 'pl', 'food', 2, [...H, ...E], {trade: 0.15, prestige: 0.05}, {per: 1500, needs: ['warm', 'fertile'], site: true, jobs: 10, out: {lux: 20}}),
  // ── raw materials
  B('woodcut', 'лесосека', 'f', 'raw', 0, [...H, ...D, ...O], {prod: 0.1}, {per: 400, needs: ['forest'], site: true, jobs: 8, in: {tools: 2}, out: {wood: 600}}),
  // elves do not fell the wood: they take what it gives — honey, wax, resin, dyes
  B('forestry', 'лесной промысел', 'm', 'raw', 0, E, {prod: 0.15, trade: 0.05}, {per: 300, needs: ['forest'], site: true, jobs: 8, out: {wood: 200, planks: 60, fiber: 60, hide: 20, herbs: 40, honey: 20, gems: 1}}),
  B('sawmill', 'лесопилка', 'f', 'raw', 1, [...H, ...D, ...E], {prod: 0.15}, {per: 600, needs: ['forest'], local: 'sawmill', site: true, jobs: 4, in: {wood: 160, tools: 1}, out: {planks: 100}}),
  B('quarry', 'каменоломня', 'f', 'raw', 0, [...H, ...D, ...E, ...O], {prod: 0.1}, {per: 600, needs: ['stone'], local: 'quarry', site: true, jobs: 8, in: {tools: 3}, out: {stone: 500}}),
  B('claypit', 'глиняный карьер', 'm', 'raw', 0, [...H, ...D, ...E], {prod: 0.05}, {per: 800, needs: ['clay'], site: true, jobs: 4, out: {clay: 300}}),
  B('mineshaft', 'рудник', 'm', 'raw', 0, [...H, ...D, ...O], {prod: 0.25, trade: 0.1}, {per: 600, needs: ['ore'], local: 'mineshaft', notable: true, site: true, jobs: 12, in: {tools: 6, wood: 40}, out: {ore: 240, gems: 4}}),
  B('deepmine', 'глубокие шахты', 'pl', 'raw', 2, D, {prod: 0.3, trade: 0.15}, {per: 1000, needsAny: ['ore', 'gems', 'precious'], requires: ['mineshaft'], site: true, jobs: 20, in: {tools: 10, wood: 60}, out: {ore: 500, gems: 15}}),
  B('charpit', 'углежогная яма', 'f', 'raw', 1, [...H, ...D, ...O], {prod: 0.05}, {per: 800, needs: ['forest'], local: 'charpit', site: true, jobs: 3, in: {wood: 200}, out: {coal: 150}}),
  B('coalpit', 'угольные копи', 'pl', 'raw', 1, [...H, ...D], {prod: 0.15}, {per: 1000, needs: ['coal'], site: true, jobs: 8, in: {tools: 3}, out: {coal: 300}}),
  B('saltworks', 'солеварня', 'f', 'raw', 1, [...H, ...D, ...E], {trade: 0.2, food: 0.05}, {per: 1500, needs: ['salt'], site: true, jobs: 5, in: {wood: 80}, out: {salt: 200}}),
  B('placer', 'золотой прииск', 'm', 'raw', 1, [...H, ...D, ...O], {trade: 0.2}, {per: 1500, needs: ['placer'], notable: true, site: true, jobs: 6, in: {tools: 1}, out: {gold: 200}}),
  // ── crafts
  B('loom', 'ткацкая', 'f', 'craft', 1, ALL, {prod: 0.1}, {per: 600, local: 'loom', jobs: 4, in: {fiber: 120}, out: {cloth: 40}}),
  B('potter', 'гончарня', 'f', 'craft', 1, [...H, ...D, ...E], {prod: 0.05}, {per: 800, needs: ['clay'], local: 'potter', jobs: 3, in: {clay: 60, wood: 40}, out: {pots: 90}}),
  B('tannery', 'дубильня', 'f', 'craft', 1, [...H, ...D, ...E, ...O], {prod: 0.1}, {per: 600, requiresAny: ['lodge', 'pen', 'pasture'], local: 'tannery', jobs: 3, in: {hide: 60}, out: {leather: 60}}),
  B('crafthut', 'мастерская ремесленника', 'f', 'craft', 1, ALL, {prod: 0.1}, {per: 500, local: 'crafthut', jobs: 4, in: {wood: 40, bone: 20, leather: 20}, out: {tools: 15, arms: 10}}),
  B('smelter', 'плавильный горн', 'm', 'craft', 1, [...H, ...D, ...O], {prod: 0.15}, {per: 800, requires: ['mineshaft'], local: 'smelter', jobs: 4, in: {ore: 120, coal: 60}, out: {metal: 60}, metals: ['bronze']}),
  B('forge', 'кузня', 'f', 'craft', 1, [...H, ...D, ...O], {prod: 0.2, defence: 0.1}, {per: 800, requires: ['smelter'], local: 'forge', notable: true, jobs: 4, in: {metal: 50, coal: 25, leather: 10}, out: {tools: 15, arms: 10, armor: 2}, metals: ['iron']}),
  B('foundry', 'литейня', 'f', 'craft', 2, [...H, ...D], {prod: 0.25, trade: 0.1}, {per: 2000, requires: ['forge'], pop: 800, jobs: 10, in: {metal: 120, coal: 100}, out: {tools: 30, arms: 10, armor: 6}, metals: ['steel']}),
  B('magmaforge', 'магмовая кузня', 'f', 'craft', 2, D, {prod: 0.35, prestige: 0.2, defence: 0.1}, {needs: ['magma'], requires: ['forge'], local: 'magmaforge', pop: 800, jobs: 6, in: {metal: 60}, out: {arms: 15, armor: 5, lux: 3}, metals: ['mithril', 'steel']}),
  // the dwarves' golem forge: a golem a season — it takes over a work of the town, or stands guard (atlas/golems.js, GOLEMS)
  B('golemforge', 'кузня големов', 'f', 'craft', 2, D, {prod: 0.2, defence: 0.1}, {requires: ['forge'], local: 'golemforge', notable: true, jobs: 6, in: {metal: 40, coal: 20}}),
  B('jeweler', 'ювелирная мастерская', 'f', 'craft', 2, [...H, ...D, ...E], {prod: 0.1, trade: 0.2, prestige: 0.1}, {per: 1500, needs: ['gems'], local: 'jeweler', jobs: 3, in: {gems: 8, metal: 4}, out: {lux: 10}, metals: ['silver']}),
  B('armory', 'оружейная', 'f', 'craft', 2, ALL, {defence: 0.2}, {requiresAny: ['crafthut', 'forge'], local: 'armory', jobs: 2}),
  B('bowyer', 'мастерская луков', 'f', 'craft', 1, [...E, ...H], {defence: 0.15}, {per: 600, needs: ['forest'], jobs: 3, in: {wood: 30, fiber: 16}, out: {arms: 20}}),
  // bark and withies woven over leather: the elves' armour, of the sacred tree where it grows
  B('barkworks', 'мастерская коры', 'f', 'craft', 1, E, {defence: 0.1}, {per: 600, needs: ['forest'], jobs: 3, in: {wood: 40, fiber: 20, leather: 10}, out: {armor: 4}}),
  B('shipyard', 'верфь', 'f', 'craft', 2, [...H, ...E], {trade: 0.25, prod: 0.1}, {needs: ['coast', 'forest'], jobs: 15, in: {planks: 200, fiber: 40, cloth: 30}}),
  B('glassworks', 'стеклодувня', 'f', 'craft', 2, [...H, ...D], {prod: 0.1, trade: 0.1, prestige: 0.05}, {needsAny: ['coast', 'clay'], pop: 800, jobs: 5, in: {clay: 60, wood: 120}, out: {lux: 8}}),
  B('alchemist', 'лаборатория алхимика', 'f', 'craft', 2, [...H, ...E, ...D], {lore: 0.15, health: 0.1}, {per: 2000, pop: 800, jobs: 2, in: {herbs: 40, pots: 20}, out: {potions: 20}}),
  B('hearth', 'общинный очаг', 'm', 'life', 0, [...H, ...D], {health: 0.05}, {per: 1000, local: 'hearth', jobs: 2, in: {food: 20, wood: 30}, out: {food: 24}}),
  // ── trade and ways
  B('ferry', 'перевоз', 'm', 'trade', 0, [...H, ...E, ...O], {trade: 0.05}, {needs: ['river'], jobs: 2, out: {gold: 20}}),
  B('bridge', 'мост', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, {needs: ['river'], requires: ['quarry'], in: {stone: 10}}),
  // the humans' own (docs/WORLD.md «Асимметрия народов»): the tilt-yard raises knights (data/raids.js host: the knight, the
  // champion), the hippodrome horse-knights, the den cutthroats; the trading post doubles a trade route's worth (atlas/diplomacy.js)
  B('tiltyard', 'ристалище', 'n', 'defence', 1, H, {defence: 0.15, prestige: 0.15}, {requiresAny: ['forge', 'armory'], local: 'tiltyard', notable: true, jobs: 6, in: {arms: 2, armor: 3, food: 10}}),
  B('hippodrome', 'ипподром', 'm', 'defence', 2, H, {defence: 0.15, prestige: 0.1}, {requires: ['tiltyard'], needsAny: ['flat', 'pasture'], notable: true, jobs: 8, in: {food: 20, fiber: 40}, out: {beasts: 3}}),
  B('den', 'притон', 'm', 'trade', 1, H, {trade: 0.15}, {needs: ['road'], local: 'den', jobs: 2, in: {drink: 60}, out: {gold: 30}}),
  B('tradepost', 'торговый пост', 'm', 'trade', 1, H, {trade: 0.35}, {needs: ['road'], local: 'tradepost', notable: true, jobs: 3, in: {food: 5}, out: {gold: 40}}),
  B('inn', 'постоялый двор', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, {needs: ['road'], jobs: 3, in: {food: 4, wood: 30, drink: 100}, out: {gold: 60}}),
  B('toll', 'дорожная застава', 'f', 'trade', 1, [...H, ...D, ...O], {trade: 0.05, defence: 0.05}, {needs: ['road'], jobs: 3, out: {gold: 40}}),
  B('market', 'рынок', 'm', 'trade', 1, ALL, {trade: 0.3, prestige: 0.05}, {jobs: 4}),
  B('warehouse', 'торговые склады', 'pl', 'trade', 2, [...H, ...D], {trade: 0.15}, {requires: ['market'], jobs: 2}),
  B('caravanserai', 'караван-сарай', 'm', 'trade', 2, [...H, ...O], {trade: 0.25}, {needs: ['road', 'dry'], jobs: 4, in: {food: 6, grain: 6}, out: {gold: 80}}),
  // the harbour opens the sea lanes (atlas/sea.js): traffic to other harbours, faster than any road
  B('harbor', 'гавань', 'f', 'trade', 2, [...H, ...E], {trade: 0.35}, {needs: ['coast'], here: ['pier'], notable: true, jobs: 10, in: {planks: 20}, out: {gold: 120, food: 60}}),
  B('lighthouse', 'маяк', 'm', 'trade', 1, [...H, ...E], {trade: 0.1, defence: 0.05}, {needs: ['coast'], here: ['pier', 'fishhut'], jobs: 1, in: {wood: 40}}),
  B('riverpier', 'речная пристань', 'f', 'trade', 1, [...H, ...E, ...O], {trade: 0.1, food: 0.05}, {needs: ['river'], requiresAny: ['ferry', 'fishhut'], jobs: 4, in: {planks: 6}, out: {food: 5, gold: 20}}),
  B('mint', 'монетный двор', 'm', 'trade', 2, [...H, ...D], {trade: 0.2, prestige: 0.15}, {needs: ['precious'], requires: ['market'], pop: 800, capital: true, jobs: 4, in: {gold: 100}, out: {gold: 160}}),
  // ── defence
  B('palisade', 'частокол', 'm', 'defence', 1, [...H, ...O], {defence: 0.25}, {needs: ['forest'], local: 'palisade', in: {wood: 40}}),
  // a hedge of thorn grown round the town instead of a palisade: it holds, slows and tears whoever comes through
  B('thornhedge', 'колючая изгородь', 'f', 'defence', 1, E, {defence: 0.3}, {local: 'thornhedge', jobs: 1, in: {wood: 10}}),
  B('watchtower', 'сторожевая вышка', 'f', 'defence', 1, ALL, {defence: 0.15}, {local: 'watchtower', jobs: 2, in: {wood: 5}}),
  B('hiddenpaths', 'тайные тропы', 'pl', 'defence', 1, E, {defence: 0.35}, {needs: ['forest'], jobs: 3}),
  // the orcs' warg den: riders on wargs (data/raids.js wargrider); the goblins' spider den: riders on spiders, and silk;
  // the fighting pits: wild beasts and monsters of the land about broken to war (atlas/beasts.js), the beast-drivers
  B('wargden', 'логово варгов', 'n', 'defence', 1, O, {defence: 0.15, prestige: 0.05}, {kin: 'orc', requiresAny: ['grpens', 'pasture'], local: 'wargden', notable: true, jobs: 4, in: {food: 30}, out: {beasts: 4}}),
  B('spiderden', 'логово пауков', 'n', 'defence', 1, O, {defence: 0.1, prod: 0.05}, {kin: 'goblin', needsAny: ['forest', 'caves', 'steep'], local: 'spiderden', notable: true, jobs: 3, in: {food: 15}, out: {cloth: 30, fiber: 40}}),
  B('fightpits', 'бойцовские ямы', 'pl', 'defence', 1, O, {defence: 0.15, prestige: 0.1}, {local: 'fightpits', notable: true, jobs: 6, in: {food: 20, arms: 2}}),
  B('trollgate', 'топь-застава', 'f', 'trade', 1, O, {trade: 0.2, defence: 0.05}, {kin: 'troll', needs: ['road'], jobs: 4, out: {lux: 4}}),   // the trolls' toll on a road through the marsh
  B('warcamp', 'боевой стан', 'm', 'defence', 1, O, {defence: 0.3, prestige: 0.1}, {jobs: 30, in: {arms: 4, armor: 1}}),
  B('earthwall', 'земляной вал', 'm', 'defence', 1, O, {defence: 0.3}, {requires: ['warcamp']}),
  B('stonewall', 'каменные стены', 'pl', 'defence', 1, [...H, ...D], {defence: 0.5}, {needs: ['stone'], requires: ['quarry'], local: 'stonewall', in: {stone: 30}}),
  B('tunnels', 'подземные ходы', 'pl', 'defence', 1, D, {defence: 0.2, trade: 0.1}, {needsAny: ['steep', 'caves'], jobs: 2, in: {wood: 10}}),
  B('tower', 'крепостные башни', 'pl', 'defence', 2, [...H, ...D], {defence: 0.3}, {requires: ['stonewall'], jobs: 10, in: {stone: 15, arms: 2}}),
  B('citadel', 'цитадель', 'f', 'defence', 2, [...H, ...D], {defence: 0.6, prestige: 0.2}, {requires: ['tower'], pop: 800, jobs: 40, in: {stone: 40, arms: 6, armor: 3}}),
  // ── faith
  B('shrine', 'святилище', 'n', 'faith', 0, ALL, {faith: 0.15}, {local: 'shrine', jobs: 1, in: {honey: 5}}),
  B('shamanhut', 'хижина шамана', 'f', 'faith', 0, O, {faith: 0.15, health: 0.1}, {jobs: 1, in: {herbs: 15}}),
  B('sacredgrove', 'священная роща', 'f', 'faith', 0, E, {faith: 0.3}, {needs: ['forest'], jobs: 2, out: {herbs: 13, gems: 2, gold: 10}}),
  B('stonecircle', 'каменный круг', 'm', 'faith', 0, [...H, ...O], {faith: 0.2}, {needsAny: ['stone', 'steep']}),
  B('ancestorhall', 'зал предков', 'm', 'faith', 1, D, {faith: 0.3, prestige: 0.1}, {requires: ['shrine'], jobs: 2, in: {honey: 5}}),
  B('temple', 'храм', 'm', 'faith', 1, [...H, ...E, ...D], {faith: 0.3, prestige: 0.1}, {requires: ['shrine'], jobs: 4, in: {honey: 15, lux: 1}}),
  B('crypt', 'усыпальница', 'f', 'faith', 2, [...H, ...D], {faith: 0.1}, {jobs: 1, in: {stone: 5}}),
  // by the barrows of old battles: the fallen are laid to rest, and the rot around fades (atlas/lairs.js stepRot)
  B('fallentemple', 'храм павших', 'm', 'faith', 1, ALL, {faith: 0.25, health: 0.05}, {needs: ['graves'], requires: ['shrine'], notable: true, jobs: 3, in: {honey: 10}}),
  B('catacombs', 'катакомбы', 'pl', 'faith', 2, D, {faith: 0.1, health: 0.05}, {needs: ['caves'], requires: ['ancestorhall'], house: 100, jobs: 1, in: {stone: 5}}),
  B('cemetery', 'кладбище', 'n', 'faith', 1, ALL, {faith: 0.05, health: 0.05}, {jobs: 1}),
  // ── lore
  B('school', 'школа', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.15}, {jobs: 3, in: {cloth: 5}}),
  B('library', 'библиотека', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.3, prestige: 0.1}, {requires: ['school'], pop: 800, jobs: 4, in: {lux: 2}}),
  // the wards of a mage tower hold the dead off (atlas/lairs.js: the undead's raids on it fail oftener, the rot around fades)
  B('magetower', 'башня мага', 'f', 'lore', 2, [...H, ...E], {lore: 0.3, defence: 0.15, prestige: 0.15}, {pop: 800, notable: true, jobs: 3, in: {potions: 5, lux: 2}}),
  // ── power and fame
  B('eldershall', 'дом старейшин', 'm', 'power', 0, ALL, {prestige: 0.1}, {jobs: 2}),
  B('townhall', 'ратуша', 'f', 'power', 2, [...H, ...D], {prestige: 0.2, trade: 0.05}, {requires: ['eldershall'], jobs: 6}),
  B('palace', 'дворец', 'm', 'power', 2, [...H, ...E], {prestige: 0.4}, {requiresAny: ['townhall', 'eldershall'], pop: 800, capital: true, jobs: 20, in: {lux: 10, food: 10}}),
  B('arena', 'арена', 'f', 'power', 2, [...O, ...H], {prestige: 0.15, defence: 0.05}, {jobs: 4, in: {food: 5, drink: 100}}),
  B('monument', 'памятник', 'm', 'power', 2, ALL, {prestige: 0.15}, {pop: 800, in: {stone: 20}}),
  // the throne hall crowns a people's seat: one per realm, only its capital builds it (data/peoples.js CAPITAL)
  B('throne', 'тронный зал', 'm', 'power', 2, ALL, {prestige: 0.3, trade: 0.1, defence: 0.1}, {pop: 800, capital: true, unique: true, requiresAny: ['eldershall', 'townhall', 'ancestorhall', 'warcamp'], notable: true, jobs: 10, in: {lux: 15}}),
  // ── life and health
  B('well', 'колодец', 'm', 'life', 1, ALL, {health: 0.1}, {local: 'well', in: {stone: 2}}),
  B('healerhut', 'хижина лекаря', 'f', 'life', 1, ALL, {health: 0.15}, {per: 800, local: 'healerhut', jobs: 2, in: {herbs: 20, pots: 10}, out: {potions: 10}}),
  B('hospice', 'лечебница', 'f', 'life', 2, [...H, ...E], {health: 0.25}, {requires: ['healerhut'], jobs: 6, in: {herbs: 40, cloth: 10}}),
  B('bathhouse', 'баня', 'f', 'life', 2, [...H, ...D], {health: 0.15}, {needs: ['water'], jobs: 3, in: {wood: 120}}),
  B('aqueduct', 'акведук', 'm', 'life', 2, H, {health: 0.2}, {needs: ['stone'], pop: 800, house: 100, jobs: 2, in: {stone: 20}}),
]);

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

// How a town lives by its buildings' flows (atlas/economy.js), a year:
//   order     — the categories in the order the town's hands are shared out: food first, the great works last
//   rounds    — rounds of sharing the goods out between the buildings that take them (each gets its share of what is made)
//   soft      — the strength a building keeps without a soft good it takes
//   captured  — the strength of a building of another people (taken, or built before): it works, but at this share
//   grain     — a people-year of grain eaten as it is feeds this much (a mill and a bakery make it bread)
//   slaves    — a town's slaves (t.slaves, the orcs' raids): they work first, at `work` of a free hand, in at most `share`
//               of a building's places (the rest — masters and overseers — are free); they eat as the town's people do;
//               each year `waste` of them are gone (dead, run off, freed)
//   build     — a town builds one more thing a year for every `build` of its people (beyond the step's one or two)
//   heat      — the climate's weight on the wood a town burns to keep warm (atlas/economy.js heatFactor)
export const TOWN_FLOW = {boats: {by: 'shipyard', k: 1.5, fish: ['fishhut', 'pier', 'harbor', 'riverpier']},
  sea: {fishhut: 0.3, pier: 0.5, harbor: 0.7}, trade: {give: 0.8, keep: 0.1},
  order: ['food', 'raw', 'craft', 'life', 'housing', 'defence', 'faith', 'trade', 'lore', 'power'],
  rounds: 8, soft: 0.5, captured: 0.5, grain: 0.8, slaves: {work: 0.6, share: 0.8, waste: 0.1}, build: 400, hands: 0.5, shortAt: 0.01,
  heat: {cold: -2, warm: 14, k: [1.6, 0.4]}};   // heat × k[0] at or below `cold` °C, × k[1] at or above `warm` (a year's mean), between in a line

// The golems of a golem forge (atlas/golems.js): a season after the forge stands, a golem each season — of the best metal
// its realm works (`tiers`, data/townBuildings.js `metals`). First it takes over a unit of work (`order`: the mine first),
// one for every `per` people (at least one): the unit needs `jobs` of its hands and gives `bonus` more by the golem's metal;
// then it remakes the takers in a better metal, once the realm works one; then it stands guard — one for every `per` people,
// each worth `men` of the town's people in its might and its army (atlas/towns.js might, atlas/diplomacy.js muster).
export const GOLEMS = {
  order: ['mineshaft', 'deepmine', 'quarry', 'smelter', 'forge', 'foundry', 'coalpit', 'charpit', 'sawmill', 'woodcut', 'claypit', 'saltworks',
    'crafthut', 'tannery', 'loom', 'potter', 'jeweler', 'glassworks', 'mushrooms', 'watermill', 'bakery', 'brewery'],
  tiers: ['bronze', 'iron', 'steel', 'mithril'],
  per: 400, jobs: 0.5,
  bonus: {bronze: 0.25, iron: 0.35, steel: 0.45, mithril: 0.6},
  men: {bronze: 4, iron: 6, steel: 8, mithril: 12},
};

// How a town's buildings work (atlas/towns.js), on top of their effects:
//   room:      the people its houses hold: room[0] + Σ house (room[1] — people a point of the `housing` need stands for)
//   might:     √people × (1 + defence + mightProd × production) — its strength against raids and armies
//   raid:      the share of a raid's harm it takes: 1 − raidFaith × faith − raidHealth × health, never below raidFloor
//   needs:     what it wants to build, 0 … ~1.5 an effect: housing and food fill as people reach full[0] of room or of
//              what the land feeds, over full[1]; defence — the threat, + defence[1] while it was raided in the last
//              `raided` years, at most defence[0], + defence[2]; the others — a base + a step a tier (trade + its road,
//              + trade[2] from tier 2; lore only from tier 2, else lore[2]; health + health[2] after a raid)
// flow: a town's choice by its economy (atlas/towns.js chooseBuilding) — `short` × the share of a good its buildings lack, for a
//   building that gives it; `spare` × the share of a good it makes and nothing takes, for a building that takes it; `food` × the food need, for one that gives food; a building that wants `hands` × its jobs and finds
//   fewer free is worth `idle` of itself
export const TOWN_FX = {room: [120, 100], work: 0.5, mightProd: 0.3, raidFloor: 0.4, raidFaith: 0.5, raidHealth: 0.5, flow: {short: 0.6, spare: 0.3, food: 0.4, hands: 0.5, idle: 0.3},
  needs: {full: [0.55, 0.4], housing: [1.5], food: [1.3, 0.1], raided: 6, defence: [1.5, 0.8, 0.1], trade: [0.15, 0.6, 0.3], prod: [0.4, 0.1],
    faith: [0.25, 0.15], lore: [0.25, 0.1, 0.03], prestige: [0.15, 0.15], health: [0.25, 0.1, 0.3]}};

// What a town's place must have for a building (atlas/towns.js placeHas): cells around to look, and the thresholds —
// a lake, magma, gold sand, salt (a salt lake; or the coast where it is warmer than saltSea°), clay (alluvium), stone
// (rough ground below stoneFlat of flatness or above stoneHigh of the land's height), fertile soil, a forest (tree
// cover), steep and flat ground, graves (barrows), warm (°C), dry country; `near` — the cells around for the rest
export const PLACE_AT = {near: 2, lake: 2, magma: 3, placer: 1, salt: 4, saltSea: 14, clay: 0.3, stoneFlat: 0.75, stoneHigh: 0.2, fertile: 0.5,
  forest: 0.5, steep: 0.5, flat: 0.7, graves: 3, gravesAt: 0.2, warm: 12, dry: 3};
