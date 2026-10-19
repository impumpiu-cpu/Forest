// Equipment. Every humanoid (species with `inventory: true`) has four slots:
//   left / right hand — one-handed items take one hand, two-handed items take both;
//   body — armour or clothing; back — any single item (a quiver and a basket work there,
//   anything else is simply carried as a spare and swapped in when needed).
// Harsh neolithic at first: wood, bone, hide and leather. With a mine, a furnace and a forge come
// iron blades (`iron: true`), better and longer-lived; the only iron armour is lamellar. Bronze (`bronze: true`)
// is between: a bronze tool can build a cart, an iron one a wagon (data/transport.js).
//
// Numbers live apart, in data/balance/ (weapons.js, armor.js, gear.js): damage, cooldowns, block,
// armour, warmth, speed, tools, durability, price and tier. An entry here is what the item is; its row
// there is how strong it is and what it costs. A new item needs both (statsFor throws without a row).
//
// Fields here:
//   slot: 'hand' | 'body' | 'back' (where it is worn; any item may also ride on the back)
//   hands: 1 | 2 for hand items
//   ranged: {ammo, boost}  ammo: resource id carried in a quiver (null = picked up anywhere);
//                          boost: a colony modifier from world.mods.best that strengthens the shot
//   holds: {ammo} (back only; how many: `max` in data/balance/gear.js)
//   iron / bronze / silver: what it is made of — for recipes, transport and silver-fearing creatures
//   tradeOnly: the outpost cannot make it, it can only be bought (or found)
//   quality: false — the item has nothing finer work could improve (a basket is a basket)
//   label, short, glyph, color: names and looks
// Fields from data/balance/: melee {dmg, cd}, ranged {dmg, range, cd}, block, armor, warmth, speed,
//   tool {job: ×}, carry, dur, value (price of a plain +0 piece in imperial gold), tier, form
import {Registry} from '../core/registry.js';
import {statsFor} from './balance/index.js';

export const SLOTS = [
  {id: 'left',  label: 'левая рука', hand: true},
  {id: 'right', label: 'правая рука', hand: true},
  {id: 'body',  label: 'тело'},
  {id: 'back',  label: 'спина'},
];

export const ITEMS = new Registry('item');

ITEMS.registerAll([
  // one-handed
  {id: 'club',   label: 'Дубина',  short: 'дубина', slot: 'hand', hands: 1, glyph: 'club'},
  {id: 'spear',  label: 'Копьё с костяным наконечником', short: 'копьё', slot: 'hand', hands: 1, glyph: 'spear'},
  {id: 'axe',    label: 'Топор с костяным клином', short: 'топор', slot: 'hand', hands: 1, glyph: 'axe'},
  {id: 'shield', label: 'Щит из жердей и шкуры', short: 'щит', slot: 'hand', hands: 1, glyph: 'shield'},
  // two-handed
  {id: 'staff',  label: 'Посох',   short: 'посох', slot: 'hand', hands: 2, glyph: 'staff'},
  {id: 'maul',   label: 'Деревянный молот', short: 'молот', slot: 'hand', hands: 2, glyph: 'maul'},
  {id: 'bow',    label: 'Лук',     short: 'лук', slot: 'hand', hands: 2, ranged: {ammo: 'arrows'}, glyph: 'bow'},
  // stones lie everywhere: no ammo, but the sling is far weaker and shorter; a quarry gives better stones
  {id: 'sling',  label: 'Праща',   short: 'праща', slot: 'hand', hands: 2, ranged: {ammo: null, boost: 'slingStones'}, glyph: 'sling'},
  // a rod with a wooden gorge hook and a line of twisted bast; works from the back as well
  {id: 'rod',    label: 'Удочка с деревянным крючком', short: 'удочка', slot: 'hand', hands: 2, glyph: 'rod'},
  // cast in bronze at the furnace on a wood fire: better than bone, short of iron
  {id: 'bronzespear', label: 'Копьё с бронзовым наконечником', short: 'бронз. копьё', slot: 'hand', hands: 1, bronze: true, glyph: 'ironspear'},
  {id: 'bronzeaxe',   label: 'Бронзовый топор', short: 'бронз. топор', slot: 'hand', hands: 1, bronze: true, glyph: 'ironaxe'},
  // iron, from the forge
  {id: 'ironspear', label: 'Копьё с железным наконечником', short: 'жел. копьё', slot: 'hand', hands: 1, iron: true, glyph: 'ironspear'},
  {id: 'ironaxe',   label: 'Железный топор', short: 'жел. топор', slot: 'hand', hands: 1, iron: true, glyph: 'ironaxe'},
  {id: 'sword',     label: 'Железный меч', short: 'меч', slot: 'hand', hands: 1, iron: true, glyph: 'sword'},
  // silver: soft, but what fears silver (vampires) it burns. A dagger cast whole at the furnace on a wood fire,
  // no iron needed; iron blades can also be silvered at the forge (a `silver: true` piece, data/recipes.js)
  {id: 'silverknife', label: 'Серебряный кинжал', short: 'сер. кинжал', slot: 'hand', hands: 1, silver: true, glyph: 'dagger'},
  // body
  // lamellar: small iron plates laced onto a leather coat; heavy, but stops most blows
  {id: 'lamellar',    label: 'Ламеллярный доспех', short: 'ламеляр', slot: 'body', iron: true, color: '#8f989f'},
  // imperial iron armour: the outpost cannot make it, only buy it from a trader (or find it)
  {id: 'chainmail',   label: 'Кольчуга', short: 'кольчуга', slot: 'body', iron: true, tradeOnly: true, color: '#b4bcc2'},
  {id: 'scalemail',   label: 'Чешуйчатый доспех', short: 'чешуя', slot: 'body', iron: true, tradeOnly: true, color: '#9aa0a0'},
  {id: 'clothes',     label: 'Одежда из лубяной ткани', short: 'ткань', slot: 'body', color: '#c9b38a'},
  // the furs the woods give, kept at home: a coat lined with fox fur, the warmest thing the outpost makes
  {id: 'furlined',    label: 'Тулуп на лисьем меху', short: 'тулуп на меху', slot: 'body', color: '#d0844a'},
  // fur: hare and wolf hides sewn hair-in — the winter coat
  {id: 'furcoat',     label: 'Тулуп из шкур', short: 'тулуп', slot: 'body', color: '#b89a72'},
  // homespun wool from the pen's goats: a long coat, warm and not too heavy
  {id: 'woolens',     label: 'Шерстяная свита', short: 'свита', slot: 'body', color: '#cfc4a8'},
  // rough linen from the loom: better than bast, warmer in the cold
  {id: 'linen',       label: 'Холщовая рубаха и порты', short: 'холст', slot: 'body', color: '#ddd2b6'},
  {id: 'jerkin',      label: 'Кожаная куртка', short: 'кожа', slot: 'body', color: '#8a5a2b'},
  {id: 'hardleather', label: 'Кожа с костяными пластинами', short: 'укреплённая кожа', slot: 'body', color: '#e0d6c0'},
  // back
  {id: 'quiver', label: 'Колчан', short: 'колчан', slot: 'back', holds: {ammo: 'arrows'}, quality: false},
  // a wooden pan for washing gold out of the river sand (data/plants.js 'placer')
  {id: 'pan',    label: 'Промывочный лоток', short: 'лоток', slot: 'back', quality: false},
  {id: 'basket', label: 'Заплечный короб', short: 'короб', slot: 'back', quality: false},
].map(statsFor));

export const isHandItem = def => def.slot === 'hand';
export const isWeapon = def => !!(def.melee || def.ranged);
