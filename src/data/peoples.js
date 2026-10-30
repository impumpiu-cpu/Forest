// The peoples of the world map: who comes, when, where they feel at home, how they spread, what
// they build and what they call their towns. The systems are in src/atlas/peoples.js (the peoples as
// fields and the towns they found), atlas/towns.js (what towns build) and atlas/roads.js (roads worn by traffic).
//
//   race:     the race on the local map (data/races.js), whose people they are
//   era:      the era they come in (data/history.js ERAS)
//   arrive:   how they come into the world: `groups` founding bands; `mode` where — the best spot of
//             their land (default), the best coast (`coast`, from over the sea) or as far from everyone
//             as their land lets them (`far`, out of the wild edges); `free` — how much they shun land another
//             people already lives on (0 — not at all; 1 — only empty land)
//   home:     how much a biome suits them, 0..1 — their carrying capacity, as for the beasts; it is
//             the race's `home` (data/races.js), so the local and the world map agree on where a
//             race belongs; `ores`: weight of the rock's ore wealth (dwarves live off the mountains)
//   moves:    how easily they spread through a biome (×), the rest at `movesElse`
//   spread / growth: diffusion and logistic growth of the people field a year (Fisher–KPP)
//   spacing:  a town stands at least this many cells (of a 192-cell-high world) from any other town
//   settlers: a full town sends `pop` of its people to found a new town (atlas/peoples.js sendSettlers; docs/WORLD.md
//             «Демография»): only from `from` people, keeping at least `keep`; on a free spot within `reach` × spacing;
//             they carry what its store can spare of `goods`
//   migrate:  share of a town's people ready to move in a season to a better town (fame and how well their needs are met
//             draw them): of their realm, or of another realm that trades with it, nearby (atlas/demography.js)
//   welcome:  the other peoples whose folk this people takes into its towns by migration (its own kin of other realms always)
//   site:     what makes a good spot for a town, beyond the biome: water, coast, fertility, ores, steep
//   rose:     the course the people keeps its realm to over the years, along the three vectors (data/mind.js): the
//             greenskins to war, the dwarves to craft and hoard, the humans to growth, the elves to a warded, crafted home
//   taste:    how much the people care for each kind of effect when a town chooses what to build
//             (data/townBuildings.js EFFECTS, atlas/towns.js); who builds what is in data/townBuildings.js
//   flows:    × on what its buildings give of a good (data/townBuildings.js TOWN_GOODS, `out`): the elves' gardens
//             yield more, their humane quarries less; none — ×1
//   hands:    the share of its people who work (the rest are children, the old, those who keep house): the hands its
//             town's buildings share out (atlas/economy.js); elves have few children and many elders, orcs put everyone to work
//   eat:      food a year of one of its people, in people-years (data/townBuildings.js TOWN_GOODS food): an orc eats more
//   placeFlows: more × where its town stands on such a place (data/townBuildings.js PLACE_NEEDS, any of `needsAny`)
//   swaps:    a good its buildings never take, and what they take instead: {silver: {to: 'wood', k: 3}} — an elven
//             jeweller sets gems in ironwood and the sacred tree, three of wood for one of metal; its people's needs and the
//             materials of its building swap the same way (atlas/treasury.js)
//   levy:     × the share of a town's people its army takes (data/parties.js ARMY.levy); breed — × how fast its towns grow;
//             needs — × the goods its people want a head (atlas/treasury.js); none — ×1
//   eatsRaw:  raw foods it eats as they are (data/townBuildings.js TOWN_GOODS `raw`): they feed it as cooked food does
//   tradeUp:  goods it sells as soon as it has them, for another at `rate` of the worth ({sells, buys, rate}: the greenskins sell
//             luxury, gems and silver for arms — atlas/peoples.js tradeUp, a season)
//   wants:    its own wants a head beyond TOWN_MONEY.needs ({basic, comfort}: {good: amount a head a year}; 0 — it wants none of it)
//   names:    syllables of town names: first + middle (may be empty) + last
//   color:    on the world map
import {Registry} from '../core/registry.js';
import {RACES} from './races.js';

// the race's own «Биомы расселения» (data/races.js), read each time: an edit of the races table reaches the peoples
const raceHome = id => RACES.find(r => r.id === id).home;

export const WORLD_PEOPLES = new Registry('worldPeople');
WORLD_PEOPLES.registerAll([
  {id: 'elves', race: 'elf', label: 'эльфы', labelGen: 'эльфов', adj: 'эльфийский', era: 'elder', color: [120, 200, 120],
    hands: 0.4, eat: 0.85,
    arrive: {verb: 'пробудились', groups: 2, where: 'в самой древней чаще'},
    get home() { return raceHome('elf'); },
    moves: {forest: 1.4, jungle: 1.2, taiga: 1.2, meadow: 1, swamp: 0.6}, movesElse: 0.25,
    spread: 0.22, growth: 0.18, spacing: 16,
    site: {water: 0.35, coast: 0.15, fert: 0.3, trees: 0.5, ores: 0, steep: -0.4},
    settlers: {pop: 30, from: 150, keep: 90, reach: 2.5, goods: {stores: 30, wood: 30, tools: 3}}, migrate: 0.005, welcome: [],
    eatsRaw: ['produce'],   // the elves eat the grove's fruit as it is: it feeds them as cooked food does (atlas/economy.js)
    rose: {agg: 0.35, grow: 0.2, econ: 0.45},
    taste: {housing: 1, food: 1, prod: 0.6, trade: 0.8, defence: 0.9, faith: 1.3, lore: 1.3, prestige: 1, health: 1.1},
    // children of the wood: the land feeds them better, herbs and honey are theirs, stone and clay they take humanely;
    // metal they do not touch — the ironwood and the sacred tree stand for it
    flows: {food: 1.25, grain: 1.25, herbs: 1.5, honey: 1.5, potions: 1.5, hide: 1.25, stone: 0.5, clay: 0.5},
    swaps: {silver: {to: 'wood', k: 3}, drink: {to: 'honey', k: 1}},   // they brew no beer: mead and honey wine of the hives
    breed: 0.8,   // long lives, few children: their towns grow slowest (× TOWN_LIFE.growth)
    names: {first: ['Ла', 'Эль', 'Ми', 'Ти', 'Ан', 'Иль', 'Си', 'Ар', 'Фе', 'Лин', 'Ни', 'Ло'], mid: ['', 'ри', 'нэ', 'ла', 'во', 'ми', 'ан', 'ли'],
      last: ['эль', 'дор', 'риэль', 'ин', 'ион', 'алон', 'энна', 'ассэ', 'ориэн', 'улин']}},
  {id: 'dwarves', race: 'dwarf', label: 'дварфы', labelGen: 'дварфов', adj: 'дварфийский', era: 'elder', color: [220, 150, 70],
    hands: 0.55, eat: 1.15,
    // strangers (atlas/diplomacy.js): the dwarves love only dwarves — a town of theirs takes in folk of other peoples at
    // × `take` of the usual pace, and pushes them out by `expel` of its people a year; on shared land they press the others
    // × `push` harder (atlas/peoples.js)
    folk: {take: 0.25, expel: 0.03, push: 1.5},
    // digging and craft: the best miners, the hottest furnaces, masters' work; ancestors are poured beer, not wax;
    // under the mountain (steep slopes or caves at the town) they dig a quarter more
    flows: {ironOre: 1.5, copperOre: 1.5, silverOre: 1.5, mithrilOre: 1.5, stone: 1.5, gems: 1.5, bronze: 1.25, iron: 1.25, steel: 1.25, silver: 1.25, mithril: 1.25, coal: 1.25, tools: 1.25, arms: 1.25, armor: 1.25},
    // beer for the ancestors; leather and hide where others wear cloth (no pastures under the mountain); stone bowls for pots
    swaps: {honey: {to: 'drink', k: 1}, cloth: {to: 'leather', k: 1}, pots: {to: 'stone', k: 2}},
    breed: 0.9,   // few children, long lives
    placeFlows: {needsAny: ['steep', 'caves'], flows: {ironOre: 1.25, copperOre: 1.25, silverOre: 1.25, mithrilOre: 1.25, stone: 1.25}},
    arrive: {verb: 'вышли из-под гор', groups: 2, where: 'у самых богатых жил'},
    get home() { return raceHome('dwarf'); }, ores: 0.4,
    moves: {foothills: 1.4, highlands: 1.3, volcano: 1}, movesElse: 0.3,
    spread: 0.18, growth: 0.16, spacing: 14,
    site: {water: 0.2, coast: 0, fert: 0.05, trees: 0, ores: 0.8, steep: 0.3},
    settlers: {pop: 30, from: 150, keep: 90, reach: 2.5, goods: {stores: 30, stone: 30, tools: 4}}, migrate: 0.005, welcome: [],
    rose: {agg: 0.2, grow: 0.2, econ: 0.6},
    taste: {housing: 1, food: 1, prod: 1.4, trade: 1, defence: 1.2, faith: 1, lore: 0.8, prestige: 1.2, health: 0.9},
    names: {first: ['Кхаз', 'Бар', 'Дур', 'Гра', 'Тор', 'Ка', 'Бо', 'Гим', 'Дол', 'Мор', 'Ун', 'Зир'], mid: ['', 'ак', 'ин', 'ум', 'ар', 'ек', 'од'],
      last: ['-дум', 'гард', 'хейм', 'бар', 'зад', 'грим', 'тор', 'карак', 'дин', 'бунд']}},
  {id: 'humans', race: 'human', label: 'люди', labelGen: 'людей', adj: 'людской', era: 'young', color: [100, 150, 235],
    hands: 0.5, eat: 1,
    // the middling people: no gift of their own, but every road leads to them — they take in strangers × `take` faster and
    // trade warms them × `trade` (atlas/diplomacy.js); the crowd of many peoples breeds crime (data/kingdom.js crime `folk`);
    // they settle among the others: on shared land another people pushes them off only × (1 − `mix`), and their town may stand
    // within `near` × their spacing of another people's town — by the elves' coast, under the dwarves' hills (atlas/peoples.js)
    folk: {take: 1.5, mix: 0.5, near: 0.7},
    trade: 1.25, breed: 1.3,   // many children: the middling people spread faster than the elder ones
    arrive: {verb: 'приплыли из-за моря', groups: 2, where: 'к самому удобному берегу', mode: 'coast', free: 0.7},   // an empty shore: not the elves' coast (atlas/peoples.js arrive)
    get home() { return raceHome('human'); },
    moves: {meadow: 1.4, steppe: 1.4, shrubland: 1.2, savanna: 1.2, forest: 1}, movesElse: 0.4,
    spread: 0.26, growth: 0.24, spacing: 11,
    site: {water: 0.35, coast: 0.25, fert: 0.5, trees: 0.1, ores: 0.2, steep: -0.2},
    settlers: {pop: 30, from: 130, keep: 80, reach: 2.5, goods: {stores: 30, wood: 30, tools: 3}}, migrate: 0.02, welcome: ['elves', 'dwarves', 'orcs'],
    rose: {agg: 0.25, grow: 0.45, econ: 0.3},
    taste: {housing: 1, food: 1.2, prod: 1, trade: 1.3, defence: 1, faith: 1, lore: 0.9, prestige: 1.1, health: 1},
    names: {first: ['Бел', 'Яр', 'Вел', 'Свят', 'Мир', 'Глад', 'Рад', 'Ост', 'Лю', 'Звени', 'Добр', 'Влад'], mid: ['', 'о', 'е', 'ино'],
      last: ['град', 'город', 'слав', 'поль', 'ск', 'мир', 'бор', 'ец', 'горск', 'дол']}},
  {id: 'orcs', race: 'orc', label: 'зеленокожие', labelGen: 'зеленокожих', adj: 'зеленокожий', era: 'young', color: [210, 80, 60],
    hands: 0.6, eat: 1.25,
    // a people of many kinds (atlas/towns.js townKin): every town holds them all, each × (base + its biome's weight); the
    // greatest share is the town's leading kind. A building of a kind's own (data/townBuildings.js `kin`) wants its share
    // at KIN.least or more
    kin: {
      orc:    {base: 1, home: {steppe: 2, meadow: 1.5, savanna: 1, tundra: 1, shrubland: 1}},
      goblin: {base: 0.6, home: {foothills: 2, highlands: 1.5, forest: 1.2, taiga: 1, swamp: 0.8}},
      gnoll:  {base: 0.2, home: {savanna: 2.5, desert: 2, barrows: 2, steppe: 0.6, shrubland: 0.8}},
      troll:  {base: 0.05, home: {swamp: 1.2, taiga: 0.8, tundra: 0.6, forest: 0.6, ice: 0.8}},
      ogre:   {base: 0.15, home: {foothills: 0.4, forest: 0.3, taiga: 0.3}},
    },
    // the cult of war (atlas/deeds/warOn.js, makePeace.js): `chance` a year to start a war with any neighbour it borders,
    // whatever they think of each other (another realm of greenskins too), `rest` years at least after the last peace; a war
    // lasts `years` [from, to] and ends by itself, the attitude back where it was before it; a raid of theirs sours the
    // other only × `raid`. Their might in a fight × `might` (atlas/towns.js might)
    // they will not crowd: every house of theirs holds × `house` of its people (atlas/towns.js townFx); shacks and tents are
    // their homes, no rough housing to breed corruption (`roughHome`: atlas/towns.js roughShare)
    house: 0.75, roughHome: true,
    // a horde: a third of its people go to war (× ARMY.levy), it breeds fast (its towns grow × `breed`: many children, not all live),
    // it wants half the goods of the others to live content (× its people's needs, atlas/treasury.js)
    // nomads and warriors (from the branch Elves): luxury, gems and silver they sell as soon as they have them and buy arms at
    // 0.8 of the worth (atlas/peoples.js tradeUp); they want no luxury, and arms are a need of theirs
    tradeUp: {sells: ['lux', 'gems', 'silver'], buys: 'arms', rate: 0.8}, wants: {basic: {arms: 0.004}, comfort: {lux: 0}},
    levy: 10 / 3, breed: 1.45, needs: 0.5, beastLevy: 1,   // and it brings all its trained war beasts into the fight (data/parties.js ARMY.beasts)
    // what they do without: brew poured to the spirits for honey and wax, meat smoked on the fire for salt, skulls and horns
    // for pots, rough logs for boards (atlas/economy.js swaps)
    swaps: {honey: {to: 'drink', k: 1}, salt: {to: 'wood', k: 2}, pots: {to: 'bone', k: 1}, planks: {to: 'wood', k: 1.5}},
    // open land is theirs: by the steppe and the pasture their herds and hunts give more (atlas/economy.js placeFlows)
    placeFlows: {needsAny: ['pasture', 'flat'], flows: {food: 1.25, beasts: 1.25, hide: 1.25}},
    warCult: {chance: 0.3, rest: 2, years: [2, 5], raid: 0.5, might: 1.15, raids: 3},   // raids — × how often its towns raid and how many a year (war feeds them: atlas/treasury.js plunder)
    arrive: {verb: 'пришли с диких окраин', groups: 2, where: 'туда, где никто их не ждал', mode: 'far'},
    get home() { return raceHome('orc'); }, ores: 0.3,
    moves: {steppe: 1.5, savanna: 1.4, tundra: 1.2, swamp: 1, meadow: 1.2}, movesElse: 0.5,
    spread: 0.3, growth: 0.26, spacing: 13,
    site: {water: 0.3, coast: 0, fert: 0.1, trees: 0.1, ores: 0.3, steep: 0.1},
    settlers: {pop: 25, from: 110, keep: 70, reach: 2.5, goods: {stores: 25, hide: 20, arms: 3}}, migrate: 0.03, welcome: ['elves', 'dwarves', 'humans'],
    rose: {agg: 0.55, grow: 0.3, econ: 0.15},
    taste: {housing: 1, food: 1, prod: 0.9, trade: 0.6, defence: 1.4, faith: 0.9, lore: 0.3, prestige: 1.3, health: 0.8},
    names: {first: ['Гор', 'Груш', 'Мор', 'Ург', 'Зог', 'Крах', 'Шаг', 'Буг', 'Гра', 'Ног'], mid: ['', 'ак', 'ук', 'аг', 'ор'],
      last: ['-баш', 'гат', 'рук', 'мог', 'душ', 'заг', '-тар', 'нак']}},
]);

// a good as a people takes it (`swaps`): [the good, × how much] — the greenskins' bone for pots, the elves' wood for metal
export const swapOf = (P, g) => { const s = P?.swaps?.[g]; return s ? [s.to, s.k] : [g, 1]; };
// a basket of goods as a people takes it, × k: several goods may become one (the horde's wood for both salt and boards);
// the buildings' flows, the people's needs, the materials of a building and the town's choices all read goods through this
export function swapGoods(people, goods, k = 1) {
  const P = typeof people === 'string' ? (WORLD_PEOPLES.has(people) ? WORLD_PEOPLES.get(people) : null) : people, out = {};
  for (const [g, n] of Object.entries(goods || {})) { const [to, x] = swapOf(P, g); out[to] = (out[to] || 0) + n * x * k; }
  return out;
}

// a kind's share a town must hold for a building of that kind's own (data/townBuildings.js `kin`)
export const KIN = {least: 0.08};

// Town sizes: three steps, earned by what the town has built (docs/WORLD.md).
// A town is a step when it has at least `pop` people and any of the buildings in `needsAny`
// (data/townBuildings.js); it falls a step when its people drop below TIER_FALL of that `pop`.
// Within a step the size runs free: a town is a town at 400 and at 6000.
// What each people calls a town of that size, in the cases the chronicle needs:
// [nominative, accusative, genitive, prepositional, instrumental], and the gender of the word.
export const TIERS = [
  {pop: 0, needsAny: null,
    label: {elves: ['приют', 'приют', 'приюта', 'приюте', 'приютом'], dwarves: ['застава', 'заставу', 'заставы', 'заставе', 'заставой'],
      humans: ['хутор', 'хутор', 'хутора', 'хуторе', 'хутором'], orcs: ['стойбище', 'стойбище', 'стойбища', 'стойбище', 'стойбищем']},
    gender: {elves: 'm', dwarves: 'f', humans: 'm', orcs: 'n'}},
  {pop: 60, needsAny: ['granary', 'eldershall', 'shrine', 'shamanhut', 'sacredgrove', 'stonecircle'],
    label: {elves: ['селение', 'селение', 'селения', 'селении', 'селением'], dwarves: ['посёлок', 'посёлок', 'посёлка', 'посёлке', 'посёлком'],
      humans: ['деревня', 'деревню', 'деревни', 'деревне', 'деревней'], orcs: ['становище', 'становище', 'становища', 'становище', 'становищем']},
    gender: {elves: 'n', dwarves: 'm', humans: 'f', orcs: 'n'}},
  {pop: 500, needsAny: ['market', 'stonewall', 'hiddenpaths', 'tunnels', 'earthwall', 'temple', 'ancestorhall'],
    label: {elves: ['город', 'город', 'города', 'городе', 'городом'], dwarves: ['крепость', 'крепость', 'крепости', 'крепости', 'крепостью'],
      humans: ['город', 'город', 'города', 'городе', 'городом'], orcs: ['твердыня', 'твердыню', 'твердыни', 'твердыне', 'твердыней']},
    gender: {elves: 'm', dwarves: 'f', humans: 'm', orcs: 'f'}},
];
export const TIER_FALL = 0.7;
// the capital: not a step but a flag — the seat of a people's realm, crowned by its throne hall
// (data/townBuildings.js `throne`); what each people calls it
export const CAPITAL = {
  label: {elves: ['столица', 'столицу', 'столицы', 'столице', 'столицей'], dwarves: ['чертог', 'чертог', 'чертога', 'чертоге', 'чертогом'],
    humans: ['столица', 'столицу', 'столицы', 'столице', 'столицей'], orcs: ['ставка', 'ставку', 'ставки', 'ставке', 'ставкой']},
  gender: {elves: 'f', dwarves: 'm', humans: 'f', orcs: 'f'},
};
// the step a town has earned: the highest whose people and buildings it has (steps are not skipped)
export function tierOf(t) {
  let k = 0;
  for (let i = 1; i < TIERS.length; i++) {
    const T = TIERS[i];
    if (t.pop >= T.pop && T.needsAny.some(id => t.built.includes(id))) k = i; else break;
  }
  return k;
}
// is the town the crowned seat of its people
export const crowned = t => !!t.capital && t.built.includes('throne');

// Realms (atlas/realms.js): a people is a race, a realm is a state — a seat and the towns that hold
// to it. Each founding band is its own realm, so a race starts as two. A realm is named by the land
// of its seat, so no made-up town name has to be declined: «дварфы Медной горы», «эльфы Тёмного леса».
// The first epithet that fits the seat's cell is taken, in the order: a rich ore, the water, the biome;
// if that name is already a realm's of the same people, the next in that order.
export const EPITHETS = {
  ores: {gold: ['Золотых жил'], silver: ['Серебряных копей'], bronze: ['Медной горы', 'Медных холмов'], iron: ['Железных холмов', 'Ржавых гор'], gems: ['Самоцветных гор'], coal: ['Чёрных копей']},
  water: {coast: ['Солёного берега', 'Белого берега', 'Дальнего берега'], great: ['Великой реки'], river: ['Тихой реки', 'Быстрой реки', 'Светлой реки'],
    lake: ['Светлого озера', 'Тихого озера'], salt: ['Солёного озера']},
  biomes: {forest: ['Тёмного леса', 'Старых дубрав', 'Зелёной сени'], taiga: ['Чёрной тайги', 'Сосновых боров'], jungle: ['Зелёных дебрей'], meadow: ['Широких лугов', 'Вольных трав'],
    steppe: ['Вольной степи', 'Ковыльного моря'], savanna: ['Жёлтых трав', 'Красной земли'], shrubland: ['Сухих холмов', 'Каменистых пустошей'], desert: ['Красных песков', 'Горячих ветров'],
    tundra: ['Белых мхов', 'Студёной земли'], foothills: ['Высоких холмов', 'Долгих склонов'], highlands: ['Седых гор', 'Снежных вершин'], swamp: ['Чёрных топей'], volcano: ['Огненной горы'], ice: ['Вечных льдов'], water: ['Семи островов']},
  else: ['Далёкой земли', 'Края света', 'Новых земель', 'Последнего предела'],
};

// Schisms (atlas/realms.js stepRealms). A realm's seat holds its towns by privilege: the throne, the
// palace, the mint. A town that outgrows the seat may break away:
//   edge       a town of the second step with at least this share of the seat's people (the seat's own
//              glory is privilege: the throne, the palace, the mint — so people are weighed, not fame)…
//   far        …standing at least this far from the seat (in fronts, data/diplomacy.js)…
//   harbor     a harbour town without a harbour at the seat counts this many fronts further away
//   years      …for this many years running is a contender
//   chance     a contender breaks away with this chance a year, × how far it stands (in fronts) and
//              × `shaken` when the realm is at war or the seat was raided lately — families hold on
//              while the realm is quiet
//   attitude   the two realms start from this, and drift back to their race's memory of itself
//   war        chance that the split comes with a war for power at once
// When a seat is burnt, the most glorious town takes the throne; if a second is at least `rival` of it,
// the realm breaks in two instead.
// The realm's land on the map (atlas/realms.js realmLand; the map's layer «Державы»): each living town holds the land it
// reaches over the ground — the cost of a step is its length × (1 + steep × the slope), water stops it — within its
// people's spacing × (reach + tier × its step + capital for the seat); where two towns reach, the nearer by that measure
// (the cost over the town's own reach) holds it
export const REALM_LAND = {reach: 1.4, tier: 0.25, capital: 0.4, steep: 1};
export const SCHISM = {edge: 0.8, far: 0.35, harbor: 0.4, years: 3, chance: 0.08, shaken: 1.6, attitude: -1.5, war: 0.35, rival: 0.6};

// Towns against the wild: a town fights the lairs whose territory reaches it; the town's might is
// √pop × `might`, the lair's its strength × its owner's SPECIAL power. A beaten lair is cleared;
// a town that loses is raided and loses `raidLoss` of its people.
export const TOWN_WAR = {might: 0.9, chance: 0.08, raidLoss: 0.2, reach: 4, luck: [0.6, 0.8], threat: 0.5};

// The young peoples' era (the start setting «Эпоха молодых»), in years.
export const YOUNG_YEARS = [
  {years: 25, label: 'Короткая'},
  {years: 40, label: 'Обычная'},
  {years: 60, label: 'Долгая'},
];

// The eras' length (the start setting «Эпоха древних»), in years.
export const ELDER_YEARS = [
  {years: 25, label: 'Короткая'},
  {years: 40, label: 'Обычная'},
  {years: 60, label: 'Долгая'},
];

// The life of the peoples and their towns on the world map (atlas/peoples.js), a year at a time:
//   band:      the field a founding band (or a band landed by hand) wakes around it; bandPop — its town's people,
//              bandPop[0] + bandPop[1] × a roll;  siteBar — the least a spot is worth for a band to settle there
//   oresAway:  how much the ores count off a people's home biomes (dwarves)
//   hearth:    a town keeps its people's field up around it: hearth[0] + hearth[1] × its tier + hearth[2] × its fame
//   hunt:      people thin the beasts where they live: predators and monsters, the others
//   foundLand: the least carrying capacity of the land under a new town (the settlers' spot)
//   settle:    a town sends settlers from `full` of what feeds and houses it, all the way at full + span (or as it grows big:
//              all the way at (1 + big) × its people's `from`), with `chance` ×
//              that a year, no oftener than every `every` years; at most `max` new towns a year a people; `near` — how much
//              nearness counts for the settlers' spot (× its share of the reach)
//   migration: a town of another realm is `abroad` as dear; people move up to moveReach × spacing away; a town over its room
//              sends `overflow` of the surplus away a season;  abandon — a town of fewer people is left (atlas/demography.js)
//   feeds:     the people a town's land feeds: feeds × the land's share × (fert[0] + fert[1] × the soil) × (home[0] +
//              home[1] × how its realm likes the biome) × (1 + road × the road or harbour) × capital for a capital ×
//              (1 + its food − what armies took + trade × its trade)
//   hold:      a people holds its land only near its living towns: within near × its spacing the field lives as it
//              will, past far × spacing it fades by `fade` of itself a year (between — in part); a burnt people's land
//              goes with its towns
//   growth:    a year: + growth × (1 + prestige × fame) × pop × (1 − pop / the target, at least minTarget) — born of its
//              people, and over the target dying off; no roll and no floor (people are not made out of nothing)
export const TOWN_LIFE = {hold: {near: 2.5, far: 4, fade: 0.3}, band: 0.6, bandPop: [90, 60], siteBar: 0.4, oresAway: 0.3, hearth: [0.45, 0.15, 0.2], hunt: {predator: 0.3, other: 0.12},
  foundLand: 0.25, settle: {full: 0.75, span: 0.25, big: 2, chance: 0.6, every: 3, max: 2, near: 0.2}, abroad: 0.6, moveReach: 3, overflow: 0.5, abandon: 10,
  feeds: 1400, fert: [0.6, 0.4], home: [0.7, 0.3], road: 0.6, capital: 1.4, trade: 0.3,
  growth: 0.22, prestige: 0.6, minTarget: 60};

// The greenskins' fighting pits (data/townBuildings.js fightpits, atlas/beasts.js): each season a town with pits catches a
// beast or a monster of the land about — the densest of those that live in its coarse cell, the bigger first (a beast's
// worth: health × blow) — and breaks it to war, while it holds fewer than one for every `per` of its people; a war beast
// counts as its worth × `men` of the town's people in its might and its armies. Never a thinking kind (a troll is a greenskin)
export const WAR_BEASTS = {per: 200, men: 2, least: 0.002, work: 0.5,
  dens: {wargden: {species: 'varg', every: 1}, spiderden: {species: 'spider', every: 2}, hyenadens: {species: 'hyena', every: 2}}};
