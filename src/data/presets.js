// Start-menu presets: world sizes, climates, starting stock, raid frequency.
import {DAY} from '../core/time.js';

export const SIZES = {
  small:  {w: 96,  h: 72,  label: 'Малый',    note: '96 × 72, быстрый'},
  medium: {w: 128, h: 96,  label: 'Средний',  note: '128 × 96'},
  large:  {w: 192, h: 144, label: 'Большой',  note: '192 × 144'},
  huge:   {w: 256, h: 192, label: 'Огромный', note: '256 × 192, тяжелее для навигации'},
};

// tOff: air temperature offset; ign: ignition threshold offset; regrow: plant growth; rain: showers per day
export const CLIMATES = {
  cold:      {label: 'Холодный',   note: 'ночи у нуля, костёр нужен всегда, часто дожди', tOff: -8, ign: 25, regrow: 0.7, rain: 0.5},
  temperate: {label: 'Умеренный',  note: 'тёплые дни, прохладные ночи, дожди через день-два', tOff: 0, ign: 0, regrow: 1, rain: 0.4},
  dry:       {label: 'Засушливый', note: 'жарко, дожди редки, лес вспыхивает легче', tOff: 7, ign: -5, regrow: 0.75, rain: 0.22},
};

export const LEVELS3 = ['мало', 'обычно', 'много'];

export const STOCKS = {
  poor:   {label: 'Скудные', stock: {berries: 8, wood: 6}},
  normal: {label: 'Обычные', stock: {berries: 22, wood: 16}},
  rich:   {label: 'Щедрые',  stock: {berries: 45, wood: 35}},
};

export const RAIDS = {
  off:   {label: 'Нет',     every: 0},
  rare:  {label: 'Редкие',  every: 3 * DAY},
  often: {label: 'Частые',  every: 1.4 * DAY},
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
  climate: 'temperate', colonists: 8, stock: 'normal', raids: 'off', wildlife: 'few', predators: 'few', lightning: false,
  windDir: 20, windStr: 35,
};
