// Wild beds: things gathered from fixed spots on the map other than berry bushes (those are older
// and live in world/fields.js) — plants, reeds, clay, wild hives. Each kind gets its own layer on
// the grid (grid['plant:<id>'], 0…1 how much is ready) on scattered beds, comes back by itself and
// is gathered by a job made from the entry (data/jobs.js, `job`). The layer, regrowth, flow field,
// map tint and resource layer come by themselves (world/plants.js).
//
//   resource:  the stock resource one picking brings home; also: {resource: chance} picked along with it
//   terrain:   where beds can be;  fertMin: only on ground at least this fertile
//   nearWater: only on cells next to water (reeds, clay)
//   chance:    share of such cells that get a bed when the world is made (keep it rare)
//   start:     how ready a bed is at the start, [min, max];  regrow: per tick (× the season's `grow`;
//              `hardy` beds are not touched by the season — clay does not freeze in a pit)
//   ripe:      worth walking to from this much;  take: how much one picking removes
//   seasons:   only gathered in these seasons (hay is mown in summer and autumn)
//   tint:      colour mixed into the ground on the world layer; mapColor: on the resource layer
//   job:       the gathering job: {id, label, short, verb, time, carry, keep, hurt?} — it is wanted
//              while the stock is below `keep`; `hurt` takes that much health per picking (bee stings)
import {Registry} from '../core/registry.js';

export const PLANTS = new Registry('plant');

PLANTS.registerAll([
  // healing herbs: yarrow, plantain, St John's wort — a few patches in damp meadows and glades.
  // Picked by the healer (data/jobs.js 'heal'), so no job of its own.
  {id: 'herbs', resource: 'herbs', label: 'лечебные травы', terrain: ['grass', 'forest'], fertMin: 0.5, chance: 0.006,
    start: [0.4, 1], regrow: 0.0006, ripe: 0.45, take: 0.5, tint: [236, 214, 92], mapColor: [255, 236, 96]},

  // nettle and wild flax: the bast fibre the outpost spins into rope and weaves into rough cloth
  {id: 'nettle', resource: 'fiber', label: 'крапива', terrain: ['grass', 'forest'], fertMin: 0.55, chance: 0.03,
    start: [0.3, 1], regrow: 0.0008, ripe: 0.5, take: 0.5, tint: [70, 130, 70], mapColor: [120, 200, 150],
    job: {id: 'fiber', label: 'рвать крапиву', short: 'крапива', verb: 'рвёт крапиву на волокно', time: 22, carry: 3, keep: 16}},

  // reeds by the water: thatch for roofs, baskets
  {id: 'reeds', resource: 'reeds', label: 'камыш', terrain: ['grass'], nearWater: true, chance: 0.35,
    start: [0.5, 1], regrow: 0.0009, ripe: 0.5, take: 0.5, tint: [176, 168, 96], mapColor: [210, 196, 110],
    job: {id: 'reeds', label: 'резать камыш', short: 'камыш', verb: 'режет камыш', time: 18, carry: 3, keep: 16}},

  // clay in the banks of lakes: a pit fills slowly with fresh clay washed in
  {id: 'clay', resource: 'clay', label: 'глина', terrain: ['grass'], nearWater: true, chance: 0.12, hardy: true,
    start: [0.8, 1], regrow: 0.0001, ripe: 0.5, take: 0.25, tint: [168, 110, 80], mapColor: [200, 120, 80],
    job: {id: 'clay', label: 'копать глину', short: 'глина', verb: 'копает глину', time: 30, carry: 2, keep: 14}},

  // wild bees in hollow trees: honey and wax; the bees sting
  {id: 'hive', resource: 'honey', also: {wax: 0.5}, label: 'дикие пчёлы', terrain: ['forest'], fertMin: 0.4, chance: 0.003,
    start: [0.5, 1], regrow: 0.00035, ripe: 0.5, take: 0.5, tint: [230, 170, 40], mapColor: [250, 180, 30],
    job: {id: 'honey', label: 'бортничать', short: 'мёд', verb: 'берёт мёд у диких пчёл', time: 40, carry: 2, keep: 12, hurt: 0.04}},

  // meadow grass: mown for hay in summer and autumn — bedding in huts, fodder later
  {id: 'meadow', resource: 'hay', label: 'луговая трава', terrain: ['grass'], fertMin: 0.45, chance: 0.05, seasons: ['summer', 'autumn'],
    start: [0.2, 0.6], regrow: 0.0005, ripe: 0.6, take: 0.6, tint: [150, 180, 80], mapColor: [170, 220, 90],
    job: {id: 'mow', label: 'косить сено', short: 'сено', verb: 'косит сено', time: 20, carry: 3, keep: 30}},
]);

export const plantLayer = id => 'plant:' + id;
