// Colonist brain: utility AI. Every option gets a score; the best one becomes the task.
// Needs come from NEEDS, work from JOBS (weighted by personal preference), plus emergencies.
import {NEEDS} from '../../data/needs.js';
import {JOBS, huntable} from '../../data/jobs.js';
import {SPECIES} from '../../data/species.js';
import {nightness, ambientTemp} from '../../core/time.js';
import {cellOf} from '../../world/grid.js';
import {nearFire} from '../movement.js';
import {attackerOf} from '../combat.js';
import {flagOptions, knownFoeWithin, redInSight, noteChoice, watchOption, noteWatch, BOARD} from '../../settlement/board.js';
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
import {escortOption, aidOption, mates, outsideRisk, TOGETHER} from '../../settlement/together.js';
import {stepDowned, healWounds} from '../wounds.js';
import {canDoAction, jobAccess} from '../skills.js';
import {BUILDINGS} from '../../data/buildings.js';
import {tempAt} from '../../world/heat.js';
import {ensurePlan, vacancyPull, signUp} from '../../settlement/plan.js';
import {wake, noticeSelf, heartOf, noteThink} from '../attention.js';

// keeping to a task, thinking again at work, a moment's thought before switching jobs (the pull of the
// colony's vacancies is settlement/plan.js vacancyPull)
const ROSTER = {keep: 0.2, committed: 0.25, ponder: [8, 16]};

// the weight of answering an attack on oneself: more than any need can reach
const ATTACKED = 2.6;

const label = t => TASKS.get(t.id).label(t);

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
  if (night > 0.6) parts.push('ночь, работа идёт неохотно');
  return parts.join(', ') || 'нужно поселению';
}


const key = t => (t ? (t.id === 'job' ? 'job:' + t.job : t.id) : '');
// work's ceiling: as it was up to 0.8, then bending under 1 instead of cut off at it
const softCap = x => (x <= 0.8 ? x : 0.8 + 0.2 * (1 - Math.exp(-(x - 0.8) / 0.2)));

function decide(w, a, woke = 'дело кончилось') {
  const night = nightness(w), camp = w.camp.cells, g = w.grid;
  let campHot = 0; for (const c of camp) campHot = Math.max(campHot, tempAt(w, c) + g.fire[c] * 400);
  const campOk = campHot < 40 ? 1 : 0.1;   // a burning camp is no place to eat or sleep
  const ctx = {pop: colonists(w).length, food: foodTotal(w), openSites: openSites(w).length,
    preyCount: huntable(w, JOBS.get('hunt'), a).length, favourites: favourites(w), patients: waiting(w),
    agent: a, can: (skill, tier) => canDoAction(a, skill, tier),
    orders: new Proxy({}, {get: (o, station) => stationHasWork(w, station, a)})};
  const opts = [];
  for (const id of SPECIES.get(a.species).needs) {
    const n = NEEDS.get(id);
    // rested before dawn: the sleeper sleeps on till first light (agents/tasks.js sleep) — above any
    // work (≤ 1), below the alarm, the council and an attack
    if (n.task === 'sleep' && a.task?.id === 'sleep' && a.needs[id] >= 0.995 && night > 0.75 && !raidAlarm(w)) { opts.push([{id: 'sleep'}, 1.0 * campOk, () => 'досыпает до рассвета']); continue; }
    opts.push([{id: n.task}, n.urge(w, a, a.needs[id]) * campOk, () => `${n.label} ${Math.round(a.needs[id] * 100)}%${campOk < 1 ? ', но лагерь горит' : ''}`]);
  }
  const mate = mates(w, a);   // friends (and foes) at work (settlement/together.js)
  // the colony's vacancies (settlement/plan.js): how many hands each job wants today; the colonist
  // weighs them by itself — its own place, an open place, a job nobody asked for
  ensurePlan(w);
  for (const job of JOBS.all()) {
    // can I? (the job's tier, agents/skills.js) — then do I want to?
    if (!jobUnlocked(w, job) || !jobAccess(a, job).ok || (job.canDo && !job.canDo(w, a))) continue;
    const base = job.desire(w, ctx, job);
    if (base < 0) continue;
    const res = job.resource;
    const goal = res ? goalNeed(w, res) : 0;
    // night: work goes unwillingly, and outdoor work (the woods, the shore, the game) is left for the
    // morning once it is dark — beasts hunt the lone walker on the way home
    const outdoor = job.runner === 'harvest' || job.runner === 'hunt';
    const dayWork = (job.runner === 'build' ? night * 0.3 : night * 0.2) + (outdoor && night > 0.6 ? (night - 0.6) * 1.5 * (0.5 + outsideRisk(w)) : 0);
    // a job that brings your favourite food is a little more tempting
    const tasty = job.food && a.food?.likes === job.food ? 1.2 : 1;
    const m = mate(job.id), [mul, add, vac] = vacancyPull(w, a, job);
    // the vacancies rank work against work; they never lift work above the alarm, the council or the body (≤ 1).
    // The ceiling is soft, so that two jobs both wanted badly still differ by who is better at which
    opts.push([{id: 'job', job: job.id}, softCap(((base + goal) * (a.prefs[job.id] ?? 1) * tasty + m.v) * mul + add) - dayWork, () => jobWhy(w, a, job, ctx, goal, tasty, night, vac) + (m.friend ? `, там ${m.friend.name}` : m.foe ? `, но там ${m.foe.name}` : '')]);
  }
  opts.push([{id: 'idle'}, 0.08, () => 'больше нечем заняться']);
  // together (settlement/together.js): go along with a lone gatherer when beasts roam, help the wounded
  const esc = escortOption(w, a); if (esc) opts.push(esc);
  const aid = aidOption(w, a); if (aid) opts.push(aid);
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
  // something is hunting me (a beast mauls, a raider fights): brave and healthy people fight back, the
  // rest run for the camp — nobody keeps digging clay, lies at the healer's or sits at the council
  // under the blows
  const hunter = attackerOf(w, a);
  if (hunter) {
    if (hunter.species === 'wolf') a.mem.wolf += 0.05;
    const who = SPECIES.get(hunter.species).label;
    // above every bodily need (sleep at night peaks near 2.2): nobody sleeps on while being mauled
    // already inside the settlement there is nowhere to run to: stand and fight, however badly hurt
    // (running "home" from home ends at once and leaves the wounded standing under the blows)
    const stand = brave * hpShare(a) > 0.85 || agentInZone(w, a);
    // the answer to an attack is a reflex: no skip from an earlier fight with the same foe holds it back
    opts.push(stand ? [{id: 'fight', target: hunter, reflex: true}, ATTACKED, () => `напал ${who}: смелости хватает дать отпор`] : [{id: 'runHome'}, ATTACKED, () => `напал ${who}: бежать к своим`]);
  }
  // the night watch (settlement/board.js): the council's rule — one place, taken by whoever wants it
  const watch = watchOption(w, a); if (watch) opts.push(watch);
  // the colony's board (settlement/board.js): the threats this colonist knows of — seen or heard of —
  // each weighed by the colonist itself: how much of it nobody covers yet, courage, distance
  const flags = flagOptions(w, a);
  for (const o of flags) opts.push(o);
  const enemy = knownFoeWithin(w, a, BOARD.sight * (a.mods.sight ?? 1));
  // alarm: while raiders are on the map everyone who has no foe in sight gathers inside the settlement
  // zone and meets them together; one who sees a foe weighs its flag instead; the wounded fall back
  const raid = raidAlarm(w);
  if (raid && !enemy) opts.push([{id: 'muster'}, 1.25, () => 'тревога: враги подходят к лагерю']);
  // a red alarm in sight (a raid, an attack on one of ours) cannot be ignored: who does not go to the
  // fight keeps out of harm's way — at the fire while raiders are about, else back to the settlement —
  // instead of going on with the work (settlement/board.js)
  const red = redInSight(w, a, BOARD.sight * (a.mods.sight ?? 1));
  if (red && (raid || red.kind === 'raid')) opts.push([{id: 'reserve'}, BOARD.reserve, () => `тревога: ${red.label} ${red.where}, держится у огня`]);
  else if (red && !agentInZone(w, a)) opts.push([{id: 'runHome'}, BOARD.reserve, () => `тревога: ${red.label} ${red.where}, к своим`]);
  if (enemy && hpShare(a) <= BOARD.hurt && !agentInZone(w, a)) opts.push([{id: 'runHome'}, 1.6, () => 'тяжело ранен, а враг рядом']);

  let best = null, bs = -Infinity;
  const cur = key(a.task);
  // the current task is kept unless something is clearly better; a long walk (`sticky` jobs) more so,
  // and work begun (a bush half picked, a load in the hands) is finished first — a commitment
  const committed = a.task?.id === 'job' && (a.task.work > 0 || a.carry?.n > 0 || a.task.hauling);
  const keep = ROSTER.keep + (a.task?.id === 'job' ? JOBS.get(a.task.job).sticky || 0 : 0) + (committed ? ROSTER.committed : 0);
  let bestWhy = null, alt = null, as = -Infinity, altWhy = null;
  // a task that just ended blocked or impossible stays out of the choice for a while (agents/lifecycle.js)
  for (const [t, s, why] of opts) {
    if (key(t) !== cur && !t.reflex && skipped(w, a, t)) continue;
    const sc = s + (key(t) === cur && t.id !== 'reserve' ? keep : 0);   // the reserve is weighed afresh every time
    if (sc > bs) { if (best && key(best) !== key(t)) { alt = best; as = bs; altWhy = bestWhy; } bs = sc; best = t; bestWhy = why; }
    else if (sc > as && key(t) !== key(best)) { alt = t; as = sc; altWhy = why; }
  }
  // the choice explained for the colonist's card: what, why, the runner-up, and whether it was kept
  a.why = {t: w.tick, task: label(best), score: +bs.toFixed(2), why: bestWhy?.() || '', kept: key(best) === cur,
    alt: alt ? label(alt) : null, altScore: alt ? +as.toFixed(2) : null, altWhy: altWhy?.() || '', woke};
  noteThink(w, a.wakeKind || woke, key(best) === cur);
  if (flags.length) noteChoice(w, a, best, flags);   // the diary: why it went to a cry, or why not
  noteWatch(w, a, best, a.task?.id);
  if (key(best) !== cur) {
    // leaving one job for another of one's own accord: a moment's thought first («прикидывает, за что
    // взяться»), unless the body or a threat is pressing
    if (a.task?.id === 'job' && best.id === 'job' && bs < 1.2 && !skipped(w, a, a.task)) {
      const [lo, hi] = ROSTER.ponder;
      a.switchWhy = `ради «${a.why.task}»: ${a.why.why}`;
      w.behave.switches++;
      a.task = {id: 'ponder', next: best, until: w.tick + lo + Math.floor(w.rngs.colony() * hi), why: a.why.why};
      signUp(w, a, best.job);   // decided: the place is taken now, the walk over comes after the thought
      return;
    }
    // the task it drops is closed as interrupted by syncTask(), with this reason; eating, sleeping and
    // warming up wind down when the need is met, which is no dropped task
    if (a.task && !['idle', 'council', 'trade', 'eat', 'sleep', 'warm', 'muster', 'reserve', 'watch', 'sulk', 'ponder'].includes(a.task.id)) a.switchWhy = `ради «${a.why.task}»: ${a.why.why}`;
    else if (a.task) a.task.closed = 'done';
    if (a.task) w.behave.switches++;
    a.task = best;
    if (best.id === 'job' && !best.eatNow) signUp(w, a, best.job);   // takes that place for the day
    if (best.id === 'job' && !best.eatNow) {
      if (best.job === a.likes) think(w, a, 'likedWork', {job: JOBS.get(best.job).label});
      else if (best.job === a.dislikes) think(w, a, 'dislikedWork', {job: JOBS.get(best.job).label});
    }
  }
  else if (best.id === 'fight') { a.task.target = best.target; a.task.flag = best.flag; }
  // nothing to wake it: it looks round again after a while anyway (agents/attention.js)
  a.think = heartOf(a); a.wakeWhy = null; a.wakeKind = null;
}

export const colonistBrain = {
  id: 'colonist',
  step(w, a) {
    const T = stepBody(w, a);   // reads last tick's `sleeping`
    if (a.dead) return;
    noticeSelf(w, a);   // a need past a band, a wound: think again (agents/attention.js)
    // fallen senseless after a deadly blow: lies and bleeds until helped or until time runs out
    if (a.downed) { if (a.task?.id !== 'downed') a.task = {id: 'downed'}; syncTask(w, a); stepDowned(w, a); return; }
    healWounds(w, a);
    a.sleeping = false;
    const tid = a.task?.id;
    // reflex: heat overrides everything (firefighters hold out a little longer)
    if (tid !== 'douse' && (T > 55 || nearFire(w, a, 1.5))) { a.task = {id: 'flee'}; think(w, a, 'fledFire'); }
    if (tid === 'douse' && (T > 58 || hpShare(a) < 0.6)) a.task = {id: 'flee'};
    if (a.task?.id === 'flee' || a.task?.id === 'douse') a.mem.fire += 0.006;
    // being attacked can't wait for the next think
    const tid2 = a.task?.id;
    const attacked = !!attackerOf(w, a);
    if (tid2 !== 'fight' && tid2 !== 'runHome' && tid2 !== 'flee' && attacked) wake(a, 'на меня напали', 'нападение');
    // a foe within reach is noticed at once, not at the next think: the colony's lookouts see it and
    // wake whoever should think again (settlement/board.js)
    // think again when something happened (agents/attention.js: the task ended, a need, a wound, the
    // night, the council, the alarm, a cry, new work…) or, with nothing at all, after a long while
    if (a.task?.id !== 'flee' && --a.think <= 0) {
      const woke = a.wakeWhy ?? 'давно не оглядывался';
      if (a.wakeWhy == null) a.wakeKind = 'по привычке';
      // a delivery under way is finished first — unless something urgent comes up: an attack, a foe
      // close by, a body at its limit. The load stays in the hands whatever is chosen.
      const urgent = attacked || hpShare(a) < 0.35 || Object.values(a.needs).some(v => v < 0.12) || !!knownFoeWithin(w, a, BOARD.near);
      const busy = !urgent && a.task?.id === 'job' && a.task.hauling;
      if (!busy) decide(w, a, woke); else a.think = heartOf(a);
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
