// Headless smoke test: runs a colony for several days and prints what happened.
// Usage: node tools/smoke.mjs [days] [seed]
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {colonists, ofSpecies, foodTotal} from '../src/settlement/query.js';
import {taskLabel} from '../src/agents/tasks.js';
import {DAY} from '../src/core/time.js';

const days = +(process.argv[2] || 6), seed = process.argv[3] || DEFAULT_CFG.seed;
const w = newGame({...DEFAULT_CFG, seed, wildlife: 'many'});
for (let d = 0; d < days; d++) {
  for (let t = 0; t < DAY; t++) step(w);
  const col = colonists(w), tasks = {};
  for (const a of col) { const l = taskLabel(a); tasks[l] = (tasks[l] || 0) + 1; }
  const stock = Object.entries(w.stock).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
  console.log(`day ${d + 1}: people ${col.length}, hares ${ofSpecies(w, 'hare').length} (hunted ${w.stats.hunted}), food ${foodTotal(w).toFixed(0)} | ${stock} | built: ${w.buildings.map(b => b.key + (b.done ? '' : '~')).join(',') || '—'}`);
  console.log('   ', JSON.stringify(tasks));
}
console.log('\n' + w.logLines.slice(0, 25).reverse().map(l => `${l.when} · ${l.html.replace(/<[^>]+>/g, '')}`).join('\n'));
const perf = Object.entries(w.perf).map(([k, v]) => `${k} ${v.toFixed(2)}ms`).join(', ');
console.log('\nperf per tick:', perf);
