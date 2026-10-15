// Generic routines that carry out JOBS. A job picks one with its `runner` field,
// so a new job usually needs only a data entry.
import {FOODS} from '../data/foods.js';
import {brewFactor} from '../settlement/life.js';
import {JOBS, huntable} from '../data/jobs.js';
import {SPECIES} from '../data/species.js';
import {cellOf} from '../world/grid.js';
import {follow, moveToward, approach} from './movement.js';
import {deposit} from '../settlement/stock.js';
import {addLabour} from '../settlement/buildings.js';
import {buildingById} from '../settlement/query.js';
import {jobSpeedOf} from '../settlement/mods.js';
import {workAt, stationHasWork, markWorking, stationPriority} from '../settlement/crafting.js';
import {wear} from './equipment.js';
import {shoot} from './combat.js';
import {kill} from './agent.js';
import {think, moodOf} from './mind.js';
import {add} from '../settlement/chronicle.js';
import {seasonJob} from '../data/seasons.js';
import {plotAt, needsWork, workPlot} from '../settlement/farming.js';
import {tend, patients, waiting, healerHutCell} from '../settlement/healing.js';
import {chores, tameTargets, tryTame, claimed} from '../settlement/herd.js';
import {freeCorpse, graveSpot, bury, workBonus} from '../settlement/life.js';
import {damage} from './combat.js';

const mill = (w, a) => { a.x += (w.rng() - 0.5) * 0.2; a.y += (w.rng() - 0.5) * 0.2; };

// skilled hands work faster, the right tool helps; practice slowly builds skill
export function workRate(w, a, jobId) {
  a.skill[jobId] = Math.min(1, (a.skill[jobId] || 0) + 0.0006 * (a.mods.learn ?? 1));
  // a good mood helps a little, a bad one slows down (±10%)
  return (1 + 0.7 * a.skill[jobId]) * a.mods.work * jobSpeedOf(w, jobId) * seasonJob(w, jobId) * (a.gear?.tool[jobId] || 1) * (1 + 0.1 * moodOf(w, a)) * brewFactor(w, a);
}
// a building may spare the tools of one job (effects.toolWear in data/buildings.js)
const toolWear = (w, a, jobId, amount = 1) => { const it = a.gear?.toolItem[jobId]; if (it) wear(w, a, it, amount * (w.mods.toolWear?.[jobId] ?? 1)); };

const done = (a) => { a.task = null; a.think = 0; };
// give the task up and say why (the colonist's card shows it, agents/brains/colonist.js noteStop)
const fail = (a, why) => { a.stopWhy = why; done(a); };

// What an agent carries: {res: {resource: units}, n: total}; n is always the sum of res.
// The load belongs to the agent, not to the task: a colonist who drops a job (to fight, to sleep) keeps
// what is in the hands and leaves it at the stores next time at the camp (agents/brains/colonist.js).
export function load(a, res, n) {
  if (!a.carry) a.carry = {res: {}, n: 0};
  a.carry.res[res] = (a.carry.res[res] || 0) + n; a.carry.n += n;
}
// take n units of one resource out of the load
export function unload(a, res, n) {
  if (!a.carry?.res[res]) return 0;
  const k = Math.min(n, a.carry.res[res]);
  a.carry.res[res] -= k; a.carry.n -= k;
  if (a.carry.res[res] <= 0) delete a.carry.res[res];
  if (a.carry.n <= 0) a.carry = null;
  return k;
}
// food units in the load (berries from the bushes, game from a hunt)
export const carriedFood = a => Object.entries(a.carry?.res || {}).reduce((s, [r, n]) => s + (FOODS.has(r) ? n : 0), 0);
// eat what food is in the hands, the most filling first; whatever is not food stays in the load
export function eatCarried(a) {
  let fed = 0;
  for (const r of Object.keys(a.carry?.res || {}).filter(r => FOODS.has(r)).sort((x, y) => FOODS.get(y).nutrition - FOODS.get(x).nutrition)) {
    while (a.needs.food + fed < 0.95 && unload(a, r, 1)) fed += 0.4 * FOODS.get(r).nutrition;
  }
  a.needs.food = Math.min(1, a.needs.food + fed);
  return fed;
}
// leave the whole load at the stores (the caller is at the camp)
export function dropLoad(w, a) {
  for (const [res, n] of Object.entries(a.carry?.res || {})) deposit(w, res, n);
  a.carry = null;
}

// carry what you hold back to the camp stock
function haulHome(w, a) {
  if (a.task) a.task.hauling = true;   // the delivery itself: only something urgent breaks it off
  if (follow(w, a, 'camp') !== 'arrived') return;
  dropLoad(w, a); done(a);
}

export const RUNNERS = {
  harvest(w, a, task) {
    const job = JOBS.get(task.job), cap = job.carry + (a.gear?.carry || 0);
    // gathering to eat on the spot (the stores are empty): eat the first food picked, nothing else
    if (task.eatNow) { if (carriedFood(a) >= 1) { eatCarried(a); done(a); return; } }
    else if (a.carry && (a.carry.n >= cap || task.full)) { haulHome(w, a); return; }
    const r = follow(w, a, job.nav), i = cellOf(w, a);
    if (r === 'arrived') {
      if (!job.valid(w, i)) { w.nav.dirty(job.nav); task.work = 0; return; }
      task.work = (task.work || 0) + workRate(w, a, job.id);
      if (task.work < job.time) return;
      task.work = 0;
      // take() may name what was got (one id or several: honey and a bit of wax)
      for (const got of [].concat(job.take(w, i, a) || job.resource)) { load(a, got, 1); add(a.stats.gathered, got); add(w.chronicle.gathered, got); }
      if (a.hp <= 0) { kill(w, a, 'укусов пчёл'); return; }
      toolWear(w, a, job.id);
    } else if (r === 'none') {
      if (w.nav.dirtySet.has(job.nav)) return;   // the map is being rebuilt for this job: wait a tick
      if (a.carry?.n) task.full = true; else { a.stopWhy = 'собирать нечего: всё выбрано или не дойти'; a.task = {id: 'idle'}; a.think = 20; }   // nothing left to gather: bring home what there is
    }
    if (job.memory && r === 'moving' && !a.carry) { const d = w.nav.get(job.nav)[i]; if (d > 25) a.mem[job.memory] += 0.003; }
  },

  build(w, a, task) {
    const i = cellOf(w, a), id = w.grid.bld[i], site = id >= 0 ? buildingById(w, id) : null;
    if (site && !site.done && w.grid.fire[i] === 0) { const amt = workRate(w, a, 'build'); a.stats.labour += amt; addLabour(w, site, amt, a); toolWear(w, a, 'build', 0.05); return; }
    const r = follow(w, a, 'sites');
    if (r === 'none' || r === 'arrived') { w.nav.dirty('sites'); fail(a, r === 'none' ? 'к стройке нет пути' : 'стройка уже закончена'); a.think = 10; }
  },

  // work the current order at a station building (crafthut, tannery…)
  craft(w, a, task) {
    const job = JOBS.get(task.job);
    // keep to the station chosen when the task started, as long as it still has work and a free bench
    if (!task.station || !stationHasWork(w, task.station, a)) {
      const open = job.stations.filter(s => stationHasWork(w, s, a));
      task.station = open.sort((x, y) => stationPriority(w, y) - stationPriority(w, x))[0];
    }
    if (!task.station) { fail(a, 'заказов нет или все верстаки заняты'); a.think = 20; return; }
    const map = 'station:' + task.station;
    const r = follow(w, a, map);
    if (r === 'arrived') {
      const b = buildingById(w, w.grid.bld[cellOf(w, a)]);
      if (b) markWorking(w, b, a);
      // a furnished workshop is a better place to work (settlement/life.js)
      if (!b || !b.done || !workAt(w, b, workRate(w, a, job.id) * workBonus(b), a)) { done(a); a.think = 20; }
    } else if (r === 'none') { if (w.nav.dirtySet.has(map)) return; w.nav.dirty(map); fail(a, 'к мастерской нет пути'); a.think = 20; }
  },

  // field work: walk to a plot that needs it, sow it (a seed from the stock) or reap it and carry the crop home
  farm(w, a, task) {
    const job = JOBS.get(task.job);
    if (a.carry && (a.carry.n >= job.carry || !task.more)) { haulHome(w, a); return; }
    const r = follow(w, a, job.nav), i = cellOf(w, a);
    if (r === 'arrived') {
      const p = plotAt(w, i);
      if (!p || !needsWork(w, p)) { w.nav.dirty(job.nav); task.work = 0; return; }
      task.work = (task.work || 0) + workRate(w, a, job.id);
      if (task.work < job.time) return;
      task.work = 0;
      const got = workPlot(w, i);
      if (got) { for (const [res, n] of Object.entries(got)) { load(a, res, n); add(a.stats.gathered, res, n); add(w.chronicle.gathered, res, n); } task.more = a.carry.n < job.carry; }
    } else if (r === 'none') {
      if (w.nav.dirtySet.has(job.nav)) return;
      if (a.carry?.n) { task.more = false; return; }
      done(a); a.think = 20;
    }
  },

  // the healer: tend whoever lies in the healer's hut; with nobody to tend, pick herbs (as harvest)
  heal(w, a, task) {
    if (waiting(w)) {
      if (a.carry?.n) dropLoad(w, a);
      const r = follow(w, a, 'healer');
      if (r === 'arrived' || healerHutCell(w, a)) {
        const given = tend(w, a, workRate(w, a, 'heal') * workBonus(w.buildings.find(x => x.done && x.key === 'healerhut')));
        if (given) a.stats.healed = (a.stats.healed || 0) + given;
        else if (!patients(w).length && w.rng() < 0.02) mill(w, a);   // the patients are still on their way
      } else if (r === 'none') { w.nav.dirty('healer'); fail(a, 'к хижине лекаря нет пути'); a.think = 20; }
      return;
    }
    RUNNERS.harvest(w, a, task);
  },

  // the herder: milk and shear what is ready in the pen; otherwise take bait to a wild goat or mule,
  // creep up slowly (it lets a calm herder come) and try to tame it (settlement/herd.js)
  herd(w, a, task) {
    const job = JOBS.get(task.job);
    if (a.carry && (a.carry.n >= job.carry || !task.more)) { haulHome(w, a); return; }
    let b = task.beast != null ? w.agents.find(o => o.id === task.beast && !o.dead) : null;
    const ok = o => o && (o.tame ? chores(w).includes(o) : !claimed(w, o, a) && tameTargets(w).includes(o));
    if (!ok(b)) {
      b = null; task.calm = false; task.tame = null;
      let bd = Infinity;
      for (const o of chores(w)) { const d = Math.hypot(o.x - a.x, o.y - a.y); if (d < bd) { bd = d; b = o; } }
      if (!b && !a.carry) for (const o of tameTargets(w)) { if (claimed(w, o, a)) continue; const d = Math.hypot(o.x - a.x, o.y - a.y); if (d < bd) { bd = d; b = o; } }
      if (!b) { if (a.carry?.n) { task.more = false; return; } fail(a, 'некого приручать или доить'); a.think = 30; return; }
      task.beast = b.id; task.work = 0; task.since = w.tick;
    }
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!b.tame) { task.tame = b.id; task.calm = d < 8; b.tamer = a.id; b.tamerAt = w.tick; }
    if (d > 1.3) {
      // far off: walk to where the beast was a while ago (a path is planned once, not after every step it takes)
      if (!task.spot || d < 12 || w.tick - task.spotAt > 150) { task.spot = d < 12 ? null : [b.x, b.y]; task.spotAt = w.tick; }
      const [tx, ty] = task.spot || [b.x, b.y];
      if (approach(w, a, tx, ty, task.calm ? 0.75 : 1) === null || w.tick - task.since > 1500) {
        if (!b.tame) b.unreachable = w.tick;   // across water or rock: leave it for a while
        task.beast = null; done(a); a.think = 40;
      }
      return;
    }
    task.work = (task.work || 0) + workRate(w, a, job.id);
    if (b.tame) {
      if (task.work < job.time) return;
      task.work = 0;
      const T = SPECIES.get(b.species).tame, got = {};
      if ((b.milk || 0) >= 1) { const n = Math.floor(b.milk); got.milk = n; b.milk -= n; }
      if (T.wool && b.wool >= 1 && chores(w).includes(b)) { got.wool = T.wool; b.wool = 0; }
      for (const [r, n] of Object.entries(got)) { load(a, r, n); add(a.stats.gathered, r, n); add(w.chronicle.gathered, r, n); }
      task.beast = null; task.more = (a.carry?.n || 0) < job.carry && chores(w).length > 0;
      return;
    }
    if (task.work < job.tameTime) return;
    task.work = 0;
    const r = tryTame(w, a, b);
    if (r === 'failed') {
      const T = SPECIES.get(b.species).tame;
      // a mule kicks out once and the herder backs off; a goat shies, and the herder tries again
      if (T.kicks) { b.flash = 4; damage(w, b, a, 0.12 * SPECIES.get(b.species).attack.power); think(w, a, 'kicked'); task.beast = null; b.tamer = null; a.think = 10; done(a); }
      task.work = -20;   // a goat shies off a step; the herder waits a moment and holds out the hay again
      return;
    }
    task.beast = null; task.calm = false; task.tame = null; b.tamer = null;
    if (r !== 'tamed') done(a);
  },

  // carry a body to the graves and bury it (settlement/life.js)
  bury(w, a, task) {
    const job = JOBS.get(task.job);
    let c = task.corpse != null ? (w.corpses || []).find(x => x.id === task.corpse) : null;
    if (!c) { c = freeCorpse(w, a); if (!c) { fail(a, 'тело уже несут другие'); a.think = 30; return; } task.corpse = c.id; task.carrying = false; }
    c.by = a.id; c.at = w.tick;
    if (!task.carrying) {
      const r = approach(w, a, c.x, c.y);
      if (r === null) { c.by = null; fail(a, 'к телу не подойти'); a.think = 60; return; }
      if (Math.hypot(c.x - a.x, c.y - a.y) < 0.9) { task.carrying = true; task.spot = graveSpot(w); }
      return;
    }
    c.x = a.x; c.y = a.y;   // the body goes where it is carried
    const [sx, sy] = task.spot;
    if (Math.hypot(sx - a.x, sy - a.y) > 0.6) { if (approach(w, a, sx, sy, 0.8) === null) { task.spot = graveSpot(w); } return; }
    task.work = (task.work || 0) + workRate(w, a, job.id);
    if (task.work < job.time) return;
    bury(w, c, a, task.spot); done(a);
  },

  // stalk the nearest prey, creep up within range of the bow or sling, shoot; a miss or a wound
  // sends the animal running
  hunt(w, a, task) {
    const job = JOBS.get(task.job);
    // carrying game: head home, unless there is room for another animal close by
    if (a.carry && !task.oneMore) { a.stalking = false; haulHome(w, a); return; }
    if (!a.gear?.rangedReady) { a.stalking = false; fail(a, 'нечем стрелять: кончились стрелы'); return; }
    task.age = (task.age || 0) + 1;
    let prey = task.prey;
    // the flow field leads to whichever animal is nearest by path, so keep retargeting to the nearest one
    if (!prey || prey.dead || !w.agents.includes(prey) || (task.age % 40 === 0 && Math.hypot(prey.x - a.x, prey.y - a.y) > 9)) {
      prey = null; let bd = 80 * 80;
      for (const o of huntable(w, job)) { const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d < bd) { bd = d; prey = o; } }
      task.prey = prey;
      if (!prey) { fail(a, 'дичи не видно'); a.think = 30; a.stalking = false; return; }
    }
    if (task.age > 900) { a.mem.chase += 0.2; a.stalking = false; fail(a, 'дичь ушла, устал гоняться'); return; }
    const d = Math.hypot(prey.x - a.x, prey.y - a.y), range = a.gear.ranged.range + w.mods.add.huntRange;
    a.stalking = d < 10;
    if (d > range * 0.85) {
      // far away: walk the prey flow field around lakes and rocks; close: creep straight at it
      if (d > 9) {
        const r = follow(w, a, job.nav);
        if (r !== 'moving') { w.nav.dirty(job.nav); approach(w, a, prey.x, prey.y); }   // the field is stale: the prey has moved on
      } else if (approach(w, a, prey.x, prey.y, 0.55) === null) { task.prey = null; }   // across the water: look for another
      return;
    }
    a.skill[job.id] = Math.min(1, (a.skill[job.id] || 0) + 0.0003 * (a.mods.learn ?? 1));
    const res = shoot(w, a, prey, job.id);
    if (res === 'kill') {
      w.stats.hunted++; a.stalking = false; a.stats.hunted++;
      think(w, a, 'huntKill', {prey: SPECIES.get(prey.species).labelAcc || SPECIES.get(prey.species).label});
      for (const [r, n] of Object.entries(SPECIES.get(prey.species).yields)) load(a, r, n);
      const near = w.agents.some(o => job.prey.includes(o.species) && !o.dead && Math.hypot(o.x - a.x, o.y - a.y) < 20);
      task.oneMore = a.carry.n < 8 && near; task.prey = null; task.age = 0;
    } else if (res === 'miss' || res === 'hit') {
      prey.spooked = 40;   // the shot whistles past or wounds: the hare bolts
      if (res === 'miss') a.mem.chase += 0.05;
    }
  },
};
