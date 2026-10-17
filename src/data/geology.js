// Geology of the world map: kinds of plate boundaries, rocks and where ores come from.
// The systems are in src/atlas/ (tectonics.js, geology.js); everything that can be listed is here.
import {Registry} from '../core/registry.js';

// How many plates the world splits into (the start setting «Плиты»).
export const PLATE_COUNTS = [
  {count: 7, label: 'Мало'},
  {count: 13, label: 'Обычно'},
  {count: 22, label: 'Много'},
];

// How the climate bands lie (the start setting «Широты»). y = 0 is the top edge of the map.
//   north:   one hemisphere — polar cold at the top, the tropics at the bottom
//   equator: the equator across the middle, cold at both edges
export const HEMISPHERES = {
  north:   {label: 'Одно полушарие', note: 'север холодный, юг жаркий'},
  equator: {label: 'Экватор посередине', note: 'жарко в середине, холодно у верхнего и нижнего края'},
};

// Plate boundaries, as seen from one side. `code` is what the grid stores (a.f.bnd), never 0.
// Every boundary cell knows which side it is on: the same meeting line is a trench on the
// oceanic plate and a volcanic arc on the continental one. `chron`: how the world's chronicle tells it.
export const BOUNDARIES = new Registry('boundary');
BOUNDARIES.registerAll([
  {id: 'collision', code: 1, label: 'столкновение материков', color: [236, 90, 70], note: 'высокие складчатые хребты по обе стороны шва', chron: 'столкнулись материки и вздыбились хребты'},
  {id: 'arc', code: 2, label: 'вулканическая дуга', color: [255, 160, 60], note: 'материк наползает на океан: береговой хребет и цепь вулканов', chron: 'материк наполз на океан, и у берегов задымились вулканы'},
  {id: 'trench', code: 3, label: 'глубоководный желоб', color: [80, 70, 160], note: 'океаническая плита уходит под соседнюю', chron: 'океанское дно ушло в глубокие желоба'},
  {id: 'islandArc', code: 4, label: 'островная дуга', color: [250, 200, 80], note: 'океан наползает на океан: дуга вулканических островов', chron: 'из моря поднялись дуги огнедышащих островов'},
  {id: 'rift', code: 5, label: 'рифт', color: [120, 220, 120], note: 'материк раскалывается: провальная долина, вулканы по краям', chron: 'земля треснула провальными долинами'},
  {id: 'ridge', code: 6, label: 'срединный хребет', color: [90, 200, 220], note: 'плиты расходятся под океаном, наращивая дно', chron: 'посреди океанов выросли подводные хребты'},
  {id: 'fault', code: 7, label: 'сдвиг', color: [200, 200, 200], note: 'плиты скользят бок о бок: разломы и землетрясения', chron: 'вдоль сдвигов пролегли разломы'},
]);
export const BOUNDARY_BY_CODE = [];
for (const b of BOUNDARIES.all()) BOUNDARY_BY_CODE[b.code] = b;

// Rocks. `kind`: igneous (магматические), sedimentary (осадочные), metamorphic (метаморфические).
// `code` is what the grid stores (a.f.rock).
export const ROCK_KINDS = {igneous: 'магматические', sedimentary: 'осадочные', metamorphic: 'метаморфические'};
export const ROCKS = new Registry('rock');
ROCKS.registerAll([
  {id: 'basalt', code: 1, kind: 'igneous', label: 'базальт', color: [64, 64, 70], note: 'излившаяся лава: океанское дно, рифты, горячие точки'},
  {id: 'andesite', code: 2, kind: 'igneous', label: 'андезит', color: [140, 96, 88], note: 'лава вулканических дуг'},
  {id: 'granite', code: 3, kind: 'igneous', label: 'гранит', color: [206, 150, 150], note: 'застывшая в глубине магма: корни дуг и хребтов'},
  {id: 'gneiss', code: 4, kind: 'metamorphic', label: 'гнейс', color: [150, 130, 170], note: 'древнейшие породы щитов, переплавленные давлением'},
  {id: 'schist', code: 5, kind: 'metamorphic', label: 'кристаллический сланец', color: [110, 150, 140], note: 'смятые и прогретые породы зон столкновения'},
  {id: 'sandstone', code: 6, kind: 'sedimentary', label: 'песчаник', color: [214, 184, 120], note: 'снесённый с гор песок: равнины и предгорные прогибы'},
  {id: 'limestone', code: 7, kind: 'sedimentary', label: 'известняк', color: [226, 222, 196], note: 'дно тёплых мелких морей; в нём бывают пещеры'},
  {id: 'shale', code: 8, kind: 'sedimentary', label: 'глинистый сланец', color: [120, 110, 90], note: 'ил низин и древних болот; в нём лежит уголь'},
]);
export const ROCK_BY_CODE = [];
for (const r of ROCKS.all()) ROCK_BY_CODE[r.code] = r;

// Where ores come from. A cell's potential for an ore is
//   Σ rocks[rock of the cell] + Σ setting weight × the tectonic factor of the cell (atlas/geology.js),
// then scaled by the ore's own province noise, so ores gather in districts instead of evenly.
// The factors are 0..1:
//   arc — a volcanic arc nearby (porphyry copper, silver, gold);  coll — a collision zone;
//   craton — the old quiet heart of a continent;  basv — basaltic volcanism (rifts, hot spots);
//   oldv — extinct volcanoes;  volc — live volcanism;  low — flat lowland near the sea;  warm — a warm latitude
// `levels`: potential thresholds for the levels 0.5 / 1 / 1.6 (data/regions.js LEVELS), tuned so that on
// a usual world about half the land has some iron, a third some coal, a sixth or less the rarer ores,
// and mithril one cell in twenty (tools/atlas-check.mjs prints the shares).
// `region`: the key of the ore in a region (data/regions.js `ores`); the others are region flags.
export const ORE_GENESIS = new Registry('oreGenesis');
ORE_GENESIS.registerAll([
  {id: 'iron', region: 'iron', label: 'железо', color: [196, 102, 64],
    rocks: {sandstone: 0.35, shale: 0.35, gneiss: 0.5, basalt: 0.25, schist: 0.2}, settings: {craton: 0.35}, levels: [0.21, 0.3, 0.42]},
  {id: 'coal', region: 'coal', label: 'уголь', color: [90, 90, 108],
    rocks: {shale: 0.8, sandstone: 0.2}, settings: {low: 0.25, warm: 0.2}, levels: [0.28, 0.42, 0.79]},
  {id: 'bronze', region: 'bronze', label: 'медь и олово', color: [214, 150, 80],
    rocks: {andesite: 0.4, granite: 0.35, sandstone: 0.1, schist: 0.15}, settings: {arc: 0.55, coll: 0.15}, levels: [0.16, 0.23, 0.33]},
  {id: 'silver', region: 'silver', label: 'серебро', color: [220, 224, 236],
    rocks: {andesite: 0.3, granite: 0.25, schist: 0.2}, settings: {arc: 0.4, coll: 0.15}, levels: [0.2, 0.27, 0.33]},
  {id: 'gold', region: 'goldVein', label: 'рудное золото', color: [255, 214, 60],
    rocks: {schist: 0.4, andesite: 0.25, gneiss: 0.15}, settings: {arc: 0.3, coll: 0.3, craton: 0.15}, levels: [0.29, 0.48, 0.56]},
  {id: 'gems', region: 'gems', label: 'самоцветы', color: [120, 230, 214],
    rocks: {gneiss: 0.4, schist: 0.35, granite: 0.15}, settings: {craton: 0.3}, levels: [0.24, 0.33, 0.5]},
  {id: 'mithril', region: 'mithril', label: 'мифрил', color: [170, 230, 255],
    rocks: {gneiss: 0.15}, settings: {oldv: 0.7, craton: 0.15}, levels: [0.2, 0.27, 0.34]},
  // gold sand in the shallows: not from the rock under the cell but washed down by the rivers from
  // gold upstream (atlas/hydrology.js placer); `from` says so, the ore stage skips it
  {id: 'placer', region: 'placer', from: 'rivers', label: 'золотой песок', color: [240, 200, 90],
    rocks: {}, settings: {}, levels: [0.15, 0.3, 0.5]},
  {id: 'magma', region: 'magma', label: 'магма', color: [255, 80, 40],
    rocks: {}, settings: {volc: 1}, levels: [0.03, 0.13, 0.25]},
]);
