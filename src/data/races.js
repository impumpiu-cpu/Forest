// Thinking races. Each entry is a species (data/species.js registers them) with a few more fields:
//   kind     — 'race' (data/species.js KINDS)
//   home     — how much a biome suits them, 0..1: the carrying capacity of their people on the world
//              map (atlas/peoples.js) and, later, where their tribes camp; biomes from data/biomes.js
//   rel      — which line of the relations table (data/relations.js) speaks for it
//   special, hp, speed, attack — in data/balance/creatures.js: SPECIAL limits per characteristic [min, max]
//              (nothing pushes past them) and the body
//   peoples  — sub-races: their shift of the limits is in data/balance/creatures.js, `mods` and `innate` add
//              to the species'; on the world
//              map a realm takes the sub-race that fits the land of its seat best (`home` over the race's,
//              atlas/realms.js): `plural` / `gen` name it in the chronicle («горные гномы Медной горы»),
//              `taste` leans its towns' building (data/peoples.js taste); `world: false` — never a realm
//   body     — physiology for the card and, later, for the world map (growth of a node):
//              adult/life in years, fertility 0…1, diet
//   mods     — multipliers on the agent (hunger, cold, sleep, regen… see data/traits.js BASE_MODS)
//   innate   — racial traits nobody can learn or lose: {label, note, mods?}
//   align    — default world view: order (−3 вольница … +3 порядок), mercy (−3 жестокость … +3 милосердие)
//   values   — what the people holds dear (data/values.js) with a weight: each creature draws 2–3
//   settle   — weight among the settlers who may come to the outpost (0: never comes on its own)
// A race may also come with raiders (data/raids.js) — that does not need anything here.
import {bodyFor} from './balance/creatures.js';

const N = (m, f) => [...m.map(n => [n, 'm']), ...f.map(n => [n, 'f'])];

const person = (size, skin) => ({shape: 'person', size, skin});
const NEEDS = ['food', 'rest', 'warmth'];

export const RACES = [
  {id: 'human', kind: 'race', home: {meadow: 1, steppe: 0.8, shrubland: 0.8, forest: 0.6, savanna: 0.55, foothills: 0.4, taiga: 0.35, jungle: 0.3, swamp: 0.15, desert: 0.05},
    label: 'человек', plural: 'люди', rel: 'human', settle: 6,
    heatHarm: 70, look: person(0.62, '#e2b48c'),
    body: {adult: 16, life: 70, fertility: 0.5, diet: 'всеядный'},
    innate: [{label: 'приспособляемость', note: 'учится любому делу быстрее других', mods: {learn: 1.15}}],
    align: {order: 0, mercy: 0, spread: 1.6},
    values: {work: 1, family: 1, faith: 1, gold: 1, freedom: 1, strength: 0.6, knowledge: 0.6, ancestors: 0.6, nature: 0.5},
    names: N(['Ждан', 'Горислав', 'Тихон', 'Мирон', 'Ярослав', 'Ратибор', 'Боян', 'Светозар', 'Велимир', 'Добрыня', 'Радим'],
      ['Милава', 'Веселина', 'Любава', 'Злата', 'Дарина', 'Снежана', 'Забава', 'Агния', 'Олеся', 'Василиса', 'Ведана'])},

  {id: 'halfling', kind: 'race', home: {meadow: 1, forest: 0.6, shrubland: 0.5, steppe: 0.3, foothills: 0.3, swamp: 0.1},
    label: 'полурослик', plural: 'полурослики', rel: 'halfling', settle: 1.6,
    heatHarm: 70, look: person(0.48, '#eac29c'),
    body: {adult: 20, life: 100, fertility: 0.5, diet: 'всеядный, ест часто'},
    mods: {hunger: 1.2, cold: 1.1},
    innate: [{label: 'неприметный', note: 'мал ростом, ходит тихо, мало несёт'}],
    align: {order: 1, mercy: 2, spread: 1.2},
    values: {family: 2, work: 1.4, faith: 0.6, gold: 0.6, nature: 0.8},
    names: N(['Тобо', 'Хэмли', 'Мунго', 'Бодрик', 'Олдо', 'Фирмин'], ['Мелла', 'Розалина', 'Лютика', 'Тилли', 'Марга', 'Пеона'])},

  {id: 'giant', kind: 'race', home: {highlands: 1, foothills: 0.6, tundra: 0.6, taiga: 0.3, ice: 0.3},
    label: 'великан', plural: 'великаны', rel: 'giant', settle: 0.6,
    heatHarm: 70, look: person(0.8, '#c9a27e'),
    body: {adult: 25, life: 150, fertility: 0.25, diet: 'всеядный, ест за троих'},
    mods: {hunger: 2.2, cold: 0.7},
    innate: [{label: 'исполин', note: '2,5 метра роста: ест за троих, мёрзнет меньше'}],
    align: {order: -1, mercy: 1, spread: 1.2},
    values: {strength: 2, freedom: 1.6, family: 1, nature: 0.8},
    names: N(['Грумбар', 'Ормунд', 'Тяжебор', 'Валуй', 'Скальд'], ['Хельга', 'Ингрид', 'Гудрун', 'Ассвейг'])},

  {id: 'elf', kind: 'race', home: {forest: 1, jungle: 0.85, taiga: 0.7, meadow: 0.55, swamp: 0.25, shrubland: 0.3, savanna: 0.15, foothills: 0.2},
    label: 'лесной эльф', plural: 'лесные эльфы', rel: 'elf', settle: 1,
    heatHarm: 70, look: person(0.6, '#f1dcc0'),
    body: {adult: 50, life: 600, fertility: 0.08, diet: 'почти травоядный'},
    mods: {hunger: 0.8, cold: 1.3, sleep: 0.5},
    innate: [{label: 'транс', note: 'четыре часа полудрёмы заменяют сон'}, {label: 'лесной глаз', note: 'в лесу видит то, что другим не видно'}],
    peoples: [
      {id: 'wood', label: 'лесной эльф', plural: 'лесные эльфы', gen: 'лесных эльфов', weight: 3},
      {id: 'high', label: 'высокий эльф', plural: 'высокие эльфы', gen: 'высоких эльфов', weight: 1,
        home: {meadow: 1, forest: 0.6, shrubland: 0.6, foothills: 0.45, savanna: 0.3, jungle: 0.3, taiga: 0.3},
        taste: {lore: 1.6, prestige: 1.3, trade: 1, defence: 0.8}, innate: [{label: 'старая кровь', note: 'помнит книги, которых другие не читали'}]},
    ],
    align: {order: 1, mercy: 0, spread: 1},
    values: {nature: 2.2, ancestors: 1.4, knowledge: 1, freedom: 0.8},
    names: N(['Аэлдир', 'Илетан', 'Келориэн', 'Тандрил', 'Сильвар'], ['Элоэна', 'Ниэль', 'Лаириэль', 'Аэрин', 'Иримэ'])},

  {id: 'darkelf', kind: 'race', home: {underground: 1, foothills: 0.3, jungle: 0.3, swamp: 0.3, forest: 0.2},
    label: 'тёмный эльф', plural: 'тёмные эльфы', rel: 'darkelf', settle: 0,
    heatHarm: 70, look: person(0.6, '#5b5470'),
    body: {adult: 50, life: 500, fertility: 0.1, diet: 'всеядный'},
    mods: {hunger: 0.9, cold: 1.2, sleep: 0.5},
    innate: [{label: 'тёмное зрение', note: 'видит во мраке'}, {label: 'светобоязнь', note: 'на дневном солнце щурится и слабеет'}, {label: 'привычка к ядам', note: 'яды и зелья берут его слабее'}],
    align: {order: 2, mercy: -2, spread: 1},
    values: {knowledge: 2, strength: 1.6, gold: 1, ancestors: 0.8},
    names: N(['Вельтрис', 'Зарейн', 'Дромир', 'Ксалет'], ['Илвара', 'Шейзра', 'Квилла', 'Вирна'])},

  // Dwarves: long-lived, slow to breed, at home under the mountain. Their gut takes fermented
  // grain best of all: a sober dwarf works slower, a dwarf with a cup of braga works better.
  {id: 'dwarf', kind: 'race', home: {foothills: 1, highlands: 0.75, taiga: 0.15, tundra: 0.15, forest: 0.1, steppe: 0.1, volcano: 0.4},
    label: 'гном', plural: 'гномы', rel: 'dwarf', settle: 1.3,
    heatHarm: 82, look: person(0.55, '#d59a78'),
    body: {adult: 40, life: 300, fertility: 0.2, diet: 'всеядный, брага — тоже еда'},
    mods: {cold: 0.7},
    // brew: a cup of braga feeds (`food`), work goes at `drunk` for a day and a half after it, at `sober` otherwise
    brew: {food: 0.3, drunk: 1.1, sober: 0.85, lasts: 1.5},
    innate: [{label: 'хмельная кровь', note: 'брага кормит и бодрит; без неё по утрам хмурится'},
      {label: 'тёмное зрение', note: 'видит во мраке'}, {label: 'жаростойкий', note: 'не боится жара горна'}],
    peoples: [
      {id: 'mountain', label: 'горный гном', plural: 'горные гномы', gen: 'горных гномов', weight: 3,
        home: {foothills: 1, highlands: 0.9, volcano: 0.5, taiga: 0.15, tundra: 0.15}, taste: {prod: 1.5, defence: 1.3, trade: 0.9}},
      {id: 'hill', label: 'холмовой гном', plural: 'холмовые гномы', gen: 'холмовых гномов', weight: 2,
        home: {foothills: 0.8, meadow: 0.6, forest: 0.45, steppe: 0.4, shrubland: 0.4}, taste: {trade: 1.4, food: 1.2, prod: 1.2, defence: 1},
        innate: [{label: 'торговая жилка', note: 'знает цену всему, что лежит на прилавке'}]},
      {id: 'deep', label: 'глубинный гном', plural: 'глубинные гномы', gen: 'глубинных гномов', weight: 1, world: false,
        mods: {cold: 0.85}, innate: [{label: 'дитя глубин', note: 'бледен, видит во мраке ещё лучше'}]},
    ],
    align: {order: 3, mercy: 0, spread: 0.8},
    values: {ancestors: 2, work: 2, gold: 1.4, family: 0.8},
    names: N(['Торгрим', 'Балдур', 'Хрольф', 'Брокк', 'Ульфгар', 'Кетиль'], ['Дагна', 'Хильда', 'Ингвара', 'Тордис', 'Бруна'])},

  // The greenskins: orcs, goblins, ogres, trolls — kin, they may share a camp.
  {id: 'orc', kind: 'race', home: {steppe: 1, savanna: 0.9, taiga: 0.6, foothills: 0.6, meadow: 0.6, swamp: 0.6, tundra: 0.5, desert: 0.4, highlands: 0.3, shrubland: 0.5},
    label: 'орк', plural: 'орки', rel: 'greenskin', settle: 0,
    heatHarm: 70, look: person(0.66, '#6f9a4a'),
    body: {adult: 12, life: 50, fertility: 0.75, diet: 'хищник-всеядный'},
    mods: {hunger: 1.4, cold: 0.85, regen: 1.6, bravery: 1.2},
    innate: [{label: 'живучий', note: 'раны затягиваются быстро'}, {label: 'ярость', note: 'раненым дерётся злее'}],
    align: {order: 1, mercy: -1, spread: 1.2},
    values: {strength: 2.2, ancestors: 1.2, faith: 0.8, family: 0.6},
    names: N(['Угрук', 'Мазгаш', 'Зугрог', 'Брагот', 'Корх'], ['Ургха', 'Мокра', 'Зарга', 'Гхаша'])},

  {id: 'goblin', kind: 'race', home: {foothills: 0.9, underground: 0.8, swamp: 0.5, forest: 0.5, taiga: 0.4, shrubland: 0.4, highlands: 0.4},
    label: 'гоблин', plural: 'гоблины', rel: 'greenskin', settle: 0,
    heatHarm: 70, look: person(0.45, '#8fb04c'),
    body: {adult: 6, life: 30, fertility: 0.95, diet: 'ест что угодно'},
    mods: {hunger: 0.7, cold: 1.1, bravery: 0.7},
    innate: [{label: 'тёмное зрение', note: 'видит во мраке'}, {label: 'трус в одиночку', note: 'смел только в толпе своих'}],
    align: {order: -2, mercy: -1, spread: 1.2},
    values: {gold: 2.2, knowledge: 1.2, freedom: 1},
    names: N(['Сникль', 'Ризз', 'Гнырк', 'Кривоух'], ['Зизи', 'Шмыга', 'Пикша'])},

  {id: 'ogre', kind: 'race', home: {foothills: 0.8, forest: 0.7, taiga: 0.6, swamp: 0.5, shrubland: 0.4, meadow: 0.3},
    label: 'огр', plural: 'огры', rel: 'greenskin', settle: 0,
    heatHarm: 70, look: person(0.86, '#9b8a6a'),
    body: {adult: 15, life: 60, fertility: 0.3, diet: 'ест что угодно, за четверых'},
    mods: {hunger: 3, cold: 0.7, bravery: 1.3},
    innate: [{label: 'утроба', note: 'голод валит его быстрее других'}],
    align: {order: -2, mercy: -2, spread: 0.8},
    values: {strength: 2.5, gold: 0.6},
    names: N(['Мордоб', 'Брюхан', 'Грыз', 'Тяжак'], ['Хлоба'])},

  // Trolls regrow wounds unless fire or acid stops it.
  {id: 'troll', kind: 'race', home: {swamp: 0.9, forest: 0.8, tundra: 0.7, taiga: 0.7, ice: 0.5, foothills: 0.4},
    label: 'тролль', plural: 'тролли', rel: 'greenskin', settle: 0,
    heatHarm: 62, look: person(0.76, '#4f8f86'),
    body: {adult: 14, life: 80, fertility: 0.5, diet: 'хищник'},
    mods: {hunger: 1.8, regen: 6, bravery: 1.3},
    innate: [{label: 'регенерация', note: 'рана затягивается на глазах, пока рядом нет огня'}],
    peoples: [
      {id: 'forest', label: 'лесной тролль', plural: 'лесные тролли', gen: 'лесных троллей', weight: 2, home: {forest: 0.9, taiga: 0.8, foothills: 0.4}},
      {id: 'swamp', label: 'болотный тролль', plural: 'болотные тролли', gen: 'болотных троллей', weight: 1, home: {swamp: 1, jungle: 0.5, forest: 0.3}},
      {id: 'ice', label: 'ледяной тролль', plural: 'ледяные тролли', gen: 'ледяных троллей', weight: 1, mods: {cold: 0.3}, home: {tundra: 0.9, ice: 0.7, highlands: 0.5, taiga: 0.3}},
    ],
    align: {order: -1, mercy: -1, spread: 1},
    values: {nature: 1.6, faith: 1.6, strength: 1},
    names: N(['Ракаш', 'Вуджин', 'Зекки', 'Тумбо'], ['Шанка', 'Мвира'])},

  // Gnolls: hyena-folk, scavengers. Carrion does them no harm; the rot does not take them.
  {id: 'gnoll', kind: 'race', home: {savanna: 1, barrows: 0.9, steppe: 0.8, desert: 0.5, shrubland: 0.5, meadow: 0.3},
    label: 'гнолл', plural: 'гноллы', rel: 'gnoll', settle: 0,
    heatHarm: 70, look: person(0.64, '#a98d5a'),
    body: {adult: 8, life: 40, fertility: 0.75, diet: 'падальщик'},
    mods: {hunger: 1.2, cold: 0.9},
    innate: [{label: 'нюх', note: 'чует добычу и нежить издалека'}, {label: 'падальщик', note: 'мертвечина и гниль ему не вредят'}],
    align: {order: -1, mercy: -3, spread: 0.8},
    values: {strength: 2, faith: 1.4},
    names: N(['Хракк', 'Гнарр', 'Ыхыр', 'Скорр'], ['Хиза', 'Ррака'])},
].map(r => bodyFor({needs: NEEDS, sentient: true, inventory: true, mind: 'sentient', ...r}));
