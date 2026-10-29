// A town's household by the flows of its buildings (data/townBuildings.js): what it makes and uses up a day (the rate,
// a differential) and what lies in its stock (the integral of the rates over the days gone).
//
// Every season the world steps (atlas/history.js), the towns of each realm together (a town of no realm alone):
//   - hands: its working people (ECONOMY.work of them) against the `jobs` of everything built — a town short of hands
//     works every building at that share;
//   - ways: a building of several ways (TOWN_WORKS) works ONE of them, the one it worked last while it has the makings;
//     when they run out it switches to the first way of its people that has them (`t.econ.ways`, a building's nth copy);
//   - load: a building works at the share of hands and of the scarcest thing it takes (in its work, its upkeep, warmth,
//     the worth of its tools), the stock counting for its share of the days: a few passes settle the loads together;
//   - the people use up their needs (TOWN_GOODS `need`, a day per 100 of them) as far as there is of each; a people that
//     eats something raw (`eaten`) eats it where ready food runs short;
//   - a people that sells some goods at once (TRADE_UP: the orcs) sells them for its own good at `rate` of the worth;
//   - the loads settle on what the realm makes and holds together; a town that runs short of a good gets it from the towns
//     of its realm with a surplus, ECONOMY.haul of it arriving (`t.econ.trade`: + brought, − sent, a day);
//   - the stock takes rate × days, rots by each good's `spoil` a day (a granary or a cellar keeps some: STORAGE) and
//     never goes below nothing.
// It runs without a die and changes nothing else in the world yet: the town's growth, its food and its fame still come
// from atlas/towns.js. What it is good for now: the town's card shows it, a caravan buys arms, tools and armour only
// as far as the town has their worth in the stock (campaign/town.js).
import {goodPrice} from '../data/townBuildings.js';
import {TOWN_BUILDINGS, TOWN_GOODS, worksOf, upkeepOf, townStart, fuelFor, STORAGE, TRADE_UP} from '../data/townBuildings.js';
import {keepOf, armyEats} from '../data/macro.js';

export const ECONOMY = {
  work: 0.5,             // share of the people who work in the buildings
  passes: 5,             // passes that settle the loads of the buildings together
  maxScale: 40,          // how far spare hands can widen a building (× its jobs)
  keepWay: 0.5,          // a way has its makings when at least this share of a full load of them is to hand
  switchWay: 0.2,        // a building leaves its way for another only when that one's lacking worth is this much (gold a day) more
  stockDays: 30,         // the stock is drawn on over so many days (a season): its share of a day
  haul: 0.85,            // of what a town sends to another of its realm, this much arrives
  reserve: 30,           // days of its people's food a town keeps in stores (smoked, salted, dried: the hungry eat them, armies
                         // march on them, settlers carry them, a besieged town lives on them); short of it, it asks for more
  reserveFill: 240,      // …filling what it lacks over so many days (stores come second to the daily bread)
  cold: 2, warm: 12,     // the cell's mean °C below which warmth costs climate.cold, above which climate.warm
  climate: {cold: 1.6, mild: 1, warm: 0.4},
};

const goodWorth = g => goodPrice(g) || 1;
const raceOk = (w, people) => !w.peoples || w.peoples.includes(people);
const keyOf = (id, n) => `${id}#${n}`;
const add = (o, k, v) => { if (v) o[k] = (o[k] || 0) + v; };

// what a town is asked a day beyond its people's needs, met as they are (the share met is `E.met`, by good):
//   - the armies that marched from it (data/macro.js ARMY_KEEP): their food (their pay and gear: the treasury);
//   - the building it is raising (atlas/build.js): the materials still missing, asked for within a season.
export function ordersOf(a, t) {
  const o = {};
  for (const p of a?.parties || []) if (p.kind === 'army' && p.from === t.id && p.state !== 'gone' && p.men > 0) {
    p.eat = armyRation(a, t, p);   // what it eats this season: stores while the realm has a season of them (keepArmy reads it)
    add(o, p.eat, (keepOf(p.people).food || 0) * p.men);   // its food; its pay, arms and armour come from the treasury (atlas/treasury.js)
  }
  const w = t.project && t.works?.[t.project];
  if (w) for (const [g, v] of Object.entries(w.mat)) if (v > 1e-6) add(o, g, v / ECONOMY.stockDays);
  return o;
}

// the ration an army eats: the first of its people's (data/macro.js ARMY_KEEP.eats) its realm holds a season of
export function armyRation(a, t, p) {
  const eats = armyEats(p.people), need = keepOf(p.people).food * p.men * ECONOMY.stockDays;
  return eats.find(g => (t.realm != null ? realmStock(a, t.realm, g) : stockOf(t, g)) >= need) || eats[eats.length - 1];
}

// the climate's share of warmth for a town (its cell's mean temperature)
function climateOf(a, t) {
  const T = a?.f?.temp ? a.f.temp[t.i] : 10;
  return T < ECONOMY.cold ? ECONOMY.climate.cold : T > ECONOMY.warm ? ECONOMY.climate.warm : ECONOMY.climate.mild;
}

// the units of a town: one per building it has, its copies told apart
function unitsOf(t) {
  const seen = {}, out = [];
  for (const id of t.built) {
    if (!TOWN_BUILDINGS.has(id)) continue;
    const n = seen[id] = (seen[id] || 0) + 1, b = TOWN_BUILDINGS.get(id);
    out.push({key: keyOf(id, n), b, ways: worksOf(b).filter(w => raceOk(w, t.people))});
  }
  return out;
}

// what a way takes a day at full load: its work, its fire, its building's upkeep, warmth and tools
function takesOf(u, w, climate) {
  const o = {...w.in};
  if (w.fire) add(o, 'coal', fuelFor(w.fire));
  const k = upkeepOf(u.b, w.quality || 'iron');
  for (const [g, v] of Object.entries(k)) add(o, g, g === 'coal' && u.b.heat ? v * climate : v);
  return o;
}

// what 100 people of a people use up a day: TOWN_GOODS need, or its people's own (needOf)
// (at its step `tier`: a good with `needFrom` above it is not asked yet)
export const needsOf = (people, tier = 2) => Object.fromEntries(TOWN_GOODS.all().filter(g => (g.needFrom || 0) <= tier)
  .map(g => [g.id, g.needOf && people in g.needOf ? g.needOf[people] : g.need || 0]).filter(([, v]) => v > 0));

// one season (or any number of days) of a town's household, alone (a town of no realm; checks)
export const stepEconomy = (a, t, days) => stepTowns(a, [t], days)[0];

// a season of every living town's household: the towns of a realm count together (a forge in one town works the iron of
// the furnace in another), the rest each alone
export function stepEconomies(a, days) {
  const groups = new Map();
  for (const t of a.towns || []) if (t.alive) { const k = t.realm ?? 't' + t.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  for (const ts of groups.values()) stepTowns(a, ts, days);
}

// the towns of one realm: their loads settle on what the realm makes and holds together; what a town lacks it gets from
// the towns with a surplus (ECONOMY.haul of it arrives); each town keeps its own stock
function stepTowns(a, towns, days) {
  const start = townStart();
  const T = towns.map(t => {
    const E = t.econ ||= {ways: {}, stock: {}, rate: {}, short: [], load: 1};
    const units = unitsOf(t), people = Math.max(0, t.pop || 0);
    const jobs = units.reduce((s, u) => s + (u.b.jobs || 0), 0);
    // hands: short of them every building works at that share; with hands to spare a building widens to take them
    // (a town of thousands has many fields under one «пашни»), up to maxScale. A building with no jobs (houses, walls,
    // a granary) stands once, at its own size
    const scale = jobs > 0 ? Math.min(ECONOMY.maxScale, people * ECONOMY.work / jobs) : 1;
    // the people's own hands (TOWN_GOODS start, for each 100 of them; a hamlet counts as 100): gathering, firewood, bone
    // tools — the base a town has before any building
    const own = Object.fromEntries(Object.entries(start).map(([g, v]) => [g, v * Math.max(1, people / 100)]));
    return {t, E, units, climate: climateOf(a, t), needs: needsOf(t.people, t.tier ?? 0), heads: people / 100, scale, own, orders: ordersOf(a, t)};
  });
  // what the realm has to hand: last season's making of its towns (or, the first time, whether anyone makes it at all), the
  // people's hands and the stocks
  const made = new Set(Object.keys(start)), prev = {}, stockAll = {}, hands = {};
  for (const X of T) {
    for (const u of X.units) for (const w of u.ways) for (const g of Object.keys(w.out)) made.add(g);
    for (const [g, v] of Object.entries(X.E.prod || {})) add(prev, g, v);
    for (const [g, v] of Object.entries(X.E.stock)) add(stockAll, g, v);
    for (const [g, v] of Object.entries(X.own)) add(hands, g, v);
  }
  const fresh = T.some(X => !X.E.prod);
  // the worth the realm went without last season of a good: (asked − made) × its price (the first time: all of the
  // people's needs of it), so that bread comes before beer and beer before a carved box
  const wantPrev = {};
  for (const X of T) for (const [g, v] of Object.entries(fresh ? X.needs : X.E.want || {})) add(wantPrev, g, fresh ? v * X.heads : v);
  const unmet = g => Math.max(0, (wantPrev[g] || 0) - (fresh ? 0 : prev[g] || 0)) * goodWorth(g);
  const avail = g => (fresh ? (made.has(g) ? Infinity : 0) : prev[g] || 0) + (hands[g] || 0) + (stockAll[g] || 0) / ECONOMY.stockDays;
  // the way of each unit — one at a time: of the ways of its people that have their makings (keepWay of a full load), the one
  // whose goods the realm went most without; it keeps its way unless another is wanted clearly more (ECONOMY.switchWay)
  // (each unit's choice takes its makings out of what is to hand, so that four kitchens share the raw food among them)
  const taken = {};
  for (const X of T) for (const u of X.units) {
    u.full = u.b.jobs ? X.scale : 1;
    if (!u.ways.length) { u.way = null; u.load = 0; continue; }
    const makings = w => { const K = takesOf(u, w, X.climate); return Math.min(1, ...Object.entries(K).map(([g, v]) => Math.max(0, avail(g) - (taken[g] || 0)) / (v * u.full || 1))); };
    const wanted = w => Object.entries(w.out).reduce((s, [g, v]) => s + Math.min(unmet(g), v * u.full * goodWorth(g)), 0);
    const score = w => (makings(w) >= ECONOMY.keepWay ? 1 + wanted(w) + 0.01 * makings(w) : makings(w));
    const cur = u.ways.find(w => w.id === X.E.ways[u.key]);
    let best = null, bs = -1;
    for (const w of u.ways) { const sc = score(w); if (sc > bs + 1e-9) { best = w; bs = sc; } }
    u.way = cur && makings(cur) >= ECONOMY.keepWay && score(cur) + ECONOMY.switchWay >= bs ? cur : best;
    X.E.ways[u.key] = u.way.id;
    u.takes = takesOf(u, u.way, X.climate);
    for (const [g, v] of Object.entries(u.takes)) add(taken, g, v * u.full);
    u.load = u.full;
  }
  // the loads settle on the realm's goods: a good short of what is asked of it holds back everything that takes it
  let ratio = {};
  for (let pass = 0; pass < ECONOMY.passes; pass++) {
    const supply = {}, demand = {};
    for (const X of T) {
      X.supply = {...X.own}; X.demand = {};
      for (const u of X.units) if (u.way) {
        for (const [g, v] of Object.entries(u.way.out)) add(X.supply, g, v * u.load);
        for (const [g, v] of Object.entries(u.takes)) add(X.demand, g, v * u.load);
      }
      for (const [g, v] of Object.entries(X.needs)) add(X.demand, g, v * X.heads);
      for (const [g, v] of Object.entries(X.orders)) add(X.demand, g, v);
      // what is asked and what could be made at full load (the yardstick of balance: tools/economy-balance.mjs, economy-report.mjs)
      if (pass === 0) { X.want = {...X.demand}; X.cap = {...X.supply}; }
      for (const [g, v] of Object.entries(X.supply)) add(supply, g, v);
      for (const [g, v] of Object.entries(X.demand)) add(demand, g, v);
    }
    ratio = {};
    for (const g of new Set([...Object.keys(supply), ...Object.keys(demand)])) {
      const have = (supply[g] || 0) + (stockAll[g] || 0) / ECONOMY.stockDays, want = demand[g] || 0;
      ratio[g] = want > 0 ? Math.min(1, have / want) : 1;
    }
    for (const X of T) for (const u of X.units) if (u.way) u.load = u.full * Math.min(1, ...Object.keys(u.takes).map(g => ratio[g] ?? 0));
  }
  // each town's rates: what it makes, what its buildings take, what its people use up
  for (const X of T) {
    const {t, E} = X, rate = {...X.own}, short = [];
    for (const u of X.units) if (u.way) {
      for (const [g, v] of Object.entries(u.way.out)) add(rate, g, v * u.load);
      for (const [g, v] of Object.entries(u.takes)) add(rate, g, -v * u.load);
    }
    const eatsRaw = ['stores', ...TOWN_GOODS.filter(g => g.eaten?.includes(t.people)).map(g => g.id)];   // short of ready food: the stores first, then what this people eats raw
    for (const [g, v] of Object.entries(X.needs)) {
      const want = v * X.heads, got = want * (ratio[g] ?? 0);
      add(rate, g, -got);
      // ready food short: a people that eats something raw eats it instead
      let left = want - got;
      if (g === 'food') for (const r of eatsRaw) {
        if (left <= 0) break;
        const can = Math.max(0, (rate[r] || 0) + (E.stock[r] || 0) / ECONOMY.stockDays), take = Math.min(left, can);
        add(rate, r, -take); left -= take;
      }
      if (left > want * 0.01) short.push(g);
      if (g === 'food') X.fed = want > 0 ? Math.max(0, Math.min(1, 1 - left / want)) : 1;   // the share of their food the people got
    }
    // the armies' keep: what the realm meets of it goes to them (the army reads E.met)
    const met = {};
    for (const [g, want] of Object.entries(X.orders)) {
      met[g] = ratio[g] ?? 0;
      add(rate, g, -want * met[g]);
      if (met[g] < 0.99 && !short.includes(g)) short.push(g);
    }
    X.met = met;
    // the reserve: a town wants ECONOMY.reserve days of its people's food in stores — asked for, not used up: the
    // smokehouse and the racks work for it, trade brings it (it is not a lack: the council does not build for it)
    const reserve = ECONOMY.reserve * (X.needs.food || 0) * X.heads, lack = reserve - (E.stock.stores || 0);
    if (lack > 0) add(X.want, 'stores', lack / ECONOMY.reserveFill);
    // a people that trades some goods at once for another: what it makes of them goes to the market, the worth comes back
    const TU = TRADE_UP[t.people];
    if (TU) for (const g of TU.sells) {
      const have = Math.max(0, (rate[g] || 0) + (E.stock[g] || 0) / days);
      if (have <= 0) continue;
      add(rate, g, -have); add(rate, TU.buys, have * goodWorth(g) * TU.rate / goodWorth(TU.buys));
    }
    for (const u of X.units) if (u.way) for (const g of Object.keys(u.takes)) if ((ratio[g] ?? 0) < 0.999 && !short.includes(g)) short.push(g);
    X.rate = rate; X.short = short;
    X.next = {};
    for (const g of new Set([...Object.keys(E.stock), ...Object.keys(rate)])) X.next[g] = (E.stock[g] || 0) + (rate[g] || 0) * days;
  }
  // the realm's carts: a town that ran into debt of a good takes it from the towns with a surplus (haul of it arrives)
  const trade = T.map(() => ({}));
  if (T.length > 1) {
    const goods = new Set(T.flatMap(X => Object.keys(X.next)));
    for (const g of goods) {
      const debt = T.map(X => Math.max(0, -(X.next[g] || 0))), spare = T.map(X => Math.max(0, X.next[g] || 0));
      const D = debt.reduce((s, v) => s + v, 0), P = spare.reduce((s, v) => s + v, 0);
      if (D <= 0 || P <= 0) continue;
      const moved = Math.min(D, P * ECONOMY.haul), gone = moved / ECONOMY.haul;
      T.forEach((X, k) => {
        if (debt[k] > 0) { const got = moved * debt[k] / D; X.next[g] += got; add(trade[k], g, got / days); }
        else if (spare[k] > 0) { const sent = gone * spare[k] / P; X.next[g] -= sent; add(trade[k], g, -sent / days); }
      });
    }
  }
  // what the carts did not cover was not there to use: the town used up only what it had (its rate is cut to it) and it
  // ran short of the good
  for (const X of T) for (const [g, v] of Object.entries(X.next)) if (v < 0) {
    add(X.rate, g, -v / days); X.next[g] = 0;
    if (v < -1e-6 * days && !X.short.includes(g)) X.short.push(g);
  }
  // the stock: what is left, less what rots (a granary or a cellar keeps some)
  const r3 = v => Math.round(v * 1000) / 1000, r = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => Math.abs(v) > 1e-6).map(([g, v]) => [g, r3(v)]));
  T.forEach((X, k) => {
    const {t, E} = X, stock = {}, built = new Set(t.built);
    for (const [g, v0] of Object.entries(X.next)) {
      let v = v0;
      const G = TOWN_GOODS.has(g) ? TOWN_GOODS.get(g) : null;
      if (G?.spoil && v > 0) {
        let keep = 1;
        for (const [b, S] of Object.entries(STORAGE)) if (built.has(b) && S.goods.includes(g)) keep *= S.keep;
        v *= Math.pow(1 - Math.min(1, G.spoil * keep), days);
      }
      if (v > 1e-6) stock[g] = r3(v);
    }
    E.stock = stock;
    E.rate = r(X.rate);
    E.trade = r(trade[k]);
    E.short = X.short;
    E.prod = r(X.supply); E.want = r(X.want); E.cap = r(X.cap);
    E.met = X.met; if (!Object.keys(E.met).length) delete E.met;
    E.fed = Math.round((X.fed ?? 1) * 1000) / 1000;
    // what the town's own buildings make now: the gate of a purchase (campaign/town.js canMake)
    E.made = [...new Set(X.units.filter(u => u.way && u.load > 0).flatMap(u => Object.keys(u.way.out)))];
    // the load: how far the buildings work for want of nothing but hands (their makings); the scale: how wide hands make them
    const working = X.units.filter(u => u.way);
    E.load = working.length ? Math.round(working.reduce((s, u) => s + u.load / (u.full || 1), 0) / working.length * 100) / 100 : 1;
    // each building's load (its makings, not its hands): its effects in the town go by it (atlas/towns.js townFx)
    E.loads = Object.fromEntries(X.units.map(u => [u.key, u.way ? Math.round(u.load / (u.full || 1) * 100) / 100 : 1]));
    E.scale = Math.round(X.scale * 100) / 100;
  });
  return T.map(X => X.E);
}

// the worth a town has in its stock of tools, arms or armour, and taking some of it (a caravan's purchase)
export const stockOf = (t, g) => t.econ?.stock?.[g] || 0;
export function takeStock(t, g, worth) {
  if (!t.econ) return true;   // a town that has not counted its household yet (an old save): as before, it sells
  if (stockOf(t, g) + 1e-9 < worth) return false;
  t.econ.stock[g] = Math.round((stockOf(t, g) - worth) * 1000) / 1000;
  return true;
}

// the stock of a good over the towns of a realm, and taking some of it — the most from the towns that hold the most
// (an army's packed food, a building's materials, a trade caravan's load); returns what was taken
export const realmTowns = (a, realm) => (a.towns || []).filter(t => t.alive && t.realm === realm);
export const realmStock = (a, realm, g) => realmTowns(a, realm).reduce((s, t) => s + stockOf(t, g), 0);
export function drawRealm(a, realm, g, amount, first = null) {
  if (!(amount > 0)) return 0;
  const ts = realmTowns(a, realm);
  if (first && ts.includes(first)) { ts.splice(ts.indexOf(first), 1); ts.unshift(first); }
  let left = amount;
  // the asking town takes its own first, then the others by what they hold
  if (first?.econ) { const own = Math.min(left, stockOf(first, g)); if (own > 0) { first.econ.stock[g] = stockOf(first, g) - own; left -= own; } }
  const rest = ts.filter(t => t !== first && t.econ && stockOf(t, g) > 0), all = rest.reduce((s, t) => s + stockOf(t, g), 0);
  if (left > 0 && all > 0) {
    const take = Math.min(left, all);
    for (const t of rest) t.econ.stock[g] = stockOf(t, g) - take * stockOf(t, g) / all;
    left -= take;
  }
  return amount - left;
}
// putting goods into a town's stock (a trade caravan's arrival)
export function giveStock(t, g, v) {
  if (!t.econ || !(v > 0)) return;
  t.econ.stock[g] = (t.econ.stock[g] || 0) + v;
}
