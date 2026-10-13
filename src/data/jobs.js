// Work colonists can do. A job says where its targets are (a navigation map or a moving prey),
// how long one unit takes, what it yields and how much the colony wants it right now.
// `preferable: true` puts the job in the pool from which liked and disliked work is drawn.
//
// runner: which generic routine performs it (see agents/jobRunners.js)
//   'harvest' — walk to a cell on `nav`, work `time` ticks, take one unit, carry `carry` units home
//               (`take` may return the resource id when one job brings several kinds, like ore)
//   'hunt'    — stalk the nearest prey of `prey` species and shoot it from `range`
//   'build'   — walk to a construction site and add labour
//   'craft'   — walk to one of the job's `stations` with work to do and add labour to its order (settlement/crafting.js)
// requires: a building id, or a list of ids of which any one will do (a craft job needs one of its stations)
// desire(w, ctx, job): how much the colony wants it now; < 0 means "not now"
// A new workshop job is one entry: {runner: 'craft', stations: [...], desire: atStations(value)}.
// canDo(w, agent): optional personal condition (hunting needs a usable ranged weapon)
import {Registry} from '../core/registry.js';
import {T} from './terrain.js';
import {FOODS} from './foods.js';
import {PLANTS, plantLayer} from './plants.js';

const HERBS_KEEP = 10;   // the healer picks herbs while the stock is below this
import {lakeBeside, fishable} from '../world/lakes.js';
import {oreBeside, oreOf} from '../world/ores.js';
import {wantedOre} from '../settlement/query.js';

export const JOBS = new Registry('job');

// how much the colony wants more of a resource: fills up when the stock is low
const want = (stock, pop, low, enough) => (stock < pop * low ? 0.7 : stock < pop * enough ? 0.25 : 0.04);

// Food jobs name the food they bring (`food`, an id from data/foods.js). How much the colony wants
// such a job grows with
//   - how short of food it is (want above),
//   - how filling that food is (nutrition: meat and fish beat berries),
//   - cravings: people whose favourite food has run out push for the job that brings it.
// Each colonist also takes the job bringing their own favourite food more readily (agents/brains/colonist.js).
// k scales the shortage pull for slow or risky work, extra is added on top.
const foodWant = (w, ctx, job, k = 1, extra = 0) => {
  const f = FOODS.get(job.food), fans = ctx.favourites[job.food] || 0;
  const craving = fans && (w.stock[job.food] || 0) < fans * 2 ? 0.08 + 0.3 * fans / Math.max(1, ctx.pop) : 0;
  return want(ctx.food, ctx.pop, 4, 8) * (0.7 + 0.3 * f.nutrition) * k + craving + extra;
};

// what hunters go after: their usual prey; big dangerous game (`lastResort`, a mule) only when
// there is nothing else on the map and the colony is going hungry
export function huntable(w, job) {
  const usual = w.agents.filter(o => !o.dead && job.prey.includes(o.species));
  if (usual.length || !job.lastResort) return usual;
  const pop = w.agents.filter(o => o.faction === 'colony').length;
  const hungry = RESOURCES_FOOD().reduce((s, r) => s + (w.stock[r.id] || 0), 0) < pop * 2;
  return hungry ? w.agents.filter(o => !o.dead && o.faction === 'wild' && job.lastResort.includes(o.species)) : [];
}
const RESOURCES_FOOD = () => FOODS.all();

// craft jobs: wanted with `value` while one of their stations has an order to work on
const atStations = value => (w, ctx, job) => (job.stations.some(s => ctx.orders[s]) ? value : -1);

JOBS.registerAll([
  {id: 'gather', label: 'собирать ягоды', short: 'сбор', verb: 'собирает ягоды', preferable: true,
    runner: 'harvest', nav: 'berries', resource: 'berries', food: 'berries', carry: 3, time: 12, memory: 'walkFood',
    desire: (w, ctx, job) => foodWant(w, ctx, job),
    valid: (w, i) => w.grid.food[i] > 0.3 && w.grid.fire[i] === 0,
    take: (w, i) => { w.grid.food[i] -= 0.34; w.nav.dirty('berries'); }},

  {id: 'chop', label: 'рубить лес', short: 'рубка', verb: 'рубит лес', preferable: true,
    runner: 'harvest', nav: 'trees', resource: 'wood', carry: 2, time: 26, memory: 'walkWood',
    desire: (w, ctx) => (w.stock.wood < 25 ? 0.55 : w.stock.wood < 40 ? 0.2 : 0.03),
    valid: (w, i) => w.grid.terr[i] === T.FOREST && w.grid.wood[i] > 0.25 && w.grid.fire[i] === 0,
    take: (w, i) => {
      const g = w.grid; g.wood[i] -= 0.35;
      if (g.wood[i] < 0.1) { g.terr[i] = T.GRASS; g.fuel[i] = 0.4; g.wood[i] = 0; }
      w.nav.dirty('trees');
    }},

  {id: 'mine', label: 'добывать камень', short: 'камень', verb: 'добывает камень', preferable: true,
    runner: 'harvest', nav: 'rockface', resource: 'stone', carry: 2, time: 30, requires: 'quarry',
    desire: (w) => (w.stock.stone < 20 ? 0.48 : w.stock.stone < 40 ? 0.18 : 0.03),
    valid: (w, i) => w.grid.fire[i] === 0,
    take: () => {}},

  // the mine: dig whichever ore the colony is short of (iron ore, coal, gems) from the rock face
  {id: 'dig', label: 'добывать руду', short: 'руда', verb: 'добывает руду', preferable: true,
    runner: 'harvest', nav: 'ore', resource: 'ironore', carry: 2, time: 40, requires: 'mineshaft', memory: 'walkOre',
    desire: (w) => (wantedOre(w).size ? 0.42 : -1),
    valid: (w, i) => w.grid.fire[i] === 0 && oreBeside(w, i, wantedOre(w)) >= 0,
    take: (w, i) => {
      const g = w.grid, j = oreBeside(w, i, wantedOre(w)); if (j < 0) return null;
      const res = oreOf(w, j).resource;
      g.oreLeft[j] -= 1;
      // a worked-out vein leaves a passage in the rock: the face behind it opens up for digging
      if (g.oreLeft[j] <= 0) { g.ore[j] = 0; g.oreLeft[j] = 0; g.terr[j] = T.GRASS; g.fuel[j] = 0; w.nav.dirty('ore'); w.nav.dirty('rockface'); }
      return res;
    }},

  // fishing: sit on the shore of a lake that still has fish; needs a rod (in hand or on the back),
  // made at the craftsman's hut. The fisherman's hut only makes it better, as the lodge does for hunting
  {id: 'fish', label: 'рыбачить', short: 'рыбалка', verb: 'рыбачит', preferable: true,
    runner: 'harvest', nav: 'shore', resource: 'fish', food: 'fish', carry: 3, time: 50, memory: 'walkFish',
    canDo: (w, a) => !!a.gear?.tool.fish,
    desire: (w, ctx, job) => (w.lakes.some(fishable) ? foodWant(w, ctx, job, 0.95, 0.08) : -1),
    valid: (w, i) => !!lakeBeside(w, i),
    take: (w, i) => { const l = lakeBeside(w, i); if (l) { l.fish -= 1; if (!fishable(l)) w.nav.dirty('shore'); } }},

  {id: 'hunt', label: 'охотиться', short: 'охота', verb: 'охотится', preferable: true,
    runner: 'hunt', nav: 'prey', prey: ['hare'], lastResort: ['mule'], food: 'meat',
    canDo: (w, a) => !!a.gear?.rangedReady,
    desire: (w, ctx, job) => (ctx.preyCount > 0 ? foodWant(w, ctx, job, 0.75, 0.08 + ((w.stock.hide < 4 || w.stock.bone < 4) ? 0.3 : 0)) : -1)},

  {id: 'craft', label: 'мастерить', short: 'ремесло', verb: 'мастерит', preferable: true,
    runner: 'craft', stations: ['crafthut'], desire: atStations(0.55)},

  {id: 'charcoal', label: 'жечь уголь', short: 'уголь', verb: 'жжёт уголь', preferable: true,
    runner: 'craft', stations: ['charpit'], desire: atStations(0.45)},

  {id: 'smith', label: 'плавить и ковать железо', short: 'кузня', verb: 'работает у горна', preferable: true,
    runner: 'craft', stations: ['forge', 'smelter'], desire: atStations(0.55)},

  {id: 'jewel', label: 'делать украшения', short: 'ювелир', verb: 'делает украшения', preferable: true,
    runner: 'craft', stations: ['jeweler'], desire: atStations(0.35)},

  {id: 'tan', label: 'выделывать кожи', short: 'кожи', verb: 'выделывает кожи', preferable: true,
    runner: 'craft', stations: ['tannery'], desire: atStations(0.5)},

  // the healer: tends the wounded lying in the healer's hut; with nobody to tend, picks healing herbs
  // while the stock is low (settlement/healing.js). Its skill is the healer's skill.
  {id: 'heal', label: 'лечить раненых', short: 'лекарь', verb: 'лечит', preferable: true,
    runner: 'heal', requires: 'healerhut',
    // one healer at a time: whoever took it first keeps it
    canDo: (w, a) => !w.agents.some(o => o !== a && o.faction === 'colony' && o.task?.job === 'heal'), nav: plantLayer('herbs'), resource: 'herbs', carry: 2, time: 30,
    desire: (w, ctx) => (ctx.patients ? 0.9 + 0.1 * ctx.patients : (w.stock.herbs || 0) < HERBS_KEEP ? 0.28 : -1),
    valid: (w, i) => w.grid[plantLayer('herbs')][i] >= PLANTS.get('herbs').ripe && w.grid.fire[i] === 0,
    take: (w, i) => { w.grid[plantLayer('herbs')][i] -= PLANTS.get('herbs').take; w.nav.dirty(plantLayer('herbs')); }},

  {id: 'build', label: 'строить', short: 'стройка', verb: 'строит', preferable: true,
    runner: 'build', nav: 'sites',
    desire: (w, ctx) => (ctx.openSites ? 0.6 : -1)},
]);

// a craft job opens as soon as one of its stations is built
for (const j of JOBS.all()) if (j.runner === 'craft' && !j.requires) j.requires = j.stations;
