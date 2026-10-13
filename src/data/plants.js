// Wild plants that are gathered from the map, other than berries (berry bushes are older and live
// in world/fields.js). Each plant gets its own layer on the grid (grid['plant:<id>'], 0…1 ripeness)
// on a few scattered beds, regrows there by itself and is dug up by a job that names it:
// a job with nav 'plant:<id>' walks to ripe beds (the flow field is made from this list).
// A new plant is one entry here plus its stock resource; the layer, regrowth, flow field, map tint
// and resource layer come by themselves (world/plants.js).
//
//   resource:  the stock resource one picking brings home
//   terrain:   where beds can be;  fertMin: only on ground at least this fertile
//   chance:    share of such cells that get a bed when the world is made (keep it rare)
//   start:     ripeness at the start, [min, max];  regrow: ripeness gained per tick
//   ripe:      worth walking to from this ripeness;  take: ripeness one picking removes
//   tint:      colour mixed into the ground on the world layer; mapColor: on the resource layer
import {Registry} from '../core/registry.js';

export const PLANTS = new Registry('plant');

PLANTS.registerAll([
  // healing herbs: yarrow, plantain, St John's wort — a few patches in damp meadows and glades
  {id: 'herbs', resource: 'herbs', label: 'лечебные травы', terrain: ['grass', 'forest'], fertMin: 0.5, chance: 0.006,
    start: [0.4, 1], regrow: 0.0006, ripe: 0.45, take: 0.5, tint: [236, 214, 92], mapColor: [255, 236, 96]},
]);

export const plantLayer = id => 'plant:' + id;
