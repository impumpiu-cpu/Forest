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
//   The region (data/regions.js, flora) scales `chance`; a bed the region has not got is not laid at all.
//   job:       the gathering job: {id, label, short, verb, time, carry, keep, hurt?, tool?, weight?, skill? (default gathering), tier?} — it is wanted
//              while the stock is below `keep` (a number, or keep(w) when it depends on the colony);
//              `hurt` takes that much health per picking (bee stings); `tool`: only someone with that tool
//              (data/items.js `tool`) can do it; `weight` scales how keen the colony is on it (default 1)
import {Registry} from '../core/registry.js';
import {SPECIES} from './species.js';

// hay the tame animals eat in a winter of 30 days (settlement/herd.js keeps the herd to it)
const winterHay = w => w.agents.reduce((s, a) => s + (a.tame && !a.dead ? SPECIES.get(a.species).tame.eats : 0), 0) * 30 * 0.7;

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
    job: {id: 'clay', skill: 'mining', label: 'копать глину', short: 'глина', verb: 'копает глину', time: 30, carry: 2, keep: 14}},

  // wild bees in hollow trees: honey and wax; the bees sting
  {id: 'hive', resource: 'honey', also: {wax: 0.5}, label: 'дикие пчёлы', terrain: ['forest'], fertMin: 0.4, chance: 0.003,
    start: [0.5, 1], regrow: 0.00035, ripe: 0.5, take: 0.5, tint: [230, 170, 40], mapColor: [250, 180, 30],
    job: {id: 'honey', tier: 2, label: 'бортничать', short: 'мёд', verb: 'берёт мёд у диких пчёл', time: 40, carry: 2, keep: 12, hurt: 0.04}},

  // meadow grass: mown for hay in summer and autumn — bedding in huts, fodder later
  {id: 'meadow', resource: 'hay', label: 'луговая трава', terrain: ['grass'], fertMin: 0.45, chance: 0.05, seasons: ['summer', 'autumn'],
    start: [0.2, 0.6], regrow: 0.0005, ripe: 0.6, take: 0.6, tint: [150, 180, 80], mapColor: [170, 220, 90],
    // enough for bedding, and for the pen's winter (settlement/herd.js, winterHay)
    job: {id: 'mow', skill: 'farming', label: 'косить сено', short: 'сено', verb: 'косит сено', time: 20, carry: 3, keep: w => 30 + winterHay(w)}},

  // gold-bearing sand in the shallows: washed with a pan, a little at a time; the river brings more
  // sand very slowly. Not under ice. Now and then a nugget turns up in the pan.
  {id: 'placer', resource: 'goldDust', also: {goldNugget: 0.02}, label: 'золотоносный песок', terrain: ['grass'], nearWater: true, chance: 0.06,
    seasons: ['spring', 'summer', 'autumn'], start: [0.6, 1], regrow: 0.00006, ripe: 0.3, take: 0.12, tint: [222, 196, 96], mapColor: [255, 214, 60],
    job: {id: 'pan', tier: 2, label: 'мыть золото', short: 'золото', verb: 'моет золото в отмели', time: 40, carry: 4, keep: 200, tool: 'pan'}},

  // salt licks: white crusts where salty springs come up; the outpost's own salt, a little at a time
  {id: 'saltlick', resource: 'salt', label: 'солонец', terrain: ['grass'], fertMin: 0, chance: 0.004, hardy: true,
    start: [0.6, 1], regrow: 0.00012, ripe: 0.4, take: 0.3, tint: [236, 236, 228], mapColor: [250, 250, 245],
    job: {id: 'salt', label: 'выпаривать соль', short: 'соль', verb: 'собирает соль на солонце', time: 40, carry: 2, keep: 12}},

  // wild flax: in autumn its seed heads are ripe; the outpost's own flax seed without a trader
  {id: 'wildflax', resource: 'seedFlax', also: {fiber: 0.5}, label: 'дикий лён', terrain: ['grass'], fertMin: 0.5, chance: 0.008, seasons: ['autumn'],
    start: [0.2, 0.5], regrow: 0.0004, ripe: 0.6, take: 0.5, tint: [120, 150, 200], mapColor: [140, 170, 230],
    job: {id: 'flaxseed', label: 'собирать семена льна', short: 'лён', verb: 'собирает семена дикого льна', time: 25, carry: 3, keep: 10}},
]);

export const plantLayer = id => 'plant:' + id;
