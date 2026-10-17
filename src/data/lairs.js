// Lairs: where the monsters of the wild era live. A lair is a point on the world map with an owner
// species, a strength 0..1, an age and a territory; the monsters' density around it is held up by it
// (atlas/lairs.js). Later the lairs are where heroes go and where local maps find their monsters.
//   species:  the owner (data/bestiary.js)
//   label:    what the lair is called in the chronicle (labelAcc: in the accusative, if it differs);
//             g: the gender of its noun, for the verbs around it;  from: «out of» it, before its name
//   radius:   territory, world cells of a 192-cell-high world (scaled with the map)
//   ground:   where it can be: heights (high steep ground), volcano, caves (limestone or basalt),
//             deep (forest, jungle, swamp), open (tundra, taiga, steppe)
//   density:  lairs per 10 000 suitable land cells at the start;  max: at most this many in a world
//   breed:    chance a year that a strong lair sends out a brood to found a new one
//   rivals:   lair kinds it fights when territories touch
//   nouns:    the second word of a lair's name, [word, gender]; adjectives come from NAME_ADJ
import {Registry} from '../core/registry.js';

export const LAIRS = new Registry('lair');
LAIRS.registerAll([
  {id: 'griffin', species: 'griffin', from: 'из гнезда', label: 'гнездо грифонов', g: 'n', color: [214, 170, 90], radius: 9, ground: 'heights', density: 25, max: 8, breed: 0.12, rivals: ['wyvern', 'drake'],
    nouns: [['гнездо', 'n'], ['утёс', 'm'], ['скала', 'f'], ['кручи', 'pl']]},
  {id: 'wyvern', species: 'wyvern', from: 'из логова', label: 'логово виверны', g: 'n', color: [120, 150, 90], radius: 10, ground: 'heights', density: 18, max: 6, breed: 0.08, rivals: ['griffin', 'drake'],
    nouns: [['логово', 'n'], ['ущелье', 'n'], ['гора', 'f'], ['пик', 'm']]},
  {id: 'drake', species: 'drake', from: 'из логова', label: 'логово дрейка', g: 'n', color: [220, 80, 50], radius: 12, ground: 'volcano', density: 80, max: 4, breed: 0.05, rivals: ['griffin', 'wyvern'],
    nouns: [['жерло', 'n'], ['кратер', 'm'], ['пепелище', 'n'], ['гора', 'f']]},
  {id: 'spider', species: 'spider', from: 'из гнезда', label: 'паучье гнездо', g: 'n', color: [150, 110, 170], radius: 6, ground: 'deep', density: 14, max: 10, breed: 0.07, rivals: [],
    nouns: [['чаща', 'f'], ['паутинник', 'm'], ['дебри', 'pl'], ['лог', 'm']]},
  {id: 'stoneworm', species: 'stoneworm', from: 'из норы', label: 'нора каменного червя', labelAcc: 'нору каменного червя', g: 'f', color: [160, 140, 110], radius: 8, ground: 'caves', density: 10, max: 6, breed: 0.06, rivals: [],
    nouns: [['нора', 'f'], ['провал', 'm'], ['ход', 'm'], ['пустошь', 'f']]},
  {id: 'bat', species: 'bat', from: 'из пещеры', label: 'пещера кровопийц', labelAcc: 'пещеру кровопийц', g: 'f', color: [120, 70, 90], radius: 6, ground: 'caves', density: 12, max: 8, breed: 0.08, rivals: [],
    nouns: [['пещера', 'f'], ['грот', 'm'], ['подземелье', 'n'], ['расселина', 'f']]},
  {id: 'varg', species: 'varg', from: 'из логова', label: 'логово варгов', g: 'n', color: [130, 130, 140], radius: 10, ground: 'open', density: 8, max: 8, breed: 0.08, rivals: [],
    nouns: [['логово', 'n'], ['падь', 'f'], ['урочище', 'n'], ['буреломы', 'pl']]},
]);

// adjectives for lair names, by gender: m, f, n, pl
export const NAME_ADJ = [
  ['Чёрный', 'Чёрная', 'Чёрное', 'Чёрные'], ['Кровавый', 'Кровавая', 'Кровавое', 'Кровавые'], ['Гиблый', 'Гиблая', 'Гиблое', 'Гиблые'],
  ['Старый', 'Старая', 'Старое', 'Старые'], ['Седой', 'Седая', 'Седое', 'Седые'], ['Воющий', 'Воющая', 'Воющее', 'Воющие'],
  ['Костяной', 'Костяная', 'Костяное', 'Костяные'], ['Мёртвый', 'Мёртвая', 'Мёртвое', 'Мёртвые'], ['Дымный', 'Дымная', 'Дымное', 'Дымные'],
  ['Каменный', 'Каменная', 'Каменное', 'Каменные'], ['Гнилой', 'Гнилая', 'Гнилое', 'Гнилые'], ['Немой', 'Немая', 'Немое', 'Немые'],
  ['Волчий', 'Волчья', 'Волчье', 'Волчьи'], ['Ржавый', 'Ржавая', 'Ржавое', 'Ржавые'], ['Тёмный', 'Тёмная', 'Тёмное', 'Тёмные'],
  ['Проклятый', 'Проклятая', 'Проклятое', 'Проклятые'], ['Высокий', 'Высокая', 'Высокое', 'Высокие'], ['Змеиный', 'Змеиная', 'Змеиное', 'Змеиные'],
];
export const GENDER_INDEX = {m: 0, f: 1, n: 2, pl: 3};

// lairs this old (years) become «ancient» — once, with a line in the chronicle
export const ANCIENT_YEARS = 30;
