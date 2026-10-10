// Generic routines that carry out JOBS. A job picks one with its `runner` field,
// so a new job usually needs only a data entry.
import {JOBS} from '../data/jobs.js';
import {SPECIES} from '../data/species.js';
import {cellOf} from '../world/grid.js';
import {follow, moveToward} from './movement.js';
import {deposit} from '../settlement/stock.js';
import {addLabour, } from '../settlement/buildings.js';
import {buildingById} from '../settlement/query.js';
import {jobSpeedOf} from '../settlement/mods.js';
import {kill} from './agent.js';

// skilled hands work faster; practice slowly builds skill
export function workRate(w, a, jobId) {
  a.skill[jobId] = Math.min(1, (a.skill[jobId] || 0) + 0.0006);
  return (1 + 0.7 * a.skill[jobId]) * a.mods.work * jobSpeedOf(w, jobId);
}

const done = (a) => { a.task = null; a.think = 0; };

// carry what you hold back to the camp stock
function haulHome(w, a) {
  if (follow(w, a, 'camp') !== 'arrived') return;
  deposit(w, a.carry.res, a.carry.n);
  a.carry = null; done(a);
}

export const RUNNERS = {
  harvest(w, a, task) {
    const job = JOBS.get(task.job);
    if (a.carry && (a.carry.n >= job.carry || (task.eatNow && a.carry.n >= 1))) {
      if (task.eatNow) { a.needs.food = Math.min(1, a.needs.food + 0.4 * a.carry.n); a.carry = null; done(a); return; }
      haulHome(w, a); return;
    }
    const r = follow(w, a, job.nav), i = cellOf(w, a);
    if (r === 'arrived') {
      if (!job.valid(w, i)) { w.nav.dirty(job.nav); task.work = 0; return; }
      task.work = (task.work || 0) + workRate(w, a, job.id);
      if (task.work < job.time) return;
      task.work = 0; job.take(w, i);
      if (!a.carry) a.carry = {res: job.resource, n: 0};
      a.carry.n++;
    } else if (r === 'none') {
      if (a.carry?.n) a.carry.n = job.carry; else { a.task = {id: 'idle'}; a.think = 20; }
    }
    if (job.memory && r === 'moving' && !a.carry) { const d = w.nav.get(job.nav)[i]; if (d > 25) a.mem[job.memory] += 0.003; }
  },

  build(w, a, task) {
    const i = cellOf(w, a), id = w.grid.bld[i], site = id >= 0 ? buildingById(w, id) : null;
    if (site && !site.done && w.grid.fire[i] === 0) { addLabour(w, site, workRate(w, a, 'build')); return; }
    const r = follow(w, a, 'sites');
    if (r === 'none' || r === 'arrived') { w.nav.dirty('sites'); done(a); a.think = 10; }
  },

  // stalk the nearest prey, creep up within bow range, shoot; a miss sends the animal running
  hunt(w, a, task) {
    const job = JOBS.get(task.job);
    if (a.carry) { a.stalking = false; haulHome(w, a); return; }
    task.age = (task.age || 0) + 1;
    let prey = task.prey;
    if (!prey || prey.dead || !w.agents.includes(prey)) {
      prey = null; let bd = 80 * 80;
      for (const o of w.agents) if (job.prey.includes(o.species) && !o.dead) { const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d < bd) { bd = d; prey = o; } }
      task.prey = prey;
      if (!prey) { done(a); a.think = 30; a.stalking = false; return; }
    }
    if (task.age > 700) { a.mem.chase += 0.2; a.stalking = false; done(a); return; }   // gave up
    const d = Math.hypot(prey.x - a.x, prey.y - a.y), range = job.range + w.mods.add.huntRange;
    a.stalking = d < 10;
    if (d > range * 0.85) {
      // far away: walk the prey flow field around lakes and rocks; close: creep straight at it
      if (d > 9) {
        const r = follow(w, a, job.nav);
        if (r !== 'moving') { w.nav.dirty(job.nav); moveToward(w, a, prey.x, prey.y); }   // the field is stale: the prey has moved on
      } else if (moveToward(w, a, prey.x, prey.y, 0.55) === null) follow(w, a, job.nav, 0.55);
      return;
    }
    task.work = (task.work || 0) + workRate(w, a, job.id);
    if (task.work < job.time) return;
    task.work = 0;
    const hit = 0.32 + 0.45 * a.skill[job.id] - (d / range) * 0.15;
    if (Math.random() < hit) {
      const y = SPECIES.get(prey.species).yields;
      kill(w, prey, 'стрелы', a); w.stats.hunted++;
      a.carry = {res: y.resource, n: y.amount}; a.stalking = false;
    } else {
      prey.spooked = 40;   // the arrow whistles past: the hare bolts
      a.mem.chase += 0.05;
    }
  },
};
