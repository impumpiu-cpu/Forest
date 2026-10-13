// Stockpile resources. Tags group them: everything tagged 'food' can be eaten, 'fuel' can feed the
// campfire (in `burn` order, lowest first), 'smelt' fuel keeps a furnace or a forge hot, 'ore' is
// dug at the mine, 'luxury' is the jeweller's work (worth `value` to a trader later).
// Food is listed separately in data/foods.js and joins this registry by itself.
// A new resource needs only an entry here plus a source (job, animal or recipe).
// `map(w, i)` (0..1) shows where it can be gathered on the resource layer, in `mapColor`.
// `group` sorts the stock panel; `target` is how much the colony likes to keep (ore digging, charcoal).
import {Registry} from '../core/registry.js';
import {T} from './terrain.js';
import {FOODS} from './foods.js';
import {ORE, oreAt} from '../world/ores.js';

export const RESOURCES = new Registry('resource');

export const RESOURCE_GROUPS = ['Еда', 'Материалы', 'Топливо', 'Руда', 'Металл', 'Роскошь', 'Боеприпасы'];

RESOURCES.registerAll([
  ...FOODS.all().map(f => ({id: f.id, label: f.label, short: f.label, tags: ['food'], group: 'Еда',
    nutrition: f.nutrition, spoil: f.spoil, loot: f.loot, color: f.color, map: f.map, mapColor: f.mapColor})),

  {id: 'wood',    label: 'древесина', short: 'древесина', tags: ['fuel', 'material'], group: 'Материалы', burn: 1, loot: 4, color: '#a5794a',
    map: (w, i) => (w.grid.terr[i] === T.FOREST ? w.grid.wood[i] : 0), mapColor: [120, 210, 90]},
  {id: 'stone',   label: 'камень',  short: 'камень',  tags: ['material'], group: 'Материалы', loot: 2, color: '#b9b4a6',
    map: (w, i) => (w.grid.terr[i] === T.ROCK && !w.grid.ore?.[i] ? 0.6 : 0), mapColor: [215, 210, 196]},
  {id: 'bone',    label: 'кости',   short: 'кости',   tags: ['material'], group: 'Материалы', loot: 1, color: '#e8e2cf'},
  {id: 'hide',    label: 'шкуры',   short: 'шкуры',   tags: ['material'], group: 'Материалы', loot: 1, color: '#9b7650'},
  {id: 'leather', label: 'кожа',    short: 'кожа',    tags: ['material'], group: 'Материалы', loot: 1, color: '#7a4d26'},

  // fuel: charcoal is burnt from logs, coal is dug; both keep a furnace hot, the campfire takes them after wood
  {id: 'charcoal', label: 'древесный уголь', short: 'уголь', tags: ['fuel', 'smelt'], group: 'Топливо', burn: 2, heat: 2, loot: 2, color: '#3d3a36', target: 10},
  {id: 'coal',     label: 'каменный уголь', short: 'кам. уголь', tags: ['fuel', 'smelt', 'ore'], group: 'Топливо', burn: 3, heat: 2.5, loot: 2, color: '#2a2a2e',
    ore: ORE.coal, target: 12, map: (w, i) => oreAt(w, i, ORE.coal), mapColor: [70, 70, 84]},

  // ore from the mine
  {id: 'ironore', label: 'железная руда', short: 'руда', tags: ['ore'], group: 'Руда', loot: 1, color: '#9a5a3c',
    ore: ORE.iron, target: 14, map: (w, i) => oreAt(w, i, ORE.iron), mapColor: [196, 102, 64]},
  {id: 'gems',    label: 'самоцветы', short: 'самоцветы', tags: ['ore'], group: 'Руда', loot: 1, value: 4, color: '#7fd3c8',
    ore: ORE.gems, target: 6, map: (w, i) => oreAt(w, i, ORE.gems), mapColor: [120, 230, 214]},

  // metal: bars from the furnace
  {id: 'iron',    label: 'железо',  short: 'железо',  tags: ['material', 'metal'], group: 'Металл', loot: 1, color: '#a9b0b6'},

  // luxury goods from the jeweller: kept for trade, they make the colony look rich
  {id: 'jewelBone',  label: 'костяные бусы с самоцветами', short: 'бусы', tags: ['luxury'], group: 'Роскошь', value: 8, loot: 1, color: '#efe2c4'},
  {id: 'jewelWood',  label: 'резные шкатулки с инкрустацией', short: 'шкатулки', tags: ['luxury'], group: 'Роскошь', value: 7, loot: 1, color: '#c08a4a'},
  {id: 'jewelStone', label: 'каменные идолы с глазами-самоцветами', short: 'идолы', tags: ['luxury'], group: 'Роскошь', value: 9, loot: 1, color: '#c9c3b3'},
  {id: 'jewelIron',  label: 'железные гривны с самоцветами', short: 'гривны', tags: ['luxury'], group: 'Роскошь', value: 14, loot: 1, color: '#d6dde2'},

  {id: 'arrows',  label: 'стрелы',  short: 'стрелы',  tags: ['ammo'], group: 'Боеприпасы', loot: 3, color: '#c7b07a'},
]);

export const byTag = tag => RESOURCES.filter(r => r.tags.includes(tag));
