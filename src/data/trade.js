// Traders. Everything about a caravan that can be tuned lives here; settlement/trade.js runs it.
//
// When: the outside world (outside/scripted.js, flow 'caravan') checks on `firstDay` and every
// `everyDays` after it; each time a caravan sets out with `chance`. It leaves the map edge between
// `setOut` hours so that it reaches the camp before the evening council, trades right after the
// council, spends the night by the camp and leaves the next morning (from `leaveHour`).
//
// Who: a trader, `guards` guards with their kit, and 1…3 pack mules. A mule carries `crates` crates
// of `crate` goods each (2 × 10 = 20); each mule is loaded `load` full (0.5…1).
//
// Goods: every unit of a resource and every item takes one place in a crate. What fills a crate is
// drawn from WARES by weight: mostly food and plain things, sometimes finer (+1, +2) pieces and
// imperial iron armour, which the outpost cannot make. +3 pieces are never sold (data/quality.js).
//   {food: true, n}                      — one of the foods (data/foods.js)
//   {resource: [ids], n}                 — one of these stock resources
//   {items: 'plain' | 'any' | [ids], q}  — an item: 'plain' = what the outpost could make itself
//                                          (not tradeOnly, not iron), 'any' = anything that can be finer
//
// Prices are in imperial gold (resource `value`, item `value` + the quality step). A trader asks
// `ask` × the price and pays `bid` × the price, and carries `purse` gold to buy with.
//
// The colony's side (settlement/trade.js): it sells what it has beyond what it keeps (resource
// `keep`, `keepPerHead`), spare pieces from the gear store and all the jeweller's work; then it
// buys food when short and gear that is a real step up for someone, best value for money first,
// and saves the rest of its gold for a later caravan.
//   foodShort: buys food when food in stock is below this × colonists, up to foodUpTo × colonists;
//   foodKeep:  never sells food below this × colonists in all
//   minGain:   an item must improve someone's gear at least this much…
//   maxShare:  …and cost at most this share of the gold in hand (the rest is saved)
//   wants:     what the outpost cannot make but always needs, bought up to this much in stock
export const TRADE = {
  firstDay: 10, everyDays: 10, chance: 0.7,
  setOut: [4, 6], leaveHour: 7, tradeUntil: 23, maxStay: 2,   // days, in case it never gets to trade
  guards: 2, mules: [1, 3], crates: 2, crate: 10, load: [0.5, 1],
  purse: [25, 70], ask: 1.2, bid: 0.7,
  foodShort: 4, foodUpTo: 6, foodKeep: 5, minGain: 0.15, maxShare: 0.85,
  wants: {salt: 12},   // bought whenever the trader has it, up to this much in stock

  WARES: [
    {w: 40, food: true, n: [3, 8]},
    {w: 14, resource: ['leather', 'hide', 'iron', 'charcoal', 'arrows', 'bone'], n: [2, 6]},
    {w: 12, resource: ['salt'], n: [4, 10]},
    {w: 24, items: 'plain', q: 0},
    {w: 12, items: 'any', q: 1},
    {w: 4, items: 'any', q: 2},
    {w: 6, items: ['chainmail', 'scalemail'], q: 0},
  ],

  // the guards' kit: imperial iron armour, a finer sword and shield
  guardKit: [{type: 'sword', q: 1}, {type: 'shield', q: 1}, {type: 'chainmail', q: 0}],
  guardHp: 1.4,

  traderNames: [['Аврелий', 'm'], ['Флавий', 'm'], ['Марциан', 'm'], ['Луций', 'm'], ['Гай', 'm'], ['Публий', 'm'], ['Корнелия', 'f'], ['Ливия', 'f']],
  guardNames: [['Квинт', 'm'], ['Сервий', 'm'], ['Децим', 'm'], ['Тит', 'm'], ['Секст', 'm'], ['Маний', 'm']],
};
