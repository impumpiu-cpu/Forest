// Balance runner: many games without graphics, in parallel, with a table and a report at the end.
//
//   npm run balance -- [options]
//     --seeds 12            how many seeds per variant (seeds 1…N, shifted by --seed-base)
//     --days 30             how long each game runs (it stops earlier if the settlement falls)
//     --set key=value       change a start setting for every run (repeatable), e.g. --set raids=often
//     --vary key=a,b,c      compare variants of a setting (repeatable: variants multiply)
//     --jobs N              parallel workers (default: CPU cores)
//     --out dir             where to write (default runs/<date-time>)
//
// Writes runs.csv (one row per game), days.csv (one row per game day), summary.json and
// report.html (charts: survival, any metric over time, causes of death, speed).
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));


function parseArgs(argv) {
  const o = {seeds: 12, days: 30, set: {}, vary: [], jobs: availableParallelism(), out: null, seedBase: 0};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--seeds') o.seeds = +v();
    else if (a === '--days') o.days = +v();
    else if (a === '--jobs') o.jobs = +v();
    else if (a === '--out') o.out = v();
    else if (a === '--seed-base') o.seedBase = +v();
    else if (a === '--set') { const [k, x] = v().split('='); o.set[k] = x; }
    else if (a === '--vary') { const [k, x] = v().split('='); o.vary.push([k, x.split(',')]); }
    else if (a === '-h' || a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).join('\n')); process.exit(0); }
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

// menu settings arrive as text: numbers and booleans are converted
const typed = x => (x === 'true' ? true : x === 'false' ? false : /^-?\d+(\.\d+)?$/.test(x) ? +x : x);

const q = x => (typeof x === 'string' && /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
const csv = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => q(r[c] ?? '')).join(','))].join('\n') + '\n';

function quantile(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const {DEFAULT_CFG} = await import('../src/data/presets.js');
  const {METRICS} = await import('../src/data/metrics.js');
  const {VERSION} = await import('../src/version.js');

  const base = {...DEFAULT_CFG};
  for (const [k, x] of Object.entries(opt.set)) base[k] = typed(x);
  // variants: the cartesian product of every --vary
  let variants = [{label: 'база', cfg: {}}];
  for (const [k, xs] of opt.vary) variants = variants.flatMap(v => xs.map(x => ({label: v.label === 'база' ? `${k}=${x}` : `${v.label} ${k}=${x}`, cfg: {...v.cfg, [k]: typed(x)}})));

  const jobs = [];
  for (const v of variants) for (let s = 1; s <= opt.seeds; s++) {
    const seed = String(opt.seedBase + s);
    jobs.push({id: jobs.length, variant: v.label, seed, days: opt.days, cfg: {...base, ...v.cfg, seed}});
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = resolve(opt.out || join(here, '..', 'runs', stamp));
  mkdirSync(out, {recursive: true});
  const nW = Math.max(1, Math.min(opt.jobs, jobs.length));
  console.log(`Тёплый Брод ${VERSION}: вариантов ${variants.length} × сидов ${opt.seeds} × дней ${opt.days}, потоков ${nW} → ${out}`);

  // run the queue on a small worker pool
  const results = new Array(jobs.length), t0 = Date.now();
  let next = 0, done = 0;
  await new Promise((ok, fail) => {
    const feed = wk => { if (next < jobs.length) wk.postMessage(jobs[next++]); else wk.postMessage('exit'); };
    let alive = nW;
    for (let k = 0; k < nW; k++) {
      const wk = new Worker(fileURLToPath(import.meta.url));
      wk.on('message', r => {
        results[r.id] = r; done++;
        const el = (Date.now() - t0) / 1000, eta = el / done * (jobs.length - done);
        process.stderr.write(`\r  ${done}/${jobs.length} игр · ${el.toFixed(0)} с · осталось ~${eta.toFixed(0)} с   `);
        feed(wk);
      });
      wk.on('error', fail);
      wk.on('exit', () => { if (--alive === 0) ok(); });
      feed(wk);
    }
  });
  process.stderr.write('\n');

  // ── tables
  const metricIds = METRICS.ids();
  const runs = jobs.map(j => {
    const r = results[j.id], last = r.rows[r.rows.length - 1] || {};
    return {variant: j.variant, seed: j.seed, survived: r.end ? 0 : 1, endDay: r.end ? r.end.day : '', endReason: r.end?.reason || '',
      days: last.day, ...Object.fromEntries(metricIds.map(m => [m, last[m]])),
      peakPop: Math.max(...r.rows.map(x => x.pop)), msPerTick: +r.msPerTick.toFixed(3),
      msFields: +r.perf.fields.toFixed(3), msNav: +r.perf.nav.toFixed(3), msAgents: +r.perf.agents.toFixed(3)};
  });
  const dayRows = jobs.flatMap(j => results[j.id].rows.map(r => ({variant: j.variant, seed: j.seed, ...r})));
  writeFileSync(join(out, 'runs.csv'), csv(runs, Object.keys(runs[0])));
  writeFileSync(join(out, 'days.csv'), csv(dayRows, ['variant', 'seed', 'day', ...metricIds]));

  // ── per variant: survival by day and quantiles of every metric by day
  const summary = {version: VERSION, created: new Date().toISOString(), options: opt, base,
    metrics: METRICS.all().map(m => ({id: m.id, label: m.label, group: m.group, fmt: m.fmt})), variants: []};
  for (const v of variants) {
    const mine = jobs.filter(j => j.variant === v.label).map(j => ({job: j, r: results[j.id]}));
    const n = mine.length, byDay = [];
    for (let d = 1; d <= opt.days; d++) {
      const alive = mine.filter(x => !x.r.end || x.r.end.day >= d);
      // a fallen colony counts as zero for people and as its last values for everything else
      const at = x => x.r.rows.find(r => Math.ceil(r.day) === d) || x.r.rows[x.r.rows.length - 1];
      const row = {day: d, alive: alive.length / n, m: {}};
      for (const id of metricIds) {
        const xs = mine.map(x => (x.r.end && x.r.end.day < d && id === 'pop' ? 0 : at(x)[id]));
        row.m[id] = [quantile(xs, 0.1), quantile(xs, 0.25), quantile(xs, 0.5), quantile(xs, 0.75), quantile(xs, 0.9)].map(y => +y.toFixed(3));
      }
      byDay.push(row);
    }
    const fin = runs.filter(r => r.variant === v.label);
    const med = k => quantile(fin.map(r => +r[k]), 0.5);
    summary.variants.push({label: v.label, cfg: v.cfg, runs: n, byDay,
      survival: fin.filter(r => r.survived).length / n,
      falls: fin.filter(r => !r.survived).map(r => ({seed: r.seed, day: r.endDay, reason: r.endReason})),
      final: Object.fromEntries(['pop', 'peakPop', 'deaths', 'deathsRaid', 'deathsWolf', 'deathsOther', 'buildings', 'raids', 'raidersKilled', 'food', 'mood', 'crafted', 'msPerTick'].map(k => [k, med(k)])),
      deathsMean: Object.fromEntries(['deathsRaid', 'deathsWolf', 'deathsOther'].map(k => [k, fin.reduce((s, r) => s + r[k], 0) / n])),
      perf: {msPerTick: quantile(fin.map(r => r.msPerTick), 0.5), p90: quantile(fin.map(r => r.msPerTick), 0.9),
        fields: med('msFields'), nav: med('msNav'), agents: med('msAgents')}});
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary));
  const {renderReport} = await import('./report.mjs');
  writeFileSync(join(out, 'report.html'), renderReport(summary));

  // ── console
  const pad = (s, n) => String(s).padEnd(n), num = (x, f = 1) => (x == null ? '—' : (+x).toFixed(f));
  console.log('\n' + pad('вариант', 28) + pad('выжили', 8) + pad('жители', 8) + pad('смерти', 8) + pad('набеги', 8) + pad('здания', 8) + pad('еда', 7) + 'мс/тик');
  for (const v of summary.variants) {
    const f = v.final;
    console.log(pad(v.label, 28) + pad(Math.round(v.survival * 100) + '%', 8) + pad(num(f.pop, 0), 8) + pad(num(f.deaths, 0), 8) + pad(num(f.raids, 0), 8) + pad(num(f.buildings, 0), 8) + pad(num(f.food, 0), 7) + num(v.perf.msPerTick, 2));
    if (v.falls.length) console.log('   пали: ' + v.falls.map(x => `сид ${x.seed} на ${x.day} дн.`).join(', '));
  }
  console.log(`\nмедианы на конец прогона · ${((Date.now() - t0) / 1000).toFixed(0)} с · отчёт: ${join(out, 'report.html')}`);
}

// the same file is both the coordinator and its workers
if (!isMainThread) {
  const {simulate} = await import('../src/headless.js');
  parentPort.on('message', job => {
    if (job === 'exit') process.exit(0);
    const r = simulate(job.cfg, {days: job.days});
    parentPort.postMessage({id: job.id, rows: r.rows, end: r.end, ticks: r.ticks, msPerTick: r.msPerTick, perf: r.perf});
  });
} else {
  await main();
}
