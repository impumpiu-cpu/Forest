// Field crops. Seeds come only with traders at first; every harvest gives some seed back, so a
// field that is kept sown feeds itself. A crop is one entry here plus its seed resource and what
// it yields (data/resources.js, data/foods.js); the field, sowing, growth and harvest are generic
// (settlement/farming.js).
//
//   seed:     the seed resource one plot takes to sow
//   yields:   what one ripe plot gives, {resource: units}
//   seedBack: seeds one harvested plot gives back (on average)
//   days:     days from sowing to ripe in a season with grow 1 (summer is faster, autumn slower,
//             nothing grows in winter: frost kills what is still in the ground)
//   sow:      seasons it may be sown in
//   need(ctx): how badly the colony wants this crop now (the free plot gets the neediest crop)
//   color:    how a plot looks on the map, sown → ripe
import {Registry} from '../core/registry.js';

export const CROPS = new Registry('crop');

CROPS.registerAll([
  // barley: grain that keeps all winter, porridge at the hearth, straw for bedding
  {id: 'barley', label: 'ячмень', seed: 'seedBarley', yields: {barley: 3, hay: 1}, seedBack: 1.3, days: 24, sow: ['spring', 'summer'],
    need: c => 1 + (c.food < c.pop * 6 ? 0.6 : 0), color: [[96, 120, 60], [214, 190, 110]]},
  // turnips: quick, filling, they keep in a cellar
  {id: 'turnip', label: 'репа', seed: 'seedTurnip', yields: {turnip: 4}, seedBack: 1.2, days: 18, sow: ['spring', 'summer'],
    need: c => 1.1 + (c.food < c.pop * 4 ? 0.8 : 0), color: [[80, 130, 70], [190, 150, 170]]},
  // flax: the fibre for rope and cloth, far more than nettles give
  {id: 'flax', label: 'лён', seed: 'seedFlax', yields: {fiber: 5}, seedBack: 1.3, days: 22, sow: ['spring', 'summer'],
    need: c => (c.stock('fiber') < 20 ? 1.2 : 0.4), color: [[80, 120, 90], [140, 160, 210]]},
]);
