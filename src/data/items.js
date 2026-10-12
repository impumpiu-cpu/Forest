// Equipment. Every humanoid (species with `inventory: true`) has four slots:
//   left / right hand — one-handed items take one hand, two-handed items take both;
//   body — armour or clothing; back — any single item (a quiver and a basket work there,
//   anything else is simply carried as a spare and swapped in when needed).
// Harsh neolithic: everything is made of wood, bone, hide and leather.
//
// Fields:
//   slot: 'hand' | 'body' | 'back' (where it is worn; any item may also ride on the back)
//   hands: 1 | 2 for hand items
//   melee:  {dmg, cd}            close combat, dmg multiplies the base blow
//   ranged: {dmg, range, cd, ammo, boost}  ammo: resource id carried in a quiver (null = picked up anywhere);
//                                 boost: a colony modifier from world.mods.best that strengthens the shot
//   block: chance to stop a melee blow (shields, staves)
//   armor: share of damage absorbed; warmth: share of cold kept out; speed: walking multiplier
//   tool: {job: speed multiplier} while working that job (in hands or on the back)
//   carry: extra units carried while harvesting (back only); holds: {ammo, max} (back only)
//   dur: how many uses before it breaks
import {Registry} from '../core/registry.js';

export const SLOTS = [
  {id: 'left',  label: 'левая рука', hand: true},
  {id: 'right', label: 'правая рука', hand: true},
  {id: 'body',  label: 'тело'},
  {id: 'back',  label: 'спина'},
];

export const ITEMS = new Registry('item');

ITEMS.registerAll([
  // one-handed
  {id: 'club',   label: 'Дубина',  short: 'дубина', slot: 'hand', hands: 1, melee: {dmg: 1.3, cd: 12}, dur: 70, glyph: 'club'},
  {id: 'spear',  label: 'Копьё с костяным наконечником', short: 'копьё', slot: 'hand', hands: 1, melee: {dmg: 1.55, cd: 13}, dur: 55, glyph: 'spear'},
  {id: 'axe',    label: 'Топор с костяным клином', short: 'топор', slot: 'hand', hands: 1, melee: {dmg: 1.3, cd: 13}, tool: {chop: 1.6}, dur: 90, glyph: 'axe'},
  {id: 'shield', label: 'Щит из жердей и шкуры', short: 'щит', slot: 'hand', hands: 1, block: 0.32, dur: 35, glyph: 'shield'},
  // two-handed
  {id: 'staff',  label: 'Посох',   short: 'посох', slot: 'hand', hands: 2, melee: {dmg: 1.1, cd: 11}, block: 0.15, speed: 1.05, dur: 80, glyph: 'staff'},
  {id: 'maul',   label: 'Деревянный молот', short: 'молот', slot: 'hand', hands: 2, melee: {dmg: 1.9, cd: 18}, tool: {build: 1.45, mine: 1.35}, dur: 90, glyph: 'maul'},
  {id: 'bow',    label: 'Лук',     short: 'лук', slot: 'hand', hands: 2, melee: {dmg: 0.6, cd: 14},
    ranged: {dmg: 1.7, range: 7, cd: 22, ammo: 'arrows'}, dur: 90, glyph: 'bow'},
  // stones lie everywhere: no ammo, but the sling is far weaker and shorter; a quarry gives better stones
  {id: 'sling',  label: 'Праща',   short: 'праща', slot: 'hand', hands: 2, melee: {dmg: 0.5, cd: 14},
    ranged: {dmg: 0.6, range: 4.5, cd: 20, ammo: null, boost: 'slingStones'}, dur: 60, glyph: 'sling'},
  // a rod with a wooden gorge hook and a line of twisted bast; works from the back as well
  {id: 'rod',    label: 'Удочка с деревянным крючком', short: 'удочка', slot: 'hand', hands: 2, tool: {fish: 1.6}, dur: 80, glyph: 'rod'},
  // body
  {id: 'clothes',     label: 'Одежда из лубяной ткани', short: 'ткань', slot: 'body', armor: 0.08, warmth: 0.35, dur: 50, color: '#c9b38a'},
  {id: 'jerkin',      label: 'Кожаная куртка', short: 'кожа', slot: 'body', armor: 0.2, warmth: 0.55, dur: 70, color: '#8a5a2b'},
  {id: 'hardleather', label: 'Кожа с костяными пластинами', short: 'укреплённая кожа', slot: 'body', armor: 0.35, warmth: 0.45, speed: 0.95, dur: 90, color: '#e0d6c0'},
  // back
  {id: 'quiver', label: 'Колчан', short: 'колчан', slot: 'back', holds: {ammo: 'arrows', max: 15}, dur: Infinity},
  {id: 'basket', label: 'Заплечный короб', short: 'короб', slot: 'back', carry: 2, dur: Infinity},
]);

export const isHandItem = def => def.slot === 'hand';
export const isWeapon = def => !!(def.melee || def.ranged);
