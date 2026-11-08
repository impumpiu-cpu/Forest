// The town's works on small scenes (claude/world-lean; from the branch codex/world-economy-review): what a season of the flows
// must come to, whatever the sharing out — a smelter without fuel makes nothing, one with fuel and one ore makes all its iron
// (a recipe of an ore the town has none of takes no share), a forge without leather still forges (leather is soft), a hearth
// without a mill cooks as a hearth, a chain of logs → charcoal → ingots → wares settles within TOWN_FLOW.rounds. Hand-gathered
// brushwood is off in the scenes, to see the fuel alone. Usage: node tools/economy-invariants-probe.mjs
import assert from 'node:assert/strict';
import {TOWN_FLOW, TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {townEconomy} from '../src/atlas/economy.js';

const town = built => ({id: 1, alive: true, people: 'humans', built, pop: 400, tier: 1, stock: {}, slaves: 0});
const year = o => Object.fromEntries(Object.entries(o).map(([g, v]) => [g, v * 4]));   // (what the store lends, as a year's rate)
function run(built, supply, rounds = null) {
  const prior = TOWN_FLOW.rounds, gather = TOWN_FLOW.gather;
  try {
    if (rounds != null) TOWN_FLOW.rounds = rounds;
    TOWN_FLOW.gather = {};
    const t = town(built), a = {cfg: {}, towns: [t], realms: [], sites: []};
    const e = townEconomy(a, t, 1, year(supply));
    return {made: Object.fromEntries(Object.entries(e.made).map(([g, v]) => [g, Math.round(v * 100) / 100])), rows: e.rows.map(r => [r.id, Math.round(r.eff * 100) / 100]), recipes: e.recipes.filter(x => x.eff > 0).map(x => [x.id, Math.round(x.eff * 100) / 100])};
  } finally { TOWN_FLOW.rounds = prior; TOWN_FLOW.gather = gather; }
}
const cases = {
  foundryWithoutFuel: run(['foundry'], {iron: 1200, tools: 100}),
  foundryWithFuel: run(['foundry'], {iron: 1200, tools: 100, fuel: 1200}),
  forgeWithoutLeather: run(['forge'], {iron: 500, tools: 100, fuel: 1000}),
  hearthWithoutMill: run(['hearth'], {raw: 1000, tools: 100, fuel: 1000}),
  localMetalChain: run(['woodcut', 'charpit', 'mineshaft', 'forge'], {tools: 20, leather: 20}),
};
const chain = Object.fromEntries([2, 3, 4, 5, 8].map(n => [n, run(['woodcut', 'charpit', 'mineshaft', 'forge'], {tools: 20, leather: 20}, n).made.arms || 0]));
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
check((cases.foundryWithoutFuel.made.steel || 0) === 0, 'сталеварня без топлива не варит');
check(Math.abs((cases.foundryWithFuel.made.steel || 0) - 56) < 0.5, `сталеварня с топливом и железом даёт всю свою сталь (${cases.foundryWithFuel.made.steel})`);
check((cases.forgeWithoutLeather.made.arms || 0) >= 5, `кузня без кожи куёт вполсилы (оружия ${cases.forgeWithoutLeather.made.arms})`);
check(Math.abs((cases.hearthWithoutMill.made.food || 0) - TOWN_BUILDINGS.get('hearth').out.food) < 0.5, `очаг без мельницы варит как очаг (еды ${cases.hearthWithoutMill.made.food})`);
check((cases.localMetalChain.made.arms || 0) >= 10, `цепочка вырубка → уголь → рудник → кузня куёт (оружия ${cases.localMetalChain.made.arms})`);
check(chain[TOWN_FLOW.rounds] >= 10 && chain[8] === chain[TOWN_FLOW.rounds], `цепочка сходится за TOWN_FLOW.rounds = ${TOWN_FLOW.rounds} (оружие по раундам: ${JSON.stringify(chain)})`);
if (process.argv.includes('--json')) console.log(JSON.stringify({cases, chain}, null, 1));
if (fails) process.exit(1);
