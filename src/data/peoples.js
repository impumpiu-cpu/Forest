// The peoples of the world map: who comes, when, where they feel at home, how they spread, what
// they build and what they call their towns. The systems are in src/atlas/peoples.js (the peoples as
// fields), atlas/settlements.js (towns as points) and atlas/roads.js (roads worn by traffic).
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
//   spread / growth: diffusion and logistic growth of the people field a year (Fisher–KPP)
//   found:    a town is founded where the people field is this dense, at least `spacing` cells
//             (of a 192-cell-high world) from any other town
//   site:     what makes a good spot for a town, beyond the biome: water, coast, fertility, ores, steep
//   taste:    how much the people care for each kind of effect when a town chooses what to build
//             (data/townBuildings.js EFFECTS, atlas/towns.js); who builds what is in data/townBuildings.js
//   names:    syllables of town names: first + middle (may be empty) + last
//   color:    on the world map
import {Registry} from '../core/registry.js';
import {RACES} from './races.js';

const raceHome = id => RACES.find(r => r.id === id).home;

export const WORLD_PEOPLES = new Registry('worldPeople');
WORLD_PEOPLES.registerAll([
  {id: 'elves', race: 'elf', label: 'эльфы', labelGen: 'эльфов', adj: 'эльфийский', era: 'elder', color: [120, 200, 120],
    arrive: {verb: 'пробудились', groups: 2, where: 'в самой древней чаще'},
    home: raceHome('elf'),
    moves: {forest: 1.4, jungle: 1.2, taiga: 1.2, meadow: 1, swamp: 0.6}, movesElse: 0.25,
    spread: 0.22, growth: 0.18, found: 0.32, spacing: 16,
    site: {water: 0.35, coast: 0.15, fert: 0.3, trees: 0.5, ores: 0, steep: -0.4},
    taste: {housing: 1, food: 1, prod: 0.6, trade: 0.8, defence: 0.9, faith: 1.3, lore: 1.3, prestige: 1, health: 1.1},
    names: {first: ['Ла', 'Эль', 'Ми', 'Ти', 'Ан', 'Иль', 'Си', 'Ар', 'Фе', 'Лин', 'Ни', 'Ло'], mid: ['', 'ри', 'нэ', 'ла', 'во', 'ми', 'ан', 'ли'],
      last: ['эль', 'дор', 'риэль', 'ин', 'ион', 'алон', 'энна', 'ассэ', 'ориэн', 'улин']}},
  {id: 'dwarves', race: 'dwarf', label: 'гномы', labelGen: 'гномов', adj: 'гномий', era: 'elder', color: [220, 150, 70],
    arrive: {verb: 'вышли из-под гор', groups: 2, where: 'у самых богатых жил'},
    home: raceHome('dwarf'), ores: 0.8,
    moves: {foothills: 1.4, highlands: 1.3, volcano: 1}, movesElse: 0.3,
    spread: 0.18, growth: 0.16, found: 0.3, spacing: 14,
    site: {water: 0.2, coast: 0, fert: 0.05, trees: 0, ores: 0.8, steep: 0.3},
    taste: {housing: 1, food: 1, prod: 1.4, trade: 1, defence: 1.2, faith: 1, lore: 0.8, prestige: 1.2, health: 0.9},
    names: {first: ['Кхаз', 'Бар', 'Дур', 'Гра', 'Тор', 'Ка', 'Бо', 'Гим', 'Дол', 'Мор', 'Ун', 'Зир'], mid: ['', 'ак', 'ин', 'ум', 'ар', 'ек', 'од'],
      last: ['-дум', 'гард', 'хейм', 'бар', 'зад', 'грим', 'тор', 'карак', 'дин', 'бунд']}},
  {id: 'humans', race: 'human', label: 'люди', labelGen: 'людей', adj: 'людской', era: 'young', color: [100, 150, 235],
    arrive: {verb: 'приплыли из-за моря', groups: 2, where: 'к самому удобному берегу', mode: 'coast'},
    home: raceHome('human'),
    moves: {meadow: 1.4, steppe: 1.4, shrubland: 1.2, savanna: 1.2, forest: 1}, movesElse: 0.4,
    spread: 0.26, growth: 0.24, found: 0.28, spacing: 12,
    site: {water: 0.35, coast: 0.25, fert: 0.5, trees: 0.1, ores: 0.2, steep: -0.2},
    taste: {housing: 1, food: 1.2, prod: 1, trade: 1.3, defence: 1, faith: 1, lore: 0.9, prestige: 1.1, health: 1},
    names: {first: ['Бел', 'Яр', 'Вел', 'Свят', 'Мир', 'Глад', 'Рад', 'Ост', 'Лю', 'Звени', 'Добр', 'Влад'], mid: ['', 'о', 'е', 'ино'],
      last: ['град', 'город', 'слав', 'поль', 'ск', 'мир', 'бор', 'ец', 'горск', 'дол']}},
  {id: 'orcs', race: 'orc', label: 'орки', labelGen: 'орков', adj: 'орочий', era: 'young', color: [210, 80, 60],
    arrive: {verb: 'пришли с диких окраин', groups: 2, where: 'туда, где никто их не ждал', mode: 'far'},
    home: raceHome('orc'), ores: 0.3,
    moves: {steppe: 1.5, savanna: 1.4, tundra: 1.2, swamp: 1, meadow: 1.2}, movesElse: 0.5,
    spread: 0.3, growth: 0.26, found: 0.3, spacing: 13,
    site: {water: 0.3, coast: 0, fert: 0.1, trees: 0.1, ores: 0.3, steep: 0.1},
    taste: {housing: 1, food: 1, prod: 0.9, trade: 0.6, defence: 1.4, faith: 0.9, lore: 0.3, prestige: 1.3, health: 0.8},
    names: {first: ['Гор', 'Груш', 'Мор', 'Ург', 'Зог', 'Крах', 'Шаг', 'Буг', 'Гра', 'Ног'], mid: ['', 'ак', 'ук', 'аг', 'ор'],
      last: ['-баш', 'гат', 'рук', 'мог', 'душ', 'заг', '-тар', 'нак']}},
]);

// Town sizes. A town's people grow towards what its land feeds; at `pop` it becomes the next size.
// What each people calls a town of that size, in the cases the chronicle needs:
// [nominative, accusative, genitive, prepositional, instrumental], and the gender of the word.
export const TIERS = [
  {pop: 0, label: {elves: ['приют', 'приют', 'приюта', 'приюте', 'приютом'], dwarves: ['застава', 'заставу', 'заставы', 'заставе', 'заставой'],
    humans: ['деревня', 'деревню', 'деревни', 'деревне', 'деревней'], orcs: ['стойбище', 'стойбище', 'стойбища', 'стойбище', 'стойбищем']},
    gender: {elves: 'm', dwarves: 'f', humans: 'f', orcs: 'n'}},
  {pop: 180, label: {elves: ['селение', 'селение', 'селения', 'селении', 'селением'], dwarves: ['посёлок', 'посёлок', 'посёлка', 'посёлке', 'посёлком'],
    humans: ['село', 'село', 'села', 'селе', 'селом'], orcs: ['становище', 'становище', 'становища', 'становище', 'становищем']},
    gender: {elves: 'n', dwarves: 'm', humans: 'n', orcs: 'n'}},
  {pop: 700, label: {elves: ['город', 'город', 'города', 'городе', 'городом'], dwarves: ['крепость', 'крепость', 'крепости', 'крепости', 'крепостью'],
    humans: ['город', 'город', 'города', 'городе', 'городом'], orcs: ['твердыня', 'твердыню', 'твердыни', 'твердыне', 'твердыней']},
    gender: {elves: 'm', dwarves: 'f', humans: 'm', orcs: 'f'}},
  {pop: 2200, label: {elves: ['столица', 'столицу', 'столицы', 'столице', 'столицей'], dwarves: ['чертог', 'чертог', 'чертога', 'чертоге', 'чертогом'],
    humans: ['столица', 'столицу', 'столицы', 'столице', 'столицей'], orcs: ['ставка', 'ставку', 'ставки', 'ставке', 'ставкой']},
    gender: {elves: 'f', dwarves: 'm', humans: 'f', orcs: 'f'}},
];

// Towns against the wild: a town fights the lairs whose territory reaches it; the town's might is
// √pop × `might`, the lair's its strength × its owner's SPECIAL power. A beaten lair is cleared;
// a town that loses is raided and loses `raidLoss` of its people.
export const TOWN_WAR = {might: 0.9, chance: 0.08, raidLoss: 0.2, reach: 4};

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
