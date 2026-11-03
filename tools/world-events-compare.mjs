// Compares the runs of tools/world-events-probe.mjs by the way of reckoning (cfg.econ): for each measure the mean over the
// seeds, and how far each way lands from the full one seed by seed — against how far the full one lands from itself with one
// round less (r7: a change that should mean nothing — the history's own chaos). Not a check.
// Usage: node tools/world-events-compare.mjs <folder of runs> [modes=full,r7,soft,lean,yearly]
import {readdirSync, readFileSync} from 'node:fs';

const dir = process.argv[2], modes = (process.argv[3] || 'full,r7,soft,lean,yearly').split(',');
const runs = {};
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const [m, s] = f.replace('.json', '').split('-');
  (runs[m] ||= {})[s] = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
}
const seeds = Object.keys(runs.full || {}).filter(s => modes.every(m => runs[m]?.[s]));
const sum = o => Object.values(o || {}).reduce((s, v) => s + v, 0);
const M = {
  'время истории, с': r => r.histMs / 1000,
  'городов за историю': r => r.towns,
  'войн начато': r => r.warsStarted,
  'главных строк': r => r.majorN,
  'штурмов и пепелищ': r => r.kinds.storm || 0,
  'набегов (строк)': r => r.kinds.raid || 0,
  'расколов': r => r.kinds.schism || 0,
  'основано городов (строк)': r => r.kinds.founded || 0,
  'голод / привозной хлеб': r => r.kinds.famine || 0,
  'наборы войска': r => r.kinds.levy || 0,
  'построено (строк)': r => r.kinds.built || 0,
  'пепелищ': r => sum(r.ruins),
  'жителей в конце': r => sum(r.end.pop),
  'городов в конце': r => sum(r.end.towns),
  'городов 2-й ступени': r => r.end.tier2,
  'держав в конце': r => r.end.realms,
  'съедено заготовок': r => r.famine,
  'нужды (доля)': r => r.needs,
  'простаивающих работ': r => r.idleRows,
  'торговля по путям': r => r.trade,
  'Эльфы, жителей': r => r.end.pop.elves, 'Дварфы, жителей': r => r.end.pop.dwarves, 'Люди, жителей': r => r.end.pop.humans, 'Зеленокожие, жителей': r => r.end.pop.orcs,
};
const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length;
const out = {seeds, rows: []};
console.log(`Сидов: ${seeds.length} (${seeds.join(', ')})`);
console.log(['мера'.padEnd(26), ...modes.map(m => m.padStart(9)), ...modes.filter(m => m !== 'full').map(m => `Δ${m}`.padStart(9))].join(' '));
for (const [name, f] of Object.entries(M)) {
  const base = seeds.map(s => f(runs.full[s])), bm = mean(base) || 1e-9;
  const means = modes.map(m => mean(seeds.map(s => f(runs[m][s]))));
  // the seed-by-seed distance from the full, as a share of the full's mean
  const dist = modes.filter(m => m !== 'full').map(m => mean(seeds.map((s, k) => Math.abs(f(runs[m][s]) - base[k]))) / Math.abs(bm));
  out.rows.push({name, means: Object.fromEntries(modes.map((m, k) => [m, means[k]])), dist: Object.fromEntries(modes.filter(m => m !== 'full').map((m, k) => [m, dist[k]]))});
  const fmt = v => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(2)).padStart(9);
  console.log([name.padEnd(26), ...means.map(fmt), ...dist.map(d => `${Math.round(d * 100)}%`.padStart(9))].join(' '));
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out));
