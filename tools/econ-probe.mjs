// The economy under the microscope: one world's history, season by season, read the way a council and a caravan would see it.
// A yearly row by people — food the buildings give, the people's needs, what the works lack and what lies unused, how many works
// stand idle, what the towns bought and sold of each other, what was lost to passing merchants, how heavy a town's reckoning is
// (rows a season) — and at the end every town: what it makes, lacks and leaves unused, its idle works, what its market offers a
// caravan, and how specialised the towns are (who makes each good). Reads the goods of the branch it runs on (TOWN_GOODS), so the
// same probe compares two branches.
// `node tools/econ-probe.mjs [seed] [size] [mode]` — mode `std` (the eras as they are) or `start` (all peoples at the end of the
// wild era, as tools/race-start-probe.mjs) → JSON on stdout
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {TOWN_BUILDINGS, TOWN_GOODS, goodPrice} from '../src/data/townBuildings.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {slotsUsed, slotsOf} from '../src/atlas/towns.js';
import {offers} from '../src/campaign/town.js';
import {SEASONS_PER_YEAR as S} from '../src/data/atlas.js';

const seed = process.argv[2] || 'start376615', size = process.argv[3] || 'small', mode = process.argv[4] || 'std';
if (mode === 'start') for (const P of WORLD_PEOPLES.all()) P.era = 'elder';
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const PE = WORLD_PEOPLES.all().map(P => P.id);
const GOODS = TOWN_GOODS.all().map(g => g.id);
const SKIP = new Set(['gold', 'food', 'raw', 'brush']);   // (the purse and what feeds by the net are not market goods)
const price = g => { try { return goodPrice(g) || 0; } catch (e) { return 0; } };
const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
const live = () => a.towns.filter(t => t.alive);
const zero = () => Object.fromEntries([...PE, 'all'].map(p => [p, {}]));

// the season's ledger, summed over the year
let acc = zero(), seasons = 0;
// (wasted — the worth of what went over the store's room and nobody took; dumped — the worth of what the merchants took of it,
// at its own price; rotted — the worth of what rotted in store; carry — what the buyers paid the carters; boughtN — the goods
// bought from other towns themselves, a count of units of every kind)
const KEYS = ['bought', 'boughtN', 'sold', 'imported', 'merchants', 'wasted', 'dumped', 'rotted', 'carry', 'people', 'works', 'upkeep', 'recycled'];
function seasonTally() {
  seasons++;
  for (const t of live()) for (const k of KEYS) { const v = t.trade?.[k] || 0; for (const p of [t.people, 'all']) acc[p][k] = (acc[p][k] || 0) + v; }
  // the reckoning's weight: rows a season (buildings and recipes), summed
  for (const t of live()) { const n = (t.econ?.rows?.length || 0) + (t.econ?.recipes?.length || 0); for (const p of [t.people, 'all']) acc[p].rows = (acc[p].rows || 0) + n; }
}

function yearRow(ms) {
  const out = {};
  for (const p of [...PE, 'all']) {
    const T = live().filter(t => p === 'all' || t.people === p && t.econ);
    const E = T.filter(t => t.econ);
    const pop = T.reduce((s, t) => s + t.pop, 0);
    const o = {pop: Math.round(pop), towns: T.length};
    if (!E.length) { out[p] = o; continue; }
    const w = t => t.pop / Math.max(1, pop);
    o.feeds = r3(E.reduce((s, t) => s + (t.econ.feeds || 0), 0) / Math.max(1, pop));
    o.basic = r3(E.reduce((s, t) => s + (t.needs?.basic ?? 1) * w(t), 0));
    o.comfort = r3(E.reduce((s, t) => s + (t.needs?.comfort ?? 1) * w(t), 0));
    // lack: the value the works asked for and did not get, over what they asked (the store's goods only); by good
    let ask = 0, lack = 0; const byG = {}, shortTowns = {};
    for (const t of E) for (const [g, d] of Object.entries(t.econ.dem || {})) {
      if (SKIP.has(g) || !TOWN_GOODS.has(g)) continue;
      const v = d * price(g), s = (t.econ.short[g] || 0); ask += v; lack += s * v;
      (byG[g] ||= [0, 0]); byG[g][0] += s * v; byG[g][1] += v;
      if (s > 0.25) shortTowns[g] = (shortTowns[g] || 0) + 1;
    }
    o.lack = r3(ask ? lack / ask : 0);
    o.lackBy = Object.fromEntries(Object.entries(byG).filter(([, [, v]]) => v > 0).map(([g, [s, v]]) => [g, r3(s / v)]));
    o.shortTowns = Object.fromEntries(Object.entries(shortTowns).map(([g, n]) => [g, r3(n / E.length)]));
    // made and spare (made, nobody here took it), in gold a head a year
    let made = 0, spare = 0; const spareBy = {};
    for (const t of E) for (const [g, v] of Object.entries(t.econ.made || {})) {
      if (SKIP.has(g) || !TOWN_GOODS.has(g)) continue;
      made += v * price(g); const sv = v * (t.econ.spare?.[g] || 0) * price(g); spare += sv; spareBy[g] = (spareBy[g] || 0) + sv;
    }
    o.made = r1(made / Math.max(1, pop) * 100); o.spare = r1(spare / Math.max(1, pop) * 100);   // (gold a year for 100 people)
    o.spareBy = Object.fromEntries(Object.entries(spareBy).map(([g, v]) => [g, r1(v / Math.max(1, pop) * 100)]));
    // works: idle below half, the mean strength
    // (and where the strength the works did not give went, as shares of all their strength: cut — the load this reckoning worked
    // at was set down for want of takers, 1 − load; starved — within that load, short of hands or of what they take, load − eff;
    // a work can be both)
    let rows = 0, idle = 0, eff = 0, cut = 0, starved = 0;
    for (const t of E) for (const r of t.econ.rows || []) {
      const b = TOWN_BUILDINGS.has(r.id) ? TOWN_BUILDINGS.get(r.id) : null; if (!b || b.cat === 'housing' || !b.jobs) continue;
      const L = r.load ?? 1, e = Math.min(1, r.eff);
      rows += r.n; eff += e * r.n; if (r.eff < 0.5) idle += r.n;
      cut += (1 - L) * r.n; starved += Math.max(0, L - e) * r.n;
    }
    o.idle = r3(rows ? idle / rows : 0); o.cut = r3(rows ? cut / rows : 0); o.starved = r3(rows ? starved / rows : 0); o.eff = r3(rows ? eff / rows : 0); o.works = r1(rows / E.length);
    o.tools = r3(E.reduce((s, t) => s + (t.econ.tools ?? (1 - 0.5 * (t.econ.short.tools || 0))) * w(t), 0));
    o.slotsFull = r3(E.filter(t => slotsUsed(t).town >= slotsOf(t).town).length / E.length);
    o.stock = r1(E.reduce((s, t) => s + Object.entries(t.stock || {}).reduce((q, [g, v]) => q + (TOWN_GOODS.has(g) ? v * price(g) : 0), 0), 0) / Math.max(1, pop) * 100);
    // what the works were left lacking, by why, in gold a year for 100 people: no money, a weak way, a full way (its room), none of
    // its sellers had it (goods; who had it out of reach — tools/reach-probe.mjs)
    const why = {money: 0, route: 0, room: 0, goods: 0};
    for (const t of E) for (const [g, r] of Object.entries(t.econ.why?.works?.by || {})) for (const k of Object.keys(why)) why[k] += (r[k] || 0) * price(g) * S;
    for (const [k, v] of Object.entries(why)) o['no' + k[0].toUpperCase() + k.slice(1)] = r1(v / Math.max(1, pop) * 100);
    o.gold = r1(E.reduce((s, t) => s + (t.gold || 0) + (t.makersGold || 0) + (t.peopleGold || 0), 0) / Math.max(1, pop) * 100);
    o.spread = r3(E.reduce((s, t) => { const k = Object.values(t.market || {}); return s + (k.length ? Math.max(...k) / Math.min(...k) : 1); }, 0) / E.length);
    for (const k of [...KEYS, 'rows']) o[k] = r1((acc[p][k] || 0) / Math.max(1, pop) * 100);   // (gold a year for 100 people; rows — per 100 people a year)
    o.rowsTown = r1((acc[p].rows || 0) / Math.max(1, seasons) / E.length);
    out[p] = o;
  }
  out.ms = ms;
  return out;
}

// the history, season by season
const years = [];
let last = null, ms0 = 0, t0 = Date.now();
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  if (st.id !== 'history' || !a.hist || !a.towns?.length) continue;
  seasonTally();
  if (a.hist.season === 0 && a.hist.year !== last) {
    last = a.hist.year;
    const ms = (a.ms.history || 0) - ms0; ms0 = a.ms.history || 0;
    years.push({y: a.hist.year, era: a.hist.era, ...yearRow(ms)});
    acc = zero(); seasons = 0;
  }
}

// the end: every town
const towns = live().filter(t => t.econ).map(t => {
  const e = t.econ, top = (o, n = 5) => Object.entries(o || {}).filter(([g]) => !SKIP.has(g)).sort((p, q) => q[1] * price(q[0]) - p[1] * price(p[0])).slice(0, n).map(([g, v]) => [g, r1(v)]);
  let O = []; try { O = offers(t, a); } catch (err) { O = [{kind: 'error', id: String(err.message).slice(0, 60)}]; }
  const items = O.filter(o => o.kind === 'item').map(o => o.id);
  return {id: t.id, name: t.name, people: t.people, pop: Math.round(t.pop), tier: t.tier || 0, realm: t.realm, capital: !!t.capital,
    built: [...t.built], made: top(e.made, 8), used: top(e.used, 6),
    short: Object.fromEntries(Object.entries(e.short || {}).filter(([g, s]) => !SKIP.has(g) && s > 0.05).map(([g, s]) => [g, r3(s)])),
    spare: Object.fromEntries(Object.entries(e.spare || {}).filter(([g, s]) => !SKIP.has(g) && s > 0.2 && (e.made[g] || 0) * price(g) > 5).map(([g, s]) => [g, r3(s)])),
    lack: Object.fromEntries(Object.entries(t.needs?.lack || {}).filter(([, v]) => v > 0.05).map(([g, v]) => [g, r3(v)])),
    basic: t.needs?.basic ?? null, comfort: t.needs?.comfort ?? null, feeds: r1(e.feeds || 0), tools: e.tools ?? null,
    idle: (e.rows || []).filter(r => { const b = TOWN_BUILDINGS.has(r.id) && TOWN_BUILDINGS.get(r.id); return b && b.cat !== 'housing' && b.jobs && r.eff < 0.5; }).map(r => [r.id, r3(r.eff)]),
    recipes: (e.recipes || []).filter(x => x.eff > 0.005).map(x => [x.id, r3(x.share)]),
    rows: (e.rows?.length || 0) + (e.recipes?.length || 0),
    offers: {all: O.length, items: items.length, ids: items, other: O.filter(o => o.kind !== 'item').map(o => o.id)},
    market: Object.fromEntries(Object.entries(t.market || {}).map(([g, k]) => [g, r3(k)])),
    stock: Object.fromEntries(Object.entries(t.stock || {}).filter(([g, v]) => !SKIP.has(g) && v * price(g) > 2).map(([g, v]) => [g, r1(v)]))};
});

// specialisation: for each good, how many towns make it, and the share the top fifth of its makers give
const spec = {};
for (const g of GOODS) {
  if (SKIP.has(g)) continue;
  const v = live().filter(t => t.econ).map(t => t.econ.made?.[g] || 0).filter(x => x > 0).sort((p, q) => q - p);
  if (!v.length) { spec[g] = {makers: 0}; continue; }
  const k = Math.max(1, Math.round(v.length / 5)), all = v.reduce((s, x) => s + x, 0);
  // exporters: towns that make more than 1.5× what their own works take
  const exp = live().filter(t => t.econ && (t.econ.made?.[g] || 0) > 1.5 * (t.econ.used?.[g] || 0) + 1e-6 && (t.econ.made?.[g] || 0) * price(g) > 5).length;
  spec[g] = {makers: v.length, top: r3(v.slice(0, k).reduce((s, x) => s + x, 0) / all), exporters: exp, made: r1(all)};
}

// what the chronicle says, by kind
const C = a.chronicle.map(c => c.text || '');
const count = re => C.filter(x => re.test(x)).length;
const chron = {lines: C.length, famine: count(/голод/i), storm: count(/штурм/), burnt: count(/сожгл|сожгло|пепелищ/), raid: count(/набег/i), built: count(/появил|построил|заложил/i), trade: count(/торгов|караван/i)};

process.stdout.write(JSON.stringify({seed, size, mode, goods: GOODS, ms: a.ms, years, towns, spec, chron}));
