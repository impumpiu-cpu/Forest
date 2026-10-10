// Terrain types. `code` is what the grid stores (Uint8Array), so codes must stay unique and small.
import {Registry} from '../core/registry.js';

export const TERRAIN = new Registry('terrain');

TERRAIN.registerAll([
  {id: 'water',  code: 0, label: 'вода',  walkable: false, pathCost: 0,   speed: 1,   fuel: 0,
    color: (h) => [30 + h * 40, 64 + h * 60, 86 + h * 50]},
  {id: 'grass',  code: 1, label: 'трава', walkable: true,  pathCost: 1,   speed: 1,   fuel: 0.4,
    color: (h, f) => [98 - f * 26 + h * 20, 112 + f * 18 + h * 16, 56 - f * 8]},
  {id: 'forest', code: 2, label: 'лес',   walkable: true,  pathCost: 1.6, speed: 0.7, fuel: 1.2,
    color: (h, f, wood) => [40 + (1 - wood) * 30, 70 + (1 - wood) * 30, 40 + (1 - wood) * 8]},
  {id: 'rock',   code: 3, label: 'скала', walkable: false, pathCost: 0,   speed: 1,   fuel: 0,
    color: (h) => [100 + h * 30, 97 + h * 28, 88 + h * 24]},
  {id: 'burnt',  code: 4, label: 'гарь',  walkable: true,  pathCost: 1,   speed: 1,   fuel: 0,
    color: () => [50, 43, 37]},
]);

// numeric codes for hot loops
export const T = {WATER: 0, GRASS: 1, FOREST: 2, ROCK: 3, BURNT: 4};

// lookup tables indexed by code, built once from the registry
export const BY_CODE = [];
for (const d of TERRAIN.all()) BY_CODE[d.code] = d;
export const WALKABLE = Uint8Array.from(BY_CODE.map(d => (d.walkable ? 1 : 0)));
