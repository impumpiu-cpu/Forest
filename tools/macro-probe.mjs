// Macro probe of the world's towns and realms: buildings over the years, the worth of what towns make and haul,
// armies and raids. `node tools/macro-probe.mjs [worlds] [size]` → JSON on stdout.
import {newAtlas, runNextStage, landDone} from '../src/atlas/generate.js';
import {TOWN_BUILDINGS, goodPrice} from '../src/data/townBuildings.js';
import {canBuild, realmBuilt, townFx, room} from '../src/atlas/towns.js';
import {needsOf} from '../src/atlas/economy.js';
let realmTrade = () => null;
try { ({realmTrade} = await import('../src/atlas/trade.js')); } catch {}

const N = +(process.argv[2] || 4), size = process.argv[3] || 'small';
const worth = g => goodPrice(g) || 1;
const val = o => Object.entries(o || {}).reduce((s, [g, v]) => s + Math.max(0, v) * worth(g), 0);
const series = {};   // year → race → {towns, pop, built, sumTier}
const towns = [], realms = [], events = {army: 0, men: 0, raid: 0, burned: 0, built: 0, years: 0, hungry: 0, trade: 0, tradeSeasons: 0, armyDays: {}};
const buildFreq = {}, catByRace = {};

for (let k = 0; k < N; k++) {
  const a = newAtlas({seed: 'macro' + k, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
  let lastYear = -1, c0 = 0;
  while (runNextStage(a)) {
    if (!landDone(a) || !a.hist || !a.towns) continue;
    for (const r of Object.values(a.rel || {})) if (r.trade) { events.trade += Object.entries(r.trade).filter(([k]) => k !== 'paid').reduce((s, [, v]) => s + v, 0); events.tradeSeasons++; }
    for (const p of a.parties || []) if (p.kind === 'army') { const d = events.armyDays[p.people] ||= {days: 0, men: 0, loyal: 0, kit: 0, n: 0}; d.n++; d.men += p.men; d.loyal += p.loyal ?? 1; d.kit += p.kit ?? 1; }
    const y = a.hist.year;
    if (y !== lastYear && y % 5 === 0) {
      lastYear = y;
      const S = series[y] ||= {};
      for (const t of a.towns) if (t.alive) {
        const s = S[t.people] ||= {towns: 0, pop: 0, built: 0, n: 0};
        s.towns++; s.pop += t.pop; s.built += t.built.length;
      }
      S._worlds = (S._worlds || 0) + 1;
    }
  }
  events.years += a.hist.year;
  for (const e of a.chronicle) {
    const m = /войско в (\d+) бойцов/.exec(e.text);
    if (m) { events.army++; events.men += +m[1]; }
    if (/набег/i.test(e.text)) events.raid++;
    if (/нечем его кормить/.test(e.text)) events.hungry++;
    if (/пепелищ|сожгли|сожжён/i.test(e.text)) events.burned++;
  }
  for (const t of a.towns) if (t.alive) {
    const fx = townFx(t), inR = realmBuilt(a, t);
    const can = TOWN_BUILDINGS.all().filter(b => canBuild(a, t, b, inR)).length;
    const cats = {};
    for (const id of t.built) { const b = TOWN_BUILDINGS.get(id); cats[b.cat] = (cats[b.cat] || 0) + 1; (buildFreq[t.people] ||= {})[id] = ((buildFreq[t.people] ||= {})[id] || 0) + 1; }
    const cr = catByRace[t.people] ||= {}; for (const [c, n] of Object.entries(cats)) cr[c] = (cr[c] || 0) + n; cr._towns = (cr._towns || 0) + 1;
    const E = t.econ || {};
    const needWorth = val(Object.fromEntries(Object.entries(needsOf(t.people, t.tier)).map(([g, v]) => [g, v * t.pop / 100])));
    const haulIn = Object.entries(E.trade || {}).reduce((s, [g, v]) => s + (v > 0 ? v * worth(g) : 0), 0);
    towns.push({w: k, people: t.people, tier: t.tier, cap: !!t.capital, pop: Math.round(t.pop), built: t.built.length, uniq: new Set(t.built).size,
      room: Math.round(room(fx)), can, cats, made: Math.round(val(E.prod)), need: Math.round(needWorth), haulIn: Math.round(haulIn),
      stock: Math.round(val(E.stock)), load: E.load, def: +fx.defence.toFixed(3), faith: +fx.faith.toFixed(3), food: +fx.food.toFixed(3), realm: `${k}:${t.realm}`});
  }
  for (const r of a.realms) {
    const ts = a.towns.filter(t => t.alive && t.realm === r.id);
    if (!ts.length) continue;
    realms.push({w: k, people: r.people, towns: ts.length, pop: Math.round(ts.reduce((s, t) => s + t.pop, 0)), built: ts.reduce((s, t) => s + t.built.length, 0),
      made: Math.round(ts.reduce((s, t) => s + val(t.econ?.prod), 0)), trade: realmTrade(a, r.id),
      gold: Math.round(ts.reduce((s, t) => s + (t.econ?.stock?.gold || 0), 0)), goldMade: +ts.reduce((s, t) => s + (t.econ?.prod?.gold || 0), 0).toFixed(2),
      arms: Math.round(ts.reduce((s, t) => s + (t.econ?.stock?.arms || 0) + (t.econ?.stock?.armor || 0), 0)), kingdom: r.kingdom ? {stats: r.kingdom.stats, ruin: r.kingdom.ruin, upkeep: r.kingdom.upkeep} : null});
  }
}
console.log(JSON.stringify({N, size, series, towns, realms, events, buildFreq, catByRace}));
