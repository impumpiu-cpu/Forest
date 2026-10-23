// Technologies (docs/TABLE.md, «Основа для асимметрии»): a list, not a tree yet. Each one only switches on what the
// game already has — town buildings of the world map, the metals the towns' smiths work — so that a realm comes to
// them by its own way. Two layers:
//   races     — which peoples can know it at all (data/peoples.js ids; none — any): availability belongs to the race
//   realms    — which realm has found it (a.realms[].tech, atlas/tech.js): discovery belongs to the realm, so two dwarf
//               realms may part ways in what they can build
// What is in no technology is known to all from the start (huts, fields, shrines, the plain trades).
//
// Fields:
//   label, note   — the name and what it is
//   era           — the earliest era it can be found in (data/history.js ERAS ids); none — any
//   requires      — technologies the realm must know first
//   tier          — the step (data/peoples.js TIERS: 0 hamlet, 1 village, 2 town) one of its towns must reach
//   needsAny      — buildings (data/townBuildings.js) one of its towns must have: you find iron at the smelter
//   chance        — a year, once all the above hold (TECH_RULES.chance when not said)
//   opens         — what it switches on: {buildings: [town building ids], materials: [data/balance/materials.js ids]}:
//                   a town of a realm without it does not build those, a town's smith does not forge those metals nor
//                   its market sell them (campaign/town.js)
// Later stages (the asymmetry of the races) will add: trade carrying a technology between realms, and technologies
// of their own for the local map.
import {Registry} from '../core/registry.js';

export const TECHS = new Registry('tech');

TECHS.registerAll([
  {id: 'stonework', label: 'Каменное дело', note: 'тесать и класть камень: каменные дома, стены, мосты и башни', races: ['humans', 'dwarves'],
    tier: 1, needsAny: ['quarry'], opens: {buildings: ['stonehouse', 'stonewall', 'bridge', 'tower', 'citadel']}},
  {id: 'bronze', label: 'Бронзовое литьё', note: 'плавить медь с оловом: плавильня и бронзовые вещи; эльфы перенимают его у торговых гостей', races: ['humans', 'dwarves', 'orcs', 'elves'],
    tier: 1, needsAny: ['mineshaft', 'market'], opens: {buildings: ['smelter'], materials: ['bronze']}},
  {id: 'iron', label: 'Ковка железа', note: 'кричное железо и кузня: железное оружие, броня и инструмент; эльфы куют его в своих оружейных', races: ['humans', 'dwarves', 'orcs', 'elves'],
    requires: ['bronze'], tier: 1, needsAny: ['smelter', 'market'], opens: {buildings: ['forge'], materials: ['iron']}},
  {id: 'casting', label: 'Литейное дело', note: 'большое литьё и стекло', races: ['humans', 'dwarves'],
    requires: ['iron'], tier: 2, needsAny: ['forge'], opens: {buildings: ['foundry', 'glassworks']}},
  {id: 'deepmining', label: 'Глубинные шахты', note: 'штольни под самые корни гор', races: ['dwarves'],
    requires: ['stonework'], tier: 2, needsAny: ['mineshaft'], opens: {buildings: ['deepmine']}},
  {id: 'magmaforge', label: 'Магмовая кузня', note: 'жар земных недр: в нём одном куётся мифрил', races: ['dwarves'],
    requires: ['iron', 'deepmining'], tier: 2, needsAny: ['deepmine'], chance: 0.1, opens: {buildings: ['magmaforge'], materials: ['mithril']}},
  {id: 'silverwork', label: 'Серебряное дело', note: 'очищать серебро и работать его: ювелиры и серебряные вещи', races: ['humans', 'dwarves', 'elves'],
    tier: 1, needsAny: ['mineshaft', 'placer', 'market'], opens: {buildings: ['jeweler'], materials: ['silver']}},
  {id: 'milling', label: 'Мельницы', note: 'вода и ветер мелют зерно: мельницы и пекарни', races: ['humans', 'dwarves'],
    tier: 2, needsAny: ['field', 'garden', 'mushrooms'], opens: {buildings: ['watermill', 'windmill', 'bakery']}},
  {id: 'sailing', label: 'Мореходство', note: 'корабли и гавани: морские пути', races: ['humans', 'elves', 'orcs'],
    tier: 1, needsAny: ['pier', 'fishhut'], opens: {buildings: ['shipyard', 'harbor', 'lighthouse']}},
  {id: 'letters', label: 'Письменность', note: 'школы, библиотеки и алхимики', races: ['humans', 'elves', 'dwarves'],
    tier: 2, needsAny: ['market', 'temple', 'ancestorhall'], opens: {buildings: ['school', 'library', 'alchemist']}},
  {id: 'arcana', label: 'Чародейство', note: 'башни магов: обереги от гнили', races: ['humans', 'elves'],
    requires: ['letters'], tier: 2, needsAny: ['library'], chance: 0.12, opens: {buildings: ['magetower']}},
  {id: 'coinage', label: 'Монета', note: 'чеканка и большие склады: торговля дальше и выгоднее', races: ['humans', 'dwarves'],
    requires: ['silverwork'], tier: 2, needsAny: ['market'], opens: {buildings: ['mint', 'warehouse']}},
  {id: 'archery', label: 'Лучное дело', note: 'мастерская луков', races: ['elves', 'humans'],
    tier: 1, opens: {buildings: ['bowyer']}},
  {id: 'civic', label: 'Городское право', note: 'ратуши и дворцы: власть города и столицы', races: ['humans', 'dwarves', 'elves'],
    tier: 2, needsAny: ['eldershall', 'market'], opens: {buildings: ['townhall', 'palace']}},
]);

// chance — a year, by default; inherit — a realm born of a schism takes the technologies of the realm it broke from
export const TECH_RULES = {chance: 0.25, inherit: true};

// which technology switches each building and each metal on (one at most: data/schema checks it)
export const techOfBuilding = id => TECHS.all().find(t => t.opens?.buildings?.includes(id))?.id || null;
export const techOfMaterial = id => TECHS.all().find(t => t.opens?.materials?.includes(id))?.id || null;
