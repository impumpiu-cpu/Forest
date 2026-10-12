// Work colonists can do. A job says where its targets are (a navigation map or a moving prey),
// how long one unit takes, what it yields and how much the colony wants it right now.
// `preferable: true` puts the job in the pool from which liked and disliked work is drawn.
//
// runner: which generic routine performs it (see agents/jobRunners.js)
//   'harvest' — walk to a cell on `nav`, work `time` ticks, take one unit, carry `carry` units home
//   'hunt'    — stalk the nearest prey of `prey` species and shoot it from `range`
//   'build'   — walk to a construction site and add labour
//   'craft'   — walk to one of the job's `stations` with work to do and add labour to its order (settlement/crafting.js)
// requires: a building id, or a list of ids of which any one will do
// canDo(w, agent): optional personal condition (hunting needs a usable ranged weapon)
import {Registry} from '../core/registry.js';
import {T} from './terrain.js';
import {lakeBeside, fishable} from '../world/lakes.js';

export const JOBS = new Registry('job');

// how much the colony wants more of a resource: fills up when the stock is low
const want = (stock, pop, low, enough) => (stock < pop * low ? 0.7 : stock < pop * enough ? 0.25 : 0.04);

JOBS.registerAll([
  {id: 'gather', label: 'собирать ягоды', short: 'сбор', verb: 'собирает ягоды', preferable: true,
    runner: 'harvest', nav: 'berries', resource: 'berries', carry: 3, time: 12, memory: 'walkFood',
    desire: (w, ctx) => want(ctx.food, ctx.pop, 4, 8),
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

  // fishing: sit on the shore of a lake that still has fish; needs a rod (in hand or on the back)
  {id: 'fish', label: 'рыбачить', short: 'рыбалка', verb: 'рыбачит', preferable: true,
    runner: 'harvest', nav: 'shore', resource: 'fish', carry: 3, time: 70, requires: 'fishhut', memory: 'walkFish',
    canDo: (w, a) => !!a.gear?.tool.fish,
    desire: (w, ctx) => (w.lakes.some(fishable) ? want(ctx.food, ctx.pop, 4, 8) * 0.9 + 0.06 : -1),
    valid: (w, i) => !!lakeBeside(w, i),
    take: (w, i) => { const l = lakeBeside(w, i); if (l) { l.fish -= 1; if (!fishable(l)) w.nav.dirty('shore'); } }},

  {id: 'hunt', label: 'охотиться', short: 'охота', verb: 'охотится', preferable: true,
    runner: 'hunt', nav: 'prey', prey: ['hare'],
    canDo: (w, a) => !!a.gear?.rangedReady,
    desire: (w, ctx) => (ctx.preyCount > 0 ? want(ctx.food, ctx.pop, 4, 8) * 0.8 + 0.08 + ((w.stock.hide < 4 || w.stock.bone < 4) ? 0.3 : 0) : -1)},

  {id: 'craft', label: 'мастерить', short: 'ремесло', verb: 'мастерит', preferable: true,
    runner: 'craft', stations: ['crafthut', 'fishhut'], requires: ['crafthut', 'fishhut'],
    desire: (w, ctx) => (ctx.orders.crafthut || ctx.orders.fishhut ? 0.55 : -1)},

  {id: 'tan', label: 'выделывать кожи', short: 'кожи', verb: 'выделывает кожи', preferable: true,
    runner: 'craft', stations: ['tannery'], requires: 'tannery',
    desire: (w, ctx) => (ctx.orders.tannery ? 0.5 : -1)},

  {id: 'build', label: 'строить', short: 'стройка', verb: 'строит', preferable: true,
    runner: 'build', nav: 'sites',
    desire: (w, ctx) => (ctx.openSites ? 0.6 : -1)},
]);
