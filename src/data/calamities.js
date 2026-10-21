// The calamities of the epic world (cfg.epic; atlas/calamity.js; docs/CAMPAIGN.md «Доработка, этап 7»).
//
// At the dawn of the world a god who made it leaves an artifact in a sanctuary. In each of the three eras the
// artifact finds a bearer — a boss, an ordinary monster made many times stronger by it (its SPECIAL grows past
// its kind's limits) — and a calamity rises around it: omens first, then the boss's own lair, its retinue's
// lairs, more lairs everywhere, raids. The calamity ends with the boss's death (in the wild era a dragon kills
// it and sleeps, wounded, long after); a grave stays where it fell, and the artifact goes on to the next bearer.
//
// CALAMITIES — the kinds a calamity may be, one drawn for each era among those its era allows; they may repeat.
//   lair:     the boss's lair kind (data/lairs.js); for `brood` one of `lairs`, drawn
//   boss:     the boss's species (data/bestiary.js, data/species.js); for `brood` — the lair's own
//   title:    what the boss is called: [nominative, genitive]; name — a name drawn from `names`
//   retinue:  lair kinds that rise around the boss (data/lairs.js)
//   eras:     the eras it may come in; `town` — the boss nests in a town (a vampire), so not before the peoples
//   omens:    the lines of the omens, one a year or so
//   g:        the gender of the title, for the verbs;  rise: the line of its rising: {boss}, {lair} (its name), {where},
//             {town} (a vampire's town, in the prepositional)
export const CALAMITIES = [
  {id: 'brood', label: 'пробуждение древнего выводка', lairs: ['varg', 'spider', 'drake'], title: ['Матка', 'Матки'], g: 'f', eras: ['wild', 'elder', 'young'],
    names: ['Седая Мать', 'Пасть Глубин', 'Многоглазая', 'Старая Кровь', 'Мать Логов'], retinue: [],
    rise: 'Проснулся древний выводок {where}: из логова «{lair}» вышла {boss}, и звери пошли по земле стаями без счёта.'},
  {id: 'necromancer', label: 'пришествие некроманта', lair: 'necromancer', boss: 'necromancer', title: ['Некромант', 'Некроманта'], g: 'm', eras: ['wild', 'elder', 'young'],
    names: ['Морвен', 'Скелдар', 'Аш-Таур', 'Велемир Чёрный', 'Кэрр'], retinue: ['wights', 'ghouls'],
    rise: '{boss} поднял башню «{lair}» {where}: мёртвые встают из курганов и идут за ним.'},
  {id: 'lich', label: 'король-лич', lair: 'wights', boss: 'skeleton', title: ['Король-лич', 'Короля-лича'], g: 'm', eras: ['wild', 'elder', 'young'],
    names: ['Ургал', 'Неупокоенный', 'Хладный', 'Безымянный'], retinue: ['wights', 'wights'],
    rise: 'В кургане «{lair}» {where} встал {boss}: древний король не лёг в могилу, и курганы вокруг открылись.'},
  {id: 'vampire', label: 'вампирский двор', lair: 'vampire', boss: 'vampire', title: ['Вампир-господин', 'Вампира-господина'], g: 'm', eras: ['elder', 'young'], town: true,
    names: ['Ностр', 'Лаэль', 'Бледный Князь', 'Мирела'], retinue: ['ghouls', 'ghouls'],
    rise: '{boss} поселился в {town}: город пьют по ночам, и упыри гнездятся в округе.'},
  {id: 'demon', label: 'открытие разлома', lair: 'rift', boss: 'demon', title: ['Демон-владыка', 'Демона-владыки'], g: 'm', eras: ['wild', 'elder', 'young'],
    names: ['Азгарот', 'Пламя Без Дна', 'Тот-что-за-Гранью', 'Ксаал'], retinue: ['rift'],
    rise: 'Земля разверзлась {where}: из разлома «{lair}» вышел {boss}, и за ним — демоны.'},
  {id: 'giantking', label: 'восстание великанов', lair: 'giants', boss: 'giant', title: ['Король великанов', 'Короля великанов'], g: 'm', eras: ['wild', 'elder', 'young'],
    names: ['Гримнир', 'Тордун', 'Скалобой', 'Хельгрим'], retinue: ['ogres', 'giants'],
    rise: '{boss} поднял становища великанов {where} и встал станом «{lair}»: огры и великаны идут под его знаменем.'},
  {id: 'goblinking', label: 'орда гоблинского царя', lair: 'goblins', boss: 'goblin', title: ['Гоблинский царь', 'Гоблинского царя'], g: 'm', eras: ['wild', 'elder', 'young'],
    names: ['Зиг-Нар', 'Гнилозуб', 'Шаграт', 'Мелкий Кхан'], retinue: ['goblins', 'goblins', 'ogres'],
    rise: '{boss} собрал норы {where} в одну орду — «{lair}»: гоблины сотнями выходят на поверхность.'},
];

// the omens before a calamity rises, one a year or so (drawn without repeats)
export const OMENS = [
  'Над миром прошла комета с кровавым хвостом.',
  'Звери покидают свои края: стаи идут прочь, не разбирая дороги.',
  'Неурожай: колос пустой, и вода в колодцах горчит.',
  'Ночами слышен вой там, где волков никогда не было.',
  'Птицы улетели раньше срока и не вернулись весной.',
  'Солнце дважды гасло среди дня.',
  'Курганы дымятся по ночам.',
];

// who ends a calamity, by era: in the wild era a dragon (CAL.dragon); later the peoples (atlas/alliance.js, the next
// stage); if nobody has by the era's last years, heroes seal the boss away
export const FALL = {
  dragon: 'Дракон из логова «{dragon}» прилетел с огнём к «{lair}» {where}: {boss} пал{a} в небесной битве. Израненный дракон вернулся в своё логово и заснул на долгие годы.',
  beasts: '{boss} пал{a} {where}: стаи, что шли за {him}, обратились против {gen} и разорвали.',
  heroes: 'Безымянные герои ушли к «{lair}» {where} и не вернулись; но с той ночи {boss} не встаёт: {he} запечатан{a} в своём логове.',
  cleared: '{boss} пал{a} {where}: {his} логово выжгли.',
  artifact: 'То, что давало {dat} силу, пропало: на месте гибели — могила, и никто не знает, где теперь {artifact}.',
  taken: '{artifact} наш{found} нового хозяина: {boss}.',
};

// the artifact: its names, drawn one for a world: [nominative, accusative, gender]
export const ARTIFACTS = [
  ['Венец Первых Королей', 'Венец Первых Королей', 'm'], ['Сердце Творца', 'Сердце Творца', 'n'], ['Корона Зари', 'Корону Зари', 'f'],
  ['Скрижаль Начала', 'Скрижаль Начала', 'f'], ['Око Мира', 'Око Мира', 'n'], ['Венец Семи Звёзд', 'Венец Семи Звёзд', 'm'],
];
export const DAWN = 'На заре мира бог, сотворивший его, оставил в святилище {where} {artifact}: в {in} осталась часть его силы.';

// the numbers of a calamity (years unless said):
//   start:    the share of its era the omens begin at, [lo, hi];  omens: how long they last
//   fall:     after the rising, how long the boss stands before it falls (the wild era's dragon, the heroes);
//             heroesBefore — the heroes seal it at the latest this many years before its era ends
//   apart:    each calamity rises at least this share of the world's diagonal from the one before (and the
//             first from the sanctuary); if no place is that far, the farthest found
//   stir:     lairs of all kinds the rising wakes all over the world, [lo, hi]; retinue — lairs of its own
//             kinds around the boss, [lo, hi], within `near` cells (of a 192-high world)
//   boss:     the boss's SPECIAL — its kind's roll plus `add` on each of `stats`, past the kind's limits, at most
//             `cap`; its lair stands at strength `floor` at least while it lives and its raids are × `might`;
//             a brood boss breeds × `breed` more often
//   grave:    the graves where a boss fell (atlas/diplomacy.js barrows): radius, strength
export const CAL = {
  start: [0.2, 0.45], omens: [3, 8], fall: [10, 25], heroesBefore: 3, apart: 0.35,
  stir: [3, 6], retinue: [2, 4], near: [6, 15],
  boss: {stats: ['S', 'E', 'A'], add: [6, 12], cap: 40, floor: 0.75, might: 3, breed: 4},
  grave: {r: 2, v: 0.8},
};
