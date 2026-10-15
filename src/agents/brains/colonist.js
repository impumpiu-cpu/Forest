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
import {colonists, foodTotal, openSites, jobUnlocked, ofSpecies, favourites, raidAlarm} from '../../settlement/query.js';
import {councilDue, goalNeed} from '../../settlement/council.js';
import {stationHasWork} from '../../settlement/crafting.js';
import {outfit} from '../equipment.js';
import {dropLoad} from '../jobRunners.js';
import {syncTask, skipped} from '../lifecycle.js';
import {think} from '../mind.js';
import {agentInZone} from '../../settlement/zone.js';
import {tradeOpen} from '../../settlement/trade.js';
import {hurt, waiting, HEAL, freeBed} from '../../settlement/healing.js';
import {has} from '../../settlement/query.js';
import {wantsPrayer} from '../../settlement/life.js';
import {RESOURCES} from '../../data/resources.js';
import {BUILDINGS} from '../../data/buildings.js';

// the weight of answering an attack on oneself: more than any need can reach
const ATTACKED = 2.6;

const label = t => TASKS.get(t.id).label(t);

// why a job tempts: the colony's need, the council's goal, the colonist's own liking
function jobWhy(w, a, job, ctx, goal, tasty, night) {
  const parts = [];
  if (job.resource) parts.push(`${RESOURCES.get(job.resource).label} в запасе ${Math.floor(w.stock[job.resource] || 0)}`);
  else if (job.food) parts.push(`еды ${Math.floor(ctx.food)} на ${ctx.pop} чел.`);
  else if (job.runner === 'build') parts.push(`стройка ждёт`);
  else if (job.runner === 'craft') parts.push('есть заказ в мастерской');
  else if (job.runner === 'heal') parts.push(`раненых ${ctx.patients}`);
  if (goal > 0) parts.push(`копим на ${BUILDINGS.get(w.council.goal).name.toLowerCase()}`);
  if (job.id === a.likes) parts.push('любимое дело'); else if (job.id === a.dislikes) parts.push('не по душе');
  if (tasty > 1) parts.push('любимая еда');
  if (night > 0.6) parts.push('ночь, работа идёт неохотно');
  return parts.join(', ') || 'нужно поселению';
}


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
    opts.push([{id: n.task}, n.urge(w, a, a.needs[id]) * campOk, () => `${n.label} ${Math.round(a.needs[id] * 100)}%${campOk < 1 ? ', но лагерь горит' : ''}`]);
  }
  for (const job of JOBS.all()) {
    if (!jobUnlocked(w, job) || (job.canDo && !job.canDo(w, a))) continue;
    const base = job.desire(w, ctx, job);
    if (base < 0) continue;
    const res = job.resource;
    const goal = res ? goalNeed(w, res) : 0;
    const dayWork = job.runner === 'build' ? night * 0.3 : night * 0.2;
    // a job that brings your favourite food is a little more tempting
    const tasty = job.food && a.food?.likes === job.food ? 1.2 : 1;
    opts.push([{id: 'job', job: job.id}, (base + goal - dayWork) * (a.prefs[job.id] ?? 1) * tasty, () => jobWhy(w, a, job, ctx, goal, tasty, night)]);
  }
  opts.push([{id: 'idle'}, 0.15, () => 'больше нечем заняться']);
  // low spirits: a gloomy spell keeps its hold for a while; a walk to the shrine may help
  if (a.task?.id === 'sulk' && w.tick < a.task.until) opts.push([a.task, 0.95, () => 'хандра: давно не в духе']);
  // a spell of the nechist holds until it wears off (or something more urgent: a fight, fire)
  if (a.task?.spell && w.tick < a.task.until) opts.push([a.task, a.task.spell, () => 'чары нечисти']);
  const pray = wantsPrayer(w, a);
  if (pray > 0.1 && night < 0.5) opts.push([{id: 'pray'}, 0.3 + pray * 1.2, () => 'тяжело на душе']);
  if (councilDue(w)) opts.push([{id: 'council'}, 1.3, () => 'время совета']);
  // badly hurt, with a healer's hut: go and lie there (more urgent the worse the wounds)
  if ((hurt(a) || (a.task?.id === 'treat' && a.hp < maxHp(a) * HEAL.until)) && has(w, 'healerhut') && freeBed(w, a)) opts.push([{id: 'treat'}, (1 - a.hp / maxHp(a)) * 2 + 0.25, () => `ранен: здоровье ${Math.round(hpShare(a) * 100)}%`]);
  if (tradeOpen(w)) opts.push([{id: 'trade'}, 1.1, () => 'торг с купцом']);   // right after the council, the second gathering of the evening
  const brave = a.mods.bravery;
  if (w.stats.fireNearCamp > 0 && hpShare(a) > 0.6 && brave > 0.7) opts.push([{id: 'douse'}, 0.8 * brave, () => 'пожар у лагеря']);
  // something is hunting me: brave and healthy people fight back, the rest run for the camp
  const hunter = w.agents.find(o => !o.dead && o.task?.id === 'maul' && o.task.target === a);
  if (hunter) {
    if (hunter.species === 'wolf') a.mem.wolf += 0.05;
    const who = SPECIES.get(hunter.species).label;
    // above every bodily need (sleep at night peaks near 2.2): nobody sleeps on while being mauled
    // already inside the settlement there is nowhere to run to: stand and fight unless badly hurt
    const stand = brave * hpShare(a) > 0.85 || (agentInZone(w, a) && hpShare(a) > 0.3);
    opts.push(stand ? [{id: 'fight', target: hunter}, ATTACKED, () => `напал ${who}: смелости хватает дать отпор`] : [{id: 'runHome'}, ATTACKED, () => `напал ${who}: бежать к своим`]);
  }
  const enemy = nearestHostile(w, a, 16 * (a.mods.sight ?? 1));
  // alarm: while raiders are on the map everyone gathers inside the settlement zone and meets them
  // together; the wounded fall back
  const raid = raidAlarm(w);
  if (raid && !enemy) opts.push([{id: 'muster'}, 1.25, () => 'тревога: враги подходят к лагерю']);
  if (enemy && hpShare(a) > 0.3) opts.push([{id: 'fight', target: enemy}, (raid ? 1.35 : 1.1) * brave, () => `враг рядом: ${SPECIES.get(enemy.species).label}`]);
  if (enemy && hpShare(a) <= 0.3 && !agentInZone(w, a)) opts.push([{id: 'runHome'}, 1.6, () => 'тяжело ранен, а враг рядом']);

  let best = null, bs = -Infinity;
  const cur = key(a.task);
  // the current task is kept unless something is clearly better; a long walk (`sticky` jobs) more so
  const keep = 0.12 + (a.task?.id === 'job' ? JOBS.get(a.task.job).sticky || 0 : 0);
  let bestWhy = null, alt = null, as = -Infinity, altWhy = null;
  // a task that just ended blocked or impossible stays out of the choice for a while (agents/lifecycle.js)
  for (const [t, s, why] of opts) {
    if (key(t) !== cur && skipped(w, a, t)) continue;
    const sc = s + (key(t) === cur ? keep : 0);
    if (sc > bs) { if (best && key(best) !== key(t)) { alt = best; as = bs; altWhy = bestWhy; } bs = sc; best = t; bestWhy = why; }
    else if (sc > as && key(t) !== key(best)) { alt = t; as = sc; altWhy = why; }
  }
  // the choice explained for the colonist's card: what, why, the runner-up, and whether it was kept
  a.why = {t: w.tick, task: label(best), score: +bs.toFixed(2), why: bestWhy?.() || '', kept: key(best) === cur,
    alt: alt ? label(alt) : null, altScore: alt ? +as.toFixed(2) : null, altWhy: altWhy?.() || ''};
  if (key(best) !== cur) {
    // the task it drops is closed as interrupted by syncTask(), with this reason; eating, sleeping and
    // warming up wind down when the need is met, which is no dropped task
    if (a.task && !['idle', 'council', 'trade', 'eat', 'sleep', 'warm', 'muster', 'sulk'].includes(a.task.id)) a.switchWhy = `ради «${a.why.task}»: ${a.why.why}`;
    else if (a.task) a.task.closed = 'done';
    if (a.task) w.behave.switches++;
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
    const attacked = w.agents.some(o => o.task?.id === 'maul' && o.task.target === a);
    if (tid2 !== 'fight' && tid2 !== 'runHome' && tid2 !== 'flee' && attacked) a.think = 0;
    if (a.task?.id !== 'flee' && --a.think <= 0) {
      a.think = 15;
      // a delivery under way is finished first — unless something urgent comes up: an attack, a foe
      // close by, a body at its limit. The load stays in the hands whatever is chosen.
      const urgent = attacked || hpShare(a) < 0.35 || Object.values(a.needs).some(v => v < 0.12) || !!nearestHostile(w, a, 8);
      const busy = !urgent && a.task?.id === 'job' && a.task.hauling;
      if (!busy) decide(w, a);
    }
    if (!a.task) decide(w, a);
    // passing through the camp: swap gear with the store, top up arrows
    if (w.nav.get('camp')[cellOf(w, a)] < 3 && (w.tick - (a.outfitAt || -999) > 300 || a.seenArmory !== w.armoryVersion) && a.task?.id !== 'fight') {
      a.outfitAt = w.tick; a.seenArmory = w.armoryVersion; outfit(w, a);
    }
    // a load left over from a broken-off job goes to the stores as soon as the bearer is at the camp
    if (a.carry && !(a.task?.id === 'job' && a.task.job === a.carryJob) && w.nav.get('camp')[cellOf(w, a)] < 2) dropLoad(w, a);
    if (a.task?.id === 'job') a.carryJob = a.task.job;
    // the lifecycle (agents/lifecycle.js): close a task replaced since the last step, enter the new one;
    // after the step again, for a task that handed over to another (eat → gather on the spot)
    syncTask(w, a);
    TASKS.get(a.task.id).step(w, a, a.task);
    syncTask(w, a);
    if (a.cd > 0) a.cd--;
  },
};
