// Stockpile resources. Tags group them: everything tagged 'food' can be eaten, 'fuel' can feed the
// campfire (in `burn` order, lowest first), 'smelt' fuel keeps a furnace or a forge hot, 'ore' is
// dug at the mine, 'luxury' is the jeweller's work (worth `value` to a trader later).
// Food (data/foods.js) and the jeweller's goods (data/luxury.js) are listed separately and join
// this registry by themselves; a resource dug from a vein (data/ores.js) gets its map layer from there.
// A new resource needs only an entry here plus a source (job, animal or recipe).
// `map(w, i)` (0..1) shows where it can be gathered on the resource layer, in `mapColor`.
// `group` is its section on the stock panel (RESOURCE_GROUPS gives the order, new groups go last);
// `target` is how much the colony likes to keep (miners dig ore that is below it).
// Trade (data/trade.js, settlement/trade.js): `value` is the price of one unit in imperial gold;
// `keep` (or `keepPerHead` × colonists) is what the colony holds back when it sells to a trader
// (default: `target`, else 20); `sell: false` never goes to a trader.
import {Registry} from '../core/registry.js';
import {T} from './terrain.js';
import {FOODS} from './foods.js';
import {LUXURY} from './luxury.js';
import {ORES} from './ores.js';
import {PLANTS, plantLayer} from './plants.js';
import {oreAt} from '../world/ores.js';

export const RESOURCES = new Registry('resource');

export const RESOURCE_GROUPS = ['Деньги', 'Еда', 'Лекарства', 'Материалы', 'Топливо', 'Руда', 'Металл', 'Роскошь', 'Боеприпасы'];

RESOURCES.registerAll([
  ...FOODS.all().map(f => ({id: f.id, label: f.label, short: f.label, tags: ['food'], group: 'Еда',
    nutrition: f.nutrition, spoil: f.spoil, loot: f.loot, color: f.color, map: f.map, mapColor: f.mapColor, value: f.value, keepPerHead: f.keepPerHead})),

  {id: 'wood',    label: 'древесина', short: 'древесина', tags: ['fuel', 'material'], group: 'Материалы', burn: 1, loot: 4, value: 0.1, keep: 40, color: '#a5794a',
    map: (w, i) => (w.grid.terr[i] === T.FOREST ? w.grid.wood[i] : 0), mapColor: [120, 210, 90]},
  {id: 'stone',   label: 'камень',  short: 'камень',  tags: ['material'], group: 'Материалы', loot: 2, value: 0.1, keep: 35, color: '#b9b4a6',
    map: (w, i) => (w.grid.terr[i] === T.ROCK && !w.grid.ore?.[i] ? 0.6 : 0), mapColor: [215, 210, 196]},
  {id: 'bone',    label: 'кости',   short: 'кости',   tags: ['material'], group: 'Материалы', loot: 1, value: 0.2, keep: 12, color: '#e8e2cf'},
  {id: 'hide',    label: 'шкуры',   short: 'шкуры',   tags: ['material'], group: 'Материалы', loot: 1, value: 0.5, keep: 6, color: '#9b7650'},
  {id: 'leather', label: 'кожа',    short: 'кожа',    tags: ['material'], group: 'Материалы', loot: 1, value: 1, keep: 8, color: '#7a4d26'},

  // healing herbs, picked from rare wild beds (data/plants.js); the healer treats wounds with them
  {id: 'herbs', label: 'лечебные травы', short: 'травы', tags: ['medicine'], group: 'Лекарства', loot: 1, value: 1, keep: 10, target: 10, color: '#e8d25c'},

  // fuel: charcoal is burnt from logs, coal is dug; both keep a furnace hot, the campfire takes them after wood
  {id: 'charcoal', label: 'древесный уголь', short: 'уголь', tags: ['fuel', 'smelt'], group: 'Топливо', burn: 2, heat: 2, loot: 2, value: 0.3, color: '#3d3a36', target: 10},
  {id: 'coal',     label: 'каменный уголь', short: 'кам. уголь', tags: ['fuel', 'smelt', 'ore'], group: 'Топливо', burn: 3, heat: 2.5, loot: 2, value: 0.3, color: '#2a2a2e',
    target: 12},

  // ore from the mine
  {id: 'ironore', label: 'железная руда', short: 'руда', tags: ['ore'], group: 'Руда', loot: 1, value: 0.5, color: '#9a5a3c',
    target: 14},
  {id: 'gems',    label: 'самоцветы', short: 'самоцветы', tags: ['ore'], group: 'Руда', loot: 1, value: 4, color: '#7fd3c8',
    target: 6},

  // metal: bars from the furnace
  {id: 'iron',    label: 'железо',  short: 'железо',  tags: ['material', 'metal'], group: 'Металл', loot: 1, value: 2, keep: 8, color: '#a9b0b6'},

  // luxury goods from the jeweller: kept for trade, they make the colony look rich
  ...LUXURY.all().map(l => ({id: l.id, label: l.label, short: l.short, tags: ['luxury'], group: 'Роскошь', value: l.value, keep: 0, loot: 1, color: l.color})),

  {id: 'arrows',  label: 'стрелы',  short: 'стрелы',  tags: ['ammo'], group: 'Боеприпасы', loot: 3, value: 0.1, keep: 30, color: '#c7b07a'},

  // money: imperial gold, earned only by selling to traders; raiders take a handful
  {id: 'gold', label: 'имперские золотые', short: 'золотые', tags: ['money'], group: 'Деньги', loot: 5, value: 1, sell: false, color: '#e3c14a'},
]);

// resources dug from veins: which ore they come from, and where to see it on the resource layer
for (const o of ORES.all()) {
  const r = RESOURCES.get(o.resource);
  r.ore = o.code;
  r.map ??= (w, i) => oreAt(w, i, o.code);
  r.mapColor ??= o.mapColor;
}

// sections of the stock panel in their order; a group not listed here is shown after them
export const resourceGroups = () => [...new Set([...RESOURCE_GROUPS, ...RESOURCES.all().map(r => r.group || 'Прочее')])];

// resources picked from wild plant beds: where to see them on the resource layer
for (const p of PLANTS.all()) {
  const r = RESOURCES.get(p.resource), key = plantLayer(p.id);
  r.map ??= (w, i) => w.grid[key]?.[i] || 0;
  r.mapColor ??= p.mapColor;
}

export const byTag = tag => RESOURCES.filter(r => r.tags.includes(tag));
