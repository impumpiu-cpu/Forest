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
//   heat          the warmth a year its hearths burn, × the climate (cold ×1.6, mild ×1, warm ×0.4), in charges of fuel
//   fire          the heat a year its work burns — a furnace, a forge, a kiln, a kitchen's fire — in charges of fuel. Both burn
//                 any fuel (FUEL: a log is 1 charge, coal 3): what the town has of it, the dearer charge last
//   in, out       what it takes and gives a year at full strength, in TOWN_GOODS ({good: amount})
//   dig           a mine: {n, ores, coal}: n ore a year of the kinds in `ores`, by how rich its cell is in each (ORE_GOODS), and
//                 `coal` charges of fuel × how rich it is in coal
//   placeOut      {good: place need}: of its `out` only what its place has (the quarry: stone on slopes, clay in the flood plain)
//   yields        {good of its pool: {good: k}}: what it makes of what it took of its pool (the mint: coin of gold, the luxury workshop)
//   any           what it takes of a pool of goods (POOLS: `bars` — any ingots, `rite` — ingots by worth, `coin`, `finery`)
//   ── the chains of 6.1 (docs/WORLD.md «Цепочки 6.1»)
//   kind, line    the kind of its row (base, variant, tier, annex, upgrade: B, V, T, A, U below) and its card
//   opens         the indicators it lights while one of it stands (INDICATORS)
//   recipes       [{id, name, req, in, fire, any, out, opens}]: they run while their `req` indicators are lit and share its strength
//   req           the indicators it stands without (the steelworks: iron ingots in the store)
//   soft          goods of `in` this building does without at TOWN_FLOW.soft (as a good marked `soft` in TOWN_GOODS): a
//                 fisher's hut without twine for its nets, a craftsman's shop without bone and leather
//   upgrades      housing or a tier built over an older one in place: one of these (the first the town has) gives way to it
//                 (atlas/peoples.js): the town's room grows by the difference, not by the whole; a tier counts as it (lineHas)
//   metals        the metals its realm's smiths work and its markets sell once one stands in the realm
//                 (data/balance/materials.js ids; a metal no building lists, everyone works)
//   fx            what it gives, per building (EFFECTS below)
//   fxBy          {people: {effect: value}}: what it gives a people besides `fx` (the humans' temples keep a church school)
//   boost         {building: share}: the town's buildings of that kind give this much more of what they make while this one
//                 works (the plough: fields +25%; the apiary: +10%), × its strength
//   vec           where it pulls its realm along the three vectors of the council (data/mind.js): {agg, grow, econ}; none —
//                 counted from its effects and what it gives (VEC_RULES)
//   `jobs`, `heat`, `in` and `out` are the numbers of the flows (docs/WORLD.md «Потоки построек»), run by the towns each season
//   (atlas/economy.js).
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
import {reqNeeds, litFacts} from './requirements.js';
import {meets} from '../core/requirements.js';
import {RESOURCES as PRICE, CAMPAIGN} from './balance/prices.js';

export const CATEGORIES = {
  housing: 'жильё', food: 'еда', raw: 'добыча', craft: 'ремесло', trade: 'торговля и пути',
  defence: 'оборона', faith: 'вера', lore: 'знание', power: 'власть и слава', life: 'быт и здоровье',
};

// What the effects mean in a town's evaluation (atlas/towns.js):
//   housing   not set by hand: Σ `house` / 100 of the buildings (atlas/towns.js townFx), so the town's needs and
//             its people's taste still weigh room as before
//   food      the stores (granary, cellar, the larder, salt): a siege lasts longer, a murrain and a hard winter
//             take fewer, bread is cheaper — what feeds is the buildings' `out` (atlas/economy.js), not this
//   prod      making: wealth of the town, and the might of its arms with defence
//   trade     + share of the traffic it sends down the roads, and of its growth
//   defence   + share of its might against monsters and raids
//   faith     steadiness: a raid costs less;  lore — knowledge (magic and schooling later)
//   prestige  draws settlers: faster growth, and its people's land spreads further from it
//   health    fewer die in a raid or a murrain
// The goods of a town's flows (`in`, `out`): what a year of a building takes and gives (docs/WORLD.md «Цепочки 6.1»). `soft` — a
// good a building does without at half its strength (tools, arms, ware); any other it cannot work without (ore for a furnace).
// `res` — the stock resource it is priced as (data/balance/prices.js), × `per` units of it in one unit of the good; `price` — gold
// for a good with no resource of its own. Food is counted in people-years: one feeds one person a year (365 rations). `raw` —
// the one raw food (grain, meat, fish, fruit, mushrooms, honey, meal — all one): nobody eats it as it is (a people that does:
// data/peoples.js eatsRaw); the kitchens cook it into food, the larder puts it up as stores, the brewery brews it. What kind of
// raw food a town has is not a good but an indicator (INDICATORS: the field lights «зерно», the grove «плоды»). Ores are raw
// resources (only for the smelter), ingots processed ones (for the forge, the luxury workshop, the mint); five metal streams —
// bronze, iron and steel, silver, gold, mithril — each its own ore and its own ingots. Fuel is one good of charges (coal of the
// charcoal burners and of the mines, the herds' dung); logs burn too, a charge a log, and the brushwood the people gather by hand
// (`brush`: not kept, not traded).
export const TOWN_GOODS = new Registry('townGood');
TOWN_GOODS.registerAll([
  {id: 'food', label: 'готовая еда', unit: 'чел.-год', get price() { return CAMPAIGN.ration * 365; }},
  {id: 'raw', label: 'сырая еда', unit: 'чел.-год', raw: true, get price() { return CAMPAIGN.ration * 365 * 0.7; }, note: 'зерно, мясо, рыба, плоды, грибы, мёд, мука — всё одно: на кухню, в заготовки, в брагу; вид сырья — индикатор'},
  {id: 'stores', label: 'заготовки', unit: 'чел.-год', price: 150, note: 'вяленое, солёное, копчёное: не портится'},
  {id: 'drink', label: 'брага', unit: 'шт.', res: 'braga', soft: true, note: 'одна брага из любого сбраживаемого сырья'},
  {id: 'salt', label: 'соль', unit: 'шт.', res: 'salt', soft: true, note: 'мягкое сырьё засолки'},
  {id: 'wood', label: 'древесина', unit: 'шт.', res: 'wood'},
  {id: 'planks', label: 'тёс', unit: 'шт.', res: 'planks'},
  {id: 'fuel', label: 'топливо', unit: 'заряд', price: 0.1, note: 'древесный и каменный уголь, кизяк — заряды одного топлива (FUEL)'},
  {id: 'brush', label: 'хворост', unit: 'вязанок', price: 0.02, note: 'жители собирают руками, без построек (TOWN_FLOW.gather): топливо бедного жилья, ползаряда; не копится'},
  {id: 'stone', label: 'камень', unit: 'шт.', res: 'stone'},
  {id: 'clay', label: 'глина', unit: 'шт.', res: 'clay'},
  {id: 'ware', label: 'тара', unit: 'шт.', res: 'pots', soft: true, note: 'горшки или бурдюки — одна тара разными путями'},
  {id: 'ore_bronze', label: 'руда бронзовая', unit: 'шт.', res: 'bronzeOre', note: 'медь и олово; сырьё: только в плавку'},
  {id: 'ore_iron', label: 'руда железная', unit: 'шт.', res: 'ironore', note: 'сырьё: только в плавку'},
  {id: 'ore_silver', label: 'руда серебряная', unit: 'шт.', res: 'silverOre', note: 'сырьё: только в плавку'},
  {id: 'ore_gold', label: 'руда золотая', unit: 'шт.', price: 2, note: 'рудная и россыпная (прииск); сырьё: только в плавку'},
  {id: 'ore_mithril', label: 'руда мифриловая', unit: 'шт.', res: 'mithrilOre', note: 'только глубокие шахты; плавит только магмовый горн'},
  {id: 'bar_bronze', label: 'слитки бронзы', unit: 'слитков', res: 'bronze'},
  {id: 'bar_iron', label: 'слитки железа', unit: 'слитков', res: 'iron'},
  {id: 'bar_steel', label: 'слитки стали', unit: 'слитков', res: 'steel'},
  {id: 'bar_silver', label: 'слитки серебра', unit: 'слитков', res: 'silverBar'},
  {id: 'bar_gold', label: 'слитки золота', unit: 'слитков', res: 'goldBar'},
  {id: 'bar_mithril', label: 'слитки мифрила', unit: 'слитков', price: 40},
  {id: 'gems', label: 'самоцветы', unit: 'шт.', res: 'gems'},
  {id: 'tools', label: 'инструмент', unit: 'шт.', price: 3, soft: true, note: 'расходник всех производств: без него полсилы, при частичном — по доле'},
  {id: 'arms', label: 'оружие', unit: 'шт.', price: 6, soft: true},
  {id: 'armor', label: 'броня', unit: 'шт.', price: 15, soft: true},
  {id: 'lux', label: 'роскошь', unit: 'шт.', price: 10, soft: true},
  {id: 'beasts', label: 'скот', unit: 'голов', get price() { return CAMPAIGN.beasts.mule; }},
  {id: 'hide', label: 'шкуры', unit: 'шт.', res: 'hide'},
  {id: 'leather', label: 'кожа', unit: 'шт.', res: 'leather'},
  {id: 'bone', label: 'кость', unit: 'шт.', res: 'bone'},
  {id: 'fiber', label: 'волокно', unit: 'шт.', price: 0.5, note: 'лён, шерсть, лыко, паучий шёлк'},
  {id: 'cloth', label: 'ткань', unit: 'шт.', res: 'cloth'},
  {id: 'herbs', label: 'травы', unit: 'шт.', res: 'herbs', soft: true},
  {id: 'potions', label: 'зелья', unit: 'шт.', res: 'potion', soft: true},
  {id: 'gold', label: 'золото', unit: 'зол.', res: 'gold', note: 'деньги: доход построек — в кошелёк'},
]);
// gold for one unit of a good
export const goodPrice = id => { const G = TOWN_GOODS.get(id); return G.res ? PRICE[G.res].price * (G.per ?? 1) : G.price; };
// the metal streams (docs/WORLD.md «Металлы по рудам»): a metal of the realm's smiths (data/balance/materials.js id) → its ore and
// its ingots; steel has no ore of its own (it is made of iron ingots)
export const METALS = {bronze: {ore: 'ore_bronze', bar: 'bar_bronze'}, iron: {ore: 'ore_iron', bar: 'bar_iron'}, steel: {ore: null, bar: 'bar_steel'},
  silver: {ore: 'ore_silver', bar: 'bar_silver'}, gold: {ore: 'ore_gold', bar: 'bar_gold'}, mithril: {ore: 'ore_mithril', bar: 'bar_mithril'}};
export const barOf = m => METALS[m]?.bar || null;

// Luxury (docs/WORLD.md «Роскошь»; from the branch Elves): the luxury workshop works any two of these materials, `take` of each
// a year (wood and stone by the cartload, gems and ingots by the handful); what it makes is worth what went into it ×
// `markup`, in units of luxury (TOWN_GOODS lux). Read live: an edit of a price or a take reaches the workshop.
export const LUX = {markup: 1.5, take: {wood: 90, stone: 90, gems: 9, bar_bronze: 18, bar_iron: 18, bar_silver: 12, bar_gold: 5}};
// the pool of materials: each good counts 1 / take a unit — a full `take` of it is one of the workshop's two slots
export const FINERY = {};
// what a unit of each gives: its worth × markup, in units of luxury
export const LUX_YIELDS = {};
for (const g of Object.keys(LUX.take)) {
  Object.defineProperty(FINERY, g, {enumerable: true, get: () => 1 / LUX.take[g]});
  Object.defineProperty(LUX_YIELDS, g, {enumerable: true, get: () => ({lux: goodPrice(g) * LUX.markup / goodPrice('lux')})});
}

// The mint (from the branch Elves): coin of gold or silver ingots or of gems, `take` of each a year, worth × `markup` more than
// went in, into the purse; it strikes of each as the store holds them (a pool shared by what there is: POOL_SHARE)
export const MINT = {markup: 1.6, take: {bar_gold: 10, bar_silver: 30, gems: 25}};
export const COIN = {}, MINT_YIELDS = {};
for (const g of Object.keys(MINT.take)) {
  Object.defineProperty(COIN, g, {enumerable: true, get: () => 1 / MINT.take[g]});
  Object.defineProperty(MINT_YIELDS, g, {enumerable: true, get: () => ({gold: goodPrice(g) * MINT.markup / goodPrice('gold')})});
}
// The rites by worth (from the branch Elves): the funeral rites take any ingots, so much gold's worth of them a year — the
// dearer the metal, the less of it; the cheapest first
export const RITE_WORTH = {fallentemple: 20};
export const RITE = {};
for (const g of ['bar_bronze', 'bar_iron', 'bar_steel', 'bar_mithril']) Object.defineProperty(RITE, g, {enumerable: true, get: () => goodPrice(g)});

export const EFFECTS = {housing: 'жильё', food: 'запасы', prod: 'ремесло', trade: 'торговля', defence: 'оборона', faith: 'вера', lore: 'знание', prestige: 'слава', health: 'здоровье'};

// Conditions of the place a building can ask for (atlas/towns.js placeHas)
export const PLACE_NEEDS = {
  water: 'река, озеро или море рядом', river: 'река', coast: 'морской берег', lake: 'озеро рядом',
  ore: 'железо, медь или серебро не хуже «есть»', gems: 'самоцветы', coal: 'уголь', magma: 'магма поблизости',
  precious: 'золото или серебро', placer: 'золотой песок', salt: 'солёное озеро или тёплый морской берег',
  clay: 'глина: пойма, глинистый сланец или известняк', stone: 'камень: склоны или скалы рядом',
  fertile: 'плодородная земля', arable: 'пахотная земля: плодородие и ровность пониже (люди корчуют, ровняют, удобряют)', forest: 'лес рядом', pasture: 'луга, степь или саванна рядом',
  steep: 'крутые склоны', flat: 'ровная земля', caves: 'пещеры: известняк или базальт', road: 'наезженная дорога',
  warm: 'тёплый климат', dry: 'степь, пустыня или саванна рядом', grazing: 'открытая земля рядом: луга, степь, саванна, тундра, кустарники, пустыня, предгорья, высокогорье (выпас кочевников)', graves: 'курганы былых битв рядом',
};

// Indicators (docs/WORLD.md «Цепочки 6.1»): what a town has or has not — a flag, not a good. A building lights its `opens` while one
// of it stands; the town's people lights `people:<id>`, a kind of a people of many kinds held at KIN.least of the town `kin:<id>`
// (data/peoples.js), and a good in the store — its own or brought in — `stock:<good>`. Trade carries goods, never the
// indicators of buildings; the stock ones light by what was brought. A recipe of a building (`recipes`) runs while all of its
// `req` are lit ('a|b' — either); the recipes that run share the building's strength by what the store holds of what each takes.
export const INDICATORS = {
  grain: 'зерно', flax: 'лён', vegetables: 'овощи', herbs: 'травы', fruit: 'плоды', mushrooms: 'грибы', honey: 'мёд', meat: 'мясо',
  fish: 'рыба', hides: 'шкуры', herds: 'скот', wool: 'шерсть', wild: 'дикоросы', flour: 'мука', wood: 'древесина', stone: 'камень',
  clay: 'глина', coal: 'уголь', gems: 'самоцветы', salt: 'соль', food: 'готовая еда', stores: 'заготовки', drink: 'брага', planks: 'тёс',
  charcoal: 'древесный уголь', craft: 'ремесло', leather: 'кожа', cloth: 'ткань', ware: 'тара', pottery: 'гончарное дело', glass: 'стекло',
  smelting: 'плавка', smithing: 'кузнечное дело', jewelry: 'ювелирное дело', healing: 'лечение', alchemy: 'алхимия', garrison: 'гарнизон',
  arsenal: 'арсенал', knights: 'рыцари', cavalry: 'конница', warbeasts: 'боевые звери', wargs: 'варги', spiders: 'пауки', silk: 'шёлк',
  hyenas: 'гиены', faith: 'вера', temple: 'храм', rites: 'обряды', letters: 'грамота', books: 'книжность', tavern: 'трактир', den: 'притон',
  inn: 'постоялый двор', harbor: 'гавань', sealanes: 'морские пути', lighthouse: 'маяк', shipyard: 'верфь', golems: 'големы', coinage: 'чеканка',
  magic: 'чары', market: 'рынок', capital: 'столица', crossing: 'переправа', river: 'речные перевозки', toll: 'застава', caravans: 'караван-сарай',
};
export const PEOPLE_WORDS = {elves: 'Эльфы', dwarves: 'Дварфы', humans: 'Люди', orcs: 'Зеленокожие'};
export const KIN_WORDS = {orc: 'орки', goblin: 'гоблины', gnoll: 'гноллы', troll: 'тролли', ogre: 'огры'};
// the word of an indicator for the cards: «зерно», «Эльфы», «орки», «на складе: слитки железа»
export function indicatorLabel(id) {
  if (INDICATORS[id]) return INDICATORS[id];
  const [k, v] = id.split(':');
  if (k === 'people') return PEOPLE_WORDS[v] || v;
  if (k === 'kin') return KIN_WORDS[v] || v;
  if (k === 'stock') return `на складе: ${TOWN_GOODS.has(v) ? TOWN_GOODS.get(v).label : v}`;
  return id;
}

// The kinds of rows (docs/WORLD.md «Виды строк»): `kind` of an entry —
//   base     a building of its own (the first of its `line`)
//   variant  another base for a people (the elves' gentle felling for the woodcutters)
//   tier     built in place of the one before it (`upgrades`: what gives way; `here`: what must stand to give way, or a unit of
//            the tier itself) — more strength and more hands; it keeps the recipes of its line
//   annex    a building of its own by a base (`here`: the hosts, any of them or their tiers)
//   upgrade  changes its host's strength (`here`, `boost`): no hands, a few goods; at most one of each in a town, and only
//            TOWN_SLOTS.upgrades of them by the town's step
// A tier counts as the base it grew from for whatever asks for the base (requires, here, the town's steps): lineHas.
const B = (id, name, g, cat, tier, peoples, fx, more = {}) => ({id, name, g, cat, tier, peoples, fx, max: 1, kind: 'base', ...more});
const T = (id, name, g, cat, tier, peoples, fx, from, more = {}) => B(id, name, g, cat, tier, peoples, fx, {kind: 'tier', upgrades: [from].flat(), here: [...[from].flat(), id], ...more});
const A = (id, name, g, cat, tier, peoples, fx, hosts, more = {}) => B(id, name, g, cat, tier, peoples, fx, {kind: 'annex', here: hosts, ...more});
const V = (id, name, g, cat, tier, peoples, fx, more = {}) => B(id, name, g, cat, tier, peoples, fx, {kind: 'variant', ...more});
const U = (id, name, tier, peoples, hosts, boost, more = {}) => B(id, name, 'n', 'food', tier, peoples, {}, {kind: 'upgrade', here: hosts, boost: Object.fromEntries(hosts.map(h => [h, boost])), ...more});
// a recipe: {id, name, req: [indicator, …], in, any, fire, out, opens}
const R = (id, name, req, io = {}) => ({id, name, req, ...io});
const ALL = null, E = ['elves'], D = ['dwarves'], H = ['humans'], O = ['orcs'];
const SALT_REC = [R('brine', 'выварка рассола', [], {fire: 80, out: {salt: 200}}), R('spring', 'соляной ручей', ['people:elves'], {out: {salt: 40}})];
// (the greenskins brew their own at the fire from the first step: a little raw food into brew, data/peoples.js orcs)
const KITCHEN_REC = k => [R('bread', 'хлеб', ['flour'], {in: {raw: 60 * k}, fire: 80 * k, out: {food: 84 * k}}), R('ogrepot', 'мясной котёл', ['kin:ogre'], {in: {raw: 40 * k}, fire: 30 * k, out: {food: 48 * k, bone: 20 * k}}),
  R('brew', 'своя брага', ['people:orcs'], {in: {raw: 4 * k}, fire: 10 * k, out: {drink: 40 * k}})];
const BREW_REC = [R('grain', 'зерновая брага', ['grain'], {in: {raw: 20}, out: {drink: 800}}), R('fruit', 'плодовая брага', ['fruit'], {in: {raw: 20}, out: {drink: 800}}),
  R('mushroom', 'грибная брага', ['mushrooms'], {in: {raw: 20}, out: {drink: 800}}), R('mead', 'медовая брага', ['honey'], {in: {raw: 20}, out: {drink: 800}})];
const LARDER_REC = [R('dry', 'сушка', [], {in: {raw: 12}, out: {stores: 6}}), R('salt', 'засолка', ['stock:salt'], {in: {raw: 12, salt: 6}, out: {stores: 12}}),
  R('smoke', 'копчение', [], {in: {raw: 20}, fire: 40, out: {stores: 28}})];
const SHOP_REC = [R('skins', 'бурдюки', ['people:orcs'], {in: {leather: 10}, out: {ware: 10}}), R('bows', 'луки', ['people:elves|people:humans'], {in: {wood: 30, fiber: 16}, out: {arms: 20}}),
  R('bark', 'корьевая броня', ['people:elves'], {in: {wood: 40, fiber: 20, leather: 10}, out: {armor: 4}})];
const SMELT_REC = k => [R('bronze', 'бронза', ['stock:ore_bronze'], {in: {ore_bronze: 120 * k}, fire: 180 * k, out: {bar_bronze: 72 * k}}),
  R('iron', 'железо', ['stock:ore_iron'], {in: {ore_iron: 120 * k}, fire: 180 * k, out: {bar_iron: 86 * k}}),
  R('silver', 'серебро', ['stock:ore_silver'], {in: {ore_silver: 120 * k}, fire: 180 * k, out: {bar_silver: 60 * k}}),
  R('gold', 'золото', ['stock:ore_gold'], {in: {ore_gold: 120 * k}, fire: 180 * k, out: {bar_gold: 60 * k}})];
// a better metal gives more at the end of the chain: tools, arms and armour are spent by their worth
const FORGE_REC = [R('bronze', 'бронзовые изделия', ['stock:bar_bronze'], {in: {bar_bronze: 50, leather: 10}, out: {tools: 11, arms: 8, armor: 1}}),
  R('iron', 'железные изделия', ['stock:bar_iron'], {in: {bar_iron: 50, leather: 10}, out: {tools: 15, arms: 10, armor: 2}}),
  R('steel', 'стальные изделия', ['stock:bar_steel'], {in: {bar_steel: 50, leather: 10}, out: {tools: 22, arms: 15, armor: 3}}),
  R('mithril', 'мифриловые изделия', ['stock:bar_mithril', 'people:dwarves'], {in: {bar_mithril: 10}, out: {arms: 15, armor: 5, lux: 3}})];
const WALLS = ['palisade', 'thornhedge', 'earthwall', 'tunnels'], SHRINES = ['shrine', 'shamanhut', 'sacredgrove', 'stonecircle', 'ancestorhall'];

export const TOWN_BUILDINGS = new Registry('townBuilding');
TOWN_BUILDINGS.registerAll([
  // ── housing
  B('hut', 'шалаши', 'pl', 'housing', 0, ALL, {}, {line: 'h-start', max: 2, local: 'hut', house: 100, heat: 250, in: {wood: 30}}),
  // log cabins: the humans' first proper houses — no place asked, logs for their walls and fire
  B('cabin', 'срубы', 'pl', 'housing', 0, H, {}, {line: 'h-humans', max: 6, upgrades: ['hut'], house: 150, heat: 150, in: {wood: 20}}),
  B('yurts', 'шатры', 'pl', 'housing', 0, O, {}, {line: 'h-orcs', max: 8, house: 200, heat: 80, in: {hide: 20}}),   // (× the greenskins' house 0.75: 150; felt and dung fires: little wood, the steppe has none)
  // the greenskins' horde camp: tents and wagons round a war-chief's hall on step 2, in place of the tents (× 0.75: 300)
  B('hordecamp', 'стан орды', 'm', 'housing', 2, O, {defence: 0.1, prestige: 0.05}, {line: 'h-orcs', kind: 'tier', max: 8, upgrades: ['yurts'], house: 400, heat: 80, in: {hide: 25, wood: 20}}),
  B('house', 'избы', 'pl', 'housing', 1, H, {}, {line: 'h-humans', kind: 'tier', max: 6, local: 'house', upgrades: ['hut', 'cabin'], house: 250, heat: 120, in: {planks: 15}}),   // (the boards come by the road where no wood grows)
  B('longhouse', 'длинный дом', 'm', 'housing', 1, [...H, ...O], {prestige: 0.03}, {line: 'h-humans', kind: 'tier', max: 4, needs: ['forest'], upgrades: ['yurts', 'hut'], house: 300, heat: 150, in: {wood: 30}}),
  B('treehouse', 'дома на деревьях', 'pl', 'housing', 1, E, {}, {line: 'h-elves', max: 8, needs: ['forest'], house: 300, heat: 60, in: {wood: 10}, upgrades: ['hut']}),
  // the elves' hall in the crowns of the old trees: the tree-houses of a big town grown together
  B('elfhall', 'древесный чертог', 'm', 'housing', 2, E, {prestige: 0.05}, {line: 'h-elves', kind: 'tier', max: 8, needs: ['forest'], house: 450, heat: 50, in: {wood: 15}, upgrades: ['treehouse']}),
  B('hallhomes', 'подгорные жилища', 'pl', 'housing', 1, D, {defence: 0.05}, {line: 'h-dwarves', max: 8, needsAny: ['steep', 'caves'], local: 'hallhome', upgrades: ['hut'], house: 400, heat: 40, in: {stone: 10}}),   // the mountain keeps the warmth: little wood to heat
  // the dwarves' deep hall: their homes under the mountain grown into one — the densest housing of the world
  B('deephall', 'подгорный чертог', 'm', 'housing', 2, D, {defence: 0.08, prestige: 0.05}, {line: 'h-dwarves', kind: 'tier', max: 8, needsAny: ['steep', 'caves'], upgrades: ['hallhomes'], house: 700, heat: 30, in: {stone: 15}}),
  B('stonehouse', 'каменные дома', 'pl', 'housing', 2, [...H, ...D], {defence: 0.03}, {line: 'h-humans', kind: 'tier', max: 8, needs: ['stone'], requires: ['quarry'], upgrades: ['house', 'hut'], house: 400, heat: 150, in: {stone: 15}}),

  // ── the land: works on the map by the town (`site`)
  B('woodcut', 'вырубка', 'f', 'raw', 0, [...H, ...D, ...O], {prod: 0.1}, {line: 'forest', per: 400, needs: ['forest'], site: true, jobs: 8, in: {tools: 2}, out: {wood: 1200}, opens: ['wood']}),
  // elves do not fell the living wood: deadfall and dry trees, logs only
  V('forestry', 'бережная вырубка', 'f', 'raw', 0, E, {prod: 0.1}, {line: 'forest', per: 300, needs: ['forest'], site: true, jobs: 8, in: {tools: 1.6}, out: {wood: 400}, opens: ['wood']}),
  // herbs, wild honey, berries and mushrooms, nettle and bast — everyone's first work of the wild
  B('gatherer', 'хижина собирателя', 'f', 'food', 0, ALL, {}, {line: 'gatherer', per: 400, needsAny: ['forest', 'pasture'], site: true, jobs: 6, in: {tools: 1.2}, out: {herbs: 20, raw: 20, fiber: 20}, opens: ['herbs', 'honey', 'wild']}),
  B('lodge', 'хижина охотника', 'f', 'food', 0, ALL, {}, {line: 'hunter', per: 400, needsAny: ['forest', 'pasture'], local: 'lodge', site: true, jobs: 10, in: {arms: 2, tools: 2}, out: {raw: 25, hide: 80, bone: 80}, opens: ['meat', 'hides']}),
  U('traps', 'ловушки', 0, ALL, ['lodge'], 0.2, {line: 'hunter', in: {tools: 1}}),
  B('fishhut', 'рыбацкие хижины', 'pl', 'food', 0, ALL, {}, {line: 'fishing', per: 300, max: 2, needs: ['water'], local: 'fishhut', site: true, jobs: 10, in: {fiber: 20, tools: 2}, soft: ['fiber'], out: {raw: 30}, opens: ['fish']}),
  T('pier', 'промысловая пристань', 'f', 'food', 1, ALL, {trade: 0.05}, 'fishhut', {line: 'fishing', per: 600, needsAny: ['coast', 'lake'], site: true, jobs: 20, in: {planks: 15, fiber: 30, tools: 4}, soft: ['fiber'], out: {raw: 70}, opens: ['fish']}),
  // stone on slopes and rocks, clay in the flood plain and the shale: what the place has (`placeOut`)
  B('quarry', 'карьер', 'm', 'raw', 0, ALL, {prod: 0.1}, {line: 'quarry', per: 600, needsAny: ['stone', 'clay'], local: 'quarry', site: true, jobs: 8, in: {tools: 3}, out: {stone: 500, clay: 300}, placeOut: {stone: 'stone', clay: 'clay'}, opens: ['stone', 'clay']}),
  B('mineshaft', 'рудник', 'm', 'raw', 0, [...H, ...D, ...O], {prod: 0.25, trade: 0.1}, {line: 'mine', per: 600, needs: ['ore'], local: 'mineshaft', notable: true, site: true, jobs: 12, in: {tools: 6, wood: 40}, dig: {n: 240, ores: ['iron', 'bronze', 'silver', 'gold'], coal: 400}, out: {gems: 0.4}, opens: ['coal', 'gems']}),
  T('deepmine', 'глубокие шахты', 'pl', 'raw', 2, D, {prod: 0.3, trade: 0.15}, 'mineshaft', {line: 'mine', per: 1000, needsAny: ['ore', 'gems', 'precious'], site: true, jobs: 20, in: {tools: 10, wood: 60}, dig: {n: 500, ores: ['iron', 'bronze', 'silver', 'gold', 'mithril'], coal: 600}, out: {gems: 1.5}, opens: ['coal', 'gems']}),
  U('props', 'крепь', 1, [...H, ...D, ...O], ['mineshaft', 'deepmine'], 0.2, {line: 'mine', cat: 'raw', in: {wood: 20, tools: 1}}),
  B('placer', 'прииск', 'm', 'raw', 1, [...H, ...D, ...O], {trade: 0.2}, {line: 'placer', per: 1500, needs: ['placer'], notable: true, site: true, jobs: 6, in: {tools: 1}, out: {ore_gold: 100, gems: 0.2}, opens: ['gems']}),
  // brine boiled over a fire; the elves' spring of salt water dries in the sun, a little, with no fire
  B('saltworks', 'соляной промысел', 'm', 'raw', 1, ALL, {trade: 0.2, food: 0.05}, {line: 'salt', per: 1500, needs: ['salt'], site: true, jobs: 5, in: {tools: 1}, recipes: SALT_REC, opens: ['salt']}),
  B('field', 'поля', 'pl', 'food', 0, [...E, ...O], {}, {line: 'field', per: 150, max: 4, needs: ['fertile', 'flat'], local: 'field', site: true, jobs: 30, in: {tools: 5}, out: {raw: 110, fiber: 100}, opens: ['grain', 'flax']}),
  // the humans plough instead of the field: they clear, level and dung poorer land (`arable`) and take half as much again from it
  V('ploughland', 'пашня', 'f', 'food', 0, H, {}, {line: 'field', per: 150, max: 4, needs: ['arable'], local: 'field', site: true, jobs: 30, in: {tools: 5}, out: {raw: 165, fiber: 100}, opens: ['grain', 'flax']}),
  U('plough', 'плуг', 1, [...H, ...E, ...O], ['field', 'ploughland'], 0.25, {line: 'field', in: {tools: 3}}),
  U('mules', 'тягловые мулы', 1, [...H, ...O], ['field', 'ploughland'], 0.25, {line: 'field', in: {tools: 1, beasts: 2}}),
  U('manure', 'удобрения', 0, [...H, ...E, ...O], ['field', 'ploughland'], 0.2, {line: 'field', in: {tools: 1}}),
  B('garden', 'огороды', 'pl', 'food', 0, ALL, {}, {line: 'garden', per: 250, max: 3, needs: ['fertile'], local: 'garden', site: true, jobs: 15, in: {tools: 3}, out: {raw: 35, herbs: 10}, opens: ['vegetables', 'herbs']}),
  B('grove', 'сад', 'm', 'food', 1, [...E, ...H], {}, {line: 'grove', per: 150, max: 4, needsAny: ['forest', 'fertile'], site: true, jobs: 12, in: {tools: 2.4}, out: {raw: 45, lux: 10}, opens: ['fruit']}),
  // the hives by a field, a garden or a grove: they pollinate it, and their honey is raw food (and «мёд»)
  A('apiary', 'пасека', 'f', 'food', 0, [...H, ...E], {prod: 0.05}, ['field', 'ploughland', 'garden', 'grove'], {line: 'apiary', needs: ['warm'], jobs: 2, in: {tools: 0.4}, out: {raw: 1}, boost: {field: 0.1, ploughland: 0.1, garden: 0.1, grove: 0.1}, opens: ['honey']}),
  B('mushrooms', 'грибные пещеры', 'pl', 'food', 1, D, {}, {line: 'mushrooms', per: 150, max: 4, needsAny: ['caves', 'steep'], local: 'mushcave', site: true, jobs: 15, in: {tools: 3}, out: {raw: 70}, opens: ['mushrooms']}),
  U('mushmanure', 'удобрения пещер', 1, D, ['mushrooms'], 0.2, {line: 'mushrooms', in: {tools: 1}}),
  // the pens and pastures raise the herds (`beasts`: their increase), the slaughterhouse alone kills them; the greenskins'
  // big herds — a recipe of the pens
  B('pen', 'загоны', 'pl', 'food', 0, [...H, ...D, ...O], {}, {line: 'pasture', per: 300, max: 2, needs: ['pasture'], local: 'pen', site: true, jobs: 8, in: {tools: 1.6}, out: {fiber: 120, beasts: 4, fuel: 30},
    recipes: [R('herds', 'большие стада', ['people:orcs'], {out: {beasts: 4, fuel: 20}})], opens: ['herds', 'wool']}),
  T('pasture', 'выгоны', 'pl', 'food', 1, [...H, ...O], {prod: 0.05}, 'pen', {line: 'pasture', per: 300, max: 3, needs: ['pasture'], site: true, jobs: 15, in: {tools: 3}, out: {fiber: 200, beasts: 8, fuel: 60},
    recipes: [R('herds', 'большие стада', ['people:orcs'], {out: {beasts: 8, fuel: 40}})], opens: ['herds', 'wool']}),
  // the greenskins' beast dens, one work with a recipe by kind: wargs of the orcs, spiders (and silk) of the goblins, hyenas
  // of the gnolls (data/peoples.js WAR_BEASTS); the beasts eat raw meat, not the kitchens' food
  B('dens', 'логово зверей', 'n', 'defence', 0, O, {defence: 0.15, prestige: 0.05}, {line: 'dens', local: ['wargden', 'spiderden'], notable: true, jobs: 4,
    recipes: [R('wargs', 'варги', ['kin:orc'], {in: {raw: 30}, opens: ['wargs']}), R('spiders', 'пауки', ['kin:goblin'], {in: {raw: 15}, out: {fiber: 40}, opens: ['spiders', 'silk']}),
      R('hyenas', 'гиены', ['kin:gnoll'], {in: {raw: 15}, opens: ['hyenas']})], opens: ['warbeasts']}),
  B('ferry', 'перевоз', 'm', 'trade', 0, [...H, ...E, ...O], {trade: 0.05}, {line: 'crossing', needs: ['river'], jobs: 2, in: {tools: 0.4}, out: {gold: 20}, opens: ['crossing']}),
  T('bridge', 'мост', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, 'ferry', {line: 'crossing', here: ['ferry', 'bridge', 'quarry'], needs: ['river'], requires: ['quarry'], in: {stone: 10}, opens: ['crossing']}),
  A('riverpier', 'речная пристань', 'f', 'trade', 1, [...H, ...E, ...O], {trade: 0.1}, ['ferry'], {line: 'crossing', needs: ['river'], jobs: 4, in: {planks: 6, tools: 0.8}, out: {gold: 20}, opens: ['river']}),
  // the road's toll; the trolls take theirs on a road through the marsh
  B('toll', 'дорожная застава', 'f', 'trade', 1, [...H, ...D, ...O], {trade: 0.05, defence: 0.05}, {line: 'outpost', needs: ['road'], jobs: 3, in: {tools: 0.6}, out: {gold: 40},
    recipes: [R('trollgate', 'топь-застава', ['kin:troll'], {out: {lux: 4}})], opens: ['toll']}),
  A('caravanserai', 'караван-сарай', 'm', 'trade', 2, [...H, ...O], {trade: 0.25}, ['toll'], {line: 'outpost', needs: ['road', 'dry'], jobs: 4, in: {food: 6, raw: 6, tools: 0.8}, out: {gold: 80}, opens: ['caravans']}),

  // ── the town's works
  // the kitchens, all peoples': they cook whatever raw food the town has — nobody eats it raw (but the elves); the community
  // hearth gives a warm meal for all, the cookhouse feeds a town; bread where a mill lights «мука», the ogres' meat pot
  B('firepit', 'кострище', 'n', 'food', 0, ALL, {}, {line: 'kitchen', per: 100, jobs: 2, fire: 20, in: {raw: 40, tools: 0.4}, out: {food: 32}, recipes: KITCHEN_REC(1), opens: ['food']}),
  T('hearth', 'общинный очаг', 'm', 'food', 1, ALL, {health: 0.05}, 'firepit', {line: 'kitchen', per: 200, local: 'hearth', jobs: 3, fire: 40, in: {raw: 80, tools: 0.6}, out: {food: 80}, recipes: KITCHEN_REC(1.5), opens: ['food']}),
  T('cookhouse', 'поварня', 'f', 'food', 2, ALL, {health: 0.05}, 'hearth', {line: 'kitchen', per: 600, jobs: 6, fire: 120, in: {raw: 240, tools: 1.2}, out: {food: 288}, recipes: KITCHEN_REC(3), opens: ['food']}),
  // one brew of any fermentable: a recipe for each raw food the town has (its indicator)
  B('brewery', 'пивоварня', 'f', 'food', 2, [...H, ...D, ...O], {prod: 0.1, prestige: 0.05}, {line: 'brewery', per: 1500, requiresAny: ['field', 'ploughland', 'garden', 'mushrooms', 'grove', 'gatherer'], jobs: 4, in: {tools: 0.8}, recipes: BREW_REC, opens: ['drink']}),
  // the mill lights «мука» (bread in the kitchens); the greenskins grind bone to meal where grain is short
  B('quern', 'ручные жернова', 'pl', 'food', 0, ALL, {}, {line: 'mill', per: 600, local: 'quern', jobs: 2, recipes: [R('bonemeal', 'костяная мука', ['people:orcs'], {in: {bone: 40}, out: {raw: 14}})], opens: ['flour']}),
  T('windmill', 'ветряная мельница', 'f', 'food', 1, H, {}, 'quern', {line: 'mill', per: 1500, needs: ['flat'], jobs: 4, opens: ['flour']}),
  T('watermill', 'водяная мельница', 'f', 'food', 2, [...H, ...D], {prod: 0.1}, ['quern', 'windmill'], {line: 'mill', per: 1500, needs: ['river'], jobs: 4, opens: ['flour']}),
  // drying, salting and smoking: recipes of one yard (salting while there is salt in the store)
  B('dryrack', 'заготовительный двор', 'm', 'food', 0, ALL, {food: 0.05}, {line: 'larder', per: 600, local: ['dryrack', 'smokehouse'], jobs: 2, in: {tools: 0.4}, soft: ['salt'], recipes: LARDER_REC, opens: ['stores']}),
  // the slaughterhouse: the only place the herds' increase is killed (the pens and pastures only raise it) — meat, hides, bone
  B('slaughter', 'бойня', 'f', 'food', 0, [...H, ...D, ...O], {}, {line: 'slaughter', per: 400, requiresAny: ['pen', 'pasture'], jobs: 4, in: {beasts: 12, tools: 0.8}, out: {raw: 60, hide: 90, bone: 60}, opens: ['meat', 'hides']}),
  B('sawmill', 'лесопилка', 'f', 'raw', 1, [...H, ...D, ...E], {prod: 0.15}, {line: 'sawmill', per: 600, local: 'sawmill', jobs: 4, in: {wood: 160, tools: 1}, out: {planks: 100}, opens: ['planks']}),
  B('charpit', 'углежоги', 'pl', 'raw', 1, [...H, ...D, ...O], {prod: 0.05}, {line: 'charpit', per: 800, local: 'charpit', jobs: 3, in: {wood: 200, tools: 0.6}, out: {fuel: 648}, opens: ['charcoal']}),
  // the hand workshop: the first tools of wood and bone, with no tools to begin with; the waterskins of the greenskins, the bows of
  // the elves and the humans, the elves' bark armour — its recipes
  B('handshop', 'ручная мастерская', 'f', 'craft', 0, ALL, {}, {line: 'workshop', per: 500, jobs: 2, in: {wood: 10, bone: 10}, soft: ['bone'], out: {tools: 4, arms: 2}, recipes: SHOP_REC, opens: ['craft']}),
  T('crafthut', 'мастерская ремесленника', 'f', 'craft', 1, ALL, {prod: 0.1}, 'handshop', {line: 'workshop', per: 500, local: 'crafthut', jobs: 4, in: {wood: 40, bone: 20, leather: 20, tools: 0.8}, soft: ['bone', 'leather'], out: {tools: 15, arms: 10}, recipes: SHOP_REC, opens: ['craft']}),
  B('tannery', 'дубильня', 'f', 'craft', 1, ALL, {prod: 0.1}, {line: 'tannery', per: 600, requiresAny: ['lodge', 'pen', 'pasture', 'slaughter'], local: 'tannery', jobs: 3, in: {hide: 60, tools: 0.6}, out: {leather: 60}, opens: ['leather']}),
  T('tannery2', 'улучшенное дубление', 'n', 'craft', 2, ALL, {prod: 0.1}, 'tannery', {line: 'tannery', per: 600, jobs: 3, in: {hide: 60, tools: 0.6}, out: {leather: 75}, opens: ['leather']}),
  B('loom', 'ткацкая', 'f', 'craft', 1, ALL, {prod: 0.1}, {line: 'loom', per: 600, local: 'loom', jobs: 4, in: {fiber: 120, tools: 0.8}, out: {cloth: 40}, opens: ['cloth']}),
  T('loom2', 'развитое ткачество', 'n', 'craft', 2, ALL, {prod: 0.1}, 'loom', {line: 'loom', per: 600, jobs: 4, in: {fiber: 120, tools: 0.8}, out: {cloth: 50}, opens: ['cloth']}),
  B('potter', 'гончарня', 'f', 'craft', 1, [...H, ...D, ...E], {prod: 0.05}, {line: 'potter', per: 800, needs: ['clay'], local: 'potter', jobs: 3, fire: 40, in: {clay: 60, tools: 0.6}, out: {ware: 90}, opens: ['ware', 'pottery']}),
  A('glassworks', 'стеклодувня', 'f', 'craft', 2, [...H, ...D], {prod: 0.1, trade: 0.1, prestige: 0.05}, ['potter'], {line: 'potter', needsAny: ['coast', 'clay'], pop: 800, jobs: 5, fire: 120, in: {clay: 60, tools: 1}, out: {lux: 8}, opens: ['glass']}),
  // the smelter: each ore into its ingots — a recipe runs while its ore is in the store (dug here or brought in)
  B('smelter', 'плавильный горн', 'm', 'craft', 1, [...H, ...D, ...O], {prod: 0.15}, {line: 'smelter', per: 800, local: 'smelter', jobs: 4, in: {tools: 0.8}, recipes: SMELT_REC(1), metals: ['bronze'], opens: ['smelting']}),
  T('smelter2', 'развитая плавильня', 'f', 'craft', 2, [...H, ...D, ...O], {prod: 0.2}, 'smelter', {line: 'smelter', per: 1500, jobs: 8, in: {tools: 1.6}, recipes: SMELT_REC(3), metals: ['bronze'], opens: ['smelting']}),
  // the steelworks: iron ingots into steel (a big town's work); the magma forge melts mithril — it needs no fire of its own
  A('foundry', 'сталеварня', 'f', 'craft', 2, [...H, ...D], {prod: 0.25, trade: 0.1}, ['smelter'], {line: 'smelter', per: 2000, pop: 800, jobs: 10, fire: 300, in: {bar_iron: 140, tools: 2}, req: ['stock:bar_iron'], out: {bar_steel: 56}, metals: ['steel']}),
  A('magmaforge', 'магмовый горн', 'm', 'craft', 2, D, {prod: 0.35, prestige: 0.2, defence: 0.1}, ['smelter'], {line: 'smelter', needs: ['magma'], local: 'magmaforge', pop: 800, jobs: 6, in: {ore_mithril: 20, tools: 1.2}, req: ['stock:ore_mithril'], out: {bar_mithril: 10}, metals: ['mithril']}),
  B('forge', 'кузня', 'f', 'craft', 1, [...H, ...D, ...O], {prod: 0.2, defence: 0.1}, {line: 'forge', per: 800, local: 'forge', notable: true, jobs: 4, fire: 75, in: {tools: 0.8}, recipes: FORGE_REC, metals: ['iron'], opens: ['smithing']}),
  // fine work of any two materials (LUX): its luxury is worth what went into it × LUX.markup
  B('jeweler', 'мастерская роскоши', 'f', 'craft', 2, [...H, ...D, ...E], {prod: 0.1, trade: 0.2, prestige: 0.1}, {line: 'jeweler', per: 1500, local: 'jeweler', jobs: 3, in: {tools: 0.6}, any: {finery: 2}, yields: LUX_YIELDS, metals: ['silver'], opens: ['jewelry']}),
  B('healerhut', 'дом лекаря', 'm', 'life', 1, ALL, {health: 0.15}, {line: 'healer', per: 800, local: 'healerhut', jobs: 2, in: {herbs: 20, ware: 10, tools: 0.4}, out: {potions: 10}, opens: ['healing']}),
  T('hospice', 'лечебница', 'f', 'life', 2, [...H, ...E], {health: 0.4}, 'healerhut', {line: 'healer', per: 800, jobs: 8, in: {herbs: 60, ware: 10, cloth: 10, tools: 1.6}, out: {potions: 10}, opens: ['healing']}),
  A('alchemist', 'лаборатория алхимика', 'f', 'craft', 2, [...H, ...E, ...D], {lore: 0.15, health: 0.1}, ['healerhut'], {line: 'healer', per: 2000, pop: 800, jobs: 2, in: {herbs: 40, ware: 20, tools: 0.4}, out: {potions: 20}, opens: ['alchemy']}),
  // the garrison: barracks, the greenskins' war camp; the armoury, the tilt-yard (knights, the champion: data/raids.js host),
  // the hippodrome (horse-knights), the fighting pits (beasts of the land about broken to war: atlas/beasts.js)
  B('barracks', 'казармы', 'pl', 'housing', 1, [...H, ...D], {defence: 0.25}, {line: 'barracks', vec: {agg: 0.9, grow: 0.1}, house: 100, jobs: 30, heat: 60, in: {arms: 3, armor: 1}, opens: ['garrison']}),
  V('warcamp', 'боевой стан', 'm', 'defence', 1, O, {defence: 0.3, prestige: 0.1}, {line: 'barracks', jobs: 30, in: {arms: 4, armor: 1}, opens: ['garrison']}),
  A('armory', 'арсенал', 'm', 'craft', 2, [...H, ...D, ...O], {defence: 0.2}, ['barracks', 'warcamp'], {line: 'barracks', local: 'armory', jobs: 2, opens: ['arsenal']}),
  A('tiltyard', 'ристалище', 'n', 'defence', 1, H, {defence: 0.15, prestige: 0.15}, ['barracks'], {line: 'barracks', local: 'tiltyard', notable: true, jobs: 6, in: {arms: 2, armor: 3, food: 10}, opens: ['knights']}),
  T('hippodrome', 'ипподром', 'm', 'defence', 2, H, {defence: 0.15, prestige: 0.1}, 'tiltyard', {line: 'barracks', needsAny: ['flat', 'pasture'], notable: true, jobs: 8, in: {food: 20, fiber: 40}, out: {beasts: 3}, opens: ['cavalry', 'knights']}),
  A('fightpits', 'бойцовские ямы', 'pl', 'defence', 1, O, {defence: 0.15, prestige: 0.1}, ['warcamp'], {line: 'barracks', local: 'fightpits', notable: true, jobs: 6, in: {food: 20, arms: 2}, opens: ['warbeasts']}),
  B('shrine', 'святилище', 'n', 'faith', 0, ALL, {faith: 0.15}, {line: 'shrine', local: 'shrine', jobs: 1, opens: ['faith']}),
  V('shamanhut', 'хижина шамана', 'f', 'faith', 0, O, {faith: 0.15, health: 0.1}, {line: 'shrine', jobs: 1, in: {herbs: 15}, opens: ['faith']}),
  V('sacredgrove', 'священная роща', 'f', 'faith', 0, E, {faith: 0.3}, {line: 'shrine', needs: ['forest'], jobs: 2, opens: ['faith']}),
  V('stonecircle', 'каменный круг', 'm', 'faith', 0, [...H, ...O], {faith: 0.2}, {line: 'shrine', needsAny: ['stone', 'steep'], opens: ['faith']}),
  // (the humans' temple keeps a church school: knowledge besides faith)
  T('temple', 'храм', 'm', 'faith', 1, [...H, ...E, ...D], {faith: 0.45, prestige: 0.1}, 'shrine', {line: 'shrine', fxBy: {humans: {lore: 0.15}}, jobs: 5, in: {lux: 1}, opens: ['temple']}),
  // the dwarves' hall of the ancestors: their own shrine from the first stone, no other before it
  V('ancestorhall', 'зал предков', 'm', 'faith', 0, D, {faith: 0.3, prestige: 0.1}, {line: 'shrine', jobs: 2, opens: ['faith', 'temple']}),
  // by the barrows of old battles: the fallen are laid to rest, and the rot around fades (atlas/lairs.js stepRot); any ingots
  // to the fallen, by their worth (RITE_WORTH)
  A('fallentemple', 'погребальные обряды', 'pl', 'faith', 1, ALL, {faith: 0.25, health: 0.05}, SHRINES, {line: 'shrine', needs: ['graves'], notable: true, jobs: 3, any: {rite: RITE_WORTH.fallentemple}, opens: ['rites']}),
  B('school', 'школа', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.15}, {line: 'school', jobs: 3, in: {cloth: 5}, opens: ['letters']}),
  T('library', 'библиотека', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.45, prestige: 0.1}, 'school', {line: 'school', pop: 800, jobs: 7, in: {cloth: 5, lux: 2}, opens: ['books']}),
  // the humans' tavern, one a town: it cooks whatever raw food the town has, brews its own drink of it and sells the meal
  B('tavern', 'трактир', 'm', 'life', 1, H, {trade: 0.1, prestige: 0.05, health: 0.03}, {line: 'tavern', jobs: 6, fire: 30, in: {raw: 150, tools: 1.2}, out: {food: 120, drink: 300, gold: 50}, opens: ['tavern']}),
  T('bigtavern', 'большой трактир', 'm', 'life', 2, H, {trade: 0.1, prestige: 0.05, health: 0.03}, 'tavern', {line: 'tavern', jobs: 10, fire: 50, in: {raw: 250, tools: 2}, out: {food: 200, drink: 500, gold: 80}, opens: ['tavern']}),
  A('stage', 'сцена', 'f', 'power', 2, H, {prestige: 0.05}, ['tavern'], {line: 'tavern'}),
  A('den', 'притон', 'm', 'trade', 1, H, {trade: 0.15}, ['tavern'], {line: 'tavern', needs: ['road'], local: 'den', jobs: 2, in: {drink: 60, tools: 0.4}, out: {gold: 30}, opens: ['den']}),
  B('inn', 'постоялый двор', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, {line: 'inn', needs: ['road'], jobs: 3, fire: 30, in: {food: 4, drink: 100}, out: {gold: 60}, opens: ['inn']}),
  // the harbour opens the sea lanes (atlas/sea.js): traffic to other harbours, faster than any road
  B('harbor', 'гавань', 'f', 'trade', 2, [...H, ...E], {trade: 0.35}, {line: 'harbor', needs: ['coast'], here: ['pier'], notable: true, jobs: 10, in: {planks: 20}, out: {gold: 120}, opens: ['harbor', 'sealanes']}),
  A('lighthouse', 'маяк', 'm', 'trade', 2, [...H, ...E], {trade: 0.1, defence: 0.05}, ['harbor'], {line: 'harbor', needs: ['coast'], jobs: 1, fire: 40, opens: ['lighthouse']}),
  A('shipyard', 'верфь', 'f', 'craft', 2, [...H, ...E], {trade: 0.25, prod: 0.1}, ['harbor'], {line: 'harbor', needs: ['coast', 'forest'], jobs: 15, in: {planks: 200, fiber: 40, cloth: 30}, opens: ['shipyard']}),
  // the dwarves' golem forge: a golem a season — it takes over a work of the town, or stands guard (atlas/golems.js, GOLEMS)
  // the dwarves' reworking, one in a town: what the town has over its keep and safety into what it lacks — its works and its
  // people's basic needs — at the worth in gold, `k` to one, up to `worth` gold of it a year at full hands (atlas/treasury.js)
  B('recycler', 'переработка', 'f', 'craft', 0, D, {prod: 0.05}, {line: 'recycler', jobs: 4, recycle: {k: 4, worth: 400}, opens: ['craft']}),
  B('golemforge', 'кузня големов', 'f', 'craft', 1, D, {prod: 0.2, defence: 0.1}, {line: 'golemforge', requires: ['forge'], local: 'golemforge', notable: true, jobs: 6, fire: 60, any: {bars: 40}, opens: ['golems']}),
  // coin of gold or silver ingots or of gems (MINT), into the purse
  B('mint', 'монетный двор', 'm', 'trade', 2, [...H, ...D], {trade: 0.2, prestige: 0.15}, {line: 'mint', needs: ['precious'], requires: ['market'], pop: 800, capital: true, jobs: 4, in: {tools: 0.8}, any: {coin: 1}, yields: MINT_YIELDS, opens: ['coinage']}),
  // the wards of a mage tower hold the dead off (atlas/lairs.js: the undead's raids on it fail oftener, the rot around fades)
  B('magetower', 'башня мага', 'f', 'lore', 2, [...H, ...E], {lore: 0.3, defence: 0.15, prestige: 0.15}, {line: 'magetower', pop: 800, notable: true, jobs: 3, in: {potions: 5, lux: 2}, opens: ['magic']}),

  // ── the lines of the town: walls, water, stores, trade, power, fame, memory
  B('palisade', 'частокол', 'm', 'defence', 1, [...H, ...O], {defence: 0.25}, {line: 'wall', needs: ['forest'], local: 'palisade', in: {wood: 40}}),
  // a hedge of thorn grown round the town instead of a palisade: it holds, slows and tears whoever comes through
  V('thornhedge', 'колючая изгородь', 'f', 'defence', 1, E, {defence: 0.3}, {line: 'wall', local: 'thornhedge', jobs: 1, in: {wood: 10}}),
  V('earthwall', 'земляной вал', 'm', 'defence', 1, O, {defence: 0.3}, {line: 'wall'}),
  V('tunnels', 'подземные ходы', 'pl', 'defence', 0, D, {defence: 0.2, trade: 0.1}, {line: 'wall', needsAny: ['steep', 'caves'], jobs: 2, in: {wood: 10}}),
  T('stonewall', 'каменные стены', 'pl', 'defence', 1, [...H, ...D], {defence: 0.5}, 'palisade', {line: 'wall', tierBy: {dwarves: 0}, here: ['palisade', 'tunnels', 'stonewall'], needs: ['stone'], requires: ['quarry'], local: 'stonewall', in: {stone: 30}}),
  T('hiddenpaths', 'тайные тропы', 'pl', 'defence', 1, E, {defence: 0.35}, 'thornhedge', {line: 'wall', needs: ['forest'], jobs: 3}),
  A('watchtower', 'сторожевая вышка', 'f', 'defence', 1, ALL, {defence: 0.15}, WALLS, {line: 'wall', local: 'watchtower', jobs: 2, in: {wood: 5}}),
  A('tower', 'крепостные башни', 'pl', 'defence', 2, [...H, ...D], {defence: 0.3}, ['stonewall'], {line: 'wall', jobs: 10, in: {stone: 15, arms: 2}}),
  // the dwarves' walls of metal, each in place of the one before it: bronze, iron, steel, mithril — the ingots they take a year
  T('bronzewall', 'бронзовая стена', 'f', 'defence', 1, D, {defence: 0.7, prestige: 0.05}, 'stonewall', {line: 'wall', requires: ['smelter'], jobs: 4, in: {stone: 20, bar_bronze: 6}}),
  T('ironwall', 'железная стена', 'f', 'defence', 2, D, {defence: 0.9, prestige: 0.1}, 'bronzewall', {line: 'wall', requires: ['forge'], jobs: 6, in: {stone: 20, bar_iron: 6}}),
  T('steelwall', 'стальная стена', 'f', 'defence', 2, D, {defence: 1.1, prestige: 0.15}, 'ironwall', {line: 'wall', requires: ['forge'], jobs: 8, in: {stone: 20, bar_steel: 4}}),
  T('mithrilwall', 'мифриловая стена', 'f', 'defence', 2, D, {defence: 1.5, prestige: 0.3}, 'steelwall', {line: 'wall', requires: ['forge'], pop: 800, jobs: 10, in: {stone: 20, bar_mithril: 1}}),
  T('citadel', 'цитадель', 'f', 'defence', 2, [...H, ...D], {defence: 0.6, prestige: 0.2}, 'stonewall', {line: 'wall', pop: 800, jobs: 40, in: {stone: 40, arms: 6, armor: 3}}),
  B('well', 'колодец', 'm', 'life', 1, ALL, {health: 0.1}, {line: 'water', local: 'well', in: {stone: 2}}),
  A('bathhouse', 'баня', 'f', 'life', 2, [...H, ...D], {health: 0.15}, ['well'], {line: 'water', needs: ['water'], jobs: 3, fire: 120}),
  T('aqueduct', 'акведук', 'm', 'life', 2, H, {health: 0.3}, 'well', {line: 'water', needs: ['stone'], pop: 800, house: 100, jobs: 2, in: {stone: 22}}),
  B('granary', 'амбар', 'm', 'food', 0, ALL, {food: 0.15}, {line: 'stores', local: 'granary', jobs: 1}),
  T('cellar', 'погреба и ледники', 'pl', 'food', 2, [...H, ...D], {food: 0.25, health: 0.05}, 'granary', {line: 'stores', jobs: 2}),
  B('market', 'рынок', 'm', 'trade', 1, ALL, {trade: 0.3, prestige: 0.05}, {line: 'trade', jobs: 4, opens: ['market']}),
  A('warehouse', 'торговые склады', 'pl', 'trade', 2, [...H, ...D], {trade: 0.15}, ['market'], {line: 'trade', jobs: 2}),
  // the humans' trading post doubles a trade route's worth (atlas/diplomacy.js)
  A('tradepost', 'торговый пост', 'm', 'trade', 1, H, {trade: 0.35}, ['market'], {line: 'trade', needs: ['road'], local: 'tradepost', notable: true, jobs: 3, in: {food: 5}, out: {gold: 40}}),
  B('eldershall', 'дом старейшин', 'm', 'power', 0, ALL, {prestige: 0.1}, {line: 'power', jobs: 2}),
  T('townhall', 'ратуша', 'f', 'power', 2, [...H, ...D], {prestige: 0.3, trade: 0.05}, 'eldershall', {line: 'power', jobs: 8}),
  A('palace', 'дворец', 'm', 'power', 2, [...H, ...E], {prestige: 0.4}, ['eldershall'], {line: 'power', pop: 800, capital: true, jobs: 20, in: {lux: 10, food: 10}}),
  // the throne hall crowns a people's seat: one per realm, only its capital builds it (data/peoples.js CAPITAL)
  A('throne', 'тронный зал', 'm', 'power', 2, ALL, {prestige: 0.3, trade: 0.1, defence: 0.1}, ['eldershall', 'warcamp'], {line: 'power', pop: 800, capital: true, unique: true, notable: true, jobs: 10, in: {lux: 15}, opens: ['capital']}),
  B('monument', 'памятник', 'm', 'power', 2, ALL, {prestige: 0.15}, {line: 'fame', pop: 800, in: {stone: 20}}),
  B('arena', 'арена', 'f', 'power', 2, [...O, ...H], {prestige: 0.15, defence: 0.05}, {line: 'fame', jobs: 4, in: {food: 5, drink: 100}}),
  B('cemetery', 'кладбище', 'n', 'faith', 1, ALL, {faith: 0.05, health: 0.05}, {line: 'memory', jobs: 1}),
  A('crypt', 'усыпальница', 'f', 'faith', 2, [...H, ...D], {faith: 0.1}, ['cemetery'], {line: 'memory', jobs: 1, in: {stone: 5}}),
  A('catacombs', 'катакомбы', 'pl', 'faith', 2, D, {faith: 0.1, health: 0.05}, ['cemetery'], {line: 'memory', needs: ['caves'], house: 100, jobs: 1, in: {stone: 5}}),
]);
// a building of the local map it stands for: always a list (the beast dens stand for the warg den and the spider den)
for (const b of TOWN_BUILDINGS.all()) if (typeof b.local === 'string') b.local = [b.local];
// the lines a tier grows from (`upgrades`, step by step): lineHas(built, id) — the town has `id` or a tier grown from it
const GROWN = new Map();
for (const b of TOWN_BUILDINGS.all()) if (b.kind === 'tier') for (const id of b.upgrades) (GROWN.has(id) ? GROWN : GROWN.set(id, [])).get(id).push(b.id);
const grownFrom = id => { const out = [], todo = [...(GROWN.get(id) || [])]; while (todo.length) { const x = todo.pop(); if (out.includes(x)) continue; out.push(x); todo.push(...(GROWN.get(x) || [])); } return out; };
export const TIERS_OF = Object.fromEntries(TOWN_BUILDINGS.all().map(b => [b.id, grownFrom(b.id)]));
export const lineHas = (built, id) => { const has = built instanceof Set ? x => built.has(x) : x => built.includes(x); return has(id) || (TIERS_OF[id] || []).some(has); };
// the recipes of a building, and what a building or a recipe takes and gives (its own and its recipes')
export const recipesOf = b => b.recipes || [];
// the indicators an entry asks for (a building of `req`: the steelworks while iron ingots are in the store), by the one
// checker (data/requirements.js reqNeeds, core/requirements.js) against the town's lights
export const reqLit = (req, lit) => meets(reqNeeds(req), litFacts(lit));

// what a building gives, as one number for each effect (0 where it gives nothing)
// (`people`: the town's people — a building may give some peoples more, `fxBy`: the humans' temple teaches)
export const fxOf = (b, key, people = null) => (key === 'housing' ? (b.house || 0) / TOWN_FX.room[1] : (b.fx[key] || 0) + (b.fxBy?.[people]?.[key] || 0));

// the buildings that let a realm work a metal (`metals`); none — everyone works it
export const metalBuildings = m => TOWN_BUILDINGS.filter(b => b.metals?.includes(m)).map(b => b.id);
// the races of a local building (data/buildings.js id): the peoples of the town building that stands for it (`local`);
// null — anyone (or no town building stands for it). One truth: they are edited here, in «Постройки городов»
// (several town buildings may stand for one local building — the pens of the humans and of the greenskins: the peoples of all of them)
export const localPeoples = localId => { const l = TOWN_BUILDINGS.all().filter(b => [b.local].flat().includes(localId)); if (!l.length || l.some(b => !b.peoples)) return null; return [...new Set(l.flatMap(b => b.peoples))]; };
// whether a people (data/peoples.js id) builds this local building — not enforced on the local map yet (docs/TODO.md)
export const peopleBuildsLocal = (people, localId) => { const p = localPeoples(localId); return !p || p.includes(people); };
// every metal some building opens, and its word for the cards
export const gatedMetals = () => [...new Set(TOWN_BUILDINGS.all().flatMap(b => b.metals || []))];
export const METAL_WORDS = {bronze: 'бронза', iron: 'железо', steel: 'сталь', silver: 'серебро', gold: 'золото', mithril: 'мифрил'};

// How a town lives by its buildings' flows (atlas/economy.js), a year:
//   order     — the categories in the order the town's hands are shared out: food first, the great works last
//   rounds    — rounds of sharing the goods out between the buildings that take them (each gets its share of what is made)
//   soft      — the strength a building keeps without a soft good it takes
//   captured  — the strength of a building of another people (taken, or built before): it works, but at this share
//   slaves    — a town's slaves (t.slaves, the orcs' raids): they work first, at `work` of a free hand, in at most `share`
//               of a building's places (the rest — masters and overseers — are free); they eat as the town's people do;
//               each year `waste` of them are gone (dead, run off, freed)
//   heat      — the climate's weight on the wood a town burns to keep warm (atlas/economy.js heatFactor)
//   boats     — a shipyard's boats: its fishers (`fish`) give × k, as the yard works
//   sea       — the sea around a town feeds as land would (atlas/sea.js seaFeed) × its best fishers: these shares
// food a building gives net: ready food and stores, raw food at what a kitchen makes of it (TOWN_FLOW.rawFood) — what it gives
// over what it takes; of its recipes, the best one that may run (`lit`: the town's indicators; none — the first that asks for
// nothing of the people or the kind)
const FOOD_GOODS = io => Object.entries(io || {}).reduce((s, [g, v]) => s + (g === 'food' || g === 'stores' ? v : g === 'raw' ? v * TOWN_FLOW.rawFood : g === 'beasts' ? v * TOWN_FLOW.herd.food * TOWN_FLOW.rawFood : 0), 0);
// (wf — × what a people's work of this kind gives of a good: data/peoples.js workFlows, the greenskins' hunt)
const scaled = (io, wf) => (wf ? Object.fromEntries(Object.entries(io || {}).map(([g, v]) => [g, v * (wf[g] ?? 1)])) : io);
const ioFood = (x, wf) => FOOD_GOODS(scaled(x.out, wf)) - FOOD_GOODS(x.in);
export const foodNet = (b, lit = null, wf = null) => {
  const R = recipesOf(b).filter(q => (lit ? reqLit(q.req, lit) : !(q.req || []).some(r => /^(people|kin):/.test(r))));
  return ioFood(b, wf) + (R.length ? Math.max(...R.map(q => ioFood(q, wf))) : 0);   // (a pen's increase counts as the meat it gives at the slaughterhouse)
};

// Fuel (docs/WORLD.md «Кухни и топливо»): the warmth of homes (`heat`) and the heat of the works (`fire`) are charges of one
// fuel; each good that burns gives so many charges a unit — fuel (charcoal, stone coal, dung: counted in charges) 1, a log 1,
// the brushwood its people gather by hand (TOWN_FLOW.gather) half. A town burns what it has, by the cheapest charge first;
// the charcoal burners make three logs' worth of heat of every log they burn.
export const FUEL = {fuel: 1, wood: 1, brush: 0.5};
// Pools: what a building takes of any of a set of goods (its `any`), each good counted × its weight — heat and fire take the
// fuel; the funeral rites any ingots by worth; the golem forge any ingots; the mint gold, silver or gems; the luxury workshop,
// last, its materials. They take in this order, each from what the buildings' own `in` left over, the rest shared by what
// there is of each good.
export const POOLS = {bars: {bar_bronze: 1, bar_iron: 1, bar_steel: 1, bar_mithril: 1}, fuel: FUEL, rite: RITE, coin: COIN, finery: FINERY};
// (the pools that take of each good by how much there is, not the cheapest first: the mint strikes of all it gets)
export const POOL_SHARE = new Set(['coin']);
// the pools a building does without at TOWN_FLOW.soft, as a soft good (the funeral rites with no ingots)
export const POOL_SOFT = new Set(['rite']);
// the pools that take two goods — the two the town has most of, by what each gives the pool; a third only where those run
// short (the luxury workshop works any two materials)
export const POOL_PAIR = new Set(['finery']);
export const KITCHENS = ['firepit', 'hearth', 'cookhouse'];
// Ores (docs/WORLD.md «Металлы по рудам»): a mine digs `dig.n` ore a year of the kinds it reaches (`dig.ores`), shared by how
// rich its cell is in each (atlas/geology.js ore fields: iron, bronze — copper and tin —, silver, gold, mithril; a cell rich in
// none — iron), and `dig.coal` charges of fuel × how rich it is in coal. Each ore is a good of its own, each smelted by its recipe.
export const ORE_GOODS = {iron: 'ore_iron', bronze: 'ore_bronze', silver: 'ore_silver', gold: 'ore_gold', mithril: 'ore_mithril'};
// what a building can make at all: its `out`, its recipes', the ores it digs, the metals of its yields
export const makesOf = b => [...new Set([...Object.keys(b.out || {}), ...recipesOf(b).flatMap(q => Object.keys(q.out || {})), ...(b.dig?.ores || []).map(k => ORE_GOODS[k]), ...(b.dig?.coal ? ['fuel'] : []),
  ...Object.values(b.yields || {}).flatMap(o => Object.keys(o))])];
// what a building takes at all, its own and its recipes' (`in`)
export const takesOf = b => [...new Set([...Object.keys(b.in || {}), ...recipesOf(b).flatMap(q => Object.keys(q.in || {}))])];

// Slots (docs/WORLD.md «Слоты»): a town holds at most `town[step]` works of its own in it — not the works on the map (`site`), not
// housing; two of a kind take two; a tier takes its base's place. Upgrades have slots of their own (`upgrades[step]`). A town at its
// slots razes a work of its own that works below `raze` for `years` years running, to make room (atlas/build.js)
export const TOWN_SLOTS = {town: [8, 16, 24], upgrades: [1, 2, 4], raze: 0.25, years: 2, idle: 0.5};   // (idle: a town whose council finds nothing to build razes its worst work below this, one a season: atlas/build.js)
export const slotKind = b => (b.kind === 'upgrade' ? 'upgrades' : b.site || b.cat === 'housing' || b.kind === 'tier' ? null : 'town');

export const TOWN_FLOW = {boats: {by: 'shipyard', k: 1.5, fish: ['fishhut', 'pier']},
  // Livestock is raised by the pens and pastures (`beasts`: their increase a year) and killed only at the slaughterhouse
  // (its `in`): the store keeps `keep` head for each pen at work, the slaughter never takes them; `food` — the meat a head
  // (for the town's choice: what a pen feeds through the slaughterhouse, data foodNet)
  herd: {at: ['pen', 'pasture'], keep: 2, food: 5},
  sea: {fishhut: 0.3, pier: 0.5, harbor: 0.7},
  order: ['food', 'raw', 'craft', 'life', 'housing', 'defence', 'faith', 'trade', 'lore', 'power'],
  gather: {brush: 2},   // what a town's people gather a head a year by hand, with no building (brushwood: half a charge of fuel)
  // recipeFloor — the least weight of a recipe that may run when the store holds none of what it takes (it still asks for it)
  recipeFloor: 0.05,
  rounds: 8, soft: 0.5, captured: 0.5, rawFood: 0.8, slaves: {work: 0.6, share: 0.8, waste: 0.1}, hands: 0.5, shortAt: 0.01,
  heat: {cold: -2, warm: 14, k: [1.6, 0.4]}};   // heat × k[0] at or below `cold` °C, × k[1] at or above `warm` (a year's mean), between in a line

// The money of the towns (atlas/treasury.js; docs/WORLD.md «Деньги городов»). Each town has a store of goods (t.stock) and a
// treasury (t.gold); each realm a treasury (realm.gold).
//   start     — a town's first gold in each purse (treasury, people, makers): × its people; dust — less than this of a good is none
//   needs     — what the people buy a season, a head: `basic` all of them, `comfort` × how rich they are (their gold a head
//               against `rich`); the town grows × (grow[0] + grow[1] × basic met) × (1 + comfortGrow × comfort met)
//   makers    — the makers pay `wage` a season for each free hand at work, as far as their purse goes; the treasury takes `tax` of
//               the season's earnings of the makers and of the people; link — the gold of goods bought down a link that counts
//               as a person fed down it (atlas/sites.js)
//   plunder   — a raid won carries off `raid` of the beaten town's goods and gold, a storm `storm`; × `cult` for a people of the
//               cult of war; `chief` of the gold to the raiders' treasury, the rest to their people; the cult picks its target by what it
//               would carry off × its might against the target's (at most `dare`)
//   build     — what a building takes: the materials by its kind (out of the store, or bought in the linked towns; homes are raised of logs —
//               boards are what they take a year, not what they are built of, or a town without a sawmill could never house itself) and the people's
//               work by its step (step 0 — the hamlet's own hands, free); a town that cannot pay the best one tries `tries` others
//               (atlas/treasury.js planBuild); wood and stone not to be had the people gather by hand at × `gather.k` of their price
//               (that gold goes to nobody: their hours), taking `gather.hands` free hands a unit for the season. Paid, it is raised
//               as the town's one project (atlas/build.js): `days` work-days by its step × (1 + jobs / jobsPer) × (1 + house /
//               housePer), its builders `crew` of the town's people each day
//   store     — a good's room in the store: × a year of what the town makes and takes of it (at least `least`); food is not
//               stored here (it goes by the net, atlas/sites.js) — the granary of the ration's price is the town's surplus; stores
//               (заготовки) are: they keep, are sold and bought as any good, and a town eats them in a hungry year (atlas/peoples.js)
//   keep      — the seasons of what its works take a town keeps for them; safety — the seasons of its people's basic needs it
//               keeps for them (they may draw on it, nobody else); the rest it sells to the linked towns that lack it
//   buy       — the share of a season's lack a town buys, as far as its gold goes
//   foreign   — a town of another realm that trades with it (atlas/diplomacy.js trades) pays × this (the road, the toll)
//   merchants — what is over the store's room is sold off to passing merchants at × `cheap` of its price, × `fair` where a
//               market, a trading post, an inn, a caravanserai or a harbour stands (`at`) — the dearest first, while their purse lasts:
//               `purse` gold a season for each of the town's people, × (1 + its trade); the rest is lost
//   upkeep    — the gold a year each building costs: data/kingdom.js UPKEEP × `gold`, paid to the people who keep them; what the town cannot pay — the realm's
//               treasury pays; what neither can is unpaid (t.unpaid, a share): its buildings work × (1 − `cut` × unpaid), and the
//               realm's decay grows by it
//   tax       — the share of a town's treasury above `keep` × its people the realm takes a year, by its edict of taxes; the
//               same share of what its store can spare of the goods in `realm.kind` the realm takes in kind besides, as far as
//               its own store lacks them (atlas/treasury.js taxYear)
//   realm     — the realm's treasury: its gold and its store (realm.stock) of the goods in `kind` — at most `kind[g]` for each
//               100 of its people. Each season (atlas/treasury.js realmKeep) it keeps its war host: its towns' garrisons —
//               `spend` × `army` (more at war) of its gold a year, a man a year for `man` gold, shared by their people, each a
//               man of the town's might; its armies in the field — `wage` gold a man a year (what it cannot pay, `desert` of
//               the unpaid share of the men leave in a year), a store a man a year for food (unfed, an army eats its carried
//               supplies: data/parties.js ARMY), their arms and armour worn by ARMY.wear.season and made up to ARMY.kit out
//               of its store. Once a year after the tax (atlas/treasury.js realmSpend) `spend` × (1 − `army`) of its gold is
//               granted to its towns to build (atlas/mind.js councilShares): a town holds at most `hoard` × `build` gold of
//               grants, what is over stays in the realm's treasury. Corruption (from the branch Elves) takes `corrupt` × its
//               points of the tax on the way, gold and goods alike (at most corruptMax); the court is paid `court` gold a year
//               for each office filled, for each 1000 of the realm's people (atlas/treasury.js realmDuties); customs take
//               `duty` of what a town buys of another realm, for the buyer's realm;
//               storming a seat carries off `seat` of the beaten realm's treasury; a realm that hates a neighbour `ratio`
//               times mightier (attitude below `tribute.below`) pays it `tribute.share` of its gold a year
//   price     — the market of the season: a good its works lack (`short`) or its people (`need`) dearer, one it has in plenty
//               cheaper, within lo … hi;
//               a ration cheaper by the town's surplus of food (its feeds over its people, at most `food` off)
export const TOWN_MONEY = {start: {gold: 0.2, people: 0.3, makers: 0.2}, dust: 0.01, store: 1, least: 20, keep: 1, safety: 1, buy: 1, foreign: 1.25,
  merchants: {cheap: 0.4, fair: 0.7, purse: 0.03, at: ['market', 'tradepost', 'inn', 'caravanserai', 'harbor']},
  needs: {basic: {wood: 0.05, cloth: 0.01, ware: 0.004, salt: 0.002, leather: 0.004, drink: 0.02, tools: 0.002},
    comfort: {lux: 0.001, potions: 0.002, cloth: 0.01, drink: 0.02, herbs: 0.008}, rich: 1, grow: [0.95, 0.05], comfortGrow: 0.1, unmet: 0.1},
  makers: {wage: 0.15, tax: 0.15}, people: {tax: 0.1}, link: 2,
  plunder: {raid: 0.25, storm: 0.5, cult: 3, chief: 0.3, dare: 1.5, slaves: 0.4},
  build: {days: [60, 180, 480], jobsPer: 20, housePer: 400, crew: 0.006, labor: [0, 10, 30], tries: 3, payer: {housing: 'peopleGold', food: 'makersGold', raw: 'makersGold', craft: 'makersGold', default: 'gold'}, gather: {goods: ['wood', 'stone'], k: 3, hands: 0.5}, mats: {housing: {wood: 30}, defence: {stone: 30, wood: 10}, craft: {wood: 10, stone: 5}, raw: {wood: 10}, food: {wood: 10}, default: {wood: 10, stone: 10}}},
  upkeep: {gold: 60, cut: 0.5}, realm: {spend: 0.4, army: {peace: 0.3, war: 0.7}, kind: {stores: 5, arms: 1, armor: 0.5, herbs: 0.3}, man: 3, build: 400, hoard: 3, corrupt: 0.03, corruptMax: 0.35, court: 3, wage: 0.2, desert: 0.3, duty: 0.05, seat: 0.5, tribute: {below: -1.5, ratio: 2.5, share: 0.05}}, tax: {keep: 0.02, rate: {high: 0.3, need: 0.3, usual: 0.15, light: 0.05, rich: 0.05}},
  price: {short: 0.6, need: 0.4, plenty: 0.4, lo: 0.6, hi: 1.8, food: 0.4}};

// The golems of a golem forge (atlas/golems.js): a season after the forge stands, a golem each season — of the best metal
// its realm works (`tiers`, data/townBuildings.js `metals`). First it takes over a unit of work (`order`: the mine first),
// one for every `per` people (at least one): the unit needs `jobs` of its hands and gives `bonus` more by the golem's metal;
// then it remakes the takers in a better metal, once the realm works one; then it stands guard — one for every `per` people,
// each worth `men` of the town's people in its might and its army (atlas/towns.js might, atlas/diplomacy.js muster). A golem is made
// only while the forge works at least `make.work` and of `make.metal` of the store's metal.
export const GOLEMS = {
  order: ['mineshaft', 'deepmine', 'quarry', 'smelter', 'smelter2', 'forge', 'foundry', 'charpit', 'sawmill', 'woodcut', 'saltworks',
    'crafthut', 'tannery', 'tannery2', 'loom', 'loom2', 'potter', 'jeweler', 'glassworks', 'mushrooms', 'watermill', 'brewery'],
  tiers: ['bronze', 'iron', 'steel', 'mithril'],
  per: 400, jobs: 0.5, make: {work: 0.5, metal: 20},   // (metal: ingots of the golem's own metal — bronze, iron, steel, mithril: METALS)
  bonus: {bronze: 0.25, iron: 0.35, steel: 0.45, mithril: 0.6},
  men: {bronze: 4, iron: 6, steel: 8, mithril: 12},
};

// How a town's buildings work (atlas/towns.js), on top of their effects:
//   room:      the people its houses hold: room[0] + Σ house (room[1] — people a point of the `housing` need stands for)
//   might:     √(people + trained beasts + guard golems + garrison) × (1 + defence + mightProd × production) — its strength against raids
//              and armies; work — the least share of its effects a building gives however badly it works
//   raid:      the share of a raid's harm it takes: 1 − raidFaith × faith − raidHealth × health, never below raidFloor
//   needs:     what it wants to build, 0 … ~1.5 an effect: housing and food fill as people reach full[0] of room or of
//              what the land feeds, over full[1]; defence — the threat, + defence[1] while it was raided in the last
//              `raided` years, at most defence[0], + defence[2]; the others — a base + a step a tier (trade + its road,
//              + trade[2] from tier 2; lore only from tier 2, else lore[2]; health + health[2] after a raid)
// flow: a town's choice by its economy (atlas/towns.js chooseBuilding) — `short` × the share of a good its buildings lack, for a
//   building that gives it; `needs` × the share of it its people could not buy (atlas/treasury.js t.needs.lack); `spare` × the share of a good it makes and nothing takes, for a building that takes it
//   (not for the goods in `spareSkip`: food is not stored, its surplus is the town's bread, not a reason to build a smokehouse); all of these together at most `cap`
//   (a work of seven goods is not worth seven works); `food` × the
//   food need × its food (foodNet) / `foodRef`, for one that feeds; `scourged` — a field burnt by an army costs the land's feed
//   foodNet / foodRef × this (atlas/sites.js); a building that takes a hard good no building of its realm makes is worth
//   `idle` of itself; one whose goods all fill the store already (their price at the market's floor) is worth `glut` of itself;
//   a building that wants `hands` × its jobs and finds
//   fewer free is not built
export const TOWN_FX = {room: [120, 100], work: 0.5, mightProd: 0.3, raidFloor: 0.4, raidFaith: 0.5, raidHealth: 0.5, flow: {short: 0.6, needs: 0.4, spare: 0.3, spareSkip: ['food', 'stores', 'gold'], cap: 1.2, glut: 0.4, food: 0.4, foodRef: 50, scourged: 0.3, hands: 0.5, idle: 0.3, tierUp: 1, tierAt: 0.8},
  needs: {full: [0.55, 0.4], housing: [2], food: [1.3, 0.1], raided: 6, defence: [1.5, 0.8, 0.1], trade: [0.15, 0.6, 0.3], prod: [0.4, 0.1],
    faith: [0.25, 0.15], lore: [0.25, 0.1, 0.03], prestige: [0.15, 0.15], health: [0.25, 0.1, 0.3]}};

// What a town's place must have for a building (atlas/towns.js placeHas): cells around to look, and the thresholds —
// a lake, magma, gold sand, salt (a salt lake; or the coast where it is warmer than saltSea°), clay (alluvium), stone
// (rough ground below stoneFlat of flatness or above stoneHigh of the land's height), fertile soil, a forest (tree
// cover), steep and flat ground, graves (barrows), warm (°C), dry country; `near` — the cells around for the rest
export const PLACE_AT = {near: 2, lake: 2, magma: 3, placer: 1, salt: 4, saltSea: 14, clay: 0.3, stoneFlat: 0.75, stoneHigh: 0.2, fertile: 0.5, arableFert: 0.3, arableFlat: 0.6,
  forest: 0.5, steep: 0.5, flat: 0.7, graves: 3, gravesAt: 0.2, warm: 12, dry: 3};
