// The money of the world and the reasons of the lack, counted — and nothing in the game changed (the first step of the market's
// reworking, docs/TODO.md: measure before changing). One world's history, season by season:
//   the purses — every purse of the world summed (the towns' treasuries, their people's and makers', the realms' grants kept, the
//     realms' treasuries; the purses of the fallen towns and realms apart), and the ledger of what came into the world and left it
//     (atlas/treasury.js MONEY): the sum must move by what came in less what went out — `drift` is what it did not account for
//   the reasons — what the people (basic, comfort) and the works were left lacking, in gold at the goods' prices, laid on: money
//     (the seller had it, the buyer could not pay), route (a weak link did not carry it), goods (nobody it deals with had it)
//     (atlas/treasury.js t.econ.why); the people's purse against what their basic needs cost at home
//   the prices — the market's prices as they stand (atlas/treasury.js setPrices): how many goods stand off 1, how dear, how many
//     at the bounds, and how far they still are from where the season's pressure points (gap)
// `node tools/money-probe.mjs [seed] [size] [std|start]` → JSON on stdout, a summary on stderr
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {TOWN_MONEY as M, goodPrice} from '../src/data/townBuildings.js';
import {MONEY, resetMoney} from '../src/atlas/treasury.js';

const seed = process.argv[2] || 'start376615', size = process.argv[3] || 'small', mode = process.argv[4] || 'std';
if (mode === 'start') for (const P of WORLD_PEOPLES.all()) P.era = 'elder';
resetMoney();
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const PE = WORLD_PEOPLES.all().map(P => P.id);
const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
const price = g => { try { return goodPrice(g) || 0; } catch (e) { return 0; } };
const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };

// ── the purses of the world, by holder
function purses() {
  const o = {treasury: 0, people: 0, makers: 0, grants: 0, budgets: 0, realms: 0, fallen: 0};
  for (const t of a.towns || []) {
    const bud = Object.values(t.budget || {}).reduce((s, B) => s + (B.gold || 0), 0);   // (the realm's gold given for buying: atlas/townNeeds.js)
    const v = (t.gold || 0) + (t.peopleGold || 0) + (t.makersGold || 0) + (t.grant || 0) + bud;
    if (!t.alive) { o.fallen += v; continue; }
    o.treasury += t.gold || 0; o.people += t.peopleGold || 0; o.makers += t.makersGold || 0; o.grants += t.grant || 0; o.budgets += bud;
  }
  for (const r of a.realms || []) { if (r.fallen != null) o.fallen += r.gold || 0; else o.realms += r.gold || 0; }
  o.all = Object.values(o).reduce((s, v) => s + v, 0);
  return o;
}
const ledger = () => ({in: {...MONEY.in}, out: {...MONEY.out}});
const delta = (A, B) => { const o = {}; for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) o[k] = (B[k] || 0) - (A[k] || 0); return o; };
const sum = o => Object.values(o).reduce((s, v) => s + v, 0);

// ── a season's reasons and prices, summed into the year's tally by people
const zero = () => Object.fromEntries([...PE, 'all'].map(p => [p, {}]));
let acc = zero(), seasons = 0;
function seasonTally() {
  seasons++;
  for (const t of (a.towns || []).filter(x => x.alive && x.econ?.why)) {
    const W = t.econ.why, e = t.econ, T = [acc[t.people] ||= {}, acc.all];
    const put = (k, v) => { for (const o of T) add(o, k, v); };
    put('towns', 1);
    // the circuit of the season (t.trade, in gold): what the makers took in — from the people, other towns, merchants, works —
    // and paid out — wages, what their works bought, taxes; and what the wages owed went unpaid (in the rows: gold a year for 100 people)
    for (const k of ['people', 'imported', 'sold', 'bought', 'merchants', 'works', 'wages', 'owed', 'tax', 'upkeep']) put('$' + k, t.trade?.[k] || 0);
    // the reasons, in gold at the goods' prices
    const lay = (pre, R) => { for (const [g, r] of Object.entries(R?.by || {})) { const p = price(g); put(pre + 'want', r.want * p); put(pre + 'left', r.left * p); put(pre + 'money', r.money * p); put(pre + 'route', r.route * p); put(pre + 'goods', r.goods * p); } };
    lay('b.', W.people?.basic); lay('c.', W.people?.comfort); lay('w.', W.works);
    // the people's purse against what their basic needs cost at home: a town whose people could not pay for them all
    const B = W.people?.basic;
    if (B?.cost > 0) { put('poorTowns', B.gold < B.cost ? 1 : 0); put('purseCover', Math.min(3, B.gold / B.cost)); put('coverN', 1); }
    // the prices: how many goods stand off 1, how dear they stand, how many at the bounds, and how far each still has to go
    for (const [g, k] of Object.entries(t.market || {})) {
      put('prices', 1); put('pk', k); if (k >= M.price.hi - 1e-9) put('phi', 1); if (k <= M.price.lo + 1e-9) put('plo', 1);
      const to = W.price?.[g]?.to; if (to != null) put('pgap', Math.abs(to - k));
    }
  }
}
function yearRow() {
  const out = {};
  for (const p of [...PE, 'all']) {
    const o = acc[p] || {}, S = Math.max(1, seasons), live = (a.towns || []).filter(t => t.alive && (p === 'all' || t.people === p));
    const pop = live.reduce((s, t) => s + t.pop, 0);
    const share = (pre, k) => r3((o[pre + k] || 0) / Math.max(1e-9, o[pre + 'left'] || 0));
    const part = pre => ({want: r1((o[pre + 'want'] || 0) / S), left: r3((o[pre + 'left'] || 0) / Math.max(1e-9, o[pre + 'want'] || 0)),
      money: share(pre, 'money'), route: share(pre, 'route'), goods: share(pre, 'goods')});
    out[p] = {pop: Math.round(pop), towns: live.length, gold100: r1(live.reduce((s, t) => s + (t.gold || 0) + (t.peopleGold || 0) + (t.makersGold || 0) + (t.grant || 0), 0) / Math.max(1, pop) * 100),
      circuit: Object.fromEntries(['people', 'imported', 'sold', 'bought', 'merchants', 'works', 'wages', 'owed', 'tax', 'upkeep'].map(k => [k, r1((o['$' + k] || 0) / Math.max(1, pop) * 100)])),
      basic: part('b.'), comfort: part('c.'), works: part('w.'),
      poorTowns: r3((o.poorTowns || 0) / Math.max(1, o.coverN || 0)), purseCover: r3((o.purseCover || 0) / Math.max(1, o.coverN || 0)),
      prices: {n: Math.round((o.prices || 0) / S), k: r3((o.pk || 0) / Math.max(1, o.prices || 0)), hi: r3((o.phi || 0) / Math.max(1, o.prices || 0)), lo: r3((o.plo || 0) / Math.max(1, o.prices || 0)),
        gap: r3((o.pgap || 0) / Math.max(1, o.prices || 0))}};
  }
  return out;
}

// ── the history, season by season
const years = [];
let last = null, P0 = purses(), L0 = ledger(), Y0 = {p: P0, l: L0};
let drift = 0, driftMax = 0;
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  if (st.id !== 'history' || !a.hist) { P0 = purses(); L0 = ledger(); continue; }   // (the world before its history: the ledger starts with it)
  // the season's balance: the purses' change against what came in less what went out
  const P1 = purses(), L1 = ledger(), d = P1.all - P0.all - (sum(delta(L0.in, L1.in)) - sum(delta(L0.out, L1.out)));
  drift += d; driftMax = Math.max(driftMax, Math.abs(d));
  P0 = P1; L0 = L1;
  if (a.towns?.length) seasonTally();
  if (a.hist.season === 0 && a.hist.year !== last) {
    last = a.hist.year;
    const inY = delta(Y0.l.in, L1.in), outY = delta(Y0.l.out, L1.out);
    years.push({y: a.hist.year, era: a.hist.era, purses: Object.fromEntries(Object.entries(P1).map(([k, v]) => [k, r1(v)])),
      in: Object.fromEntries(Object.entries(inY).map(([k, v]) => [k, r1(v)])), out: Object.fromEntries(Object.entries(outY).map(([k, v]) => [k, r1(v)])),
      change: r1(P1.all - Y0.p.all), drift: r1(drift), ...yearRow()});
    Y0 = {p: P1, l: L1}; acc = zero(); seasons = 0; drift = 0;
  }
}

// ── the summary: the last third of the history (the young era, the world settled), by people
const tail = years.slice(Math.floor(years.length * 2 / 3));
const mean = f => tail.reduce((s, y) => s + (f(y) || 0), 0) / Math.max(1, tail.length);
const summary = {years: years.length, driftMax: r3(driftMax), drift: r1(years.reduce((s, y) => s + Math.abs(y.drift), 0)),
  in: Object.fromEntries([...new Set(tail.flatMap(y => Object.keys(y.in)))].map(k => [k, r1(mean(y => y.in[k]))])),
  out: Object.fromEntries([...new Set(tail.flatMap(y => Object.keys(y.out)))].map(k => [k, r1(mean(y => y.out[k]))])),
  purses: Object.fromEntries(Object.keys(years.at(-1)?.purses || {}).map(k => [k, r1(mean(y => y.purses[k]))])),
  change: r1(mean(y => y.change)),
  by: Object.fromEntries([...PE, 'all'].map(p => [p, {
    pop: Math.round(mean(y => y[p]?.pop)), gold100: r1(mean(y => y[p]?.gold100)), poorTowns: r3(mean(y => y[p]?.poorTowns)), purseCover: r3(mean(y => y[p]?.purseCover)),
    ...Object.fromEntries(['basic', 'comfort', 'works'].map(k => [k, Object.fromEntries(['left', 'money', 'route', 'goods'].map(q => [q, r3(mean(y => y[p]?.[k]?.[q]))]))])),
    circuit: Object.fromEntries(Object.keys(years.at(-1)?.[p]?.circuit || {}).map(k => [k, r1(mean(y => y[p]?.circuit?.[k]))])),
    prices: Object.fromEntries(['n', 'k', 'hi', 'lo', 'gap'].map(q => [q, r3(mean(y => y[p]?.prices?.[q]))]))}]))};
process.stdout.write(JSON.stringify({seed, size, mode, summary, years}));
process.stderr.write(JSON.stringify(summary, null, 1) + '\n');
