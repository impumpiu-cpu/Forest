// The peoples of the world map: who comes, when, where they feel at home, how they spread, what
// they build and what they call their towns. The systems are in src/atlas/peoples.js (the peoples as
// fields and the towns they found), atlas/towns.js (what towns build) and atlas/roads.js (roads worn by traffic).
//
//   race:     the race on the local map (data/races.js), whose people they are
//   era:      the era they come in (data/history.js ERAS)
//   arrive:   how they come into the world: `groups` founding bands; `mode` where — the best spot of
//             their land (default), the best coast (`coast`, from over the sea) or as far from everyone
//             as their land lets them (`far`, out of the wild edges)
//   home:     how much a biome suits them, 0..1 — their carrying capacity, as for the beasts; it is
//             the race's `home` (data/races.js), so the local and the world map agree on where a
//             race belongs; `ores`: weight of the rock's ore wealth (dwarves live off the mountains)
//   moves:    how easily they spread through a biome (×), the rest at `movesElse`
//   spread / growth: diffusion and logistic growth of the people field a year (Fisher–KPP): the land the people
//             holds and spreads over, not people — the towns' people are counted in the towns
//   spacing:  the least distance between two towns, cells of a 192-cell-high world
// The people of the towns (atlas/demography.js; docs/WORLD.md «Демография») — people are a good like any other: they
// are born in the towns, move between them and die; nothing makes them out of nothing.
//   born:     the most a town's people grow in a year (× contentment; logistic towards what feeds and houses them):
//             elves and dwarves slowly, orcs fast
//   content:  contentment 0…1 = base + Σ weight × the realm's attribute (data/kingdom.js REALM_STATS: culture, economy,
//             loyalty, stability), × the share of their food the town got
//   migrate:  share of a town's people ready to move in a season to a better town (fame and food draw them): of their
//             realm, or of another realm that trades with it, nearby — of their own people, or of a people that welcomes
//             them
//   welcome:  the other peoples whose folk this people takes into its towns (its own kin of other realms always):
//             humans and orcs take everyone, dwarves no one; the elves keep to themselves for now
//   settlers: a town raises settlers as it raises a building (atlas/build.js): `days` of work, `goods` from the realm's
//             stocks, `pop` people (the town needs `from` at least); they found a town within reach × spacing of it,
//             carrying the goods; `want` — how much the council wants them when the town is full
//   army:     an army's keep a day per fighter (data/macro.js ARMY_KEEP): gold, arms and armour by worth, rations of
//             `food`, eaten of `eats` — the first the realm holds a season of
//   crime:    crime a realm's towns breed a year (data/kingdom.js): per × (people of the town / 1000) ^ pow
//   site:     what makes a good spot for a town, beyond the biome: water, coast, fertility, ores, steep
//   needs:    what 100 of its people use up a day of a good instead of the good's own `need` (data/townBuildings.js
//             TOWN_GOODS): the orcs want no luxury, they want arms
//   eatsRaw:  goods it eats raw (the elves live on what the grove gives as it is): for it they feed as food does
//   buys:     goods it only buys (the elves do not mine silver): its towns get them at the market, never make them
//   tradeUp:  goods it sells as soon as it has them, for another at `rate` of the worth (the orcs: luxury, gems and
//             silver for arms; atlas/economy.js)
//   rose:     the course the people keeps its realm to over the years, along the three vectors (data/mind.js): the orcs
//             to war, the dwarves to craft and hoard, the humans to growth, the elves to a warded, crafted home
//   bureau:   how fast a realm of this people breeds corruption with its size (× RUINS corruption `grows`, data/kingdom.js)
//   taste:    how much the people care for each kind of effect when a town chooses what to build
//             (data/townBuildings.js EFFECTS, atlas/towns.js); who builds what is in data/townBuildings.js
//   names:    syllables of town names: first + middle (may be empty) + last
//   color:    on the world map
import {Registry} from '../core/registry.js';
import {RACES} from './races.js';

// the race's own «Биомы расселения» (data/races.js), read each time: an edit of the races table reaches the peoples
const raceHome = id => RACES.find(r => r.id === id).home;

export const WORLD_PEOPLES = new Registry('worldPeople');
WORLD_PEOPLES.registerAll([
  {id: 'elves', race: 'elf', label: 'эльфы', labelGen: 'эльфов', adj: 'эльфийский', era: 'elder', color: [120, 200, 120],
    arrive: {verb: 'пробудились', groups: 2, where: 'в самой древней чаще'},
    get home() { return raceHome('elf'); },
    moves: {forest: 1.4, jungle: 1.2, taiga: 1.2, meadow: 1, swamp: 0.6}, movesElse: 0.25,
    spread: 0.22, growth: 0.18, spacing: 16,
    born: 0.24, content: {base: 0.55, culture: 0.1, loyalty: 0.1}, migrate: 0.005, welcome: [],
    settlers: {pop: 30, from: 150, days: 240, reach: 2.5, want: 3, goods: {stores: 600, wood: 30, tools: 3}},
    army: {gold: 0.08, arms: 0.02, armor: 0.01, food: 1, eats: ['produce']},
    crime: {per: 0.02, pow: 1},
    site: {water: 0.35, coast: 0.15, fert: 0.3, trees: 0.5, ores: 0, steep: -0.4},
    eatsRaw: ['produce'], buys: ['silver'],
    rose: {agg: 0.35, grow: 0.2, econ: 0.45}, bureau: 0.7,
    taste: {housing: 1, food: 1, prod: 0.6, trade: 0.8, defence: 0.9, faith: 1.3, lore: 1.3, prestige: 1, health: 1.1},
    names: {first: ['Ла', 'Эль', 'Ми', 'Ти', 'Ан', 'Иль', 'Си', 'Ар', 'Фе', 'Лин', 'Ни', 'Ло'], mid: ['', 'ри', 'нэ', 'ла', 'во', 'ми', 'ан', 'ли'],
      last: ['эль', 'дор', 'риэль', 'ин', 'ион', 'алон', 'энна', 'ассэ', 'ориэн', 'улин']}},
  {id: 'dwarves', race: 'dwarf', label: 'гномы', labelGen: 'гномов', adj: 'гномий', era: 'elder', color: [220, 150, 70],
    arrive: {verb: 'вышли из-под гор', groups: 2, where: 'у самых богатых жил'},
    get home() { return raceHome('dwarf'); }, ores: 0.4,
    moves: {foothills: 1.4, highlands: 1.3, volcano: 1}, movesElse: 0.3,
    spread: 0.18, growth: 0.16, spacing: 14,
    born: 0.26, content: {base: 0.5, economy: 0.06, stability: 0.08}, migrate: 0.005, welcome: [],
    settlers: {pop: 30, from: 150, days: 240, reach: 2.5, want: 3, goods: {stores: 600, stone: 30, tools: 4}},
    army: {gold: 0.2, arms: 0.03, armor: 0.04, food: 1.2, eats: ['stores', 'food']},
    crime: {per: 0.02, pow: 1},
    site: {water: 0.2, coast: 0, fert: 0.05, trees: 0, ores: 0.8, steep: 0.3},
    rose: {agg: 0.2, grow: 0.2, econ: 0.6}, bureau: 1,
    taste: {housing: 1, food: 1, prod: 1.4, trade: 1, defence: 1.2, faith: 1, lore: 0.8, prestige: 1.2, health: 0.9},
    names: {first: ['Кхаз', 'Бар', 'Дур', 'Гра', 'Тор', 'Ка', 'Бо', 'Гим', 'Дол', 'Мор', 'Ун', 'Зир'], mid: ['', 'ак', 'ин', 'ум', 'ар', 'ек', 'од'],
      last: ['-дум', 'гард', 'хейм', 'бар', 'зад', 'грим', 'тор', 'карак', 'дин', 'бунд']}},
  {id: 'humans', race: 'human', label: 'люди', labelGen: 'людей', adj: 'людской', era: 'young', color: [100, 150, 235],
    arrive: {verb: 'приплыли из-за моря', groups: 2, where: 'к самому удобному берегу', mode: 'coast'},
    get home() { return raceHome('human'); },
    moves: {meadow: 1.4, steppe: 1.4, shrubland: 1.2, savanna: 1.2, forest: 1}, movesElse: 0.4,
    spread: 0.26, growth: 0.24, spacing: 12,
    born: 0.4, content: {base: 0.55, economy: 0.08, loyalty: 0.12}, migrate: 0.02, welcome: ['elves', 'dwarves', 'orcs'],
    settlers: {pop: 30, from: 130, days: 150, reach: 2.5, want: 3, goods: {stores: 600, wood: 30, tools: 3}},
    army: {gold: 0.12, arms: 0.02, armor: 0.02, food: 1, eats: ['stores', 'food']},
    crime: {per: 0.03, pow: 1.6},
    site: {water: 0.35, coast: 0.25, fert: 0.5, trees: 0.1, ores: 0.2, steep: -0.2},
    rose: {agg: 0.25, grow: 0.45, econ: 0.3}, bureau: 1.2,
    taste: {housing: 1, food: 1.2, prod: 1, trade: 1.3, defence: 1, faith: 1, lore: 0.9, prestige: 1.1, health: 1},
    names: {first: ['Бел', 'Яр', 'Вел', 'Свят', 'Мир', 'Глад', 'Рад', 'Ост', 'Лю', 'Звени', 'Добр', 'Влад'], mid: ['', 'о', 'е', 'ино'],
      last: ['град', 'город', 'слав', 'поль', 'ск', 'мир', 'бор', 'ец', 'горск', 'дол']}},
  {id: 'orcs', race: 'orc', label: 'орки', labelGen: 'орков', adj: 'орочий', era: 'young', color: [210, 80, 60],
    arrive: {verb: 'пришли с диких окраин', groups: 2, where: 'туда, где никто их не ждал', mode: 'far'},
    get home() { return raceHome('orc'); }, ores: 0.3,
    moves: {steppe: 1.5, savanna: 1.4, tundra: 1.2, swamp: 1, meadow: 1.2}, movesElse: 0.5,
    spread: 0.3, growth: 0.26, spacing: 13,
    born: 0.44, content: {base: 0.6, stability: 0.12, loyalty: 0.1}, migrate: 0.03, welcome: ['elves', 'dwarves', 'humans'],
    settlers: {pop: 25, from: 110, days: 100, reach: 2.5, want: 3, goods: {stores: 500, hide: 20, arms: 3}},
    army: {gold: 0, arms: 0.015, armor: 0.004, food: 0.8, eats: ['stores', 'food']},
    crime: {per: 0.02, pow: 1},
    site: {water: 0.3, coast: 0, fert: 0.1, trees: 0.1, ores: 0.3, steep: 0.1},
    needs: {arms: 0.4, lux: 0}, tradeUp: {sells: ['lux', 'gems', 'silver'], buys: 'arms', rate: 0.8},
    rose: {agg: 0.55, grow: 0.3, econ: 0.15}, bureau: 1.5,
    taste: {housing: 1, food: 1, prod: 0.9, trade: 0.6, defence: 1.4, faith: 0.9, lore: 0.3, prestige: 1.3, health: 0.8},
    names: {first: ['Гор', 'Груш', 'Мор', 'Ург', 'Зог', 'Крах', 'Шаг', 'Буг', 'Гра', 'Ног'], mid: ['', 'ак', 'ук', 'аг', 'ор'],
      last: ['-баш', 'гат', 'рук', 'мог', 'душ', 'заг', '-тар', 'нак']}},
]);

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
// of its seat, so no made-up town name has to be declined: «гномы Медной горы», «эльфы Тёмного леса».
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
//   hearth:    a town keeps its people's field up around it: hearth[0] + hearth[1] × its tier
//   hunt:      people thin the beasts where they live: predators and monsters, the others
//   foundLand: the least carrying capacity of the land under a new town (atlas/demography.js settlers)
//   feeds:     the people a town's land feeds: feeds × the land's share × (fert[0] + fert[1] × the soil) × (home[0] +
//              home[1] × how its realm likes the biome) × (1 + road × the road or harbour) × capital for a capital ×
//              (1 + its food − what armies took + trade × its trade)
//   hold:      a people holds its land only near its living towns: within near × its spacing the field lives as it
//              will, past far × spacing it fades by `fade` of itself a year (between — in part); a burnt people's land
//              goes with its towns
//   minTarget: the least a town's target is counted at (atlas/demography.js growTown); abandon — a town with fewer
//              people is left, they go to the nearest town of the realm;  bandStores — days of stores a founding band
//              brings with it;  abroad — how much a town of another realm draws against one of their own;  moveReach — how
//              far folk move to another realm, in steps of their people's spacing;  fedOk — the share of their food at
//              which the people are content and nobody starves;  starve — share of the people that die a year with no food
//              at all (× how far the share they got is below fedOk);  overflow — share of the people over a town's room that
//              leave it a season;  settleNear — how much nearness counts for the settlers' spot (× its share of the reach)
export const TOWN_LIFE = {hold: {near: 2.5, far: 4, fade: 0.3}, band: 0.6, bandPop: [90, 60], siteBar: 0.4, oresAway: 0.3, hearth: [0.45, 0.15], hunt: {predator: 0.3, other: 0.12},
  foundLand: 0.25,
  feeds: 1400, fert: [0.6, 0.4], home: [0.7, 0.3], road: 0.6, capital: 1.4, trade: 0.3,
  minTarget: 60, abandon: 10, bandStores: 120, abroad: 0.6, moveReach: 3, fedOk: 0.75, starve: 0.3, overflow: 0.5, settleNear: 0.2};
