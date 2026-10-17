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
//
// Tribes (`tribe: true`) are lairs with a thinking owner (data/races.js): a camp of goblins, gnolls,
// ogres, trolls or giants. They have no towns, roads or trade; the camp lives off its land (the
// race's `home` over the territory, not prey), is crowded out where the peoples settle, sends out
// broods, and raids the towns of the peoples its race dislikes (data/relations.js) — on the backs
// of its beasts, if it has any (`riders`, `on`: «верхом на варгах»). The peoples fight a camp as
// they fight a lair. TRIBE_RAID below sets the raids.
//   ground 'home':  stands where the race's home suits the biome at least TRIBE_HOME
//   needsAny:       and in addition on this kind of ground (as `ground` of a beast lair), if given
//   gen:            the owners in the genitive («набег гоблинов»);  riders / on: their beasts and «on» them
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
  // ── tribes: camps of the thinking wild
  {id: 'goblins', tribe: true, gen: 'гоблинов', species: 'goblin', from: 'из нор', label: 'гоблинские норы', labelAcc: 'гоблинские норы', g: 'pl', color: [150, 180, 60], radius: 7, ground: 'home', needsAny: ['caves', 'heights'],
    density: 14, max: 10, breed: 0.14, rivals: [], riders: 'varg', on: 'на варгах',
    nouns: [['норы', 'pl'], ['щель', 'f'], ['яма', 'f'], ['нора', 'f']]},
  {id: 'gnolls', tribe: true, gen: 'гноллов', species: 'gnoll', from: 'из стана', label: 'стан гноллов', g: 'm', color: [190, 150, 70], radius: 9, ground: 'home',
    density: 9, max: 8, breed: 0.09, rivals: [], riders: 'hyena', on: 'с гиенами',
    nouns: [['стан', 'm'], ['кочевье', 'n'], ['курган', 'm'], ['балка', 'f']]},
  {id: 'ogres', tribe: true, gen: 'огров', species: 'ogre', from: 'из логова', label: 'логово огров', g: 'n', color: [160, 110, 90], radius: 8, ground: 'home',
    density: 5, max: 6, breed: 0.05, rivals: [], riders: null,
    nouns: [['логово', 'n'], ['пещера', 'f'], ['котёл', 'm'], ['холм', 'm']]},
  {id: 'trolls', tribe: true, gen: 'троллей', species: 'troll', from: 'из логова', label: 'логово троллей', g: 'n', color: [90, 130, 110], radius: 8, ground: 'home',
    density: 6, max: 6, breed: 0.05, rivals: [], riders: null,
    nouns: [['логово', 'n'], ['мост', 'm'], ['топь', 'f'], ['валуны', 'pl']]},
  {id: 'giants', tribe: true, gen: 'великанов', species: 'giant', from: 'из становища', label: 'становище великанов', g: 'n', color: [200, 200, 190], radius: 11, ground: 'home', needsAny: ['heights'],
    density: 10, max: 4, breed: 0.03, rivals: [], riders: null,
    nouns: [['становище', 'n'], ['престол', 'm'], ['скалы', 'pl'], ['перевал', 'm']]},
]);

// a tribe's camp stands where its race's home suits the biome at least this much
export const TRIBE_HOME = 0.45;
// Raids of the tribes on the peoples' towns, from the autumn a camp is strong enough:
//   from:     strength a camp needs to go raiding;  chance: a year, per camp;  reach: cells (of a
//             192-cell-high world) to the town;  might: the camp's strength × its race's SPECIAL power ×
//             this, against the town's might (atlas/towns.js);  loss: the town's share lost when it
//             falls (× raidShare of its buildings);  loot: strength the camp gains on a win;
//             beaten: what is left of the camp's strength after a failed raid
export const TRIBE_RAID = {from: 0.55, chance: 0.15, reach: 30, might: 0.55, loss: 0.12, loot: 0.12, beaten: 0.7};

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
