// Luxury goods from the jeweller: a gem set into another material. Each entry becomes a stock
// resource tagged 'luxury' (data/resources.js) and a jeweller's recipe (data/recipes.js), so a new
// piece is one line here.
//
//   gems:    how many gems go into one piece      setting: the other materials, {resource: units}
//   work:    labour for one piece                 value:   what a trader will pay (for later)
//   want:    how keen the jeweller is on it while there are none; every piece in stock lowers it by `fade`
import {Registry} from '../core/registry.js';

export const LUXURY = new Registry('luxury');

LUXURY.registerAll([
  {id: 'jewelBone',  label: 'костяные бусы с самоцветами', short: 'бусы', color: '#efe2c4',
    gems: 1, setting: {bone: 2}, work: 500, value: 8, want: 1.4, fade: 0.12},
  {id: 'jewelWood',  label: 'резные шкатулки с инкрустацией', short: 'шкатулки', color: '#c08a4a',
    gems: 1, setting: {wood: 3}, work: 450, value: 7, want: 1.3, fade: 0.12},
  {id: 'jewelStone', label: 'каменные идолы с глазами-самоцветами', short: 'идолы', color: '#c9c3b3',
    gems: 1, setting: {stone: 3}, work: 550, value: 9, want: 1.35, fade: 0.12},
  {id: 'jewelIron',  label: 'железные гривны с самоцветами', short: 'гривны', color: '#d6dde2',
    gems: 1, setting: {iron: 1}, work: 600, value: 14, want: 1.5, fade: 0.15},
]);
