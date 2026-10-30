// Probe of one people under the microscope, against the others: every season of history, per people — towns, people,
// room, what the land feeds, food, contentment, buildings by category, stocks, flows, treasury, ruin, armies; and at the
// end every town of the people with its buildings and what bounds it.
// `node tools/people-probe.mjs <seed> [size] [people]` → JSON on stdout.
import {newAtlas, runNextStage, landDone} from '../src/atlas/generate.js';
import {TOWN_BUILDINGS, goodPrice} from '../src/data/townBuildings.js';
import {townFx, room} from '../src/atlas/towns.js';
import {WORLD_PEOPLES, TOWN_LIFE as TL} from '../src/data/peoples.js';
import {contentOf} from '../src/atlas/demography.js';
import {treasuryWorth, treasuryOf} from '../src/atlas/treasury.js';
import {needsOf} from '../src/atlas/economy.js';

const seed = process.argv[2] || 'macro0', size = process.argv[3] || 'small', focus = process.argv[4] || 'humans';
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const worth = g => goodPrice(g) || 1;
const r2 = v => Math.round(v * 100) / 100;
const add = (o, k, v) => { if (v) o[k] = (o[k] || 0) + v; };
const seasons = [], years = [], born = {}, lost = {};
let arrived = {};
const seenTowns = new Set();

while (runNextStage(a)) {
  if (!landDone(a) || !a.hist || !a.towns) continue;
  const H = a.hist, step = (H.year - 1) * 4 + ((H.season + 3) % 4);   // the season just stepped
  // towns founded / lost
  for (const t of a.towns) if (!seenTowns.has(t.id)) { seenTowns.add(t.id); add(born[t.people] ||= {}, H.year, 1); if (!arrived[t.people]) arrived[t.people] = H.year; }
  const S = {y: H.year, s: (H.season + 3) % 4, era: H.era, p: {}};
  for (const t of a.towns) if (t.alive) {
    const P = S.p[t.people] ||= {towns: 0, pop: 0, room: 0, feeds: 0, target: 0, fedPop: 0, contPop: 0, built: 0, load: 0, roomBound: 0, foodBound: 0, hungry: 0, tiers: [0, 0, 0]};
    const fx = townFx(t), rm = room(fx), feeds = t.wants?.feeds ?? rm, target = Math.min(feeds, rm);
    P.towns++; P.pop += t.pop; P.room += rm; P.feeds += feeds; P.target += target;
    P.fedPop += (t.econ?.fed ?? 1) * t.pop; P.contPop += contentOf(a, t) * t.pop; P.built += t.built.length; P.load += t.econ?.load ?? 1;
    if (rm <= feeds) P.roomBound++; else P.foodBound++;
    if ((t.econ?.fed ?? 1) < TL.fedOk) P.hungry++;
    P.tiers[t.tier]++;
  }
  for (const P of Object.values(S.p)) { P.fed = r2(P.fedPop / Math.max(1, P.pop)); P.content = r2(P.contPop / Math.max(1, P.pop)); P.load = r2(P.load / P.towns); delete P.fedPop; delete P.contPop; for (const k of ['pop', 'room', 'feeds', 'target']) P[k] = Math.round(P[k]); }
  seasons.push(S);
  if (S.s !== 3) continue;   // a full record once a year, after winter
  const Y = {y: H.year, era: H.era, p: {}};
  for (const t of a.towns) if (t.alive) {
    const P = Y.p[t.people] ||= {cats: {}, ids: {}, stock: {}, prod: {}, want: {}, short: {}, needs: {}, armies: 0, men: 0, fx: {}, n: 0};
    P.n++; for (const [k, v] of Object.entries(townFx(t))) add(P.fx, k, v);
    for (const id of t.built) { const b = TOWN_BUILDINGS.get(id); add(P.cats, b.cat, 1); add(P.ids, id, 1); }
    const E = t.econ || {};
    for (const [g, v] of Object.entries(E.stock || {})) add(P.stock, g, v);
    for (const [g, v] of Object.entries(E.prod || {})) add(P.prod, g, v);
    for (const [g, v] of Object.entries(E.want || {})) add(P.want, g, v);
    for (const [g, v] of Object.entries(needsOf(t.people, t.tier))) add(P.needs, g, v * t.pop / 100);
    if (t.project) add(P, 'building', 1);
  }
  for (const p of a.parties || []) if (p.kind === 'army' && p.state !== 'gone') { const P = Y.p[p.people]; if (P) { P.armies++; P.men += p.men; } }
  for (const r of a.realms || []) {
    const ts = a.towns.filter(t => t.alive && t.realm === r.id); if (!ts.length || r.fallen != null) continue;
    const P = Y.p[r.people]; if (!P) continue;
    const R = P.realms ||= [];
    const T = treasuryOf(r), yr = T.year || {in: {}, out: {}};
    R.push({id: r.id, towns: ts.length, pop: Math.round(ts.reduce((s, t) => s + t.pop, 0)), worth: Math.round(treasuryWorth(r)), gold: Math.round(T.stock?.gold || 0),
      income: Math.round(Object.values(yr.in || {}).reduce((s, v) => s + v, 0)), out: Math.round(Object.values(yr.out || {}).reduce((s, v) => s + v, 0)),
      inBy: Object.fromEntries(Object.entries(yr.in || {}).map(([k, v]) => [k, Math.round(v)])), outBy: Object.fromEntries(Object.entries(yr.out || {}).map(([k, v]) => [k, Math.round(v)])),
      stats: r.kingdom?.stats && Object.fromEntries(Object.entries(r.kingdom.stats).map(([k, v]) => [k, r2(v)])),
      ruin: r.kingdom?.ruin && Object.fromEntries(Object.entries(r.kingdom.ruin).map(([k, v]) => [k, r2(v)])),
      course: r.mind?.course});
  }
  for (const P of Object.values(Y.p)) { for (const k of Object.keys(P.fx)) P.fx[k] = r2(P.fx[k] / P.n); for (const k of ['stock', 'prod', 'want', 'needs']) for (const g of Object.keys(P[k])) P[k][g] = r2(P[k][g]); }
  years.push(Y);
}
for (const r of a.ruins || []) add(lost[r.people] ||= {}, r.how || (r.by != null ? 'сожжён' : '?'), 1);
// the focus people's towns at the end
const towns = a.towns.filter(t => t.alive && t.people === focus).map(t => {
  const fx = townFx(t), rm = room(fx);
  return {name: t.name, tier: t.tier, cap: !!t.capital, pop: Math.round(t.pop), room: Math.round(rm), feeds: Math.round(t.wants?.feeds || 0), fed: t.econ?.fed, load: t.econ?.load,
    content: r2(contentOf(a, t)), built: t.built, project: t.project, role: t.role, fx: Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, r2(v)])),
    short: t.econ?.short, loads: t.econ?.loads};
});
const chron = a.chronicle.filter(e => e.text && new RegExp(WORLD_PEOPLES.get(focus).labelGen + '|' + WORLD_PEOPLES.get(focus).label, 'i').test(e.text)).slice(-80).map(e => `${e.year}: ${e.text}`);
console.log(JSON.stringify({seed, arrived, born, lost, seasons, years, towns, chron, end: a.hist.year}));
