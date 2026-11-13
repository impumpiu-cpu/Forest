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
  human: {m: ['Ждан', 'Горислав', 'Тихон', 'Мирон', 'Ярослав', 'Ратибор', 'Боян', 'Светозар', 'Велимир', 'Добрыня', 'Радим', 'Всеслав', 'Мстислав', 'Путята', 'Будимир', 'Любомир', 'Остромир', 'Вышата', 'Неждан', 'Святослав', 'Гордей', 'Ермолай', 'Фрол'],
    f: ['Милава', 'Веселина', 'Любава', 'Злата', 'Дарина', 'Снежана', 'Забава', 'Агния', 'Олеся', 'Василиса', 'Ведана', 'Голуба', 'Велеслава', 'Ярина', 'Мирослава', 'Росана', 'Купава', 'Белослава', 'Предслава', 'Улита', 'Ждана'],
    nick: ['Кривой', 'Рыжий', 'Молчун', 'Хромой', 'Ворон', 'Медведь', 'Сокол', 'Лихой', 'Тихий', 'Седой', 'Косой', 'Бородач']},
  halfling: {m: ['Тобо', 'Хэмли', 'Мунго', 'Бодрик', 'Олдо', 'Фирмин', 'Бантли', 'Ролло', 'Тэдди', 'Бартл', 'Хоб', 'Тамми'],
    f: ['Мелла', 'Розалина', 'Лютика', 'Тилли', 'Марга', 'Пеона', 'Дейзи', 'Белла', 'Примула', 'Майя', 'Хетти'],
    nick: ['Пышка', 'Тихоня', 'Шустрый', 'Медовый', 'Кругляш', 'Лапоть']},
  giant: {m: ['Грумбар', 'Ормунд', 'Тяжебор', 'Валуй', 'Скальд', 'Имир', 'Трюм', 'Хрунгнир', 'Бергельмир', 'Гейррёд'],
    f: ['Хельга', 'Ингрид', 'Гудрун', 'Ассвейг', 'Скади', 'Ангрбода', 'Гьяльп'],
    nick: ['Валун', 'Утёс', 'Громобой', 'Тяжеступ', 'Снежный']},
  elf: {m: ['Аэлдир', 'Илетан', 'Келориэн', 'Тандрил', 'Сильвар', 'Лаэрдан', 'Иннорис', 'Фаэлин', 'Эландор', 'Тэлмар', 'Аэвин', 'Ксиллиан', 'Мэйлор', 'Сайрен'],
    f: ['Элоэна', 'Ниэль', 'Лаириэль', 'Аэрин', 'Иримэ', 'Ильвэн', 'Сэриан', 'Тиаэль', 'Лиорэ', 'Наэрин', 'Иссаэль', 'Мирэйн', 'Фаэниль'],
    nick: ['Звездоокий', 'Тихий Лист', 'Ясень', 'Серебряный', 'Лунный']},
  darkelf: {m: ['Вельтрис', 'Зарейн', 'Дромир', 'Ксалет', 'Риззен', 'Тарвиль', 'Нальфейн', 'Ульвир'],
    f: ['Илвара', 'Шейзра', 'Квилла', 'Вирна', 'Зесстра', 'Ильфрин', 'Шиндара', 'Моргвейн'],
    nick: ['Паучий', 'Бледный', 'Тень', 'Ядовитый', 'Ночной']},
  dwarf: {m: ['Торгрим', 'Балдур', 'Хрольф', 'Брокк', 'Ульфгар', 'Кетиль', 'Дорин', 'Торин', 'Двалин', 'Даин', 'Траин', 'Наин', 'Регин', 'Фундин', 'Нали', 'Лони', 'Фрар', 'Синдри', 'Андвари', 'Эйтри'],
    f: ['Дагна', 'Хильда', 'Ингвара', 'Тордис', 'Бруна', 'Сигрун', 'Асгерд', 'Торунн', 'Гудлейв', 'Ранвейг', 'Хельвор'],
    nick: ['Железнобокий', 'Каменный Лоб', 'Рудознатец', 'Молотобоец', 'Седобородый', 'Медный']},
  orc: {m: ['Угрук', 'Мазгаш', 'Зугрог', 'Брагот', 'Корх', 'Гхаур', 'Ургаш', 'Скарг', 'Дурбаг', 'Мугрот', 'Харнак', 'Ольгрук'],
    f: ['Ургха', 'Мокра', 'Зарга', 'Гхаша', 'Багра', 'Шагга', 'Ульха', 'Грашна'],
    nick: ['Клык', 'Череполом', 'Кровавый', 'Рваное Ухо', 'Свирепый', 'Костолом', 'Секира', 'Кабаний Зуб', 'Глотка', 'Мясник', 'Чёрный Кулак', 'Ломай-Щит', 'Вонючая Шкура', 'Гнилой Зуб', 'Камнегрыз', 'Три Шрама', 'Беспалый', 'Ревун']},
  goblin: {m: ['Сникль', 'Ризз', 'Гнырк', 'Кривоух', 'Шкряб', 'Ниггл', 'Чмок', 'Зубчик'],
    f: ['Зизи', 'Шмыга', 'Пикша', 'Крыська', 'Низзи'],
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

// ── the full names of the guild's people (campaign/guild.js, campaign/kin.js; the author's word 13.11): each people names its
// own way, and a name tells one's kin:
//   CLAN[race] = {style, list?}
//     surname    — a family name, by gender: «Ждан Мельников», «Злата Мельникова» (humans)
//     patronymic — the father's name: «Дорин сын Торина», «Дагна дочь Торина» (dwarves, giants)
//     house      — the house one is of: «Аэлдир из дома Ясеня» (elves: a tree, a star, a beast; the dark elves: their matrons' houses)
//     family     — one family name for all of it: «Тобо Медовик» (halflings)
//     nick       — one's own nickname, never handed down: «Угрук Череполом» (orcs, goblins, ogres, trolls, gnolls)
// A people with no row — the given name alone.
export const CLAN = {
  human: {style: 'surname', list: ['Мельников', 'Ковалёв', 'Бондарев', 'Гончаров', 'Рыбаков', 'Бортников', 'Колесников', 'Ершов', 'Соколов', 'Волков',
    'Медведев', 'Зорин', 'Ладыгин', 'Плотников', 'Ткачёв', 'Дёгтев', 'Кожемякин', 'Сивцов', 'Малинин', 'Лыков', 'Овсянников', 'Хмелев', 'Пряхин', 'Ведерников']},
  halfling: {style: 'family', list: ['Медовик', 'Бочонок', 'Подкопай', 'Лопух', 'Пирожок', 'Кругляш', 'Камышник', 'Теплонор', 'Пивоварчик', 'Грибник', 'Сдобыш']},
  dwarf: {style: 'patronymic'},
  giant: {style: 'patronymic'},
  elf: {style: 'house', list: ['Ясеня', 'Серебряной Ивы', 'Вечерней Звезды', 'Белого Оленя', 'Тихого Ручья', 'Старых Дубов', 'Лунной Росы', 'Первого Снега',
    'Высокого Клёна', 'Ночной Совы', 'Утренней Зари', 'Золотого Листа']},
  darkelf: {style: 'house', list: ['Велкарр', 'Шиаз', 'Зенрит', 'Ормаэль', 'Таврин', 'Кайзет', 'Мирвенн', 'Ксилтар']},
  orc: {style: 'nick'}, goblin: {style: 'nick'}, ogre: {style: 'nick'}, troll: {style: 'nick'}, gnoll: {style: 'nick'},
};
// a name in the genitive: «сын Торина», «сын Кетиля», «сын Валуя» (a given name's end as the Russian of it goes)
export const genitive = n => (/[ьй]$/.test(n) ? `${n.slice(0, -1)}я` : /а$/.test(n) ? `${n.slice(0, -1)}ы` : /я$/.test(n) ? `${n.slice(0, -1)}и` : /[оиеуэю]$/.test(n) ? n : `${n}а`);
// one's own family part: {style, root} (a patronymic — of `father`, a given name; none — a father of the people's names)
export function clanOf(race, rng, {father = null} = {}) {
  const C = CLAN[race]; if (!C) return null;
  if (C.style === 'patronymic') return {style: C.style, root: genitive(father || pick(rng, PERSON[race]?.m?.length ? PERSON[race].m : ['Безымянный']))};
  if (C.style === 'nick') return {style: C.style, root: pick(rng, [...(PERSON[race]?.nick || []), ...NICK.common])};
  return {style: C.style, root: pick(rng, C.list)};
}
// a child's: the father's name (a patronymic), the parents' family or house; a nickname — his own
export function clanOfChild(race, rng, parent, fatherGiven = null) {
  const C = CLAN[race]; if (!C) return null;
  if (C.style === 'patronymic') return clanOf(race, rng, {father: fatherGiven});
  if (C.style === 'nick' || !parent) return clanOf(race, rng);
  return {...parent};
}
// a sibling's: the same family, the same father; a nickname — his own
export const clanOfSibling = (race, rng, clan) => (!clan || clan.style === 'nick' ? clanOf(race, rng) : {...clan});
// the whole name of `given` of `gender` with his family part
export function fullName(given, gender, clan) {
  if (!clan) return given;
  const f = gender === 'f';
  if (clan.style === 'surname') return `${given} ${f && /(ов|ев|ёв|ин|ын)$/.test(clan.root) ? `${clan.root}а` : clan.root}`;
  if (clan.style === 'patronymic') return `${given} ${f ? 'дочь' : 'сын'} ${clan.root}`;
  if (clan.style === 'house') return `${given} из дома ${clan.root}`;
  return `${given} ${clan.root}`;
}
// one's given name: the first word of his name, or what was kept apart
export const givenOf = m => m.given || String(m.name || '').split(' ')[0];

// «with the griffins» — the instrumental plural of a lair's owners for the chronicle (atlas/lairs.js); the rest — the plural
export const PLURAL_INSTR = {griffin: 'грифонами', manticore: 'мантикорами', wyvern: 'вивернами', drake: 'дрейками', spider: 'пауками', stoneworm: 'червями', bat: 'кровопийцами', varg: 'варгами'};
