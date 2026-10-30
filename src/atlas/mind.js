// The realm's mind — its council (docs/WORLD.md «Совет державы»; the numbers: data/mind.js MIND). The court
// (atlas/court.js) picks the realm's deeds abroad; the council keeps its course at home. Three vectors — aggression,
// growth, economy (data/mind.js VECTORS) — and each people's rose (data/peoples.js `rose`): the course it keeps to.
//
// Each season, after the households and before the treasury (atlas/history.js):
//   - sense: how fed the realm is, how crowded, how threatened, how many goods it lacks, how many seasons of its spending
//     its treasury holds — the season's flags, 0 … 1;
//   - course: what the realm did — the work-days its builders put into each building and what its treasury spent, each
//     along its vector (`note`) — averaged over MIND.course seasons;
//   - wind: rose + MIND.pull × (rose − course) — the pull back to its people's ways — and MIND.needs × the season's flags
//     (threat → aggression, hunger and crowding → growth, shortages → economy), smoothed; three shares;
//   - roles, once a year: each town but the seat is flagged along a vector, as many towns along each as the wind asks,
//     the towns that lean that way already first. A role is a priority, not an order: the town builds as it likes, and
//     the role weighs its choice by the realm's obedience (atlas/build.js, atlas/towns.js wantOf);
//   - its free money (atlas/treasury.js → spendFree): what the treasury holds beyond MIND.reserve seasons of its spending,
//     a share a season, by the wind — the materials of the buildings under way along each vector, and coin to the towns
//     of each role (a hungry town counts for growth) — their purse: they pay their masters and buy at market.
// The court reads the wind too: its deeds are weighed along their vectors (atlas/court.js).
//
// realm.mind = {course, wind, flags, sense, obey, lead, acts, spent: {agg, grow, econ}}; town.role = 'agg' | 'grow' | 'econ'.
import {MIND, VECTOR_IDS, vectorOf, normVec, leadOf as lead} from '../data/mind.js';
import {WORLD_PEOPLES, TOWN_LIFE} from '../data/peoples.js';
import {TOWN_BUILDINGS, goodPrice} from '../data/townBuildings.js';
import {TREASURY} from '../data/macro.js';
import {townFx, room} from './towns.js';
import {realmTowns, giveStock, stockOf, holdOf} from './economy.js';
import {treasuryOf, treasuryWorth, withdraw, corruptShare} from './treasury.js';
import {realmLabelGen} from './realms.js';

const worthOf = g => goodPrice(g) || 1;
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

// a deed of the realm along a vector: `vec` a vector ({agg: 1}), `worth` gold's worth (work-days × MIND.dayWorth)
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

// the season's needs of a realm, and its obedience
function sense(a, r, towns) {
  const F = MIND.flags, pop = towns.reduce((s, t) => s + t.pop, 0) || 1;
  const fed = towns.reduce((s, t) => s + (t.econ?.fed ?? 1) * t.pop, 0) / pop;
  const crowd = towns.reduce((s, t) => s + t.pop / Math.max(1, room(townFx(t))), 0) / towns.length;
  const war = Object.entries(a.rel || {}).some(([k, x]) => x.war && k.split(':').includes(String(r.id)));
  const threat = war ? 1 : clamp01(towns.reduce((s, t) => s + (t.wants?.threat || 0) * t.pop, 0) / pop);
  const short = new Set(towns.flatMap(t => t.econ?.short || [])).size;
  const R = treasuryOf(r), reserve = treasuryWorth(r) / Math.max(1, R.need || 0);
  const flags = {
    hunger: clamp01((F.fed - fed) / F.fedSpan), crowd: clamp01((crowd - F.crowd) / F.crowdSpan), threat,
    short: clamp01(short / F.short), hoard: clamp01((MIND.reserve - reserve) / MIND.reserve),
  };
  const loyalty = r.kingdom?.stats?.loyalty ?? 0;
  const obey = clamp01(MIND.obey.base + MIND.obey.loyalty * loyalty) * (1 - corruptShare(r));
  return {sense: {fed: r3(fed), crowd: r3(crowd), war, threat: r3(threat), short, reserve: r3(Math.min(reserve, 999))}, flags: round2(flags), obey: r3(obey)};
}

// a season of the councils (after the households, before the treasury: atlas/history.js); the roles are flagged in
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
    const want = normVec(Object.fromEntries(VECTOR_IDS.map(k => [k, Math.max(0, rose[k] + MIND.pull * (rose[k] - M.course[k])) + MIND.needs * need[k]])));
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
// does the realm back this building in this town (its role, or the seat): the treasury pays its masters what the town cannot
export function backed(a, t, b) {
  const L = leanOf(a, t);
  if (!L) return true;   // a town of no realm, or a realm without a mind yet (an old save): as before
  const v = vectorOf(b);
  return !t.role || lead(v) === t.role;
}

// the free money of a realm's treasury, spent by the wind (atlas/treasury.js calls it after its duties): `need` — gold's
// worth a season of its armies, guard, court and builders; returns the worth spent
export function spendFree(a, r, towns, need) {
  const M = r.mind;
  if (!M) return 0;
  const free = treasuryWorth(r) - MIND.reserve * need;
  if (free <= 1e-6) { M.spent = zeroVec(); return 0; }
  const budget = free * MIND.spend * (1 - (M.flags.hoard || 0));
  // the coin the grants may give: what the treasury holds of the goods it pays its duties in (TREASURY.payIn) beyond
  // MIND.reserve seasons of them — a treasury rich in stone and poor in gold keeps its gold for its armies
  const coin = {left: Math.max(0, TREASURY.payIn.reduce((s, g) => s + (treasuryOf(r).stock[g] || 0) * worthOf(g), 0) - MIND.reserve * need)};
  let spent = 0;
  M.spent = zeroVec();
  for (const k of VECTOR_IDS) {
    let B = budget * (M.wind[k] || 0);
    if (B <= 1e-6) continue;
    // the buildings under way along it: their missing materials, as far as the treasury holds them
    let works = B * MIND.grants.works;
    for (const t of towns) {
      const w = t.project && t.works?.[t.project], b = w && TOWN_BUILDINGS.has(t.project) ? TOWN_BUILDINGS.get(t.project) : null;
      if (!b || lead(vectorOf(b)) !== k) continue;
      if (works <= 1e-6) break;
      for (const [g, v] of Object.entries(w.mat)) {
        if (works <= 1e-6) break;
        const price = worthOf(g);
        if (v <= 1e-6) continue;
        const n = withdraw(r, g, Math.min(v, works / price), 'grantWorks');
        w.mat[g] = v - n; works -= n * price; B -= n * price; spent += n * price; M.spent[k] += n * price;
      }
    }
    // coin to the towns of the role (a hungry town counts for growth), by their people
    const weigh = t => t.pop * ((t.role === k ? 1 : 0) + (k === 'grow' ? clamp01(TOWN_LIFE.fedOk - (t.econ?.fed ?? 1)) : 0));
    const to = towns.map(t => [t, weigh(t)]).filter(([, w]) => w > 0), W = to.reduce((s, [, w]) => s + w, 0);
    if (W <= 0 || B <= 1e-6) continue;
    for (const [t, w] of to) { const g = grant(r, t, B * w / W, coin); spent += g; M.spent[k] += g; }
  }
  M.spent = round(M.spent);
  for (const k of VECTOR_IDS) M.acts[k] += M.spent[k];   // the course counts what it spent
  return spent;
}

// give a town a worth from the treasury: the coin it may spare (`coin.left`, TREASURY.payIn: gold first), then what the
// town asks for and has room for in its stores (atlas/economy.js holdOf), the dearest first; returns the worth given
function grant(r, t, w, coin) {
  const R = treasuryOf(r), isCoin = g => TREASURY.payIn.includes(g);
  let left = w;
  const give = g => {
    const room = holdOf(t, g) - stockOf(t, g), cap = isCoin(g) ? coin.left / worthOf(g) : Infinity;
    const n = Math.min(R.stock[g] || 0, room, cap, left / worthOf(g));
    if (n <= 1e-9) return;
    withdraw(r, g, n, 'grant'); giveStock(t, g, n); left -= n * worthOf(g);
    if (isCoin(g)) coin.left -= n * worthOf(g);
  };
  give('gold');
  const asks = Object.keys(R.stock).filter(g => g !== 'gold' && (t.econ?.want?.[g] || 0) > 0).sort((p, q) => worthOf(q) - worthOf(p) || (p < q ? -1 : 1));
  for (const g of asks) { if (left <= 1e-9) break; give(g); }
  return w - left;
}

// a town pays a worth from its own purse (its masters' wage, atlas/build.js): its gold, then the goods nothing in the
// town asks for (a surplus of meat, wool, stone; silver, luxury and gems first, as the treasury pays: TREASURY.payIn), the
// dearest first — wages in kind; what its people and buildings use is never paid away. Returns the worth paid
export function townPays(t, w) {
  if (!(w > 0) || !t.econ) return 0;
  const E = t.econ, spare = g => (g === 'gold' || !(E.want?.[g] > 0) ? stockOf(t, g) : 0);
  const order = [...TREASURY.payIn, ...Object.keys(E.stock).filter(g => !TREASURY.payIn.includes(g)).sort((p, q) => worthOf(q) - worthOf(p) || (p < q ? -1 : 1))];
  let left = w;
  for (const g of order) {
    if (left <= 1e-9) break;
    const n = Math.min(spare(g), left / worthOf(g));
    if (n > 0) { E.stock[g] = stockOf(t, g) - n; left -= n * worthOf(g); }
  }
  return w - left;
}
