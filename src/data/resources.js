// Stockpile resources. Tags group them: everything tagged 'food' can be eaten,
// 'fuel' feeds the campfire. A new resource needs only an entry here plus a source (job or animal).
// `map(w, i)` (0..1) shows where it can be gathered on the resource layer, in `mapColor`.
import {Registry} from '../core/registry.js';
import {T} from './terrain.js';

export const RESOURCES = new Registry('resource');

RESOURCES.registerAll([
  {id: 'berries', label: 'ягоды',   short: 'ягоды',   tags: ['food'], nutrition: 1.0, spoil: 1.0, loot: 4, color: '#c45c95',
    map: (w, i) => w.grid.food[i], mapColor: [214, 84, 160]},
  // fish lives in lakes (world/lakes.js); the layer shows how full each lake is
  {id: 'fish', label: 'рыба', short: 'рыба', tags: ['food'], nutrition: 1.1, spoil: 2, loot: 3, color: '#6fa8c8',
    map: (w, i) => { const id = w.grid.lake?.[i]; const l = id >= 0 ? w.lakes[id] : null; return l?.cap ? 0.25 + 0.75 * l.fish / l.cap : 0; },
    mapColor: [96, 176, 236]},
  {id: 'meat',    label: 'мясо',    short: 'мясо',    tags: ['food'], nutrition: 1.3, spoil: 2.5, loot: 3, color: '#d0786a'},
  {id: 'wood',    label: 'древесина', short: 'древесина', tags: ['fuel', 'material'], loot: 4, color: '#a5794a',
    map: (w, i) => (w.grid.terr[i] === T.FOREST ? w.grid.wood[i] : 0), mapColor: [120, 210, 90]},
  {id: 'stone',   label: 'камень',  short: 'камень',  tags: ['material'], loot: 2, color: '#b9b4a6',
    map: (w, i) => (w.grid.terr[i] === T.ROCK ? 1 : 0), mapColor: [215, 210, 196]},
  {id: 'bone',    label: 'кости',   short: 'кости',   tags: ['material'], loot: 1, color: '#e8e2cf'},
  {id: 'hide',    label: 'шкуры',   short: 'шкуры',   tags: ['material'], loot: 1, color: '#9b7650'},
  {id: 'leather', label: 'кожа',    short: 'кожа',    tags: ['material'], loot: 1, color: '#7a4d26'},
  {id: 'arrows',  label: 'стрелы',  short: 'стрелы',  tags: ['ammo'],     loot: 3, color: '#c7b07a'},
]);

export const byTag = tag => RESOURCES.filter(r => r.tags.includes(tag));
