// Targeted comparisons of world-lean modes. No production data are changed permanently.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {townEconomy} from '../src/atlas/economy.js';
import {TOWN_BUILDINGS, TOWN_FLOW} from '../src/data/townBuildings.js';

const MODES = ['full', 'r7', 'soft', 'lean', 'pool'];
const town = built => ({id: 1, i: 0, people: 'humans', alive: true, realm: 1, pop: 1000, heads: {human: [0, 1000, 0]}, kin: {human: 1}, built: [...built], tier: 2, stock: {}});
function run(mode, built, supply, rounds = null) {
  const prior = TOWN_FLOW.rounds;
  try {
    if (rounds != null) TOWN_FLOW.rounds = rounds;
    const t = town(built), a = {cfg: {econ: mode}, towns: [t], realms: [], sites: []};
    const e = townEconomy(a, t, 1, {...supply});
    return {made: e.made, used: e.used, feeds: e.feeds, rows: e.rows.map(r => ({id:r.id, eff:r.eff})), recipes: e.recipes.filter(r=>r.eff>1e-9).map(r=>({id:r.id, eff:r.eff})), overdrafts: Object.entries(e.used).filter(([g,n])=>n > (supply[g]||0)+(e.made[g]||0)+1e-6).map(([g,n])=>({good:g, used:n, available:(supply[g]||0)+(e.made[g]||0)}))};
  } finally { TOWN_FLOW.rounds = prior; }
}

const gather = TOWN_FLOW.gather;
const results = {base: '86a8d5a9a5b4f2f4861031f3ea4d3c480cca0a85', units: 'annual rates', note: 'Hand-gathered brushwood disabled in fixtures to isolate fuel supply; all other coefficients unchanged.', cases: {}};
try {
  TOWN_FLOW.gather = {};
  const fixtures = {
    smelterWithoutFuel: {built:['smelter'], supply:{ore_iron:1200,tools:100}},
    smelterWithFuel: {built:['smelter'], supply:{ore_iron:1200,tools:100,fuel:1200}},
    forgeWithoutLeather: {built:['forge'], supply:{bar_iron:500,tools:100,fuel:1000}},
    hearthWithoutMill: {built:['hearth'], supply:{raw:1000,tools:100,fuel:1000}},
    localMetalChain: {built:['woodcut','charpit','smelter','forge'], supply:{ore_iron:120,tools:20,leather:20}},
  };
  for (const [name,f] of Object.entries(fixtures)) results.cases[name] = Object.fromEntries(MODES.map(m=>[m,run(m,f.built,f.supply)]));
  const f=fixtures.localMetalChain;
  results.convergence=Object.fromEntries([2,7,8,16,32,64].map(n=>[n,run('full',f.built,f.supply,n)]));
  // A structured work requirement must remain meaningful under the common requirements API.
  const q=TOWN_BUILDINGS.get('smelter').recipes.find(q=>q.id==='iron'), old=q.need;
  try {
    q.need={fact:'kinShare',arg:'elf',op:'>=',value:0.8};
    results.cases.structuredRaceRequirement=Object.fromEntries(['full','pool'].map(m=>[m,run(m,['smelter'],{ore_iron:1200,tools:100,fuel:1200})]));
  } finally { if(old===undefined)delete q.need;else q.need=old; }
} finally { TOWN_FLOW.gather=gather; }
assert.equal(results.cases.smelterWithoutFuel.full.made.bar_iron||0,0);
assert.ok(results.cases.smelterWithoutFuel.soft.made.bar_iron>0);
assert.ok(results.cases.smelterWithoutFuel.pool.made.bar_iron>0);
assert.equal(results.cases.structuredRaceRequirement.full.made.bar_iron||0,0);
assert.ok(results.cases.structuredRaceRequirement.pool.made.bar_iron>0);
const out=process.argv.find(s=>s.startsWith('--out='))?.slice(6);
if(out)writeFileSync(out,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
