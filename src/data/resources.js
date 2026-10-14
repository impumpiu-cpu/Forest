// Stockpile resources. Tags group them: everything tagged 'food' can be eaten, 'fuel' can feed the
// campfire (in `burn` order, lowest first), 'smelt' fuel keeps a furnace or a forge hot, 'ore' is
// dug at the mine, 'luxury' is the jeweller's work (worth `value` to a trader later).
// Food (data/foods.js) and the jeweller's goods (data/luxury.js) are listed separately and join
// this registry by themselves; a resource dug from a vein (data/ores.js) gets its map layer from there.
// A new resource needs only an entry here plus a source (job, animal or recipe).
// `map(w, i)` (0..1) shows where it can be gathered on the resource layer, in `mapColor`.
// `group` is its section on the stock panel (RESOURCE_GROUPS gives the order, new groups go last);
// `target` is how much the colony likes to keep (miners dig ore that is below it).
// `furnace: {tier, per}` — fuel for a furnace or a forge (settlement/stock.js, furnacePick).
// `money` — precious metal counted as payment at this share of its value (settlement/trade.js).
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
import {FURNITURE} from './furniture.js';

export const RESOURCES = new Registry('resource');

export const RESOURCE_GROUPS = ['Деньги', 'Еда', 'Заготовки', 'Семена', 'Ремесло', 'Лекарства', 'Материалы', 'Топливо', 'Руда', 'Металл', 'Роскошь', 'Мебель', 'Быт', 'Инструменты', 'Боеприпасы'];

RESOURCES.registerAll([
  ...FOODS.all().map(f => ({id: f.id, label: f.label, short: f.short || f.label, tags: ['food'], group: f.group || 'Еда',
    nutrition: f.nutrition, spoil: f.spoil, loot: f.loot, color: f.color, map: f.map, mapColor: f.mapColor, value: f.value, keepPerHead: f.keepPerHead})),

  {id: 'wood',    label: 'древесина', short: 'древесина', tags: ['fuel', 'material'], group: 'Материалы', burn: 1, loot: 4, value: 0.1, keep: 40, color: '#a5794a',
    furnace: {tier: 1, per: 3},
    map: (w, i) => (w.grid.terr[i] === T.FOREST ? w.grid.wood[i] : 0), mapColor: [120, 210, 90]},
  {id: 'stone',   label: 'камень',  short: 'камень',  tags: ['material'], group: 'Материалы', loot: 2, value: 0.1, keep: 35, color: '#b9b4a6',
    map: (w, i) => (w.grid.terr[i] === T.ROCK && !w.grid.ore?.[i] ? 0.6 : 0), mapColor: [215, 210, 196]},
  {id: 'bone',    label: 'кости',   short: 'кости',   tags: ['material'], group: 'Материалы', loot: 1, value: 0.2, keep: 12, color: '#e8e2cf'},
  {id: 'hide',    label: 'шкуры',   short: 'шкуры',   tags: ['material'], group: 'Материалы', loot: 1, value: 0.5, keep: 6, color: '#9b7650'},
  {id: 'leather', label: 'кожа',    short: 'кожа',    tags: ['material'], group: 'Материалы', loot: 1, value: 1, keep: 8, color: '#7a4d26'},

  // ── the outpost's own crafts: from the meadow and the lake shore to rope, cloth, pots and boards
  {id: 'fiber',  label: 'волокно', short: 'волокно', tags: ['material'], group: 'Ремесло', loot: 1, value: 0.15, keep: 16, target: 16, color: '#9bc29a'},
  {id: 'rope',   label: 'верёвка', short: 'верёвка', tags: ['material'], group: 'Ремесло', loot: 1, value: 0.6, keep: 6, color: '#c9b07a'},
  {id: 'cloth',  label: 'грубый холст', short: 'холст', tags: ['material'], group: 'Ремесло', loot: 1, value: 1.2, keep: 6, color: '#d8ccb0'},
  {id: 'reeds',  label: 'камыш', short: 'камыш', tags: ['material'], group: 'Ремесло', loot: 1, value: 0.1, keep: 20, target: 16, color: '#c2b46a'},
  {id: 'clay',   label: 'глина', short: 'глина', tags: ['material'], group: 'Ремесло', loot: 1, value: 0.1, keep: 16, target: 14, color: '#b06a48'},
  {id: 'pots',   label: 'горшки', short: 'горшки', tags: ['material', 'storage'], group: 'Ремесло', loot: 1, value: 0.8, keep: 30, color: '#a8653e'},
  {id: 'planks', label: 'тёс', short: 'тёс', tags: ['material'], group: 'Ремесло', loot: 2, value: 0.5, keep: 30, color: '#c99a5c'},
  {id: 'hay',    label: 'сено', short: 'сено', tags: ['material'], group: 'Ремесло', loot: 2, value: 0.1, sell: false, target: 30, color: '#c8c070'},
  // wool sheared from the pen's goats (settlement/herd.js): homespun coats, cloth, rugs
  {id: 'wool',   label: 'шерсть', short: 'шерсть', tags: ['material'], group: 'Ремесло', loot: 1, value: 0.8, keep: 12, color: '#e4dcc8'},
  // furs and wax: what the woods give that a town will pay for
  {id: 'furs',   label: 'меха', short: 'меха', tags: ['luxury'], group: 'Роскошь', loot: 1, value: 3, keep: 0, color: '#c4743a'},
  {id: 'wax',    label: 'воск', short: 'воск', tags: ['material'], group: 'Роскошь', loot: 1, value: 1.5, keep: 0, color: '#e8d48a'},

  // seeds: only traders bring them; a harvest gives some back (data/crops.js)
  {id: 'seedBarley', label: 'семена ячменя', short: 'ячмень (сем.)', tags: ['seed'], group: 'Семена', loot: 1, value: 0.5, keep: 30, color: '#d8c27a'},
  {id: 'seedTurnip', label: 'семена репы', short: 'репа (сем.)', tags: ['seed'], group: 'Семена', loot: 1, value: 0.5, keep: 30, color: '#d9b6c8'},
  {id: 'seedFlax',   label: 'семена льна', short: 'лён (сем.)', tags: ['seed'], group: 'Семена', loot: 1, value: 0.5, keep: 30, color: '#8fa8d8'},

  // salt: the outpost has no salt springs, it comes with traders; meat and fish salted with it keep all winter
  {id: 'salt', label: 'соль', short: 'соль', tags: ['spice'], group: 'Заготовки', loot: 2, value: 0.6, keep: 40, color: '#e8e6e0'},

  // healing herbs, picked from rare wild beds (data/plants.js); the healer treats wounds with them
  {id: 'herbs', label: 'лечебные травы', short: 'травы', tags: ['medicine'], group: 'Лекарства', loot: 1, value: 1, keep: 10, target: 10, color: '#e8d25c'},

  // fuel: coal — burnt from logs in the pit or dug from a seam, it is all the same coal. In a furnace
  // (`furnace`) fuel gives heat up to its `tier`: wood (tier 1) melts copper, bronze, gold and silver,
  // iron wants coal (tier 2); one unit of furnace heat takes `per` units of it (settlement/stock.js)
  {id: 'coal', label: 'уголь', short: 'уголь', tags: ['fuel', 'smelt'], group: 'Топливо', burn: 2, heat: 2, loot: 2, value: 0.3, color: '#2f2d2c',
    target: 12, furnace: {tier: 2, per: 1}},

  // ore from the mine
  {id: 'ironore', label: 'железная руда', short: 'руда', tags: ['ore'], group: 'Руда', loot: 1, value: 0.5, color: '#9a5a3c',
    target: 14},
  {id: 'gems',    label: 'самоцветы', short: 'самоцветы', tags: ['ore'], group: 'Руда', loot: 1, value: 4, color: '#7fd3c8',
    target: 6},

  {id: 'bronzeOre',  label: 'медно-оловянная руда', short: 'медн. руда', tags: ['ore'], group: 'Руда', loot: 1, value: 0.4, color: '#c08850', target: 10},
  {id: 'silverOre',  label: 'серебристая руда', short: 'сер. руда', tags: ['ore'], group: 'Руда', loot: 1, value: 1, color: '#c8ccd6', target: 9},
  // mithril: the outpost cannot work it (it needs a magma forge), only dig it and sell it
  {id: 'mithrilOre', label: 'мифриловая руда', short: 'мифрил', tags: ['ore', 'luxury'], group: 'Руда', loot: 1, value: 40, keep: 0, color: '#9fe0ff', target: 99},

  // metal: bars from the furnace
  {id: 'iron',    label: 'железо',  short: 'железо',  tags: ['material', 'metal'], group: 'Металл', loot: 1, value: 2, keep: 8, color: '#a9b0b6'},
  {id: 'bronze',  label: 'бронза',  short: 'бронза',  tags: ['material', 'metal'], group: 'Металл', loot: 1, value: 1.5, keep: 8, color: '#c89048'},

  // ── precious metals. Gold is washed from river sand (data/plants.js 'placer') and now and then dug
  // from a rare quartz vein; silver comes from its ore. Both melt on a wood fire. They are money too:
  // `money` is the share of its price a trader counts it for in a payment (settlement/trade.js) —
  // a bar is easy to weigh and check, dust has to be washed and tested
  {id: 'goldDust',     label: 'золотой песок', short: 'зол. песок', tags: ['precious'], group: 'Деньги', loot: 3, value: 0.7, money: 0.7, sell: false, color: '#e8c860'},
  {id: 'goldNugget',   label: 'золотые самородки', short: 'самородки', tags: ['precious'], group: 'Деньги', loot: 2, value: 9, money: 0.8, sell: false, color: '#f0c840', target: 999},
  {id: 'goldBar',      label: 'слитки золота', short: 'зол. слитки', tags: ['precious', 'metal'], group: 'Деньги', loot: 2, value: 10, money: 0.9, sell: false, color: '#f2c230'},
  {id: 'silverNative', label: 'самородное серебро', short: 'сам. серебро', tags: ['precious'], group: 'Деньги', loot: 2, value: 3, money: 0.75, sell: false, color: '#d8dce4'},
  {id: 'silverBar',    label: 'слитки серебра', short: 'сер. слитки', tags: ['precious', 'metal'], group: 'Деньги', loot: 2, value: 4, money: 0.85, sell: false, keep: 3, color: '#e4e8ee'},

  // luxury goods from the jeweller: kept for trade, they make the colony look rich
  ...LUXURY.all().map(l => ({id: l.id, label: l.label, short: l.short, tags: ['luxury'], group: 'Роскошь', value: l.value, keep: 0, loot: 1, color: l.color})),

  // wax candles: lit at the shrine they make a prayer comfort more (settlement/life.js)
  {id: 'candles', label: 'восковые свечи', short: 'свечи', tags: ['material'], group: 'Быт', loot: 2, value: 0.5, keep: 6, color: '#f0e2a0'},
  // flour from the quern, bread from the hearth
  {id: 'flour', label: 'мука', short: 'мука', tags: ['material'], group: 'Заготовки', loot: 2, value: 0.3, keep: 0, color: '#eee6d0'},
  // ── everyday life: home brew for the evenings (settlement/life.js) and furniture for the solid buildings
  {id: 'braga', label: 'брага', short: 'брага', tags: ['drink'], group: 'Быт', loot: 2, value: 0.6, keepPerHead: 2, color: '#c89a48'},
  ...FURNITURE.all().map(f => ({id: f.id, label: f.label, short: f.label, tags: ['furniture'], group: 'Мебель', loot: 1, value: f.value, sell: false, color: f.color, comfort: f.comfort})),

  // ── keys: town-made tools the outpost cannot make and cannot do without for some crafts. They come
  // only with traders; a building that names one as its `key` (data/buildings.js) takes it into its cost,
  // the others work from the stock (`effects` while it is there, `with` a tame animal of that kind).
  {id: 'pitsaw',     label: 'продольная пила', short: 'пила', tags: ['key'], group: 'Инструменты', loot: 1, value: 4, sell: false, color: '#b9c2c8',
    opens: 'козлы для распила: тёс на избы'},
  {id: 'bellows',    label: 'кузнечные меха', short: 'меха', tags: ['key'], group: 'Инструменты', loot: 1, value: 8, sell: false, color: '#8a6a48',
    opens: 'горн и кузня: топлива на четверть меньше, работа быстрее, кованая вещь порой выходит добротной', useWith: 'smelter'},
  {id: 'anvil',      label: 'наковальня с молотами', short: 'наковальня', tags: ['key'], group: 'Инструменты', loot: 1, value: 16, sell: false, color: '#6e747a',
    opens: 'походная кузня: мечи, копья, ламеллярные доспехи'},
  {id: 'gemtools',   label: 'резцы и лучковое сверло', short: 'резцы', tags: ['key'], group: 'Инструменты', loot: 1, value: 10, sell: false, color: '#58b3a8',
    opens: 'верстак резчика: украшения из самоцветов'},
  {id: 'cupels',     label: 'купели и тигли', short: 'купели', tags: ['key'], group: 'Инструменты', loot: 1, value: 8, sell: false, color: '#b8b0a0',
    opens: 'сыродутный горн: серебро из серебристой руды', useWith: 'smelter'},
  {id: 'ploughshare', label: 'железный лемех', short: 'лемех', tags: ['key'], group: 'Инструменты', loot: 1, value: 6, sell: false, color: '#9aa0a6',
    opens: 'соха с лемехом: с ручным мулом поля родят на треть больше', useWith: 'field',
    with: 'mule', effects: {yield: {barley: 1.3, turnip: 1.3}}},

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
