// Colonist brain: utility AI. Every option gets a score; the best one becomes the task.
// Needs come from NEEDS, work from JOBS (weighted by personal preference), plus emergencies.
import {NEEDS} from '../../data/needs.js';
import {JOBS, huntable} from '../../data/jobs.js';
import {SPECIES} from '../../data/species.js';
import {nightness, ambientTemp} from '../../core/time.js';
import {cellOf} from '../../world/grid.js';
import {nearFire} from '../movement.js';
import {nearestHostile} from '../combat.js';
import {TASKS} from '../tasks.js';
import {stepBody} from '../body.js';
import {maxHp, hpShare} from '../agent.js';
import {colonists, foodTotal, openSites, jobUnlocked, ofSpecies, favourites} from '../../settlement/query.js';
import {councilDue, goalNeed} from '../../settlement/council.js';
import {stationHasWork} from '../../settlement/crafting.js';
import {outfit} from '../equipment.js';
import {think} from '../mind.js';
import {agentInZone} from '../../settlement/zone.js';
import {tradeOpen} from '../../settlement/trade.js';
import {hurt, waiting, HEAL} from '../../settlement/healing.js';
import {has} from '../../settlement/query.js';
import {wantsPrayer} from '../../settlement/life.js';

// how long a job dropped on its first step stays out of the choice
const JOB_SKIP = 120;

const key = t => (t ? (t.id === 'job' ? 'job:' + t.job : t.id) : '');

function decide(w, a) {
  const night = nightness(w.tick), camp = w.camp.cells, g = w.grid;
  let campHot = 0; for (const c of camp) campHot = Math.max(campHot, g.temp[c] + g.fire[c] * 400);
  const campOk = campHot < 40 ? 1 : 0.1;   // a burning camp is no place to eat or sleep
  const ctx = {pop: colonists(w).length, food: foodTotal(w), openSites: openSites(w).length,
    preyCount: huntable(w, JOBS.get('hunt')).length, favourites: favourites(w), patients: waiting(w),
    orders: new Proxy({}, {get: (o, station) => stationHasWork(w, station, a)})};
  const opts = [];
  for (const id of SPECIES.get(a.species).needs) {
    const n = NEEDS.get(id);
    opts.push([{id: n.task}, n.urge(w, a, a.needs[id]) * campOk]);
  }
  for (const job of JOBS.all()) {
    if (!jobUnlocked(w, job) || (job.canDo && !job.canDo(w, a))) continue;
    if (a.skipJob?.id === job.id && w.tick < a.skipJob.until) continue;   // just dropped it: nothing to do there
    const base = job.desire(w, ctx, job);
    if (base < 0) continue;
    const res = job.resource;
    const goal = res ? goalNeed(w, res) : 0;
    const dayWork = job.runner === 'build' ? night * 0.3 : night * 0.2;
    // a job that brings your favourite food is a little more tempting
    const tasty = job.food && a.food?.likes === job.food ? 1.2 : 1;
    opts.push([{id: 'job', job: job.id}, (base + goal - dayWork) * (a.prefs[job.id] ?? 1) * tasty]);
  }
  opts.push([{id: 'idle'}, 0.15]);
  // low spirits: a gloomy spell keeps its hold for a while; a walk to the shrine may help
  if (a.task?.id === 'sulk' && w.tick < a.task.until) opts.push([a.task, 0.95]);
  // a spell of the nechist holds until it wears off (or something more urgent: a fight, fire)
  if (a.task?.spell && w.tick < a.task.until) opts.push([a.task, a.task.spell]);
  const pray = wantsPrayer(w, a);
  if (pray > 0.1 && night < 0.5) opts.push([{id: 'pray'}, 0.3 + pray * 1.2]);
  if (councilDue(w)) opts.push([{id: 'council'}, 1.3]);
  // badly hurt, with a healer's hut: go and lie there (more urgent the worse the wounds)
  if ((hurt(a) || (a.task?.id === 'treat' && a.hp < maxHp(a) * HEAL.until)) && has(w, 'healerhut')) opts.push([{id: 'treat'}, (1 - a.hp / maxHp(a)) * 2 + 0.25]);
  if (tradeOpen(w)) opts.push([{id: 'trade'}, 1.1]);   // right after the council, the second gathering of the evening
  const brave = a.mods.bravery;
  if (w.stats.fireNearCamp > 0 && hpShare(a) > 0.6 && brave > 0.7) opts.push([{id: 'douse'}, 0.8 * brave]);
  // something is hunting me: brave and healthy people fight back, the rest run for the camp
  const hunter = w.agents.find(o => !o.dead && o.task?.id === 'maul' && o.task.target === a);
  if (hunter) {
    if (hunter.species === 'wolf') a.mem.wolf += 0.05;
    opts.push(brave * hpShare(a) > 0.85 ? [{id: 'fight', target: hunter}, 1.5] : [{id: 'runHome'}, 1.5]);
  }
  const enemy = nearestHostile(w, a, 16 * (a.mods.sight ?? 1));
  // alarm: while raiders are on the map everyone gathers inside the settlement zone and meets them
  // together; the wounded fall back
  const raid = w.agents.some(o => o.faction === 'raiders' && !o.dead);
  if (raid && !enemy) opts.push([{id: 'muster'}, 1.25]);
  if (enemy && hpShare(a) > 0.3) opts.push([{id: 'fight', target: enemy}, (raid ? 1.35 : 1.1) * brave]);
  if (enemy && hpShare(a) <= 0.3 && !agentInZone(w, a)) opts.push([{id: 'runHome'}, 1.6]);

  let best = null, bs = -Infinity;
  const cur = key(a.task);
  // the current task is kept unless something is clearly better; a long walk (`sticky` jobs) more so
  const keep = 0.12 + (a.task?.id === 'job' ? JOBS.get(a.task.job).sticky || 0 : 0);
  for (const [t, s] of opts) { const sc = s + (key(t) === cur ? keep : 0); if (sc > bs) { bs = sc; best = t; } }
  if (key(best) !== cur) {
    a.task = best;
    if (best.id === 'job' && !best.eatNow) {
      if (best.job === a.likes) think(w, a, 'likedWork', {job: JOBS.get(best.job).label});
      else if (best.job === a.dislikes) think(w, a, 'dislikedWork', {job: JOBS.get(best.job).label});
    }
  }
  else if (best.id === 'fight') a.task.target = best.target;
}

export const colonistBrain = {
  id: 'colonist',
  step(w, a) {
    const T = stepBody(w, a);   // reads last tick's `sleeping`
    if (a.dead) return;
    a.sleeping = false;
    const tid = a.task?.id;
    // reflex: heat overrides everything (firefighters hold out a little longer)
    if (tid !== 'douse' && (T > 55 || nearFire(w, a, 1.5))) { a.task = {id: 'flee'}; think(w, a, 'fledFire'); }
    if (tid === 'douse' && (T > 58 || hpShare(a) < 0.6)) a.task = {id: 'flee'};
    if (a.task?.id === 'flee' || a.task?.id === 'douse') a.mem.fire += 0.006;
    // being attacked can't wait for the next think
    const tid2 = a.task?.id;
    if (tid2 !== 'fight' && tid2 !== 'runHome' && tid2 !== 'flee' && w.agents.some(o => o.task?.id === 'maul' && o.task.target === a)) a.think = 0;
    if (a.task?.id !== 'flee' && --a.think <= 0) {
      a.think = 15;
      const busy = a.task?.id === 'job' && a.carry?.n > 0;   // finish delivering first
      if (!busy) decide(w, a);
    }
    if (!a.task) decide(w, a);
    // passing through the camp: swap gear with the store, top up arrows
    if (w.nav.get('camp')[cellOf(w, a)] < 3 && (w.tick - (a.outfitAt || -999) > 300 || a.seenArmory !== w.armoryVersion) && a.task?.id !== 'fight') {
      a.outfitAt = w.tick; a.seenArmory = w.armoryVersion; outfit(w, a);
    }
    const was = a.task;
    TASKS.get(a.task.id).step(w, a, a.task);
    // a job dropped on its first step (no prey, no free body, no site) is not taken again for a while;
    // without this the colonist picked it again the same tick and stood idle for hours
    if (!a.task && was.id === 'job' && !was.started) a.skipJob = {id: was.job, until: w.tick + JOB_SKIP};
    else if (a.task === was && was.id === 'job') was.started = true;
    if (a.cd > 0) a.cd--;
  },
};
