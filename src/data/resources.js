// Stockpile resources. Tags group them: everything tagged 'food' can be eaten,
// 'fuel' feeds the campfire. A new resource needs only an entry here plus a source (job or animal).
import {Registry} from '../core/registry.js';

export const RESOURCES = new Registry('resource');

RESOURCES.registerAll([
  {id: 'berries', label: 'ягоды',   short: 'ягоды',   tags: ['food'], nutrition: 1.0, spoil: 1.0, loot: 4, color: '#c45c95'},
  {id: 'meat',    label: 'мясо',    short: 'мясо',    tags: ['food'], nutrition: 1.3, spoil: 2.5, loot: 3, color: '#d0786a'},
  {id: 'wood',    label: 'дрова',   short: 'дрова',   tags: ['fuel', 'material'], loot: 4, color: '#a5794a'},
  {id: 'stone',   label: 'камень',  short: 'камень',  tags: ['material'], loot: 2, color: '#b9b4a6'},
]);

export const byTag = tag => RESOURCES.filter(r => r.tags.includes(tag));
