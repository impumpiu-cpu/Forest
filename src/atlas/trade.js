// Trade between realms (data/macro.js TRADE, docs/WORLD.md «Торговля держав»). The routes are counted once a year by the
// realms' dealings (atlas/diplomacy.js: road-joined or sea-joined towns of two realms that trade, `r.routes`, a town with a
// mint counting twice); every season, after the households (atlas/economy.js), the goods go down them:
//   - each realm's ledger: what it holds beyond TRADE.keep days of its own asking (to spare), and what it ran short of
//     this season and has not in its stocks (to buy);
//   - one realm's spare against the other's lack, by worth (goodPrice), the dearest first, both ways at once;
//   - the side that takes more than it gives pays the rest in gold, then in luxury, as far as it has them;
//   - no more than the routes carry (TRADE.perRoute × routes a day); TRADE.haul of what is sent arrives, to the towns of
//     the buyer that lacked it.
// `r.trade` keeps the last season's worth each way (the realm's card, tools/macro-probe.mjs).
import {TRADE} from '../data/macro.js';
import {goodPrice} from '../data/townBuildings.js';
import {trades} from './diplomacy.js';
import {realmTowns, drawRealm, giveStock} from './economy.js';

const price = g => goodPrice(g) || 1;
const add = (o, k, v) => { if (v) o[k] = (o[k] || 0) + v; };

// what a realm has to spare and what it lacks this season (whole amounts, not a day)
function ledger(a, realm, days) {
  const ts = realmTowns(a, realm).filter(t => t.econ);
  const want = {}, prod = {}, stock = {}, short = new Set();
  for (const t of ts) {
    const E = t.econ;
    for (const [g, v] of Object.entries(E.want || {})) add(want, g, v);
    for (const [g, v] of Object.entries(E.prod || {})) add(prod, g, v);
    for (const [g, v] of Object.entries(E.stock || {})) add(stock, g, v);
    for (const g of E.short || []) short.add(g);
  }
  const spare = {}, lack = {};
  for (const [g, v] of Object.entries(stock)) { const s = v - (want[g] || 0) * TRADE.keep; if (s > 1e-6) spare[g] = s; }
  for (const g of short) { const l = ((want[g] || 0) - (prod[g] || 0)) * days - (stock[g] || 0); if (l > 1e-6) lack[g] = l; }
  const purse = TRADE.pay.reduce((s, g) => s + (spare[g] || 0) * price(g), 0);
  return {realm, ts, spare, lack, purse};
}

// what one realm can sell the other: [{g, n (to send), worth}], the dearest first
function offers(from, to) {
  const out = [];
  for (const [g, need] of Object.entries(to.lack)) {
    const n = Math.min(from.spare[g] || 0, need / TRADE.haul);
    if (n > 1e-6) out.push({g, n, worth: n * price(g)});
  }
  return out.sort((x, y) => y.worth - x.worth || (x.g < y.g ? -1 : 1));
}

// send goods worth `worth` from one realm to the other: out of the seller's stocks, into the buyer's towns that lack them
function ship(a, list, worth, from, to) {
  let left = worth, sent = 0;
  for (const o of list) {
    if (left <= 1e-6) break;
    const n = drawRealm(a, from.realm, o.g, Math.min(o.n, left / price(o.g)));
    if (n <= 0) continue;
    deliver(to, o.g, n * TRADE.haul);
    from.spare[o.g] = Math.max(0, (from.spare[o.g] || 0) - n);
    left -= n * price(o.g); sent += n * price(o.g);
  }
  return sent;
}
// the buyer's towns that asked for a good share it by their asking; none — its biggest town
function deliver(L, g, n) {
  const ts = L.ts.filter(t => (t.econ.short || []).includes(g));
  const w = ts.map(t => Math.max(0, (t.econ.want?.[g] || 0) - (t.econ.prod?.[g] || 0)));
  const W = w.reduce((s, v) => s + v, 0);
  if (W > 0) ts.forEach((t, k) => giveStock(t, g, n * w[k] / W));
  else { const big = L.ts.reduce((m, t) => (!m || t.pop > m.pop ? t : m), null); if (big) giveStock(big, g, n); }
}
// the rest of the bargain paid in gold, then luxury
function pay(a, worth, from, to) {
  let left = worth;
  for (const g of TRADE.pay) {
    if (left <= 1e-6) break;
    const n = drawRealm(a, from.realm, g, Math.min(from.spare[g] || 0, left / price(g)));
    if (n <= 0) continue;
    const big = to.ts.reduce((m, t) => (!m || t.pop > m.pop ? t : m), null);
    if (big) giveStock(big, g, n);
    from.spare[g] = Math.max(0, (from.spare[g] || 0) - n);
    left -= n * price(g);
  }
  return worth - left;
}

export function stepTrade(a, days) {
  for (const kk of Object.keys(a.rel || {}).sort()) {
    const r = a.rel[kk];
    r.trade = null;
    if (!r.routes) continue;
    const [p, q] = kk.split(':');
    if (!trades(a, p, q)) continue;
    const A = ledger(a, p, days), B = ledger(a, q, days);
    if (!A.ts.length || !B.ts.length) continue;
    const ab = offers(A, B), ba = offers(B, A);
    const vab = ab.reduce((s, o) => s + o.worth, 0), vba = ba.reduce((s, o) => s + o.worth, 0);
    if (vab <= 0 && vba <= 0) continue;
    // both ways at once, each no more than the routes carry and than the other side gives back in goods or coin
    const cap = TRADE.perRoute * r.routes * days;
    const x = Math.min(cap, vab, vba + B.purse), y = Math.min(cap, vba, vab + A.purse);
    const sentAB = ship(a, ab, x, A, B), sentBA = ship(a, ba, y, B, A);
    let paid = 0;
    if (sentAB > sentBA) paid = pay(a, sentAB - sentBA, B, A);
    else if (sentBA > sentAB) paid = -pay(a, sentBA - sentAB, A, B);
    if (sentAB + sentBA > 0) r.trade = {[p]: Math.round(sentAB), [q]: Math.round(sentBA), paid: Math.round(paid)};
  }
}

// the worth of goods a realm sent and took last season over all its routes (for the card and the probe)
export function realmTrade(a, realm) {
  let sent = 0, got = 0;
  for (const [kk, r] of Object.entries(a.rel || {})) {
    if (!r.trade) continue;
    const [p, q] = kk.split(':');
    if (p === realm) { sent += r.trade[p]; got += r.trade[q]; } else if (q === realm) { sent += r.trade[q]; got += r.trade[p]; }
  }
  return {sent, got};
}
