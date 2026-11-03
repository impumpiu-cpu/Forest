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
// skill: the skill (data/skills.js) the job trains and reads; a craft job's orders use their recipe's
//   skill instead, and the healer picking herbs uses `gatherSkill`
// tier: the whole job is open only to someone whose letter for its skill reaches this tier (agents/skills.js
//   jobAccess): ore in the mine shaft (S 4), gold in the shallows and wild honey (P 4). T1 when not given.
//   Some jobs tier a part only: tending the wounded in the hut (`tendTier`, medicine), big dangerous game
//   (`riskyTier`, hunting); the herder's wild beasts carry their own tier (species `tame.tier`)
// sticky: extra hold of the job on someone already doing it (a long walk after a wild goat)
import {Registry} from '../core/registry.js';
import {useJobs} from './navmaps.js';
import {T, BY_CODE} from './terrain.js';
import {FOODS} from './foods.js';
import {PLANTS, plantLayer} from './plants.js';
import {season} from './seasons.js';
import {fields, needsWork} from '../settlement/farming.js';

import {lakeBeside, fishable} from '../world/lakes.js';
import {oreBeside, oreOf} from '../world/ores.js';
import {wantedOre, raidAlarm} from '../settlement/query.js';
import {chores, tameTargets, herd, canTame} from '../settlement/herd.js';
import {canDoAction} from '../agents/skills.js';
import {maybeGoldVein, foundMithril} from '../settlement/precious.js';
import {reachableCorpses, freeCorpse} from '../settlement/life.js';
import {hpShare} from '../agents/agent.js';
import {ofSpeciesList} from '../agents/lookup.js';

export const JOBS = new Registry('job');
useJobs(JOBS, (w, job) => huntable(w, job));   // navmaps.js needs each job's flow field, and what hunters are after

// How keen the colony is on its jobs (the numbers of the `desire` hooks below; the table «Работы: правила»):
//   stock     — a resource short: `low` below pop × low, `some` below pop × enough, `full` past it
//   food      — the food jobs: the shortage counts from pop × low to pop × enough days of food, × (base + nutrition × the
//               food's nutrition); craving — people whose favourite food has run out (fewer than `under` × the fans in stock)
//               add base + per × their share
//   chop/mine — keen[i] while the stock is below below[i] (the first that holds), then `else`; hunt — × the shortage, + extra, + `crafts` while hides or bones
//               are below `crafts.below`; fish — × the shortage, + extra
//   heal      — base + per × the patients; herbs below `herbs` — `pick`; herd — chores, tame (with a herd / the first beast)
//   beds      — the wild beds' jobs (data/plants.js `job`): base + (keen for a keep that grows, else plain) × (1 − have / keep)
export const JOB_WANT = {
  stock: {low: 0.7, some: 0.25, full: 0.04},
  food: {low: 4, enough: 8, base: 0.7, nutrition: 0.3, craving: {under: 2, base: 0.08, per: 0.3}},
  chop: {below: [8, 25, 40], keen: [0.95, 0.55, 0.2], else: 0.03}, mine: {below: [20, 40], keen: [0.48, 0.18], else: 0.03},
  dig: 0.42, fish: {k: 0.95, extra: 0.08}, hunt: {k: 0.75, extra: 0.08, crafts: {below: 4, add: 0.3}},
  farm: 0.55, heal: {base: 0.9, per: 0.1, herbs: 10, pick: 0.28}, herd: {chores: 0.5, tame: 0.45, first: 0.62}, bury: 0.7, build: 0.6,
  beds: {base: 0.3, keen: 0.4, plain: 0.2},
};
const W = JOB_WANT;
// how much the colony wants more of a resource: fills up when the stock is low
const want = (stock, pop, low, enough) => (stock < pop * low ? W.stock.low : stock < pop * enough ? W.stock.some : W.stock.full);
// a stock's keenness by steps (keen[i] below below[i], then `else`)
const stepped = (n, S) => { for (let i = 0; i < S.below.length; i++) if (n < S.below[i]) return S.keen[i]; return S.else; };

// Food jobs name the food they bring (`food`, an id from data/foods.js). How much the colony wants
// such a job grows with
//   - how short of food it is (want above),
//   - how filling that food is (nutrition: meat and fish beat berries),
//   - cravings: people whose favourite food has run out push for the job that brings it.
// Each colonist also takes the job bringing their own favourite food more readily (agents/brains/colonist.js).
// k scales the shortage pull for slow or risky work, extra is added on top.
const foodWant = (w, ctx, job, k = 1, extra = 0) => {
  const f = FOODS.get(job.food), fans = ctx.favourites[job.food] || 0;
  const F = W.food, C = F.craving;
  const craving = fans && (w.stock[job.food] || 0) < fans * C.under ? C.base + C.per * fans / Math.max(1, ctx.pop) : 0;
  return want(ctx.food, ctx.pop, F.low, F.enough) * (F.base + F.nutrition * f.nutrition) * k + craving + extra;
};

// what hunters go after: their usual prey; big dangerous game (`lastResort`, a mule) only when
// there is nothing else on the map and the colony is going hungry (wild goats are for taming, not
// the pot, unless the colony is starving)
// (a boar, `risky`) only when there is no gentler game on the map
// `a`: the hunter — big dangerous game only for one whose hunting tier reaches `riskyTier` (agents/skills.js)
export function huntable(w, job, a = null) {
  const alive = o => !o.dead && !o.tame;
  const usual = ofSpeciesList(w, job.prey, alive);
  if (usual.length) return usual;
  if (a && !canDoAction(a, job.skill, job.riskyTier)) return [];
  const risky = job.risky ? ofSpeciesList(w, job.risky, alive) : [];
  if (risky.length || !job.lastResort) return risky;
  const pop = w.agents.filter(o => o.faction === 'colony').length;   // scan: last-resort hunting only, when there is no other game
  const hungry = RESOURCES_FOOD().reduce((s, r) => s + (w.stock[r.id] || 0), 0) < pop * 2;
  return hungry ? w.agents.filter(o => !o.dead && o.faction === 'wild' && job.lastResort.includes(o.species)) : [];   // scan: last-resort hunting only
}
const RESOURCES_FOOD = () => FOODS.all();

// craft jobs: wanted with `value` while one of their stations has an order to work on
const atStations = value => (w, ctx, job) => (job.stations.some(s => ctx.orders[s]) ? value : -1);

JOBS.registerAll([
  {id: 'gather', skill: 'gathering', label: 'собирать ягоды', short: 'сбор', verb: 'собирает ягоды', preferable: true,
    runner: 'harvest', nav: 'berries', resource: 'berries', food: 'berries', carry: 3, time: 12, memory: 'walkFood',
    desire: (w, ctx, job) => foodWant(w, ctx, job),
    valid: (w, i) => w.grid.food[i] > 0.3 && w.grid.fire[i] === 0,
    take: (w, i) => { w.grid.food[i] -= 0.34; w.nav.dirty('berries'); }},

  {id: 'chop', skill: 'woodcutting', label: 'рубить лес', short: 'рубка', verb: 'рубит лес', preferable: true,
    runner: 'harvest', nav: 'trees', resource: 'wood', carry: 2, time: 26, memory: 'walkWood',
    // wood is fuel too: with the fire about to die everyone thinks of logs first
    desire: (w, ctx) => stepped(w.stock.wood, W.chop),
    valid: (w, i) => w.grid.terr[i] === T.FOREST && w.grid.wood[i] > 0.25 && w.grid.fire[i] === 0,
    take: (w, i) => {
      const g = w.grid; g.wood[i] -= 0.35;
      if (g.wood[i] < 0.1) { g.terr[i] = g.under?.[i] || T.GRASS; g.fuel[i] = BY_CODE[g.terr[i]].fuel; g.wood[i] = 0; }
      w.nav.dirty('trees');
    }},

  {id: 'mine', skill: 'mining', label: 'добывать камень', short: 'камень', verb: 'добывает камень', preferable: true,
    runner: 'harvest', nav: 'rockface', resource: 'stone', carry: 2, time: 30, requires: 'quarry',
    desire: (w) => stepped(w.stock.stone, W.mine),
    valid: (w, i) => w.grid.fire[i] === 0,
    take: () => {}},

  // the mine: dig whichever ore the colony is short of (iron ore, coal, gems) from the rock face
  {id: 'dig', skill: 'mining', tier: 2, label: 'добывать руду', short: 'руда', verb: 'добывает руду', preferable: true,
    // open: in a camp of the campaign that stopped to dig, the outcrop is worked without a mine (settlement/query.js)
    runner: 'harvest', nav: 'ore', resource: 'ironore', carry: 2, time: 40, requires: 'mineshaft', open: true, memory: 'walkOre',
    desire: (w) => (wantedOre(w).size ? W.dig : -1),
    valid: (w, i) => w.grid.fire[i] === 0 && oreBeside(w, i, wantedOre(w)) >= 0,
    take: (w, i, a) => {
      const g = w.grid, j = oreBeside(w, i, wantedOre(w)); if (j < 0) return null;
      const o = oreOf(w, j), got = [o.resource];
      for (const [r, ch] of Object.entries(o.also || {})) if (w.rngs.colony() < ch) got.push(r);   // native silver
      g.oreLeft[j] -= 1;
      // a worked-out vein leaves a passage in the rock: the face behind it opens up for digging,
      // and once in a long while a quartz vein with gold shows in it (settlement/precious.js)
      if (g.oreLeft[j] <= 0) { g.ore[j] = 0; g.oreLeft[j] = 0; g.terr[j] = T.GRASS; g.fuel[j] = 0; w.nav.dirty('ore'); w.nav.dirty('rockface'); maybeGoldVein(w, j, a); }
      if (o.id === 'mithril') foundMithril(w, a);
      return got;
    }},

  // fishing: sit on the shore of a lake that still has fish; needs a rod (in hand or on the back),
  // made at the craftsman's hut. The fisherman's hut only makes it better, as the lodge does for hunting
  {id: 'fish', skill: 'fishing', label: 'рыбачить', short: 'рыбалка', verb: 'рыбачит', preferable: true,
    runner: 'harvest', nav: 'shore', resource: 'fish', food: 'fish', carry: 3, time: 50, memory: 'walkFish',
    canDo: (w, a) => !w.campaign && !!a.gear?.tool.fish,   // (a caravan does not fish: data/transport.js CAMP_KIT)
    desire: (w, ctx, job) => (w.lakes.some(fishable) ? foodWant(w, ctx, job, W.fish.k, W.fish.extra) : -1),
    valid: (w, i) => !!lakeBeside(w, i),
    take: (w, i) => { const l = lakeBeside(w, i); if (l) { l.fish -= 1; if (!fishable(l)) w.nav.dirty('shore'); } }},

  {id: 'hunt', skill: 'hunting', riskyTier: 2, label: 'охотиться', short: 'охота', verb: 'охотится', preferable: true,
    runner: 'hunt', nav: 'prey', prey: ['hare', 'deer', 'fox', 'salamander'], risky: ['boar', 'elk'], lastResort: ['mule', 'goat'], food: 'meat',
    canDo: (w, a) => !!a.gear?.rangedReady,
    // hides and bones for the crafts, furs for the traders: hunting is wanted beyond food too
    desire: (w, ctx, job) => (ctx.preyCount > 0 ? foodWant(w, ctx, job, W.hunt.k, W.hunt.extra + ((w.stock.hide < W.hunt.crafts.below || w.stock.bone < W.hunt.crafts.below) ? W.hunt.crafts.add : 0)) : -1)},

  {id: 'craft', skill: 'carpentry', label: 'мастерить', short: 'ремесло', verb: 'мастерит', preferable: true,
    runner: 'craft', stations: ['crafthut'], desire: atStations(0.55)},

  // the healing potion (data/recipes.js `potion`): brewed in the healer's hut while there are herbs to spare
  {id: 'brew', skill: 'medicine', label: 'варить зелья', short: 'зелья', verb: 'варит зелья', preferable: true,
    runner: 'craft', stations: ['healerhut'], desire: atStations(0.5)},

  {id: 'charcoal', skill: 'metallurgy', label: 'жечь уголь', short: 'уголь', verb: 'жжёт уголь', preferable: true,
    runner: 'craft', stations: ['charpit'], desire: atStations(0.45)},

  {id: 'smith', skill: 'smithing', label: 'плавить и ковать железо', short: 'кузня', verb: 'работает у горна', preferable: true,
    runner: 'craft', stations: ['forge', 'smelter'], desire: atStations(0.55)},

  {id: 'jewel', skill: 'jewelry', label: 'делать украшения', short: 'ювелир', verb: 'делает украшения', preferable: true,
    runner: 'craft', stations: ['jeweler'], desire: atStations(0.35)},

  // field work: sow empty plots in spring and summer, reap ripe ones (settlement/farming.js)
  {id: 'farm', skill: 'farming', label: 'работать в поле', short: 'поле', verb: 'работает в поле', preferable: true,
    runner: 'farm', nav: 'fieldwork', requires: 'field', carry: 4, time: 16,
    desire: (w) => (fields(w).some(b => b.plots.some(p => needsWork(w, p))) ? W.farm : -1)},

  {id: 'mill', skill: 'cooking', label: 'молоть зерно', short: 'мельник', verb: 'мелет зерно', preferable: true,
    runner: 'craft', stations: ['quern'], desire: atStations(0.4)},

  {id: 'saw', skill: 'carpentry', label: 'пилить тёс', short: 'тёс', verb: 'пилит тёс', preferable: true,
    runner: 'craft', stations: ['sawmill'], desire: atStations(0.45)},

  {id: 'weave', skill: 'tailoring', label: 'ткать', short: 'ткач', verb: 'ткёт холст', preferable: true,
    runner: 'craft', stations: ['loom'], desire: atStations(0.4)},

  {id: 'pottery', skill: 'pottery', label: 'лепить горшки', short: 'гончар', verb: 'лепит горшки', preferable: true,
    runner: 'craft', stations: ['potter'], desire: atStations(0.4)},

  {id: 'preserve', skill: 'cooking', label: 'делать заготовки', short: 'заготовки', verb: 'вялит и солит припасы', preferable: true,
    runner: 'craft', stations: ['dryrack'], desire: atStations(0.5)},

  {id: 'cook', skill: 'cooking', label: 'стряпать', short: 'повар', verb: 'варит похлёбку', preferable: true,
    runner: 'craft', stations: ['hearth'], desire: atStations(0.55)},

  {id: 'tan', skill: 'leatherwork', label: 'выделывать кожи', short: 'кожи', verb: 'выделывает кожи', preferable: true,
    runner: 'craft', stations: ['tannery'], desire: atStations(0.5)},

  // the healer: tends the wounded lying in the healer's hut; with nobody to tend, picks healing herbs
  // while the stock is low (settlement/healing.js). Tending trains medicine, picking herbs trains gathering.
  {id: 'heal', skill: 'medicine', gatherSkill: 'gathering', tendTier: 2, label: 'лечить раненых', short: 'лекарь', verb: 'лечит', preferable: true,
    runner: 'heal', requires: 'healerhut',
    // one healer at a time: whoever took it first keeps it
    canDo: (w, a) => !w.agents.some(o => o !== a && o.faction === 'colony' && o.task?.job === 'heal'), nav: plantLayer('herbs'), resource: 'herbs', carry: 2, time: 30,   // scan: TODO: every colonist asks it in decide — the job board (docs/TESTING.md, stress test)
    // the wounded call only a healer able to tend them (`tendTier`, medicine); anyone may pick herbs
    desire: (w, ctx, job) => (ctx.patients && ctx.can(job.skill, job.tendTier) ? W.heal.base + W.heal.per * ctx.patients : (w.stock.herbs || 0) < W.heal.herbs ? W.heal.pick : -1),
    valid: (w, i) => w.grid[plantLayer('herbs')][i] >= PLANTS.get('herbs').ripe && w.grid.fire[i] === 0,
    take: (w, i) => { w.grid[plantLayer('herbs')][i] -= PLANTS.get('herbs').take; w.nav.dirty(plantLayer('herbs')); }},

  // the herder: milks the goats and shears them; with nothing to take, goes after a wild goat or mule
  // with bait from the stock and tries to tame it (settlement/herd.js). Trains and reads husbandry (C).
  {id: 'herd', skill: 'husbandry', label: 'ходить за скотом', short: 'скотник', verb: 'ходит за скотом', preferable: true,
    runner: 'herd', requires: 'pen', carry: 4, time: 30, tameTime: 70, sticky: 0.3,
    // wild beasts only this herder may go after (species tame.tier, husbandry)
    desire: (w, ctx) => (chores(w).length ? W.herd.chores : tameTargets(w).some(b => canTame(ctx.agent, b)) ? (herd(w).length ? W.herd.tame : W.herd.first) : -1)},

  // the dead are carried to the graves (settlement/life.js); not while raiders are about or wolves near the body
  {id: 'bury', skill: 'athletics', label: 'хоронить умерших', short: 'похороны', verb: 'хоронит умершего',
    runner: 'bury', time: 120,
    // only one bearer per body: the others would take the job, find nothing free and drop it at once
    canDo: (w, a) => hpShare(a) > 0.5 && !!freeCorpse(w, a),
    desire: w => (reachableCorpses(w).length && !raidAlarm(w) ? W.bury : -1)},

  {id: 'build', skill: 'construction', label: 'строить', short: 'стройка', verb: 'строит', preferable: true,
    runner: 'build', nav: 'sites',
    desire: (w, ctx) => (ctx.openSites ? W.build : -1)},
]);

// gathering jobs for wild beds (data/plants.js `job`): wanted while the stock is below `keep`
// and the season allows; a picking may bring something extra (`also`) or hurt (`hurt`, bee stings)
for (const p of PLANTS.filter(x => x.job)) {
  const J = p.job, key = plantLayer(p.id);
  const inSeason = w => !p.seasons || p.seasons.includes(season(w).id);
  const keep = w => (typeof J.keep === 'function' ? J.keep(w) : J.keep);
  JOBS.register({id: J.id, label: J.label, short: J.short, verb: J.verb, preferable: true, skill: J.skill || 'gathering', tier: J.tier,
    runner: 'harvest', nav: key, resource: p.resource, carry: J.carry, time: J.time,
    also: Object.keys(p.also || {}), bed: p.id,   // what else a picking brings, and the wild bed it needs (settlement/sources.js)
    // only with the right tool (a gold pan); never on a map without such beds
    canDo: J.tool ? (w, a) => !!a.gear?.tool[J.id] : undefined,
    // (hay for the herd's winter, keep(w), is wanted more keenly: the season to mow is short)
    desire: (w, ctx) => {
      if (!inSeason(w) || !(w.plantBeds?.[p.id]?.length)) return -1;
      const k = keep(w), have = w.stock[p.resource] || 0;
      return have < k ? (W.beds.base + (typeof J.keep === 'function' ? W.beds.keen : W.beds.plain) * (1 - have / k)) * (J.weight ?? 1) : -1;
    },
    valid: (w, i) => inSeason(w) && w.grid[key][i] >= p.ripe && w.grid.fire[i] === 0,
    take: (w, i, a) => {
      w.grid[key][i] -= p.take; if (w.grid[key][i] < p.ripe) w.nav.dirty(key);
      if (J.hurt && a) { a.hp -= J.hurt * (0.5 + w.rngs.colony()); if (a.mem) a.mem.stung = (a.mem.stung || 0) + 0.2; }
      const got = [p.resource];
      for (const [r, ch] of Object.entries(p.also || {})) if (w.rngs.colony() < ch) got.push(r);
      return got;
    }});
}

// a craft job opens as soon as one of its stations is built
for (const j of JOBS.all()) if (j.runner === 'craft' && !j.requires) j.requires = j.stations;
