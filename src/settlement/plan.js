// The day's roster (наряд): who does what tomorrow, decided once for the whole colony at the
// evening council (and again when the colony changes), instead of every colonist weighing every job
// every minute and all of them picking the same one.
//
// Three steps, all here:
//   1. needs with a horizon (needs): what the colony wants of each job tomorrow — the job's own
//      `desire` (data/jobs.js) as the colony's weight, pulled up where tomorrow is foreseeable:
//      firewood for the nights ahead, food for the days ahead, what the council is saving for;
//   2. hands (crews): how many people each job wants, out of everyone able to work — the weights
//      shared out, bounded by what the job can take (benches at a workshop, one healer, a hunter per
//      few head of game);
//   3. names (assign): who fills each place — the fittest free pair of hands: skill first (the best
//      smith forges), then the habit of yesterday (a trade sticks), then the liking, then whoever is
//      left; everyone also gets a second and a third choice for when the first is blocked.
// The brain (agents/brains/colonist.js) reads the roster through rosterOf(): the assigned job pulls
// hardest, the alternatives less, everything else only when nothing of the roster can be done.
// The roster is plain data on the world (w.plan) and is saved with it; the council's journal line and
// the panel show it with the reasons, so that «why is he doing that» has an answer at colony level too.
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
import {agentById} from '../agents/lookup.js';

export const PLAN = {
  fuelDays: 3,        // keep this many days of firewood ahead…
  fuelDaysCold: 5,    // …and this many when it freezes
  foodDays: 6,        // days of food the colony likes to have ahead
  foodDaysAutumn: 12, // …before winter (autumn): stock up
  minWeight: 0.08,    // a job wanted less than this gets no place in the roster
  habit: 0.35,        // fitness for doing the same job as yesterday
  best: 0.5,          // fitness for being the colony's best at the job's skill
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

// fitness of a colonist for a job: skill, the colony's best, habit, liking; −Infinity when unable
function fitness(w, a, job, bestSkill, yesterday) {
  if (a.downed) return -Infinity;
  if (!jobAccess(a, job).ok || (job.canDo && !job.canDo(w, a))) return -Infinity;
  const sk = skillOf(a, job.skill), why = [];
  let f = sk / 10;
  if (sk > 0 && sk >= bestSkill) { f += PLAN.best; why.push('лучше всех'); }
  if (yesterday === job.id) { f += PLAN.habit; why.push('как вчера'); }
  const p = a.prefs?.[job.id] ?? 1;
  f += (p - 1) * 1.2;
  if (job.id === a.likes) why.push('любимое дело'); else if (job.id === a.dislikes) why.push('не по душе');
  return [f, why.join(', ')];
}

// the roster: needs → hands → names. `reason` says what called for it (the journal)
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
  const places = [], spare = [], quota = {};
  let used = 0;
  for (const j of jobs) { const q = col.length * need[j].w / total; quota[j] = Math.min(crewCap(w, JOBS.get(j)), need[j].w >= 0.6 ? Math.max(1, Math.floor(q)) : Math.floor(q)); used += quota[j]; }
  for (const j of jobs.slice().sort((x, y) => (col.length * need[y].w / total - quota[y]) - (col.length * need[x].w / total - quota[x]))) {
    if (used >= col.length) break;
    if (quota[j] < crewCap(w, JOBS.get(j)) && col.length * need[j].w / total - quota[j] > 0.3) { quota[j]++; used++; }
  }
  if (pairs) {
    // lone outdoor places are merged: the second of two singleton outdoor jobs joins the first (more wanted)
    const singles = jobs.filter(j => quota[j] === 1 && outdoor(j));
    for (let k = 1; k < singles.length; k += 2) { quota[singles[k]] = 0; quota[singles[k - 1]] = 2; }
  }
  for (const j of jobs) { for (let k = 0; k < quota[j]; k++) places.push(j); if (crewCap(w, JOBS.get(j)) > quota[j]) spare.push(j); }
  // hands left over join the most wanted jobs that still have room, one each in turn
  for (let k = 0; places.length < col.length && spare.length; k++) {
    const j = spare[k % spare.length];
    places.push(j);
    if (places.filter(p => p === j).length >= crewCap(w, JOBS.get(j))) spare.splice(spare.indexOf(j), 1);
  }
  // names: the most wanted place first, the fittest free hands for it
  const prev = w.plan?.assign || {}, best = {};
  for (const j of jobs) best[JOBS.get(j).skill] = Math.max(0, ...col.map(a => skillOf(a, JOBS.get(j).skill)));
  const free = new Set(col.map(a => a.id)), assign = {}, byId = Object.fromEntries(col.map(a => [a.id, a]));
  for (const j of places) {
    const job = JOBS.get(j);
    let pick = null, pf = -Infinity, pw = '';
    for (const id of free) {
      const a = byId[id], r = fitness(w, a, job, best[job.skill], prev[id]?.job);
      if (r === -Infinity) continue;
      const [f, why] = r;
      if (f > pf || (f === pf && a.id < pick.id)) { pf = f; pick = a; pw = why; }
    }
    if (!pick) continue;
    free.delete(pick.id);
    assign[pick.id] = {job: j, why: pw || 'нужны руки', alt: []};
  }
  // nobody placed: free hands, the old way — and everyone gets two fallbacks among the wanted jobs
  for (const a of col) {
    const e = assign[a.id] || (assign[a.id] = {job: null, why: 'свободные руки', alt: []});
    e.alt = jobs.filter(j => j !== e.job && jobAccess(a, JOBS.get(j)).ok && (!JOBS.get(j).canDo || JOBS.get(j).canDo(w, a))).slice(0, 2);
  }
  w.plan = {day, at: w.tick, reason, need, assign, pop: col.length, built: w.buildings.filter(b => b.done).length,
    lines: rosterLines(w, assign, need)};
  return w.plan;
}

// the roster in words: «Ждан и Тихон — рубить лес (дров на 1,2 дн.); Горислав — охотиться (лучше всех)»
function rosterLines(w, assign, need) {
  const by = {};
  for (const [id, e] of Object.entries(assign)) { const a = agentById(w, +id); if (!a) continue; (by[e.job || '—'] ||= []).push({name: a.name, why: e.why}); }
  const lines = [];
  for (const [j, people] of Object.entries(by)) {
    const job = j === '—' ? null : JOBS.get(j);
    const names = people.map(p => p.name).join(', ');
    const whys = [...new Set(people.map(p => p.why).filter(x => x && x !== 'нужно поселению'))].join('; ');
    lines.push({job: j, text: `${names} — ${job ? job.label : 'свободные руки'}${need[j]?.why ? ` (${need[j].why})` : ''}${whys && job ? ` · ${whys}` : ''}`});
  }
  return lines;
}

// the roster entry of a colonist, or null when there is no roster yet / it is stale
export function rosterOf(w, a) {
  const p = w.plan; if (!p) return null;
  return p.assign[a.id] || null;
}

// the roster is remade when the colony has changed under it: a newcomer, a loss, a building done
export function planStale(w) {
  const p = w.plan; if (!p) return true;
  const col = colonists(w).filter(a => !a.downed);
  return p.pop !== col.length || p.built !== w.buildings.filter(b => b.done).length || dayOf(w.tick) > p.day + 1;
}
export function ensurePlan(w) {
  if (planStale(w)) makePlan(w, w.plan ? 'перемены в поселении' : 'первый день');
  return w.plan;
}

// the council's roster for tomorrow, with a journal line
export function councilRoster(w) {
  const p = makePlan(w, 'совет');
  const text = p.lines.map(l => l.text).join('; ');
  if (text) log(w, `Наряд на завтра: ${esc(text)}.`, 'council');
  return p;
}
