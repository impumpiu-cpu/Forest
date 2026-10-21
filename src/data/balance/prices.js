// Prices: every cost and every money coefficient of the game in one place, in imperial gold.
// Balance against it the way the strength rating is balanced against data/balance/creatures.js:
// `npm run items` shows every item's price beside its power, the fitted price curve and what it is made of.
//
//   RESOURCES — one unit of each stock resource: `price`, and `stack` — how many units share one place
//               (a crate place in a caravan, settlement/trade.js): food, ingredients and small things stack,
//               bulky and single things do not (1). `money` — precious metal counted as payment at this
//               share of its price (settlement/precious.js, settlement/trade.js).
//   ITEMS     — how an item's price is made from its form and material (data/balance/forms.js, materials.js):
//                 price = (parts + work) × (1 + protection × (armour + block)) × rarity of the material,
//                         rounded to `round`
//                 parts  = Σ of the resources one piece takes (`parts` of the form; 'material' — the
//                          material's own resource) at their prices here
//                 work   = the form's labour in ticks / 1000 × `labour` gold × the material's `labour`
//               Items never stack: one piece, one place (`stack`).
//   QUALITY   — what a finer piece (+1…+4, data/quality.js) costs on top of a plain one: weapons, tools and
//               the rest — `weapon`; body armour and shields, a rarity higher after the 5th-edition habit — `armor`
//   SERVICES  — prices of work done on a thing (silvering an iron blade)
//   TRADE     — the outpost's caravans (data/trade.js): what the trader asks and pays × the price, haggling,
//               the gold he carries
//   CAMPAIGN  — the caravan of the campaign (data/market.js, data/bubble.js, data/quest.js): towns' terms,
//               food, spoils, wages, beasts, carts and services
export const RESOURCES = {
  // Еда
  berries:      {price: 0.2, stack: 20},
  fish:         {price: 0.3, stack: 20},
  meat:         {price: 0.4, stack: 20},
  honey:        {price: 1, stack: 20},
  barley:       {price: 0.25, stack: 20},
  turnip:       {price: 0.2, stack: 20},
  milk:         {price: 0.2, stack: 20},
  bread:        {price: 0.4, stack: 20},
  kasha:        {price: 0.6, stack: 20},
  stew:         {price: 0.8, stack: 20},
  // Заготовки
  cheese:       {price: 1.2, stack: 20},
  driedBerries: {price: 0.4, stack: 20},
  driedFish:    {price: 0.5, stack: 20},
  jerky:        {price: 0.6, stack: 20},
  saltFish:     {price: 0.6, stack: 20},
  saltMeat:     {price: 0.7, stack: 20},
  salt:         {price: 0.6, stack: 20},
  flour:        {price: 0.3, stack: 20},
  // Материалы
  wood:         {price: 0.1, stack: 10},
  stone:        {price: 0.1, stack: 10},
  bone:         {price: 0.2, stack: 10},
  hide:         {price: 0.5, stack: 10},
  leather:      {price: 1, stack: 10},
  silk:         {price: 3, stack: 10},
  feathers:     {price: 4, stack: 10},
  scales:       {price: 8, stack: 10},
  // Реагенты
  venom:        {price: 3, stack: 10},
  bile:         {price: 3, stack: 10},
  slime:        {price: 1.5, stack: 10},
  gland:        {price: 6, stack: 10},
  // Ремесло
  fiber:        {price: 0.15, stack: 20},
  rope:         {price: 0.6, stack: 20},
  cloth:        {price: 1.2, stack: 20},
  reeds:        {price: 0.1, stack: 20},
  clay:         {price: 0.1, stack: 20},
  pots:         {price: 0.8, stack: 20},
  planks:       {price: 0.5, stack: 20},
  hay:          {price: 0.1, stack: 20},
  wool:         {price: 0.8, stack: 20},
  // Роскошь
  furs:         {price: 3, stack: 10},
  wax:          {price: 1.5, stack: 10},
  jewelBone:    {price: 8, stack: 10},
  jewelWood:    {price: 7, stack: 10},
  jewelStone:   {price: 9, stack: 10},
  jewelIron:    {price: 14, stack: 10},
  // Семена
  seedBarley:   {price: 0.5, stack: 50},
  seedTurnip:   {price: 0.5, stack: 50},
  seedFlax:     {price: 0.5, stack: 50},
  // Лекарства
  herbs:        {price: 1, stack: 20},
  // Топливо
  coal:         {price: 0.3, stack: 20},
  // Руда
  ironore:      {price: 0.5, stack: 10},
  gems:         {price: 4, stack: 10},
  bronzeOre:    {price: 0.4, stack: 10},
  silverOre:    {price: 1, stack: 10},
  mithrilOre:   {price: 40, stack: 10},
  // Металл
  iron:         {price: 2, stack: 20},
  bronze:       {price: 1.5, stack: 20},
  // Путы (data/captives.js)
  shacklesBronze: {price: 4, stack: 10},
  shacklesIron:   {price: 5, stack: 10},
  shacklesSteel:  {price: 9, stack: 10},
  shacklesMithril: {price: 40, stack: 10},
  // Деньги
  goldDust:     {price: 0.7, stack: 50, money: 0.7},
  goldNugget:   {price: 9, stack: 50, money: 0.8},
  goldBar:      {price: 10, stack: 50, money: 0.9},
  silverNative: {price: 3, stack: 50, money: 0.75},
  silverBar:    {price: 4, stack: 50, money: 0.85},
  gold:         {price: 1, stack: 100},
  // Быт
  candles:      {price: 0.5, stack: 20},
  braga:        {price: 0.6, stack: 10},
  // Мебель
  bench:        {price: 1, stack: 1},
  table:        {price: 2, stack: 1},
  rug:          {price: 4, stack: 1},
  chest:        {price: 5, stack: 1},
  bell:         {price: 6, stack: 1},
  casket:       {price: 7, stack: 1},
  mirror:       {price: 12, stack: 1},
  tapestry:     {price: 10, stack: 1},
  lamp:         {price: 7, stack: 1},
  // Инструменты
  pitsaw:       {price: 4, stack: 1},
  bellows:      {price: 8, stack: 1},
  anvil:        {price: 16, stack: 1},
  gemtools:     {price: 10, stack: 1},
  cupels:       {price: 8, stack: 1},
  ploughshare:  {price: 6, stack: 1},
  // Боеприпасы
  arrows:       {price: 0.1, stack: 30},
};

export const ITEMS = {
  labour: 1.5,        // gold for 1000 ticks of a craftsman's work (a spear: 700 ticks, a coat of mail: 3000)
  // what protects costs more: × (1 + protection × (armour + block)) — mail (0.55) twice its making, a shield
  // half as much again; the 5th-edition habit of armour standing a step above weapons
  protection: 2,
  // the 5th-edition step: what a material's rarity multiplies the price by
  rarity: {common: 1, uncommon: 2, rare: 5, veryRare: 15, legendary: 50},
  round: 0.5,         // prices are rounded to this
  stack: 1,           // weapons, armour, tools, clothing: one piece, one place
};

export const QUALITY = {
  1: {weapon: 10,   armor: 25},     // добротное — uncommon
  2: {weapon: 60,   armor: 150},    // мастерское
  3: {weapon: 400,  armor: 900},    // редкое
  4: {weapon: 3000, armor: 6000},   // эпическое
};

export const SERVICES = {
  silvering: 5,       // a silvered iron blade costs this much more than a plain one
};

export const TRADE = {
  ask: 1.2, bid: 0.7,  // the trader sells at ask × the price and buys at bid × the price
  haggle: 0.1,         // a good or a bad negotiator moves both by up to this (data/trade.js)
  purse: [25, 70],     // gold the trader carries to buy with
  mithrilPurse: 35,    // more gold per unit of mithril in the colony's stock (up to 3): the rumour draws a buyer
};

export const CAMPAIGN = {
  // how a town stands to the caravan's realm: × on what the caravan pays and gets
  standing: {own: {buy: 0.9, sell: 0.8}, friend: {buy: 1.15, sell: 0.7}},
  // a ration of road food; a town that feeds itself well sells it cheaper — × (food − feeds × its food effect),
  // never below `floor`
  ration: 0.25, food: {base: 1.4, feeds: 0.6, floor: 0.7},
  spoils: 0.5,                                              // worn arms and armour from fights: × their price
  sellBonus: {tannery: {hide: 1.3}, market: {all: 1.15}},   // a tannery pays more for hides, a market for everything
  // gold a day for work in town; × (1 + perTier × the tool's metal)
  wages: {squire: 0.45, knight: 0.4, other: 0.3, perTier: 0.25},
  beasts: {horse: 20, mule: 12, camel: 20},
  vehicles: {cart: 10, wagon: 25},
  services: {healerhut: 15, forge: 30, crafthut: 12},       // a town's building put to the caravan's use
  hires: {guide: 0.6, sellsword: 0.9},                      // a day
  companionFee: 8,
  rumour: 3,                                                // a rumour of the quest bought in a tavern
  train: {buy: 1.6, sell: 0.55},                            // a passing train on the road: × the price
};

export const PRICES = {RESOURCES, ITEMS, QUALITY, SERVICES, TRADE, CAMPAIGN};
