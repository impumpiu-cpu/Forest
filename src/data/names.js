// Names of the named ones, in one place (docs/WORLD.md): the people of every race — male and female names and
// their nicknames; the tame beasts — what the herders call them; the nicknames and titles of the leaders of the old
// lairs; the names of the calamities' bosses. Everything that gives a name takes it from here: the races
// (data/races.js `names`), the tame beasts (`tame.names`), the vampires, the leaders (atlas/leaders.js), the bosses
// (data/calamities.js). The constructor makeName() puts a name together from these parts.
//
//   PERSON[race]  — {m: [...], f: [...], nick: [...]}: names by gender and the race's own nicknames
//   PET[species]  — the names of a tame beast (any gender)
//   NICK.common   — nicknames of anyone (a leader of beasts, one of a race with too few of its own)
//   TITLE[mind]   — what a leader is called by its kind: [nominative, genitive]
//   BOSS[kind]    — the names of a calamity's boss (data/calamities.js ids)
// A new race: a row in PERSON (and nothing else: data/races.js takes its names from here).

export const PERSON = {
  human: {m: ['Ждан', 'Горислав', 'Тихон', 'Мирон', 'Ярослав', 'Ратибор', 'Боян', 'Светозар', 'Велимир', 'Добрыня', 'Радим'],
    f: ['Милава', 'Веселина', 'Любава', 'Злата', 'Дарина', 'Снежана', 'Забава', 'Агния', 'Олеся', 'Василиса', 'Ведана'],
    nick: ['Кривой', 'Рыжий', 'Молчун', 'Хромой', 'Ворон', 'Медведь', 'Сокол', 'Лихой', 'Тихий', 'Седой', 'Косой', 'Бородач']},
  halfling: {m: ['Тобо', 'Хэмли', 'Мунго', 'Бодрик', 'Олдо', 'Фирмин'],
    f: ['Мелла', 'Розалина', 'Лютика', 'Тилли', 'Марга', 'Пеона'],
    nick: ['Пышка', 'Тихоня', 'Шустрый', 'Медовый', 'Кругляш', 'Лапоть']},
  giant: {m: ['Грумбар', 'Ормунд', 'Тяжебор', 'Валуй', 'Скальд'],
    f: ['Хельга', 'Ингрид', 'Гудрун', 'Ассвейг'],
    nick: ['Валун', 'Утёс', 'Громобой', 'Тяжеступ', 'Снежный']},
  elf: {m: ['Аэлдир', 'Илетан', 'Келориэн', 'Тандрил', 'Сильвар'],
    f: ['Элоэна', 'Ниэль', 'Лаириэль', 'Аэрин', 'Иримэ'],
    nick: ['Звездоокий', 'Тихий Лист', 'Ясень', 'Серебряный', 'Лунный']},
  darkelf: {m: ['Вельтрис', 'Зарейн', 'Дромир', 'Ксалет'],
    f: ['Илвара', 'Шейзра', 'Квилла', 'Вирна'],
    nick: ['Паучий', 'Бледный', 'Тень', 'Ядовитый', 'Ночной']},
  dwarf: {m: ['Торгрим', 'Балдур', 'Хрольф', 'Брокк', 'Ульфгар', 'Кетиль'],
    f: ['Дагна', 'Хильда', 'Ингвара', 'Тордис', 'Бруна'],
    nick: ['Железнобокий', 'Каменный Лоб', 'Рудознатец', 'Молотобоец', 'Седобородый', 'Медный']},
  orc: {m: ['Угрук', 'Мазгаш', 'Зугрог', 'Брагот', 'Корх'],
    f: ['Ургха', 'Мокра', 'Зарга', 'Гхаша'],
    nick: ['Клык', 'Череполом', 'Кровавый', 'Рваное Ухо', 'Свирепый', 'Костолом']},
  goblin: {m: ['Сникль', 'Ризз', 'Гнырк', 'Кривоух'],
    f: ['Зизи', 'Шмыга', 'Пикша'],
    nick: ['Шнырь', 'Вонючка', 'Хитрец', 'Крыса', 'Мелкий']},
  ogre: {m: ['Мордоб', 'Брюхан', 'Грыз', 'Тяжак'],
    f: ['Хлоба'],
    nick: ['Брюхо', 'Костогрыз', 'Тяжак', 'Обжора']},
  troll: {m: ['Ракаш', 'Вуджин', 'Зекки', 'Тумбо'],
    f: ['Шанка', 'Мвира'],
    nick: ['Мшистый', 'Каменная Шкура', 'Болотный', 'Гнилозуб']},
  gnoll: {m: ['Хракк', 'Гнарр', 'Ыхыр', 'Скорр'],
    f: ['Хиза', 'Ррака'],
    nick: ['Пятнистый', 'Хохотун', 'Падальщик', 'Рвач']},
  vampire: {m: ['Граф Вельмор', 'Барон Кастрель'],
    f: ['Госпожа Ильвира', 'Морена'],
    nick: []},
};
// the necromancer is a human gone wrong: a human's names
PERSON.necromancer = PERSON.human;

export const PET = {
  mule: ['Буян', 'Гнедко', 'Упрямец', 'Тяжеступ', 'Ворчун'],
  goat: ['Белянка', 'Пеструшка', 'Зорька', 'Рогатка', 'Маруська', 'Бодуша', 'Сивка', 'Дереза', 'Звёздочка', 'Чернушка'],
  horse: ['Буланый', 'Воронок', 'Ласточка', 'Гнедая', 'Серко', 'Ветерок', 'Звёздочка', 'Рыжуха'],
  aurochs: ['Буря', 'Пеструха', 'Бурёнка', 'Крутой', 'Рогач', 'Зорька'],
  camel: ['Горбун', 'Песчанка', 'Хан', 'Тихоня', 'Сухарь'],
  sheep: ['Кудряшка', 'Снежка', 'Бяша', 'Долли', 'Пышка', 'Белка', 'Ромашка', 'Зефирка'],
};

// the common nicknames (an object, so that the screen «Таблицы» can put a new list in its place)
export const NICK = {common: ['Седой', 'Хромой', 'Кривой', 'Безухий', 'Чёрный Клык', 'Рваная Шкура', 'Одноглазый', 'Старый Шрам', 'Белая Грива', 'Тень', 'Злой', 'Ржавый',
  'Костолом', 'Шатун', 'Ночной', 'Палёный', 'Тихий', 'Бурый', 'Длинная Тень', 'Каменный Лоб']};

export const TITLE = {beast: ['Вожак', 'Вожака'], semi: ['Главарь', 'Главаря'], sentient: ['Главарь', 'Главаря'], undead: ['Владыка', 'Владыки'], fiend: ['Князь', 'Князя']};

export const BOSS = {
  brood: ['Седая Мать', 'Пасть Глубин', 'Многоглазая', 'Старая Кровь', 'Мать Логов'],
  necromancer: ['Морвен', 'Скелдар', 'Аш-Таур', 'Велемир Чёрный', 'Кэрр'],
  lich: ['Ургал', 'Неупокоенный', 'Хладный', 'Безымянный'],
  vampire: ['Ностр', 'Лаэль', 'Бледный Князь', 'Мирела'],
  demon: ['Азгарот', 'Пламя Без Дна', 'Тот-что-за-Гранью', 'Ксаал'],
  giantking: ['Гримнир', 'Тордун', 'Скалобой', 'Хельгрим'],
  goblinking: ['Зиг-Нар', 'Гнилозуб', 'Шаграт', 'Мелкий Кхан'],
};

// a race's names as [name, gender] pairs (data/races.js `names`, what the colony and the caravan draw from)
export const personNames = race => [...(PERSON[race]?.m || []).map(n => [n, 'm']), ...(PERSON[race]?.f || []).map(n => [n, 'f'])];
// the names of a tame beast (data/species.js, data/bestiary.js `tame.names`)
export const petNames = species => PET[species] || [];

const pick = (r, list) => list[(r() * list.length) | 0];
// The constructor: a name for one of `species` (a race or a beast) of `gender`.
//   nick — 'never' (the default: a settler is Ждан), 'always' (a leader: «Хракк Тихий»; a beast's leader is its nickname
//          alone: «Седой»), or a chance 0…1 of a nickname after the name
//   used — names to avoid (a set of whole names), tries a few times
//   own  — the race's own nicknames first, then the common ones (NICK)
// → the name, or '' when the species has no names at all
export function makeName(species, rng, {gender = 'm', nick = 'never', used = null} = {}) {
  const P = PERSON[species], first = P ? (P[gender]?.length ? P[gender] : P.m || []) : [];
  const nicks = [...(P?.nick || []), ...NICK.common];
  for (let t = 0; t < 8; t++) {
    const with_ = nick === 'always' || (typeof nick === 'number' && rng() < nick);
    const name = first.length ? (with_ ? `${pick(rng, first)} ${pick(rng, nicks)}` : pick(rng, first)) : with_ || nick === 'always' ? pick(rng, nicks) : '';
    if (!used || !used.has(name) || t === 7) return name;
  }
  return '';
}

// «with the griffins» — the instrumental plural of a lair's owners for the chronicle (atlas/lairs.js); the rest — the plural
export const PLURAL_INSTR = {griffin: 'грифонами', wyvern: 'вивернами', drake: 'дрейками', spider: 'пауками', stoneworm: 'червями', bat: 'кровопийцами', varg: 'варгами'};
