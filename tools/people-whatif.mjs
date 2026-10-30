// What-if for one people: patch its numbers, run the whole history, print the end of each people.
// `node tools/people-whatif.mjs <seed> <variant>` → JSON line. Variants: base, born, settlers, field, combo.
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';

const [seed = 'macro0', variant = 'base'] = process.argv.slice(2);
const H = WORLD_PEOPLES.get('humans');
const patch = {
  born: () => { H.born = 0.40; },
  settlers: () => { H.settlers = {...H.settlers, from: 110, days: 100}; },
  field: () => { TOWN_BUILDINGS.get('field').needs = ['fertile']; },
  combo: () => { H.born = 0.40; H.settlers = {...H.settlers, from: 110, days: 100}; TOWN_BUILDINGS.get('field').needs = ['fertile']; },
};
patch[variant]?.();
const a = newAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
while (runNextStage(a)) { /* history */ }
const out = {seed, variant};
for (const t of a.towns) if (t.alive) {
  const P = out[t.people] ||= {pop: 0, towns: 0, fedPop: 0, fields: 0};
  P.pop += t.pop; P.towns++; P.fedPop += (t.econ?.fed ?? 1) * t.pop; P.fields += t.built.filter(x => x === 'field').length;
}
for (const P of Object.values(out)) if (P.pop != null) { P.fed = +(P.fedPop / P.pop).toFixed(2); P.pop = Math.round(P.pop); delete P.fedPop; }
console.log(JSON.stringify(out));
