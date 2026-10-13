// Generic routines that carry out JOBS. A job picks one with its `runner` field,
// so a new job usually needs only a data entry.
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

const mill = (w, a) => { a.x += (w.rng() - 0.5) * 0.2; a.y += (w.rng() - 0.5) * 0.2; };

// skilled hands work faster, the right tool helps; practice slowly builds skill
export function workRate(w, a, jobId) {
  a.skill[jobId] = Math.min(1, (a.skill[jobId] || 0) + 0.0006);
  // a good mood helps a little, a bad one slows down (±10%)
  return (1 + 0.7 * a.skill[jobId]) * a.mods.work * jobSpeedOf(w, jobId) * seasonJob(w, jobId) * (a.gear?.tool[jobId] || 1) * (1 + 0.1 * moodOf(w, a));
}
// a building may spare the tools of one job (effects.toolWear in data/buildings.js)
const toolWear = (w, a, jobId, amount = 1) => { const it = a.gear?.toolItem[jobId]; if (it) wear(w, a, it, amount * (w.mods.toolWear?.[jobId] ?? 1)); };

const done = (a) => { a.task = null; a.think = 0; };

// what an agent carries: {res: {resource: units}, n: total}
export function load(a, res, n) {
  if (!a.carry) a.carry = {res: {}, n: 0};
  a.carry.res[res] = (a.carry.res[res] || 0) + n; a.carry.n += n;
}

// carry what you hold back to the camp stock
function haulHome(w, a) {
  if (follow(w, a, 'camp') !== 'arrived') return;
  for (const [res, n] of Object.entries(a.carry.res)) deposit(w, res, n);
  a.carry = null; done(a);
}

export const RUNNERS = {
  harvest(w, a, task) {
    const job = JOBS.get(task.job), cap = job.carry + (a.gear?.carry || 0);
    if (a.carry && (a.carry.n >= cap || (task.eatNow && a.carry.n >= 1))) {
      if (task.eatNow) { a.needs.food = Math.min(1, a.needs.food + 0.4 * a.carry.n); a.carry = null; done(a); return; }
      haulHome(w, a); return;
    }
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
      if (a.carry?.n) a.carry.n = cap; else { a.task = {id: 'idle'}; a.think = 20; }
    }
    if (job.memory && r === 'moving' && !a.carry) { const d = w.nav.get(job.nav)[i]; if (d > 25) a.mem[job.memory] += 0.003; }
  },

  build(w, a, task) {
    const i = cellOf(w, a), id = w.grid.bld[i], site = id >= 0 ? buildingById(w, id) : null;
    if (site && !site.done && w.grid.fire[i] === 0) { const amt = workRate(w, a, 'build'); a.stats.labour += amt; addLabour(w, site, amt, a); toolWear(w, a, 'build', 0.05); return; }
    const r = follow(w, a, 'sites');
    if (r === 'none' || r === 'arrived') { w.nav.dirty('sites'); done(a); a.think = 10; }
  },

  // work the current order at a station building (crafthut, tannery…)
  craft(w, a, task) {
    const job = JOBS.get(task.job);
    // keep to the station chosen when the task started, as long as it still has work and a free bench
    if (!task.station || !stationHasWork(w, task.station, a)) {
      const open = job.stations.filter(s => stationHasWork(w, s, a));
      task.station = open.sort((x, y) => stationPriority(w, y) - stationPriority(w, x))[0];
    }
    if (!task.station) { done(a); a.think = 20; return; }   // nothing to make anywhere or every bench is taken
    const map = 'station:' + task.station;
    const r = follow(w, a, map);
    if (r === 'arrived') {
      const b = buildingById(w, w.grid.bld[cellOf(w, a)]);
      if (b) markWorking(w, b, a);
      if (!b || !b.done || !workAt(w, b, workRate(w, a, job.id), a)) { done(a); a.think = 20; }
    } else if (r === 'none') { w.nav.dirty(map); done(a); a.think = 20; }
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
      if (a.carry?.n) { task.more = false; return; }
      done(a); a.think = 20;
    }
  },

  // the healer: tend whoever lies in the healer's hut; with nobody to tend, pick herbs (as harvest)
  heal(w, a, task) {
    if (waiting(w)) {
      if (a.carry?.n) { for (const [res, n] of Object.entries(a.carry.res)) deposit(w, res, n); a.carry = null; }
      const r = follow(w, a, 'healer');
      if (r === 'arrived' || healerHutCell(w, a)) {
        const given = tend(w, a, workRate(w, a, 'heal'));
        if (given) a.stats.healed = (a.stats.healed || 0) + given;
        else if (!patients(w).length && w.rng() < 0.02) mill(w, a);   // the patients are still on their way
      } else if (r === 'none') { w.nav.dirty('healer'); done(a); a.think = 20; }
      return;
    }
    RUNNERS.harvest(w, a, task);
  },

  // stalk the nearest prey, creep up within range of the bow or sling, shoot; a miss or a wound
  // sends the animal running
  hunt(w, a, task) {
    const job = JOBS.get(task.job);
    // carrying game: head home, unless there is room for another animal close by
    if (a.carry && !task.oneMore) { a.stalking = false; haulHome(w, a); return; }
    if (!a.gear?.rangedReady) { a.stalking = false; done(a); return; }   // out of arrows
    task.age = (task.age || 0) + 1;
    let prey = task.prey;
    // the flow field leads to whichever animal is nearest by path, so keep retargeting to the nearest one
    if (!prey || prey.dead || !w.agents.includes(prey) || (task.age % 40 === 0 && Math.hypot(prey.x - a.x, prey.y - a.y) > 9)) {
      prey = null; let bd = 80 * 80;
      for (const o of huntable(w, job)) { const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d < bd) { bd = d; prey = o; } }
      task.prey = prey;
      if (!prey) { done(a); a.think = 30; a.stalking = false; return; }
    }
    if (task.age > 900) { a.mem.chase += 0.2; a.stalking = false; done(a); return; }   // gave up
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
    a.skill[job.id] = Math.min(1, (a.skill[job.id] || 0) + 0.0003);
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
