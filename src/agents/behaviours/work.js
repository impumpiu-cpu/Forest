// Work: the colony's vacancies (settlement/plan.js) — how many hands each job wants today; the colonist weighs them by
// itself: can I (the job's tier, agents/skills.js), do I want to (its desire, the council's goal, my own liking, my
// favourite food, friends at work), the night (work goes unwillingly, outdoor work waits for morning). Taken, a
// job is signed up for; leaving one job for another of one's own accord takes a moment's thought first («прикидывает,
// за что взяться»). A job begun (a bush half picked, a load in the hands) is held on to. Passing the camp it swaps
// gear with the store and drops a load left over from a broken-off job. A captive takes only the camp's work
// (data/captives.js CAPTIVE.camp). Reads: nothing of its own (a.prefs, a.likes, a.skill…).
import {JOBS, huntable} from '../../data/jobs.js';
import {RESOURCES} from '../../data/resources.js';
import {BUILDINGS} from '../../data/buildings.js';
import {nightness} from '../../core/time.js';
import {cellOf} from '../../world/grid.js';
import {colonists, foodTotal, openSites, jobUnlocked, favourites} from '../../settlement/query.js';
import {goalNeed} from '../../settlement/council.js';
import {stationHasWork} from '../../settlement/crafting.js';
import {waiting} from '../../settlement/healing.js';
import {mates, outsideRisk} from '../../settlement/together.js';
import {canDoAction, jobAccess} from '../../agents/skills.js';
import {mayExtract} from '../../settlement/kinds.js';
import {ensurePlan, vacancyPull, signUp} from '../../settlement/plan.js';
import {outfit} from '../equipment.js';
import {dropLoad} from '../jobRunners.js';
import {skipped} from '../lifecycle.js';
import {think} from '../mind.js';
import {CAPTIVE} from '../../data/captives.js';
import {ROSTER, COLONIST} from '../../data/behaviour.js';

// work's ceiling: as it was up to the cap, then bending under 1 instead of cut off at it (COLONIST.softCap)
const softCap = x => { const [c, k] = COLONIST.softCap; return x <= c ? x : c + k * (1 - Math.exp(-(x - c) / k)); };

// why a job tempts: the colony's vacancy, its need, the council's goal, the colonist's own liking
function jobWhy(w, a, job, ctx, goal, tasty, night, vac) {
  const parts = [];
  if (vac) parts.push(vac);
  if (job.resource) parts.push(`${RESOURCES.get(job.resource).label} в запасе ${Math.floor(w.stock[job.resource] || 0)}`);
  else if (job.food) parts.push(`еды ${Math.floor(ctx.food)} на ${ctx.pop} чел.`);
  else if (job.runner === 'build') parts.push(`стройка ждёт`);
  else if (job.runner === 'craft') parts.push('есть заказ в мастерской');
  else if (job.runner === 'heal') parts.push(`раненых ${ctx.patients}`);
  if (goal > 0) parts.push(`копим на ${BUILDINGS.get(w.council.goal).name.toLowerCase()}`);
  if (job.id === a.likes) parts.push('любимое дело'); else if (job.id === a.dislikes) parts.push('не по душе');
  if (tasty > 1) parts.push('любимая еда');
  if (night > COLONIST.night.outdoorFrom) parts.push('ночь, работа идёт неохотно');
  return parts.join(', ') || 'нужно поселению';
}

export const work = {
  // passing through the camp: swap gear with the store, top up arrows; a load left over from a broken-off job goes to the stores
  always(w, a) {
    const O = COLONIST.outfit, d = w.nav.get('camp')[cellOf(w, a)];
    if (d < O.near && (w.tick - (a.outfitAt || -999) > O.every || a.seenArmory !== w.armoryVersion) && a.task?.id !== 'fight') { a.outfitAt = w.tick; a.seenArmory = w.armoryVersion; outfit(w, a); }
    if (a.carry && !(a.task?.id === 'job' && a.task.job === a.carryJob) && d < COLONIST.dropNear) dropLoad(w, a);
    if (a.task?.id === 'job') a.carryJob = a.task.job;
  },
  want(w, a) {
    const night = nightness(w), N = COLONIST.night;
    const ctx = {pop: colonists(w).length, food: foodTotal(w), openSites: openSites(w).length,
      preyCount: huntable(w, JOBS.get('hunt'), a).length, favourites: favourites(w), patients: waiting(w),
      agent: a, can: (skill, tier) => canDoAction(a, skill, tier),
      orders: new Proxy({}, {get: (o, station) => stationHasWork(w, station, a)})};
    const mate = mates(w, a);   // friends (and foes) at work (settlement/together.js)
    ensurePlan(w);
    const out = [];
    for (const job of JOBS.all()) {
      if (a.captive && !CAPTIVE.camp.includes(job.runner)) continue;   // a captive's lot: the camp's work only
      if (!jobUnlocked(w, job) || !jobAccess(a, job).ok || (job.canDo && !job.canDo(w, a)) || !mayExtract(w, a.species, job.id)) continue;
      const base = job.desire(w, ctx, job);
      if (base < 0) continue;
      const res = job.resource, goal = res ? goalNeed(w, res) : 0;
      const outdoor = job.runner === 'harvest' || job.runner === 'hunt';
      const dayWork = (job.runner === 'build' ? night * N.build : night * N.work) + (outdoor && night > N.outdoorFrom ? (night - N.outdoorFrom) * N.outdoorMul * (N.outdoorRisk + outsideRisk(w)) : 0);
      const tasty = job.food && a.food?.likes === job.food ? COLONIST.tasty : 1;
      const m = mate(job.id), [mul, add, vac] = vacancyPull(w, a, job);
      // the vacancies rank work against work; they never lift work above the alarm, the council or the body (≤ 1)
      out.push([{id: 'job', job: job.id}, softCap(((base + goal) * (a.prefs[job.id] ?? 1) * tasty + m.v) * mul + add) - dayWork,
        () => jobWhy(w, a, job, ctx, goal, tasty, night, vac) + (m.friend ? `, там ${m.friend.name}` : m.foe ? `, но там ${m.foe.name}` : '')]);
    }
    return out;
  },
  // the current job is kept unless something is clearly better; a long walk (`sticky` jobs) more so, and work begun
  // (a bush half picked, a load in the hands) is finished first — a commitment
  keep(w, a, t) {
    const committed = t.work > 0 || a.carry?.n > 0 || t.hauling;
    return ROSTER.keep + (JOBS.get(t.job).sticky || 0) + (committed ? ROSTER.committed : 0);
  },
  // taken: the place is signed up for; leaving one job for another of one's own accord — a moment's thought first,
  // unless the body or a threat is pressing (the score is high)
  pick(w, a, t, score) {
    const prev = a.lastTask;
    if (prev?.id === 'job' && score < ROSTER.ponderBelow && !skipped(w, a, prev)) {
      const [lo, hi] = ROSTER.ponder;
      a.switchWhy = `ради «${a.why?.task || JOBS.get(t.job).verb}»: ${a.why?.why || ''}`;
      w.behave.switches++;
      a.task = {id: 'ponder', next: t, until: w.tick + lo + Math.floor(w.rngs.colony() * hi), why: a.why?.why};
      signUp(w, a, t.job);   // decided: the place is taken now, the walk over comes after the thought
      a.wakeWhy = null; a.wakeKind = null;   // nothing to weigh till the thought is over
      return;
    }
    if (t.eatNow) return;
    signUp(w, a, t.job);   // takes that place for the day
    if (t.job === a.likes) think(w, a, 'likedWork', {job: JOBS.get(t.job).label});
    else if (t.job === a.dislikes) think(w, a, 'dislikedWork', {job: JOBS.get(t.job).label});
  },
};
