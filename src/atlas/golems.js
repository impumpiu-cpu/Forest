// The dwarves' golems (docs/WORLD.md «Асимметрия народов»; numbers: data/townBuildings.js GOLEMS). A town with a golem
// forge makes a golem a season, from the season after the forge stands, of the best metal its realm works:
//   1. it takes over a unit of work in GOLEMS.order (the mine first) while there are fewer takers than one for every
//      GOLEMS.per people — the unit then needs GOLEMS.jobs of its hands and gives GOLEMS.bonus more (atlas/economy.js);
//   2. once the realm works a better metal, it remakes a taker in it, one a season (a bronze golem becomes a mithril one);
//   3. then it stands guard, one for every GOLEMS.per people: a guard golem counts as GOLEMS.men of the town's people in
//      its might and in its armies (atlas/towns.js might, golemMen).
// t.golems = {auto: {building id: [metal, …] — one for each unit taken over}, guard: [metal, …], since: the first season}
import {GOLEMS as G, metalBuildings} from '../data/townBuildings.js';
import {realmBuilt} from './towns.js';

// the best metal the realm of a town works, of the golems' metals, or null
export function golemMetal(a, t) {
  const built = realmBuilt(a, t);
  for (let k = G.tiers.length - 1; k >= 0; k--) if (metalBuildings(G.tiers[k]).some(id => built.has(id))) return G.tiers[k];
  return null;
}
const rank = m => G.tiers.indexOf(m);
export const golemMen = t => (t.golems?.guard || []).reduce((s, m) => s + (G.men[m] || 0), 0);
// the takers of the units of a kind, as many as the units still standing
export const takersOf = (t, id) => (t.golems?.auto?.[id] || []).slice(0, t.built.filter(x => x === id).length);

// a season of a town's golem forge: one golem made, remade or set on guard; → a line for the chronicle or null
export function stepGolems(a, t) {
  if (!t.built.includes('golemforge')) return null;
  const g = t.golems ||= {auto: {}, guard: [], since: null};
  if (g.since == null) { g.since = a.hist?.year ?? 0; return null; }   // the forge is lit: the first golem a season later
  const metal = golemMetal(a, t); if (!metal) return null;
  // a golem is made of the forge's work and the metal of the store (data/townBuildings.js GOLEMS.make): an idle forge, or no
  // metal, makes none this season
  if ((t.work?.golemforge ?? 1) < G.make.work || (t.stock?.metal || 0) < G.make.metal) return null;
  const pay = () => { if (t.stock) { t.stock.metal = Math.round((t.stock.metal - G.make.metal) * 100) / 100; if (t.stock.metal <= 0) delete t.stock.metal; } };
  for (const id of Object.keys(g.auto)) g.auto[id] = takersOf(t, id);   // the takers of units gone are gone with them
  const want = Math.max(1, Math.floor(t.pop / G.per));
  const taken = Object.values(g.auto).reduce((s, l) => s + l.length, 0);
  if (taken < want) {
    for (const id of G.order) {
      const n = t.built.filter(x => x === id).length;
      if (n > (g.auto[id] || []).length) { (g.auto[id] ||= []).push(metal); pay(); return {kind: 'auto', id, metal}; }
    }
  }
  for (const id of G.order) {
    const l = g.auto[id] || [], k = l.findIndex(m => rank(m) < rank(metal));
    if (k >= 0) { const was = l[k]; l[k] = metal; pay(); return {kind: 'remake', id, metal, was}; }
  }
  const away = (a.parties || []).filter(p => p.kind === 'army' && p.from === t.id && p.state !== 'gone' && !p.returned).reduce((s, p) => s + (p.golems?.length || 0), 0);
  if (g.guard.length + away < want) { g.guard.push(metal); pay(); return {kind: 'guard', metal}; }
  const k = g.guard.findIndex(m => rank(m) < rank(metal));
  if (k >= 0) { g.guard[k] = metal; pay(); return {kind: 'remake', id: null, metal}; }
  return null;
}
