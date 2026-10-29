// A town's household by the flows of its buildings (data/townBuildings.js): what it makes and uses up a day (the rate,
// a differential) and what lies in its stock (the integral of the rates over the days gone).
//
// Every season the world steps (atlas/history.js), each living town:
//   - hands: its working people (ECONOMY.work of them) against the `jobs` of everything built — a town short of hands
//     works every building at that share;
//   - ways: a building of several ways (TOWN_WORKS) works ONE of them, the one it worked last while it has the makings;
//     when they run out it switches to the first way of its people that has them (`t.econ.ways`, a building's nth copy);
//   - load: a building works at the share of hands and of the scarcest thing it takes (in its work, its upkeep, warmth,
//     the worth of its tools), the stock counting for its share of the days: a few passes settle the loads together;
//   - the people use up their needs (TOWN_GOODS `need`, a day per 100 of them) as far as there is of each; a people that
//     eats something raw (`eaten`) eats it where ready food runs short;
//   - the stock takes rate × days and never goes below nothing.
// It runs without a die and changes nothing else in the world yet: the town's growth, its food and its fame still come
// from atlas/towns.js. What it is good for now: the town's card shows it, a caravan buys arms, tools and armour only
// as far as the town has their worth in the stock (campaign/town.js).
import {TOWN_BUILDINGS, TOWN_GOODS, worksOf, upkeepOf, townStart, townNeeds, fuelFor} from '../data/townBuildings.js';

export const ECONOMY = {
  work: 0.5,             // share of the people who work in the buildings
  passes: 5,             // passes that settle the loads of the buildings together
  stockDays: 30,         // the stock is drawn on over so many days (a season): its share of a day
  cold: 2, warm: 12,     // the cell's mean °C below which warmth costs climate.cold, above which climate.warm
  climate: {cold: 1.6, mild: 1, warm: 0.4},
};

const raceOk = (w, people) => !w.peoples || w.peoples.includes(people);
const keyOf = (id, n) => `${id}#${n}`;
const add = (o, k, v) => { if (v) o[k] = (o[k] || 0) + v; };

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

// one season (or any number of days) of a town's household. Returns its state: {ways, stock, rate, short, load}
export function stepEconomy(a, t, days) {
  const E = t.econ ||= {ways: {}, stock: {}, rate: {}, short: [], load: 1};
  const units = unitsOf(t), climate = climateOf(a, t), start = townStart(), needs = townNeeds();
  const people = Math.max(0, t.pop || 0), heads = people / 100;
  // what could be had here at all: made by a way or the people's hands, or lying in the stock
  const made = new Set([...Object.keys(start), ...Object.keys(E.stock).filter(g => E.stock[g] > 0)]);
  for (const u of units) for (const w of u.ways) for (const g of Object.keys(w.out)) made.add(g);
  // the way of each unit: the one it worked while it has the makings, else the first of its people's that has them
  for (const u of units) {
    if (!u.ways.length) { u.way = null; continue; }
    const has = w => Object.keys(takesOf(u, w, climate)).every(g => made.has(g));
    const cur = u.ways.find(w => w.id === E.ways[u.key]);
    u.way = cur && has(cur) ? cur : u.ways.find(has) || cur || u.ways[0];
    E.ways[u.key] = u.way.id;
    u.takes = takesOf(u, u.way, climate);
  }
  // hands
  const jobs = units.reduce((s, u) => s + (u.b.jobs || 0), 0);
  const hands = jobs > 0 ? Math.min(1, people * ECONOMY.work / jobs) : 1;
  for (const u of units) u.load = u.way ? hands : 0;
  // the loads settle: a good short of what is asked of it holds back everything that takes it
  const eatsRaw = TOWN_GOODS.filter(g => g.eaten?.includes(t.people)).map(g => g.id);
  let ratio = {};
  for (let pass = 0; pass < ECONOMY.passes; pass++) {
    const supply = {...start}, demand = {};
    for (const u of units) if (u.way) {
      for (const [g, v] of Object.entries(u.way.out)) add(supply, g, v * u.load);
      for (const [g, v] of Object.entries(u.takes)) add(demand, g, v * u.load);
    }
    for (const [g, v] of Object.entries(needs)) add(demand, g, v * heads);
    ratio = {};
    for (const g of new Set([...Object.keys(supply), ...Object.keys(demand)])) {
      const have = (supply[g] || 0) + (E.stock[g] || 0) / ECONOMY.stockDays, want = demand[g] || 0;
      ratio[g] = want > 0 ? Math.min(1, have / want) : 1;
    }
    for (const u of units) if (u.way) u.load = hands * Math.min(1, ...Object.keys(u.takes).map(g => ratio[g] ?? 0));
  }
  // the rates: what is made, what the buildings take, what the people use up
  const rate = {...start};
  for (const u of units) if (u.way) {
    for (const [g, v] of Object.entries(u.way.out)) add(rate, g, v * u.load);
    for (const [g, v] of Object.entries(u.takes)) add(rate, g, -v * u.load);
  }
  const short = [];
  for (const [g, v] of Object.entries(needs)) {
    const want = v * heads, got = want * (ratio[g] ?? 0);
    add(rate, g, -got);
    // ready food short: a people that eats something raw eats it instead
    let left = want - got;
    if (g === 'food') for (const r of eatsRaw) {
      if (left <= 0) break;
      const can = Math.max(0, (rate[r] || 0) + (E.stock[r] || 0) / ECONOMY.stockDays), take = Math.min(left, can);
      add(rate, r, -take); left -= take;
    }
    if (left > want * 0.01) short.push(g);
  }
  // the stock: the integral of the rates over the days
  const stock = {};
  for (const g of new Set([...Object.keys(E.stock), ...Object.keys(rate)])) {
    const v = (E.stock[g] || 0) + (rate[g] || 0) * days;
    if (v > 1e-6) stock[g] = Math.round(v * 1000) / 1000;
  }
  for (const u of units) if (u.way) for (const g of Object.keys(u.takes)) if ((ratio[g] ?? 0) < 0.999 && !short.includes(g)) short.push(g);
  E.stock = stock;
  E.rate = Object.fromEntries(Object.entries(rate).filter(([, v]) => Math.abs(v) > 1e-6).map(([g, v]) => [g, Math.round(v * 1000) / 1000]));
  E.short = short;
  E.load = units.length ? Math.round(units.reduce((s, u) => s + u.load, 0) / units.length * 100) / 100 : 1;
  E.hands = Math.round(hands * 100) / 100;
  return E;
}

// the worth a town has in its stock of tools, arms or armour, and taking some of it (a caravan's purchase)
export const stockOf = (t, g) => t.econ?.stock?.[g] || 0;
export function takeStock(t, g, worth) {
  if (!t.econ) return true;   // a town that has not counted its household yet (an old save): as before, it sells
  if (stockOf(t, g) + 1e-9 < worth) return false;
  t.econ.stock[g] = Math.round((stockOf(t, g) - worth) * 1000) / 1000;
  return true;
}
