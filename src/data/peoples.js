// The peoples of the world map: who comes, when, where they feel at home, how they spread, what
// they build and what they call their towns. The systems are in src/atlas/peoples.js (the peoples as
// fields), atlas/settlements.js (towns as points) and atlas/roads.js (roads worn by traffic).
//
//   race:     the race on the local map (data/races.js), whose people they are
//   era:      the era they come in (data/history.js ERAS)
//   arrive:   how they come into the world — `wake` in the best spot of their land, `groups` founding bands
//   home:     how much a biome suits them, 0..1 — their carrying capacity, as for the beasts;
//             `ores`: weight of the rock's ore wealth (dwarves live off the mountains)
//   moves:    how easily they spread through a biome (×), the rest at `movesElse`
//   spread / growth: diffusion and logistic growth of the people field a year (Fisher–KPP)
//   found:    a town is founded where the people field is this dense, at least `spacing` cells
//             (of a 192-cell-high world) from any other town
//   site:     what makes a good spot for a town, beyond the biome: water, coast, fertility, ores, steep
//   build:    what towns build as they grow, in this order; `tier` — from which size, `need` — a condition
//             of the place (ore, gems, magma, water, fertile, forest, steep), see atlas/settlements.js
//   names:    syllables of town names: first + middle (may be empty) + last
//   color:    on the world map
import {Registry} from '../core/registry.js';

export const WORLD_PEOPLES = new Registry('worldPeople');
WORLD_PEOPLES.registerAll([
  {id: 'elves', race: 'elf', label: 'эльфы', labelGen: 'эльфов', adj: 'эльфийский', era: 'elder', color: [120, 200, 120],
    arrive: {verb: 'пробудились', groups: 2, where: 'в самой древней чаще'},
    home: {forest: 1, jungle: 0.85, taiga: 0.7, meadow: 0.55, swamp: 0.25, shrubland: 0.3, savanna: 0.15, foothills: 0.2},
    moves: {forest: 1.4, jungle: 1.2, taiga: 1.2, meadow: 1, swamp: 0.6}, movesElse: 0.25,
    spread: 0.22, growth: 0.18, found: 0.32, spacing: 16,
    site: {water: 0.35, coast: 0.15, fert: 0.3, trees: 0.5, ores: 0, steep: -0.4},
    build: [
      {id: 'hut', tier: 0}, {id: 'lodge', tier: 0}, {id: 'garden', tier: 0, need: 'fertile'}, {id: 'well', tier: 1},
      {id: 'fishhut', tier: 1, need: 'water'}, {id: 'healerhut', tier: 1}, {id: 'loom', tier: 1}, {id: 'house', tier: 2},
      {id: 'granary', tier: 2}, {id: 'shrine', tier: 2}, {id: 'crafthut', tier: 2}, {id: 'watchtower', tier: 2},
      {id: 'jeweler', tier: 3, need: 'gems'}, {id: 'armory', tier: 3},
    ],
    names: {first: ['Ла', 'Эль', 'Ми', 'Ти', 'Ан', 'Иль', 'Си', 'Ар', 'Фе', 'Лин', 'Ни', 'Ло'], mid: ['', 'ри', 'нэ', 'ла', 'во', 'ми', 'ан', 'ли'],
      last: ['эль', 'дор', 'риэль', 'ин', 'ион', 'алон', 'энна', 'ассэ', 'ориэн', 'улин']}},
  {id: 'dwarves', race: 'dwarf', label: 'гномы', labelGen: 'гномов', adj: 'гномий', era: 'elder', color: [220, 150, 70],
    arrive: {verb: 'вышли из-под гор', groups: 2, where: 'у самых богатых жил'},
    home: {foothills: 1, highlands: 0.75, taiga: 0.15, tundra: 0.15, forest: 0.1, steppe: 0.1, volcano: 0.4}, ores: 0.8,
    moves: {foothills: 1.4, highlands: 1.3, volcano: 1}, movesElse: 0.3,
    spread: 0.18, growth: 0.16, found: 0.3, spacing: 14,
    site: {water: 0.2, coast: 0, fert: 0.05, trees: 0, ores: 0.8, steep: 0.3},
    build: [
      {id: 'hut', tier: 0}, {id: 'quarry', tier: 0}, {id: 'mineshaft', tier: 0, need: 'ore'}, {id: 'well', tier: 1},
      {id: 'charpit', tier: 1}, {id: 'smelter', tier: 1, need: 'ore'}, {id: 'granary', tier: 1}, {id: 'forge', tier: 2, need: 'ore'},
      {id: 'house', tier: 2}, {id: 'hearth', tier: 2}, {id: 'armory', tier: 2}, {id: 'palisade', tier: 2},
      {id: 'jeweler', tier: 3, need: 'gems'}, {id: 'shrine', tier: 3}, {id: 'magmaforge', tier: 3, need: 'magma'},
    ],
    names: {first: ['Кхаз', 'Бар', 'Дур', 'Гра', 'Тор', 'Ка', 'Бо', 'Гим', 'Дол', 'Мор', 'Ун', 'Зир'], mid: ['', 'ак', 'ин', 'ум', 'ар', 'ек', 'од'],
      last: ['-дум', 'гард', 'хейм', 'бар', 'зад', 'грим', 'тор', 'карак', 'дин', 'бунд']}},
]);

// Town sizes. A town's people grow towards what its land feeds; at `pop` it becomes the next size.
// What elves and dwarves call a town of that size, in the cases the chronicle needs:
// [nominative, accusative, genitive, prepositional], and the gender of the word.
export const TIERS = [
  {pop: 0, label: {elves: ['приют', 'приют', 'приюта', 'приюте'], dwarves: ['застава', 'заставу', 'заставы', 'заставе']}, gender: {elves: 'm', dwarves: 'f'}},
  {pop: 180, label: {elves: ['селение', 'селение', 'селения', 'селении'], dwarves: ['посёлок', 'посёлок', 'посёлка', 'посёлке']}, gender: {elves: 'n', dwarves: 'm'}},
  {pop: 700, label: {elves: ['город', 'город', 'города', 'городе'], dwarves: ['крепость', 'крепость', 'крепости', 'крепости']}, gender: {elves: 'm', dwarves: 'f'}},
  {pop: 2200, label: {elves: ['столица', 'столицу', 'столицы', 'столице'], dwarves: ['чертог', 'чертог', 'чертога', 'чертоге']}, gender: {elves: 'f', dwarves: 'm'}},
];

// Towns against the wild: a town fights the lairs whose territory reaches it; the town's might is
// √pop × `might`, the lair's its strength × its owner's SPECIAL power. A beaten lair is cleared;
// a town that loses is raided and loses `raidLoss` of its people.
export const TOWN_WAR = {might: 0.9, chance: 0.08, raidLoss: 0.2, reach: 4};

// The eras' length (the start setting «Эпоха древних»), in years.
export const ELDER_YEARS = [
  {years: 25, label: 'Короткая'},
  {years: 40, label: 'Обычная'},
  {years: 60, label: 'Долгая'},
];
