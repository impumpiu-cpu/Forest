// Equipment. Every humanoid (species with `inventory: true`) has four slots:
//   left / right hand — one-handed items take one hand, two-handed items take both;
//   body — armour or clothing; back — any single item (a quiver and a basket work there,
//   anything else is simply carried as a spare and swapped in when needed).
// Harsh neolithic at first: wood, bone, hide and leather. With a mine, a furnace and a forge come
// iron blades (`iron: true`), better and longer-lived; the only iron armour is lamellar.
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
//   value: price of a plain (+0) piece in imperial gold; finer pieces cost more (data/quality.js)
//   tradeOnly: the outpost cannot make it, it can only be bought (or found)
//   quality: false — the item has nothing finer work could improve (a basket is a basket)
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
  {id: 'club',   label: 'Дубина',  short: 'дубина', slot: 'hand', hands: 1, melee: {dmg: 1.3, cd: 12}, dur: 70, value: 0.5, glyph: 'club'},
  {id: 'spear',  label: 'Копьё с костяным наконечником', short: 'копьё', slot: 'hand', hands: 1, melee: {dmg: 1.55, cd: 13}, dur: 55, value: 1, glyph: 'spear'},
  {id: 'axe',    label: 'Топор с костяным клином', short: 'топор', slot: 'hand', hands: 1, melee: {dmg: 1.3, cd: 13}, tool: {chop: 1.6}, dur: 90, value: 2, glyph: 'axe'},
  {id: 'shield', label: 'Щит из жердей и шкуры', short: 'щит', slot: 'hand', hands: 1, block: 0.32, dur: 35, value: 3, glyph: 'shield'},
  // two-handed
  {id: 'staff',  label: 'Посох',   short: 'посох', slot: 'hand', hands: 2, melee: {dmg: 1.1, cd: 11}, block: 0.15, speed: 1.05, dur: 80, value: 0.5, glyph: 'staff'},
  {id: 'maul',   label: 'Деревянный молот', short: 'молот', slot: 'hand', hands: 2, melee: {dmg: 1.9, cd: 18}, tool: {build: 1.45, mine: 1.35}, dur: 90, value: 2, glyph: 'maul'},
  {id: 'bow',    label: 'Лук',     short: 'лук', slot: 'hand', hands: 2, melee: {dmg: 0.6, cd: 14},
    ranged: {dmg: 1.7, range: 7, cd: 22, ammo: 'arrows'}, dur: 90, value: 5, glyph: 'bow'},
  // stones lie everywhere: no ammo, but the sling is far weaker and shorter; a quarry gives better stones
  {id: 'sling',  label: 'Праща',   short: 'праща', slot: 'hand', hands: 2, melee: {dmg: 0.5, cd: 14},
    ranged: {dmg: 0.6, range: 4.5, cd: 20, ammo: null, boost: 'slingStones'}, dur: 60, value: 0.5, glyph: 'sling'},
  // a rod with a wooden gorge hook and a line of twisted bast; works from the back as well
  {id: 'rod',    label: 'Удочка с деревянным крючком', short: 'удочка', slot: 'hand', hands: 2, tool: {fish: 1.6}, dur: 80, value: 1, glyph: 'rod'},
  // iron, from the forge
  {id: 'ironspear', label: 'Копьё с железным наконечником', short: 'жел. копьё', slot: 'hand', hands: 1, iron: true, melee: {dmg: 1.95, cd: 12}, dur: 120, value: 4, glyph: 'ironspear'},
  {id: 'ironaxe',   label: 'Железный топор', short: 'жел. топор', slot: 'hand', hands: 1, iron: true, melee: {dmg: 1.7, cd: 12}, tool: {chop: 2.2, build: 1.15}, dur: 160, value: 4, glyph: 'ironaxe'},
  {id: 'sword',     label: 'Железный меч', short: 'меч', slot: 'hand', hands: 1, iron: true, melee: {dmg: 2.15, cd: 11}, block: 0.1, dur: 150, value: 6, glyph: 'sword'},
  // body
  // lamellar: small iron plates laced onto a leather coat; heavy, but stops most blows
  {id: 'lamellar',    label: 'Ламеллярный доспех', short: 'ламеляр', slot: 'body', iron: true, armor: 0.5, warmth: 0.4, speed: 0.93, dur: 170, value: 30, color: '#8f989f'},
  // imperial iron armour: the outpost cannot make it, only buy it from a trader (or find it)
  {id: 'chainmail',   label: 'Кольчуга', short: 'кольчуга', slot: 'body', iron: true, tradeOnly: true, armor: 0.55, warmth: 0.3, speed: 0.95, dur: 220, value: 40, color: '#b4bcc2'},
  {id: 'scalemail',   label: 'Чешуйчатый доспех', short: 'чешуя', slot: 'body', iron: true, tradeOnly: true, armor: 0.48, warmth: 0.35, speed: 0.94, dur: 190, value: 25, color: '#9aa0a0'},
  {id: 'clothes',     label: 'Одежда из лубяной ткани', short: 'ткань', slot: 'body', armor: 0.08, warmth: 0.35, dur: 50, value: 1, color: '#c9b38a'},
  // fur: hare and wolf hides sewn hair-in — the winter coat
  {id: 'furcoat',     label: 'Тулуп из шкур', short: 'тулуп', slot: 'body', armor: 0.14, warmth: 0.85, speed: 0.97, dur: 80, value: 4, color: '#b89a72'},
  // homespun wool from the pen's goats: a long coat, warm and not too heavy
  {id: 'woolens',     label: 'Шерстяная свита', short: 'свита', slot: 'body', armor: 0.1, warmth: 0.7, dur: 110, value: 5, color: '#cfc4a8'},
  // rough linen from the loom: better than bast, warmer in the cold
  {id: 'linen',       label: 'Холщовая рубаха и порты', short: 'холст', slot: 'body', armor: 0.1, warmth: 0.45, dur: 90, value: 3, color: '#ddd2b6'},
  {id: 'jerkin',      label: 'Кожаная куртка', short: 'кожа', slot: 'body', armor: 0.2, warmth: 0.55, dur: 70, value: 3, color: '#8a5a2b'},
  {id: 'hardleather', label: 'Кожа с костяными пластинами', short: 'укреплённая кожа', slot: 'body', armor: 0.35, warmth: 0.45, speed: 0.95, dur: 90, value: 9, color: '#e0d6c0'},
  // back
  {id: 'quiver', label: 'Колчан', short: 'колчан', slot: 'back', holds: {ammo: 'arrows', max: 15}, dur: Infinity, value: 1, quality: false},
  {id: 'basket', label: 'Заплечный короб', short: 'короб', slot: 'back', carry: 2, dur: Infinity, value: 1, quality: false},
]);

export const isHandItem = def => def.slot === 'hand';
export const isWeapon = def => !!(def.melee || def.ranged);
