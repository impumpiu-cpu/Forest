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
//   food      — what the buildings give of ready food, less what the buildings take of it, in people-years (stores are kept
//               and traded as goods, eaten in a hungry year — atlas/peoples.js; raw
//               food is not eaten: the kitchens cook it — but by a people that eats it raw, data/peoples.js eatsRaw): the
//               town's people and slaves eat it at their people's `eat`
//   indicators — what the town has, as flags (data/townBuildings.js INDICATORS): its buildings' `opens`, its people, the kinds it
//               holds, and the goods of its store and of what is made (`stock:<good>` — so what was brought in lights them too)
//   recipes   — a building's recipes (`recipes`) run while their indicators are lit; those that run share the building's strength
//               (its hands: a tier's, however many recipes) by what the store holds of what each takes; a recipe gone dark gives its
//               share to the others
// The result is kept in t.econ (not saved — worked out anew each season) for the town's growth, its choices and its card.
import {TOWN_BUILDINGS, TOWN_GOODS, TOWN_FLOW as F, TOWN_MONEY, GOLEMS, POOLS, POOL_SHARE, POOL_PAIR, POOL_SOFT, ORE_GOODS, goodPrice, recipesOf, reqLit} from '../data/townBuildings.js';
import {WORLD_PEOPLES, swapOf, KIN} from '../data/peoples.js';
import {placeHas, townKin} from './towns.js';
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
// work is in each ore it reaches (the town's own cell for a mine not placed yet; a cell rich in none — iron), and its `coal`
// charges of fuel × how rich the cell is in coal
export function digOf(a, t, b) {
  const f = a?.f, site = (t.sites || []).map(id => a.sites?.[id - 1]).find(s => s?.alive && s.kind === b.id), i = site ? site.i : t.i;
  const w = Object.fromEntries(b.dig.ores.map(k => [k, Math.max(0, f?.[`ore_${k}`]?.[i] || 0)]));
  const sum = Object.values(w).reduce((s, v) => s + v, 0);
  const out = Object.fromEntries(b.dig.ores.map(k => [ORE_GOODS[k], b.dig.n * (sum > 0 ? w[k] / sum : k === 'iron' ? 1 : 0)]).filter(([, v]) => v > 0));
  const coal = b.dig.coal ? b.dig.coal * Math.max(0, Math.min(1, f?.ore_coal?.[i] || 0)) : 0;
  if (coal > 0) out.fuel = coal;
  return out;
}
// what a work gives where the place decides it (`placeOut`: the quarry's stone on slopes, its clay in the flood plain) — of its
// `out` only the goods its place has (the town's cell; none of them — all of its `out`, so it is never built for nothing)
function placeOutOf(a, t, b) {
  const pk = t.place ||= {}, has = n => (a?.f ? (pk[n] ??= placeHas(a, t.i, n)) : true);
  const keep = Object.entries(b.out || {}).filter(([g]) => !b.placeOut[g] || has(b.placeOut[g]));
  return Object.fromEntries(keep.length ? keep : Object.entries(b.out || {}));
}
// The indicators of a town that do not change in a season: its buildings' `opens` (a recipe's only while it runs — added by
// townEconomy), its people, the kinds it holds (data/peoples.js KIN.least) → Set
export function townLights(a, t) {
  const lit = new Set([`people:${t.people}`]);
  for (const id of new Set(t.built)) for (const o of TOWN_BUILDINGS.get(id).opens || []) lit.add(o);
  const K = a?.f || t.kin ? townKin(a, t) : null;
  for (const [k, v] of Object.entries(K || {})) if (v >= KIN.least) lit.add(`kin:${k}`);
  return lit;
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
    const outs = r.b.dig ? {...digOf(a, t, r.b), ...(r.b.out || {})} : r.b.placeOut ? placeOutOf(a, t, r.b) : (r.b.out || {});   // a mine: the ores of its cell
    r.out = Object.fromEntries(Object.entries(outs).map(([g, v]) => [g, v * (flows[g] ?? 1) * (here[g] ?? 1) * r.n * (1 + r.golemBonus)]));
    r.own = !r.b.peoples || r.b.peoples.includes(t.people) ? 1 : F.captured;
    r.share = 1; r.eff = r.staff * r.own;
  }
  // the recipes: a row each, of its building's hands (`of`), its share of the building's strength worked out each round
  const lit0 = townLights(a, t), recRows = [];
  for (const r of rows) for (const q of recipesOf(r.b)) {
    const x = {b: {id: `${r.b.id}:${q.id}`, cat: r.b.cat, peoples: r.b.peoples}, q, of: r, n: r.n, staff: r.staff, own: r.own, share: 0, eff: 0, golems: 0, golemBonus: r.golemBonus};
    x.in = {}; for (const [g, v] of Object.entries(q.in || {})) { const s = swaps[g], to = s ? s.to : g; x.in[to] = (x.in[to] || 0) + v * (s ? s.k : 1) * r.n; }
    x.soft = r.soft; x.pool = {}; if (q.any) for (const [k, v] of Object.entries(q.any)) x.pool[k] = v * r.n;
    if (q.fire) x.pool.fuel = q.fire * r.n;
    x.out = Object.fromEntries(Object.entries(q.out || {}).map(([g, v]) => [g, v * (flows[g] ?? 1) * (here[g] ?? 1) * r.n * (1 + r.golemBonus)]));
    recRows.push(x);
  }
  rows.push(...recRows);
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
    for (const r of rows) for (const [id, v] of Object.entries(r.pool)) pdem[id] = (pdem[id] || 0) + v * (u ? r.use : r.staff * r.own * r.share);
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
  // the town's indicators this round: the fixed ones, and the goods it has (stock and made, of the last round)
  let lit = new Set(lit0);
  const litOf = () => { const L = new Set(lit0); for (const [g, v] of Object.entries(sup)) if (v > TOWN_MONEY.dust) L.add(`stock:${g}`); return L; };
  // the shares of the recipes of a building: those lit share its strength by what the store holds of what each takes (a recipe
  // that takes nothing of the store — as one that has all it takes); a building of `req` (the steelworks) stands while it is dark
  const shareOut = () => {
    const avail = g => (dem[g] ? Math.min(1, (sup[g] || 0) / dem[g]) : (sup[g] || 0) > TOWN_MONEY.dust ? 1 : 0);
    const by = new Map();
    for (const x of recRows) {
      const on = reqLit(x.q.req, lit), ins = Object.keys(x.in).filter(g => !soft(x.of, g));
      x.w = on ? Math.max(F.recipeFloor, ins.length ? Math.min(...ins.map(avail)) : 1) : 0;
      by.set(x.of, (by.get(x.of) || 0) + x.w);
    }
    for (const x of recRows) x.share = x.w > 0 ? x.w / by.get(x.of) : 0;
  };
  for (let k = 0; k < F.rounds; k++) {
    if (k > 0) { lit = litOf(); shareOut(); } else shareOut();
    sup = {...(imports || {})}; dem = {};
    for (const r of yielders) for (const [g, v] of Object.entries(r.yout)) sup[g] = (sup[g] || 0) + v;
    for (const [g, v] of Object.entries(F.gather || {})) sup[g] = (sup[g] || 0) + v * t.pop;   // gathered by hand (brushwood)
    if (keepHerd > 0) sup.beasts = Math.max(0, (sup.beasts || 0) - keepHerd);
    for (const r of rows) {
      for (const [g, v] of Object.entries(r.out)) sup[g] = (sup[g] || 0) + v * r.eff * boat(r);
      for (const [g, v] of Object.entries(r.in)) dem[g] = (dem[g] || 0) + v * r.staff * r.own * r.share;
    }
    const got = g => (dem[g] ? Math.min(1, (sup[g] || 0) / dem[g]) : 1);
    const P0 = pools();
    pgot = Object.fromEntries(POOL_IDS.map(id => [id, P0.pdem[id] ? Math.min(1, P0.out[id][0] / P0.pdem[id]) : 1]));
    yieldOut(P0, r => r.staff * r.own);
    for (const r of rows) {
      if (r.b.cat === 'housing') { r.eff = r.staff * r.own; continue; }
      let m = 1;
      for (const g of Object.keys(r.in)) m = Math.min(m, soft(r.of || r, g) ? F.soft + (1 - F.soft) * got(g) : got(g));
      for (const id of Object.keys(r.pool)) m = Math.min(m, POOL_SOFT.has(id) ? F.soft + (1 - F.soft) * pgot[id] : pgot[id]);
      if (r.b.req && !reqLit(r.b.req, lit)) m = 0;   // a work of `req` (the steelworks: iron ingots in the store)
      // a recipe: its share of what its building works at (the building's own goods — its tools — weigh on it too)
      r.eff = r.of ? r.share * Math.min(r.of.eff, r.staff * r.own * m) : r.staff * r.own * m;
    }
  }
  const made = {}, used = {};
  for (const [g, v] of Object.entries(F.gather || {})) made[g] = v * t.pop;
  const got = g => (dem[g] ? Math.min(1, (sup[g] || 0) / dem[g]) : 1);
  for (const r of rows) {
    for (const [g, v] of Object.entries(r.out)) made[g] = (made[g] || 0) + v * r.eff * boat(r);
    // it uses what it got of a good, and no more than its strength lets it (housing: what it got — it is never stopped)
    for (const [g, v] of Object.entries(r.in)) used[g] = (used[g] || 0) + v * (r.b.cat === 'housing' ? r.staff * r.own * got(g) : Math.min(r.eff, r.staff * r.own * r.share * got(g)));
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
    if (miss > 1e-9 && !POOL_SOFT.has(id)) { const g = Object.keys(POOLS[id])[0], w = POOLS[id][g]; dem[g] = (dem[g] || 0) + miss / w; }   // (fuel: logs — a woodcutter or buying; a soft pool asks for nothing it misses)
  }
  // short: the share of what the buildings asked for and did not get, by good
  const short = {};
  for (const [g, d] of Object.entries(dem)) { const s = 1 - Math.min(1, (sup[g] || 0) / d); if (s > F.shortAt) short[g] = s; }
  // spare: the share of what the town makes of a good that nothing of it takes (a building that would take it is worth more)
  const spare = {};
  for (const [g, v] of Object.entries(made)) { const s = v > 0 ? 1 - Math.min(1, (used[g] || 0) / v) : 0; if (s > F.shortAt) spare[g] = s; }
  const net = g => Math.max(0, (made[g] || 0) - (used[g] || 0));
  const food = net('food') + (P.eatsRaw || []).reduce((s, g) => s + net(g), 0);   // (stores go to the store: a hungry year eats them, atlas/peoples.js)
  // the indicators at the end of the season: the recipes that ran light theirs too
  const lights = litOf();
  for (const x of recRows) if (x.eff > 1e-6) for (const o of x.q.opens || []) lights.add(o);
  // a work that lives by its recipes alone (a smelter, a forge, a brewery: no `out` of its own) works as far as they do
  const own = rows.filter(r => !r.of);
  for (const r of own) if (recipesOf(r.b).length && !Object.keys(r.out).length && !r.b.yields) r.eff = Math.min(r.eff, recRows.filter(x => x.of === r).reduce((s, x) => s + x.eff, 0));
  return {hands: free0 + slaves0 * F.slaves.work, freeHands: free, slavesIdle: slaves, jobs, made, used, short, spare, food, dem, pools: pgot, herd: {slaughtered: (used.beasts || 0) / S}, imports: imports || {}, boats: yard ? boat({b: {id: F.boats.fish[0]}}) : 1,
    feeds: food / (P.eat ?? 1), eat: P.eat ?? 1, lit: [...lights].sort(),
    rows: own.map(r => ({id: r.b.id, n: r.n, staff: r.staff, eff: r.eff, slaves: r.slaveShare || 0, golems: r.golems})),
    recipes: recRows.map(x => ({id: x.b.id, of: x.of.b.id, name: x.q.name, on: x.w > 0, share: x.share, eff: x.eff}))};
}

// how each building of a town works this year (saved: its effects follow it, atlas/towns.js townFx)
export function keepWork(t) {
  t.work = Object.fromEntries(t.econ.rows.map(r => [r.id, Math.round(Math.min(1, r.eff) * 1000) / 1000]));
  // and its recipes, as their share of the building's strength they worked at (the dens' beasts read it: atlas/beasts.js)
  for (const x of t.econ.recipes || []) t.work[x.id] = Math.round(Math.min(1, x.eff) * 1000) / 1000;
}
