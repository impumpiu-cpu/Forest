// Every table of the game as the screen «Настройки → Таблицы» shows it and `npm test` checks it
// (src/data/schema/columns.js says what a schema and a column are; docs/TABLES.md).
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
import {STATS} from '../special.js';
import {CURVES, CURVE_GROUPS, SHAPES, curveAt} from '../curves.js';
import {BIOMES, BIOME_KINDS, RARITY} from '../biomes.js';
import {MATERIALS, FORMS, PRICES} from '../balance/index.js';
import {BLOWS, DAMAGE_TYPES, DAMAGE_KINDS, DELIVERY, WEAPON_QUALITIES} from '../balance/combat.js';
import {BODY_PLANS, HIT_LOCATIONS, planOf} from '../anatomy.js';
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
import {BASE_MODS, rebuildBaseMods} from '../traits.js';
import {CREATURE_MODS, COLONY_MODS, MOD_HOWS, COLONY_KINDS, effectErrors} from '../mods.js';
import {TAGS, TAG_ON, hasTag, tagIds} from '../tags.js';
import {autoTable, objectTable} from './auto.js';
import {BEHAVIOURS, BAND_LABELS} from '../behaviours.js';
import {creatureSheet, recipeSheet, buildingSheet} from './sheets.js';
import * as COLONY from '../colony.js';
import * as BEHAVIOUR from '../behaviour.js';
import * as NATURE from '../nature.js';
import {LAIR_LIFE} from '../lairs.js';
import {TOWN_LIFE, TOWN_WAR, SCHISM, CAPITAL} from '../peoples.js';
import {TOWN_FX as TOWN_WORK, PLACE_AT} from '../townBuildings.js';
import {CAL, ALLY, EPIC} from '../calamities.js';
import {FAUNA, FREE, EPIC_YEARS} from '../history.js';
import {ARMY, DRAGON, PARTIES} from '../parties.js';
import {ROADS, SEA} from '../roads.js';
import {NET, SITES} from '../sites.js';
import {SEAM, FLORA, OUTLAWS} from '../seam.js';
import {SHAPE} from '../atlas.js';
import {EROSION, RIVERS} from '../hydrology.js';
import {CAMPAIGN as CAMP_RULES, GAME, MINE, NIGHT} from '../campaign.js';
import {QUEST} from '../quest.js';
import {MARKET, VISIT, LOYALTY, CONTRACT, COMPANIONS, FREED, HIRES, SMITH, EARN} from '../market.js';
import {BUBBLE, THINGS, AMBUSH, HERD as GAME_HERD, TRAIN} from '../bubble.js';
import {CAMP, CAMP_FOES, GAME_FLOW} from '../camp.js';
import {CAPTIVE, ESCAPE, FREEDOM} from '../captives.js';
import {SLAVE} from '../slavery.js';
import {GETTING, FODDER, ROUTE, WHEELS} from '../transport.js';
import {TRADE as COLONY_TRADE} from '../trade.js';
import {LEARN, SKILLS, TIERS} from '../skills.js';
import {MASTER, MASTERS} from '../masters.js';
import {CRIT, DEATHBLOW, WOUNDS} from '../wounds.js';
import {CONDITIONS, CONDITION_KINDS, EXHAUSTION} from '../conditions.js';
import {ARRIVALS, MIGRATIONS} from '../migrations.js';
import {CAMPAIGN as PRICE_CAMPAIGN, SERVICES, TRADE as PRICE_TRADE, QUALITY as PRICE_QUALITY, RESOURCES as RESOURCE_PRICES} from '../balance/prices.js';
import {COMBAT, CAPS, SCALE_MODS, DEFAULT_BLOW} from '../balance/combat.js';
import {RULES} from '../balance/rules.js';
import {STRENGTH} from '../balance/creatures.js';
import {JOBS} from '../jobs.js';
import {RECIPES} from '../recipes.js';
import {DIFFICULTY, DEGREES, DEGREE_NAMES, DEGREE_CHECKS, DEGREE_EFFECTS} from '../checks.js';
import {CHANCE_MODES} from '../chance.js';
import {AFFLICTIONS, AFFLICTION_FROM, ADDICTION, TAINT, stagesErrors} from '../afflictions.js';
import {LANGUAGES, SPEAKS, SENSES, TONGUE, NIGHT as NIGHT_SIGHT} from '../tongues.js';
import {REPUTATION, PACES, PACE_RULES, TERMS} from '../road.js';
import {SETTLEMENT_STATS} from '../colonyStats.js';
import {REALM_STATS, RUINS, RUIN_RULES, UPKEEP, EDICTS, OFFICES, COURT, REALM_EVENTS, EVENTS_RULE, FEEDBACK, MARKET_TIERS, whenErrors, levelsErrors} from '../kingdom.js';
import {FINDS} from '../campaign.js';
import {NEEDS} from '../needs.js';
import {THOUGHTS} from '../thoughts.js';
import {TRAITS} from '../traits.js';
import {FOODS} from '../foods.js';
import {CROPS} from '../crops.js';
import {PLANTS} from '../plants.js';
import {FURNITURE} from '../furniture.js';
import {SEASONS, SEASON_DAYS, THAW} from '../seasons.js';
import {TERRAIN, rebuildTerrain} from '../terrain.js';
import {ORES} from '../ores.js';
import {PLATE_COUNTS, BOUNDARIES, ROCKS, ROCK_KINDS, ORE_GENESIS} from '../geology.js';
import {WIND_BELTS, MOISTURE} from '../climate.js';
import {REGIONS, REGION_SHIFT} from '../regions.js';
import {FACTIONS} from '../factions.js';
import {NEIGHBOURS} from '../neighbours.js';
import {LUXURY} from '../luxury.js';
import {RAID_BANDS} from '../raids.js';
import {SOILS} from '../soils.js';
import {KIND_LAND, KIND_GROVES} from '../kinds.js';

export {checkTables, get, editable, targetOf, valueErrors, resolver} from './columns.js';

export const GROUPS = ['Словари', 'Существа', 'Отношения', 'Вещи', 'Народы', 'Караван', 'Поселение', 'Мир'];

// the letters the sheet «SPECIAL (итог)» shows: a human's range, the sturdy races', and the beasts' beyond
const SHEET_X = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 30, 50, 80];
const keysOf = obj => ({has: k => Object.prototype.hasOwnProperty.call(obj, k)});
const MINDS = {beast: 'зверь', semi: 'полуразумный', sentient: 'разумный'};
const SLOTS = {hand: 'рука', body: 'тело', back: 'спина'};
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

// a `mods` set of a creature (a trait, a wound, a race): keys from «Модификаторы существа»
const MODS_COL = {type: 'map', ref: 'creatureMods', label: 'Модификаторы'};
// an `effects` set of the colony (a building, a tame animal, a key in the stock) against «Модификаторы поселения»
const families = resolve => name => (name === 'resources' ? RESOURCES : name === 'jobs' ? JOBS : resolve?.(name) ?? null);
const EFFECTS_COL = {type: 'json', label: 'Эффекты', note: 'add, mul, yield, jobSpeed, toolWear, best — ключи из «Модификаторов поселения»', check: (v, resolve) => effectErrors(v, families(resolve))};
// who carries a tag, for the table «Теги»
const carriers = t => {
  const pool = t.on === 'resource' ? RESOURCES.all() : t.on === 'item' ? ITEMS.all() : SPECIES.all();
  return pool.filter(x => hasTag(x, t.id)).map(x => x.id);
};

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
      col('mods', 'Множители', 'map', {ref: 'creatureMods', note: 'голод, холод, сон… — ключи из «Модификаторов существа»'}),
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
      col('id', 'id'), col('kind', 'Вид', 'enum', {values: KINDS}), col('mind', 'Разум', 'enum', {values: MINDS}),
      col('behaviours', 'Поведения', 'ids', {ref: BEHAVIOURS, note: 'что умеет (agents/behaviours/, таблица «Поведения»): порядок — порядок выбора'}),
      col('label', 'Название', 'text'), col('labelAcc', 'Кого (вин. п.)', 'text', {nullable: true}), col('plural', 'Мн. число', 'text', {nullable: true}), col('legend', 'В легенде', 'text', {nullable: true}),
      col('look.shape', 'Облик', 'text', {note: 'рисовальщик render/looks.js: person, hare, wolf, deer, boar, bear… (конструктор существ показывает список)'}),
      col('look.size', 'Размер облика', 'num', {min: 0.1, max: 2}), col('look.color', 'Цвет', 'color'), col('look.skin', 'Цвет кожи', 'color', {nullable: true}),
      col('heart', 'Думает раз в', 'int', {min: 1, note: 'тиков между раздумьями ума tabled; тревоги смотрит каждый тик (пусто — каждый тик)'}),
      col('habitat', 'Биомы обитания', 'map', {ref: 'biomes', values: RARITY, note: 'как часто встречается: часто · обычно · редко · очень редко'}),
      ...body,
      col('weakTo', 'Боится', 'ids'), col('relativeStats', 'Статы типичного зверя', 'bool'), col('nocturnal', 'Ночной', 'bool'), col('undead', 'Без жизни', 'bool'),
    ]},
  // the behaviours a species row may list (agents/behaviours/): code, shown for reference
  {id: 'behaviours', label: 'Поведения', group: 'Существа', key: 'id', computed: true, rows: () => BEHAVIOURS.all(),
    note: 'Что может делать существо с умом tabled (data/behaviours.js, код в agents/behaviours/, docs/BEHAVIOUR.md). Полоса: рефлекс > красная > жёлтая > очередь дел — первая, где есть что выбрать, прерывает остальные. «Читает» — поля строки вида, без которых поведение не записать.',
    columns: [col('id', 'id'), col('band', 'Полоса', 'enum', {values: BAND_LABELS}), col('task', 'Своя задача', 'json', {note: 'пусто — задача под id поведения; false — предлагает чужую; слово — задача под этим id'}), col('keep', 'Держится', 'num'), col('requires', 'Читает', 'ids'), col('note', 'Описание')]},
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
  {id: 'curves', label: 'Кривые', group: 'Существа', key: 'id', rows: () => CURVES.all(),
    // a curve must give a finite number at every letter 0–100 (a shape without its numbers, pivot 0 for a division)
    rowCheck: r => { for (let x = 0; x <= 100; x++) if (!Number.isFinite(curveAt(r, x))) return [`при букве ${x} кривая даёт ${curveAt(r, x)}: проверьте форму и её числа`]; return []; },
    note: 'Как буква SPECIAL становится числом игры (data/curves.js): действие SPECIAL (урон, здоровье, холод, меткость, обзор, скорость, пауза удара, учёба, уклонение, обаяние), удача (крит, пережить смертельную рану, уйти без увечья), кровотечение упавшего, темп и потолок навыка. Три формы: прямая base + per × (X − pivot), степень (X / pivot)^pow, насыщение base + per × X / (X + pivot); затем границы min…max (пусто — без границы). При 5 множитель — 1, прибавка — 0. Значения при каждой букве — в «SPECIAL (итог)».',
    columns: [
      col('id', 'id'), col('group', 'Группа', 'enum', {values: CURVE_GROUPS, edit: false}), col('label', 'Что'),
      col('stat', 'Буква', 'ref', {ref: STATS, note: 'чья буква; у навыков — буква самого навыка'}), col('shape', 'Форма', 'enum', {values: SHAPES}),
      col('base', 'base', 'num'), col('per', 'per', 'num'), col('pivot', 'pivot', 'num'), col('pow', 'pow', 'num'),
      col('min', 'min', 'num', {nullable: true, note: 'пусто — без нижней границы'}), col('max', 'max', 'num', {nullable: true, note: 'пусто — без верхней'}),
      col('unit', 'Единица', 'text', {edit: false}), col('note', 'Описание'),
    ]},
  {id: 'specialSheet', label: 'SPECIAL (итог)', group: 'Существа', key: 'x', computed: true,
    rows: () => SHEET_X.map(x => Object.fromEntries([['x', x], ...CURVES.all().map(c => [c.id, Math.round(curveAt(c, x) * 1000) / 1000])])),
    note: 'Каждая кривая при каждой букве (вычисляется из «Кривых»): строка — значение буквы, столбец — кривая. Человек живёт в 1–10, крепкие расы доходят до 15, зверь — дальше (Сила дракона ~80).',
    columns: [col('x', 'Буква', 'num'), ...CURVES.all().map(c => col(c.id, `${c.label}${c.stat ? ` (${c.stat})` : ''}`, 'num', {note: c.note}))]},
  {id: 'tiers', label: 'Тиры действий', group: 'Существа', key: 'id', rows: () => TIERS,
    note: 'С какой буквы навыка открыт тир действия (data/skills.js TIERS, docs/RULES.md): T1 — всем, жёсткий запрет — только с T2.',
    columns: [col('id', 'Тир', 'int'), col('label', 'Название'), col('min', 'Буква от', 'int', {min: 0})]},

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
      col('weight', 'Тяжесть ×', 'num', {min: 0}), col('color', 'Цвет', 'color'), col('qualities', 'Свойства оружия', 'map', {ref: 'weaponQualities', min: 0, note: 'пробивное, жестокое, длинное… (словарь «Свойства оружия»)'}),
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
      col('tradeOnly', 'Только у торговцев', 'bool'), col('qualities', 'Свойства оружия', 'map', {ref: 'weaponQualities', min: 0, note: 'пробивное, жестокое, длинное… (словарь «Свойства оружия»)'}), col('name', 'Имя из материала', 'formula'),
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
      col('tier', 'Ступень', 'int'), col('slot', 'Место', 'enum', {values: SLOTS}), col('hands', 'Рук', 'int', {note: '1 — одноручное (вторая рука свободна: щит, вторая вещь), 2 — двуручное; у брони и плаща пусто'}), col('blow', 'Тип удара', 'enum', {values: BLOWS}),
      col('melee.dmg', 'Удар', 'num'), col('melee.cd', 'Пауза', 'int'), col('ranged.dmg', 'Выстрел', 'num'), col('ranged.range', 'Дальность', 'num'),
      col('armor', 'Броня', 'num'), col('block', 'Блок', 'num'), col('warmth', 'Тепло', 'num'), col('dur', 'Прочность', 'num', {infinite: true}), col('value', 'Цена', 'num'),
      col('qualities', 'Свойства оружия', 'map', {ref: 'weaponQualities', note: 'формы и материала вместе'}),
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
      col('id', 'id'), col('name', 'Название', 'text', {edit: false, note: 'правится в «Постройках поселения»'}), col('cost', 'Цена', 'map', {ref: RESOURCES, min: 0, edit: false, note: 'правится в «Постройках поселения»'}), col('work', 'Труд', 'int', {min: 0, edit: false, note: 'правится в «Постройках поселения»'}),
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
      col('tribe', 'Племя', 'bool'), col('riders', 'Верхом на', 'ref', {ref: SPECIES, note: 'на ком ездят налётчики племени'}), col('rotAt', 'Гниль для жизни', 'num', {min: 0, max: 1, note: 'мёртвым: сколько гнили нужно, чтобы держаться'}),
      col('spawn', 'Приходит сам', 'num', {min: 0, max: 1, note: 'шанс в год появиться в истории (мёртвые, разломы)'}), col('drinks', 'Пьёт город', 'num', {min: 0, max: 1, note: 'вампир: доля жителей за осень при полной силе'}), col('might', 'Сила набега', 'num', {min: 0}),
    ]},
  {id: 'lairRules', label: 'Правила логов', group: 'Мир', ...params(() => paramGroups({age: LAIR_AGE, leader: LEADER, tribeHome: TRIBE_HOME, tribeRaid: TRIBE_RAID, rot: ROT})),
    note: 'Возраст древнего логова (age.ancient), главари древних логов (leader.*: шанс, потолок 30, рост сверх вида, годы жизни, планы, сила, дань), набеги племён, гниль (data/lairs.js). «Дом племени» — постоянное число кода: видно, но не правится.'},
  {id: 'calamities', label: 'Катаклизмы', group: 'Мир', key: 'id', rows: () => CALAMITIES,
    note: 'Бедствия эпического мира (data/calamities.js): босс, его логова, свита и эпохи. Имена боссов — в таблице «Имена боссов».',
    columns: [
      col('id', 'id'), col('label', 'Название'), col('boss', 'Босс', 'ref', {ref: SPECIES}), col('lair', 'Логово босса', 'ref', {ref: 'lairs'}),
      col('lairs', 'Логова', 'ids', {ref: 'lairs'}), col('retinue', 'Свита', 'ids'), col('eras', 'Эпохи', 'ids', {ref: ERAS}),
      col('title', 'Титул (им., род.)', 'json'), col('g', 'Род', 'enum', {values: ['m', 'f', 'n']}), col('town', 'В городе', 'bool'), col('rise', 'Строка восхода', 'text'),
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


// ── the rest of the data (docs/TABLES.md): every number the game runs on has a
// table. Settings objects as parameter tables, lists of rows (registries) as tables made from the rows themselves.
const grp = groups => params(() => paramGroups(groups));
const kindsOf = mod => Object.fromEntries(Object.entries(mod).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)));
TABLES.push(
  // Мир
  {id: 'worldLife', label: 'Жизнь логов и городов', group: 'Мир', note: 'Как логова набирают и теряют силу, плодятся и дерутся (data/lairs.js LAIR_LIFE); как растут и строятся города (data/peoples.js TOWN_LIFE, TOWN_WAR, SCHISM, CAPITAL; data/townBuildings.js TOWN_FX — дома, сила, нужды; PLACE_AT — что нужно месту постройки).',
    ...grp({lairLife: LAIR_LIFE, townLife: TOWN_LIFE, townWar: TOWN_WAR, schism: SCHISM, capital: CAPITAL, townFx: TOWN_WORK, placeAt: PLACE_AT})},
  {id: 'calamityRules', label: 'Правила бедствий', group: 'Мир', note: 'Бедствия эпического и заселённого мира (data/calamities.js CAL), союзы против них (ALLY), квест похода за артефактом (EPIC), длина эпох эпического мира (data/history.js EPIC_YEARS), «Заселение мира» (FREE).',
    ...grp({cal: CAL, ally: ALLY, epic: EPIC, epicYears: EPIC_YEARS, free: FREE})},
  {id: 'historyRules', label: 'История мира', group: 'Мир', note: 'Звери карты мира (data/history.js FAUNA), войска и драконы (data/parties.js), дороги и морские пути (data/roads.js), угодья и сеть подвоза (data/sites.js), шов карты мира и поселения (data/seam.js).',
    ...grp({fauna: FAUNA, army: ARMY, dragon: DRAGON, parties: PARTIES, roads: ROADS, sea: SEA, net: NET, sites: SITES, seam: SEAM, flora: FLORA, outlaws: OUTLAWS})},
  {id: 'landRules', label: 'Создание земли', group: 'Мир', note: 'Пределы руки на экране «Создать землю» (data/atlas.js SHAPE), эрозия и реки генератора (data/hydrology.js).',
    ...grp({shape: SHAPE, erosion: EROSION, rivers: RIVERS})},
  objectTable({id: 'soilsAuto', label: 'Почвы', group: 'Мир', note: 'Почвы карты мира (data/soils.js).', obj: () => Object.fromEntries(SOILS.all().map(x => [x.id, x]))}),
  // Поход
  {id: 'campaignRules', label: 'Правила похода', group: 'Караван', note: 'Поход каравана (data/campaign.js CAMPAIGN, GAME, MINE), ночные опасности (NIGHT), квест (data/quest.js QUEST).',
    ...grp({campaign: CAMP_RULES, game: GAME, mine: MINE, night: NIGHT, quest: QUEST})},
  {id: 'marketRules', label: 'Город и рынок', group: 'Караван', note: 'Город для каравана: рынок, визит, верность, найм, кузнец, заработок (data/market.js). Цены — в «Ценах».',
    ...grp({market: MARKET, visit: VISIT, loyalty: LOYALTY, contract: CONTRACT, companions: COMPANIONS, freed: FREED, hires: HIRES, smith: SMITH, earn: EARN})},
  {id: 'bubbleRules', label: 'Дорога и стоянки', group: 'Караван', note: 'Что встречает караван в пути (data/bubble.js), стоянки и бои на локальной карте (data/camp.js), пленники и рабство (data/captives.js, data/slavery.js), обоз (data/transport.js).',
    ...grp({bubble: BUBBLE, things: THINGS, ambush: AMBUSH, herd: GAME_HERD, train: TRAIN, camp: CAMP, campFoes: CAMP_FOES, flow: GAME_FLOW, captive: CAPTIVE, escape: ESCAPE, freedom: FREEDOM, slave: SLAVE, getting: GETTING, fodder: FODDER, route: ROUTE, wheels: WHEELS})},
  // Поселение
  {id: 'colonyRules', label: 'Жизнь поселения', group: 'Поселение', note: 'Отношения, жизнь, лечение, стада, угроза, план дня, горн, доска работ и дозор, общие дела, золотые жилы (data/colony.js); караваны торговцев (data/trade.js TRADE).',
    ...grp({...kindsOf(COLONY), trade: COLONY_TRADE})},
  {id: 'behaviourRules', label: 'Повадки существ', group: 'Поселение', note: 'Отряды, туши и стаи, дикие стада, трофеи, вредители, распорядок поселенца, сон и тепло у огня (REST), поджог и тушение (KINDLE), выбор снаряжения (GEAR), вред от жара (HEAT) (data/behaviour.js); приход зверей на карту (data/migrations.js ARRIVALS).',
    ...grp({...kindsOf(BEHAVIOUR), arrivals: ARRIVALS})},
  {id: 'natureRules', label: 'Природа карты', group: 'Поселение', note: 'Огонь, снег, рыбалка, рост ягод, огородов, кустов и леса (GROWTH) локальной карты (data/nature.js); что даёт земля из видов материалов (data/kinds.js KIND_LAND), где мастера работают особое дерево (KIND_GROVES).',
    ...grp({...kindsOf(NATURE), kindLand: KIND_LAND, kindGroves: KIND_GROVES})},
  {id: 'growthRules', label: 'Навыки, мастера, раны', group: 'Поселение', note: 'Как учатся навыки (data/skills.js LEARN), мастера (data/masters.js MASTER), крит и смертельный удар (data/wounds.js).',
    ...grp({learn: LEARN, master: MASTER, crit: CRIT, deathblow: DEATHBLOW})},
  autoTable({id: 'jobs', label: 'Работы', group: 'Поселение', note: 'Работы поселенцев (data/jobs.js): сколько несут, сколько длится, что дают.', rows: () => JOBS.all()}),
  fix(autoTable({id: 'recipes', label: 'Рецепты', group: 'Поселение', note: 'Ремесло (data/recipes.js): где делают, из чего, сколько работы, что выходит.', rows: () => RECIPES.all()}), {'makes.item': {type: 'ref', ref: ITEMS}, 'makes.resource': {type: 'ref', ref: RESOURCES}, at: {type: 'ref', ref: 'buildings'}, work: {type: 'num', min: 0}}),
  autoTable({id: 'needs', label: 'Нужды', group: 'Поселение', note: 'Нужды существ (data/needs.js).', rows: () => NEEDS.all()}),
  autoTable({id: 'thoughts', label: 'Мысли', group: 'Поселение', note: 'Мысли поселенцев и их вес в настроении (data/thoughts.js).', rows: () => THOUGHTS.all()}),
  autoTable({id: 'traits', label: 'Черты', group: 'Поселение', note: 'Черты характера (data/traits.js).', rows: () => TRAITS.all(), whole: {mods: MODS_COL}}),
  autoTable({id: 'skills', label: 'Навыки', group: 'Поселение', note: 'Навыки (data/skills.js).', rows: () => SKILLS.all()}),
  autoTable({id: 'masters', label: 'Мастера', group: 'Поселение', note: 'Мастера ремёсел (data/masters.js).', rows: () => MASTERS.all()}),
  fix(autoTable({id: 'conditions', label: 'Состояния', group: 'Существа', rows: () => CONDITIONS.all(), whole: {mods: MODS_COL},
    note: 'Всё, что с существом не так на время или навсегда (data/conditions.js), как состояния и истощение в D&D: тяжёлая рана и травмы (agent.wounds), без сознания, отравлен, в паутине, кровотечение, оглушён, во хмелю (поле существа), три ступени истощения (сколько нужд на исходе). mods — что делает с телом (ключи «Модификаторов существа»); у истощения пока пусто — готово под числа.'}),
  {kind: {type: 'enum', values: CONDITION_KINDS, edit: false}, where: {edit: false}, stage: {edit: false}, days: {type: 'num', min: 0}, weight: {type: 'num', min: 0},
    dmg: {type: 'num', min: 0}, ticks: {type: 'int', min: 0}, slow: {type: 'num', min: 0}, hp: {type: 'num', min: 0}}),
  {id: 'conditionRules', label: 'Истощение: правила', group: 'Существа', ...grp({exhaustion: EXHAUSTION}),
    note: 'Нужда на этом уровне или ниже (exhaustion.low) считается к истощению; какие нужды (needs).'},
  autoTable({id: 'foods', label: 'Еда', group: 'Поселение', note: 'Еда и блюда (data/foods.js): сытость, порча.', rows: () => FOODS.all()}),
  autoTable({id: 'crops', label: 'Посевы', group: 'Поселение', note: 'Посевы полей (data/crops.js).', rows: () => CROPS.all()}),
  autoTable({id: 'plants', label: 'Растения', group: 'Поселение', note: 'Дикие растения карты (data/plants.js).', rows: () => PLANTS.all()}),
  autoTable({id: 'furniture', label: 'Мебель', group: 'Поселение', note: 'Мебель и её уют (data/furniture.js).', rows: () => FURNITURE.all()}),
  autoTable({id: 'luxury', label: 'Роскошь', group: 'Поселение', note: 'Украшения ювелира (data/luxury.js).', rows: () => LUXURY.all()}),
  autoTable({id: 'migrations', label: 'Приходы', group: 'Поселение', note: 'Кто и когда приходит на карту поселения (data/migrations.js).', rows: () => MIGRATIONS.all()}),
  autoTable({id: 'raidBands', label: 'Отряды налётчиков', group: 'Поселение', note: 'Налётчики на поселение (data/raids.js).', rows: () => RAID_BANDS.all(), skip: ['chance']}),
  autoTable({id: 'speciesWays', label: 'Повадки видов', group: 'Существа', note: 'Всё прочее о видах (data/species.js, data/bestiary.js, data/races.js): охота хищников, приручение, вьюк, бегство, приход, добыча с туши, яд, паутина… Тело, статы и биомы — в «Существах» и «Расах».',
    rows: () => SPECIES.all(), skip: ['label', 'kind', 'mind', 'brain', 'behaviours', 'heart', 'habitat', 'resist', 'weakTo', 'relativeStats', 'nocturnal', 'undead', 'special', 'hp', 'speed', 'attack', 'look', 'names', 'peoples', 'home', 'align', 'values', 'mods', 'perks', 'innate', 'plural', 'labelAcc', 'killMessage', 'ks']}),
  // Цены и бой
  {id: 'priceRules', label: 'Цены: правила', group: 'Вещи', note: 'Цены вещей (items: труд мастера, надбавка за защиту, редкость материала, округление), похода, услуг, торговли и качества (data/balance/prices.js ITEMS, CAMPAIGN, SERVICES, TRADE, QUALITY); правка пересобирает «Предметы (итог)». Цены ресурсов — в «Ценах ресурсов».',
    ...grp({items: PRICES.ITEMS, campaign: PRICE_CAMPAIGN, services: SERVICES, trade: PRICE_TRADE, quality: PRICE_QUALITY}), after: rebuildItems},
  {...objectTable({id: 'resourcePrices', label: 'Цены ресурсов', group: 'Вещи', note: 'Цена и размер стопки каждого ресурса (data/balance/prices.js RESOURCES).', obj: () => RESOURCE_PRICES}), after: rebuildItems},
  {id: 'combatRules', label: 'Бой и сила', group: 'Вещи', note: 'Числа боя (data/balance/combat.js COMBAT, CAPS, SCALE_MODS, DEFAULT_BLOW), правила баланса вещей (data/balance/rules.js RULES), рейтинг силы (data/balance/creatures.js STRENGTH).',
    ...grp({combat: COMBAT, caps: CAPS, scaleMods: SCALE_MODS, defaultBlow: DEFAULT_BLOW, rules: RULES, strength: STRENGTH})},
);

// ── the last of the data without a table (docs/TABLES.md): the local map's ground, seasons, ores and regions,
// who is whose enemy and who lives beyond the edge; the world map's plates, rocks, ores and winds.
// `fix` closes columns the code keys by (a code stored in the grid and in saves) and gives others their `ref`.
function fix(t, cols) { return {...t, columns: t.columns.map(c => (cols[c.key] ? {...c, ...cols[c.key]} : c))}; }
const CODE = {edit: false, note: 'код в сетке и в сохранениях: не правится'};
const GENESIS_FIELDS = keysOf({coll: 1, arc: 1, basv: 1, volc: 1, oldv: 1, craton: 1, low: 1, warm: 1});
TABLES.push(
  // Поселение
  fix(autoTable({id: 'terrain', label: 'Рельеф', group: 'Поселение', after: rebuildTerrain, rows: () => TERRAIN.all(),
    note: 'Почва клетки локальной карты (data/terrain.js): проходимость, цена шага и скорость, топливо для огня, кусты, лес и выпас, укрытие, сырость. Цвет — формула графики. Правка — для новых карт: на идущей проходимость пересчитана сразу, а дороги и поля течения — по ходу их обновления.'}),
  {code: CODE, kind: {type: 'enum', values: ['ground', 'wood', 'rock', 'water']}, pathCost: {type: 'num', min: 0}, speed: {type: 'num', min: 0}, fuel: {type: 'num', min: 0},
    bush: {type: 'num', min: 0, max: 1}, wood: {type: 'num', min: 0, max: 1}, graze: {type: 'num', min: 0, max: 1}, wet: {type: 'num', min: 0, max: 1}}),
  fix(autoTable({id: 'seasons', label: 'Времена года', group: 'Поселение', rows: () => SEASONS.all(),
    note: 'Что меняет время года (data/seasons.js): одежда (dress), рост ягод и огорода, увядание, скорость работ (jobs.*), зайцы, голод хищников, порча еды, дожди, порог возгорания, мороз. Оттепель и календарь — в «Календаре».'}),
  {next: {edit: false}, tint: {edit: false, note: 'оттенок карты: графика'}}),
  {id: 'calendarRules', label: 'Календарь и оттепель', group: 'Поселение', ...grp({thaw: THAW, seasonDays: SEASON_DAYS}),
    note: 'Запаздывание тепла за солнцем (thaw.lag, дни), с какой температуры день морозный (thaw.frozen), с какой и за сколько градусов оживает рост (from, span), что тёплая зима оставляет от зимних правил. Длина сезона (seasonDays) — постоянная календаря, не правится.'},
  fix(autoTable({id: 'ores', label: 'Жилы руды', group: 'Поселение', rows: () => ORES.all(),
    note: 'Жилы локальной карты (data/ores.js): какой ресурс добывают, сколько в жиле, как далеко ищут, сколько её на карте. Цвета — графика.'}),
  {code: CODE, resource: {type: 'ref', ref: RESOURCES}, tier: {type: 'int', min: 0, max: 4}, tint: {edit: false}, mapColor: {edit: false}}),
  fix(autoTable({id: 'regions', label: 'Регионы', group: 'Поселение', rows: () => REGIONS.all(),
    note: 'Земля под поселением (data/regions.js), как место высадки в Dwarf Fortress: руды (ores.*: 0 — нет, 0,5 — бедно, 1 — есть, 1,6 — богато), золотой песок, рудное золото, магма, тракт, река, биомы клетки, дикие угодья (flora.*). Сдвиг уровня соседних клеток — в «Регионы: правила».'}),
  {weight: {type: 'num', min: 0}}),
  {id: 'regionRules', label: 'Регионы: правила', group: 'Поселение', ...grp({regionShift: REGION_SHIFT}),
    note: 'Насколько клетка мира сдвигает уровни своего региона (data/regions.js REGION_SHIFT) — постоянная, не правится.'},
  {id: 'factions', label: 'Стороны', group: 'Поселение', key: 'id', rows: () => FACTIONS.all(),
    note: 'Кто кому враг на локальной карте и чьим умом думают её члены (data/factions.js). Вражда несимметрична: строка — кто нападает.',
    columns: [col('id', 'id'), col('label', 'Название'), col('brain', 'Ум', 'text', {edit: false, note: 'agents/brains: код'}),
      col('hostile', 'Враждует с', 'ids', {ref: 'factions'}), col('color', 'Цвет', 'color'), col('legend', 'В легенде')]},
  fix(autoTable({id: 'neighbours', label: 'Соседи за краем', group: 'Поселение', rows: () => NEIGHBOURS.all(),
    note: 'Кто живёт за краем карты поселения (data/neighbours.js): в скольких днях пути и что оттуда приходит (flows). Пока у полигона нет мира, это заглушка.'}),
  {dist: {type: 'num', min: 0}, kind: {edit: false}}),
  // Мир
  autoTable({id: 'plates', label: 'Число плит', group: 'Мир', key: 'label', rows: () => PLATE_COUNTS,
    note: 'Сколько плит на выбор при создании земли (data/geology.js PLATE_COUNTS).'}),
  fix(autoTable({id: 'boundaries', label: 'Границы плит', group: 'Мир', rows: () => BOUNDARIES.all(),
    note: 'Виды границ плит (data/geology.js): что они строят и как о них пишет летопись. Цвет — графика.'}),
  {code: CODE, color: {edit: false}}),
  {id: 'rocks', label: 'Породы мира', group: 'Мир', key: 'id', rows: () => ROCKS.all(),
    note: 'Породы геологии мира (data/geology.js ROCKS). Где порода ложится, решает генератор (atlas/geology.js); прочность и цена камня — в «Камне».',
    columns: [col('id', 'id'), col('code', 'Код', 'int', CODE), col('kind', 'Вид', 'enum', {values: ROCK_KINDS}), col('label', 'Название'), col('color', 'Цвет', 'color'), col('note', 'Описание')]},
  {id: 'oreGenesis', label: 'Рождение руд', group: 'Мир', key: 'id', rows: () => ORE_GENESIS.all(),
    note: 'Где на карте мира ложатся руды (data/geology.js ORE_GENESIS): вес пород и условий тектоники, пороги уровней «бедно / есть / богато».',
    columns: [col('id', 'id'), col('label', 'Название'), col('region', 'Уровень региона', 'text', {edit: false}), col('from', 'Откуда', 'text', {edit: false}),
      col('rocks', 'Породы', 'map', {ref: ROCKS, min: 0}), col('settings', 'Условия', 'map', {ref: GENESIS_FIELDS, min: 0, note: 'coll — столкновение, arc — дуга, basv — базальт, volc — вулканы, oldv — древние вулканы, craton — щит, low — низина, warm — тепло'}),
      col('levels', 'Пороги', 'json', {note: '[бедно, есть, богато]'}), col('color', 'Цвет', 'color')]},
  {id: 'windBelts', label: 'Пояса ветров', group: 'Мир', key: 'label', rows: () => WIND_BELTS,
    note: 'Ветра по широте (data/climate.js), три ячейки циркуляции, как на Земле: east — широтный ветер (+ на восток), eq — к экватору (+) или к полюсу (−), rise — воздух поднимается (дождливые пояса) или опускается (сухие).',
    columns: [col('label', 'Пояс'), col('lat', 'Широта', 'num', {min: 0, max: 90}), col('east', 'На восток', 'num', {min: -1, max: 1}), col('eq', 'К экватору', 'num', {min: -1, max: 1}), col('rise', 'Подъём', 'num', {min: -1, max: 1})]},
  {id: 'climateRules', label: 'Влажность', group: 'Мир', ...grp({moisture: MOISTURE}),
    note: 'Модель влаги карты мира (data/climate.js MOISTURE): испарение с моря, круговорот, морось, подъём над горами, конденсация, скорость переноса, перевод в миллиметры.'},
);

// ── dictionaries (docs/TABLES.md): every key a `mods` or an `effects` may name, and every tag
TABLES.push(
  {id: 'creatureMods', label: 'Модификаторы существа', group: 'Словари', key: 'id', rows: () => CREATURE_MODS.all(), after: rebuildBaseMods,
    note: 'Ключи agent.mods (data/mods.js): тело существа, которое собирается из вида, SPECIAL, народа, врождённого, характера и ран. Множитель умножается (нейтрально 1), прибавка прибавляется. Ключ с кривой берёт значение буквы SPECIAL («Кривые»). Ключ, которого здесь нет, в mods рас, черт и ран не принимается. Правка доходит до каждого нового существа и до живых — при пересборке тела (рана, черта, состояние).',
    columns: [col('id', 'Ключ'), col('label', 'Что'), col('how', 'Как складывается', 'enum', {values: MOD_HOWS, edit: false}),
      col('base', 'Нейтрально', 'num', {note: 'с чего начинает каждое существо'}), col('curve', 'Кривая SPECIAL', 'ref', {ref: 'curves', edit: false}),
      col('floor', 'Не меньше', 'num', {edit: false}), col('reads', 'Кто читает'), col('note', 'Описание')]},
  {id: 'colonyMods', label: 'Модификаторы поселения', group: 'Словари', key: 'id', rows: () => COLONY_MODS.all(),
    target: (r, c) => (c.key === 'base' && r.kind !== 'add' && r.kind !== 'mul' ? null : [r, c.key]),
    note: 'Ключи w.mods (data/mods.js): что даёт поселению всё построенное, приручённое и лежащее на складе. add — сумма, mul — произведение, best — лучшее из; семьи yield, jobSpeed, toolWear — по ресурсу или по работе. Ключ, которого здесь нет, в эффектах построек, зверей и ресурсов не принимается. Правка нейтрального значения доходит до поселения при следующем пересчёте (постройка, приручение, ключ на складе); у семей нейтрально всегда 1.',
    columns: [col('id', 'Ключ'), col('kind', 'Вид', 'enum', {values: COLONY_KINDS, edit: false}), col('key', 'Имя', 'text', {edit: false}), col('keys', 'По строкам', 'text', {edit: false}),
      col('label', 'Что'), col('base', 'Нейтрально', 'num'), col('reads', 'Кто читает'), col('note', 'Описание')]},
  {id: 'tags', label: 'Теги', group: 'Словари', key: 'id', rows: () => TAGS.all().map(t => ({...t, who: carriers(t)})),
    target: (r, c) => [TAGS.get(r.id), c.key],
    note: 'Слова, которыми помечены виды, вещи и ресурсы (data/tags.js), как traits в Pathfinder 2: что значит, где лежит, кто читает, у кого есть. Флаг вида, страх (weakTo), тег ресурса и флаг вещи, которых здесь нет, — ошибка.',
    columns: [col('id', 'Тег'), col('on', 'У кого', 'enum', {values: TAG_ON, edit: false}), col('field', 'Поле', 'text', {edit: false}),
      col('label', 'Что'), col('reads', 'Кто читает'), col('note', 'Описание'),
      col('who', 'Несут', 'ids', {computed: true, note: 'виды, вещи или ресурсы с этим тегом'})]},
  fix(autoTable({id: 'buildings', label: 'Постройки поселения', group: 'Поселение', rows: () => BUILDINGS.all(), whole: {effects: EFFECTS_COL, cost: {type: 'map', ref: RESOURCES, min: 0, label: 'Цена'}},
    note: 'Постройки локальной карты (data/buildings.js): цена, труд, сколько можно, тепло, что дают поселению (effects — по «Модификаторам поселения»). Условия и действия при постройке — формулы кода.'}),
  {work: {type: 'num', min: 0}, color: {edit: false}, mark: {edit: false}, onFinish: CODE, key: {type: 'ref', ref: RESOURCES}, needs: {type: 'ref', ref: 'buildings'},
    near: {edit: false}, max: {type: 'int', min: 0}, benches: {type: 'int', min: 0}, beds: {type: 'int', min: 0}, pen: {type: 'int', min: 0}, zone: {type: 'num', min: 0}}),
  fix(autoTable({id: 'resources', label: 'Ресурсы', group: 'Поселение', rows: () => RESOURCES.all(), whole: {effects: EFFECTS_COL},
    note: 'Ресурсы склада (data/resources.js): теги (по «Тегам»), сытость, порча, сколько уносят, сколько держать, место в обозе, топливо, что даёт ключ на складе (effects). Цена и стопка — в «Ценах ресурсов».'}),
  {tags: {type: 'ids', ref: tagIds('resource')}, color: {edit: false}, mapColor: {edit: false}, ore: CODE, 'furnace.tier': {type: 'int', min: 0},
    value: {edit: false, note: 'правится в «Ценах ресурсов»'}, stack: {edit: false, note: 'правится в «Ценах ресурсов»'}, money: {edit: false, note: 'правится в «Ценах ресурсов»'}}),
);

// ── the fight (docs/TABLES.md): kinds of harm and how each body takes them, weapon qualities, where blows land
const HARM = [...DAMAGE_TYPES.map(d => [d.id, d.label]), ...Object.entries(DELIVERY)];
TABLES.push(
  {id: 'damageTypes', label: 'Типы урона', group: 'Словари', key: 'id', rows: () => DAMAGE_TYPES,
    note: 'Удары, стихии и погибели (data/balance/combat.js DAMAGE_TYPES): чем наносится каждый. Как каждое тело его держит — «Урон по видам».',
    columns: [col('id', 'id'), col('kind', 'Вид', 'enum', {values: DAMAGE_KINDS, edit: false}), col('label', 'Название'), col('source', 'Чем наносится')]},
  {id: 'damageMatrix', label: 'Урон по видам', group: 'Существа', key: 'id',
    rows: () => SPECIES.all().map(sp => ({id: sp.id, label: sp.label, plan: planOf(sp), resist: sp.resist})),
    target: (r, c) => [SPECIES.get(r.id), c.key],
    note: 'Сколько урона каждого вида получает тело (× урона; пусто — 1): колющий, рубящий, дробящий, огонь, холод, яд, порча, серебро, святость, и отдельно вблизи и издали (resist, data/balance/creatures.js). Огонь — жар клетки, холод — мороз без тепла, яд — укус, серебро — посеребрённый клинок сверх страха серебра; у порчи и святости источника пока нет. План тела — по нему места попадания.',
    columns: [col('id', 'id'), col('label', 'Кто', 'text', {edit: false}), col('plan', 'План тела', 'enum', {values: BODY_PLANS}),
      ...HARM.map(([id, label]) => col(`resist.${id}`, label, 'num', {min: 0}))]},
  {id: 'weaponQualities', label: 'Свойства оружия', group: 'Словари', key: 'id', rows: () => WEAPON_QUALITIES,
    note: 'Свойства со значением, как в Fallout 2d20 (data/balance/combat.js WEAPON_QUALITIES): форма и материал дают их (столбец «Свойства оружия» в «Формах» и «Материалах»), вещь несёт сумму. «Работает» — игра читает его сейчас (кровопускающее и оглушающее — через «Состояния»: кровотечение, оглушён); метательное ждёт своей механики. Свойства материала достаются только оружию.',
    columns: [col('id', 'id'), col('label', 'Название'), col('unit', 'Значение', 'text', {edit: false}), col('live', 'Работает', 'bool', {edit: false}), col('reads', 'Что делает'), col('note', 'Описание')]},
  {id: 'hitLocations', label: 'Места попадания', group: 'Существа', key: 'id', rows: () => HIT_LOCATIONS.all(),
    note: 'Куда приходится удар (data/anatomy.js), как в Fallout 2d20: у каждого плана тела свои места — вес (как часто), × урона там, какие травмы оставляет смертельная рана там. Место бросается из своего потока случайностей и больше ничего в бою не сдвигает.',
    columns: [col('id', 'id'), col('plan', 'План тела', 'enum', {values: BODY_PLANS, edit: false}), col('label', 'Место'), col('weight', 'Вес', 'num', {min: 0}),
      col('dmg', 'Урон ×', 'num', {min: 0}), col('traumas', 'Травмы', 'ids', {ref: {has: id => WOUNDS.has(id) && !!WOUNDS.get(id).trauma}, note: 'только травмы («Состояния», trauma)'}), col('note', 'Описание')]},
);

// ── checks and chance (docs/TABLES.md): the ladder, the four degrees, and every random table in one place
// the rows of all random tables, each with the object its numbers live in (`src`): a raid band's `chance`, a find, a trophy
const randomRows = () => [
  ...RAID_BANDS.all().map(b => ({key: `raids:${b.id}`, table: 'raids', mode: 'one', row: b.label, ctx: 'угроза, ночь', gives: `банда «${b.label}»`, src: b.chance, ...b.chance})),
  ...FINDS.map(f => ({key: `finds:${f.id}`, table: 'finds', mode: 'first', row: f.id, ctx: `× место: ${f.where}`, gives: [f.gold ? `золото ${f.gold.join('–')}` : '', ...Object.keys(f.goods || {}), ...Object.keys(f.items || {})].filter(Boolean).join(', '), src: f, chance: f.chance})),
  ...SPECIES.filter(sp => sp.trophies?.length).flatMap(sp => sp.trophies.map((e, k) => ({key: `trophies:${sp.id}:${k}`, table: 'trophies', mode: 'each', row: sp.label, ctx: '× удача добывших', gives: `${e.res} × ${e.n}${e.tier > 1 ? ` (тир ${e.tier})` : ''}`, src: e, chance: e.chance}))),
];
const RANDOM_TABLES = {raids: 'Кто приходит в набег (data/raids.js)', finds: 'Находки похода утром (data/campaign.js FINDS)', trophies: 'Редкие трофеи зверя (trophies вида)'};
TABLES.push(
  {id: 'difficulty', label: 'Лестница сложности', group: 'Словари', key: 'id', rows: () => DIFFICULTY.all(),
    note: 'Ступени проверки, как DC в D&D (data/checks.js): буква против ступени — contest(буква, vs), ступень — как буква противника. При норме 5: пустяк 80%, легко 67%, средне 50%, трудно 33%, героически 20%.',
    columns: [col('id', 'id'), col('label', 'Ступень'), col('vs', 'Как буква противника', 'num', {min: 0}), col('note', 'При норме 5')]},
  {id: 'degreeRules', label: 'Степени успеха', group: 'Словари', ...grp({degrees: DEGREES}),
    note: 'Четыре степени, как в Pathfinder 2 (data/checks.js): успех — пока бросок меньше шанса, как всегда; нижняя доля успехов (degrees.crit) — крит. успех, верхняя доля провалов (degrees.fumble) — крит. провал. Удар вблизи бросается против ступени «легко». Что дают крайние степени — «Последствия степеней».'},
  {id: 'degreeEffects', label: 'Последствия степеней', group: 'Словари', key: 'id', rows: () => DEGREE_EFFECTS.all(),
    note: 'Что добавляет крит. успех или крит. провал каждой проверки: выстрел, блок, удар вблизи, ремесло, смертельная рана. 0 — ничего (игра как раньше); число включает последствие.',
    columns: [col('id', 'id'), col('check', 'Проверка', 'enum', {values: Object.fromEntries(Object.entries(DEGREE_CHECKS).map(([k, c]) => [k, c.label])), edit: false}),
      col('degree', 'Степень', 'enum', {values: DEGREE_NAMES, edit: false}), col('effect', 'Что делает', 'text', {edit: false}), col('value', 'Значение', 'num', {min: 0}), col('note', 'Описание')]},
  {id: 'randomTables', label: 'Таблицы случайностей', group: 'Словари', key: 'key', rows: randomRows,
    // a raid band's numbers are its weight and conditions, a find's and a trophy's — its chance
    target: (r, c) => ((r.table === 'raids' ? ['weight', 'threat', 'below', 'night', 'perNight'].includes(c.key) : c.key === 'chance') ? [r.src, c.key] : null),
    note: 'Всё, что игра тянет из списка, в одном формате (data/chance.js): набеги — одна по весу (вес, с какой угрозы, ниже неё — below, только ночью глубже night, прибавка за ночь perNight); находки похода — первая, что выпала (шанс × место); трофеи зверя — каждая на свой шанс (× удача). Правка доходит до игры.',
    columns: [col('key', 'Строка'), col('table', 'Таблица', 'enum', {values: RANDOM_TABLES, edit: false}), col('mode', 'Как тянут', 'enum', {values: CHANCE_MODES, edit: false}),
      col('row', 'Что', 'text', {edit: false}), col('weight', 'Вес', 'num', {min: 0}), col('threat', 'С угрозы', 'num', {min: 0, nullable: true}), col('below', 'Ниже угрозы', 'num', {min: 0, nullable: true}),
      col('night', 'Ночью глубже', 'num', {min: 0, max: 1, nullable: true}), col('perNight', 'За ночь +', 'num', {min: 0, nullable: true}), col('chance', 'Шанс', 'num', {min: 0, max: 1}),
      col('ctx', 'От чего зависит', 'text', {edit: false}), col('gives', 'Что даёт', 'text', {edit: false})]},
);

// ── summaries (docs/TABLES.md): what the tables add up to, worked out from them (./sheets.js)
TABLES.push(
  {id: 'creatureSheet', label: 'Существа (итог)', group: 'Существа', key: 'id', computed: true, rows: creatureSheet,
    note: 'Каждый вид как он есть (вычисляется из таблиц): типичное существо — середина пределов SPECIAL, полное здоровье, без оружия. Урон за 1000 тиков, стойкость (здоровье / доля ударов, что проходят и ранят), их произведение против эталонного бойца, и КС одного такого, как приходит (среднее по 16).',
    columns: [col('id', 'id'), col('label', 'Кто'), col('kind', 'Вид', 'enum', {values: KINDS}), col('mind', 'Разум', 'enum', {values: MINDS}), col('plan', 'План тела', 'enum', {values: BODY_PLANS}),
      col('hp', 'Здоровье', 'num'), col('speed', 'Скорость', 'num'), col('blow', 'Удар', 'num'), col('cd', 'Пауза', 'int'), col('type', 'Тип удара', 'enum', {values: BLOWS}),
      col('offence', 'Урон / 1000 тиков', 'num'), col('staying', 'Стойкость', 'num'), col('raw', 'Сила / эталон', 'num'), col('rating', 'КС', 'int'), col('ks', 'КС-поправка', 'num')]},
  {id: 'recipeSheet', label: 'Рецепты (итог)', group: 'Поселение', key: 'id', computed: true, rows: recipeSheet,
    note: 'Экономика ремесла (вычисляется): что уходит и что выходит в имперском золоте по «Ценам ресурсов» и «Предметам (итог)», труд, маржа и золото за час работы мастера. «Убыток» — вещь дешевле того, из чего сделана.',
    columns: [col('id', 'id'), col('at', 'Где'), col('tier', 'Тир', 'int'), col('input', 'Из чего'), col('inputGold', 'Вход, зол.', 'num'), col('work', 'Труд', 'int'),
      col('makes', 'Что выходит'), col('outGold', 'Выход, зол.', 'num'), col('margin', 'Маржа', 'num'), col('perHour', 'Золото за час', 'num'), col('loss', 'Убыток', 'bool')]},
  {id: 'buildingSheet', label: 'Постройки (итог)', group: 'Поселение', key: 'id', computed: true, rows: buildingSheet,
    note: 'Постройки поселения как они есть (вычисляется): цена в золоте по «Ценам ресурсов», труд, сколько можно, станция ли, везёт ли обоз, и что дают поселению (effects по «Модификаторам поселения»).',
    columns: [col('id', 'id'), col('name', 'Название'), col('cost', 'Из чего'), col('costGold', 'Цена, зол.', 'num'), col('work', 'Труд', 'int'), col('max', 'Сколько', 'int'),
      col('station', 'Станция', 'bool'), col('portable', 'В обозе', 'bool'), col('effects', 'Эффекты'), col('effect', 'Описание')]},
);

// ── the realm as a kingdom (docs/TABLES.md; data/kingdom.js, atlas/kingdom.js)
const STAT_MAP = {type: 'map', ref: 'realmStats'}, RUIN_MAP = {type: 'map', ref: 'ruins', min: 0};
TABLES.push(
  {id: 'realmStats', label: 'Держава: показатели', group: 'Народы', key: 'id', rows: () => REALM_STATS.all(),
    note: 'Четыре показателя державы, как в Kingmaker PF2 (data/kingdom.js): из чего складывается каждый — эффекты построек её городов (в среднем на город) × вес, мировоззрение (±5) × вес; к ним — должности, указы, событие года, минус разруха. Считаются раз в год, в конце года (atlas/kingdom.js).',
    columns: [col('id', 'id'), col('label', 'Показатель'), col('from', 'Из построек', 'map', {ref: keysOf(TOWN_FX)}), col('compass', 'Из мировоззрения', 'map', {ref: keysOf({order: 1, mercy: 1})}), col('note', 'Описание')]},
  {id: 'ruins', label: 'Держава: разруха', group: 'Народы', key: 'id', rows: () => RUINS.all(),
    note: 'Четыре вида разрухи: растёт каждый год от своих источников (towns — на город, pop — на 1000 жителей, upkeep — на очко содержания сверх экономики, wars — на войну, raided — на разорённый город), убывает от показателя, что её держит (× «правила» fall), и отнимает от показателя eats (× penalty на очко).',
    columns: [col('id', 'id'), col('label', 'Разруха'), col('grows', 'Растёт от', 'map', {ref: keysOf({towns: 1, pop: 1, upkeep: 1, wars: 1, raided: 1}), min: 0}),
      col('fall', 'Убывает от', 'ref', {ref: 'realmStats'}), col('eats', 'Отнимает', 'ref', {ref: 'realmStats'}), col('note', 'Описание')]},
  {id: 'edicts', label: 'Держава: указы', group: 'Народы', key: 'id', rows: () => EDICTS.all(),
    note: 'Что держава объявляет в этот год: первый уровень, чьё условие выполнено (последний — по умолчанию). Условие: war — на войне; below/above — показатель или разруха ниже/выше. adds — к показателям, ruin — к разрухе.',
    columns: [col('id', 'id'), col('label', 'Указ'), col('levels', 'Уровни', 'json', {check: levelsErrors})]},
  {id: 'offices', label: 'Держава: двор', group: 'Народы', key: 'id', rows: () => OFFICES.all(),
    note: 'Должности при дворе: именной держатель (имя — по расе державы) прибавляет к показателям, пустая должность отнимает. Служит years лет (женщина — labelF), в конце года пустую должность занимают с шансом «правила» court.fill.',
    columns: [col('id', 'id'), col('label', 'Должность'), col('labelF', 'Если женщина'), col('adds', 'Занята', 'map', STAT_MAP), col('vacant', 'Пуста', 'map', STAT_MAP), col('years', 'Лет службы', 'json')]},
  {id: 'realmEvents', label: 'Держава: события', group: 'Народы', key: 'id', rows: () => REALM_EVENTS.all(),
    note: 'События года — таблица случайностей «одна по весу» (data/chance.js), тянется с шансом «правила» events.chance; условие — как у указов. adds — к показателям в этот год, ruin — к разрухе, text — строка летописи ({realm} — держава).',
    columns: [col('id', 'id'), col('weight', 'Вес', 'num', {min: 0}), col('when', 'Условие', 'json', {check: whenErrors, nullable: true}), col('adds', 'Показатели', 'map', STAT_MAP), col('ruin', 'Разруха', 'map', RUIN_MAP), col('text', 'Строка летописи')]},
  {id: 'kingdomRules', label: 'Держава: правила', group: 'Народы', ...grp({ruin: RUIN_RULES, upkeep: UPKEEP, court: COURT, events: EVENTS_RULE, feedback: FEEDBACK}),
    note: 'Разруха: ruin.fall — как показатель её гасит, ruin.penalty — сколько очко разрухи отнимает, ruin.max — потолок. upkeep — содержание постройки по категории (очки экономики в год). court.fill — шанс занять пустую должность. events.chance — шанс события в год. feedback — что держава делает с миром: 0 — ничего; schismByStrife, schismByLoyalty — шанс раскола × (1 + значение × раздоры) и × (1 + значение × нехватка лояльности).'},
  {id: 'marketTiers', label: 'Рынок по ступени города', group: 'Караван', key: 'id', rows: () => MARKET_TIERS.all(),
    note: 'Рынок города для каравана по его ступени, как base value и purchase limit поселения в Pathfinder (data/kingdom.js): maxPrice — самое дорогое, что здесь продают, purse — сколько золота город заплатит за товары каравана за визит. Пусто — без предела (как раньше).',
    columns: [col('id', 'id'), col('label', 'Ступень'), col('tier', 'Ступень №', 'int', {edit: false}), col('maxPrice', 'Самое дорогое, зол.', 'num', {min: 0, nullable: true}), col('purse', 'Кошель города, зол.', 'num', {min: 0, nullable: true})]},
);

// ── the content of the world (docs/TABLES.md): illness, addiction, the rot; tongues and senses; the caravan's name
// and pace; the settlement's vital signs
TABLES.push(
  {id: 'afflictions', label: 'Недуги', group: 'Существа', key: 'id', rows: () => AFFLICTIONS.all(),
    note: 'Болезни со стадиями, как afflictions в Pathfinder 2 (data/afflictions.js): откуда (from) и с каким шансом (catch; 0 — никто не болеет), раз в every дней — проверка буквы stat против ступени save лестницы (с хижиной лекаря — на ступень легче): крит. успех — здоров, успех — стадия назад, провал — вперёд, крит. провал — на две; за последней — смерть, если deadly. Стадия делает с телом свои mods.',
    columns: [col('id', 'id'), col('label', 'Недуг'), col('cause', 'Умер от'), col('from', 'Откуда', 'enum', {values: AFFLICTION_FROM, edit: false}), col('catch', 'Шанс', 'num', {min: 0, max: 1}),
      col('stat', 'Буква', 'ref', {ref: STATS}), col('save', 'Ступень', 'ref', {ref: 'difficulty'}), col('every', 'Раз в дней', 'num', {min: 0.05}), col('deadly', 'Смертелен', 'bool'),
      col('stages', 'Стадии', 'json', {check: (v, resolve) => stagesErrors(v, resolve)}), col('note', 'Описание')]},
  {id: 'afflictionRules', label: 'Зависимость и порча', group: 'Существа', ...grp({addiction: ADDICTION, taint: TAINT}),
    note: 'Зависимость (data/afflictions.js): кружка браги цепляет с шансом addiction.braga.hook (0 — никого), без кружки дольше days — «ломка» («Состояния»). Порча: удар нежити прибавляет taint.perHit × «Урон по видам» порча (0 — ничего), уходит по fade в день; на ступенях taint.stages — «порча I–III».'},
  {id: 'languages', label: 'Языки', group: 'Народы', key: 'id', rows: () => LANGUAGES.all(),
    note: 'Языки мира (data/tongues.js). Кто на каком говорит — «Языки рас». В походе город торгует на языке своего народа: если никто из каравана его не знает, цены хуже на «Языки и чувства: правила» tongue.barrier (0 — как раньше).',
    columns: [col('id', 'id'), col('label', 'Язык'), col('note', 'Описание')]},
  {id: 'speaks', label: 'Языки рас', group: 'Народы', key: 'id', rows: () => Object.entries(SPEAKS).map(([id, tongues]) => ({id, label: SPECIES.has(id) ? SPECIES.get(id).label : id, tongues})),
    target: (r, c) => (c.key === 'tongues' ? [SPEAKS, r.id] : null),
    note: 'На каких языках говорит раса, свой — первым (data/tongues.js SPEAKS).',
    columns: [col('id', 'id'), col('label', 'Раса', 'text', {edit: false}), col('tongues', 'Языки', 'ids', {ref: 'languages'})]},
  {id: 'senses', label: 'Чувства', group: 'Существа', key: 'id', rows: () => SENSES.all(),
    note: 'Чем замечают (data/tongues.js SENSES): ночное зрение — ночью видит как днём, прочие видят ночью × (1 − night.loss × ночь; 0 — как раньше); чутьё пока только записано.',
    columns: [col('id', 'id'), col('label', 'Чувство'), col('live', 'Работает', 'bool', {edit: false}), col('species', 'У кого', 'ids', {ref: SPECIES}), col('note', 'Описание')]},
  {id: 'tongueRules', label: 'Языки и чувства: правила', group: 'Народы', ...grp({tongue: TONGUE, night: NIGHT_SIGHT}),
    note: 'tongue.barrier — насколько хуже цены в городе, чей язык караван не знает (покупка × (1 + значение), продажа × (1 − значение)); night.loss — насколько ночь сужает обзор поселенца без ночного зрения.'},
  {id: 'reputation', label: 'Слава каравана', group: 'Караван', ...grp({reputation: REPUTATION, terms: TERMS}),
    note: 'Слава и дурная слава каравана у каждой державы, как в Fallout: New Vegas (data/road.js): победа у города (в near клетках) — win славы у его державы; проданный пленный — slaveSale дурной славы; не больше max. fameDiscount, infamyMarkup — как слава и дурная слава меняют цены (0 — как раньше); terms.max — больше какой доли язык и слава не двигают цену.'},
  {id: 'paces', label: 'Темп похода', group: 'Караван', key: 'id', rows: () => PACES.all(),
    note: 'Темп, как в D&D (data/road.js): × дневного перехода, × добычи в пути, × того, как засада застаёт врасплох (сверх «Дорога и стоянки» ambush.surprise). Какой держит совет — «Темп похода: правила».',
    columns: [col('id', 'id'), col('label', 'Темп'), col('speed', 'Переход ×', 'num', {min: 0}), col('forage', 'Добыча ×', 'num', {min: 0}), col('wary', 'Засада ×', 'num', {min: 0}), col('note', 'Описание')]},
  {id: 'paceRules', label: 'Темп похода: правила', group: 'Караван', key: 'id', rows: () => [{id: 'rules', ...PACE_RULES}], target: (r, c) => [PACE_RULES, c.key],
    note: 'Какой темп совет держит: когда за караваном погоня (pursued), когда опасность вокруг сильнее dangerAt (danger), иначе — обычный. Всё «обычный» — как раньше.',
    columns: [col('id', 'id'), col('pursued', 'Под погоней', 'ref', {ref: 'paces'}), col('danger', 'В опасности', 'ref', {ref: 'paces'}), col('dangerAt', 'Опасность с', 'num', {min: 0})]},
  {id: 'settlementStats', label: 'Показатели поселения', group: 'Поселение', key: 'id', rows: () => SETTLEMENT_STATS.all(),
    note: 'Показатели поселения, как в Fallout 4 (data/colonyStats.js, settlement/stats.js): еда в днях, кровати и тёплые места на жителя, сила против следующего набега, настроение, занятость мест — против нормы. Сами ничего не меняют: их читают названные системы; карточка поселения показывает их, красное — ниже нормы.',
    columns: [col('id', 'id'), col('label', 'Показатель'), col('norm', 'Норма', 'num'), col('above', 'Норма — не ниже', 'bool', {edit: false}), col('reads', 'Кто читает'), col('low', 'Если не хватает')]},
);

export const tableById = id => TABLES.find(t => t.id === id);
export const checkAll = () => checkTables(TABLES);
