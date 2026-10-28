// The money of the towns (docs/WORLD.md «Деньги городов»; the numbers: data/townBuildings.js TOWN_MONEY). Once a season, in
// place of the bare economy (atlas/peoples.js). A town keeps three purses: its treasury (t.gold), its people's (t.peopleGold) and its
// makers' (t.makersGold); every payment goes from one purse to another — the gold goes round:
//   the people buy what they need → the makers are paid → they pay wages and buy what their works take → the people buy again;
//   the town taxes its makers, pays the upkeep of its buildings to the people who keep them, pays for what it builds — the
//   materials to the makers, the work to the people; the realm taxes the towns and pays their garrisons and grants to build.
// Gold comes into the world by the merchants who buy what is over a store's room and by the works that give it (the trading post,
// the harbour, the gold sand, the mint); it leaves by what is lost and by what is bought of other realms.
//   store     — each town keeps what its buildings made and did not use (t.stock, by good), up to a year of what it makes and
//               takes; its buildings draw on the store first. Food is not stored here: it goes down the net as people
//   buying    — a town whose buildings lack a good buys it from the towns it is linked with (last year's net, atlas/sites.js)
//               that have it over their reserve, at the seller's price this season (of another realm that trades with it dearer):
//               its makers pay the seller's makers. What it bought works this season; the goods strengthen the link as food does
//   needs     — the people buy what they live by (TOWN_MONEY.needs: basic for all, comfort the more the richer they are) from the
//               town's store over what its works keep (`reserve`), then from the linked towns, as far as their purse goes; how well the basic and the comfort needs
//               were met (t.needs) makes the town grow faster or slower and its realm more or less loyal
//   merchants — what is over the store's room is sold off to passing merchants, cheap (fairer where a market stands), the dearest
//               first, as far as their purse goes (the town's people × its trade); the rest is lost
//   makers    — pay `wage` of what they hold to the people and `tax` of it to the treasury, every season; the people pay their tax
//   upkeep    — every building costs gold (data/kingdom.js UPKEEP × TOWN_MONEY.upkeep.gold a year, each one): the treasury pays it
//               to the people who keep them, the realm's treasury what it cannot; what neither can is unpaid (t.unpaid): its
//               buildings work the worse for it
//   building  — a building costs gold by its step (payBuild): the town's grant from its realm first, then its treasury; the
//               materials come out of the store at its price (to the makers), the rest is the people's work
// Once a year the realm takes its tax and spends (atlas/kingdom.js): realm.gold — garrisons for its towns (their pay is the
// people's) and grants to build.
import {TOWN_MONEY as M, TOWN_GOODS, goodPrice, TOWN_BUILDINGS} from '../data/townBuildings.js';
import {UPKEEP} from '../data/kingdom.js';
import {SEASONS_PER_YEAR as S} from '../data/atlas.js';
import {townEconomy, heatFactor} from './economy.js';
import {trades} from './diplomacy.js';
import {townFx} from './towns.js';

const FOODS = new Set(['food', 'grain', 'stores']);
const r2 = v => Math.round(v * 100) / 100;
const setEcon = (t, e) => Object.defineProperty(t, 'econ', {value: e, writable: true, configurable: true, enumerable: false});   // worked out each season, never saved
const stored = g => !FOODS.has(g) && g !== 'gold';
const add = (o, k, v) => { o[k] = r2((o[k] || 0) + v); };

// what the store and the treasury lend the buildings this season, as a year's rate (the mint coins from the treasury)
const fromStore = t => { const o = {}; for (const [g, v] of Object.entries(t.stock || {})) o[g] = v * S; if (t.gold > 0) o.gold = t.gold * S; return o; };
// a good's room in a town's store
export const roomOf = (t, g) => Math.max(M.least, ((t.econ?.made[g] || 0) + (t.econ?.dem[g] || 0)) * M.store);
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

// (wants() is read again after the buying: the comfort wants by the people's purse as it was at the season's start are near enough)
export function seasonMoney(a, towns) {
  for (const t of towns) { open(t); t.trade = {}; setEcon(t, townEconomy(a, t, heatFactor(a, t), fromStore(t))); }
  const links = [...(a.net?.links.values() || [])].filter(l => l.p.alive && l.q.alive && l.p.realm != null && l.q.realm != null);
  const deal = (b, s) => (b.realm === s.realm ? 1 : trades(a, b.realm, s.realm) ? M.foreign : 0);   // × the price, 0 — no dealing
  // ── the works' buying: what each lacks this season, and what each has to sell after it
  const lack = new Map(), spare = new Map();
  for (const t of towns) {
    const e = t.econ, L = {}, P = {};
    for (const [g, d] of Object.entries(e.dem)) if (stored(g)) { const has = (e.made[g] || 0) + (t.stock[g] || 0) * S; if (d > has) L[g] = (d - has) / S * M.buy; }
    for (const g of new Set([...Object.keys(e.made), ...Object.keys(t.stock)])) {
      if (!stored(g)) continue;
      const after = (t.stock[g] || 0) + ((e.made[g] || 0) - (e.used[g] || 0)) / S, keep = roomOf(t, g) * M.reserve;
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
      L[g] -= n; P[g] -= n; b.makersGold = r2(b.makersGold - v); s.makersGold = r2(s.makersGold + v);
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
    const works = ((e.made.gold || 0) - (e.used.gold || 0)) / S; t.makersGold = r2(t.makersGold + works); t.trade.works = r2(works);
    for (const g of new Set([...Object.keys(e.made), ...Object.keys(e.used), ...Object.keys(t.stock)])) {
      if (!stored(g)) continue;
      t.stock[g] = Math.max(0, (t.stock[g] || 0) + ((e.made[g] || 0) - (e.used[g] || 0)) / S - (out[g] || 0));
    }
  }
  // ── the people's needs: from their own town's store first, then from the linked towns
  const want = new Map(), had = new Map();
  for (const t of towns) {
    const W = wants(t), H = {basic: 0, comfort: 0, basicOf: 0, comfortOf: 0};
    for (const kind of ['basic', 'comfort']) for (const [g, n] of Object.entries(W[kind])) {
      H[kind + 'Of'] += n * goodPrice(g);
      const price = priceAt(t, g), k = Math.min(n, (t.stock[g] || 0) - roomOf(t, g) * M.reserve, Math.max(0, t.peopleGold) / price);   // what the works keep, they keep
      if (k > 0) { t.stock[g] -= k; t.peopleGold = r2(t.peopleGold - k * price); t.makersGold = r2(t.makersGold + k * price); add(t.trade, 'people', k * price); W[kind][g] = n - k; H[kind] += k * goodPrice(g); }
    }
    want.set(t.id, W); had.set(t.id, H);
  }
  const fetch = (b, s, l) => {
    const W = want.get(b.id), H = had.get(b.id), k = deal(b, s);
    if (!W || !k) return;
    for (const kind of ['basic', 'comfort']) for (const [g, n] of Object.entries(W[kind])) {
      const have = (s.stock[g] || 0) - roomOf(s, g) * M.reserve;
      if (!(n > 0) || !(have > 0)) continue;
      const price = priceAt(s, g) * k, q = Math.min(n, have * l.c, Math.max(0, b.peopleGold) / price);
      if (q < M.dust) continue;
      const v = q * price;
      s.stock[g] -= q; W[kind][g] = n - q; H[kind] += q * goodPrice(g);
      b.peopleGold = r2(b.peopleGold - v); s.makersGold = r2(s.makersGold + v); l.goods = (l.goods || 0) + v;
      add(b.trade, 'imported', v); add(s.trade, 'sold', v);
    }
  };
  for (const l of links) { fetch(l.p, l.q, l); fetch(l.q, l.p, l); }
  for (const t of towns) {
    const H = had.get(t.id), W = want.get(t.id), all = wants(t), un = {};
    t.needs = {basic: H.basicOf ? r2(H.basic / H.basicOf) : 1, comfort: H.comfortOf ? r2(H.comfort / H.comfortOf) : 1};
    // what the people could not get, by good (a share of what they wanted): the town would build what makes it
    for (const kind of ['basic', 'comfort']) for (const [g, n] of Object.entries(W[kind])) if (all[kind][g] > 0 && n / all[kind][g] > M.needs.unmet) un[g] = Math.max(un[g] || 0, r2(n / all[kind][g]));
    t.needs.lack = un;
  }
  // ── the merchants, the makers, the upkeep, the market's prices
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
      purse -= m; t.makersGold = r2(t.makersGold + m); add(t.trade, 'merchants', m);
      if (n > k) add(t.trade, 'wasted', (n - k) * goodPrice(g));
    }
    // the makers pay their people and the town's tax
    if (t.makersGold > 0) {
      const wage = t.makersGold * M.makers.wage, tax = t.makersGold * M.makers.tax;
      t.makersGold = r2(t.makersGold - wage - tax); t.peopleGold = r2(t.peopleGold + wage); t.gold = r2(t.gold + tax);
      add(t.trade, 'wages', wage); add(t.trade, 'tax', tax);
    }
    if (t.peopleGold > 0) { const tax = t.peopleGold * M.people.tax; t.peopleGold = r2(t.peopleGold - tax); t.gold = r2(t.gold + tax); add(t.trade, 'tax', tax); }
    // the upkeep: from the treasury (and the realm's) to the people who keep the buildings
    const cost = upkeepYear(t) / S;
    let owe = cost;
    const pay = Math.min(owe, Math.max(0, t.gold)); t.gold = r2(t.gold - pay); owe -= pay;
    if (owe > 0 && R && R.gold > 0) { const p = Math.min(owe, R.gold); R.gold = r2(R.gold - p); owe -= p; t.trade.aid = r2(p); }
    t.peopleGold = r2(t.peopleGold + cost - owe);
    t.trade.upkeep = r2(cost);
    t.unpaid = cost > 0 ? Math.round(owe / cost * 1000) / 1000 : 0;
    // the season's prices of its market (saved): a good it lacks dearer, one it has in plenty cheaper
    const P = M.price, mk = {};
    for (const g of new Set([...Object.keys(e.short), ...Object.keys(t.stock)])) {
      const k = Math.max(P.lo, Math.min(P.hi, 1 + P.short * (e.short[g] || 0) - P.plenty * Math.min(1, (t.stock[g] || 0) / roomOf(t, g))));
      if (Math.abs(k - 1) >= M.dust) mk[g] = r2(k);
    }
    t.market = mk;
  }
}

// a building paid for (atlas/peoples.js, as it is built): its cost by its step — the realm's grant first, then the treasury; the
// materials out of the store at the town's price to its makers, the rest the people's work. → whether it could be paid
export function payBuild(t, b) {
  open(t);
  const B = M.build, cost = B.cost[Math.min(b.tier, B.cost.length - 1)];
  if ((t.grant || 0) + Math.max(0, t.gold) < cost) return false;
  const fromGrant = Math.min(t.grant || 0, cost);
  t.grant = r2((t.grant || 0) - fromGrant); t.gold = r2(t.gold - (cost - fromGrant));
  let left = cost;
  for (const [g, n] of Object.entries(B.mats[b.cat] || B.mats.default)) {
    const k = Math.min(n, t.stock[g] || 0), v = Math.min(left, k * priceAt(t, g));
    if (k <= 0) continue;
    t.stock[g] = r2(t.stock[g] - k); if (t.stock[g] < M.dust) delete t.stock[g];
    t.makersGold = r2(t.makersGold + v); left -= v;
  }
  t.peopleGold = r2(t.peopleGold + left);
  t.built$ = r2((t.built$ || 0) + cost);   // what its building cost this year (for the cards)
  return true;
}

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
