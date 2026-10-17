// Buildings of the world map's towns. What a town has built decides how it lives: how many it
// houses, how much it feeds, what it makes and trades, how it holds off the wild, what it believes
// and knows, how far its name carries. Towns choose what to build by their needs (atlas/towns.js),
// the way the colonists' council does on the local map.
//
// Fields of an entry:
//   name, g       what it is called (the chronicle says «появилась кузня»), and the gender of the word
//   cat           category (CATEGORIES below)
//   tier          from which town step it can be built (data/peoples.js TIERS: 0 hamlet, 1 village, 2 town);
//                 the buildings that earn a step (TIERS needsAny) are built one step earlier
//   pop           and at least this many people (the great works of a big town)
//   capital       only the seat of a people's realm builds it (data/peoples.js CAPITAL, `crowned`)
//   unique        one for the whole realm (for now: the people)
//   peoples       who builds it (data/peoples.js ids, and those to come — FUTURE_PEOPLES); none — anyone
//   needs         conditions of the place, all of them (PLACE_NEEDS below); needsAny — at least one
//   requires      buildings the town must already have, all of them; requiresAny — at least one
//   max           how many a town may have (houses and fields can be many), 1 if not said
//   fx            what it gives, per building (EFFECTS below)
//   local         the building of the local map it stands for (data/buildings.js id), if there is one;
//                 the rest exist only on the world map for now
//   notable       the chronicle tells when it is built (also everything from tier 2 up)
import {Registry} from '../core/registry.js';

// peoples that are not in the world yet but whose buildings could be here already
export const FUTURE_PEOPLES = [];

export const CATEGORIES = {
  housing: 'жильё', food: 'еда', raw: 'добыча', craft: 'ремесло', trade: 'торговля и пути',
  defence: 'оборона', faith: 'вера', lore: 'знание', power: 'власть и слава', life: 'быт и здоровье',
};

// What the effects mean in a town's evaluation (atlas/towns.js):
//   housing   room for 100 people each; a town does not grow past its room
//   food      + share of what the land around feeds
//   prod      making: wealth of the town, and the might of its arms with defence
//   trade     + share of the traffic it sends down the roads, and of its growth
//   defence   + share of its might against monsters and raids
//   faith     steadiness: a raid costs less;  lore — knowledge (magic and schooling later)
//   prestige  draws settlers: faster growth, and its people's land spreads further from it
//   health    fewer die in a raid or a murrain
export const EFFECTS = {housing: 'жильё', food: 'еда', prod: 'ремесло', trade: 'торговля', defence: 'оборона', faith: 'вера', lore: 'знание', prestige: 'слава', health: 'здоровье'};

// Conditions of the place a building can ask for (atlas/towns.js placeHas)
export const PLACE_NEEDS = {
  water: 'река, озеро или море рядом', river: 'река', coast: 'морской берег', lake: 'озеро рядом',
  ore: 'железо, медь или серебро не хуже «есть»', gems: 'самоцветы', coal: 'уголь', magma: 'магма поблизости',
  precious: 'золото или серебро', placer: 'золотой песок', salt: 'солёное озеро или тёплый морской берег',
  clay: 'глина: пойма, глинистый сланец или известняк', stone: 'камень: склоны или скалы рядом',
  fertile: 'плодородная земля', forest: 'лес рядом', pasture: 'луга, степь или саванна рядом',
  steep: 'крутые склоны', flat: 'ровная земля', caves: 'пещеры: известняк или базальт', road: 'наезженная дорога',
  warm: 'тёплый климат', dry: 'степь, пустыня или саванна рядом',
};

const B = (id, name, g, cat, tier, peoples, fx, more = {}) => ({id, name, g, cat, tier, peoples, fx, max: 1, ...more});
const ALL = null, E = ['elves'], D = ['dwarves'], H = ['humans'], O = ['orcs'];

export const TOWN_BUILDINGS = new Registry('townBuilding');
TOWN_BUILDINGS.registerAll([
  // ── housing
  B('hut', 'шалаши', 'pl', 'housing', 0, ALL, {housing: 1}, {max: 2, local: 'hut'}),
  B('yurts', 'шатры', 'pl', 'housing', 0, O, {housing: 1.5}, {max: 8}),
  B('house', 'избы', 'pl', 'housing', 1, [...H], {housing: 2}, {max: 6, needsAny: ['forest', 'clay'], local: 'house'}),
  B('longhouse', 'длинный дом', 'm', 'housing', 1, [...H, ...O], {housing: 2.5, prestige: 0.03}, {max: 4, needs: ['forest']}),
  B('treehouse', 'дома на деревьях', 'pl', 'housing', 1, E, {housing: 3}, {max: 8, needs: ['forest']}),
  B('hallhomes', 'подгорные жилища', 'pl', 'housing', 1, D, {housing: 4, defence: 0.05}, {max: 8, needsAny: ['steep', 'caves']}),
  B('stonehouse', 'каменные дома', 'pl', 'housing', 2, [...H, ...D], {housing: 4, defence: 0.03}, {max: 8, needs: ['stone'], requires: ['quarry']}),
  B('barracks', 'казармы', 'pl', 'housing', 2, [...H, ...D, ...O], {housing: 1, defence: 0.25}, {requiresAny: ['armory', 'warcamp']}),
  // ── food
  B('garden', 'огороды', 'pl', 'food', 0, ALL, {food: 0.15}, {max: 3, needs: ['fertile'], local: 'garden'}),
  B('field', 'пашни', 'pl', 'food', 0, [...H, ...O], {food: 0.3}, {max: 4, needs: ['fertile', 'flat'], local: 'field'}),
  B('grove', 'плодовые рощи', 'pl', 'food', 1, E, {food: 0.3}, {max: 4, needsAny: ['forest', 'fertile']}),
  B('mushrooms', 'грибные пещеры', 'pl', 'food', 1, D, {food: 0.3}, {max: 4, needsAny: ['caves', 'steep']}),
  B('pen', 'загоны', 'pl', 'food', 0, [...H, ...D, ...O], {food: 0.15}, {max: 2, needs: ['pasture'], local: 'pen'}),
  B('pasture', 'выгоны и стада', 'pl', 'food', 1, [...H, ...O], {food: 0.25, prod: 0.05}, {max: 3, needs: ['pasture']}),
  B('lodge', 'охотничий навес', 'm', 'food', 0, ALL, {food: 0.1}, {needsAny: ['forest', 'pasture'], local: 'lodge'}),
  B('fishhut', 'рыбацкие хижины', 'pl', 'food', 0, ALL, {food: 0.15}, {max: 2, needs: ['water'], local: 'fishhut'}),
  B('pier', 'рыбная пристань', 'f', 'food', 1, [...H, ...E], {food: 0.25, trade: 0.05}, {needsAny: ['coast', 'lake']}),
  B('quern', 'ручные жернова', 'pl', 'food', 0, ALL, {food: 0.05}, {local: 'quern'}),
  B('watermill', 'водяная мельница', 'f', 'food', 2, [...H, ...D], {food: 0.2, prod: 0.1}, {needs: ['river'], requiresAny: ['field', 'garden', 'mushrooms']}),
  B('windmill', 'ветряная мельница', 'f', 'food', 2, H, {food: 0.15}, {needs: ['flat'], requires: ['field']}),
  B('bakery', 'пекарня', 'f', 'food', 2, [...H, ...D], {food: 0.1, health: 0.05}, {requiresAny: ['watermill', 'windmill']}),
  B('smokehouse', 'коптильня', 'f', 'food', 1, ALL, {food: 0.1}, {requiresAny: ['lodge', 'fishhut', 'pen'], local: 'smokehouse'}),
  B('dryrack', 'вешала и бочки', 'pl', 'food', 0, ALL, {food: 0.05}, {local: 'dryrack'}),
  B('granary', 'амбар', 'm', 'food', 0, ALL, {food: 0.15}, {local: 'granary'}),
  B('cellar', 'погреба и ледники', 'pl', 'food', 2, [...H, ...D], {food: 0.1, health: 0.05}),
  B('apiary', 'пасека', 'f', 'food', 1, [...H, ...E], {food: 0.05, prod: 0.05}, {needsAny: ['forest', 'fertile'], needs: ['warm']}),
  B('brewery', 'пивоварня', 'f', 'food', 2, [...H, ...D, ...O], {prod: 0.1, prestige: 0.05}, {requiresAny: ['field', 'garden', 'mushrooms']}),
  B('vineyard', 'виноградники', 'pl', 'food', 2, [...H, ...E], {trade: 0.15, prestige: 0.05}, {needs: ['warm', 'fertile']}),
  // ── raw materials
  B('woodcut', 'лесосека', 'f', 'raw', 0, [...H, ...D, ...O], {prod: 0.1}, {needs: ['forest']}),
  B('sawmill', 'лесопилка', 'f', 'raw', 1, [...H, ...D], {prod: 0.15}, {needs: ['forest'], local: 'sawmill'}),
  B('quarry', 'каменоломня', 'f', 'raw', 0, [...H, ...D], {prod: 0.1}, {needs: ['stone'], local: 'quarry'}),
  B('claypit', 'глиняный карьер', 'm', 'raw', 0, [...H, ...D], {prod: 0.05}, {needs: ['clay']}),
  B('mineshaft', 'рудник', 'm', 'raw', 0, [...H, ...D, ...O], {prod: 0.25, trade: 0.1}, {needs: ['ore'], local: 'mineshaft', notable: true}),
  B('deepmine', 'глубокие шахты', 'pl', 'raw', 2, D, {prod: 0.3, trade: 0.15}, {needsAny: ['ore', 'gems', 'precious'], requires: ['mineshaft']}),
  B('charpit', 'углежогная яма', 'f', 'raw', 1, [...H, ...D, ...O], {prod: 0.05}, {needs: ['forest'], local: 'charpit'}),
  B('coalpit', 'угольные копи', 'pl', 'raw', 1, [...H, ...D], {prod: 0.15}, {needs: ['coal']}),
  B('saltworks', 'солеварня', 'f', 'raw', 1, [...H, ...D], {trade: 0.2, food: 0.05}, {needs: ['salt']}),
  B('placer', 'золотой прииск', 'm', 'raw', 1, [...H, ...D, ...O], {trade: 0.2}, {needs: ['placer'], notable: true}),
  // ── crafts
  B('loom', 'ткацкая', 'f', 'craft', 1, ALL, {prod: 0.1}, {local: 'loom'}),
  B('potter', 'гончарня', 'f', 'craft', 1, [...H, ...D, ...E], {prod: 0.05}, {needs: ['clay'], local: 'potter'}),
  B('tannery', 'дубильня', 'f', 'craft', 1, [...H, ...D, ...O], {prod: 0.1}, {requiresAny: ['lodge', 'pen', 'pasture'], local: 'tannery'}),
  B('crafthut', 'мастерская ремесленника', 'f', 'craft', 1, ALL, {prod: 0.1}, {local: 'crafthut'}),
  B('smelter', 'плавильный горн', 'm', 'craft', 1, [...H, ...D, ...O], {prod: 0.15}, {requires: ['mineshaft'], local: 'smelter'}),
  B('forge', 'кузня', 'f', 'craft', 1, [...H, ...D, ...O], {prod: 0.2, defence: 0.1}, {requires: ['smelter'], local: 'forge', notable: true}),
  B('foundry', 'литейня', 'f', 'craft', 2, [...H, ...D], {prod: 0.25, trade: 0.1}, {requires: ['forge'], pop: 800}),
  B('magmaforge', 'магмовая кузня', 'f', 'craft', 2, D, {prod: 0.35, prestige: 0.2, defence: 0.1}, {needs: ['magma'], requires: ['forge'], local: 'magmaforge', pop: 800}),
  B('jeweler', 'ювелирная мастерская', 'f', 'craft', 2, [...H, ...D, ...E], {prod: 0.1, trade: 0.2, prestige: 0.1}, {needs: ['gems'], local: 'jeweler'}),
  B('armory', 'оружейная', 'f', 'craft', 2, ALL, {defence: 0.2}, {requiresAny: ['crafthut', 'forge'], local: 'armory'}),
  B('bowyer', 'мастерская луков', 'f', 'craft', 1, [...E, ...H], {defence: 0.15}, {needs: ['forest']}),
  B('shipyard', 'верфь', 'f', 'craft', 2, [...H, ...E], {trade: 0.25, prod: 0.1}, {needs: ['coast', 'forest']}),
  B('glassworks', 'стеклодувня', 'f', 'craft', 2, [...H, ...D], {prod: 0.1, trade: 0.1, prestige: 0.05}, {needsAny: ['coast', 'clay'], pop: 800}),
  B('alchemist', 'лаборатория алхимика', 'f', 'craft', 2, [...H, ...E, ...D], {lore: 0.15, health: 0.1}, {pop: 800}),
  B('hearth', 'общинный очаг', 'm', 'life', 0, [...H, ...D], {health: 0.05}, {local: 'hearth'}),
  // ── trade and ways
  B('ferry', 'перевоз', 'm', 'trade', 0, [...H, ...E, ...O], {trade: 0.05}, {needs: ['river']}),
  B('bridge', 'мост', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, {needs: ['river'], requires: ['quarry']}),
  B('inn', 'постоялый двор', 'm', 'trade', 1, [...H, ...D], {trade: 0.15}, {needs: ['road']}),
  B('toll', 'дорожная застава', 'f', 'trade', 1, [...H, ...D, ...O], {trade: 0.05, defence: 0.05}, {needs: ['road']}),
  B('market', 'рынок', 'm', 'trade', 1, ALL, {trade: 0.3, prestige: 0.05}),
  B('warehouse', 'торговые склады', 'pl', 'trade', 2, [...H, ...D], {trade: 0.15}, {requires: ['market']}),
  B('caravanserai', 'караван-сарай', 'm', 'trade', 2, [...H, ...O], {trade: 0.25}, {needs: ['road', 'dry']}),
  B('harbor', 'гавань', 'f', 'trade', 2, [...H, ...E, ...O], {trade: 0.35}, {needs: ['coast'], requiresAny: ['pier', 'shipyard']}),
  B('mint', 'монетный двор', 'm', 'trade', 2, [...H, ...D], {trade: 0.2, prestige: 0.15}, {needs: ['precious'], requires: ['market'], pop: 800, capital: true}),
  // ── defence
  B('palisade', 'частокол', 'm', 'defence', 1, [...H, ...E, ...O], {defence: 0.25}, {needs: ['forest'], local: 'palisade'}),
  B('watchtower', 'сторожевая вышка', 'f', 'defence', 1, ALL, {defence: 0.15}, {local: 'watchtower'}),
  B('hiddenpaths', 'тайные тропы', 'pl', 'defence', 1, E, {defence: 0.35}, {needs: ['forest']}),
  B('warcamp', 'боевой стан', 'm', 'defence', 1, O, {defence: 0.3, prestige: 0.1}),
  B('stonewall', 'каменные стены', 'pl', 'defence', 1, [...H, ...D], {defence: 0.5}, {needs: ['stone'], requires: ['quarry']}),
  B('tunnels', 'подземные ходы', 'pl', 'defence', 1, D, {defence: 0.2, trade: 0.1}, {needsAny: ['steep', 'caves']}),
  B('tower', 'крепостные башни', 'pl', 'defence', 2, [...H, ...D], {defence: 0.3}, {requires: ['stonewall']}),
  B('citadel', 'цитадель', 'f', 'defence', 2, [...H, ...D], {defence: 0.6, prestige: 0.2}, {requires: ['tower'], pop: 800}),
  // ── faith
  B('shrine', 'святилище', 'n', 'faith', 0, ALL, {faith: 0.15}, {local: 'shrine'}),
  B('shamanhut', 'хижина шамана', 'f', 'faith', 0, O, {faith: 0.15, health: 0.1}),
  B('sacredgrove', 'священная роща', 'f', 'faith', 0, E, {faith: 0.3}, {needs: ['forest']}),
  B('stonecircle', 'каменный круг', 'm', 'faith', 0, [...H, ...O], {faith: 0.2}, {needsAny: ['stone', 'steep']}),
  B('ancestorhall', 'зал предков', 'm', 'faith', 1, D, {faith: 0.3, prestige: 0.1}, {requires: ['shrine']}),
  B('temple', 'храм', 'm', 'faith', 1, [...H, ...E, ...D], {faith: 0.3, prestige: 0.1}, {requires: ['shrine']}),
  B('crypt', 'усыпальница', 'f', 'faith', 2, [...H, ...D], {faith: 0.1}),
  B('cemetery', 'кладбище', 'n', 'faith', 1, ALL, {faith: 0.05, health: 0.05}),
  // ── lore
  B('school', 'школа', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.15}),
  B('library', 'библиотека', 'f', 'lore', 2, [...H, ...E, ...D], {lore: 0.3, prestige: 0.1}, {requires: ['school'], pop: 800}),
  B('magetower', 'башня мага', 'f', 'lore', 2, [...H, ...E], {lore: 0.3, defence: 0.15, prestige: 0.15}, {pop: 800}),
  // ── power and fame
  B('eldershall', 'дом старейшин', 'm', 'power', 0, ALL, {prestige: 0.1}),
  B('townhall', 'ратуша', 'f', 'power', 2, [...H, ...D], {prestige: 0.2, trade: 0.05}, {requires: ['eldershall']}),
  B('palace', 'дворец', 'm', 'power', 2, [...H, ...E], {prestige: 0.4}, {requiresAny: ['townhall', 'eldershall'], pop: 800, capital: true}),
  B('arena', 'бойцовская яма', 'f', 'power', 2, [...O, ...H], {prestige: 0.15, defence: 0.05}),
  B('monument', 'памятник', 'm', 'power', 2, ALL, {prestige: 0.15}, {pop: 800}),
  // the throne hall crowns a people's seat: one per realm, only its capital builds it (data/peoples.js CAPITAL)
  B('throne', 'тронный зал', 'm', 'power', 2, ALL, {prestige: 0.3, trade: 0.1, defence: 0.1}, {pop: 800, capital: true, unique: true, requiresAny: ['eldershall', 'townhall', 'ancestorhall', 'warcamp'], notable: true}),
  // ── life and health
  B('well', 'колодец', 'm', 'life', 1, ALL, {health: 0.1}, {local: 'well'}),
  B('healerhut', 'хижина лекаря', 'f', 'life', 1, ALL, {health: 0.15}, {local: 'healerhut'}),
  B('hospice', 'лечебница', 'f', 'life', 2, [...H, ...E], {health: 0.25}, {requires: ['healerhut']}),
  B('bathhouse', 'баня', 'f', 'life', 2, [...H, ...D], {health: 0.15}, {needs: ['water']}),
  B('aqueduct', 'акведук', 'm', 'life', 2, H, {health: 0.2, housing: 1}, {needs: ['stone'], requires: ['well'], pop: 800}),
]);

// what a building gives, as one number for each effect (0 where it gives nothing)
export const fxOf = (b, key) => b.fx[key] || 0;
