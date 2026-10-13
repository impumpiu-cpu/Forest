// Ore veins in the rocks. Each kind names the stock resource a miner brings home (data/resources.js),
// so a new ore is one entry here plus its resource; the mine, the resource layer, the map tint,
// the cell card and the legend pick it up by themselves.
//
//   code:     what the grid stores (Uint8Array); must stay unique, small and unchanged once used in saves
//   resource: the stock resource dug from it; its `target` says how much the colony likes to keep
//   tint:     colour mixed into the rock on the world layer; mapColor: colour on the resource layer
//   vein:     how veins are laid out, tried in list order on every rock cell (the first that fits wins):
//     {seam: noise cell size, above: threshold 0..1, amount: [min, max]} — broad seams
//     {pocket: chance per rock cell, amount: [min, max]}                  — scattered pockets
//   reach:    at least this many units should be reachable on the rock face; if a map has fewer,
//             a small vein of `plant` cells × `plantAmount` units is placed there
import {Registry} from '../core/registry.js';

export const ORES = new Registry('ore');

ORES.registerAll([
  {id: 'iron', code: 1, resource: 'ironore', label: 'железная руда', tint: [176, 92, 56], mapColor: [196, 102, 64],
    vein: {seam: 7, above: 0.66, amount: [6, 12]}, reach: 12, plant: 5, plantAmount: 8},
  {id: 'coal', code: 2, resource: 'coal', label: 'каменный уголь', tint: [44, 44, 52], mapColor: [70, 70, 84],
    vein: {seam: 8, above: 0.68, amount: [6, 12]}, reach: 12, plant: 5, plantAmount: 8},
  {id: 'gems', code: 3, resource: 'gems', label: 'самоцветы', tint: [110, 214, 198], mapColor: [120, 230, 214],
    vein: {pocket: 0.035, amount: [2, 4]}, reach: 4, plant: 2, plantAmount: 3},
]);

// lookup by the code stored in the grid
export const ORE_BY_CODE = [];
for (const o of ORES.all()) {
  if (ORE_BY_CODE[o.code]) throw new Error(`ore: duplicate code ${o.code}`);
  ORE_BY_CODE[o.code] = o;
}
