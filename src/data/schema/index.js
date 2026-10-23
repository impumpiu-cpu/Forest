// Every table of the game as the screen «Настройки → Таблицы» shows it and `npm test` checks it
// (src/data/schema/columns.js says what a schema and a column are; docs/TABLE.md, «Карта таблиц»).
// The data stays where it is: each schema only reads its source modules. One thing is one row on the screen,
// even when its numbers live in two files: a race is data/races.js + its row of data/balance/creatures.js + its
// people on the world map (data/peoples.js).
// A new table: one entry in TABLES below (or in a group's list); its column `ref`s make the checks.
// Editing (src/data/schema/edits.js): a cell is written into the row at its column's key, unless the table's
// `target(row, column)` says where the value really lives (rows that are copies); `after()` rebuilds what is
// made from the table at load (items from forms × materials).
import {col, paramRows, paramGroups, params, checkTables} from './columns.js';
import {SPECIES, KINDS} from '../species.js';
import {WORLD_PEOPLES} from '../peoples.js';
import {KINS, RELATIONS, OPINION} from '../relations.js';
import {VALUES, AXIS_MAX, ALIGN, ALIGN_DRIFT} from '../values.js';
import {STATS, EFFECTS} from '../special.js';
import {BIOMES, BIOME_KINDS, RARITY} from '../biomes.js';
import {MATERIALS, FORMS, PRICES} from '../balance/index.js';
import {BLOWS} from '../balance/combat.js';
import {MARKS, MARK} from '../balance/marks.js';
import {QUALITY} from '../quality.js';
import {ITEMS, rebuildItems} from '../items.js';
import {TOWN_BUILDINGS, CATEGORIES, EFFECTS as TOWN_FX, PLACE_NEEDS} from '../townBuildings.js';
import {BUILDINGS} from '../buildings.js';
import {CAMP_FX, BEASTS, VEHICLES} from '../transport.js';
import {LAIRS, LAIR_AGE, LEADER, ROT, TRIBE_HOME, TRIBE_RAID} from '../lairs.js';
import {CALAMITIES} from '../calamities.js';
import {DIPLOMACY} from '../diplomacy.js';
import {ERAS} from '../history.js';
import {TECHS, TECH_RULES, techOfBuilding, techOfMaterial} from '../tech.js';
import {PERSON, PET, NICK, TITLE, BOSS, personNames} from '../names.js';
import {WOODS, STONES, FAMILIES, RACE_MATERIALS, USES} from '../kinds.js';
import {CALAMITIES as CALS} from '../calamities.js';
import {RESOURCES} from '../resources.js';
import {BASE_MODS} from '../traits.js';

export {checkTables, get, editable, targetOf, valueErrors, resolver} from './columns.js';

export const GROUPS = ['Существа', 'Отношения', 'Вещи', 'Народы', 'Караван', 'Мир'];

const keysOf = obj => ({has: k => Object.prototype.hasOwnProperty.call(obj, k)});
const MINDS = {beast: 'зверь', semi: 'полуразумный', sentient: 'разумный'};
const SLOTS = {hand: 'рука', body: 'тело', back: 'спина'};
const RESIST = {pierce: 'колющий', slash: 'рубящий', blunt: 'дробящий', melee: 'вблизи', ranged: 'издали'};
const labels = list => (list || []).map(x => x.label).join(', ');

// the creature columns shared by races, monsters and beasts (data/balance/creatures.js)
const body = [
  col('special', 'SPECIAL', 'special', {min: 0, full: true, note: 'пределы характеристик вида [мин, макс]; каждое существо бросает свои внутри них (data/special.js)'}),
  col('hp', 'Здоровье', 'num', {min: 0, note: 'здоровье типичного существа; Выносливость двигает его'}),
  col('speed', 'Скорость', 'num', {min: 0, note: 'клеток за тик; Ловкость двигает её'}),
  col('attack.power', 'Удар', 'num', {min: 0, note: 'сила голого удара (с оружием бьёт оружием)'}),
  col('attack.cooldown', 'Пауза удара', 'int', {min: 1, note: 'тиков между ударами'}),
  col('attack.type', 'Тип удара', 'enum', {values: BLOWS}),
  col('ks', 'КС-поправка', 'num', {min: 0, computed: true, note: 'поправка коэффициента силы; подбирает `npm run arena:calibrate`'}),
];

const raceRows = () => SPECIES.filter(s => s.kind === 'race').map(s => {
  const p = WORLD_PEOPLES.all().find(x => x.race === s.id);
  return {...s, world: p?.id ?? null, era: p?.era ?? null, subraces: s.peoples || []};
});

export const TABLES = [
  // ── Существа
  {id: 'races', label: 'Расы', group: 'Существа', key: 'id', rows: raceRows, target: (r, c) => [SPECIES.get(r.id), c.key],
    note: 'Разумные расы: data/races.js (облик, дом, мировоззрение, ценности) + data/balance/creatures.js (SPECIAL, тело, удар) + народ на карте мира (data/peoples.js).',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('plural', 'Мн. число'),
      col('rel', 'Строка отношений', 'ref', {ref: 'relations', note: 'чья строка в таблице «Расы ↔ расы»'}),
      col('world', 'Народ на карте', 'ref', {ref: 'peoples', edit: false}), col('era', 'Эпоха прихода', 'ref', {ref: ERAS, edit: false, note: 'правится в «Народах мира»'}),
      col('align.order', 'Закон ↔ хаос', 'num', {min: -AXIS_MAX, max: AXIS_MAX, note: 'точка расы на компасе: + закон, − хаос (data/values.js); держава ±3 от неё, пешка ±3 от державы'}),
      col('align.mercy', 'Добро ↔ зло', 'num', {min: -AXIS_MAX, max: AXIS_MAX, note: 'точка расы: + добро, − зло; держава ±3, пешка ±3 от державы'}),
      col('align.spread.order', 'Разброс: закон', 'num', {min: 0, max: 2, note: 'множитель к ±3: как далеко держава отходит от расы, а пешка — от державы по оси закона (люди 1,3, гномы 0,5)'}),
      col('align.spread.mercy', 'Разброс: добро', 'num', {min: 0, max: 2, note: 'то же по оси добра'}),
      col('values', 'Ценности', 'map', {ref: VALUES, min: 0, note: 'вес ценности; каждое существо тянет 2–3'}),
      col('home', 'Биомы расселения', 'map', {ref: 'biomes', min: 0, max: 1, note: 'насколько биом подходит: 1 — родной, 0 — не живут'}),
      ...body,
      col('body.adult', 'Взрослый, лет', 'int', {min: 0}), col('body.life', 'Жизнь, лет', 'int', {min: 0}),
      col('body.fertility', 'Плодовитость', 'num', {min: 0, max: 1}), col('body.diet', 'Пища'),
      col('mods', 'Множители', 'map', {ref: keysOf(BASE_MODS), note: 'голод, холод, сон… (data/traits.js BASE_MODS)'}),
      col('innate', 'Врождённое', 'list', {show: labels}),
      col('subraces', 'Подрасы', 'list', {show: labels}),
      col('settle', 'Вес переселенцев', 'num', {min: 0, note: '0 — сам в поселение не приходит'}),
      col('heatHarm', 'Жар вредит с', 'num'),
    ]},
  {id: 'subraces', label: 'Подрасы', group: 'Существа', key: 'key',
    target: (r, c) => [SPECIES.get(r.race).peoples.find(p => p.id === r.id), c.key],
    note: 'Народы внутри расы (data/races.js `peoples`): сдвиг пределов SPECIAL — в data/balance/creatures.js.',
    rows: () => SPECIES.filter(s => s.kind === 'race' && s.peoples).flatMap(s => s.peoples.map(p => ({...p, key: `${s.id}.${p.id}`, race: s.id, world: p.world !== false}))),
    columns: [
      col('key', 'id'), col('race', 'Раса', 'ref', {ref: 'races', edit: false}), col('label', 'Название'), col('plural', 'Мн. число'),
      col('weight', 'Вес', 'num', {min: 0}), col('world', 'Держава на карте', 'bool'),
      col('shift', 'Сдвиг SPECIAL', 'shift'), col('home', 'Свои биомы', 'map', {ref: 'biomes', min: 0, max: 1}),
      col('taste', 'Вкус построек', 'map', {ref: keysOf(TOWN_FX), min: 0}), col('innate', 'Врождённое', 'list', {show: labels}),
    ]},
  {id: 'creatures', label: 'Монстры и звери', group: 'Существа', key: 'id',
    rows: () => SPECIES.filter(s => s.kind !== 'race'),
    note: 'Звери (data/species.js, data/bestiary.js), нежить и демоны (data/monsters.js) + их строки data/balance/creatures.js.',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('kind', 'Вид', 'enum', {values: KINDS}), col('mind', 'Разум', 'enum', {values: MINDS}),
      col('brain', 'Поведение'),
      col('habitat', 'Биомы обитания', 'map', {ref: 'biomes', values: RARITY, note: 'как часто встречается: часто · обычно · редко · очень редко'}),
      ...body,
      col('resist', 'Тело против ударов', 'map', {ref: keysOf(RESIST), min: 0, note: '× урона по типу и по способу'}),
      col('weakTo', 'Боится', 'ids'), col('relativeStats', 'Статы типичного зверя', 'bool'), col('nocturnal', 'Ночной', 'bool'), col('undead', 'Без жизни', 'bool'),
    ]},
  // ── names: one place for all of them (data/names.js); an edit puts the new list into what the game reads (`after`)
  {id: 'names', label: 'Имена', group: 'Существа', key: 'id', rows: () => Object.entries(PERSON).filter(([id]) => id !== 'necromancer').map(([id, P]) => ({id, label: SPECIES.has(id) ? SPECIES.get(id).plural : id, ...P})),
    target: (r, c) => [PERSON[r.id], c.key], after: rebuildNames,
    note: 'Имена разумных (data/names.js): мужские, женские и прозвища своей расы. Из них собираются имена поселенцев, членов каравана, главарей логов («Хракк Тихий»). Списки — через запятую. Некроманты берут имена людей.',
    columns: [col('id', 'id'), col('label', 'Кто', 'text', {edit: false}), col('m', 'Мужские', 'ids'), col('f', 'Женские', 'ids'), col('nick', 'Прозвища', 'ids')]},
  {id: 'nicknames', label: 'Клички и прозвища', group: 'Существа', key: 'id',
    rows: () => [{id: 'common', label: 'общие прозвища (вожаки зверей, все)', names: NICK.common}, ...Object.entries(PET).map(([id, names]) => ({id, label: `клички: ${SPECIES.has(id) ? SPECIES.get(id).plural : id}`, names}))],
    target: (r, c) => (r.id === 'common' ? [NICK, 'common'] : [PET, r.id]), after: rebuildNames,
    note: 'Клички приручённых зверей и общие прозвища (data/names.js). Титулы главарей: вожак (звери), главарь (полуразумные и разумные), владыка (нежить), князь (демоны).',
    columns: [col('id', 'id'), col('label', 'Что', 'text', {edit: false}), col('names', 'Список', 'ids')]},
  {id: 'bossNames', label: 'Имена боссов', group: 'Существа', key: 'id', rows: () => CALS.map(c => ({id: c.id, label: c.label, names: BOSS[c.id] || []})),
    target: (r, c) => [BOSS, r.id], after: rebuildNames,
    note: 'Имена боссов бедствий по их видам (data/names.js BOSS). Бедствие, поднявшееся на главаре логова, берёт его имя и титул.',
    columns: [col('id', 'id'), col('label', 'Бедствие', 'text', {edit: false}), col('names', 'Имена', 'ids')]},
  {id: 'values', label: 'Ценности', group: 'Существа', key: 'id', rows: () => VALUES.all(),
    note: 'Что существо ценит (data/values.js): общие ценности сближают, конфликтующие разводят.',
    columns: [col('id', 'id'), col('label', 'Название'), col('clash', 'Конфликтует с', 'ids', {ref: 'values'})]},
  {id: 'stats', label: 'SPECIAL', group: 'Существа', key: 'id', rows: () => STATS.all(),
    note: 'Семь характеристик (data/special.js). Норма человека — 5.',
    columns: [col('id', 'Буква'), col('label', 'Название'), col('short', 'Кратко'), col('note', 'Что даёт')]},
  {id: 'statEffects', label: 'Действие SPECIAL', group: 'Существа', key: 'id', computed: true,
    rows: () => Object.entries(EFFECTS).map(([id, fn]) => ({id, fn})),
    note: 'Формулы: как характеристики превращаются в множители (data/special.js EFFECTS). При 5 всё нейтрально.',
    columns: [col('id', 'Эффект'), col('fn', 'Формула', 'formula')]},

  // ── Отношения
  {id: 'relations', label: 'Расы ↔ расы', group: 'Отношения', key: 'id',
    rows: () => KINS.all().map(k => ({...k, ...RELATIONS[k.id]})), target: (r, c) => [RELATIONS[r.id], c.key],
    note: 'Старая память народов, −3…+3 (data/relations.js): строка — кто относится, столбец — к кому. Несимметрична.',
    columns: [col('id', 'id'), col('label', 'Кто', 'text', {edit: false}), ...KINS.all().map(k => col(k.id, k.label, 'num', {min: -3, max: 3}))]},
  {id: 'opinion', label: 'Мнение внутри группы', group: 'Отношения', ...params(() => paramRows(OPINION)),
    note: 'Веса мнения одного существа о другом (data/relations.js OPINION): общие ценности, разрыв во взглядах, личная история.'},
  {id: 'compass', label: 'Мировоззрение', group: 'Отношения', ...params(() => paramGroups({align: ALIGN, drift: ALIGN_DRIFT})),
    note: 'Компас ±5 (data/values.js): насколько держава отходит от точки расы и пешка — от державы, с какого значения на оси пишется ярлык, как близость взглядов меняет отношения держав, и как точка ползёт от войн, мира, спасения, продажи пленных, побега и совета.'},
  {id: 'diplomacy', label: 'Державы ↔ державы', group: 'Отношения', ...params(() => paramRows(DIPLOMACY)),
    note: 'Правила отношений держав на карте мира, −5…+5 (data/diplomacy.js): дрейф, торговля, набеги, война и мир. Сами отношения меняются по годам в мире.'},

  // ── Вещи
  {id: 'materials', label: 'Материалы', group: 'Вещи', key: 'id', rows: () => Object.entries(MATERIALS).map(([id, m]) => ({id, ...m, tech: techOfMaterial(id)})), target: (r, c) => [MATERIALS[r.id], c.key], after: rebuildItems,
    note: 'Из чего вещь (data/balance/materials.js): множители к тому, что даёт форма. Предмет = форма × материал × качество.',
    columns: [
      col('id', 'id'), col('adj.m', 'Название'), col('class', 'Класс', 'ids', {edit: false, note: 'какие формы из него делаются: меняет набор предметов, поэтому не правится'}), col('tier', 'Ступень', 'int', {min: 0, max: 4}),
      col('rarity', 'Редкость', 'enum', {values: PRICES.ITEMS.rarity}), col('tech', 'Технология', 'ref', {ref: 'techs', computed: true, note: 'кузнецы города работают металл, если держава её знает'}), col('resource', 'Ресурс', 'ref', {ref: RESOURCES}), col('amount', 'Ресурса на часть', 'num', {min: 0}),
      col('labour', 'Труд ×', 'num', {min: 0}), col('dmg', 'Урон ×', 'num', {min: 0}), col('swing', 'Пауза ×', 'num', {min: 0}), col('dur', 'Прочность ×', 'num', {min: 0}),
      col('work', 'Инструмент ×', 'num', {min: 0}), col('armor', 'Броня ×', 'num', {min: 0}), col('block', 'Блок ×', 'num', {min: 0}), col('warmth', 'Тепло ×', 'num', {min: 0}),
      col('weight', 'Тяжесть ×', 'num', {min: 0}), col('color', 'Цвет', 'color'),
    ]},
  {id: 'forms', label: 'Формы', group: 'Вещи', key: 'id', rows: () => Object.entries(FORMS).map(([id, f]) => ({id, ...f, title: f.names?.[f.ref]?.[0] ?? f.name?.(MATERIALS[f.ref])?.[0] ?? id})),
    target: (r, c) => [FORMS[r.id], c.key], after: rebuildItems,
    note: 'Тип вещи (data/balance/forms.js): копьё, меч, кольчуга… Числа стоят при материале `ref`, остальные материалы их масштабируют.',
    columns: [
      col('id', 'id'), col('title', 'Название', 'text', {computed: true, note: 'имя при материале «Числа при»; у других материалов — по формуле «Имя»'}), col('slot', 'Место', 'enum', {values: SLOTS}), col('hands', 'Рук', 'int', {min: 1, max: 2}),
      col('of', 'Из классов', 'ids', {edit: false, note: 'из каких материалов делается: меняет набор предметов, поэтому не правится'}), col('ref', 'Числа при', 'ref', {ref: 'materials'}),
      col('blow', 'Тип удара', 'enum', {values: BLOWS}), col('scale.S', 'Доля Силы', 'num', {min: 0, max: 1}), col('scale.A', 'Доля Ловкости', 'num', {min: 0, max: 1}),
      col('melee.dmg', 'Удар', 'num', {min: 0}), col('melee.cd', 'Пауза', 'int', {min: 1}),
      col('ranged.dmg', 'Выстрел', 'num', {min: 0}), col('ranged.range', 'Дальность', 'num', {min: 0}), col('ranged.cd', 'Пауза выстрела', 'int', {min: 1}),
      col('ranged.type', 'Тип выстрела', 'enum', {values: BLOWS}), col('ranged.ammo', 'Боеприпас'),
      col('vs', 'Защита по типам', 'map', {ref: keysOf(BLOWS), min: 0, note: '× брони или блока против каждого типа удара'}),
      col('armor', 'Броня', 'num', {min: 0, max: 1}), col('block', 'Блок', 'num', {min: 0, max: 1}), col('cover', 'Прикрытие', 'num', {min: 0, max: 1}),
      col('warmth', 'Тепло', 'num', {min: 0}), col('speed', 'Скорость ×', 'num', {min: 0}), col('carry', 'Ноша +', 'num', {min: 0}),
      col('dur', 'Прочность', 'num', {min: 0, infinite: true}),
      col('parts', 'Части', 'map', {ref: {has: k => k === 'material' || RESOURCES.has(k)}, min: 0}), col('work', 'Труд', 'int', {min: 0}),
      col('tradeOnly', 'Только у торговцев', 'bool'), col('name', 'Имя из материала', 'formula'),
    ]},
  // ── materials of a kind (data/kinds.js): what a family is made of, and what each race may do with each
  {id: 'woods', label: 'Породы деревьев', group: 'Вещи', key: 'id', rows: () => WOODS.all(),
    note: 'Древесина на выбор (data/kinds.js): рецепт просит «древесину», склад помнит, какую; на растопку идёт худшая, на изделие — лучшая, какую может работать раса мастера. Множители — к деревянной вещи. Особое дерево даёт свои числа только своему мастеру («Материалы рас»), другим — как простое.',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('biomes', 'Где растёт', 'map', {ref: 'biomes', min: 0}),
      col('dmg', 'Удар ×', 'num', {min: 0}), col('dur', 'Прочность ×', 'num', {min: 0}), col('weight', 'Вес ×', 'num', {min: 0}),
      col('fuel', 'Горит ×', 'num', {min: 0}), col('price', 'Цена ×', 'num', {min: 0}),
      col('special', 'Особое', 'bool', {note: 'свои числа — только мастеру'}), col('plain', 'Для прочих как', 'ref', {ref: 'woods'}), col('color', 'Цвет', 'color'),
    ]},
  {id: 'stones', label: 'Камень', group: 'Вещи', key: 'id', rows: () => STONES.all(),
    note: 'Камень на выбор — породы мира (data/geology.js, data/kinds.js): какую породу дала клетка, такой камень и ломают. Постройка помнит свой камень и его цвет; прочность ×  — для износа построек (начнёт действовать, когда он появится).',
    columns: [col('id', 'id'), col('label', 'Порода'), col('rock', 'Вид породы'), col('dur', 'Прочность ×', 'num', {min: 0}), col('price', 'Цена ×', 'num', {min: 0}), col('color', 'Цвет', 'color')]},
  {id: 'raceMaterials', label: 'Материалы рас', group: 'Вещи', key: 'id',
    rows: () => SPECIES.filter(s => s.kind === 'race').map(s => ({id: s.id, label: s.plural, ...Object.fromEntries(Object.values(FAMILIES).flatMap(F => F.members()).map(m => [m, RACE_MATERIALS[s.id]?.[m] || 'yes']))})),
    target: (r, c) => [(RACE_MATERIALS[r.id] ||= {}), c.key],
    note: 'Что раса делает с каждым материалом (data/kinds.js): можно; не добывает и не делает, но берёт сделанное другими — вещь «грязная»; не касается вовсе; мастер — особый материал даёт ей свои числа. Пока всё всем можно, кроме святого дерева: его мастера — эльфы.',
    columns: [col('id', 'id'), col('label', 'Раса', 'text', {edit: false}),
      ...Object.values(FAMILIES).flatMap(F => F.members()).map(m => col(m, WOODS.has(m) ? WOODS.get(m).label : STONES.has(m) ? STONES.get(m).label : RESOURCES.has(m) ? RESOURCES.get(m).short : m, 'enum', {values: USES}))]},
  {id: 'quality', label: 'Качество', group: 'Вещи', key: 'id', rows: () => QUALITY.all(),
    note: 'Ступени выделки +0…+4 (data/quality.js): что даёт ступень и как часто мастер её добивается.',
    columns: [
      col('id', 'id'), col('label', 'Знак'), col('rank', 'Редкость'), col('hit', 'Урон +', 'num', {min: 0}), col('guard', 'Защита +', 'num', {min: 0}),
      col('tool', 'Инструмент +', 'num', {min: 0}), col('dur', 'Прочность +', 'num', {min: 0}), col('warmth', 'Тепло +', 'num', {min: 0}), col('cap', 'Потолок +', 'num', {min: 0}),
      col('sold', 'Продаётся', 'bool'), col('keep', 'Не продают', 'bool'),
      col('craftBase', 'Шанс: основа', 'num', {min: 0, max: 1}), col('craftSkill', 'Шанс: за навык', 'num', {min: 0, max: 1}),
    ]},
  {id: 'marks', label: 'Клеймо кузнеца', group: 'Вещи', key: 'id', rows: () => Object.values(MARKS),
    note: 'Что ставят только кузнецы городов своего народа (data/balance/marks.js): свой тип удара бьёт и держит лучше. У людей клейма нет. Числа бонуса — в «Правилах клейма».',
    columns: [
      col('id', 'id'), col('people', 'Народ', 'ref', {ref: 'peoples'}), col('blow', 'Свой тип удара', 'enum', {values: BLOWS}),
      col('label', 'В имени вещи'), col('short', 'Кратко'),
    ]},
  {id: 'markRules', label: 'Правила клейма', group: 'Вещи', ...params(() => paramRows(MARK)),
    note: 'hit — +к удару своего типа; guard — +к защите брони и щита от своего типа; share — доля своего типа в ударе «чужой» формы (гномий меч дробит на эту долю); price — × к цене; trader — доля клеймёных вещей у торговца из такого города; forge — с какого качества куёт городская кузня (город от ступени cityTier — cityQ).'},
  {id: 'items', label: 'Предметы (итог)', group: 'Вещи', key: 'id', rows: () => ITEMS.all(), computed: true,
    note: 'Что получается из формы × материала (data/items.js): итоговые числа и цена. Править — в «Формах» и «Материалах».',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('form', 'Форма', 'ref', {ref: 'forms'}), col('material', 'Материал', 'ref', {ref: 'materials'}),
      col('tier', 'Ступень', 'int'), col('slot', 'Место', 'enum', {values: SLOTS}), col('blow', 'Тип удара', 'enum', {values: BLOWS}),
      col('melee.dmg', 'Удар', 'num'), col('melee.cd', 'Пауза', 'int'), col('ranged.dmg', 'Выстрел', 'num'), col('ranged.range', 'Дальность', 'num'),
      col('armor', 'Броня', 'num'), col('block', 'Блок', 'num'), col('warmth', 'Тепло', 'num'), col('dur', 'Прочность', 'num', {infinite: true}), col('value', 'Цена', 'num'),
    ]},

  // ── Народы
  {id: 'peoples', label: 'Народы мира', group: 'Народы', key: 'id', rows: () => WORLD_PEOPLES.all(),
    note: 'Народы карты мира (data/peoples.js): когда и как приходят, как растут и расселяются, что строят.',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('race', 'Раса', 'ref', {ref: 'races'}), col('era', 'Эпоха', 'ref', {ref: ERAS}),
      col('arrive.groups', 'Групп на старте', 'int', {min: 1}), col('arrive.mode', 'Откуда приходят'),
      col('spread', 'Расселение', 'num', {min: 0}), col('growth', 'Рост', 'num', {min: 0}), col('found', 'Плотность города', 'num', {min: 0}),
      col('spacing', 'Между городами', 'int', {min: 0}), col('ores', 'Вес руд', 'num', {min: 0}),
      col('moves', 'Проходимость', 'map', {ref: 'biomes', min: 0}), col('movesElse', 'Прочие биомы', 'num', {min: 0}),
      col('site', 'Место города', 'map', {ref: keysOf({water: 1, coast: 1, fert: 1, trees: 1, ores: 1, steep: 1})}),
      col('taste', 'Вкус построек', 'map', {ref: keysOf(TOWN_FX), min: 0}),
      col('density', 'Плотность расселения', 'num', {min: 0, note: 'под асимметрию: сколько народа помещается на клетку (гномы кучно, эльфы и орки вольготно); пока не действует'}),
      col('color', 'Цвет', 'color'),
    ]},
  {id: 'townBuildings', label: 'Постройки городов', group: 'Народы', key: 'id', rows: () => TOWN_BUILDINGS.all().map(b => ({...b, tech: techOfBuilding(b.id)})),
    target: (r, c) => [TOWN_BUILDINGS.get(r.id), c.key],
    note: 'Постройки городов карты мира (data/townBuildings.js). Столбец «Кто строит» — основа расовых построек.',
    columns: [
      col('id', 'id'), col('name', 'Название'), col('cat', 'Категория', 'enum', {values: CATEGORIES}), col('tier', 'Ступень', 'int', {min: 0, max: 2}),
      col('peoples', 'Кто строит', 'ids', {ref: 'peoples', note: 'пусто — все'}),
      col('tech', 'Технология', 'ref', {ref: 'techs', computed: true, note: 'держава должна её найти (таблица «Технологии»); пусто — знают все'}),
      col('pop', 'Жителей от', 'int', {min: 0}), col('capital', 'Только столица', 'bool'), col('unique', 'Одна на державу', 'bool'), col('max', 'Сколько', 'int', {min: 1}),
      col('needs', 'Нужно место', 'ids', {ref: keysOf(PLACE_NEEDS)}), col('needsAny', 'Нужно одно из', 'ids', {ref: keysOf(PLACE_NEEDS)}),
      col('requires', 'Нужны постройки', 'ids', {ref: 'townBuildings'}), col('requiresAny', 'Нужна одна из', 'ids', {ref: 'townBuildings'}),
      col('fx', 'Даёт', 'map', {ref: keysOf(TOWN_FX)}), col('local', 'На локальной карте', 'ref', {ref: BUILDINGS}), col('site', 'Вне города', 'bool', {note: 'стоит в своей клетке рядом с городом: поля, пастбища, шахты'}), col('notable', 'В летопись', 'bool'),
    ]},

  {id: 'techs', label: 'Технологии', group: 'Народы', key: 'id', rows: () => TECHS.all(),
    note: 'Список, не дерево (data/tech.js): что технология включает из уже существующего — постройки городов и металлы кузнецов. Доступность — за расой (народом), открытие — за державой: держава находит её, когда её города доросли и построили нужное. Чего нет ни в одной технологии, знают все.',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('note', 'Что даёт'),
      col('races', 'Кому доступна', 'ids', {ref: 'peoples', note: 'народы, которые вообще могут её знать; пусто — все'}),
      col('era', 'С эпохи', 'ref', {ref: ERAS}), col('requires', 'Нужно знать', 'ids', {ref: 'techs'}),
      col('tier', 'Ступень города', 'int', {min: 0, max: 2}), col('needsAny', 'Нужна постройка', 'ids', {ref: 'townBuildings', note: 'одна из них в каком-нибудь городе державы'}),
      col('chance', 'Шанс в год', 'num', {min: 0, max: 1, note: 'когда условия выполнены; пусто — по «Правилам технологий»'}),
      col('opens.buildings', 'Открывает постройки', 'ids', {ref: 'townBuildings'}), col('opens.materials', 'Открывает металлы', 'ids', {ref: 'materials'}),
    ]},
  {id: 'techRules', label: 'Правила технологий', group: 'Народы', ...params(() => paramRows(TECH_RULES)),
    note: 'chance — шанс в год найти технологию, когда условия выполнены (если у неё нет своего); inherit — держава раскола сохраняет то, что знала старая.'},

  // ── Караван
  {id: 'caravanBuildings', label: 'Постройки обоза', group: 'Караван', key: 'id',
    target: (r, c) => (c.key === 'fx' ? [CAMP_FX, r.id] : [BUILDINGS.get(r.id), c.key]),
    rows: () => BUILDINGS.filter(b => b.portable).map(b => ({id: b.id, name: b.name, cost: b.cost, work: b.work, fx: CAMP_FX[b.id] || {}, field: Object.keys(b.cost).every(r => r === 'wood')})),
    note: 'Что повозка везёт в разобранном виде (data/buildings.js `portable`, data/transport.js CAMP_FX). Караван ничего не изобретает: остальное покупается.',
    columns: [
      col('id', 'id'), col('name', 'Название'), col('cost', 'Цена', 'map', {ref: RESOURCES, min: 0}), col('work', 'Труд', 'int', {min: 0}),
      col('fx', 'На стоянке', 'map', {ref: keysOf({heal: 1, forage: 1, shelter: 1, build: 1}), min: 0, note: 'лечение ×, пища ×, голод ×, постройка повозок ×'}),
      col('field', 'Можно собрать в поле', 'bool', {computed: true, note: 'только из дерева'}),
    ]},
  {id: 'caravanTransport', label: 'Транспорт', group: 'Караван', key: 'id',
    target: (r, c) => [BEASTS[r.id] || VEHICLES[r.id], c.key],
    rows: () => [...Object.entries(BEASTS).map(([id, b]) => ({id, what: 'зверь', ...b})), ...Object.entries(VEHICLES).map(([id, v]) => ({id, what: 'повозка', ...v}))],
    note: 'Вьючные и верховые звери, тележки и повозки каравана (data/transport.js).',
    columns: [
      col('id', 'id'), col('what', 'Что', 'text', {edit: false}), col('label', 'Название'), col('use', 'Для чего'), col('cells', 'Мест', 'int', {min: 0}), col('boxes', 'Ящиков', 'int', {min: 0}),
      col('pulls', 'Тянет', 'num', {min: 0}), col('tool', 'Нужен металл', 'int', {min: 0}), col('logs', 'Брёвен', 'int', {min: 0}), col('days', 'Дней на сборку', 'int', {min: 0}),
      col('pull', 'Кто тянет'), col('haul', 'Темп ×', 'num', {min: 0}), col('building', 'Везёт построек', 'int', {min: 0}),
    ]},

  // ── Мир
  {id: 'biomes', label: 'Биомы', group: 'Мир', key: 'id', rows: () => BIOMES.all(),
    note: 'Природные зоны, высотные пояса и особые места (data/biomes.js).',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('kind', 'Вид', 'enum', {values: BIOME_KINDS}), col('koppen', 'Кёппен'),
      col('trees', 'Лес', 'num', {min: 0, max: 1}), col('fert', 'Плодородие', 'num', {min: 0}), col('rock', 'Камень', 'num', {min: 0, max: 1}),
      col('pools', 'Водоёмы', 'num', {min: 0, max: 1}), col('dry', 'Сухость', 'num', {min: 0}), col('ground', 'Почва'), col('color', 'Цвет', 'color'), col('note', 'Описание'),
    ]},
  {id: 'lairs', label: 'Логова', group: 'Мир', key: 'id', rows: () => LAIRS.all(),
    note: 'Логова чудовищ карты мира (data/lairs.js): кто живёт, где, как плодится и с кем враждует. С 30 лет логово древнее — там будут главари.',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('species', 'Хозяин', 'ref', {ref: SPECIES}), col('flies', 'Летает', 'bool'), col('ground', 'Место'),
      col('radius', 'Владения', 'num', {min: 0}), col('density', 'Плотность', 'num', {min: 0}), col('max', 'Логов в мире', 'int', {min: 0}),
      col('breed', 'Плодится', 'num', {min: 0, max: 1}), col('rivals', 'Соперники', 'ids', {ref: 'lairs'}), col('color', 'Цвет', 'color'),
    ]},
  {id: 'lairRules', label: 'Правила логов', group: 'Мир', ...params(() => paramGroups({age: LAIR_AGE, leader: LEADER, tribeHome: TRIBE_HOME, tribeRaid: TRIBE_RAID, rot: ROT})),
    note: 'Возраст древнего логова (age.ancient), главари древних логов (leader.*: шанс, потолок 30, рост сверх вида, годы жизни, планы, сила, дань), набеги племён, гниль (data/lairs.js). «Дом племени» — постоянное число кода: видно, но не правится.'},
  {id: 'calamities', label: 'Катаклизмы', group: 'Мир', key: 'id', rows: () => CALAMITIES,
    note: 'Бедствия эпического мира (data/calamities.js): босс, его логова, свита и эпохи.',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('boss', 'Босс', 'ref', {ref: SPECIES}), col('lair', 'Логово босса', 'ref', {ref: 'lairs'}),
      col('lairs', 'Логова', 'ids', {ref: 'lairs'}), col('retinue', 'Свита', 'ids'), col('eras', 'Эпохи', 'ids', {ref: ERAS}), col('names', 'Имена', 'ids'),
    ]},
];

// the name lists are copied into what the game reads at load (a race's [name, gender] pairs, a beast's tame names, a
// calamity's boss names): after an edit they are put there again, in place
function rebuildNames() {
  for (const sp of SPECIES.all()) {
    if (sp.names && PERSON[sp.id]) { sp.names.length = 0; sp.names.push(...personNames(sp.id)); }
    if (sp.tame?.names && PET[sp.id]) sp.tame.names = PET[sp.id];
  }
  for (const c of CALS) if (BOSS[c.id]) c.names = BOSS[c.id];
}
void TITLE;

export const tableById = id => TABLES.find(t => t.id === id);
export const checkAll = () => checkTables(TABLES);
