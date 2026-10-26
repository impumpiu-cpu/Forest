// The campaign's balance: a batch of whole campaigns, from every capital of several small worlds, with the
// numbers the design aims at (docs/CAMPAIGN.md): how long a campaign lasts, how many come home,
// how many of the eight die and when, the first month without baggage, hunger, fights, the local map.
//
//   npm run campaign:balance -- [options]
//     --worlds 4            how many worlds (seeds 777, 790, 803, … — as campaign-check uses them)
//     --size small          the worlds' size
//     --mode local          'local' (fights and stops on the local map, as the game plays) or 'auto' (quick)
//     --epic                epic worlds (cfg.epic, three eras of history: the quest of the graves and the fourth boss);
//                           generated once and kept in runs/worlds/<size>-<seed>-epic.json (a medium world: a minute)
//     --seeds 777,790       the worlds' seeds instead of --worlds
//     --caps 8              capitals of a world at most
//     --set NAME.key=value  change a number of a data table for every run (repeatable), e.g.
//                           --set CAMP.foe.sway=0.3 --set CAMPAIGN.heal.camp=0.12
//     --vary NAME.key=a,b   compare values (repeatable: variants multiply); an array as [a,b]: --vary EPIC.hunt.every=[60,30],[90,50]
//     --jobs N              parallel workers (default: CPU cores)
//     --out dir             where to write (default runs/campaign-<date-time>)
//
// Prints a table by variant and by people; writes runs.csv (one row per campaign) and summary.json.
// Tables that --set/--vary reach: CAMPAIGN, CAMP, QUEST, BUBBLE, MARKET, VISIT, EPILOGUE, TRAIN, HERD, MINE, SMITH, EPIC.
// In epic worlds also: the years to each clue, the share where the fourth calamity rose before the lair was taken,
// the storms of the graves and of the lair, the deaths by the graves' guards, the lair's, the hunt and the minibosses'
// servants, the world's chronicle and the campaign's log in lines, and how long a campaign takes to compute.
import {Worker, isMainThread, parentPort} from 'node:worker_threads';
import {mkdirSync, writeFileSync, readFileSync, existsSync, renameSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import {CAMP_TIME} from '../src/campaign/fight.js';

const here = dirname(fileURLToPath(import.meta.url));
const TABLES = {CAMPAIGN: '../src/data/campaign.js', CAMP: '../src/data/camp.js', QUEST: '../src/data/quest.js', BUBBLE: '../src/data/bubble.js',
  MARKET: '../src/data/market.js', VISIT: '../src/data/market.js', EPILOGUE: '../src/data/epilogue.js', TRAIN: '../src/data/bubble.js', HERD: '../src/data/bubble.js',
  MINE: '../src/data/campaign.js', SMITH: '../src/data/market.js', EPIC: '../src/data/calamities.js'};
const WORLDS = join(here, '..', 'runs', 'worlds');
const worldFile = (size, seed) => join(WORLDS, `${size}-${seed}-epic.json`);

// the design's aims: a campaign of 5–25 years; the first month without deaths; deaths felt, not certain
export const AIMS = {years: [5, 25], firstMonth: 0.9, won: [0.6, 0.9], coreDead: [1, 3], hungry: 0.15};
// the epic quest (docs/CAMPAIGN.md): harder and longer — a medium world, three graves and a boss;
// the lair taken in 5–20 years; the fourth calamity risen before it in at most `risen` of the campaigns
export const EPIC_AIMS = {won: [0.55, 0.85], coreDead: [1.5, 4], hungry: 0.18, crown: [5, 20], risen: 0.3};

const typed = x => (x === 'true' ? true : x === 'false' ? false : /^-?\d+(\.\d+)?$/.test(x) ? +x : /^\[.*\]$/.test(x) ? JSON.parse(x) : x);
function parseArgs(argv) {
  const o = {worlds: 4, size: 'small', mode: 'local', epic: false, seeds: null, caps: 8, set: {}, vary: [], jobs: availableParallelism(), out: null};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--worlds') o.worlds = +v();
    else if (a === '--size') o.size = v();
    else if (a === '--mode') o.mode = v();
    else if (a === '--epic') o.epic = true;
    else if (a === '--seeds') o.seeds = v().split(',');
    else if (a === '--caps') o.caps = +v();
    else if (a === '--jobs') o.jobs = +v();
    else if (a === '--out') o.out = v();
    else if (a === '--set') { const [k, x] = v().split('='); o.set[k] = typed(x); }
    else if (a === '--vary') { const [k, x] = v().split('='); o.vary.push([k, x.split(/,(?![^[]*\])/).map(typed)]); }   // (commas inside [..] belong to an array)
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

// ── a worker: one campaign a job (the world generated once per worker and kept frozen); or an epic world to make
async function worker() {
  const {generateAtlas} = await import('../src/atlas/generate.js');
  const {saveAtlas, loadAtlas} = await import('../src/atlas/save.js');
  const {capitals, newCampaign, stepCampaign} = await import('../src/campaign/index.js');
  const {isCore} = await import('../src/campaign/march.js');
  const worlds = new Map();
  parentPort.on('message', async job => {
    if (job === 'exit') { process.exit(0); }
    try {
      if (job.make) {   // an epic world, written to the cache (a temporary name first: a broken run leaves no half a file)
        const t0 = Date.now(), f = worldFile(job.size, job.world);
        writeFileSync(f + '.tmp', JSON.stringify(saveAtlas(generateAtlas(epicCfg(job.world, job.size)), 'epic')));
        renameSync(f + '.tmp', f);
        parentPort.postMessage({id: job.id, made: job.world, ms: Date.now() - t0}); return;
      }
      await apply(job.sets);
      if (!worlds.has(job.world)) worlds.set(job.world, job.epic ? readFileSync(worldFile(job.size, job.world), 'utf8')
        : JSON.stringify(saveAtlas(generateAtlas({seed: job.world, size: job.size, land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0}))));
      const a = loadAtlas(JSON.parse(worlds.get(job.world)));
      const caps = capitals(a), cap = caps[caps.length > job.caps ? Math.floor(job.cap * caps.length / job.caps) : job.cap];   // spread over the world's capitals
      if (!cap) { parentPort.postMessage({id: job.id, skip: true}); return; }
      const chron = a.chronicle.length, t0 = Date.now(), K = newCampaign(a, cap.town, {mode: job.mode});
      while (stepCampaign(a));
      const core = K.members.filter(isCore), dead = core.filter(m => m.died), Q = K.quest;
      const causes = {}, srcs = {};
      for (const m of dead) { const c = causeOf(m.died.why); causes[c] = (causes[c] || 0) + 1; }
      for (const m of K.members.filter(m => m.died?.src)) srcs[m.died.src] = (srcs[m.died.src] || 0) + 1;   // all who fell, not only the eight
      const crownDay = K.log.find(l => l.kind === 'crown')?.day ?? null;
      const clueYears = (Q?.clues || []).filter(c => c.found && c.day != null).map(c => +((c.day - (Q.started ?? 0)) / 120).toFixed(2)).sort((p, q) => p - q);
      parentPort.postMessage({id: job.id, row: {
        variant: job.variant, world: job.world, capital: cap.name, people: cap.peopleLabel, phase: K.phase, years: +(K.day / 120).toFixed(2),
        coreDead: dead.length, deathDays: dead.map(m => m.died.day), causes, firstMonth: dead.filter(m => m.died.day < 30).length,
        hungry: +(K.stats.hungryDays / Math.max(1, K.day)).toFixed(3), fights: K.stats.fights, won: K.stats.won, ambushes: K.stats.ambushes || 0,
        storms: K.stats.storms || 0, pursuers: K.stats.pursuers || 0, local: K.stats.local?.camps || 0, localMs: Math.round(CAMP_TIME.get(K) || 0),
        crown: K.log.some(l => l.kind === 'crown'), clues: Q?.found ?? 0, towns: K.stats.towns || 0, joined: K.members.filter(m => !isCore(m)).length,
        epic: !!Q?.epic, clueYears, crownYears: crownDay == null ? null : +(crownDay / 120).toFixed(2),
        risen: Q?.risenDay != null && (crownDay == null || Q.risenDay <= crownDay), stormsGrave: K.stats.stormsGrave || 0, stormsLair: K.stats.stormsLair || 0, srcs,
        forged: K.stats.forged || 0, dug: K.stats.dug || 0, chron, log: K.log.length,
        ms: Date.now() - t0}});
    } catch (e) { parentPort.postMessage({id: job.id, error: String(e.stack || e)}); }
  });
}

const epicCfg = (seed, size) => ({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true});

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
    secPerCampaign: mean(rows.map(r => r.ms)) / 1000, forged: rows.filter(r => r.forged).length / n,
    epic: rows.some(r => r.epic) ? epicSummary(rows.filter(r => r.epic)) : null,
  };
}
// the epic quest: years to the 1st, 2nd, 3rd clue (of those who found it), the lair taken, the fourth risen before it
function epicSummary(rows) {
  const n = rows.length, srcs = {};
  for (const r of rows) for (const [c, v] of Object.entries(r.srcs)) srcs[c] = (srcs[c] || 0) + v;
  return {
    n, clueYears: [0, 1, 2].map(k => { const ys = rows.map(r => r.clueYears[k]).filter(y => y != null); return {share: ys.length / n, p50: quantile(ys, 0.5)}; }),
    crownYears: quantile(rows.map(r => r.crownYears).filter(y => y != null), 0.5), risen: rows.filter(r => r.risen).length / n,
    stormsGrave: mean(rows.map(r => r.stormsGrave)), stormsLair: mean(rows.map(r => r.stormsLair)),
    srcs: Object.fromEntries(Object.entries(srcs).map(([c, v]) => [c, +(v / n).toFixed(2)])),
    chron: mean(rows.map(r => r.chron)), log: mean(rows.map(r => r.log)),
  };
}
const pct = v => `${Math.round(v * 100)}%`, f1 = v => (v == null ? '—' : v.toFixed(1));
const inside = (v, [lo, hi]) => v >= lo && v <= hi;
export function report(label, s) {
  const mark = ok => (ok ? '✓' : '✗'), A = s.epic ? {...AIMS, ...EPIC_AIMS} : AIMS;
  return [
    `${label} — походов ${s.n}`,
    `  ${mark(inside(s.won, A.won))} вернулись с короной ${pct(s.won)} (погибли ${pct(s.lost)}, вышел срок ${pct(s.timeout)}); корону нашли ${pct(s.crown)}, подсказок ${f1(s.clues)}`,
    `  ${mark(inside(s.years.p50, AIMS.years))} лет в пути: в среднем ${f1(s.years.mean)}, медиана ${f1(s.years.p50)}, 10–90% ${f1(s.years.p10)}–${f1(s.years.p90)}`,
    `  ${mark(inside(s.coreDead, A.coreDead))} гибнет из восьми ${f1(s.coreDead)}; по годам ${s.deathsPerYear.slice(0, 12).map(v => v.toFixed(1)).join(' ')}; от чего: ${Object.entries(s.causes).sort((p, q) => q[1] - p[1]).map(([c, v]) => `${c} ${v}`).join(', ')}`,
    `  ${mark(s.firstMonth >= AIMS.firstMonth)} первый месяц без потерь ${pct(s.firstMonth)}; ${mark(s.hungry <= A.hungry)} голодных дней ${pct(s.hungry)}`,
    `    боёв в год ${f1(s.fightsPerYear)} (отбились ${pct(s.winShare)}), штурмов ${f1(s.storms)}, погонь ${f1(s.pursuers)}; на локальной карте ${f1(s.localPerYear)} в год по ${Math.round(s.localMs)} мс; поход считается ${f1(s.secPerCampaign)} с; ковали ${pct(s.forged)} походов`,
    ...(s.epic ? [epicReport(s.epic)] : []),
  ].join('\n');
}
function epicReport(E) {
  const mark = ok => (ok ? '✓' : '✗');
  return [
    `  эпос: подсказки ${E.clueYears.map((c, k) => `${k + 1}-я ${pct(c.share)} за ${f1(c.p50)} г.`).join(', ')}; ${mark(E.crownYears != null && inside(E.crownYears, EPIC_AIMS.crown))} логово взято за ${f1(E.crownYears)} г.; ${mark(E.risen <= EPIC_AIMS.risen)} четвёртое бедствие поднялось раньше ${pct(E.risen)}`,
    `    штурмов могил ${f1(E.stormsGrave)}, логова ${f1(E.stormsLair)}; гибнут (все) у могил ${E.srcs.grave ?? 0}, в логове ${E.srcs.lair ?? 0}, от охоты ${E.srcs.hunt ?? 0}, от слуг минибоссов ${E.srcs.mini ?? 0}; летопись мира ${Math.round(E.chron)} строк, похода ${Math.round(E.log)}`,
  ].join('\n');
}

// the jobs through `n` workers; each message to `got`
function pool(jobs, n, got) {
  let next = 0;
  return new Promise((ok, fail) => {
    let alive = Math.max(1, Math.min(n, jobs.length));
    const N = alive;
    for (let k = 0; k < N; k++) {
      const wk = new Worker(fileURLToPath(import.meta.url));
      // a worker takes the jobs of one world after another (worlds are dealt out in turn)
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else wk.postMessage('exit'); };
      wk.on('message', m => { if (m.error) console.error(`ошибка: ${m.error}`); got(m); feed(); });
      wk.on('error', fail);
      wk.on('exit', () => { if (--alive === 0) ok(); });
      feed();
    }
  });
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const {VERSION} = await import('../src/version.js');
  let variants = [{label: 'база', sets: {...opt.set}}];
  for (const [k, xs] of opt.vary) variants = variants.flatMap(v => xs.map(x => ({label: v.label === 'база' ? `${k}=${JSON.stringify(x)}` : `${v.label} ${k}=${JSON.stringify(x)}`, sets: {...v.sets, [k]: x}})));
  const worlds = opt.seeds || Array.from({length: opt.worlds}, (_, k) => String(777 + k * 13));
  // the epic worlds not made yet: made first, one a worker
  if (opt.epic) {
    mkdirSync(WORLDS, {recursive: true});
    const make = worlds.filter(w => !existsSync(worldFile(opt.size, w)));
    if (make.length) {
      console.log(`Эпические миры (${opt.size}): делаю ${make.join(', ')} → ${WORLDS}`);
      await pool(make.map((w, id) => ({id, make: true, world: w, size: opt.size})), opt.jobs, m => console.log(`  мир ${m.made}: ${(m.ms / 1000).toFixed(0)} с`));
    }
  }
  // the capitals of a world: jobs by world, so a worker keeps its world
  const jobs = [];
  for (const v of variants) for (const w of worlds) for (let c = 0; c < opt.caps; c++) jobs.push({id: jobs.length, variant: v.label, sets: v.sets, world: w, cap: c, caps: opt.caps, size: opt.size, mode: opt.mode, epic: opt.epic});
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = resolve(opt.out || join(here, '..', 'runs', `campaign-${stamp}`));
  mkdirSync(out, {recursive: true});
  const nW = Math.max(1, Math.min(opt.jobs, jobs.length));
  console.log(`Кампания ${VERSION}: вариантов ${variants.length} × миров ${worlds.length} (${opt.size}${opt.epic ? ', эпические' : ''}), режим ${opt.mode}, потоков ${nW} → ${out}`);
  const rows = [], t0 = Date.now();
  let done = 0;
  await pool(jobs, nW, m => { done++; if (m.row) { rows.push(m.row); process.stdout.write(`\r  готово ${done} из ${jobs.length} (${Math.round((Date.now() - t0) / 1000)} с)   `); } });
  console.log('\n');
  const summary = {version: VERSION, options: opt, aims: opt.epic ? {...AIMS, ...EPIC_AIMS} : AIMS, variants: {}};
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
  const flat = rows.map(r => ({...r, deathDays: r.deathDays.join(' '), causes: Object.entries(r.causes).map(([c, v]) => `${c}:${v}`).join(' '),
    srcs: Object.entries(r.srcs).map(([c, v]) => `${c}:${v}`).join(' '), clueYears: r.clueYears.join(' ')}));
  writeFileSync(join(out, 'runs.csv'), csv(flat, Object.keys(flat[0] || {})));
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(`Записано: ${join(out, 'runs.csv')}, summary.json`);
}

if (isMainThread) main().catch(e => { console.error(e); process.exit(1); });
else worker();
