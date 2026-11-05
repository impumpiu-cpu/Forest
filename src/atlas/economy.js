// A town's economy by its buildings' flows (docs/WORLD.md «Потоки построек»; the numbers: data/townBuildings.js — each
// building's `jobs`, `heat`, `in`, `out`, the goods TOWN_GOODS, the rules TOWN_FLOW; the people's `hands`, `eat`,
// `flows`, `swaps` in data/peoples.js). Once a season, before the town grows (atlas/peoples.js):
//   hands     — the town's grown ones (atlas/population.js) × its people's `hands`, and its slaves (t.slaves) at TOWN_FLOW.slaves.work each;
//               each building rents its `jobs` in TOWN_FLOW.order (food first): slaves first, up to `share` of its places,
//               free hands for the rest; what is short works at a share. A building gone gives its hands back
//   goods     — what the buildings give at their staffing (× the people's `flows`) is shared out between the buildings that
//               take it, round by round until the shares settle (at most `rounds`) (a good the people never takes is its `swaps` instead); without a hard good a
//               building stops, without a soft one (TOWN_GOODS `soft`, or the building's own `soft` list) it works at
//               TOWN_FLOW.soft; a building of another people (taken) works at TOWN_FLOW.captured. Housing takes its upkeep
//               and heat but is never stopped (people live in it). A building uses a good only as far as it works: one that
//               stands for want of leather does not burn its wood (the rest stays for the store)
//   herds     — the pens and pastures raise beasts (`out`), the slaughterhouse alone kills them (`in`) for meat, hides and
//               bone; the store keeps TOWN_FLOW.herd.keep head a pen at work for breeding, out of the slaughter's reach
//   workFlows — × what a building of its kind gives, by good (data/peoples.js `workFlows`: the greenskins' hunt and slaughter
//               give more meat, their fields and gardens less)
//   pools     — what a building takes of any of a set of goods (its `any`: a kitchen any raw food) and the fuel of its heat and
//               fire (data/townBuildings.js POOLS, FUEL) come out of what the buildings' own `in` left, the cheapest of the pool
//               first; short of it, it stops as for a hard good (housing: never)
//   food      — what the buildings give of ready food, less what the buildings take of it, in people-years (stores are kept
//               and traded as goods, eaten in a hungry year — atlas/peoples.js; raw
//               food is not eaten: the kitchens cook it — but by a people that eats it raw, data/peoples.js eatsRaw): the
//               town's people and slaves eat it at their people's `eat`
//   lights    — the town's people and the kinds it holds (townLights): what a recipe may be for (`req`)
//   recipes   — a building's recipes (`recipes`) for the town's people or kinds share the building's strength (its hands: a tier's,
//               however many recipes) by what the store holds of what each takes; one with nothing of it asks and gives its share
//               to the others
//   tools     — one stock of the town (TOWN_FLOW.tools a hand at work): what it has of them against that weighs on every work, soft
// The result is kept in t.econ (not saved — worked out anew each season) for the town's growth, its choices and its card.
import {ORE_KINDS} from '../data/worldLand.js';
import {TOWN_BUILDINGS, TOWN_GOODS, TOWN_FLOW as F, TOWN_MONEY, GOLEMS, POOLS, POOL_SHARE, POOL_PAIR, POOL_SOFT, ORE_GOODS, goodPrice, recipesOf} from '../data/townBuildings.js';
// (reqLit: who a recipe is for — its people or kind — against the town's lights)
import {reqLit} from '../data/townBuildings.js';
import {workNeeds} from '../data/requirements.js';
import {meets} from '../core/requirements.js';
import {townFacts} from './requirements.js';
import {handsOf} from './population.js';
import {WORLD_PEOPLES, swapOf, KIN, placeNeed} from '../data/peoples.js';
import {placeHas, townKin} from './towns.js';
import {SEASONS_PER_YEAR as S} from '../data/atlas.js';
import {onEdit} from '../data/schema/layer.js';

const soft = (r, g) => !!TOWN_GOODS.get(g).soft || r.soft.has(g);
// the goods of each pool, the cheapest a unit of its weight first (a log's charge before coal's)
const POOL_IDS = Object.keys(POOLS);
let poolSorted = new Map();
onEdit(() => { poolSorted = new Map(); });   // (a price or a pool edited: sorted again)
const poolGoods = id => poolSorted.get(id) || poolSorted.set(id, Object.entries(POOLS[id]).sort((p, q) => goodPrice(p[0]) / p[1] - goodPrice(q[0]) / q[1] || (p[0] < q[0] ? -1 : 1))).get(id);
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

// what a mine of a town gives, by good (data/townBuildings.js `dig`, ORE_GOODS: the metal of each ore): its `n` shared by how rich
// the cell of its work is in each ore it reaches (the town's own cell for a mine not placed yet; a cell rich in none — iron), and
// its `coal` charges of fuel × how rich the cell is in coal
export function digOf(a, t, b) {
  const f = a?.f, site = (t.sites || []).map(id => a.sites?.[id - 1]).find(s => s?.alive && s.kind === b.id), i = site ? site.i : t.i;
  const w = Object.fromEntries(b.dig.ores.map(k => [k, Math.max(0, f?.[`ore_${k}`]?.[i] || 0)]));
  // the knowledge of stone (data/peoples.js `stoneLore`: the dwarves): a rare ore anywhere within `reach` of the work is found —
  // they dig through the whole mountain for it — and counts × its `k` among what the mine gives
  const SL = WORLD_PEOPLES.get(t.people)?.stoneLore;
  if (SL && f) for (const k of b.dig.ores) if (SL.k[k]) {
    const x0 = i % a.w, y0 = (i / a.w) | 0, v = f[`ore_${k}`]; let m = w[k];
    if (v) for (let y = Math.max(0, y0 - SL.reach); y <= Math.min(a.h - 1, y0 + SL.reach); y++) for (let x = Math.max(0, x0 - SL.reach); x <= Math.min(a.w - 1, x0 + SL.reach); x++) m = Math.max(m, v[y * a.w + x] || 0);
    w[k] = m * SL.k[k];
  }
  const sum = Object.values(w).reduce((s, v) => s + v, 0);
  const out = Object.fromEntries(b.dig.ores.map(k => [ORE_GOODS[k], b.dig.n * (sum > 0 ? w[k] / sum : k === ORE_KINDS.mineFallback ? 1 : 0)]).filter(([, v]) => v > 0));
  const coal = b.dig.coal ? b.dig.coal * Math.max(0, Math.min(1, f?.ore_coal?.[i] || 0)) : 0;
  if (coal > 0) out.fuel = coal;
  return out;
}
// The lights of a town: its people, the kinds it holds (data/peoples.js KIN.least) → Set — what a recipe may ask for (its `req`)
export function townLights(a, t) {
  const lit = new Set([`people:${t.people}`]);
  const K = a?.f || t.kin ? townKin(a, t) : null;
  for (const [k, v] of Object.entries(K || {})) if (v >= KIN.least) lit.add(`kin:${k}`);
  return lit;
}

// A town unfolded for a visit (campaign/town.js: the caravan at its market): its people and kinds (`lit`), the recipes that run —
// for its people or kind, and with what they take in the store or made by its own works — and the goods its works make (its
// buildings' own `out`, their running recipes', the metals of its mines). Worked out once, when asked, from the saved town alone
// (its buildings, its store, its last season's work — a recipe that ran on what the town bought runs still): the world's flows
// are not run for it → {lit: Set, recipes: [id], works: [building id], makes: Set}
export function townUnfold(a, t) {
  const lit = townLights(a, t), stock = t.stock || {}, built = [...new Set(t.built)].map(id => TOWN_BUILDINGS.get(id));
  const hard = (b, q) => Object.keys(q.in || {}).filter(g => !TOWN_GOODS.get(g).soft && !(b.soft || []).includes(g));
  let recipes = [], makes = new Set(), works = built.map(b => b.id);
  // a few passes, as the season's rounds: what the works make feeds the recipes behind them (a mine's iron, the forge), until
  // nothing new is made
  for (let k = 0; k < TOWN_FLOW_PASSES; k++) {
    const has = g => (stock[g] || 0) > TOWN_MONEY.dust || makes.has(g);
    const R = [], M = new Set();
    for (const b of built) {
      for (const g of Object.keys(b.out || {})) M.add(g);
      if (b.dig) for (const g of Object.keys(digOf(a, t, b))) M.add(g);
      for (const g of Object.values(b.yields || {}).flatMap(o => Object.keys(o))) M.add(g);
      // (a recipe that ran last season — on what the town bought, atlas/treasury.js — runs still; else by its people and what it takes)
      for (const q of recipesOf(b)) if ((t.work?.[`${b.id}:${q.id}`] || 0) > 0 || (reqLit(q.req, lit) && hard(b, q).every(has))) { R.push(`${b.id}:${q.id}`); for (const g of Object.keys(q.out || {})) M.add(g); }
    }
    const same = R.length === recipes.length && M.size === makes.size;
    recipes = R; makes = M;
    if (same) break;
  }
  return {lit, recipes, makes, works};
}
const TOWN_FLOW_PASSES = 5;

// the climate's weight on a town's heat: cold ×1.6 at or below TOWN_FLOW.heat.cold °C, warm ×0.4 at or above .warm, between
// the two in a line (the year's mean of the town's cell)
export function heatFactor(a, t) {
  const H = F.heat, c = a?.f?.temp ? a.f.temp[t.i] : (H.cold + H.warm) / 2;
  const x = Math.max(0, Math.min(1, (c - H.cold) / (H.warm - H.cold)));
  return H.k[0] + (H.k[1] - H.k[0]) * x;
}

// A town's works this season, in two halves: what does not change within the season — the rows of its buildings and recipes,
// their hands, what each takes and gives (prepEconomy) — and the sharing out of the goods with what the store lends
// (townEconomy). The treasury asks twice a season, before and after the buying between towns (atlas/treasury.js
// seasonMoney): the second time only the store has changed, so the first half is given again (`prep`).
export function prepEconomy(a, t, heatK = heatFactor(a, t)) {
  const P = WORLD_PEOPLES.get(t.people), flows = P.flows || {}, swaps = P.swaps || {}, wf = P.workFlows || {};
  // its place: more where it stands so (the dwarves under the mountain) — the world's place of the town (atlas/towns.js placeHas)
  const PF = P.placeFlows, here = PF && a?.f && PF.needsAny.map(n => placeNeed(t.people, n)).some(n => (t.place ||= {})[n] ??= placeHas(a, t.i, n)) ? PF.flows : {};
  const free0 = handsOf(a, t), slaves0 = (t.slaves || 0);   // (the young and the old do not work: atlas/population.js)
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
    for (const [g, v] of Object.entries(r.b.in || {})) { const s = P.workSwaps?.[r.b.id]?.[g] || swaps[g], to = s ? s.to : g; r.in[to] = (r.in[to] || 0) + v * (s ? s.k : 1) * r.n; }   // (workSwaps: this building's own — data/peoples.js)
    r.soft = new Set((r.b.soft || []).map(g => swapOf(P, g)[0]));   // what this building does without (as its people takes it)
    r.pool = Object.fromEntries(Object.entries(r.b.any || {}).map(([k, v]) => [k, v * r.n]));
    const fuel = ((r.b.heat || 0) * heatK + (r.b.fire || 0)) * r.n;
    if (fuel > 0) r.pool.fuel = (r.pool.fuel || 0) + fuel;
    const outs = r.b.dig ? {...digOf(a, t, r.b), ...(r.b.out || {})} : (r.b.out || {});   // a mine: the metals of its cell
    r.out = Object.fromEntries(Object.entries(outs).map(([g, v]) => [g, v * (flows[g] ?? 1) * (wf[r.b.id]?.[g] ?? 1) * (here[g] ?? 1) * r.n * (1 + r.golemBonus)]));
    r.own = !r.b.peoples || r.b.peoples.includes(t.people) ? 1 : F.captured;
    r.share = 1; r.eff = r.staff * r.own;
  }
  // the recipes: a row each, of its building's hands (`of`), its share of the building's strength worked out each round;
  // a recipe not for this town's people or kinds is not a row
  const lit0 = townLights(a, t), recRows = [];
  for (const r of rows) for (const q of recipesOf(r.b)) {
    if (!reqLit(q.req, lit0)) continue;
    const x = {b: {id: `${r.b.id}:${q.id}`, cat: r.b.cat, peoples: r.b.peoples}, q, of: r, n: r.n, staff: r.staff, own: r.own, share: 0, eff: 0, golems: 0, golemBonus: r.golemBonus};
    x.in = {}; for (const [g, v] of Object.entries(q.in || {})) { const s = swaps[g], to = s ? s.to : g; x.in[to] = (x.in[to] || 0) + v * (s ? s.k : 1) * r.n; }
    x.soft = r.soft; x.hard = Object.keys(x.in).filter(g => !soft(r, g)); x.pool = {}; if (q.any) for (const [k, v] of Object.entries(q.any)) x.pool[k] = v * r.n;   // (hard: the goods of its `in` it cannot do without — asked each round)
    if (q.fire) x.pool.fuel = q.fire * r.n;
    x.out = Object.fromEntries(Object.entries(q.out || {}).map(([g, v]) => [g, v * (flows[g] ?? 1) * (wf[r.b.id]?.[g] ?? 1) * (here[g] ?? 1) * r.n * (1 + r.golemBonus)]));
    recRows.push(x);
  }
  rows.push(...recRows);
  // what a building boosts (data/townBuildings.js `boost`: the humans' compost heap): × (1 + share × the booster's strength)
  const boostOf = {};
  for (const r of rows) for (const [id, k] of Object.entries(r.b.boost || {})) boostOf[id] = (boostOf[id] || 0) + k * Math.min(1, r.staff * r.own);
  for (const r of rows) if (boostOf[r.b.id]) for (const g of Object.keys(r.out)) r.out[g] *= 1 + boostOf[r.b.id];
  // the boats of a shipyard (TOWN_FLOW.boats): its fishers catch more, as the yard works
  const yard = rows.find(r => r.b.id === F.boats.by), boat = r => (yard && (r.fish ?? F.boats.fish.includes(r.b.id)) ? 1 + (F.boats.k - 1) * yard.eff : 1);
  // (what each row takes, gives and draws, as lists made once: the rounds below walk them many times; the same order as the rows' own)
  for (const r of rows) {
    r.outE = Object.entries(r.out); r.inE = Object.entries(r.in); r.poolE = Object.entries(r.pool);
    r.inSoft = r.inE.map(([g]) => soft(r.of || r, g)); r.poolSoft = r.poolE.map(([id]) => POOL_SOFT.has(id)); r.fish = F.boats.fish.includes(r.b.id);
  }
  // the goods shared out, a few rounds: each building's strength by what it got of what it takes; what the realm's other
  // towns sent (imports: atlas/economy.js tradeGoods) adds to what the town has
  // the town's tools (TOWN_FLOW.tools): one stock, so many a year for each hand at work in its works — a coefficient on every work
  const toolsNeed = rows.filter(r => !r.of && r.b.cat !== 'housing').reduce((s, r) => s + (r.b.jobs || 0) * r.n * r.staff, 0) * (F.tools?.perHand || 0);
  return {P, flows, here, free0, slaves0, free, slaves, rows, jobs, lit0, recRows, yard, boat, toolsNeed};
}

export function townEconomy(a, t, heatK = heatFactor(a, t), imports = null, prep = prepEconomy(a, t, heatK)) {
  const {P, flows, here, free0, slaves0, free, slaves, rows, jobs, lit0, recRows, yard, boat, toolsNeed} = prep;
  // (what a run changes in the rows starts as the first half left it: a prep given again runs as a fresh one)
  for (const r of rows) { if (r.of) { r.share = 0; r.eff = 0; } else { r.share = 1; r.eff = r.staff * r.own; } }
  let sup = {}, dem = {}, pgot = {};
  // the pools out of what the buildings' own `in` left: what each could have (pgot), by pool
  const pools = (u = null) => {
    const left = {};
    for (const [g, v] of Object.entries(sup)) left[g] = Math.max(0, v - (u ? u[g] || 0 : dem[g] || 0));
    const pdem = {}, out = {};
    for (const r of rows) for (const [id, v] of r.poolE) pdem[id] = (pdem[id] || 0) + v * (u ? r.use : r.staff * r.own * r.share);
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
  // the shares of the recipes of a building: they share its strength by what the store holds of what each takes (a recipe
  // that takes nothing of the store — as one that has all it takes); one that has none of it runs at nothing and takes no
  // share — it only asks (`ask`: TOWN_FLOW.recipeFloor of what it would take goes into the demand, so the town buys or builds
  // for it)
  const shareOut = () => {
    const avail = g => (dem[g] ? Math.min(1, (sup[g] || 0) / dem[g]) : (sup[g] || 0) > TOWN_MONEY.dust ? 1 : 0);
    const by = new Map();
    for (const x of recRows) {
      let w = 1; for (const g of x.hard) w = Math.min(w, avail(g));
      x.w = w; x.ask = w <= 0;
      by.set(x.of, (by.get(x.of) || 0) + x.w);
    }
    for (const x of recRows) x.share = x.w > 0 ? x.w / by.get(x.of) : 0;
  };
  // the rounds: until no row's strength moves by TOWN_FLOW.settle, at most TOWN_FLOW.rounds (a chain of three works — logs, charcoal,
  // wares — settles in three; a town of no chains in one or two)
  let toolK = 1, asked = {};
  const facts = townFacts(a, t);
  for (let k = 0; k < F.rounds; k++) {
    shareOut();
    sup = {...(imports || {})}; dem = {}; asked = {};
    for (const r of yielders) for (const [g, v] of Object.entries(r.yout)) sup[g] = (sup[g] || 0) + v;
    for (const [g, v] of Object.entries(F.gather || {})) sup[g] = (sup[g] || 0) + v * t.pop;   // gathered by hand (brushwood)
    for (const r of rows) {
      for (const [g, v] of r.outE) sup[g] = (sup[g] || 0) + v * r.eff * boat(r);
      for (const [g, v] of r.inE) dem[g] = (dem[g] || 0) + v * r.staff * r.own * (r.ask ? F.recipeFloor : r.share);
      if (r.ask) for (const [g, v] of r.inE) asked[g] = (asked[g] || 0) + v * r.staff * r.own * F.recipeFloor;   // (of it, the asks: for the reports)
    }
    if (toolsNeed > 0) dem.tools = (dem.tools || 0) + toolsNeed;   // the town's tools: one ask for all its works
    const got = g => (dem[g] ? Math.min(1, (sup[g] || 0) / dem[g]) : 1);
    toolK = toolsNeed > 0 ? F.soft + (1 - F.soft) * got('tools') : 1;
    const P0 = pools();
    pgot = Object.fromEntries(POOL_IDS.map(id => [id, P0.pdem[id] ? Math.min(1, P0.out[id][0] / P0.pdem[id]) : 1]));
    yieldOut(P0, r => r.staff * r.own);
    let moved = 0;
    for (const r of rows) {
      const was = r.eff;
      if (r.b.cat === 'housing') { r.eff = r.staff * r.own; continue; }
      let m = toolK;
      for (let k = 0; k < r.inE.length; k++) { const g = r.inE[k][0]; m = Math.min(m, r.inSoft[k] ? F.soft + (1 - F.soft) * got(g) : got(g)); }
      for (let k = 0; k < r.poolE.length; k++) { const id = r.poolE[k][0]; m = Math.min(m, r.poolSoft[k] ? F.soft + (1 - F.soft) * pgot[id] : pgot[id]); }
      if (r.b.workNeed && !meets(workNeeds(r.b, false), facts)) m = 0;   // a work of `workNeed` (none in the table now)
      // a recipe: its share of what its building works at
      r.eff = r.of ? r.share * Math.min(r.of.eff, r.staff * r.own * m) : r.staff * r.own * m;
      moved = Math.max(moved, Math.abs(r.eff - was));
    }
    // settled: no strength moved
    if (k > 0 && moved < F.settle) break;
  }
  const made = {}, used = {};
  for (const [g, v] of Object.entries(F.gather || {})) made[g] = v * t.pop;
  const got = g => (dem[g] ? Math.min(1, (sup[g] || 0) / dem[g]) : 1);
  if (toolsNeed > 0) used.tools = toolsNeed * got('tools');   // (the town's tools: worn as far as there were any)
  for (const r of rows) {
    for (const [g, v] of r.outE) made[g] = (made[g] || 0) + v * r.eff * boat(r);
    // it uses what it got of a good, and no more than its strength lets it (housing: what it got — it is never stopped)
    for (const [g, v] of r.inE) used[g] = (used[g] || 0) + v * (r.b.cat === 'housing' ? r.staff * r.own * got(g) : Math.min(r.eff, r.staff * r.own * r.share * got(g)));
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
  // a work that lives by its recipes alone (a forge, a larder: no `out` of its own) works as far as they do
  const own = rows.filter(r => !r.of);
  for (const r of own) if (recipesOf(r.b).length && !Object.keys(r.out).length && !r.b.yields) r.eff = Math.min(r.eff, recRows.filter(x => x.of === r).reduce((s, x) => s + x.eff, 0));
  return {hands: free0 + slaves0 * F.slaves.work, freeHands: free, slavesIdle: slaves, jobs, made, used, short, spare, asked, food, dem, pools: pgot, tools: toolK, imports: imports || {}, boats: yard ? boat({b: {id: F.boats.fish[0]}}) : 1,
    feeds: food / (P.eat ?? 1), eat: P.eat ?? 1, lit: [...lit0].sort(),
    rows: own.map(r => ({id: r.b.id, n: r.n, staff: r.staff, eff: r.eff, slaves: r.slaveShare || 0, golems: r.golems, gave: Object.fromEntries(Object.entries(r.out).map(([g, v]) => [g, v * r.eff * boat(r)]))})),
    recipes: recRows.map(x => ({id: x.b.id, of: x.of.b.id, name: x.q.name, on: x.w > 0 || !!x.ask, share: x.share, eff: x.eff, gave: Object.fromEntries(Object.entries(x.out).map(([g, v]) => [g, v * x.eff]))}))};
}

// how each building of a town works this year (saved: its effects follow it, atlas/towns.js townFx)
export function keepWork(t) {
  t.work = Object.fromEntries(t.econ.rows.map(r => [r.id, Math.round(Math.min(1, r.eff) * 1000) / 1000]));
  // and its recipes, as their share of the building's strength they worked at (the dens' beasts read it: atlas/beasts.js)
  for (const x of t.econ.recipes || []) t.work[x.id] = Math.round(Math.min(1, x.eff) * 1000) / 1000;
}
