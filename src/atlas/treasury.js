// The money of the towns (docs/WORLD.md «Деньги городов»; the numbers: data/townBuildings.js TOWN_MONEY). Once a season, in
// place of the bare economy (atlas/peoples.js):
//   store     — each town keeps what its buildings made and did not use (t.stock, by good), up to a year of what it makes and
//               takes; its buildings draw on the store first. Food is not stored here: it goes down the net as people
//   treasury  — t.gold: the gold its buildings give (the trading post, the harbour, the gold sand, the mint), what it sells
//   buying    — a town whose buildings lack a good buys it from the towns it is linked with (last year's net, atlas/sites.js)
//               that have it over their reserve: of its own realm at the good's price, of a realm that trades with it dearer;
//               the gold goes to the seller. What it bought works this season
//   merchants — what is over the store's room is sold off to passing merchants, cheap (fairer where a market stands)
//   upkeep    — its buildings cost gold (data/kingdom.js UPKEEP × TOWN_MONEY.upkeep.gold a year): the town pays, the realm's
//               treasury pays what it cannot, what neither can is unpaid (t.unpaid): its buildings work the worse for it
// Once a year the realm takes its tax (atlas/kingdom.js): realm.gold.
import {TOWN_MONEY as M, TOWN_GOODS, goodPrice} from '../data/townBuildings.js';
import {SEASONS_PER_YEAR as S} from '../data/atlas.js';
import {townEconomy, heatFactor} from './economy.js';
import {trades} from './diplomacy.js';
import {upkeepOf} from './kingdom.js';

const FOODS = new Set(['food', 'grain', 'stores']);
const r2 = v => Math.round(v * 100) / 100;
const setEcon = (t, e) => Object.defineProperty(t, 'econ', {value: e, writable: true, configurable: true, enumerable: false});   // worked out each season, never saved
const stored = g => !FOODS.has(g) && g !== 'gold';

// what the store and the treasury lend the buildings this season, as a year's rate (the mint coins from the treasury)
const fromStore = t => { const o = {}; for (const [g, v] of Object.entries(t.stock || {})) o[g] = v * S; if (t.gold > 0) o.gold = t.gold * S; return o; };
// a good's room in a town's store
export const roomOf = (t, g) => Math.max(M.least, ((t.econ?.made[g] || 0) + (t.econ?.dem[g] || 0)) * M.store);
const realmOf = (a, id) => (id == null ? null : a.realms?.find(r => r.id === id) || null);

export function seasonMoney(a, towns) {
  for (const t of towns) { t.stock ||= {}; if (t.gold == null) t.gold = r2(t.pop * M.start); setEcon(t, townEconomy(a, t, heatFactor(a, t), fromStore(t))); }
  // what each lacks this season, and what each has to sell after it
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
  // buying down the links: each way, by the link's conductance
  const sold = new Map(), got = new Map();
  const add = (m, id, g, n) => { const o = m.get(id) || {}; o[g] = (o[g] || 0) + n; m.set(id, o); };
  const buy = (b, s, l) => {
    const L = lack.get(b.id), P = spare.get(s.id);
    if (!L || !P || b.realm == null || s.realm == null) return;
    const own = b.realm === s.realm; if (!own && !trades(a, b.realm, s.realm)) return;
    for (const g of Object.keys(L)) {
      if (!(L[g] > 0) || !(P[g] > 0)) continue;
      const price = goodPrice(g) * (own ? 1 : M.foreign), n = Math.min(L[g], P[g] * l.c, Math.max(0, b.gold) / price);
      if (n < M.dust) continue;
      L[g] -= n; P[g] -= n; b.gold = r2(b.gold - n * price); s.gold = r2(s.gold + n * price);
      add(sold, s.id, g, n); add(got, b.id, g, n);
      b.trade.bought = r2((b.trade.bought || 0) + n * price); s.trade.sold = r2((s.trade.sold || 0) + n * price);
    }
  };
  for (const t of towns) t.trade = {};   // the season's money: bought, sold (between towns), works (the gold its buildings gave), merchants, upkeep, aid (the realm paid)
  for (const l of a.net?.links.values() || []) if (l.p.alive && l.q.alive) { buy(l.p, l.q, l); buy(l.q, l.p, l); }
  // the buyers work with what came
  for (const t of towns) { const G = got.get(t.id); if (!G) continue; for (const [g, n] of Object.entries(G)) t.stock[g] = (t.stock[g] || 0) + n; setEcon(t, townEconomy(a, t, heatFactor(a, t), fromStore(t))); }
  // the season settled: the store, the treasury, the merchants, the upkeep
  for (const t of towns) {
    const e = t.econ, out = sold.get(t.id) || {};
    const works = ((e.made.gold || 0) - (e.used.gold || 0)) / S; t.gold = r2(t.gold + works); t.trade.works = r2(works);
    const fair = M.merchants.at.some(id => t.built.includes(id)) ? M.merchants.fair : M.merchants.cheap;
    for (const g of new Set([...Object.keys(e.made), ...Object.keys(e.used), ...Object.keys(t.stock)])) {
      if (!stored(g)) continue;
      let v = Math.max(0, (t.stock[g] || 0) + ((e.made[g] || 0) - (e.used[g] || 0)) / S - (out[g] || 0));
      const room = roomOf(t, g);
      if (v > room) { const m = (v - room) * goodPrice(g) * fair; t.gold = r2(t.gold + m); t.trade.merchants = r2((t.trade.merchants || 0) + m); v = room; }
      if (v >= M.dust) t.stock[g] = r2(v); else delete t.stock[g];
    }
    const cost = upkeepOf([t]) * M.upkeep.gold / S, R = realmOf(a, t.realm);
    let owe = cost;
    const pay = Math.min(owe, Math.max(0, t.gold)); t.gold = r2(t.gold - pay); owe -= pay;
    if (owe > 0 && R && R.gold > 0) { const p = Math.min(owe, R.gold); R.gold = r2(R.gold - p); owe -= p; t.trade.aid = r2(p); }
    t.trade.upkeep = r2(cost);
    t.unpaid = cost > 0 ? Math.round(owe / cost * 1000) / 1000 : 0;
    // the season's prices of its market (campaign/town.js; saved): a good it lacks dearer, one it has in plenty cheaper
    const P = M.price, mk = {};
    for (const g of new Set([...Object.keys(e.short), ...Object.keys(t.stock)])) {
      const k = Math.max(P.lo, Math.min(P.hi, 1 + P.short * (e.short[g] || 0) - P.plenty * Math.min(1, (t.stock[g] || 0) / roomOf(t, g))));
      if (Math.abs(k - 1) >= M.dust) mk[g] = r2(k);
    }
    t.market = mk;
  }
}

// ── the caravan at a town's market (campaign/town.js): the town's goods, prices and treasury
// the town good a stock resource is (data/townBuildings.js TOWN_GOODS `res`, `per`): [good, units of it in one of the resource] or null
const BY_RES = new Map(TOWN_GOODS.all().filter(g => g.res).map(g => [g.res, [g.id, 1 / (g.per || 1)]]));
export const goodOfRes = res => BY_RES.get(res) || null;
// × the price of a good at this town's market this season
export const marketK = (t, g) => (g && t.market?.[g]) || 1;
// the caravan pays the town (into its treasury), or the town pays the caravan as far as its treasury goes → what it paid
export const toTown = (t, p) => { t.gold = r2((t.gold || 0) + p); return p; };
export const fromTown = (t, p) => { const v = Math.max(0, Math.min(p, t.gold ?? Infinity)); if (t.gold != null) t.gold = r2(t.gold - v); return v; };
// what the caravan sells goes into the town's store; what it buys comes out of it
export const intoStore = (t, g, n) => { if (!g || !stored(g)) return; t.stock ||= {}; t.stock[g] = r2((t.stock[g] || 0) + n); };
export const outOfStore = (t, g, n) => { if (!g || !t.stock?.[g]) return; const v = t.stock[g] - n; if (v >= M.dust) t.stock[g] = r2(v); else delete t.stock[g]; };

// the year's tax (atlas/kingdom.js, at the year's end): the share of each town's treasury above its keep, by the realm's edict
export function taxYear(realm, towns, level) {
  const rate = M.tax.rate[level] ?? M.tax.rate.usual;
  let sum = 0;
  for (const t of towns) { const over = (t.gold || 0) - M.tax.keep * t.pop; if (over <= 0) continue; const v = over * rate; t.gold = r2(t.gold - v); sum += v; }
  realm.gold = r2((realm.gold || 0) + sum);
  return sum;
}
