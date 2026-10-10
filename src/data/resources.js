// Stockpile resources. Tags group them: everything tagged 'food' can be eaten,
// 'fuel' feeds the campfire. A new resource needs only an entry here plus a source (job or animal).
import {Registry} from '../core/registry.js';

export const RESOURCES = new Registry('resource');

RESOURCES.registerAll([
  {id: 'berries', label: 'ягоды',   short: 'ягоды',   tags: ['food'], nutrition: 1.0, spoil: 1.0, loot: 4, color: '#c45c95'},
  {id: 'meat',    label: 'мясо',    short: 'мясо',    tags: ['food'], nutrition: 1.3, spoil: 2.5, loot: 3, color: '#d0786a'},
  {id: 'wood',    label: 'дрова',   short: 'дрова',   tags: ['fuel', 'material'], loot: 4, color: '#a5794a'},
  {id: 'stone',   label: 'камень',  short: 'камень',  tags: ['material'], loot: 2, color: '#b9b4a6'},
  {id: 'bone',    label: 'кости',   short: 'кости',   tags: ['material'], loot: 1, color: '#e8e2cf'},
  {id: 'hide',    label: 'шкуры',   short: 'шкуры',   tags: ['material'], loot: 1, color: '#9b7650'},
  {id: 'leather', label: 'кожа',    short: 'кожа',    tags: ['material'], loot: 1, color: '#7a4d26'},
  {id: 'arrows',  label: 'стрелы',  short: 'стрелы',  tags: ['ammo'],     loot: 3, color: '#c7b07a'},
]);

export const byTag = tag => RESOURCES.filter(r => r.tags.includes(tag));
