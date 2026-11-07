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
//   buying    — a town whose buildings lack a good buys it from the towns of its province (its realm's towns the net joins,
//               atlas/sites.js) that have it over what they keep, the nearest by the net first, at the seller's price this
//               season; and from the towns of other realms it is linked with that trade with it, dearer: its makers pay the
//               seller's makers. What it bought works this season; the goods strengthen the links they went down
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
// Once a year the realm takes its tax, in gold and in kind (atlas/kingdom.js), and grants its towns gold to build; each season
// it keeps its war host out of its treasury — realm.gold and its store realm.stock: garrisons, and its armies' pay, food and kit
// (realmKeep).
import {councilShares} from './mind.js';
import {TOWN_MONEY as M, TOWN_GOODS, TOWN_FLOW, TOWN_FLOW as F, goodPrice, TOWN_BUILDINGS} from '../data/townBuildings.js';
import {UPKEEP} from '../data/kingdom.js';
import {WORLD_PEOPLES, swapGoods} from '../data/peoples.js';
import {SEASONS_PER_YEAR as S, SEASON_DAYS} from '../data/atlas.js';
import {ARMY} from '../data/parties.js';
import {townEconomy, prepEconomy, heatFactor} from './economy.js';
import {trades} from './diplomacy.js';
import {DIPLOMACY} from '../data/diplomacy.js';
import {townFx} from './towns.js';
import {onEdit} from '../data/schema/layer.js';
import {allowed} from '../data/commands.js';
import {NET} from '../data/sites.js';
import {linkKey} from './common.js';
import {scaleOf} from './tectonics.js';

const r2 = v => Math.round(v * 100) / 100;

// ── the ledger of the world's money (for the probes — tools/money-probe.mjs; the game never reads it, it is never saved): the
// gold that came into the world and left it since the last reset, by way. Every other payment only moves gold from one purse to
// another (the towns', the realms', the grants), so the purses' sum moves by what came in less what went out — and by the purses
// of the towns that fell (they stay on the dead town). One ledger for the process: a probe resets it before its world
export const MONEY = {in: {}, out: {}};
export const resetMoney = () => { MONEY.in = {}; MONEY.out = {}; };
const comeIn = (k, v) => { if (v > 0) MONEY.in[k] = (MONEY.in[k] || 0) + v; };
const goOut = (k, v) => { if (v > 0) MONEY.out[k] = (MONEY.out[k] || 0) + v; };
const setEcon = (t, e) => Object.defineProperty(t, 'econ', {value: e, writable: true, configurable: true, enumerable: false});   // worked out each season, never saved
const stored = g => g !== 'gold' && !(TOWN_GOODS.has(g) && TOWN_GOODS.get(g).local);   // (TOWN_GOODS `local`: food, raw food, brushwood stay where they are made; stores keep and are traded)
const add = (o, k, v) => { o[k] = r2((o[k] || 0) + v); };
const KINDS = ['basic', 'comfort'];
const peopleOf = id => (WORLD_PEOPLES.has(id) ? WORLD_PEOPLES.get(id) : null);

// what the store and the treasury lend the buildings this season, as a year's rate (the mint coins from the treasury)
const fromStore = t => { const o = {}; for (const [g, v] of Object.entries(t.stock || {})) o[g] = v * S; if (t.gold > 0) o.gold = t.gold * S; return o; };
// a good's room in a town's store
// — a year of what is taken of it (t.taken: the season's works, people and buyers elsewhere, smoothed) and of what its works ask,
// not of what it makes: a work set down for want of takers does not shrink the room it is judged by (atlas/treasury.js loadStep)
export const roomOf = (t, g) => Math.max(M.least, ((t.taken?.[g] || 0) * S + (t.econ?.dem[g] || 0)) * M.store);
// what a town keeps of a good for its works (a season of what they take), and for its people's basic needs
const keepOf = (t, g) => (t.econ?.dem[g] || 0) / S * M.keep;
// (the basket of the safety is asked for every good of every link each season: kept per town while its people, its size and the
// table it is made of stay the same; an edit of the tables clears it)
let safeKept = new WeakMap();
onEdit(() => { safeKept = new WeakMap(); });
const safeBasket = t => {
  const k = t.pop * (peopleOf(t.people)?.needs ?? 1), N = M.needs.basic, s = safeKept.get(t);
  if (s && s.k === k && s.people === t.people && s.N === N) return s.v;
  const v = goodsFor(t.people, N, k); safeKept.set(t, {k, people: t.people, N, v});
  return v;
};
const safetyOf = (t, g) => (safeBasket(t)[g] || 0) * M.safety;
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
  if (t.gold == null) { t.gold = r2(t.pop * M.start.gold); comeIn('start', t.gold); }
  if (t.peopleGold == null) { t.peopleGold = r2(t.pop * M.start.people); comeIn('start', t.peopleGold); }
  if (t.makersGold == null) { t.makersGold = r2(t.pop * M.start.makers); comeIn('start', t.makersGold); }
}
// the people's wants this season, by good: the basic ones, and the comfort ones × how rich they are (gold a head against `rich`)
// (× its people's `needs`: a horde wants less; a good its people do without is swapped as its buildings do — data/peoples.js)
function wants(t) {
  const N = M.needs, P = peopleOf(t.people), k = P?.needs ?? 1, rich = Math.min(1, Math.max(0, t.peopleGold) / Math.max(1, t.pop * N.rich)), o = {basic: {}, comfort: {}};
  // (its own wants — data/peoples.js `wants`: the greenskins want arms and no luxury)
  o.basic = goodsFor(t.people, {...N.basic, ...(P?.wants?.basic || {})}, t.pop * k);
  o.comfort = goodsFor(t.people, {...N.comfort, ...(P?.wants?.comfort || {})}, t.pop * rich * k);
  for (const tier of ['basic', 'comfort']) for (const g of Object.keys(o[tier])) if (!(o[tier][g] > 0)) delete o[tier][g];
  return o;
}
// a basket as the town's people takes it (data/peoples.js swapGoods): the needs, the safety reserve and the materials of a building
export const goodsFor = (people, goods, k = 1) => swapGoods(people, goods, k);
// the towns a town is linked with, and how well: [other, link]
const linksOf = (a, t) => [...(a.net?.links.values() || [])].filter(l => l.p.alive && l.q.alive && (l.p === t || l.q === t)).map(l => [l.p === t ? l.q : l.p, l]);
// × the price between two towns: of one realm 1, of a realm that trades with it `foreign`, else 0 (no dealing)
const dealOf = (a, b, s) => (b.realm == null || s.realm == null ? 0 : b.realm === s.realm ? 1 : trades(a, b.realm, s.realm) ? M.foreign : 0);

// A season of a town's reworking (data/townBuildings.js `recycle`: the dwarves' «переработка», one in a town): what its works
// still lack after buying (`L`) and what its people want of the basic goods and the store cannot give, made of what it has to
// spare (`P`: over its keep and safety) at the worth in gold, `k` to one — up to `worth` gold a year of the spare at full hands.
// `give(g, n)` puts what came of it into the store with the season's buying → the worth taken
export function recycle(t, L, P, give) {
  const b = t.built.map(id => TOWN_BUILDINGS.get(id)).find(x => x?.recycle);
  if (!b || !L || !P) return 0;
  const R = b.recycle, need = {...L};
  for (const [g, n] of Object.entries(wants(t).basic)) if (stored(g)) need[g] = Math.max(need[g] || 0, n - forPeople(t, g));
  let left = R.worth / S * Math.min(1, t.work?.[b.id] ?? 1), took = 0;
  const from = Object.keys(P).filter(h => !(need[h] > 0) && P[h] > 0).sort((x, y) => P[y] * goodPrice(y) - P[x] * goodPrice(x));
  for (const [g, n] of Object.entries(need).sort((x, y) => y[1] * goodPrice(y[0]) - x[1] * goodPrice(x[0]))) {
    let want = n * goodPrice(g) * R.k;   // the worth of spare it takes to make it
    for (const h of from) {
      if (!(want > M.dust) || !(left > M.dust)) break;
      const q = Math.min(P[h], t.stock[h] || 0, want / goodPrice(h), left / goodPrice(h));
      if (!(q > M.dust)) continue;
      const v = q * goodPrice(h);
      P[h] -= q; t.stock[h] -= q; want -= v; left -= v; took += v;
      give(g, v / R.k / goodPrice(g));
      if (L[g] > 0) L[g] = Math.max(0, L[g] - v / R.k / goodPrice(g));
    }
  }
  if (took > 0) add(t.trade, 'recycled', took);
  return took;
}

// ── a season of the towns' money, in its phases (each over all the towns, in this order): the works' buying, the season's
// store, the people's needs, then each town's merchants, wages, taxes, upkeep and prices
export function seasonMoney(a, towns) {
  const prep = openSeason(a, towns);
  const links = [...(a.net?.links.values() || [])].filter(l => l.p.alive && l.q.alive && l.p.realm != null && l.q.realm != null);
  const C = {a, towns, links, deal: (b, s) => dealOf(a, b, s)};
  const sold = worksBuying(C, prep);
  seasonStore(towns, sold);
  peopleNeeds(C);
  // the demand each town could not meet: buyers — of its realm or another — who reached it, could pay for the good and still
  // wanted it once the ways had carried what they could (worksBuying C.wanted): a want of carriage, not of buyers, so loadStep
  // does not cut its makers for it
  for (const t of towns) { const W = C.wanted?.get(t.id) || {}; t.econ.wanted = Object.fromEntries(Object.entries(W).map(([g, v]) => [g, r2(v)])); closeSeason(a, t, W, sold.get(t.id) || {}); }
}
const earn = (t, who, v) => add(t.trade, who === 'makers' ? 'makersIn' : 'peopleIn', v);   // the season's earnings, taxed at its end

// the season's start: each town's ledger opened and its works' first reckoning, of its own store → Map town → [heat, prep]
function openSeason(a, towns) {
  // (what was earned and dealt by building since the last season — atlas/peoples.js, after it — is the season's too: t.carry)
  const prep = new Map();   // (the season's first half of each town's works, given again after the buying: atlas/economy.js prepEconomy)
  for (const t of towns) { open(t); t.trade = {...(t.carry || {}), at: a.hist?.step ?? 0}; delete t.carry; const h = heatFactor(a, t), p = prepEconomy(a, t, h); prep.set(t, [h, p]); setEcon(t, townEconomy(a, t, h, fromStore(t), p)); }   // (at: the season's step — a town burnt later in the season still sold this season)
  return prep;
}

// ── the works' buying: what each lacks this season, and what each has to sell after it; the buyers work again with what came
// → Map town id → {good: how much it sold}
// A buyer takes each good it lacks from the seller it gets it cheapest from, delivered (after Project Alice and OpenTTD;
// TOWN_MONEY.trade): the seller's price × the deal (a realm that trades with it — dearer), ÷ how sure that price stands (a
// price that jumps, `sure`), × (1 + the carriage: `carry` of the worth for each step of the way's cost, the road worn there
// easing it — atlas/roads.js), less the bond of the pair (`bond` × how much of it the buyer took from this seller lately —
// l.vol: a buyer keeps to its seller). The carriage goes to the seller's people (the carters); what a pair carries a season is at
// most its link's room (`room` + `roomRoad` × how well the way is roaded, in gold of goods: atlas/roads.js l.road)
function worksBuying(C, prep) {
  const {a, towns, links, deal} = C, realmBy = new Map((a.realms || []).map(r => [r.id, r]));
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
  // (the reasons — for the probes, never read by the game: what of a lack a seller had and the buyer could not pay for, what a
  // weak link did not carry; the rest nobody it deals with had → t.econ.why.works, at the buying's end)
  const why = new Map(towns.map(t => [t.id, {gold: r2(Math.max(0, t.makersGold)), want: {...lack.get(t.id)}, money: {}, route: {}, room: {}}]));
  const cut = (W, g, k, v) => { if (v > M.dust) W[k][g] = (W[k][g] || 0) + v; };
  const sold = new Map(), got = new Map(), wanted = C.wanted = new Map();
  const put = (m, id, g, n) => { const o = m.get(id) || {}; o[g] = (o[g] || 0) + n; m.set(id, o); };
  // a good from one seller: `w` — the way (its least conductance `c`, its cost, the pair's link `pair` — null until the goods
  // first go: then a trade route is made), the most that comes at the delivered price
  const buyGood = (b, s, w, g) => {
    const L = lack.get(b.id), P = spare.get(s.id), k = deal(b, s);
    if (!L || !P || !k || !(L[g] > 0) || !(P[g] > 0)) return 0;
    // (the purse: the makers', and the budget the realm gave the town for this good — atlas/townNeeds.js `metal.budget` — spent first)
    const B = b.budget?.[g], purse = Math.max(0, b.makersGold) + (B?.gold || 0);
    const price = priceAt(s, g) * k, carry = carriageOf(a, w.cost), unit = price * (1 + carry);
    const pair = w.pair || (a.net ? a.net.links.get(linkKey(b, s)) || null : null);
    const room = pair ? Math.max(0, roomOf2(pair) - (pair.carried || 0)) : roomOfWay(w);
    const n = Math.min(L[g], P[g] * w.c, purse / unit, room / price);
    // (what of it the way did not carry: a weak way — `route`; a full one, its room spent this season — `room`; the purse — `money`)
    const W = why.get(b.id), byWay = Math.min(L[g], P[g], P[g] * w.c), byRoom = Math.min(byWay, room / price);
    cut(W, g, 'route', Math.min(L[g], P[g]) - byWay); cut(W, g, 'room', byWay - byRoom); cut(W, g, 'money', byRoom - Math.max(0, n));
    if (n < M.dust) return 0;
    const v = n * price, c = n * price * carry;
    const fromB = Math.min(v + c, B?.gold || 0);
    if (fromB > 0) { B.gold = r2(B.gold - fromB); B.got = r2(B.got + n * fromB / (v + c)); }
    L[g] -= n; P[g] -= n; b.makersGold = r2(b.makersGold - (v + c - fromB)); s.makersGold = r2(s.makersGold + v); earn(s, 'makers', v);
    s.peopleGold = r2(s.peopleGold + c); earn(s, 'people', c); add(b.trade, 'carry', c);   // the carters are the seller's people
    if (b.realm !== s.realm) {   // customs: the buyer's realm takes `duty` of it, of the buyer's makers (from the branch Elves)
      const R = realmBy.get(b.realm), d = Math.min(Math.max(0, b.makersGold), v * M.realm.duty);
      if (R && d > 0) { b.makersGold = r2(b.makersGold - d); R.gold = r2((R.gold || 0) + d); fiscOf(R).duty = r2(fiscOf(R).duty + d); }
    }
    // the goods go down the pair's link: a seller more than a hop away gets a link of its own with the buyer (a trade route: the
    // net keeps it while the goods keep coming, atlas/sites.js stepNet, and its road wears, atlas/roads.js wearRoads)
    if (!w.pair && a.net) w.pair = pairLink(a, b, s, w.cost);
    if (w.pair) { w.pair.goods = (w.pair.goods || 0) + v; w.pair.carried = (w.pair.carried || 0) + v; const key = `${s.id}>${g}`; (w.pair.took ||= {})[key] = (w.pair.took[key] || 0) + n; }
    put(sold, s.id, g, n); put(got, b.id, g, n);
    add(b.trade, 'bought', v); add(s.trade, 'sold', v); add(b.trade, 'boughtN', n);   // (boughtN — the goods themselves, for the probes)
    return n;
  };
  // the delivered price of a unit of `g` from `s` down the way `w` (the buyer's ranking of its sellers)
  const offer = (b, s, w, g) => {
    const k = deal(b, s);
    if (!k) return Infinity;
    const T = M.trade, took = w.pair?.vol?.[`${s.id}>${g}`] || 0, L0 = why.get(b.id).want[g] || 0;
    return priceAt(s, g) * k / sureOf(s, g) * (1 + carriageOf(a, w.cost)) * (1 - T.bond * Math.min(1, L0 > 0 ? took / L0 : 0));
  };
  // at home — the province's pool (realmPool); abroad — link by link (the command `town.buy.works`: data/commands.js)
  if (allowed(a.cfg, 'town.buy.works')) {
    const ways = realmPool(C, lack, spare);
    for (const l of links) if (l.p.realm !== l.q.realm) for (const [b, s] of [[l.p, l.q], [l.q, l.p]]) { const W = ways.get(b.id) || ways.set(b.id, []).get(b.id); W.push([s, {c: l.c, cost: costOfLink(a, l), pair: l}]); }
    const orders = new Map();   // the makers' purse left for the orders, by buyer
    for (const t of towns) {
      const L = lack.get(t.id), W = ways.get(t.id);
      if (!L || !W) continue;
      for (const g of Object.keys(L)) {
        if (!(L[g] > 0)) continue;
        const by = W.filter(([s]) => spare.get(s.id)?.[g] > 0).map(([s, w]) => [s, w, offer(t, s, w, g)]).filter(x => x[2] < Infinity).sort((p, q) => p[2] - q[2] || p[0].id - q[0].id);
        for (const [s, w] of by) { if (!(L[g] > M.dust)) break; buyGood(t, s, w, g); }
        // what it still wants of a seller that had it and that it could pay — what the way did not carry: the seller's demand it
        // could not meet (C.wanted: loadStep does not cut its makers for it)
        // — an order no bigger than its lack, laid on the sellers in the order it ranks them, each up to what it still has and to
        // what the purse left buys at that seller's full delivered price (orderOf)
        if (L[g] > M.dust) {
          const rest = by.filter(([s]) => spare.get(s.id)?.[g] > M.dust).map(([s, w]) => [s.id, priceAt(s, g) * deal(t, s) * (1 + carriageOf(a, w.cost)), spare.get(s.id)[g]]);
          // (the makers' purse is one for all the goods it orders: what one good's order would cost is not there for the next)
          const free = orders.get(t.id) ?? Math.max(0, t.makersGold), o = orderOf(L[g], free + (t.budget?.[g]?.gold || 0), rest);
          for (const [id, n] of o.by) put(wanted, id, g, n);
          orders.set(t.id, Math.max(0, free - o.cost));
        }
      }
    }
  }
  // what each pair took this season becomes its memory (l.vol: `keep` of the old and the rest of this season's), and its room is free again
  for (const l of a.net?.links.values() || []) {
    if (!l.vol && !l.took) { delete l.carried; continue; }
    const V = l.vol || {}, T = l.took || {};
    for (const key of new Set([...Object.keys(V), ...Object.keys(T)])) { const v = (V[key] || 0) * M.trade.keep + (T[key] || 0) * (1 - M.trade.keep); if (v > M.dust) V[key] = r2(v); else delete V[key]; }
    if (Object.keys(V).length) l.vol = V; else delete l.vol;
    delete l.took; delete l.carried;
  }
  // the dwarves' reworking (data/townBuildings.js `recycle`): what is left over into what is still lacking
  for (const t of towns) recycle(t, lack.get(t.id), spare.get(t.id), (g, n) => put(got, t.id, g, n));
  // the buyers work with what came
  for (const t of towns) { const G = got.get(t.id); if (!G) continue; for (const [g, n] of Object.entries(G)) t.stock[g] = (t.stock[g] || 0) + n; const [h, p] = prep.get(t); setEcon(t, townEconomy(a, t, h, fromStore(t), p)); }
  // (what the sellers of the whole world still had once the buying was done: what a buyer lacked of it was there, out of its reach)
  const anywhere = {};
  for (const S2 of spare.values()) for (const [g, n] of Object.entries(S2 || {})) if (n > M.dust) anywhere[g] = (anywhere[g] || 0) + n;
  for (const t of towns) t.econ.why = {works: reasons(why.get(t.id), lack.get(t.id), anywhere)};
  return sold;
}
// the link of a buyer and a seller more than a hop apart, made when the goods first go (a trade route) — or the one the other
// direction's buying made already this season: one link, one room, one memory for both
export function pairLink(a, b, s, cost) {
  const key = linkKey(b, s);
  let l = a.net.links.get(key);
  if (!l) a.net.links.set(key, l = {p: s, q: b, c: NET.start, flow: 0, cost});
  return l;
}
// a buyer's order still wanting carriage: of its lack `L`, seller by seller in the buyer's order (`rest`: [id, delivered unit, what
// it still has]), as much as that seller has and as the purse left buys at that seller's own delivered price — the order never
// costs more than the purse → {by: [[seller id, how much]], cost}
export function orderOf(L, purse, rest) {
  let q = L, left = Math.max(0, purse), cost = 0;
  const by = [];
  for (const [id, unit, has] of rest) {
    if (!(q > M.dust) || !(left > M.dust)) break;
    const n = Math.min(q, has, unit > 0 ? left / unit : 0);
    if (!(n > M.dust)) continue;
    by.push([id, n]); q -= n; left -= n * unit; cost += n * unit;
  }
  return {by, cost};
}
// the carriage, as a share of the worth: `carry` for each step of the way's cost (a world of another size: × its scale)
const carriageOf = (a, cost) => M.trade.carry * cost / scaleOf(a);
// the cost of a link's way: what its road costs to walk (atlas/roads.js, worked out as its road is worn), else by its length
const costOfLink = (a, l) => l.cost ?? Math.hypot(l.p.x - l.q.x, l.p.y - l.q.y) * M.trade.step;
// how much a pair's link carries a season, in gold of goods: by how well its way is roaded (l.road, 0 … 1)
const roomOf2 = l => M.trade.room + M.trade.roomRoad * (l.road || 0);
const roomOfWay = w => M.trade.room + M.trade.roomRoad * (w.road || 0);
// how sure a town's price of a good stands: 1 less `sure` × how much it moved lately (t.swing), at least `sureFloor`
const sureOf = (t, g) => Math.max(M.trade.sureFloor, 1 - M.trade.sure * (t.swing?.[g] || 0));

// the reasons of what was left lacking, by good (for the probes): `W` — what was wanted, and what the sellers had and the buyer
// could not pay for (money) or a weak link did not carry (route), summed over the sellers it asked; `left` — what was still
// lacking at the end. What was left is laid first on the money, then on the route, then on the link's room; the rest none of its
// sellers had (goods) — `far` of it some town of the world still had, out of the buyer's reach (`anywhere`: good → what is left) →
// {gold: the buyer's purse at the start, by: {good: {want, left, money, route, room, goods, far}}}
function reasons(W, left, anywhere = {}) {
  const by = {};
  for (const [g, want] of Object.entries(W.want)) {
    if (!(want > M.dust)) continue;
    const l = Math.max(0, Math.min(want, left?.[g] || 0)), money = Math.min(l, W.money[g] || 0), route = Math.min(l - money, W.route[g] || 0), room = Math.min(l - money - route, W.room?.[g] || 0);
    const goods = l - money - route - room;
    by[g] = {want: r2(want), left: r2(l), money: r2(money), route: r2(route), room: r2(room), goods: r2(goods), far: r2(Math.min(goods, anywhere[g] || 0))};
  }
  return {gold: W.gold, by};
}

// ── the province's pool: the towns of one realm that the net joins (an island of the realm is a pool of its own) are each
// other's sellers — every seller of the province a buyer reaches by the net, by the cheapest way to it: its cost (the links'
// costs summed), the least conductance on it (a weak path carries less) and how well it is roaded (the least), and the pair's
// own link if they have one (a neighbour, or a trade route made before) → Map buyer id → [[seller, way]]
export function realmPool(C) {
  const {a, towns, links} = C, adj = new Map(), out = new Map();
  for (const l of links) if (l.p.realm === l.q.realm) { (adj.get(l.p.id) || adj.set(l.p.id, []).get(l.p.id)).push([l.q, l]); (adj.get(l.q.id) || adj.set(l.q.id, []).get(l.q.id)).push([l.p, l]); }
  for (const t of towns) {
    if (!adj.has(t.id)) continue;
    // the cheapest way over its province to each town (by the links' costs: a long direct road may cost more than two short
    // ones), its least conductance and road on that way
    const ways = new Map([[t.id, {c: 1, cost: 0, road: 1, hop: 0}]]), done = new Set(), byId = new Map([[t.id, t]]);
    for (;;) {
      let x = null, wx = null;
      for (const [id, w] of ways) if (!done.has(id) && (!wx || w.cost < wx.cost || (w.cost === wx.cost && id < x))) { x = id; wx = w; }
      if (x == null) break;
      done.add(x);
      for (const [o, l] of adj.get(x) || []) {
        if (done.has(o.id)) continue;
        const cost = wx.cost + costOfLink(a, l), w = ways.get(o.id);
        if (!w || cost < w.cost) { ways.set(o.id, {c: Math.min(wx.c, l.c), cost, road: Math.min(wx.road, l.road || 0), hop: wx.hop + 1}); byId.set(o.id, o); }
      }
    }
    const W = [];
    for (const [id, w] of ways) {
      if (id === t.id) continue;
      const o = byId.get(id);
      w.pair = a.net?.links.get(linkKey(t, o)) || null;
      if (w.pair?.cost != null && w.hop > 1) w.cost = Math.min(w.cost, w.pair.cost);
      W.push([o, w]);
    }
    W.sort((p, q) => p[0].id - q[0].id);
    out.set(t.id, W);
  }
  return out;
}

// ── the season's store: what was made, less what was used and sold; the gold of the works to the makers
export function seasonStore(towns, sold) {
  for (const t of towns) {
    const e = t.econ, out = sold.get(t.id) || {};
    const works = ((e.made.gold || 0) - (e.used.gold || 0)) / S; t.makersGold = r2(t.makersGold + works); t.trade.works = r2(works); if (works > 0) earn(t, 'makers', works);
    comeIn('works', works); goOut('works', -works);
    for (const g of new Set([...Object.keys(e.made), ...Object.keys(e.used), ...Object.keys(t.stock)])) {
      if (!stored(g)) continue;
      // what keeps only so long (TOWN_GOODS `keep`, seasons; after OpenTTD's cargo ageing): a share of what lay in the store rots —
      // of what is left of the old store once the season took from it all it took: the sale, and what its works used over what
      // they made (never of what went out; the season's own making does not rot)
      const k = TOWN_GOODS.get(g).keep, old = t.stock[g] || 0, sold = out[g] || 0, net = ((e.made[g] || 0) - (e.used[g] || 0)) / S;
      const left = Math.max(0, old - sold - Math.max(0, -net)), rot = k > 0 ? left / k : 0;
      if (rot > 0) add(t.trade, 'rotted', rot * goodPrice(g));
      t.stock[g] = Math.max(0, old - rot + net - sold);
    }
  }
}

// ── the people's needs: the wants fixed at the season's start; the basic ones first, at home and then in the linked towns,
// then the comfort ones the same way; what they got → t.needs, t.econ.people
function peopleNeeds(C) {
  const {towns, links, deal} = C;
  const want = new Map(), had = new Map();
  for (const t of towns) { const W = wants(t); want.set(t.id, {left: {basic: {...W.basic}, comfort: {...W.comfort}}, all: W}); had.set(t.id, {basic: 0, comfort: 0}); }
  // (the reasons — for the probes, as the works' buying keeps them: t.econ.why.people; and what the wants would cost at home)
  const why = new Map(towns.map(t => [t.id, Object.fromEntries(KINDS.map(kind => [kind, {gold: r2(Math.max(0, t.peopleGold)), want: {...want.get(t.id).all[kind]}, money: {}, route: {}}]))]));
  const cut = (W, g, k, v) => { if (v > M.dust) W[k][g] = (W[k][g] || 0) + v; };
  const home = (t, kind) => {
    const W = want.get(t.id).left[kind], H = had.get(t.id);
    for (const [g, n] of Object.entries(W)) {
      const price = priceAt(t, g), k = Math.min(n, forPeople(t, g), Math.max(0, t.peopleGold) / price);
      cut(why.get(t.id)[kind], g, 'money', Math.min(n, forPeople(t, g)) - Math.max(0, k));
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
      const Y = why.get(b.id)?.[kind]; if (Y) { cut(Y, g, 'route', Math.min(n, have) - Math.min(n, have * l.c)); cut(Y, g, 'money', Math.min(n, have * l.c) - Math.max(0, q)); }
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
    const Y = why.get(t.id), cost = kind => r2(Object.entries(all[kind]).reduce((s, [g, n]) => s + n * priceAt(t, g), 0));
    (t.econ.why ||= {}).people = Object.fromEntries(KINDS.map(kind => [kind, {...reasons(Y[kind], left[kind]), cost: cost(kind)}]));
  }
}

// ── the season's close of a town: the merchants, the wages, the taxes, the upkeep, the market's prices
function closeSeason(a, t, wanted, sold) {
  takenStep(t, sold);
  sellOver(t);
  loadStep(t, wanted);
  payWages(t);
  takeTaxes(t);
  payUpkeep(t, realmOf(a, t.realm));
  setPrices(t);
}
// the store: what is over its room goes to the merchants — the dearest first, as far as their purse goes (the town's people ×
// its trade); the rest rots, is burnt or carried off for nothing
export function sellOver(t) {
  const fair = M.merchants.at.some(id => t.built.includes(id)) ? M.merchants.fair : M.merchants.cheap, over = [];
  for (const g of Object.keys(t.stock)) {
    let v = t.stock[g];
    const room = roomOf(t, g);
    if (v > room) { over.push([g, v - room]); v = room; }
    if (v >= M.dust) t.stock[g] = r2(v); else delete t.stock[g];
  }
  t.econ.over = Object.fromEntries(over);   // (what went over the room, by good: loadStep reads it)
  let purse = M.merchants.purse * t.pop * (1 + townFx(t).trade);
  for (const [g, n] of over.sort((p, q) => goodPrice(q[0]) - goodPrice(p[0]))) {
    const unit = goodPrice(g) * fair, k = Math.min(n, purse / unit), m = k * unit;
    purse -= m; t.makersGold = r2(t.makersGold + m); add(t.trade, 'merchants', m); if (m > 0) earn(t, 'makers', m); comeIn('merchants', m);
    add(t.trade, 'dumped', k * goodPrice(g));   // (the worth of what the merchants took, at its own price: for the probes)
    if (n > k) add(t.trade, 'wasted', (n - k) * goodPrice(g));
  }
}
// the load of each work (t.load, saved; after OpenTTD's smooth economy, without its dice): what of its goods found a taker this
// season — the town's works, its people, other towns, its store — against what went over the store's room to the merchants and the
// rot, by worth; at `up` or more of it taken its load goes up `step`, at `down` or less down, within `least` … 1 (TOWN_FLOW.load).
// What is not stored (food, raw food, gold) always counts as taken, and so does as much of the overflow as buyers who reached it and
// could pay still wanted (`wanted`, t.econ.wanted, by quantity: it wants carrying, not cutting); a work that gave no stored goods is
// not judged: its load comes back up
export function loadStep(t, wanted = {}) {
  const e = t.econ, L = F.load, over = e.over || {}, got = {};
  // (what is not stored — food and raw food down the net, gold to the purse — always finds its taker)
  const gave = (id, G) => { const o = got[id] ||= {all: 0, lost: 0, kept: 0}; for (const [g, v] of Object.entries(G || {})) { if (!(v > 0)) continue; const w = v * goodPrice(g), m = (e.made[g] || 0) / S; o.all += w; if (stored(g)) { o.kept += w; o.lost += w * (m > 0 ? Math.min(1, Math.max(0, (over[g] || 0) - (wanted[g] || 0)) / m) : 0); } } };
  for (const r of e.rows) gave(r.id, Object.fromEntries(Object.entries(r.gave).map(([g, v]) => [g, v / S])));
  for (const x of e.recipes || []) gave(x.of, Object.fromEntries(Object.entries(x.gave).map(([g, v]) => [g, v / S])));
  const out = {};
  for (const id of new Set(t.built)) {
    if (TOWN_BUILDINGS.get(id)?.cat === 'housing') continue;
    const was = t.load?.[id] ?? 1, o = got[id];
    let v = was;
    if (!o || !(o.kept > M.dust)) v = Math.min(1, was + L.step);
    else { const taken = 1 - o.lost / o.all; if (taken >= L.up) v = Math.min(1, was + L.step); else if (taken <= L.down) v = Math.max(L.least, was - (L.stepDown ?? L.step)); }
    if (v < 1 - 1e-9) out[id] = Math.round(v * 1000) / 1000;
  }
  if (Object.keys(out).length) t.load = out; else delete t.load;
}
// what was taken of each good this season — by its works, its people and the buyers of other towns — into its smoothed mean
// (t.taken, saved: `takenKeep` of the old mean and the rest of the season's); the store's room goes by it (roomOf)
export function takenStep(t, sold) {
  const e = t.econ, T = {}, P = e.people || {};
  for (const g of new Set([...Object.keys(e.used), ...Object.keys(sold), ...Object.keys(P), ...Object.keys(t.taken || {})])) {
    if (!stored(g)) continue;
    const now = (e.used[g] || 0) / S + (sold[g] || 0) + (P[g]?.got || 0), v = (t.taken?.[g] || 0) * M.takenKeep + now * (1 - M.takenKeep);
    if (v > M.dust / 10) T[g] = Math.round(v * 1000) / 1000;
  }
  if (Object.keys(T).length) t.taken = T; else delete t.taken;
}
// the wages: for the free hands at work (the slaves are not paid), as far as the makers' purse goes
function payWages(t) {
  const e = t.econ, hands = Math.max(0, e.hands - (t.slaves || 0) * TOWN_FLOW.slaves.work - e.freeHands);   // the free hands its works took
  const bill = hands * M.makers.wage, wage = Math.min(bill, Math.max(0, t.makersGold));
  t.makersGold = r2(t.makersGold - wage); t.peopleGold = r2(t.peopleGold + wage); earn(t, 'people', wage);
  add(t.trade, 'wages', wage); if (bill > wage) add(t.trade, 'owed', bill - wage);
}
// the taxes: of what the makers and the people earned this season (before the upkeep: the treasury pays with them)
function takeTaxes(t) {
  const tm = Math.min(Math.max(0, t.makersGold), (t.trade.makersIn || 0) * M.makers.tax), tp = Math.min(Math.max(0, t.peopleGold), (t.trade.peopleIn || 0) * M.people.tax);
  t.makersGold = r2(t.makersGold - tm); t.peopleGold = r2(t.peopleGold - tp); t.gold = r2(t.gold + tm + tp); add(t.trade, 'tax', tm + tp);
}
// the upkeep: from the treasury (and the realm's, R) to the people who keep the buildings (their pay is taxed next season)
function payUpkeep(t, R) {
  const cost = upkeepYear(t) / S;
  let owe = cost;
  const pay = Math.min(owe, Math.max(0, t.gold)); t.gold = r2(t.gold - pay); owe -= pay;
  if (owe > 0 && R && R.gold > 0) { const p = Math.min(owe, R.gold); R.gold = r2(R.gold - p); owe -= p; t.trade.aid = r2(p); }
  t.peopleGold = r2(t.peopleGold + cost - owe); add(t.carry ||= {}, 'peopleIn', cost - owe);
  t.trade.upkeep = r2(cost);
  t.unpaid = cost > 0 ? Math.round(owe / cost * 1000) / 1000 : 0;
}
// the season's prices of its market (saved; after Project Alice): each good's price × (t.market) lives in the town and moves a
// share of the way to where the season's pressure on it points. The pressure is how sure a seller is to sell less how sure a
// buyer is to buy: sell = min(D / S, 1), buy = min(S / D, 1) — S what the town has of it a year (made and in store), D what
// its works and its people want of it a year (each + `smooth`, so a good nobody has nor wants stands at 1). Where it points:
// 1 + `gain` × p(sell − buy), p(x) = x + x²/2 + x³/6 — a want drives the price up further (≈ +0.83 at the most) than plenty
// drives it down (≈ −0.33); it goes `rise` of the way up a season and `fall` of the way down, within lo … hi
const pull = x => x + x * x / 2 + x * x * x / 6;
function setPrices(t) {
  const e = t.econ, P = M.price, mk = {}, seen = (e.why ||= {}).price = {}, want = e.people || {};   // (what the price saw: for the probes)
  for (const g of new Set([...Object.keys(t.market || {}), ...Object.keys(e.dem), ...Object.keys(e.made), ...Object.keys(t.stock), ...Object.keys(want)])) {
    if (!stored(g)) continue;
    const has = (e.made[g] || 0) + (t.stock[g] || 0) * S + P.smooth, wish = (e.dem[g] || 0) + (want[g]?.want || 0) * S + P.smooth;
    const x = Math.min(1, wish / has) - Math.min(1, has / wish), to = Math.max(P.lo, Math.min(P.hi, 1 + P.gain * pull(x)));
    const k0 = t.market?.[g] ?? 1, k = k0 + (to - k0) * (to > k0 ? P.rise : P.fall);
    seen[g] = {x: r2(x), to: r2(to)};
    if (Math.abs(k - 1) >= M.dust) mk[g] = Math.round(k * 1000) / 1000;
    // how much it moved lately (t.swing: `swingKeep` of the old, the rest of this season's move) — a seller's price that jumps is
    // less sure (sureOf)
    const sw = (t.swing?.[g] || 0) * M.trade.swingKeep + Math.abs(k - k0) * (1 - M.trade.swingKeep);
    if (sw > M.dust / 10) (t.swing ||= {})[g] = Math.round(sw * 10000) / 10000; else if (t.swing) delete t.swing[g];
  }
  t.market = mk;
}

// ── building (atlas/peoples.js): a plan of what a building takes — its materials from the store and from the linked towns, the
// people's work — and whether the town can pay it; then done. → the plan, or null (no materials, or no gold)
export function planBuild(a, t, b) {
  open(t);
  const B = M.build, step = Math.min(b.tier, B.labor.length - 1);
  if (step === 0) return {t, cost: 0, own: [], bought: [], labor: 0};   // a hamlet's work: the people's own hands, of what they find
  const own = [], bought = [];
  let mats = 0, gather = 0, hands = 0;
  for (const [g, n] of Object.entries(goodsFor(t.people, B.mats[b.cat] || B.mats.default))) {
    let need = n;
    const k = Math.min(need, t.stock[g] || 0);
    if (k > 0) { own.push([g, k, k * priceAt(t, g)]); mats += k * priceAt(t, g); need -= k; }
    for (const [s, l] of need > 0 ? linksOf(a, t) : []) {
      const d = dealOf(a, t, s), q = d ? Math.min(need, forOthers(s, g) * l.c) : 0;
      if (q < M.dust) continue;
      const v = q * priceAt(s, g) * d; bought.push([s, g, q, v, l]); mats += v; need -= q;
      if (need < M.dust) break;
    }
    if (need >= M.dust && B.gather.goods.includes(g)) { gather += need * goodPrice(g) * B.gather.k; hands += need * B.gather.hands; need = 0; }   // the people fetch it by hand, dearly
    if (need >= M.dust) return null;   // the materials are not to be had
  }
  const labor = B.labor[step], cost = mats + labor + gather, payer = B.payer[b.cat] || B.payer.default;
  if ((t.grant || 0) + Math.max(0, t[payer]) < cost) return null;
  if (hands && t.econ && t.econ.freeHands < hands) return null;   // nobody free to fetch it
  return {t, cost, own, bought, labor, gather, hands, payer};
}
export function doBuild(P) {
  const {t, cost, own, bought, labor, hands, payer} = P;
  if (!cost) return;
  goOut('gather', P.gather);   // (the gathering by hand: paid to nobody)
  // the gathering by hand costs what it costs (its gold goes to nobody: the hours of those who fetched it), and takes hands
  if (hands && t.econ) t.econ.freeHands -= hands;
  const carry = t.carry ||= {};
  const fromGrant = Math.min(t.grant || 0, cost);
  t.grant = r2((t.grant || 0) - fromGrant); t[payer] = r2(t[payer] - (cost - fromGrant));
  const used = t.econ ? (t.econ.build ||= {}) : {};   // what building took this year, by good (for the reports)
  for (const [g, k, v] of own) { t.stock[g] = r2(t.stock[g] - k); if (t.stock[g] < M.dust) delete t.stock[g]; t.makersGold = r2(t.makersGold + v); add(carry, 'makersIn', v); used[g] = (used[g] || 0) + k; }
  for (const [s, g, q, v, l] of bought) { s.stock[g] = r2(s.stock[g] - q); if (s.stock[g] < M.dust) delete s.stock[g]; s.makersGold = r2(s.makersGold + v); l.goods = (l.goods || 0) + v; used[g] = (used[g] || 0) + q; const sc = s.carry ||= {}; add(sc, 'makersIn', v); add(sc, 'sold', v); add(carry, 'bought', v); }
  t.peopleGold = r2(t.peopleGold + labor); add(carry, 'peopleIn', labor);
  t.builtCost = r2((t.builtCost || 0) + cost);   // what its building cost (for the cards)
}

// the cult of war (data/peoples.js warCult: the greenskins) drives off TOWN_MONEY.plunder.slaves of the people a beaten town
// lost (a raid's, a storm's) as slaves to the raiders' town (atlas/economy.js: they work its buildings) → how many
export function driveOff(raider, target, lost) {
  if (!raider || !target || !(lost > 0) || !peopleOf(raider.people)?.warCult) return 0;
  const n = lost * M.plunder.slaves;
  raider.slaves = r2((raider.slaves || 0) + n);
  (raider.slavesOf ||= {})[target.people] = r2((raider.slavesOf[target.people] || 0) + n);   // whose kin (atlas/deeds/liberate.js)
  return n;
}
// ── plunder (atlas/deeds/captives.js, raidTown.js; atlas/diplomacy.js, the storm): the raiders carry off `share` of the beaten
// town's goods and gold (× its people's cult of war: the greenskins), the gold to the raiders' people, the goods to their store
// → [gold, the goods' worth], or null
export function plunder(raider, target, share) {
  if (!raider || !target) return null;
  open(raider); open(target);
  const k = Math.min(1, share * (peopleOf(raider.people)?.warCult ? M.plunder.cult : 1));
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
let BY_RES = null;   // (made when first asked, again after an edit of the tables)
onEdit(() => { BY_RES = null; });
export const goodOfRes = res => (BY_RES ||= new Map(TOWN_GOODS.all().filter(g => g.res).map(g => [g.res, [g.id, 1 / (g.per || 1)]]))).get(res) || null;
// × the price of a good at this town's market this season
export const marketK = (t, g) => (g && t.market?.[g]) || 1;
// the caravan pays the town's makers, or they pay the caravan as far as their purse goes → what was paid
export const toTown = (t, p) => { if (t.makersGold == null && t.gold == null) return p; t.makersGold = r2((t.makersGold ?? 0) + p); comeIn('caravan', p); return p; };
export const fromTown = (t, p) => { if (t.makersGold == null) return Math.max(0, p); const v = Math.max(0, Math.min(p, t.makersGold)); t.makersGold = r2(t.makersGold - v); goOut('caravan', v); return v; };
// what the caravan sells goes into the town's store; what it buys comes out of it
export const intoStore = (t, g, n) => { if (!g || !stored(g)) return; t.stock ||= {}; t.stock[g] = r2((t.stock[g] || 0) + n); };
export const outOfStore = (t, g, n) => { if (!g || !t.stock?.[g]) return; const v = t.stock[g] - n; if (v >= M.dust) t.stock[g] = r2(v); else delete t.stock[g]; };
// what the town's makers can pay
export const townPurse = t => (t.makersGold == null ? Infinity : Math.max(0, t.makersGold));

// the realm's grants (atlas/kingdom.js, once a year after the tax): `spend` × (1 − `army`) of its treasury, to build (t.grant:
// gold, kept till spent), by the council's wind (atlas/mind.js councilShares) — a realm without a council yet (the wild era, an
// old save) by its towns' people. Its garrisons are paid each season (realmKeep)
export function realmSpend(realm, towns, war, a = null) {
  const R = M.realm, pop = towns.reduce((s, t) => s + t.pop, 0) || 1;
  const budget = Math.max(0, realm.gold || 0) * R.spend * (1 - (war ? R.army.war : R.army.peace));
  const grants = new Map(a ? councilShares(a, realm, towns, budget) : towns.map(t => [t, budget * t.pop / pop]));
  let build = 0;
  for (const t of towns) {
    const room = Math.max(0, R.build * R.hoard - (t.grant || 0)), g = Math.min(room, grants.get(t) || 0);
    if (g > 0) { t.grant = r2((t.grant || 0) + g); build += g; }
  }
  realm.gold = r2(realm.gold - build);
  fiscOf(realm).spent = r2(fiscOf(realm).spent + build);
  return (realm.spent = {...(realm.spent || {}), build: r2(build)});
}

// what the realm's store lacks of each good it keeps (TOWN_MONEY.realm.kind: for each 100 of its people)
export const realmLacks = (realm, pop) => Object.fromEntries(Object.entries(M.realm.kind).map(([g, k]) => [g, Math.max(0, k * pop / 100 - (realm.stock?.[g] || 0))]).filter(([, v]) => v > M.dust));
const toRealm = (realm, g, n) => { if (!(n > 0)) return; realm.stock ||= {}; realm.stock[g] = r2((realm.stock[g] || 0) + n); };
const outOfRealm = (realm, g, want) => { const n = Math.max(0, Math.min(want, realm.stock?.[g] || 0)); if (n > 0) { realm.stock[g] = r2(realm.stock[g] - n); if (realm.stock[g] < M.dust) delete realm.stock[g]; } return n; };

// the year's tax (atlas/kingdom.js, at the year's end): the share of each town's treasury above its keep, by the realm's edict
//   — `rate` of its gold over its keep; and, in kind, `rate` of what its store can spare of the goods the realm keeps
//   (TOWN_MONEY.realm.kind), as far as the realm's store lacks them (what the town would sell off anyway) → the gold the realm got
export function taxYear(realm, towns, level) {
  const rate = M.tax.rate[level] ?? M.tax.rate.usual, c = corruptShare(realm), F = fiscOf(realm);
  const lack = realmLacks(realm, towns.reduce((s, t) => s + (t.pop || 0), 0));
  let sum = 0, kind = 0;
  for (const t of towns) {
    const over = Math.max(0, (t.gold || 0) - M.tax.keep * t.pop), spare = {};
    for (const g of Object.keys(M.realm.kind)) { const n = t.stock ? forOthers(t, g) : 0; if (n > 0) spare[g] = n; }
    const due = rate * over;
    for (const [g, n] of Object.entries(spare)) {
      const k = Math.min(rate * n, lack[g] || 0);
      if (!(k > M.dust)) continue;
      outOfStore(t, g, k); lack[g] -= k; kind += k * goodPrice(g);
      toRealm(realm, g, k * (1 - c));   // corruption takes its share of the goods too
    }
    const v = Math.max(0, Math.min(over, due));
    if (v > 0) { t.gold = r2(t.gold - v); sum += v; }
  }
  // corruption takes its share on the way (from the branch Elves): it leaves the world (the officials' purses)
  const lost = sum * c;
  goOut('corruption', lost);
  realm.gold = r2((realm.gold || 0) + sum - lost);
  F.tax = r2(F.tax + sum + kind); F.kind = r2(F.kind + kind); F.lost = r2(F.lost + lost + kind * c);
  return sum - lost;
}
// what corruption takes of what the realm collects (data/kingdom.js RUINS corruption; TOWN_MONEY.realm corrupt, corruptMax)
export const corruptShare = realm => Math.min(M.realm.corruptMax, M.realm.corrupt * (realm.kingdom?.ruin?.corruption || 0));
// the realm's ledger of the year (realm.fisc.year), for its card and the edict of dues; last year's in realm.fisc.last
export function fiscOf(realm) {
  const F = realm.fisc ||= {year: null, last: null};
  return (F.year ||= {tax: 0, kind: 0, lost: 0, court: 0, courtUnpaid: 0, wages: 0, wagesUnpaid: 0, food: 0, foodShort: 0, kit: 0, duty: 0, tribute: 0, loot: 0, spent: 0});
}
// the years of its spending the realm's treasury holds (the edict of dues reads it: data/kingdom.js `reserve`)
export const reserveOf = realm => { const L = realm.fisc?.last, out = L ? L.court + L.wages + L.spent - L.tribute * (L.tribute < 0 ? 1 : 0) : 0; return out > 0 ? (realm.gold || 0) / out : 99; };

// ── the realm's court, paid once a year before it grants (atlas/kingdom.js; from the branch Elves): what the court is not
// paid grows the decay (data/kingdom.js `court`) → the share of the court unpaid. Its armies are paid each season (realmKeep)
export function realmDuties(a, realm, towns) {
  const R = M.realm, F = fiscOf(realm), pop = towns.reduce((s, t) => s + t.pop, 0);
  const offices = Object.values(realm.kingdom?.court || {}).filter(Boolean).length, court = offices * R.court * pop / 1000;
  const paidC = Math.min(court, Math.max(0, realm.gold || 0));
  realm.gold = r2((realm.gold || 0) - paidC); F.court = r2(F.court + paidC); goOut('court', paidC);
  const unpaid = court > 0 ? 1 - paidC / court : 0; F.courtUnpaid = r2(F.courtUnpaid + court - paidC);
  return unpaid;
}

// ── a season of the realm's war host, out of its treasury (atlas/kingdom.js stepRealmKeep):
//   garrisons — `spend` × `army` (more at war) of its gold a year, a man a year for `man` gold: t.garrison men by the towns'
//     people, their pay to the town's people;
//   its armies in the field — `wage` a man a year in gold (what it cannot pay, `desert` of the unpaid share of the men leave
//     in a year); a store a man a year for food out of its store (fed, the days they ate come back to their supplies: unfed,
//     they eat what they carry — data/parties.js ARMY.supplies); their arms and armour wear by ARMY.wear.season and are made
//     up to ARMY.kit out of its store → {garrison, wages, food, short}
export function realmKeep(a, realm, towns, war) {
  const R = M.realm, F = fiscOf(realm), pop = towns.reduce((s, t) => s + t.pop, 0) || 1;
  const garrison = Math.max(0, realm.gold || 0) * R.spend * (war ? R.army.war : R.army.peace) / S, men = garrison * S / R.man;
  for (const t of towns) {
    const share = t.pop / pop;
    open(t);
    t.garrison = r2(men * share); t.peopleGold = r2(t.peopleGold + garrison * share); add(t.carry ||= {}, 'peopleIn', garrison * share);
  }
  realm.gold = r2((realm.gold || 0) - garrison); F.spent = r2(F.spent + garrison);
  const armies = (a.parties || []).filter(p => p.kind === 'army' && p.owner === realm.id && p.state !== 'gone' && p.men > 0);
  const owed = armies.reduce((s, p) => s + p.men * R.wage / S, 0), paid = Math.min(owed, Math.max(0, realm.gold || 0));
  realm.gold = r2((realm.gold || 0) - paid); F.wages = r2(F.wages + paid); goOut('army', paid);
  if (owed > paid) {
    const unpaid = 1 - paid / owed; F.wagesUnpaid = r2(F.wagesUnpaid + owed - paid);
    for (const p of armies) p.men = Math.max(0, p.men * (1 - R.desert * unpaid / S));
  }
  const eat = armies.reduce((s, p) => s + p.men / S, 0), food = outOfRealm(realm, 'stores', eat), fed = eat > 0 ? food / eat : 1;
  F.food = r2(F.food + food); F.foodShort = r2(F.foodShort + eat - food);
  for (const p of armies) {
    if (fed > 0) p.supplies = Math.min(Math.max(p.supplies, ARMY.supplies), p.supplies + fed * SEASON_DAYS);
    p.kit ||= {};
    for (const [g, k] of Object.entries(ARMY.kit)) {
      if (g !== 'herbs' && p.kit[g]) p.kit[g] = r2(p.kit[g] * (1 - ARMY.wear.season));
      const n = outOfRealm(realm, g, p.men * k - (p.kit[g] || 0));
      if (n > 0) { p.kit[g] = r2((p.kit[g] || 0) + n); F.kit = r2(F.kit + n * goodPrice(g)); }
    }
  }
  return (realm.keep = {garrison: r2(garrison), men: r2(men), wages: r2(paid), food: r2(food), short: r2(eat - food)});
}

// ── tribute (atlas/kingdom.js, once a year): what a realm pays out of its surplus — `share` of its treasury over its floor
// (TOWN_MONEY.realm.tribute.floor gold for each 100 of its people, after Emberfall: the payer is never bled dry): to the winner of a
// war it sued for peace in, while the peace holds it to (r.owe: DIPLOMACY.peace.share; atlas/deeds/makePeace.js); else (from the
// branch Elves) a realm that hates a neighbour (attitude below `tribute.below`) and is `tribute.ratio` times weaker pays it
// `tribute.share` → [payee, gold] or null
export function payTribute(a, realm, towns, mightOf, attitude) {
  const T = M.realm.tribute, pop = towns.reduce((s, t) => s + (t.pop || 0), 0), over = Math.max(0, (realm.gold || 0) - T.floor * pop / 100);
  const owe = Object.values(a.rel || {}).map(r => r.owe).find(o => o?.from === realm.id && o.until >= (a.hist?.year ?? 0));
  let best = null, share = 0;
  if (owe) { best = (a.realms || []).find(o => o.id === owe.to && o.fallen == null) || null; share = DIPLOMACY.peace.share; }
  if (!best) {
    const mine = mightOf(realm.id);
    let bm = 0;
    for (const o of a.realms || []) {
      if (o === realm || o.fallen != null || attitude(a, realm.id, o.id) >= T.below) continue;
      const m = mightOf(o.id);
      if (m >= T.ratio * Math.max(1e-9, mine) && m > bm) { bm = m; best = o; }
    }
    share = T.share;
  }
  if (!best || !(over > M.dust)) return null;
  const v = over * share;
  realm.gold = r2(realm.gold - v); best.gold = r2((best.gold || 0) + v);
  fiscOf(realm).tribute = r2(fiscOf(realm).tribute - v); fiscOf(best).tribute = r2(fiscOf(best).tribute + v);
  return [best, v];
}

// ── a seat stormed (atlas/diplomacy.js): the stormers carry off `seat` of the beaten realm's treasury, to their realm's
export function lootSeat(a, from, beaten) {
  if (!from || !beaten || from === beaten || !((beaten.gold || 0) > M.dust)) return 0;
  const v = beaten.gold * M.realm.seat;
  beaten.gold = r2(beaten.gold - v); from.gold = r2((from.gold || 0) + v); fiscOf(from).loot = r2(fiscOf(from).loot + v);
  return v;
}
