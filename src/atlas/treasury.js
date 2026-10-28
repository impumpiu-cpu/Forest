// The money of the towns (docs/WORLD.md «Деньги городов»; the numbers: data/townBuildings.js TOWN_MONEY). Once a season, in
// place of the bare economy (atlas/peoples.js). A town keeps three purses: its treasury (t.gold), its people's (t.peopleGold) and
// its makers' (t.makersGold); every payment goes from one purse to another — the gold goes round:
//   the people buy what they need → the makers are paid → they pay wages for the hands they employ and buy what their works
//   take → the people buy again; the town taxes the season's earnings of both, pays the upkeep of its buildings to the people
//   who keep them, pays for what it builds — the materials to the makers, the work to the people; the realm taxes the towns and
//   pays their garrisons and grants to build.
// Gold comes into the world by the merchants who buy what is over a store's room, by the works that give it (the trading post,
// the harbour, the gold sand, the mint) and by plunder; it leaves by what is lost and by what is bought of other realms.
//   store     — each town keeps what its buildings made and did not use (t.stock, by good), up to a year of what it makes and
//               takes; its buildings draw on the store first. It keeps for its works a season of what they will take (`keep`), and
//               of the goods its people live by a season of their basic needs (`safety`): the people may draw on that, nobody
//               else. Food is not stored here: it goes down the net as people
//   buying    — a town whose buildings lack a good buys it from the towns it is linked with (last year's net, atlas/sites.js)
//               that have it over what they keep, at the seller's price this season (of another realm that trades with it
//               dearer): its makers pay the seller's makers. What it bought works this season; the goods strengthen the link
//   needs     — the people's wants of the season are fixed at its start (TOWN_MONEY.needs: basic for all, comfort the more the
//               richer they are); they buy the basic first — at home, then in the linked towns — then the comfort, as far as
//               their purse goes; how well they were met (t.needs) makes the town grow and its realm loyal; what they could not
//               get (t.needs.lack) makes it dearer at the market and draws the town to build what makes it
//   merchants — what is over the store's room is sold off to passing merchants, cheap (fairer where a market stands), the dearest
//               first, as far as their purse goes (the town's people × its trade); the rest is lost
//   wages     — the makers pay `wage` a season for every free hand they employ, as far as their purse goes (what they cannot,
//               t.trade.owed); the town taxes `tax` of the season's earnings of the makers and of the people
//   upkeep    — every building costs gold (data/kingdom.js UPKEEP × TOWN_MONEY.upkeep.gold a year, each one): the treasury pays it
//               to the people who keep them, the realm's treasury what it cannot; what neither can is unpaid (t.unpaid): its
//               buildings work the worse for it
//   building  — a building takes its materials (`build.mats` by its kind; a hamlet's work of its step 0 is the people's own,
//               free) and the people's work (`build.labor` by its step): the materials from its store, what is missing bought in
//               the linked towns; the realm's grant pays first, then who builds it (`build.payer`: homes — the people, works — the
//               makers, the rest — the treasury). No materials or no gold — not built (planBuild)
//   plunder   — a raid or a storm won carries off a share of the beaten town's goods and gold (`plunder`; the cult of war more)
// Once a year the realm takes its tax and spends (atlas/kingdom.js): realm.gold — garrisons for its towns (their pay is the
// people's) and grants to build.
import {TOWN_MONEY as M, TOWN_GOODS, TOWN_FLOW, goodPrice, TOWN_BUILDINGS} from '../data/townBuildings.js';
import {UPKEEP} from '../data/kingdom.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SEASONS_PER_YEAR as S} from '../data/atlas.js';
import {townEconomy, heatFactor} from './economy.js';
import {trades} from './diplomacy.js';
import {townFx} from './towns.js';

const FOODS = new Set(['food', 'grain', 'stores']);
const r2 = v => Math.round(v * 100) / 100;
const setEcon = (t, e) => Object.defineProperty(t, 'econ', {value: e, writable: true, configurable: true, enumerable: false});   // worked out each season, never saved
const stored = g => !FOODS.has(g) && g !== 'gold';
const add = (o, k, v) => { o[k] = r2((o[k] || 0) + v); };
const KINDS = ['basic', 'comfort'];

// what the store and the treasury lend the buildings this season, as a year's rate (the mint coins from the treasury)
const fromStore = t => { const o = {}; for (const [g, v] of Object.entries(t.stock || {})) o[g] = v * S; if (t.gold > 0) o.gold = t.gold * S; return o; };
// a good's room in a town's store
export const roomOf = (t, g) => Math.max(M.least, ((t.econ?.made[g] || 0) + (t.econ?.dem[g] || 0)) * M.store);
// what a town keeps of a good for its works (a season of what they take), and for its people's basic needs
const keepOf = (t, g) => (t.econ?.dem[g] || 0) / S * M.keep;
const safetyOf = (t, g) => (M.needs.basic[g] || 0) * t.pop * M.safety;
// what of it the town would let go: to its own people (over what its works keep), to others (over the people's safety too)
const forPeople = (t, g) => Math.max(0, (t.stock[g] || 0) - keepOf(t, g));
const forOthers = (t, g) => Math.max(0, (t.stock[g] || 0) - keepOf(t, g) - safetyOf(t, g));
const realmOf = (a, id) => (id == null ? null : a.realms?.find(r => r.id === id) || null);
// a good's price at a town this season (its market: dearer where it lacks, cheaper where its store is full)
export const priceAt = (t, g) => goodPrice(g) * marketK(t, g);
// the upkeep a year of a town's buildings, each one
export const upkeepYear = t => t.built.reduce((s, id) => s + (UPKEEP[TOWN_BUILDINGS.get(id)?.cat] || 0), 0) * M.upkeep.gold;
// the purses of a town, opened (an old save, a town just founded)
function open(t) {
  t.stock ||= {};
  if (t.gold == null) t.gold = r2(t.pop * M.start.gold);
  if (t.peopleGold == null) t.peopleGold = r2(t.pop * M.start.people);
  if (t.makersGold == null) t.makersGold = r2(t.pop * M.start.makers);
}
// the people's wants this season, by good: the basic ones, and the comfort ones × how rich they are (gold a head against `rich`)
function wants(t) {
  const N = M.needs, rich = Math.min(1, Math.max(0, t.peopleGold) / Math.max(1, t.pop * N.rich)), o = {basic: {}, comfort: {}};
  for (const [g, v] of Object.entries(N.basic)) o.basic[g] = v * t.pop;
  for (const [g, v] of Object.entries(N.comfort)) o.comfort[g] = v * t.pop * rich;
  return o;
}
// the towns a town is linked with, and how well: [other, link]
const linksOf = (a, t) => [...(a.net?.links.values() || [])].filter(l => l.p.alive && l.q.alive && (l.p === t || l.q === t)).map(l => [l.p === t ? l.q : l.p, l]);
// × the price between two towns: of one realm 1, of a realm that trades with it `foreign`, else 0 (no dealing)
const dealOf = (a, b, s) => (b.realm == null || s.realm == null ? 0 : b.realm === s.realm ? 1 : trades(a, b.realm, s.realm) ? M.foreign : 0);

export function seasonMoney(a, towns) {
  for (const t of towns) { open(t); t.trade = {}; setEcon(t, townEconomy(a, t, heatFactor(a, t), fromStore(t))); }
  const links = [...(a.net?.links.values() || [])].filter(l => l.p.alive && l.q.alive && l.p.realm != null && l.q.realm != null);
  const deal = (b, s) => dealOf(a, b, s);
  const earn = (t, who, v) => add(t.trade, who === 'makers' ? 'makersIn' : 'peopleIn', v);   // the season's earnings, taxed at its end
  // ── the works' buying: what each lacks this season, and what each has to sell after it
  const lack = new Map(), spare = new Map();
  for (const t of towns) {
    const e = t.econ, L = {}, P = {};
    for (const [g, d] of Object.entries(e.dem)) if (stored(g)) { const has = (e.made[g] || 0) + (t.stock[g] || 0) * S; if (d > has) L[g] = (d - has) / S * M.buy; }
    for (const g of new Set([...Object.keys(e.made), ...Object.keys(t.stock)])) {
      if (!stored(g)) continue;
      const after = (t.stock[g] || 0) + ((e.made[g] || 0) - (e.used[g] || 0)) / S, keep = keepOf(t, g) + safetyOf(t, g);
      if (after > keep) P[g] = after - keep;
    }
    lack.set(t.id, L); spare.set(t.id, P);
  }
  const sold = new Map(), got = new Map();
  const put = (m, id, g, n) => { const o = m.get(id) || {}; o[g] = (o[g] || 0) + n; m.set(id, o); };
  const buy = (b, s, l) => {
    const L = lack.get(b.id), P = spare.get(s.id), k = deal(b, s);
    if (!L || !P || !k) return;
    for (const g of Object.keys(L)) {
      if (!(L[g] > 0) || !(P[g] > 0)) continue;
      const price = priceAt(s, g) * k, n = Math.min(L[g], P[g] * l.c, Math.max(0, b.makersGold) / price);
      if (n < M.dust) continue;
      const v = n * price;
      L[g] -= n; P[g] -= n; b.makersGold = r2(b.makersGold - v); s.makersGold = r2(s.makersGold + v); earn(s, 'makers', v);
      put(sold, s.id, g, n); put(got, b.id, g, n); l.goods = (l.goods || 0) + v;
      add(b.trade, 'bought', v); add(s.trade, 'sold', v);
    }
  };
  for (const l of links) { buy(l.p, l.q, l); buy(l.q, l.p, l); }
  // the buyers work with what came
  for (const t of towns) { const G = got.get(t.id); if (!G) continue; for (const [g, n] of Object.entries(G)) t.stock[g] = (t.stock[g] || 0) + n; setEcon(t, townEconomy(a, t, heatFactor(a, t), fromStore(t))); }
  // ── the season's store: what was made, less what was used and sold; the gold of the works to the makers
  for (const t of towns) {
    const e = t.econ, out = sold.get(t.id) || {};
    const works = ((e.made.gold || 0) - (e.used.gold || 0)) / S; t.makersGold = r2(t.makersGold + works); t.trade.works = r2(works); if (works > 0) earn(t, 'makers', works);
    for (const g of new Set([...Object.keys(e.made), ...Object.keys(e.used), ...Object.keys(t.stock)])) {
      if (!stored(g)) continue;
      t.stock[g] = Math.max(0, (t.stock[g] || 0) + ((e.made[g] || 0) - (e.used[g] || 0)) / S - (out[g] || 0));
    }
  }
  // ── the people's needs: the wants fixed at the season's start; the basic ones first, at home and then in the linked towns,
  // then the comfort ones the same way
  const want = new Map(), had = new Map();
  for (const t of towns) { const W = wants(t); want.set(t.id, {left: {basic: {...W.basic}, comfort: {...W.comfort}}, all: W}); had.set(t.id, {basic: 0, comfort: 0}); }
  const home = (t, kind) => {
    const W = want.get(t.id).left[kind], H = had.get(t.id);
    for (const [g, n] of Object.entries(W)) {
      const price = priceAt(t, g), k = Math.min(n, forPeople(t, g), Math.max(0, t.peopleGold) / price);
      if (!(k > 0)) continue;
      t.stock[g] -= k; t.peopleGold = r2(t.peopleGold - k * price); t.makersGold = r2(t.makersGold + k * price); earn(t, 'makers', k * price);
      add(t.trade, 'people', k * price); W[g] = n - k; H[kind] += k * goodPrice(g);
    }
  };
  const fetch = (b, s, l, kind) => {
    const W = want.get(b.id)?.left[kind], H = had.get(b.id), k = deal(b, s);
    if (!W || !k) return;
    for (const [g, n] of Object.entries(W)) {
      const have = forOthers(s, g);
      if (!(n > 0) || !(have > 0)) continue;
      const price = priceAt(s, g) * k, q = Math.min(n, have * l.c, Math.max(0, b.peopleGold) / price);
      if (q < M.dust) continue;
      const v = q * price;
      s.stock[g] -= q; W[g] = n - q; H[kind] += q * goodPrice(g);
      b.peopleGold = r2(b.peopleGold - v); s.makersGold = r2(s.makersGold + v); earn(s, 'makers', v); l.goods = (l.goods || 0) + v;
      add(b.trade, 'imported', v); add(s.trade, 'sold', v);
    }
  };
  for (const kind of KINDS) {
    for (const t of towns) home(t, kind);
    for (const l of links) { fetch(l.p, l.q, l, kind); fetch(l.q, l.p, l, kind); }
  }
  for (const t of towns) {
    // the people's season by good (on t.econ, not saved: for the cards and the reports): what they wanted, what they got
    const PW = {}; for (const kind of KINDS) for (const [g, n] of Object.entries(want.get(t.id).all[kind])) { const o = PW[g] ||= {want: 0, got: 0}; o.want += n; o.got += n - want.get(t.id).left[kind][g]; }
    t.econ.people = PW;
    const H = had.get(t.id), {left, all} = want.get(t.id), of = kind => Object.entries(all[kind]).reduce((s, [g, n]) => s + n * goodPrice(g), 0), un = {};
    const ob = of('basic'), oc = of('comfort');
    t.needs = {basic: ob ? r2(Math.min(1, H.basic / ob)) : 1, comfort: oc ? r2(Math.min(1, H.comfort / oc)) : 1};
    // what the people could not get, by good (a share of what they wanted at the season's start): dearer, and worth building
    for (const kind of KINDS) for (const [g, n] of Object.entries(left[kind])) if (all[kind][g] > 0 && n / all[kind][g] > M.needs.unmet) un[g] = Math.max(un[g] || 0, r2(Math.min(1, n / all[kind][g])));
    t.needs.lack = un;
  }
  // ── the merchants, the wages and taxes, the upkeep, the market's prices
  for (const t of towns) {
    const e = t.econ, R = realmOf(a, t.realm);
    // the store: what is over its room goes to the merchants — the dearest first, as far as their purse goes (the town's people ×
    // its trade); the rest rots, is burnt or carried off for nothing
    const fair = M.merchants.at.some(id => t.built.includes(id)) ? M.merchants.fair : M.merchants.cheap, over = [];
    for (const g of Object.keys(t.stock)) {
      let v = t.stock[g];
      const room = roomOf(t, g);
      if (v > room) { over.push([g, v - room]); v = room; }
      if (v >= M.dust) t.stock[g] = r2(v); else delete t.stock[g];
    }
    let purse = M.merchants.purse * t.pop * (1 + townFx(t).trade);
    for (const [g, n] of over.sort((p, q) => goodPrice(q[0]) - goodPrice(p[0]))) {
      const unit = goodPrice(g) * fair, k = Math.min(n, purse / unit), m = k * unit;
      purse -= m; t.makersGold = r2(t.makersGold + m); add(t.trade, 'merchants', m); if (m > 0) earn(t, 'makers', m);
      if (n > k) add(t.trade, 'wasted', (n - k) * goodPrice(g));
    }
    // the wages: for the free hands at work (the slaves are not paid), as far as the makers' purse goes
    const hands = Math.max(0, e.hands - (t.slaves || 0) * TOWN_FLOW.slaves.work - e.freeHands);   // the free hands its works took
    const bill = hands * M.makers.wage, wage = Math.min(bill, Math.max(0, t.makersGold));
    t.makersGold = r2(t.makersGold - wage); t.peopleGold = r2(t.peopleGold + wage); earn(t, 'people', wage);
    add(t.trade, 'wages', wage); if (bill > wage) add(t.trade, 'owed', bill - wage);
    // the upkeep: from the treasury (and the realm's) to the people who keep the buildings
    const cost = upkeepYear(t) / S;
    let owe = cost;
    const pay = Math.min(owe, Math.max(0, t.gold)); t.gold = r2(t.gold - pay); owe -= pay;
    if (owe > 0 && R && R.gold > 0) { const p = Math.min(owe, R.gold); R.gold = r2(R.gold - p); owe -= p; t.trade.aid = r2(p); }
    t.peopleGold = r2(t.peopleGold + cost - owe); earn(t, 'people', cost - owe);
    t.trade.upkeep = r2(cost);
    t.unpaid = cost > 0 ? Math.round(owe / cost * 1000) / 1000 : 0;
    // the taxes: of what the makers and the people earned this season
    const tm = Math.min(Math.max(0, t.makersGold), (t.trade.makersIn || 0) * M.makers.tax), tp = Math.min(Math.max(0, t.peopleGold), (t.trade.peopleIn || 0) * M.people.tax);
    t.makersGold = r2(t.makersGold - tm); t.peopleGold = r2(t.peopleGold - tp); t.gold = r2(t.gold + tm + tp); add(t.trade, 'tax', tm + tp);
    // the season's prices of its market (saved): a good its works or its people lack dearer, one it has in plenty cheaper
    const P = M.price, mk = {};
    for (const g of new Set([...Object.keys(e.short), ...Object.keys(t.stock), ...Object.keys(t.needs.lack)])) {
      const k = Math.max(P.lo, Math.min(P.hi, 1 + P.short * (e.short[g] || 0) + P.need * (t.needs.lack[g] || 0) - P.plenty * Math.min(1, (t.stock[g] || 0) / roomOf(t, g))));
      if (Math.abs(k - 1) >= M.dust) mk[g] = r2(k);
    }
    t.market = mk;
  }
}

// ── building (atlas/peoples.js): a plan of what a building takes — its materials from the store and from the linked towns, the
// people's work — and whether the town can pay it; then done. → the plan, or null (no materials, or no gold)
export function planBuild(a, t, b) {
  open(t);
  const B = M.build, step = Math.min(b.tier, B.labor.length - 1);
  if (step === 0) return {t, cost: 0, own: [], bought: [], labor: 0};   // a hamlet's work: the people's own hands, of what they find
  const own = [], bought = [];
  let mats = 0, gather = 0;
  for (const [g, n] of Object.entries(B.mats[b.cat] || B.mats.default)) {
    let need = n;
    const k = Math.min(need, t.stock[g] || 0);
    if (k > 0) { own.push([g, k, k * priceAt(t, g)]); mats += k * priceAt(t, g); need -= k; }
    for (const [s, l] of need > 0 ? linksOf(a, t) : []) {
      const d = dealOf(a, t, s), q = d ? Math.min(need, forOthers(s, g) * l.c) : 0;
      if (q < M.dust) continue;
      const v = q * priceAt(s, g) * d; bought.push([s, g, q, v, l]); mats += v; need -= q;
      if (need < M.dust) break;
    }
    if (need >= M.dust && B.gather.goods.includes(g)) { gather += need * goodPrice(g) * B.gather.k; need = 0; }   // the people fetch it by hand, dearly
    if (need >= M.dust) return null;   // the materials are not to be had
  }
  const labor = B.labor[step] + gather, cost = mats + labor, payer = B.payer[b.cat] || B.payer.default;
  if ((t.grant || 0) + Math.max(0, t[payer]) < cost) return null;
  return {t, cost, own, bought, labor, payer};
}
export function doBuild(P) {
  const {t, cost, own, bought, labor, payer} = P;
  if (!cost) return;
  const fromGrant = Math.min(t.grant || 0, cost);
  t.grant = r2((t.grant || 0) - fromGrant); t[payer] = r2(t[payer] - (cost - fromGrant));
  const used = t.econ ? (t.econ.build ||= {}) : {};   // what building took this year, by good (for the reports)
  for (const [g, k, v] of own) { t.stock[g] = r2(t.stock[g] - k); if (t.stock[g] < M.dust) delete t.stock[g]; t.makersGold = r2(t.makersGold + v); used[g] = (used[g] || 0) + k; }
  for (const [s, g, q, v, l] of bought) { s.stock[g] = r2(s.stock[g] - q); if (s.stock[g] < M.dust) delete s.stock[g]; s.makersGold = r2(s.makersGold + v); l.goods = (l.goods || 0) + v; used[g] = (used[g] || 0) + q; }
  t.peopleGold = r2(t.peopleGold + labor);
  t.builtCost = r2((t.builtCost || 0) + cost);   // what its building cost (for the cards)
}

// ── plunder (atlas/deeds/captives.js, raidTown.js; atlas/diplomacy.js, the storm): the raiders carry off `share` of the beaten
// town's goods and gold (× its people's cult of war: the greenskins), the gold to the raiders' people, the goods to their store
// → [gold, the goods' worth], or null
export function plunder(raider, target, share) {
  if (!raider || !target) return null;
  open(raider); open(target);
  const k = Math.min(1, share * (WORLD_PEOPLES.get(raider.people)?.warCult ? M.plunder.cult : 1));
  let gold = 0, worth = 0;
  for (const key of ['gold', 'peopleGold', 'makersGold']) { const v = Math.max(0, target[key]) * k; target[key] = r2(target[key] - v); gold += v; }
  for (const [g, n] of Object.entries(target.stock)) {
    if (!stored(g)) continue;
    const q = n * k; target.stock[g] = r2(n - q); if (target.stock[g] < M.dust) delete target.stock[g];
    raider.stock[g] = r2((raider.stock[g] || 0) + q); worth += q * goodPrice(g);
  }
  raider.peopleGold = r2(raider.peopleGold + gold * (1 - M.plunder.chief)); raider.gold = r2(raider.gold + gold * M.plunder.chief);
  raider.plunder = r2((raider.plunder || 0) + gold + worth);   // all it ever took (for the cards)
  return gold + worth > 0 ? [r2(gold), r2(worth)] : null;
}
// what a town is worth to a raider: its gold in every purse and its store at the price
export const lootOf = t => (t.gold || 0) + (t.peopleGold || 0) + (t.makersGold || 0) + Object.entries(t.stock || {}).reduce((s, [g, n]) => s + (stored(g) ? n * goodPrice(g) : 0), 0);
// the words of a plunder for the chronicle: «, вывезли добра и золота на N»
export const plunderWords = p => (p ? `, вывезли добра и золота на ${Math.round(p[0] + p[1])}` : '');

// ── the caravan at a town's market (campaign/town.js): the town's goods, prices and makers
// the town good a stock resource is (data/townBuildings.js TOWN_GOODS `res`, `per`): [good, units of it in one of the resource] or null
const BY_RES = new Map(TOWN_GOODS.all().filter(g => g.res).map(g => [g.res, [g.id, 1 / (g.per || 1)]]));
export const goodOfRes = res => BY_RES.get(res) || null;
// × the price of a good at this town's market this season
export const marketK = (t, g) => (g && t.market?.[g]) || 1;
// the caravan pays the town's makers, or they pay the caravan as far as their purse goes → what was paid
export const toTown = (t, p) => { if (t.makersGold == null && t.gold == null) return p; t.makersGold = r2((t.makersGold ?? 0) + p); return p; };
export const fromTown = (t, p) => { if (t.makersGold == null) return Math.max(0, p); const v = Math.max(0, Math.min(p, t.makersGold)); t.makersGold = r2(t.makersGold - v); return v; };
// what the caravan sells goes into the town's store; what it buys comes out of it
export const intoStore = (t, g, n) => { if (!g || !stored(g)) return; t.stock ||= {}; t.stock[g] = r2((t.stock[g] || 0) + n); };
export const outOfStore = (t, g, n) => { if (!g || !t.stock?.[g]) return; const v = t.stock[g] - n; if (v >= M.dust) t.stock[g] = r2(v); else delete t.stock[g]; };
// what the town's makers can pay
export const townPurse = t => (t.makersGold == null ? Infinity : Math.max(0, t.makersGold));

// the realm's spending (atlas/kingdom.js, after the tax): a share of its treasury on its towns' garrisons (t.garrison: men, the
// year's; their pay goes to the town's people) and on grants to build (t.grant: gold, kept till spent) — by their people
export function realmSpend(realm, towns, war) {
  const R = M.realm, budget = Math.max(0, realm.gold || 0) * R.spend, pop = towns.reduce((s, t) => s + t.pop, 0) || 1;
  const army = budget * (war ? R.army.war : R.army.peace), men = army / R.man;
  let build = 0;
  for (const t of towns) {
    const share = t.pop / pop;
    open(t);
    t.garrison = r2(men * share); t.peopleGold = r2(t.peopleGold + army * share);
    const room = Math.max(0, R.build * R.hoard - (t.grant || 0)), g = Math.min(room, (budget - army) * share);
    if (g > 0) { t.grant = r2((t.grant || 0) + g); build += g; }
  }
  realm.gold = r2(realm.gold - army - build);
  return (realm.spent = {army: r2(army), build: r2(build), men: r2(men)});
}

// the year's tax (atlas/kingdom.js, at the year's end): the share of each town's treasury above its keep, by the realm's edict
export function taxYear(realm, towns, level) {
  const rate = M.tax.rate[level] ?? M.tax.rate.usual;
  let sum = 0;
  for (const t of towns) { const over = (t.gold || 0) - M.tax.keep * t.pop; if (over <= 0) continue; const v = over * rate; t.gold = r2(t.gold - v); sum += v; }
  realm.gold = r2((realm.gold || 0) + sum);
  return sum;
}
