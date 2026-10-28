// A town's economy by its buildings' flows (docs/WORLD.md «Потоки построек»; the numbers: data/townBuildings.js — each
// building's `jobs`, `heat`, `in`, `out`, the goods TOWN_GOODS, the rules TOWN_FLOW; the people's `hands`, `eat`,
// `flows`, `swaps` in data/peoples.js). Once a season, before the town grows (atlas/peoples.js):
//   hands     — the town's people × its people's `hands`, and its slaves (t.slaves) at TOWN_FLOW.slaves.work each;
//               each building rents its `jobs` in TOWN_FLOW.order (food first): slaves first, up to `share` of its places,
//               free hands for the rest; what is short works at a share. A building gone gives its hands back
//   goods     — what the buildings give at their staffing (× the people's `flows`) is shared out over `rounds` between the
//               buildings that take it (a good the people never takes is its `swaps` instead); without a hard good a
//               building stops, without a soft one it works at TOWN_FLOW.soft; a building of another people (taken)
//               works at TOWN_FLOW.captured. Housing takes its upkeep and heat but is never stopped (people live in it)
//   food      — what the buildings give of food, grain (× TOWN_FLOW.grain) and stores, less what the buildings take of it,
//               in people-years: the town's people and slaves eat it at their people's `eat`
// The result is kept in t.econ (not saved — worked out anew each season) for the town's growth, its choices and its card.
import {TOWN_BUILDINGS, TOWN_GOODS, TOWN_FLOW as F} from '../data/townBuildings.js';
import {WORLD_PEOPLES} from '../data/peoples.js';

const soft = g => !!TOWN_GOODS.get(g).soft;

// the climate's weight on a town's heat: cold ×1.6 at or below TOWN_FLOW.heat.cold °C, warm ×0.4 at or above .warm, between
// the two in a line (the year's mean of the town's cell)
export function heatFactor(a, t) {
  const H = F.heat, c = a?.f?.temp ? a.f.temp[t.i] : (H.cold + H.warm) / 2;
  const x = Math.max(0, Math.min(1, (c - H.cold) / (H.warm - H.cold)));
  return H.k[0] + (H.k[1] - H.k[0]) * x;
}

export function townEconomy(a, t, heatK = heatFactor(a, t)) {
  const P = WORLD_PEOPLES.get(t.people), flows = P.flows || {}, swaps = P.swaps || {};
  const free0 = t.pop * (P.hands ?? 0.5), slaves0 = (t.slaves || 0);
  let free = free0, slaves = slaves0;
  // the buildings, a row each with its count, in the order the hands go
  const count = {};
  for (const id of t.built) count[id] = (count[id] || 0) + 1;
  const rows = Object.entries(count).map(([id, n]) => ({b: TOWN_BUILDINGS.get(id), n}))
    .sort((p, q) => F.order.indexOf(p.b.cat) - F.order.indexOf(q.b.cat));
  // hands: slaves first, in at most `share` of the places; free ones for the rest
  let jobs = 0;
  for (const r of rows) {
    const need = (r.b.jobs || 0) * r.n; jobs += need;
    if (!need) { r.staff = 1; continue; }
    const bySlaves = Math.min(slaves * F.slaves.work, need * F.slaves.share);
    slaves -= bySlaves / F.slaves.work;
    const byFree = Math.min(free, need - bySlaves);
    free -= byFree;
    r.staff = (bySlaves + byFree) / need;
    r.slaveShare = need ? bySlaves / need : 0;
  }
  // what a building takes (its people's swaps; heat is wood × the climate) and gives (× its people's flows)
  for (const r of rows) {
    r.in = {};
    for (const [g, v] of Object.entries(r.b.in || {})) { const s = swaps[g], to = s ? s.to : g; r.in[to] = (r.in[to] || 0) + v * (s ? s.k : 1) * r.n; }
    if (r.b.heat) r.in.wood = (r.in.wood || 0) + r.b.heat * heatK * r.n;
    r.out = Object.fromEntries(Object.entries(r.b.out || {}).map(([g, v]) => [g, v * (flows[g] ?? 1) * r.n]));
    r.own = !r.b.peoples || r.b.peoples.includes(t.people) ? 1 : F.captured;
    r.eff = r.staff * r.own;
  }
  // the goods shared out, a few rounds: each building's strength by what it got of what it takes
  let sup = {}, dem = {};
  for (let k = 0; k < F.rounds; k++) {
    sup = {}; dem = {};
    for (const r of rows) {
      for (const [g, v] of Object.entries(r.out)) sup[g] = (sup[g] || 0) + v * r.eff;
      for (const [g, v] of Object.entries(r.in)) dem[g] = (dem[g] || 0) + v * r.staff * r.own;
    }
    const got = g => (dem[g] ? Math.min(1, (sup[g] || 0) / dem[g]) : 1);
    for (const r of rows) {
      if (r.b.cat === 'housing') { r.eff = r.staff * r.own; continue; }
      let m = 1;
      for (const g of Object.keys(r.in)) m = Math.min(m, soft(g) ? F.soft + (1 - F.soft) * got(g) : got(g));
      r.eff = r.staff * r.own * m;
    }
  }
  const made = {}, used = {};
  for (const r of rows) {
    for (const [g, v] of Object.entries(r.out)) made[g] = (made[g] || 0) + v * r.eff;
    for (const [g, v] of Object.entries(r.in)) used[g] = (used[g] || 0) + v * r.staff * r.own * Math.min(1, dem[g] ? (sup[g] || 0) / dem[g] : 1);
  }
  // short: the share of what the buildings asked for and did not get, by good
  const short = {};
  for (const [g, d] of Object.entries(dem)) { const s = 1 - Math.min(1, (sup[g] || 0) / d); if (s > 0.01) short[g] = s; }
  const food = Math.max(0, (made.food || 0) - (used.food || 0)) + Math.max(0, (made.grain || 0) - (used.grain || 0)) * F.grain + Math.max(0, (made.stores || 0) - (used.stores || 0));
  return {hands: free0 + slaves0 * F.slaves.work, freeHands: free, slavesIdle: slaves, jobs, made, used, short, food,
    feeds: food / (P.eat ?? 1), eat: P.eat ?? 1, rows: rows.map(r => ({id: r.b.id, n: r.n, staff: r.staff, eff: r.eff, slaves: r.slaveShare || 0}))};
}
