// A town's economy by its buildings' flows (docs/WORLD.md «Потоки построек»; the numbers: data/townBuildings.js — each
// building's `jobs`, `heat`, `in`, `out`, the goods TOWN_GOODS, the rules TOWN_FLOW; the people's `hands`, `eat`,
// `flows`, `swaps` in data/peoples.js). Once a season, before the town grows (atlas/peoples.js):
//   hands     — the town's people × its people's `hands`, and its slaves (t.slaves) at TOWN_FLOW.slaves.work each;
//               each building rents its `jobs` in TOWN_FLOW.order (food first): slaves first, up to `share` of its places,
//               free hands for the rest; what is short works at a share. A building gone gives its hands back
//   goods     — what the buildings give at their staffing (× the people's `flows`) is shared out over `rounds` between the
//               buildings that take it (a good the people never takes is its `swaps` instead); without a hard good a
//               building stops, without a soft one (TOWN_GOODS `soft`, or the building's own `soft` list) it works at
//               TOWN_FLOW.soft; a building of another people (taken) works at TOWN_FLOW.captured. Housing takes its upkeep
//               and heat but is never stopped (people live in it). A building uses a good only as far as it works: one that
//               stands for want of leather does not burn its wood (the rest stays for the store)
//   herds     — the pens and pastures raise beasts (`out`), the slaughterhouse alone kills them (`in`) for meat, hides and
//               bone; the store keeps TOWN_FLOW.herd.keep head a pen at work for breeding, out of the slaughter's reach
//   pools     — what a building takes of any of a set of goods (its `any`: a kitchen any raw food) and the fuel of its heat and
//               fire (data/townBuildings.js POOLS, FUEL) come out of what the buildings' own `in` left, the cheapest of the pool
//               first; short of it, it stops as for a hard good (housing: never)
//   food      — what the buildings give of ready food and stores, less what the buildings take of it, in people-years (raw
//               food is not eaten: the kitchens cook it — but by a people that eats it raw, data/peoples.js eatsRaw): the
//               town's people and slaves eat it at their people's `eat`
// The result is kept in t.econ (not saved — worked out anew each season) for the town's growth, its choices and its card.
import {TOWN_BUILDINGS, TOWN_GOODS, TOWN_FLOW as F, GOLEMS, POOLS, POOL_SHARE, POOL_PAIR, ORE_GOODS, goodPrice} from '../data/townBuildings.js';
import {WORLD_PEOPLES, swapOf} from '../data/peoples.js';
import {placeHas} from './towns.js';
import {SEASONS_PER_YEAR as S} from '../data/atlas.js';

const soft = (r, g) => !!TOWN_GOODS.get(g).soft || r.soft.has(g);
// the goods of each pool, the cheapest a unit of its weight first (a log's charge before coal's)
const POOL_IDS = Object.keys(POOLS);
const poolGoods = id => Object.entries(POOLS[id]).sort((p, q) => goodPrice(p[0]) / p[1] - goodPrice(q[0]) / q[1] || (p[0] < q[0] ? -1 : 1));
// take `want` of a pool out of what is left of its goods (`left`, by good, changed): → [took, {good: units}]. The cheapest
// first — but a pool in POOL_SHARE (the smelter's ores) takes of each good by how much of it there is
function drawPool(id, want, left) {
  let need = want;
  const by = {};
  if (POOL_PAIR.has(id)) {   // the two the town has most of (by what each gives the pool), up to half the want each
    const G = Object.entries(POOLS[id]).map(([g, w]) => [g, w, (left[g] || 0) * w]).filter(x => x[2] > 0).sort((p, q) => q[2] - p[2] || (p[0] < q[0] ? -1 : 1));
    for (let k = 0; k < G.length && need > 1e-12; k++) {
      const [g, w, has] = G[k], part = k < 2 ? Math.max(need / Math.max(1, 2 - k), 0) : need, n = Math.min(has, part) / w;
      if (n > 0) { left[g] -= n; by[g] = n; need -= n * w; }
    }
    return [want - Math.max(0, need), by];
  }
  if (POOL_SHARE.has(id)) {
    const G = Object.entries(POOLS[id]), all = G.reduce((s, [g, w]) => s + (left[g] || 0) * w, 0), k = all > 0 ? Math.min(1, want / all) : 0;
    for (const [g, w] of G) { const n = (left[g] || 0) * k; if (n > 0) { left[g] -= n; by[g] = n; need -= n * w; } }
    return [want - Math.max(0, need), by];
  }
  for (const [g, w] of poolGoods(id)) {
    if (need <= 1e-12) break;
    const n = Math.min(left[g] || 0, need / w);
    if (n <= 0) continue;
    left[g] -= n; by[g] = n; need -= n * w;
  }
  return [want - Math.max(0, need), by];
}

// what a mine of a town digs, by good (data/townBuildings.js `dig`, ORE_GOODS): its `n` shared by how rich the cell of its
// work is in each ore it reaches (the town's own cell for a mine not placed yet; a cell rich in none — iron)
export function digOf(a, t, b) {
  const f = a?.f, site = (t.sites || []).map(id => a.sites?.[id - 1]).find(s => s?.alive && s.kind === b.id), i = site ? site.i : t.i;
  const w = Object.fromEntries(b.dig.ores.map(k => [k, Math.max(0, f?.[`ore_${k}`]?.[i] || 0)]));
  const sum = Object.values(w).reduce((s, v) => s + v, 0);
  return Object.fromEntries(b.dig.ores.map(k => [ORE_GOODS[k], b.dig.n * (sum > 0 ? w[k] / sum : k === 'iron' ? 1 : 0)]).filter(([, v]) => v > 0));
}

// the climate's weight on a town's heat: cold ×1.6 at or below TOWN_FLOW.heat.cold °C, warm ×0.4 at or above .warm, between
// the two in a line (the year's mean of the town's cell)
export function heatFactor(a, t) {
  const H = F.heat, c = a?.f?.temp ? a.f.temp[t.i] : (H.cold + H.warm) / 2;
  const x = Math.max(0, Math.min(1, (c - H.cold) / (H.warm - H.cold)));
  return H.k[0] + (H.k[1] - H.k[0]) * x;
}

export function townEconomy(a, t, heatK = heatFactor(a, t), imports = null) {
  const P = WORLD_PEOPLES.get(t.people), flows = P.flows || {}, swaps = P.swaps || {};
  // its place: more where it stands so (the dwarves under the mountain) — the world's place of the town (atlas/towns.js placeHas)
  const PF = P.placeFlows, here = PF && a?.f && PF.needsAny.some(n => (t.place ||= {})[n] ??= placeHas(a, t.i, n)) ? PF.flows : {};
  const free0 = t.pop * (P.hands ?? F.hands), slaves0 = (t.slaves || 0);
  let free = free0, slaves = slaves0;
  // the buildings, a row each with its count, in the order the hands go
  const count = {};
  for (const id of t.built) count[id] = (count[id] || 0) + 1;
  const rows = Object.entries(count).map(([id, n]) => ({b: TOWN_BUILDINGS.get(id), n}))
    .sort((p, q) => F.order.indexOf(p.b.cat) - F.order.indexOf(q.b.cat));
  // hands: slaves first, in at most `share` of the places; free ones for the rest
  // the dwarves' golems (atlas/golems.js): a unit a golem took over needs fewer hands and gives more by its metal
  for (const r of rows) { const l = (t.golems?.auto?.[r.b.id] || []).slice(0, r.n); r.golems = l.length; r.golemBonus = l.reduce((s, m) => s + (GOLEMS.bonus[m] || 0), 0) / r.n; }
  let jobs = 0;
  for (const r of rows) {
    const need = (r.b.jobs || 0) * (r.n - r.golems * (1 - GOLEMS.jobs)); jobs += need;
    if (!need) { r.staff = 1; continue; }
    const bySlaves = Math.min(slaves * F.slaves.work, need * F.slaves.share);
    slaves -= bySlaves / F.slaves.work;
    const byFree = Math.min(free, need - bySlaves);
    free -= byFree;
    r.staff = (bySlaves + byFree) / need;
    r.slaveShare = need ? bySlaves / need : 0;
  }
  // what a building takes (its people's swaps), of its pools (its `any`; heat × the climate and fire — the fuel) and gives
  // (× its people's flows)
  for (const r of rows) {
    r.in = {};
    for (const [g, v] of Object.entries(r.b.in || {})) { const s = swaps[g], to = s ? s.to : g; r.in[to] = (r.in[to] || 0) + v * (s ? s.k : 1) * r.n; }
    r.soft = new Set((r.b.soft || []).map(g => swapOf(P, g)[0]));   // what this building does without (as its people takes it)
    r.pool = Object.fromEntries(Object.entries(r.b.any || {}).map(([k, v]) => [k, v * r.n]));
    const fuel = ((r.b.heat || 0) * heatK + (r.b.fire || 0)) * r.n;
    if (fuel > 0) r.pool.fuel = (r.pool.fuel || 0) + fuel;
    const outs = r.b.dig ? {...digOf(a, t, r.b), ...(r.b.out || {})} : (r.b.out || {});   // a mine: the ores of its cell
    r.out = Object.fromEntries(Object.entries(outs).map(([g, v]) => [g, v * (flows[g] ?? 1) * (here[g] ?? 1) * r.n * (1 + r.golemBonus)]));
    r.own = !r.b.peoples || r.b.peoples.includes(t.people) ? 1 : F.captured;
    r.eff = r.staff * r.own;
  }
  // what a building boosts (data/townBuildings.js `boost`: the humans' compost heap): × (1 + share × the booster's strength)
  const boostOf = {};
  for (const r of rows) for (const [id, k] of Object.entries(r.b.boost || {})) boostOf[id] = (boostOf[id] || 0) + k * Math.min(1, r.staff * r.own);
  for (const r of rows) if (boostOf[r.b.id]) for (const g of Object.keys(r.out)) r.out[g] *= 1 + boostOf[r.b.id];
  // the boats of a shipyard (TOWN_FLOW.boats): its fishers catch more, as the yard works
  const yard = rows.find(r => r.b.id === F.boats.by), boat = r => (yard && F.boats.fish.includes(r.b.id) ? 1 + (F.boats.k - 1) * yard.eff : 1);
  // the goods shared out, a few rounds: each building's strength by what it got of what it takes; what the realm's other
  // towns sent (imports: atlas/economy.js tradeGoods) adds to what the town has
  // the herd's breeders: the store keeps TOWN_FLOW.herd.keep head for each pen at work — the slaughterhouse never has them
  const keepHerd = rows.filter(r => F.herd.at.includes(r.b.id)).reduce((s, r) => s + r.n * r.staff * r.own, 0) * F.herd.keep * S;
  let sup = {}, dem = {}, pgot = {};
  // the pools out of what the buildings' own `in` left: what each could have (pgot), by pool
  const pools = (u = null) => {
    const left = {};
    for (const [g, v] of Object.entries(sup)) left[g] = Math.max(0, v - (u ? u[g] || 0 : dem[g] || 0));
    const pdem = {}, out = {};
    for (const r of rows) for (const [id, v] of Object.entries(r.pool)) pdem[id] = (pdem[id] || 0) + v * (u ? r.use : r.staff * r.own);
    for (const id of POOL_IDS) { const want = pdem[id] || 0; out[id] = drawPool(id, want, left); }
    return {pdem, out};
  };
  // what a building makes of what it took of its pool (`yields`: the smelter's ores into their metals), by its share of the
  // pool's demand — worked out from the last round's draw, so a chain behind a smelter fills in over the rounds
  const yielders = rows.filter(r => r.b.yields);
  const yieldOut = (P, use) => {
    for (const r of yielders) r.yout = {};
    for (const [id, [, by]] of Object.entries(P.out)) {
      const ys = yielders.filter(r => r.pool[id]), all = ys.reduce((s, r) => s + r.pool[id] * use(r), 0);
      if (!all) continue;
      for (const r of ys) for (const [g, n] of Object.entries(by)) for (const [m, k] of Object.entries(r.b.yields[g] || {})) r.yout[m] = (r.yout[m] || 0) + n * k * r.pool[id] * use(r) / all * (flows[m] ?? 1) * (here[m] ?? 1);
    }
  };
  for (const r of yielders) r.yout = {};
  for (let k = 0; k < F.rounds; k++) {
    sup = {...(imports || {})}; dem = {};
    for (const r of yielders) for (const [g, v] of Object.entries(r.yout)) sup[g] = (sup[g] || 0) + v;
    for (const [g, v] of Object.entries(F.gather || {})) sup[g] = (sup[g] || 0) + v * t.pop;   // gathered by hand (brushwood)
    if (keepHerd > 0) sup.beasts = Math.max(0, (sup.beasts || 0) - keepHerd);
    for (const r of rows) {
      for (const [g, v] of Object.entries(r.out)) sup[g] = (sup[g] || 0) + v * r.eff * boat(r);
      for (const [g, v] of Object.entries(r.in)) dem[g] = (dem[g] || 0) + v * r.staff * r.own;
    }
    const got = g => (dem[g] ? Math.min(1, (sup[g] || 0) / dem[g]) : 1);
    const P0 = pools();
    pgot = Object.fromEntries(POOL_IDS.map(id => [id, P0.pdem[id] ? Math.min(1, P0.out[id][0] / P0.pdem[id]) : 1]));
    yieldOut(P0, r => r.staff * r.own);
    for (const r of rows) {
      if (r.b.cat === 'housing') { r.eff = r.staff * r.own; continue; }
      let m = 1;
      for (const g of Object.keys(r.in)) m = Math.min(m, soft(r, g) ? F.soft + (1 - F.soft) * got(g) : got(g));
      for (const id of Object.keys(r.pool)) m = Math.min(m, pgot[id]);
      r.eff = r.staff * r.own * m;
    }
  }
  const made = {}, used = {};
  for (const [g, v] of Object.entries(F.gather || {})) made[g] = v * t.pop;
  const got = g => (dem[g] ? Math.min(1, (sup[g] || 0) / dem[g]) : 1);
  for (const r of rows) {
    for (const [g, v] of Object.entries(r.out)) made[g] = (made[g] || 0) + v * r.eff * boat(r);
    // it uses what it got of a good, and no more than its strength lets it (housing: what it got — it is never stopped)
    for (const [g, v] of Object.entries(r.in)) used[g] = (used[g] || 0) + v * (r.b.cat === 'housing' ? r.staff * r.own * got(g) : Math.min(r.eff, r.staff * r.own * got(g)));
  }
  // the pools: each building uses its share as far as it works (housing: as far as there was), out of what the town has
  // of each good beyond its buildings' own use, the cheapest first; what a pool asked for goes into the demand of its
  // goods (what it did not get — of the cheapest), so a town short of fuel buys logs (atlas/treasury.js)
  for (const r of rows) r.use = r.b.cat === 'housing' ? r.staff * r.own : r.eff;
  const PU = pools(used), PA = pools();
  yieldOut(PU, r => r.use);
  for (const r of yielders) for (const [g, v] of Object.entries(r.yout)) made[g] = (made[g] || 0) + v;
  for (const id of POOL_IDS) {
    for (const [g, n] of Object.entries(PU.out[id][1])) used[g] = (used[g] || 0) + n;
    const [took, by] = PA.out[id], miss = (PA.pdem[id] || 0) - took;
    for (const [g, n] of Object.entries(by)) dem[g] = (dem[g] || 0) + n;
    if (miss > 1e-9) { const g = Object.keys(POOLS[id])[0], w = POOLS[id][g]; dem[g] = (dem[g] || 0) + miss / w; }   // (fuel: logs — a woodcutter or buying)
  }
  // short: the share of what the buildings asked for and did not get, by good
  const short = {};
  for (const [g, d] of Object.entries(dem)) { const s = 1 - Math.min(1, (sup[g] || 0) / d); if (s > F.shortAt) short[g] = s; }
  // spare: the share of what the town makes of a good that nothing of it takes (a building that would take it is worth more)
  const spare = {};
  for (const [g, v] of Object.entries(made)) { const s = v > 0 ? 1 - Math.min(1, (used[g] || 0) / v) : 0; if (s > F.shortAt) spare[g] = s; }
  const net = g => Math.max(0, (made[g] || 0) - (used[g] || 0));
  const food = net('food') + net('stores') + (P.eatsRaw || []).reduce((s, g) => s + net(g), 0);
  return {hands: free0 + slaves0 * F.slaves.work, freeHands: free, slavesIdle: slaves, jobs, made, used, short, spare, food, dem, pools: pgot, herd: {slaughtered: (used.beasts || 0) / S}, imports: imports || {}, boats: yard ? boat({b: {id: F.boats.fish[0]}}) : 1,
    feeds: food / (P.eat ?? 1), eat: P.eat ?? 1, rows: rows.map(r => ({id: r.b.id, n: r.n, staff: r.staff, eff: r.eff, slaves: r.slaveShare || 0, golems: r.golems}))};
}

// how each building of a town works this year (saved: its effects follow it, atlas/towns.js townFx)
export function keepWork(t) {
  t.work = Object.fromEntries(t.econ.rows.map(r => [r.id, Math.round(Math.min(1, r.eff) * 1000) / 1000]));
}
