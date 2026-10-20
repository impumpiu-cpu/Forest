// Materials: what a thing is made of. An item is a form × a material (data/balance/forms.js, data/items.js):
// one new row here and every form that takes its class is there in it — iron spears, iron swords, iron mail.
//
//   class    — which forms take it: a form lists the classes it can be made of (`of`)
//   tier     — the material step: 0 wood, bone, hide, cloth · 1 bronze, silver · 2 iron · 3 steel (later) · 4 mithril
//   rarity   — common | uncommon | rare | veryRare | legendary: × to the price (data/balance/prices.js rarity),
//              after the 5th-edition habit; and only what is not rare is carried by traders (`sold`)
//   resource — the stock resource it is counted in for the price (data/balance/prices.js resources);
//              amount — how many units of it one unit of a form's 'material' part is (1 when left out)
//   labour   — × to the work a piece of it costs (iron is harder to work than bone)
//   flags    — copied onto every item of it: iron / bronze / silver (recipes, transport, what fears silver)
//   adj, short — its word for the names: {m, f, n, ins} (железный, железная, железное, железным), 'жел.'
//   color    — the colour of armour made of it (a form may name its own)
//   × multipliers on what a form gives (forms.js says at which material its numbers stand; 1 when left out):
//     dmg — blow and shot · swing — cooldown (lower is faster) · dur — durability · work — a tool's bonus
//     armor — armour · block — a shield's block · warmth — warmth · weight — how much armour slows
//
// After an edit: `npm run items` (power, prices, what overlaps), `npm run arena` (duels and strength).
const adj = (m, f, n, ins) => ({m, f, n, ins});

export const MATERIALS = {
  // tier 0: what the woods give
  wood:    {class: ['wood'], tier: 0, rarity: 'common', resource: 'wood', labour: 1, adj: adj('деревянный', 'деревянная', 'деревянное', 'деревянным'), short: 'дер.', color: '#a5794a'},
  bone:    {class: ['bone'], tier: 0, rarity: 'common', resource: 'bone', labour: 1, adj: adj('костяной', 'костяная', 'костяное', 'костяным'), short: 'кост.', color: '#e0d6c0',
    warmth: 1.12},
  hide:    {class: ['hide', 'fur'], tier: 0, rarity: 'common', resource: 'hide', labour: 1, adj: adj('кожаный', 'кожаная', 'кожаное', 'кожаным'), short: 'шкур.', color: '#b89a72'},
  foxfur:  {class: ['fur'], tier: 0, rarity: 'common', resource: 'furs', labour: 1.1, adj: adj('меховой', 'меховая', 'меховое', 'меховым'), short: 'мех.', color: '#d0844a',
    armor: 1.14, warmth: 1.12, dur: 1.25},
  leather: {class: ['leather'], tier: 0, rarity: 'common', resource: 'leather', labour: 1, adj: adj('кожаный', 'кожаная', 'кожаное', 'кожаным'), short: 'кож.', color: '#8a5a2b'},
  bast:    {class: ['cloth'], tier: 0, rarity: 'common', resource: 'wood', labour: 1, adj: adj('лубяной', 'лубяная', 'лубяное', 'лубяным'), short: 'луб.', color: '#c9b38a'},
  linen:   {class: ['cloth'], tier: 0, rarity: 'common', resource: 'cloth', amount: 0.67, labour: 1, adj: adj('холщовый', 'холщовая', 'холщовое', 'холщовым'), short: 'холщ.', color: '#ddd2b6',
    armor: 1.25, warmth: 1.29, dur: 1.8},
  wool:    {class: ['cloth'], tier: 0, rarity: 'common', resource: 'wool', amount: 1.33, labour: 1, adj: adj('шерстяной', 'шерстяная', 'шерстяное', 'шерстяным'), short: 'шерст.', color: '#cfc4a8',
    armor: 1.25, warmth: 2, dur: 2.2},
  reed:    {class: ['weave'], tier: 0, rarity: 'common', resource: 'reeds', labour: 1, adj: adj('плетёный', 'плетёная', 'плетёное', 'плетёным'), short: 'плет.', color: '#c2b46a'},
  // tier 1: cast at the furnace on a wood fire
  bronze:  {class: ['metal'], tier: 1, rarity: 'common', resource: 'bronze', labour: 1.2, flags: {bronze: true}, adj: adj('бронзовый', 'бронзовая', 'бронзовое', 'бронзовым'), short: 'бронз.', color: '#c89048',
    dmg: 1.13, swing: 1, dur: 1.5, work: 1.5, armor: 1.2, block: 1.15, warmth: 1.05, weight: 1.3},
  // soft: no good for a spear or a sword, but what fears silver it burns
  silver:  {class: ['silver'], tier: 1, rarity: 'uncommon', resource: 'silverBar', labour: 1.2, flags: {silver: true}, adj: adj('серебряный', 'серебряная', 'серебряное', 'серебряным'), short: 'сер.', color: '#d8dce4',
    dmg: 1.05, swing: 1, dur: 1.2, work: 1.2, armor: 1.1, block: 1.05, warmth: 1, weight: 1.4},
  // tier 2: forged iron
  iron:    {class: ['metal'], tier: 2, rarity: 'common', resource: 'iron', labour: 1.5, flags: {iron: true}, adj: adj('железный', 'железная', 'железное', 'железным'), short: 'жел.', color: '#9aa0a6',
    dmg: 1.27, swing: 0.93, dur: 2, work: 2, armor: 1.43, block: 1.25, warmth: 1, weight: 1.4},
  // tier 4: the outpost cannot work it (it needs a magma forge): only found, taken or bought far away
  mithril: {class: ['metal'], tier: 4, rarity: 'rare', resource: 'mithrilOre', labour: 3, adj: adj('мифриловый', 'мифриловая', 'мифриловое', 'мифриловым'), short: 'мифр.', color: '#9fe0ff',
    dmg: 1.75, swing: 0.88, dur: 4, work: 3, armor: 1.8, block: 1.4, warmth: 1, weight: 0.6},
};
