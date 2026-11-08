// Terrain types. `code` is what the grid stores (Uint8Array), so codes must stay unique and small.
// Systems ask a cell's terrain for its properties through BY_CODE[code] rather than comparing codes,
// so a new kind of ground is one more record here (the generator paints it from the site's biomes,
// world/site.js). The hot-loop constants T.* stay for the four kinds every system knows.
//
//   kind:      ground | wood | rock | water — what the cell is for everyone (lakes are water,
//              miners dig rock, lumberjacks fell wood; ground is where people live)
//   walkable, pathCost, speed: movement;  fuel: how much a bare cell of it burns (0: never catches)
//   open:      bare ground that can be built on, tilled and planted (not a bog)
//   bush:      how readily berry bushes sprout here (× the base chance);  wood: how readily it turns to forest
//   graze:     how much of a meadow it is for hares and goats (the land's capacity for grazers)
//   shelter:   vermin hide here (thickets, reeds)
//   wet:       bog: hard to ignite and chokes flames (0..1)
//   tint:      the season colours it (autumn gold, winter snow)
//   color:     (height, fertility, wood) → [r, g, b]
import {Registry} from '../core/registry.js';

export const TERRAIN = new Registry('terrain');

TERRAIN.registerAll([
  {id: 'water',  code: 0, label: 'вода',  kind: 'water',  walkable: false, pathCost: 0,   speed: 1,   fuel: 0,
    open: false, bush: 0, wood: 0, graze: 0, shelter: false, wet: 1, tint: false,
    color: (h) => [30 + h * 40, 64 + h * 60, 86 + h * 50]},
  {id: 'grass',  code: 1, label: 'трава', kind: 'ground', walkable: true,  pathCost: 1,   speed: 1,   fuel: 0.4,
    open: true, bush: 1, wood: 1, graze: 1, shelter: false, wet: 0, tint: true,
    color: (h, f) => [98 - f * 26 + h * 20, 112 + f * 18 + h * 16, 56 - f * 8]},
  {id: 'forest', code: 2, label: 'лес',   kind: 'wood',   walkable: true,  pathCost: 1.6, speed: 0.7, fuel: 1.2,
    open: false, bush: 0, wood: 0, graze: 0, shelter: true, wet: 0, tint: true,
    color: (h, f, wood) => [40 + (1 - wood) * 30, 70 + (1 - wood) * 30, 40 + (1 - wood) * 8]},
  {id: 'rock',   code: 3, label: 'скала', kind: 'rock',   walkable: false, pathCost: 0,   speed: 1,   fuel: 0,
    open: false, bush: 0, wood: 0, graze: 0, shelter: false, wet: 0, tint: false,
    color: (h) => [100 + h * 30, 97 + h * 28, 88 + h * 24]},
  {id: 'burnt',  code: 4, label: 'гарь',  kind: 'ground', walkable: true,  pathCost: 1,   speed: 1,   fuel: 0,
    open: true, bush: 0, wood: 0, graze: 0, shelter: false, wet: 0, tint: true,
    color: () => [50, 43, 37]},
  // ── painted from the site's biomes (world/site.js)
  // bog: slow going, never burns, reeds and clay, a hiding place for rats and kikimoras; nothing is built on it
  {id: 'swamp',  code: 5, label: 'топь',  kind: 'ground', walkable: true,  pathCost: 2.4, speed: 0.5, fuel: 0.1,
    open: false, bush: 0.3, wood: 0.15, graze: 0.2, shelter: true, wet: 1, tint: true,
    color: (h, f) => [84 + f * 6, 88 + f * 10, 58]},
  // dry grass of the steppe and savanna: burns readily, few bushes, no forest comes by itself
  {id: 'steppe', code: 6, label: 'степь', kind: 'ground', walkable: true,  pathCost: 1,   speed: 1,   fuel: 0.55,
    open: true, bush: 0.3, wood: 0, graze: 0.7, shelter: false, wet: 0, tint: true,
    color: (h, f) => [150 - f * 20 + h * 16, 140 + f * 8 + h * 10, 72]},
  // sand, salt flats and ash: nothing grows, nothing burns
  {id: 'sand',   code: 7, label: 'песок', kind: 'ground', walkable: true,  pathCost: 1.2, speed: 0.9, fuel: 0,
    open: true, bush: 0, wood: 0, graze: 0, shelter: false, wet: 0, tint: false,
    color: (h) => [196 + h * 20, 178 + h * 18, 132 + h * 10]},
  // the road from a gate of the map to the camp (world/site.js gates): the cheapest way there is; nothing grows on it
  {id: 'road',   code: 8, label: 'дорога', kind: 'ground', walkable: true,  pathCost: 0.6, speed: 1.2, fuel: 0,
    open: false, bush: 0, wood: 0, graze: 0, shelter: false, wet: 0, tint: false,
    color: (h) => [168 + h * 14, 150 + h * 12, 118 + h * 8]},
  // a ford: shallow water one can wade through, where a road meets a river; slow going
  {id: 'ford',   code: 9, label: 'брод',  kind: 'water',  walkable: true,  pathCost: 2.2, speed: 0.5, fuel: 0,
    open: false, bush: 0, wood: 0, graze: 0, shelter: false, wet: 1, tint: false,
    color: (h) => [96 + h * 30, 128 + h * 40, 140 + h * 30]},
  // the caravan's stakes (campaign/works.js, data/camp.js CAMP_WORKS.stakes): sharpened poles set in the ground round the
  // camp — one can push through, slowly; dry wood, they burn; nothing grows there while they stand
  {id: 'stakes', code: 10, label: 'судесы', kind: 'ground', walkable: true, pathCost: 3, speed: 0.35, fuel: 0.9,
    open: false, bush: 0, wood: 0, graze: 0, shelter: false, wet: 0, tint: false,
    color: (h) => [122 + h * 10, 96 + h * 8, 58]},
]);

// numeric codes for hot loops
export const T = {WATER: 0, GRASS: 1, FOREST: 2, ROCK: 3, BURNT: 4, SWAMP: 5, STEPPE: 6, SAND: 7, ROAD: 8, FORD: 9, STAKES: 10};

// lookup tables indexed by code, built once from the registry
export const BY_CODE = [];
for (const d of TERRAIN.all()) BY_CODE[d.code] = d;
export const WALKABLE = Uint8Array.from(BY_CODE.map(d => (d.walkable ? 1 : 0)));
export const OPEN = Uint8Array.from(BY_CODE.map(d => (d.open ? 1 : 0)));
// after an edit of the table «Рельеф» (data/schema): the hot-loop copies are made again, in place
export function rebuildTerrain() {
  for (const d of TERRAIN.all()) { WALKABLE[d.code] = d.walkable ? 1 : 0; OPEN[d.code] = d.open ? 1 : 0; }
  GRAZE_SETS.clear(); cheap = null;
}
// the cheapest step of any walkable ground: the scale of the path search's estimate (nav/astar.js), kept until an edit
let cheap = null;
export function cheapestStep() {
  if (cheap != null) return cheap;
  let m = Infinity;
  for (const t of Object.values(BY_CODE)) if (t && t.walkable && t.pathCost > 0 && t.pathCost < m) m = t.pathCost;
  return (cheap = Number.isFinite(m) ? Math.min(1, m) : 1);
}
export const isWater = code => BY_CODE[code].kind === 'water';
// where a grazer may feed: the terrains its species names plus every open meadow (graze ≥ 0.5 — grass,
// steppe), so that a hare born on the steppe does not search the map for a patch of grass. One Set per list.
const GRAZE_SETS = new Map();
export function grazeCodes(list) {
  const key = list.join(',');
  let s = GRAZE_SETS.get(key);
  if (!s) { s = new Set([...list.map(id => TERRAIN.get(id).code), ...BY_CODE.filter(d => d.graze >= 0.5).map(d => d.code)]); GRAZE_SETS.set(key, s); }
  return s;
}
