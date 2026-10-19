// The campaign's balance: a batch of whole campaigns, from every capital of several small worlds, with the
// numbers the design aims at (docs/CAMPAIGN.md, «Этап 10»): how long a campaign lasts, how many come home,
// how many of the eight die and when, the first month without baggage, hunger, fights, the local map.
//
//   npm run campaign:balance -- [options]
//     --worlds 4            how many worlds (seeds 777, 790, 803, … — as campaign-check uses them)
//     --size small          the worlds' size
//     --mode local          'local' (fights and stops on the local map, as the game plays) or 'auto' (quick)
//     --set NAME.key=value  change a number of a data table for every run (repeatable), e.g.
//                           --set CAMP.budget=0.6 --set CAMPAIGN.heal.camp=0.12
//     --vary NAME.key=a,b   compare values (repeatable: variants multiply)
//     --jobs N              parallel workers (default: CPU cores)
//     --out dir             where to write (default runs/campaign-<date-time>)
//
// Prints a table by variant and by people; writes runs.csv (one row per campaign) and summary.json.
// Tables that --set/--vary reach: CAMPAIGN, CAMP, QUEST, BUBBLE, MARKET, VISIT, EPILOGUE, TRAIN, HERD.
import {Worker, isMainThread, parentPort} from 'node:worker_threads';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TABLES = {CAMPAIGN: '../src/data/campaign.js', CAMP: '../src/data/camp.js', QUEST: '../src/data/quest.js', BUBBLE: '../src/data/bubble.js',
  MARKET: '../src/data/market.js', VISIT: '../src/data/market.js', EPILOGUE: '../src/data/epilogue.js', TRAIN: '../src/data/bubble.js', HERD: '../src/data/bubble.js'};

// the design's aims: a campaign of 5–25 years; the first month without deaths; deaths felt, not certain
export const AIMS = {years: [5, 25], firstMonth: 0.9, won: [0.6, 0.9], coreDead: [1, 3], hungry: 0.15};

const typed = x => (x === 'true' ? true : x === 'false' ? false : /^-?\d+(\.\d+)?$/.test(x) ? +x : x);
function parseArgs(argv) {
  const o = {worlds: 4, size: 'small', mode: 'local', set: {}, vary: [], jobs: availableParallelism(), out: null};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--worlds') o.worlds = +v();
    else if (a === '--size') o.size = v();
    else if (a === '--mode') o.mode = v();
    else if (a === '--jobs') o.jobs = +v();
    else if (a === '--out') o.out = v();
    else if (a === '--set') { const [k, x] = v().split('='); o.set[k] = typed(x); }
    else if (a === '--vary') { const [k, x] = v().split('='); o.vary.push([k, x.split(',').map(typed)]); }
    else if (a === '-h' || a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).join('\n')); process.exit(0); }
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

// NAME.a.b=value into the data table (the module's live object: every module that imported it sees it)
async function apply(sets) {
  for (const [path, value] of Object.entries(sets)) {
    const [name, ...keys] = path.split('.');
    if (!TABLES[name]) throw new Error(`нет таблицы ${name}`);
    let o = (await import(TABLES[name]))[name];
    for (const k of keys.slice(0, -1)) o = o[k];
    if (!(keys.at(-1) in o)) throw new Error(`нет числа ${path}`);
    o[keys.at(-1)] = value;
  }
}

const quantile = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const mean = xs => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const q = x => (typeof x === 'string' && /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
const csv = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => q(r[c] ?? '')).join(','))].join('\n') + '\n';

// why one of the eight died, in a word (campaign/march.js die, campaign/fight.js)
const CAUSES = [[/голод/, 'голод'], [/штурм/, 'штурм'], [/засад/, 'засада'], [/ночном бою/, 'ночь'], [/стоянке/, 'стоянка'], [/бою/, 'бой']];
export const causeOf = why => (CAUSES.find(([re]) => re.test(why)) || [null, 'иное'])[1];

// ── a worker: one campaign a job (the world generated once per worker and kept frozen)
async function worker() {
  const {generateAtlas} = await import('../src/atlas/generate.js');
  const {saveAtlas, loadAtlas} = await import('../src/atlas/save.js');
  const {capitals, newCampaign, stepCampaign} = await import('../src/campaign/index.js');
  const {isCore} = await import('../src/campaign/march.js');
  const worlds = new Map();
  parentPort.on('message', async job => {
    if (job === 'exit') { process.exit(0); }
    try {
      await apply(job.sets);
      if (!worlds.has(job.world)) worlds.set(job.world, JSON.stringify(saveAtlas(generateAtlas({seed: job.world, size: job.size, land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0}))));
      const a = loadAtlas(JSON.parse(worlds.get(job.world)));
      const cap = capitals(a)[job.cap];
      if (!cap) { parentPort.postMessage({id: job.id, skip: true}); return; }
      const t0 = Date.now(), K = newCampaign(a, cap.town, {mode: job.mode});
      while (stepCampaign(a));
      const core = K.members.filter(isCore), dead = core.filter(m => m.died), Q = K.quest;
      const causes = {};
      for (const m of dead) { const c = causeOf(m.died.why); causes[c] = (causes[c] || 0) + 1; }
      parentPort.postMessage({id: job.id, row: {
        variant: job.variant, world: job.world, capital: cap.name, people: cap.peopleLabel, phase: K.phase, years: +(K.day / 120).toFixed(2),
        coreDead: dead.length, deathDays: dead.map(m => m.died.day), causes, firstMonth: dead.filter(m => m.died.day < 30).length,
        hungry: +(K.stats.hungryDays / Math.max(1, K.day)).toFixed(3), fights: K.stats.fights, won: K.stats.won, ambushes: K.stats.ambushes || 0,
        storms: K.stats.storms || 0, pursuers: K.stats.pursuers || 0, local: K.stats.local?.camps || 0, localMs: Math.round(K.stats.local?.ms || 0),
        crown: K.log.some(l => l.kind === 'crown'), clues: Q?.found ?? 0, towns: K.stats.towns || 0, joined: K.members.filter(m => !isCore(m)).length,
        ms: Date.now() - t0}});
    } catch (e) { parentPort.postMessage({id: job.id, error: String(e.stack || e)}); }
  });
}

// ── the summary of a group of campaigns
export function summarize(rows) {
  const n = rows.length, years = rows.map(r => r.years), deaths = rows.flatMap(r => r.deathDays);
  const byYear = []; for (const d of deaths) { const y = Math.floor(d / 120); byYear[y] = (byYear[y] || 0) + 1; }
  const causes = {}; for (const r of rows) for (const [c, v] of Object.entries(r.causes)) causes[c] = (causes[c] || 0) + v;
  return {
    n, won: rows.filter(r => r.phase === 'won').length / n, lost: rows.filter(r => r.phase === 'lost').length / n, timeout: rows.filter(r => r.phase === 'timeout').length / n,
    years: {mean: mean(years), p10: quantile(years, 0.1), p50: quantile(years, 0.5), p90: quantile(years, 0.9)},
    coreDead: mean(rows.map(r => r.coreDead)), firstMonth: rows.filter(r => r.firstMonth === 0).length / n,
    deathsPerYear: Array.from(byYear, v => +((v || 0) / n).toFixed(2)), causes: Object.fromEntries(Object.entries(causes).map(([c, v]) => [c, +(v / n).toFixed(2)])),
    hungry: mean(rows.map(r => r.hungry)), fightsPerYear: mean(rows.map(r => r.fights / Math.max(0.25, r.years))), winShare: mean(rows.map(r => r.won / Math.max(1, r.fights))),
    localPerYear: mean(rows.map(r => r.local / Math.max(0.25, r.years))), localMs: mean(rows.filter(r => r.local).map(r => r.localMs / r.local)),
    crown: rows.filter(r => r.crown).length / n, clues: mean(rows.map(r => r.clues)), storms: mean(rows.map(r => r.storms)), pursuers: mean(rows.map(r => r.pursuers)),
    secPerCampaign: mean(rows.map(r => r.ms)) / 1000,
  };
}
const pct = v => `${Math.round(v * 100)}%`, f1 = v => (v == null ? '—' : v.toFixed(1));
const inside = (v, [lo, hi]) => v >= lo && v <= hi;
export function report(label, s) {
  const mark = ok => (ok ? '✓' : '✗');
  return [
    `${label} — походов ${s.n}`,
    `  ${mark(inside(s.won, AIMS.won))} вернулись с короной ${pct(s.won)} (погибли ${pct(s.lost)}, 25 лет ${pct(s.timeout)}); корону нашли ${pct(s.crown)}, подсказок ${f1(s.clues)}`,
    `  ${mark(inside(s.years.p50, AIMS.years))} лет в пути: в среднем ${f1(s.years.mean)}, медиана ${f1(s.years.p50)}, 10–90% ${f1(s.years.p10)}–${f1(s.years.p90)}`,
    `  ${mark(inside(s.coreDead, AIMS.coreDead))} гибнет из восьми ${f1(s.coreDead)}; по годам ${s.deathsPerYear.slice(0, 12).map(v => v.toFixed(1)).join(' ')}; от чего: ${Object.entries(s.causes).sort((p, q) => q[1] - p[1]).map(([c, v]) => `${c} ${v}`).join(', ')}`,
    `  ${mark(s.firstMonth >= AIMS.firstMonth)} первый месяц без потерь ${pct(s.firstMonth)}; ${mark(s.hungry <= AIMS.hungry)} голодных дней ${pct(s.hungry)}`,
    `    боёв в год ${f1(s.fightsPerYear)} (отбились ${pct(s.winShare)}), штурмов ${f1(s.storms)}, погонь ${f1(s.pursuers)}; на локальной карте ${f1(s.localPerYear)} в год по ${Math.round(s.localMs)} мс; поход считается ${f1(s.secPerCampaign)} с`,
  ].join('\n');
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const {VERSION} = await import('../src/version.js');
  let variants = [{label: 'база', sets: {...opt.set}}];
  for (const [k, xs] of opt.vary) variants = variants.flatMap(v => xs.map(x => ({label: v.label === 'база' ? `${k}=${x}` : `${v.label} ${k}=${x}`, sets: {...v.sets, [k]: x}})));
  const worlds = Array.from({length: opt.worlds}, (_, k) => String(777 + k * 13));
  // eight capitals at most in a small world: jobs by world, so a worker keeps its world
  const jobs = [];
  for (const v of variants) for (const w of worlds) for (let c = 0; c < 8; c++) jobs.push({id: jobs.length, variant: v.label, sets: v.sets, world: w, cap: c, size: opt.size, mode: opt.mode});
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = resolve(opt.out || join(here, '..', 'runs', `campaign-${stamp}`));
  mkdirSync(out, {recursive: true});
  const nW = Math.max(1, Math.min(opt.jobs, jobs.length));
  console.log(`Кампания ${VERSION}: вариантов ${variants.length} × миров ${opt.worlds} (${opt.size}), режим ${opt.mode}, потоков ${nW} → ${out}`);
  const rows = [], t0 = Date.now();
  let next = 0, done = 0;
  await new Promise((ok, fail) => {
    let alive = nW;
    for (let k = 0; k < nW; k++) {
      const wk = new Worker(fileURLToPath(import.meta.url));
      // a worker takes the jobs of one world after another (worlds are dealt out in turn)
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else wk.postMessage('exit'); };
      wk.on('message', m => {
        done++;
        if (m.error) { console.error(`ошибка: ${m.error}`); }
        else if (m.row) { rows.push(m.row); process.stdout.write(`\r  готово ${done} из ${jobs.length} (${Math.round((Date.now() - t0) / 1000)} с)   `); }
        feed();
      });
      wk.on('error', fail);
      wk.on('exit', () => { if (--alive === 0) ok(); });
      feed();
    }
  });
  console.log('\n');
  const summary = {version: VERSION, options: opt, aims: AIMS, variants: {}};
  for (const v of variants) {
    const rs = rows.filter(r => r.variant === v.label);
    const s = summary.variants[v.label] = {all: summarize(rs), people: {}};
    console.log(report(v.label, s.all));
    for (const p of [...new Set(rs.map(r => r.people))]) {
      const ps = s.people[p] = summarize(rs.filter(r => r.people === p));
      console.log(`    ${p.padEnd(6)} ${String(ps.n).padStart(2)} походов: с короной ${pct(ps.won)}, лет ${f1(ps.years.p50)}, гибнет ${f1(ps.coreDead)}, голод ${pct(ps.hungry)}`);
    }
    console.log('');
  }
  const flat = rows.map(r => ({...r, deathDays: r.deathDays.join(' '), causes: Object.entries(r.causes).map(([c, v]) => `${c}:${v}`).join(' ')}));
  writeFileSync(join(out, 'runs.csv'), csv(flat, Object.keys(flat[0] || {})));
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(`Записано: ${join(out, 'runs.csv')}, summary.json`);
}

if (isMainThread) main().catch(e => { console.error(e); process.exit(1); });
else worker();
