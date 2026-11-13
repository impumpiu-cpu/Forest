// The quick fight against the map (plan Г6, the author's word 13.11): the same company, the same foe, fought on the local map
// and at once; the map's outcome by the ratio of the two sides' strength (agents/strength.js), and the quick fight's beside it.
// The quick fight must never win where the map would not, and should cost more (wounds, maims, the dead, potions).
//   node tools/autofight-calibrate.mjs [--seeds 777,790] [--caps 3] [--levels 1,8] [--ratios 0.5,0.7,0.9,1.1,1.4,2] [--jobs 2] [--out file.json]
// Prints the outcome by ratio (map / quick) and by foe; writes every fight to --out (default runs/autofight.json).
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {writeFileSync, mkdirSync} from 'node:fs';
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
  const {fight} = await import('../src/campaign/fight.js');
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
