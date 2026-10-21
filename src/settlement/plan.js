// The day's vacancies (docs/MIND.md stage 3): what work the colony needs tomorrow and how many hands
// each job wants — posted once at the evening council (and again when the colony changes) — and the
// colonists take the places themselves, as in Dwarf Fortress. The council never names anyone.
//
// Two steps here:
//   1. needs with a horizon (needs): what the colony wants of each job tomorrow — the job's own
//      `desire` (data/jobs.js) as the colony's weight, pulled up where tomorrow is foreseeable:
//      firewood for the nights ahead, food for the days ahead, what the council is saving for;
//   2. places (vacancies): how many people each job wants, out of everyone able to work — the weights
//      shared out, bounded by what the job can take (benches at a workshop, one healer, a hunter per
//      few head of game).
// The third step is each colonist's own (agents/brains/colonist.js, through vacancyPull()): a job with
// open places pulls more the more of it is open (soft places: every taker lowers it for the others), and
// more for someone good at it, used to it since yesterday, or fond of it. Taking a job signs the colonist
// up for it for the day (a.shift), so a place stays taken while its holder eats or sleeps.
// Plain data on the world (w.plan) and on the colonists (a.shift), saved with them; the council's journal
// line and the panel show the places, who took them and why.
import {JOBS, huntable} from '../data/jobs.js';
import {BUILDINGS} from '../data/buildings.js';
import {colonists, foodTotal, openSites, jobUnlocked, favourites, has, count} from './query.js';
import {waiting} from './healing.js';
import {stationHasWork} from './crafting.js';
import {goalNeed} from './council.js';
import {campFuel} from './stock.js';
import {RESOURCES} from '../data/resources.js';
import {FOODS} from '../data/foods.js';
import {skillOf, jobAccess, canDoAction} from '../agents/skills.js';
import {dayOf} from '../core/time.js';
import {season, snowy} from '../data/seasons.js';
import {log} from '../core/log.js';
import {esc} from '../core/util.js';
import {outsideRisk, TOGETHER} from './together.js';
import {perTick} from '../core/util.js';

export const PLAN = {
  fuelDays: 3,        // keep this many days of firewood ahead…
  fuelDaysCold: 5,    // …and this many when it freezes
  foodDays: 6,        // days of food the colony likes to have ahead
  foodDaysAutumn: 12, // …before winter (autumn): stock up
  minWeight: 0.08,    // a job wanted less than this gets no place
  // how a vacancy pulls a colonist's choice (vacancyPull): × and + on the job's own score
  mine: [1.5, 0.3],   // a place this colonist holds today (as the roster's own job used to)
  open: [0.6, 0.9, 0.3],   // a place free: × 0.6 + 0.9 × open share, + 0.3 × open share
  wanted: [0.85, 0],  // a job the colony wants but whose places are all taken (or that got none): a fallback
  none: [0.6, 0],     // a job the colony does not want tomorrow
  // a colonist's own fitness for a place, added while some of it is open
  skill: 0.15,        // × skill / 10
  best: 0.15,         // the colony's best at the job's skill
  habit: 0.12,        // the same job as yesterday
};

// how much firewood the colony burns in a day: the campfire through the night, every hearth all day
function dailyBurn(w) {
  let f = 0.004 * 600;   // the campfire, about half the day
  for (const b of w.buildings) { const H = b.done && BUILDINGS.get(b.key).heat; if (H) f += H.fuel * 1200; }
  return f;
}
const fuelStock = w => RESOURCES.filter(r => r.tags.includes('fuel')).reduce((s, r) => s + (w.stock[r.id] || 0) * (r.heat || 1), 0);

// the colony's weights for every job it can do: desire with a horizon. → {jobId: {w, why}}
export function needs(w) {
  const col = colonists(w).filter(a => !a.downed), pop = Math.max(1, col.length);
  const ctx = {pop, food: foodTotal(w), openSites: openSites(w).length, preyCount: huntable(w, JOBS.get('hunt')).length,
    favourites: favourites(w), patients: waiting(w), agent: null, can: () => true,
    orders: new Proxy({}, {get: (o, station) => col.some(a => stationHasWork(w, station, a))})};
  const out = {};
  const burn = dailyBurn(w), fuelDays = fuelStock(w) / Math.max(0.1, burn);
  const S = season(w), foodDays = ctx.food / Math.max(0.5, pop * 0.9);
  const wantFoodDays = S.id === 'autumn' ? PLAN.foodDaysAutumn : PLAN.foodDays;
  for (const job of JOBS.all()) {
    if (!jobUnlocked(w, job)) continue;
    // someone must be able to do it at all
    if (!col.some(a => jobAccess(a, job).ok && (!job.canDo || job.canDo(w, a)))) continue;
    let v = job.desire(w, ctx, job), why = [];
    if (v < 0) continue;
    if (job.resource) v += goalNeed(w, job.resource);
    // firewood by the nights ahead: a cold night without a fire is the one thing the roster must not allow
    if (job.id === 'chop') {
      const keep = snowy(w) ? PLAN.fuelDaysCold : PLAN.fuelDays;
      if (fuelDays < keep) { v = Math.max(v, 0.5 + 0.5 * (1 - fuelDays / keep)); why.push(`дров на ${fuelDays.toFixed(1)} дн., нужно на ${keep}`); }
    }
    // food by the days ahead: every food job shares the pull, the more filling the food the more
    if (job.food) {
      if (foodDays < wantFoodDays) { const f = FOODS.get(job.food); v = Math.max(v, (0.35 + 0.5 * (1 - foodDays / wantFoodDays)) * (0.7 + 0.3 * f.nutrition)); why.push(`еды на ${foodDays.toFixed(1)} дн., нужно на ${wantFoodDays}`); }
    }
    if (goalNeed(w, job.resource) > 0) why.push(`копим на ${BUILDINGS.get(w.council.goal).name.toLowerCase()}`);
    if (v >= PLAN.minWeight) out[job.id] = {w: +v.toFixed(3), why: why.join(', ')};
  }
  return out;
}

// how many hands a job can use at once (Infinity: as many as come)
function crewCap(w, job) {
  if (job.crew) return job.crew(w);
  if (job.runner === 'craft') return job.stations.reduce((s, st) => s + w.buildings.filter(b => b.key === st && b.done).reduce((n, b) => n + (BUILDINGS.get(st).benches || 1), 0), 0);
  if (job.runner === 'build') return Math.min(4, openSites(w).length * 2);
  if (job.id === 'hunt') return Math.max(1, Math.min(3, Math.ceil(huntable(w, job).length / 3)));
  if (job.id === 'fish') return Math.max(1, Math.min(3, w.lakes.filter(l => l.cap > 0 && l.fish >= 1).length));
  if (['heal', 'herd', 'bury'].includes(job.id)) return 1;
  if (job.id === 'farm') return Math.min(3, count(w, 'field'));
  return Infinity;
}

// the vacancies: needs → places. `reason` says what called for it (the journal)
export function makePlan(w, reason = '') {
  const col = colonists(w).filter(a => !a.downed), day = dayOf(w.tick);
  const need = needs(w), jobs = Object.keys(need).sort((x, y) => need[y].w - need[x].w);
  const total = jobs.reduce((s, j) => s + need[j].w, 0) || 1;
  // places: each job's share of the hands, at least one for anything wanted enough, no more than it can take
  // (largest remainders first, so that a dozen small wants do not each take a whole person away from
  // the firewood; only a pressing want — 0.6 and up — is sure of one pair of hands)
  // when beasts that hunt people roam the woods, outdoor work goes out in pairs: two to the same bushes
  // rather than one to the bushes and one to the clay (settlement/together.js risk)
  const pairs = outsideRisk(w) >= TOGETHER.riskFrom, outdoor = j => ['harvest', 'hunt'].includes(JOBS.get(j).runner);
  const quota = {};
  // no more places than the colony has hands able to fill them (a place nobody can take wastes a hand)
  const able = j => { const job = JOBS.get(j); return col.filter(a => jobAccess(a, job).ok && (!job.canDo || job.canDo(w, a))).length; };
  const cap = {};
  for (const j of jobs) cap[j] = Math.min(crewCap(w, JOBS.get(j)), able(j));
  let used = 0;
  for (const j of jobs) { const q = col.length * need[j].w / total; quota[j] = Math.min(cap[j], need[j].w >= 0.6 ? Math.max(1, Math.floor(q)) : Math.floor(q)); used += quota[j]; }
  for (const j of jobs.slice().sort((x, y) => (col.length * need[y].w / total - quota[y]) - (col.length * need[x].w / total - quota[x]))) {
    if (used >= col.length) break;
    if (quota[j] < cap[j] && col.length * need[j].w / total - quota[j] > 0.3) { quota[j]++; used++; }
  }
  if (pairs) {
    // lone outdoor places are merged: the second of two singleton outdoor jobs joins the first (more wanted).
    // Food is never merged away: a lone food place becomes two of its own instead (when two can do it)
    const singles = jobs.filter(j => quota[j] === 1 && outdoor(j) && cap[j] >= 2);
    const food = singles.filter(j => JOBS.get(j).food), other = singles.filter(j => !JOBS.get(j).food);
    for (const j of food) quota[j] = 2;
    for (let k = 1; k < other.length; k += 2) { quota[other[k]] = 0; quota[other[k - 1]] = 2; }
    used = jobs.reduce((s, j) => s + quota[j], 0);
  }
  // hands left over go to the most wanted jobs that still have room, one each in turn
  const spare = jobs.filter(j => cap[j] > quota[j]);
  for (let k = 0; used < col.length && spare.length; k++) {
    const j = spare[k % spare.length];
    quota[j]++; used++;
    if (quota[j] >= cap[j]) spare.splice(spare.indexOf(j), 1);
  }
  const vac = {};
  for (const j of jobs) if (quota[j] > 0) vac[j] = {places: quota[j], why: need[j].why};
  w.plan = {day, at: w.tick, reason, need, vac, pop: col.length, built: w.buildings.filter(b => b.done).length};
  return w.plan;
}

// ── the colonists' side: shifts and the pull of a vacancy

// who holds a place today, by job: the colonists signed up (a.shift) for today. Counted once a tick;
// a colonist who signs up in the middle of the tick is added at once (signUp), so the next one to weigh
// that job already sees the place taken
const today = w => dayOf(w.tick);
const holders = w => perTick(w, 'plan.holders', () => {
  const by = {}, d = today(w);
  for (const a of colonists(w)) if (!a.dead && !a.downed && a.shift?.day === d && a.shift.job) (by[a.shift.job] ||= []).push(a);
  return by;
});
export const holdersOf = (w, job) => (holders(w)[job] || []).filter(a => !a.dead && !a.downed);

// a colonist's own fitness for a job's place: skill, being the colony's best, yesterday's habit
function fit(w, a, job) {
  const sk = skillOf(a, job.skill), why = [];
  let f = PLAN.skill * sk / 10;
  if (sk > 0 && sk >= bestAt(w, job.skill)) { f += PLAN.best; why.push('лучше всех'); }
  if (a.shiftPrev === job.id) { f += PLAN.habit; why.push('как вчера'); }
  return [f, why];
}
const bestAt = (w, skill) => perTick(w, 'plan.best:' + skill, () => Math.max(0, ...colonists(w).filter(a => !a.dead).map(a => skillOf(a, skill))));

// how the vacancies pull a colonist toward a job: [×, +, why]. The job's own score (desire × liking)
// is the colonist's; this is what the colony asks for on top of it
export function vacancyPull(w, a, job) {
  const v = w.plan?.vac?.[job.id];
  if (a.shift?.day === today(w) && a.shift.job === job.id && v) return [...PLAN.mine, `${job.short || job.label}: моё место на сегодня`];
  if (!v) return w.plan?.need?.[job.id] ? [...PLAN.wanted, 'нужно поселению, мест не дали'] : [...PLAN.none, ''];
  const taken = holdersOf(w, job.id).filter(o => o !== a).length, open = Math.max(0, v.places - taken), share = open / v.places;
  if (open <= 0) return [...PLAN.wanted, `места заняты (${v.places})`];
  const [f, why] = fit(w, a, job), [m0, m1, add] = PLAN.open;
  return [m0 + m1 * share, add * share + f, `вакансия: свободно ${open} из ${v.places}${why.length ? ', ' + why.join(', ') : ''}`];
}

// the colonist took a job (agents/brains/colonist.js decide): it holds that place for the day
export function signUp(w, a, jobId) {
  const d = today(w);
  if (a.shift?.day === d && a.shift.job === jobId) return;
  if (a.shift && a.shift.day < d) a.shiftPrev = a.shift.job;   // yesterday's job: the habit
  const by = holders(w);
  if (a.shift?.day === d && a.shift.job && by[a.shift.job]) by[a.shift.job] = by[a.shift.job].filter(o => o !== a);
  a.shift = {day: d, job: jobId};
  if (jobId) (by[jobId] ||= []).push(a);
}

// the vacancies in words: «рубить лес — 3 (дров на 1,2 дн.)»; with `who`, the holders of each today
export function vacancyLines(w, who = false) {
  const p = w.plan; if (!p?.vac) return [];
  return Object.entries(p.vac).map(([j, v]) => {
    const job = JOBS.get(j), hs = who ? holdersOf(w, j) : [];
    const names = hs.map(a => a.name).join(', ');
    return {job: j, text: who ? `${job.label}: ${hs.length} из ${v.places}${names ? ' — ' + names : ''}${v.why ? ` (${v.why})` : ''}` : `${job.label} — ${v.places}${v.why ? ` (${v.why})` : ''}`};
  });
}

// the vacancies are posted anew when the colony has changed under them: a newcomer, a loss, a building done
export function planStale(w) {
  const p = w.plan; if (!p?.vac) return true;   // an old save's roster by names: post vacancies instead
  const col = colonists(w).filter(a => !a.downed);
  return p.pop !== col.length || p.built !== w.buildings.filter(b => b.done).length || dayOf(w.tick) > p.day + 1;
}
export function ensurePlan(w) {
  if (planStale(w)) makePlan(w, w.plan ? 'перемены в поселении' : 'первый день');
  return w.plan;
}

// the council's vacancies for tomorrow, with a journal line
export function councilRoster(w) {
  const p = makePlan(w, 'совет');
  const text = vacancyLines(w).map(l => l.text).join('; ');
  if (text) log(w, `Работа на завтра: ${esc(text)}.`, 'council');
  return p;
}
