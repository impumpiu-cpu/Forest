// Probe of the kitchens and the fuel (docs/WORLD.md «Кухни и топливо»): at the end of history, per people — how much of the
// raw food its towns make is cooked (or eaten raw), the kitchens they keep, how much of the fuel their homes and works ask
// for they get and of what, and how much food a head the buildings give. `node tools/kitchen-probe.mjs [worlds] [size]`
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {KITCHENS, POOLS} from '../src/data/townBuildings.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';

const args = process.argv.slice(2), pos = args.filter(x => !x.startsWith('--'));
const N = +(pos[0] || 4), size = pos[1] || 'small';
const RAW = ['raw'], by = {};   // (raw food is one good: docs/WORLD.md «Цепочки 6.1»)
for (let k = 0; k < N; k++) {
  const a = newAtlas({seed: 'macro' + k, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
  while (runNextStage(a)) { /* the whole history */ }
  for (const t of a.towns.filter(t => t.alive && t.econ)) {
    const e = t.econ, P = by[t.people] ||= {towns: 0, pop: 0, rawMade: 0, rawLeft: 0, food: 0, kitchens: {}, fuel: 0, fuelTowns: 0, burnt: {}};
    const eats = new Set(WORLD_PEOPLES.get(t.people).eatsRaw || []);
    P.towns++; P.pop += t.pop; P.food += e.food;
    for (const g of RAW) { P.rawMade += e.made[g] || 0; if (!eats.has(g)) P.rawLeft += Math.max(0, (e.made[g] || 0) - (e.used[g] || 0)); }
    for (const id of KITCHENS) P.kitchens[id] = (P.kitchens[id] || 0) + t.built.filter(x => x === id).length;
    if (e.pools?.fuel != null) { P.fuel += e.pools.fuel; P.fuelTowns++; }
    for (const g of Object.keys(POOLS.fuel)) P.burnt[g] = (P.burnt[g] || 0) + (e.used[g] || 0);
  }
}
for (const [p, P] of Object.entries(by)) {
  const ks = KITCHENS.map(id => `${id} ${(P.kitchens[id] / P.towns).toFixed(1)}`).join(', ');
  console.log(`${p.padEnd(8)} городов ${(P.towns / N).toFixed(1)}, жителей ${Math.round(P.pop / N)} | сырого сварено ${P.rawMade ? Math.round(100 * (1 - P.rawLeft / P.rawMade)) : 100}%, еды от построек на голову ${(P.food / P.pop).toFixed(2)}
         кухонь на город: ${ks} | топлива досталось ${P.fuelTowns ? Math.round(100 * P.fuel / P.fuelTowns) : 100}%, сожгли: ${Object.entries(P.burnt).map(([g, v]) => `${g} ${Math.round(v / N)}`).join(', ')}`);
}
