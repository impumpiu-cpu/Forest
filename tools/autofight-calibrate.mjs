// The quick fight against the map (plan Г6, the author's word 13.11): the same company, the same foe, fought on the local map
// and at once; the map's outcome by the ratio of the two sides' strength (agents/strength.js), and the quick fight's beside it.
// The quick fight must never win where the map would not, and should cost more (wounds, maims, the dead, potions).
//   node tools/autofight-calibrate.mjs [--seeds 777,790] [--caps 3] [--levels 1,8] [--ratios 0.5,0.7,0.9,1.1,1.4,2] [--jobs 2] [--out file.json] [--write] [--from file.json]
//     --write — the map's outcomes written into data/autofight.js (the table the quick fight reads); --from — the fights of an earlier run, not fought again
// Prints the outcome by ratio (map / quick) and by foe; writes every fight to --out (default runs/autofight.json).
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {writeFileSync, mkdirSync} from 'node:fs';
import * as FS from 'node:fs';
const require_fs = () => FS;
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };

async function plan(seeds, caps, levels, ratios) {
  const {generateAtlas} = await import('../src/atlas/generate.js');
  const {capitals} = await import('../src/campaign/index.js');
  const {LAIRS} = await import('../src/data/lairs.js');
  const {lairFoeKind} = await import('../src/campaign/land.js');
  const jobs = [];
  for (const seed of seeds) {
    const a = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
    const cs = capitals(a).slice(0, caps);
    // the foes: the bands and packs of the road (night and ambush), and the guards of the world's lairs, one of each kind
    const road = [['bandits', 'night'], ['raiders', 'ambush'], ['wolves', 'night'], ['beasts', 'ambush'], ['undead', 'night'], ['cultists', 'night'], ['tribe', 'ambush']];
    const kinds = new Map(); for (const l of a.lairs || []) if (l.alive && !kinds.has(l.kind) && LAIRS.has(l.kind)) kinds.set(l.kind, l.id);
    const foes = [...road.map(([kind, how]) => ({kind, how})), ...[...kinds].map(([lk, id]) => ({lair: id, lairKind: lk, how: 'guard', kind: lairFoeKind(LAIRS.get(lk))}))];
    for (const c of cs) for (const L of levels) for (const f of foes) for (const q of ratios) jobs.push({seed, town: c.town, people: c.people, L, foe: f, ratio: q});
  }
  return jobs;
}

async function work(jobs, out) {
  const {generateAtlas} = await import('../src/atlas/generate.js');
  const {saveAtlas, loadAtlas} = await import('../src/atlas/save.js');
  const C = await import('../src/campaign/index.js');
  const {fight, autoKey} = await import('../src/campaign/fight.js');
  const {companyStrength} = await import('../src/campaign/camp.js');
  const {lairGuard} = await import('../src/campaign/land.js');
  const {ensureXp, need, levelEvening} = await import('../src/campaign/experience.js');
  const {CAMP} = await import('../src/data/camp.js');
  const {mulberry, seedNumber} = await import('../src/core/rng.js');
  const worlds = new Map();
  const world = seed => { if (!worlds.has(seed)) worlds.set(seed, JSON.stringify(saveAtlas(generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0})))); return worlds.get(seed); };
  const raise = (a, K, L) => { for (const m of K.members) { ensureXp(m); if (L > 1) { m.xp = need(L); m.acts = {...(m.acts || {}), role: L}; } } if (L > 1) levelEvening(a, K, () => {}); };
  for (const j of jobs) {
    const row = {...j};
    for (const mode of ['local', 'auto']) {
      const a = loadAtlas(JSON.parse(world(j.seed))), K = C.newCampaign(a, j.town, {mode});
      raise(a, K, j.L);
      const P = companyStrength(a, K);
      const d = j.foe.lair != null ? (() => { const l = a.lairs.find(x => x.id === j.foe.lair); return {...lairGuard(a, l.kind, l.i, 1, l), label: l.name}; })() : {kind: j.foe.kind, strength: 1};
      d.strength = P / (CAMP.foe.unit * j.ratio);   // (the foe bought for this ratio, as the fight's weight leaves it)
      row.key = autoKey(d, j.foe.how);
      const before = new Map(K.members.map(m => [m.id, {hp: m.hp, maims: m.maims || 0}])), pots = K.members.reduce((s, m) => s + (m.potions || 0), 0);
      const t0 = Date.now();
      const won = fight(a, K, d, mulberry(seedNumber(`${j.seed}:${j.town}:${j.L}:${j.ratio}:${j.foe.kind}:${j.foe.lair ?? ''}`)), j.foe.how);
      const f = K.fights.at(-1);
      const fell = K.members.filter(m => before.has(m.id) && !m.alive).length;
      const maims = K.members.reduce((s, m) => s + Math.max(0, (m.maims || 0) - (before.get(m.id)?.maims || 0)), 0);
      const hpLost = K.members.reduce((s, m) => s + (before.has(m.id) ? Math.max(0, before.get(m.id).hp - (m.alive ? m.hp : 0)) : 0), 0);
      const used = pots - K.members.reduce((s, m) => s + (m.alive ? m.potions || 0 : 0), 0);
      row[mode] = {won, P, killed: f.killed, fled: f.fled, foes: f.foes, ours: f.ours, theirs: f.theirs, fell, maims, hpLost, used, n: before.size, ms: Date.now() - t0, species: f.species || d.beast || null};
    }
    out(row);
  }
}

if (!isMainThread) { const rows = []; await work(workerData.jobs, r => { rows.push(r); parentPort.postMessage({tick: 1}); }); parentPort.postMessage({rows}); }
else {
  const seeds = arg('seeds', '777,790').split(','), caps = +arg('caps', 3), levels = arg('levels', '1,8').split(',').map(Number), ratios = arg('ratios', '0.5,0.7,0.9,1.1,1.4,2').split(',').map(Number);
  const jobsN = +arg('jobs', 2), outFile = arg('out', join(here, '..', 'runs', 'autofight.json'));
  if (process.argv.includes('--from')) { const rows = JSON.parse((await import('node:fs')).readFileSync(arg('from'), 'utf8')); const {lairFoe} = await import('../src/campaign/land.js'), {autoKey} = await import('../src/campaign/fight.js'); for (const r of rows) r.key ??= autoKey(r.foe.lairKind ? {kind: r.foe.kind, ...lairFoe(r.foe.lairKind)} : {kind: r.foe.kind}, r.foe.how); report(rows); if (process.argv.includes('--write')) writeTable(rows); process.exit(0); }
  const jobs = await plan(seeds, caps, levels, ratios);
  console.log(`${jobs.length} fights × 2 (map, quick), ${jobsN} workers`);
  const parts = Array.from({length: jobsN}, (_, k) => jobs.filter((_, i) => i % jobsN === k));
  let done = 0; const t0 = Date.now();
  const rows = (await Promise.all(parts.map(p => new Promise((res, rej) => {
    const wk = new Worker(fileURLToPath(import.meta.url), {workerData: {jobs: p}});
    wk.on('message', m => { if (m.tick) { done++; if (done % 50 === 0) console.log(`  ${done}/${jobs.length}, ${Math.round((Date.now() - t0) / 1000)} s`); } else res(m.rows); });
    wk.on('error', rej);
  })))).flat();
  mkdirSync(dirname(outFile), {recursive: true}); writeFileSync(outFile, JSON.stringify(rows));
  report(rows);
  if (process.argv.includes('--write')) writeTable(rows);
}

// ── the table of the map's outcomes (data/autofight.js): by kind of foe, by the ratio asked; each point at the mean ratio the map
// actually stood at; the wins never falling as the ratio rises, the costs never rising; `else` — the worse half of the kinds
// the share won, as low as the fights seen let it be (Wilson's bound, one sigma): a point of a few fights won all is not sure
function wilsonLow(k, n, z = 1) { if (!n) return 0; const p = k / n, d = 1 + z * z / n; return Math.max(0, (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d); }
export function fitTable(rows) {
  const r3 = x => Math.round(x * 1000) / 1000;
  const point = rs => {
    const m = rs.map(r => r.local), mean = f => m.reduce((s, x) => s + f(x), 0) / m.length;
    return {x: Math.exp(mean(x => Math.log(Math.max(1e-3, x.ours / Math.max(1e-6, x.theirs))))), won: m.filter(x => x.won).length, seen: m.length, dead: mean(x => x.fell / x.n), maim: mean(x => x.maims / x.n), hp: mean(x => x.hpLost / x.n), pot: mean(x => Math.max(0, x.used) / x.n)};
  };
  const smooth = ps => {
    ps.sort((p, q) => p.x - q.x);
    // the share won, read as low as the fights seen let it be: the points pooled where the wins would fall as the ratio rises
    // (they cannot: one block), and where they stand the same (a run won all is surer than each point of it); each block's share
    // at its Wilson bound
    if (ps[0].win == null) {
      let blocks = ps.map((p, i) => ({k: p.won, n: p.seen, from: i, to: i}));
      for (let again = true; again;) {
        again = false;
        for (let i = 0; i + 1 < blocks.length; i++) {
          const A = blocks[i], B = blocks[i + 1];
          if (A.k / A.n >= B.k / B.n) { blocks.splice(i, 2, {k: A.k + B.k, n: A.n + B.n, from: A.from, to: B.to}); again = true; break; }
        }
      }
      for (const b of blocks) for (let i = b.from; i <= b.to; i++) ps[i].win = wilsonLow(b.k, b.n);
    }
    for (let i = 1; i < ps.length; i++) { ps[i].win = Math.max(ps[i].win, ps[i - 1].win); if (ps[i].x <= ps[i - 1].x) ps[i].x = ps[i - 1].x * 1.01; }
    for (let i = ps.length - 2; i >= 0; i--) for (const k of ['dead', 'maim', 'hp', 'pot']) ps[i][k] = Math.max(ps[i][k], ps[i + 1][k]);
    return {r: ps.map(p => r3(p.x)), win: ps.map(p => r3(p.win)), dead: ps.map(p => r3(p.dead)), maim: ps.map(p => r3(p.maim)), hp: ps.map(p => r3(p.hp)), pot: ps.map(p => r3(p.pot))};
  };
  const byKey = new Map(); for (const r of rows) { if (!byKey.has(r.key)) byKey.set(r.key, new Map()); const g = byKey.get(r.key); if (!g.has(r.ratio)) g.set(r.ratio, []); g.get(r.ratio).push(r); }
  const table = {}, per = new Map();
  for (const [k, g] of [...byKey].sort()) {
    const ps = [...g].map(([q, rs]) => { const p = point(rs); if (!per.has(q)) per.set(q, []); per.get(q).push(p); return p; });
    table[k] = smooth(ps);
  }
  // the worse half of the kinds at each ratio asked
  const worse = [...per].map(([, ps]) => {
    const half = (key, hi) => { const v = ps.map(p => p[key]).sort((x, y) => (hi ? y - x : x - y)).slice(0, Math.max(1, Math.ceil(ps.length / 2))); return v.reduce((s, x) => s + x, 0) / v.length; };
    return {x: Math.exp(ps.reduce((s, p) => s + Math.log(p.x), 0) / ps.length), win: half('win', false), dead: half('dead', true), maim: half('maim', true), hp: half('hp', true), pot: half('pot', true)};
  });
  return {table, else: smooth(worse)};
}
function writeTable(rows) {
  const {table, else: el} = fitTable(rows), file = join(here, '..', 'src', 'data', 'autofight.js');
  const fs = require_fs(), src = fs.readFileSync(file, 'utf8');
  const one = v => `{r: ${JSON.stringify(v.r)}, win: ${JSON.stringify(v.win)}, dead: ${JSON.stringify(v.dead)}, maim: ${JSON.stringify(v.maim)}, hp: ${JSON.stringify(v.hp)}, pot: ${JSON.stringify(v.pot)}}`.replace(/,(?=\S)/g, ', ');
  const body = `  table: {\n${Object.entries(table).map(([k, v]) => `    '${k}': ${one(v)},`).join('\n')}\n  },\n  else: ${one(el)},\n`;
  const out = src.replace(/  table: \{[\s\S]*?\n  else: [^\n]*\n/, body);
  fs.writeFileSync(file, out);
  console.log(`\nзаписано: ${Object.keys(table).length} видов врага → src/data/autofight.js`);
}

export function report(rows) {
  const bins = [0, 0.6, 0.8, 1, 1.25, 1.6, 2.2, 99];
  const pc = x => `${Math.round(x * 100)}%`.padStart(5);
  const line = (label, rs) => {
    const m = rs.map(r => r.local), q = rs.map(r => r.auto), avg = (xs, k) => xs.reduce((s, x) => s + x[k], 0) / Math.max(1, xs.length);
    const won = xs => xs.filter(x => x.won).length / Math.max(1, xs.length);
    return `${label.padEnd(26)} ${String(rs.length).padStart(4)}  победа ${pc(won(m))} / ${pc(won(q))}   павших ${avg(m, 'fell').toFixed(2)} / ${avg(q, 'fell').toFixed(2)}   увечий ${avg(m, 'maims').toFixed(2)} / ${avg(q, 'maims').toFixed(2)}   здоровья ${avg(m, 'hpLost').toFixed(2)} / ${avg(q, 'hpLost').toFixed(2)}   зелий ${avg(m, 'used').toFixed(2)} / ${avg(q, 'used').toFixed(2)}`;
  };
  console.log('\nпо силе сторон на карте (наши / их), карта / быстрый бой');
  for (let i = 0; i + 1 < bins.length; i++) { const rs = rows.filter(r => { const q = r.local.ours / Math.max(1e-6, r.local.theirs); return q >= bins[i] && q < bins[i + 1]; }); if (rs.length) console.log(line(`${bins[i]}–${bins[i + 1] === 99 ? '∞' : bins[i + 1]}`, rs)); }
  console.log('\nпо врагу');
  const keys = [...new Set(rows.map(r => r.foe.lairKind || `${r.foe.kind}:${r.foe.how}`))];
  for (const k of keys) console.log(line(k, rows.filter(r => (r.foe.lairKind || `${r.foe.kind}:${r.foe.how}`) === k)));
  // where the quick fight won and the map did not: by foe and ratio
  const bad = rows.filter(r => r.auto.won && !r.local.won);
  console.log(`\nбыстрый бой победил, карта — нет: ${bad.length} из ${rows.length}; карта победила, быстрый — нет: ${rows.filter(r => !r.auto.won && r.local.won).length}`);
}
