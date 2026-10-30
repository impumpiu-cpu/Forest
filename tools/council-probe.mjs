// What the towns of a people want to build and why: at given years, every town's needs, the top of its wants, its plots
// and food, and whether the farm chain can be built at all. `node tools/council-probe.mjs <seed> <people> <years,...>` → JSON.
import {newAtlas, runNextStage, landDone} from '../src/atlas/generate.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {townFx, room, canBuild, townNeeds, wantOf, realmBuilt, plotsOf, plotsUsed} from '../src/atlas/towns.js';
import {realmTaste} from '../src/atlas/realms.js';
import {roadAccess} from '../src/atlas/roads.js';
import {leanOf} from '../src/atlas/mind.js';
import {buildingVectors} from '../src/data/mind.js';
import {siteCell} from '../src/atlas/sites.js';
import {needsOf} from '../src/atlas/economy.js';

const [seed = 'macro0', people = 'humans', ys = '90,100,110,120'] = process.argv.slice(2);
const at = new Set(ys.split(',').map(Number));
const a = newAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const r2 = v => Math.round(v * 100) / 100;
const out = [];
const FARM = ['field', 'garden', 'pasture', 'pen', 'quern', 'watermill', 'windmill', 'bakery', 'campfire', 'hearth', 'cookhouse', 'granary', 'smokehouse', 'lodge', 'fishhut', 'hut', 'house', 'longhouse', 'stonehouse'];
while (runNextStage(a)) {
  if (!landDone(a) || !a.hist || !a.towns || a.hist.season !== 1 || !at.has(a.hist.year)) continue;
  at.delete(a.hist.year);
  const vecs = buildingVectors(TOWN_BUILDINGS.all());
  for (const t of a.towns) if (t.alive && t.people === people && t.wants) {   // a town founded this season has no wants yet
    const pe = a.peoples.find(p => p.id === t.people), P = {...pe.P, taste: realmTaste(a, t.realm)}, fx = townFx(t);
    const ctx = {feeds: t.wants.feeds, threat: t.wants.threat, road: roadAccess(a, t.i)};
    const L = leanOf(a, t), lean = L && {...L, vecs};
    const need = townNeeds(a, t, fx, ctx), inR = realmBuilt(a, t);
    const all = TOWN_BUILDINGS.all().filter(b => canBuild(a, t, b, inR)).map(b => [b.id, r2(wantOf(t, b, need, P, lean))]).sort((x, y) => y[1] - x[1]);
    const farm = {};
    for (const id of FARM) {
      const b = TOWN_BUILDINGS.get(id);
      if (b.peoples && !b.peoples.includes(people)) continue;
      const n = t.built.filter(x => x === id).length;
      farm[id] = n >= b.max ? `max ${n}` : canBuild(a, t, b, inR) ? `ok ${r2(wantOf(t, b, need, P, lean))}` : b.tier > t.tier ? `tier${b.tier}` : b.site && siteCell(a, t, b) < 0 ? 'no site' : (b.requires || b.requiresAny) ? 'requires' : 'place/plots';
    }
    out.push({y: a.hist.year, name: t.name, tier: t.tier, pop: Math.round(t.pop), room: Math.round(room(fx)), feeds: Math.round(t.wants.feeds), fed: t.econ?.fed, plots: `${plotsUsed(t)}/${plotsOf(t)}`,
      project: t.project, role: t.role, lean: L && {k: r2(L.k), vec: L.vec}, need: Object.fromEntries(Object.entries(need).map(([k, v]) => [k, r2(v)])), short: t.econ?.short,
      top: all.slice(0, 8), farm, built: t.built});
  }
  if (!at.size) break;
}
console.log(JSON.stringify(out));
