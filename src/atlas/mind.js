// The realm's mind — its council (docs/WORLD.md «Совет державы»; the numbers: data/mind.js MIND). The court
// (atlas/court.js) picks the realm's deeds abroad; the council keeps its course at home. Three vectors — aggression,
// growth, economy (data/mind.js VECTORS) — and each people's rose (data/peoples.js `rose`): the course it keeps to.
//
// Each season, after the towns' economies (atlas/history.js):
//   - sense: how well its people live (atlas/treasury.js t.needs), how crowded, how threatened, how many goods its towns
//     lack (t.econ.short), how full its treasury is against its people (realm.gold, MIND.hoard) — the season's flags, 0 … 1;
//   - course: what the realm did — what its towns paid for their buildings (atlas/peoples.js) and what its treasury granted,
//     each along its vector (`note`) — averaged over MIND.course seasons;
//   - wind: rose + MIND.pull × (rose − course) — the pull back to its people's ways — and MIND.needs × the season's flags
//     (threat → aggression, want and crowding → growth, shortages → economy), smoothed; three shares;
//   - roles, once a year: each town but the seat is flagged along a vector, as many towns along each as the wind asks,
//     the towns that lean that way already first. A role is a priority, not an order: the town builds as it likes, and
//     the role weighs its choice by the realm's obedience (atlas/towns.js chooseBuilding, ctx.lean);
//   - the realm's grants to build (atlas/treasury.js realmSpend) go by the wind: each vector's share to the towns of its
//     role (the seat a share of every one, a town in want counts for growth) — councilShares.
// The court reads the wind too: its deeds are weighed along their vectors (atlas/court.js).
//
// realm.mind = {course, wind, flags, sense, obey, lead, acts, spent: {agg, grow, econ}}; town.role = 'agg' | 'grow' | 'econ'.
import {warsOf} from './common.js';
import {MIND, VECTOR_IDS, vectorOf, normVec, leadOf as lead} from '../data/mind.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {TOWN_BUILDINGS} from '../data/townBuildings.js';
import {townFx, room} from './towns.js';
import {realmLabelGen, realmTowns} from './realms.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const r3 = v => Math.round(v * 1000) / 1000;
const zeroVec = () => Object.fromEntries(VECTOR_IDS.map(k => [k, 0]));
const round = v => Object.fromEntries(VECTOR_IDS.map(k => [k, r3(v[k] || 0)]));
const round2 = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r3(v)]));
export const roseOf = people => normVec(WORLD_PEOPLES.has(people) ? WORLD_PEOPLES.get(people).rose || {} : {});

// what a town has built, along the vectors (its lean)
export function townLean(t) {
  const v = zeroVec();
  for (const id of t.built || []) if (TOWN_BUILDINGS.has(id)) { const x = vectorOf(TOWN_BUILDINGS.get(id)); for (const k of VECTOR_IDS) v[k] += x[k]; }
  return normVec(v);
}

// a deed of the realm along a vector: `vec` a vector ({agg: 1}), `worth` its gold
export function note(a, realmId, vec, worth) {
  if (!(worth > 0) || realmId == null) return;
  const r = a.realms?.find(x => x.id === realmId);
  if (!r || r.fallen != null) return;
  const M = mindOf(a, r), v = normVec(vec);
  for (const k of VECTOR_IDS) M.acts[k] += v[k] * worth;
}
export function mindOf(a, r) {
  if (r.mind) return r.mind;
  // a new mind starts on the course its towns have built so far, its wind at its people's rose
  const ts = realmTowns(a, r.id), v = zeroVec();
  for (const t of ts) { const l = townLean(t); for (const k of VECTOR_IDS) v[k] += l[k]; }
  const rose = roseOf(r.people);
  return (r.mind = {course: round(ts.length ? normVec(v) : rose), wind: round(rose), flags: {}, sense: {}, obey: 1, lead: lead(rose), acts: zeroVec(), spent: zeroVec()});
}

// how far a realm's corruption keeps its towns from following it (data/kingdom.js RUINS corruption), 0 … MIND.obey.corruptMax
export const corruptShare = r => Math.min(MIND.obey.corruptMax, MIND.obey.corrupt * (r.kingdom?.ruin?.corruption || 0));
// how well a town is fed, 0 … 1: 1 less the strength of its council's need of food (atlas/townNeeds.js: its people against what
// feeds them; a town that has not sensed it yet — 1)
const fedOf = t => 1 - (t.need?.food?.s ?? 0);

// the season's needs of a realm, and its obedience
function sense(a, r, towns) {
  const F = MIND.flags, pop = towns.reduce((s, t) => s + t.pop, 0) || 1;
  const fed = towns.reduce((s, t) => s + fedOf(t) * t.pop, 0) / pop;
  const crowd = towns.reduce((s, t) => s + t.pop / Math.max(1, room(townFx(t))), 0) / towns.length;
  const war = warsOf(a, r.id) > 0;
  const threat = war ? 1 : clamp01(towns.reduce((s, t) => s + (t.wants?.threat || 0) * t.pop, 0) / pop);
  const short = new Set(towns.flatMap(t => Object.keys(t.econ?.short || {}))).size;
  const reserve = Math.max(0, r.gold || 0) / (MIND.hoard * pop / 100);   // the treasury against what it would hold
  const flags = {
    hunger: clamp01((F.fed - fed) / F.fedSpan), crowd: clamp01((crowd - F.crowd) / F.crowdSpan), threat,
    short: clamp01(short / F.short), hoard: clamp01(1 - reserve),
  };
  const loyalty = r.kingdom?.stats?.loyalty ?? 0;
  const obey = clamp01(MIND.obey.base + MIND.obey.loyalty * loyalty) * (1 - corruptShare(r));
  return {sense: {fed: r3(fed), crowd: r3(crowd), war, threat: r3(threat), short, reserve: r3(Math.min(reserve, 999))}, flags: round2(flags), obey: r3(obey)};
}

// a season of the councils (after the towns' economies: atlas/history.js); the roles are flagged in
// spring, and at once for a new town or a new seat
export function stepMinds(a, say = () => {}) {
  for (const r of a.realms || []) {
    if (r.fallen != null) continue;
    const towns = realmTowns(a, r.id);
    if (!towns.length) continue;
    const M = mindOf(a, r);
    Object.assign(M, sense(a, r, towns));
    // the course: what the realm did last season, averaged
    const done = VECTOR_IDS.reduce((s, k) => s + M.acts[k], 0);
    if (done > 0) {
      const d = normVec(M.acts), al = 1 / Math.max(1, MIND.course);
      M.course = round(normVec(Object.fromEntries(VECTOR_IDS.map(k => [k, M.course[k] * (1 - al) + d[k] * al]))));
    }
    M.acts = zeroVec();
    // the wind: the rose and the pull back to it, and the season's needs
    const rose = roseOf(r.people), f = M.flags;
    const need = {agg: f.threat, grow: Math.max(f.hunger, f.crowd), econ: f.short};
    const want = normVec(Object.fromEntries(VECTOR_IDS.map(k => [k, Math.max(0, rose[k] + (WORLD_PEOPLES.get(r.people)?.rosePull ?? MIND.pull) * (rose[k] - M.course[k])) + MIND.needs * need[k]])));
    M.wind = round(normVec(Object.fromEntries(VECTOR_IDS.map(k => [k, M.wind[k] * MIND.smooth + want[k] * (1 - MIND.smooth)]))));
    // a new lead, told when it leads the old one clearly
    const L = lead(M.wind);
    if (L !== M.lead && M.wind[L] - M.wind[M.lead] > MIND.turn) {
      const T = MIND.tell, why = L === 'agg' ? (M.sense.war ? 'война' : f.threat > T ? 'угроза' : 'нрав народа') : L === 'grow' ? (f.hunger > T ? 'голод' : f.crowd > T ? 'теснота' : 'нрав народа') : (f.short > T ? 'нехватки' : 'нрав народа');
      say({text: `Совет ${realmLabelGen(a, r.id)} повернул к ${{agg: 'войне', grow: 'росту', econ: 'хозяйству'}[L]}: ${why}.`, topic: 'kingdom'});
      M.lead = L;
    }
    if (a.hist.season === 0 || towns.some(t => (t.role == null) !== (t.id === r.capital))) assignRoles(a, r, towns, M);
  }
}

// the roles of a realm's towns: as many along each vector as the wind asks (the seat aside), the towns that lean that way
// first; a town keeps its role while its vector's count holds
function assignRoles(a, r, towns, M) {
  const seat = towns.find(t => t.id === r.capital) || null, rest = towns.filter(t => t !== seat);
  if (seat) seat.role = null;
  if (!rest.length) return;
  const n = rest.length, cnt = {}, rem = [];
  let left = n;
  for (const k of VECTOR_IDS) { cnt[k] = Math.floor(M.wind[k] * n); left -= cnt[k]; rem.push([M.wind[k] * n - cnt[k], k]); }
  rem.sort((x, y) => y[0] - x[0] || (x[1] < y[1] ? -1 : 1));
  for (let i = 0; i < left; i++) cnt[rem[i % rem.length][1]]++;
  const R = MIND.role, fit = new Map(rest.map(t => {
    const l = townLean(t), food = t.pop > 0 ? clamp01((t.wants?.feeds || 0) / t.pop - 1) : 0;
    return [t, {agg: R.built * l.agg + R.threat * clamp01(t.wants?.threat || 0), grow: R.built * l.grow + R.food * food, econ: R.built * l.econ}];
  }));
  const left2 = {...cnt}, done = new Set();
  // those that keep their role, the fittest first
  const keep = rest.filter(t => t.role && left2[t.role] > 0).sort((p, q) => fit.get(q)[q.role] - fit.get(p)[p.role] || p.id - q.id);
  for (const t of keep) if (left2[t.role] > 0) { left2[t.role]--; done.add(t); }
  const pairs = [];
  for (const t of rest) if (!done.has(t)) for (const k of VECTOR_IDS) pairs.push([fit.get(t)[k], t, k]);
  pairs.sort((x, y) => y[0] - x[0] || x[1].id - y[1].id || (x[2] < y[2] ? -1 : 1));
  for (const [, t, k] of pairs) if (!done.has(t) && left2[k] > 0) { t.role = k; left2[k]--; done.add(t); }
  for (const t of rest) if (!done.has(t)) t.role = lead(M.wind);
}

// how a town leans its choice: along its role, or the seat along the wind; × the realm's obedience. {vec, k} or null
export function leanOf(a, t) {
  const r = t.realm != null ? a.realms?.find(x => x.id === t.realm) : null;
  if (!r?.mind) return null;
  const M = r.mind;
  if (t.role) return {vec: {[t.role]: 1}, k: MIND.build * M.obey};
  return {vec: M.wind, k: MIND.build * MIND.seat * M.obey};
}
// the realm's grants to build, by the wind (atlas/treasury.js realmSpend): each vector's share of `budget` goes to the
// towns of its role — the seat takes MIND.seat of a share of every vector, a town whose people lack their basic needs
// counts for growth — by their people; a vector no town carries goes to all by their people. → [[town, gold], …]
export function councilShares(a, r, towns, budget) {
  const M = r.mind, out = new Map(towns.map(t => [t, 0]));
  if (!M || !(budget > 0)) {
    const pop = towns.reduce((s, t) => s + t.pop, 0) || 1;
    for (const t of towns) out.set(t, budget * t.pop / pop);
    return [...out];
  }
  M.spent = zeroVec();
  const sum = VECTOR_IDS.reduce((s, k) => s + (M.wind[k] || 0), 0) || 1;   // (the wind is kept rounded: its shares may sum to 0.999)
  for (const k of VECTOR_IDS) {
    const B = budget * (M.wind[k] || 0) / sum;
    if (B <= 1e-9) continue;
    const weigh = t => t.pop * ((t.role === k ? 1 : t.id === r.capital ? MIND.seat : 0) + (k === 'grow' ? clamp01((MIND.flags.fed - fedOf(t)) / MIND.flags.fedSpan) : 0));
    let W = towns.reduce((s, t) => s + weigh(t), 0), w = weigh;
    if (W <= 0) { w = t => t.pop; W = towns.reduce((s, t) => s + t.pop, 0) || 1; }
    for (const t of towns) out.set(t, out.get(t) + B * w(t) / W);
    M.spent[k] += B;
  }
  M.spent = round(M.spent);
  for (const k of VECTOR_IDS) M.acts[k] += M.spent[k];   // the course counts what it granted
  return [...out];
}
