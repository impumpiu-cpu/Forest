// Materials of a kind (docs/BALANCE.md, «Материалы на выбор и допуск рас»). A recipe or a building asks for a family —
// «any wood», «any stone» — and the stock keeps, beside the family's total (w.stock.wood), what it is made of
// (w.kinds.wood = {pine: 12, oak: 3}: settlement/kinds.js). What is taken decides what comes out: an oak club is harder
// than a pine one, a granite wall stands longer than a sandstone one and is the colour of its rock.
//   Rules of the choice (settlement/kinds.js takeKind): what burns — the worst first; what is made — the best first
//   (the best that the maker's race may work, data/races.js via RACE_MATERIALS below).
// The metals stay the resources they are (bronze, iron, steel, silver, mithril: data/resources.js); a recipe names its
// metal, as before. Their family is listed for the race rules and the tables.
//
// WOODS: the trees, by the biomes they grow in (data/biomes.js); the multipliers work as a material's on a wooden piece
// (data/balance/materials.js: dmg, dur, weight); `fuel` — how well it burns (for now it only orders what burns first);
// `price` × the value.
// A `special` wood gives its numbers only to a race that is a master of it (RACE_MATERIALS 'master'); to anyone else it
// is a good plain wood (`plain`) — a hammer handle, kindling.
import {Registry} from '../core/registry.js';
import {ROCKS} from './geology.js';

export const WOODS = new Registry('wood');
WOODS.registerAll([
  {id: 'pine',   label: 'сосна',      adj: 'сосновый',      biomes: {taiga: 1, forest: 0.6, foothills: 0.5, highlands: 0.3, shrubland: 0.3}, dmg: 0.95, dur: 0.95, weight: 0.9, fuel: 1.1, price: 1, color: '#c9a46a'},
  {id: 'spruce', label: 'ель',        adj: 'еловый',        biomes: {taiga: 1, tundra: 0.4, foothills: 0.4, highlands: 0.4}, dmg: 0.9, dur: 0.9, weight: 0.85, fuel: 1, price: 0.9, color: '#b89a64'},
  {id: 'birch',  label: 'берёза',     adj: 'берёзовый',     biomes: {forest: 0.8, taiga: 0.5, meadow: 0.5, tundra: 0.3, steppe: 0.2}, dmg: 1, dur: 1, weight: 1, fuel: 1.25, price: 1, color: '#e6d8b8'},
  {id: 'oak',    label: 'дуб',        adj: 'дубовый',       biomes: {forest: 1, meadow: 0.4, shrubland: 0.3, savanna: 0.1}, dmg: 1.12, dur: 1.3, weight: 1.15, fuel: 1.2, price: 1.4, color: '#8a6238'},
  {id: 'ash',    label: 'ясень',      adj: 'ясеневый',      biomes: {forest: 0.6, meadow: 0.3, swamp: 0.3}, dmg: 1.08, dur: 1.2, weight: 1, fuel: 1.15, price: 1.3, color: '#cdb48a'},
  {id: 'larch',  label: 'лиственница', adj: 'лиственничный', biomes: {taiga: 0.6, highlands: 0.5, foothills: 0.4, tundra: 0.2}, dmg: 1.02, dur: 1.25, weight: 1.05, fuel: 1.05, price: 1.2, color: '#b0784a'},
  // the two of a kind: ironwood of the jungles — nearly as good as iron for anyone; the sacred tree of the elves' groves —
  // in an elf's hands better than steel, in anyone else's a fine ash
  {id: 'ironwood', label: 'железное дерево', adj: 'железнодревный', biomes: {jungle: 0.35, savanna: 0.1}, dmg: 1.2, dur: 1.8, weight: 1.3, fuel: 1.4, price: 3, color: '#5a4030'},
  {id: 'holywood', label: 'святое дерево',  adj: 'святодревный',   biomes: {forest: 0.04, jungle: 0.04}, special: true, plain: 'ash',
    dmg: 1.5, dur: 2.8, weight: 0.8, fuel: 1, price: 8, color: '#e8f0d0'},
]);

// STONES: the rocks of the world (data/geology.js ROCKS), each a stone of the stock: `dur` × how long a building of it
// stands (raids, fire, time), `price` × the value, the building's colour is the rock's
const STONE_NUMBERS = {
  basalt: {dur: 1.3, price: 1}, andesite: {dur: 1.15, price: 1}, granite: {dur: 1.4, price: 1.3}, gneiss: {dur: 1.3, price: 1.2},
  schist: {dur: 0.9, price: 0.9}, sandstone: {dur: 0.85, price: 0.9}, limestone: {dur: 1, price: 1.1}, shale: {dur: 0.7, price: 0.7},
};
export const STONES = new Registry('stone');
STONES.registerAll(ROCKS.all().map(r => ({id: r.id, label: r.label, rock: r.kind, color: `rgb(${r.color.join(',')})`, ...(STONE_NUMBERS[r.id] || {dur: 1, price: 1})})));

// The families: the resource that holds the total, its members, and how a member is chosen for each use.
//   resource — data/resources.js id of the total;  members — the registry (or a list of resource ids for the metals)
export const FAMILIES = {
  wood: {label: 'древесина', resource: 'wood', members: () => WOODS.ids()},
  stone: {label: 'камень', resource: 'stone', members: () => STONES.ids()},
  metal: {label: 'металл', resource: null, members: () => ['bronze', 'iron', 'steel', 'silverBar', 'mithrilOre']},
};
// the member of a family by id, from any family
export const familyOf = member => Object.keys(FAMILIES).find(f => FAMILIES[f].members().includes(member)) || null;

// What a race may do with a material (data/races.js ids × members of the families):
//   yes     — anything (the default)
//   nomake  — it does not get it or make things of it (it harms the land, it is not its way), but takes up what others
//             made: the piece is «dirty» to it — an elf does not mine iron, yet will take a dwarf's sword to kill a dwarf
//   taboo   — it does not touch it at all: neither makes nor wears it
//   master  — it works it as no one else: a special material gives it its own numbers (the elves' sacred tree)
// Anything not said is `yes`: everything is open to everyone until the asymmetry of the races closes it, a line here.
export const USES = {yes: 'можно', nomake: 'не добывает и не делает (купленное — «грязное»)', taboo: 'не касается вовсе', master: 'мастер'};
export const RACE_MATERIALS = {
  elf: {holywood: 'master'},
};
export const useOf = (race, member) => RACE_MATERIALS[race]?.[member] || 'yes';
// a race may get or make things of it;  may wear or wield it
export const mayMake = (race, member) => { const u = useOf(race, member); return u === 'yes' || u === 'master'; };
export const mayUse = (race, member) => useOf(race, member) !== 'taboo';

// what the land gives when its own data says nothing (settlement/kinds.js landMix): the wood of a land with no tree of
// the table, the stone of a land whose cell has no rock, the rocks a polygon map draws one of by its seed; a tree weighs
// in the land's mix only above `least`
export const KIND_LAND = {wood: 'birch', stone: 'granite', rocks: ['granite', 'limestone', 'sandstone', 'basalt', 'gneiss'], least: 0.002};
// the work that gets a family out of the land (agents/brains/colonist.js mayExtract), and the metal an ore becomes
export const EXTRACTS = {chop: 'wood', mine: 'stone', dig: 'metal'};
export const ORE_METAL = {ironore: 'iron'};
// the town buildings where a people that is master of a special wood works it (campaign/town.js: a town's smiths make
// pieces of it for sale)
export const KIND_GROVES = {holywood: ['sacredgrove', 'grove'], ironwood: ['forestry']};
