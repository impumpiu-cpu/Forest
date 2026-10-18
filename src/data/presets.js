// Start-menu presets: world sizes, climates, starting stock, raid frequency.
export const SIZES = {
  small:  {w: 96,  h: 72,  label: 'Малый',    note: '96 × 72, быстрый'},
  medium: {w: 128, h: 96,  label: 'Средний',  note: '128 × 96'},
  large:  {w: 192, h: 144, label: 'Большой',  note: '192 × 144'},
  huge:   {w: 256, h: 192, label: 'Огромный', note: '256 × 192, тяжелее для навигации'},
};

// The climate of a site, in numbers (the world map will hand these over per cell, docs/SEAM.md):
//   meanT: yearly mean air temperature, °C;  trange: yearly range (summer midday noon to winter, °C);
//   rain: showers per day;  regrow: plant growth ×;  ign: ignition threshold offset
// The three presets are named points on that scale; the site copies one (world/site.js).
export const CLIMATES = {
  cold:      {label: 'Холодный',   note: 'ночи у нуля, снег три сезона из четырёх, костёр нужен всегда, часто дожди', meanT: 0, trange: 22, ign: 25, regrow: 0.7, rain: 0.5},
  temperate: {label: 'Умеренный',  note: 'тёплые дни, прохладные ночи, снежная зима, дожди через день-два', meanT: 7, trange: 20, ign: 0, regrow: 1, rain: 0.4},
  dry:       {label: 'Засушливый', note: 'жарко, дожди редки, зима без снега, лес вспыхивает легче', meanT: 15, trange: 20, ign: -5, regrow: 0.75, rain: 0.22},
};

// in which season the game begins (the calendar day the colony lands on, data/seasons.js). A group that
// sets out late in the year brings more with it: `stock` × the starting supplies plus `perHead` of preserved
// food and firewood for every settler, and in winter everyone comes dressed (`clothes`); the wild bushes
// are already bare where it is freezing
export const START = {
  spring: {label: 'Весна', day: 0, stock: 1},
  summer: {label: 'Лето', day: 30, stock: 1},
  autumn: {label: 'Осень', day: 60, stock: 1.6, perHead: {jerky: 3, wood: 2}},
  winter: {label: 'Зима', day: 90, stock: 2, clothes: 1, perHead: {jerky: 8, driedFish: 4, wood: 5}},
};

export const LEVELS3 = ['мало', 'обычно', 'много'];

// starting supplies; `kit` items go to the colony's gear store and are handed out at once,
// `clothes` is the share of settlers who arrive dressed
export const STOCKS = {
  poor:   {label: 'Скудные', stock: {berries: 8, wood: 6}, clothes: 0.5, kit: ['sling', 'club']},
  normal: {label: 'Обычные', stock: {berries: 22, wood: 16, bone: 2, hide: 2}, clothes: 1, kit: ['sling', 'sling', 'club', 'spear']},
  rich:   {label: 'Щедрые',  stock: {berries: 45, wood: 35, bone: 6, hide: 4, leather: 2, arrows: 15}, clothes: 1,
    kit: ['bow', 'quiver', 'sling', 'spear', 'shield', 'axe', 'club']},
};

// how far the raiders' camp is (days of travel); the stub checks every dist / 2 days whether a band
// sets out, and it does with `chance` — a test mechanic until the world map decides raids
export const RAIDS = {
  off:   {label: 'Нет',     dist: null},
  rare:  {label: 'Редкие',  dist: 6, chance: 0.6},
  often: {label: 'Частые',  dist: 3, chance: 0.6},
};

export const WILDLIFE = {
  none: {label: 'Нет',   hares: 0},
  few:  {label: 'Мало',  hares: 0.5},
  many: {label: 'Много', hares: 1.2},
};

export const PREDATORS = {
  none: {label: 'Нет',     wolves: 0},
  few:  {label: 'Редко',   wolves: 0.5},
  many: {label: 'Стаи',    wolves: 1},
};

export const DEFAULT_CFG = {
  name: 'Тёплый Брод', seed: '20261010', size: 'medium', water: 1, forest: 1, rock: 1,
  climate: 'temperate', start: 'spring', colonists: 8, stock: 'normal', raids: 'off', wildlife: 'few', predators: 'few', lightning: false,
  windDir: 20, windStr: 35,
};
