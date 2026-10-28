// The search for the numbers of the towns' production chains (docs/WORLD.md «Потоки построек»): how much of each good the
// buildings give (`out`), so that what the towns' buildings take is made — little lacking, few idle, near the numbers as
// they are. `node tools/chain-balance.mjs [seeds] [--full]`.
//   fast: worlds are made once (their histories as they are), then for a candidate × of each good's `out` the towns' seasons
//         of money and goods (atlas/treasury.js) are run on what they have built — `SEASONS` of them — and measured
//   score: the value of what the buildings lacked over the value of what they asked for (food and gold aside), + IDLE × the
//         share of working buildings under half strength, + NEAR × Σ |log ×| (keep near the table)
//   --full: the best × are applied and whole histories run again on new seeds: the shortages before and after
// Prints the × of each good and the buildings' `out` it gives.
import {generateAtlas} from '../src/atlas/generate.js';
import {seasonMoney} from '../src/atlas/treasury.js';
import {TOWN_BUILDINGS, TOWN_GOODS, goodPrice} from '../src/data/townBuildings.js';

const args = process.argv.slice(2), FULL = args.includes('--full');
const SEEDS = (args.find(x => /^[\d,]+$/.test(x)) || '5,9,21').split(',');
const SEASONS = 8, IDLE = 0.3, NEAR = 0.04, STEPS = [0.5, 0.7, 0.85, 1, 1.2, 1.5, 2, 3];
const SKIP = new Set(['food', 'grain', 'stores', 'gold']);
const GOODS = TOWN_GOODS.all().map(g => g.id).filter(g => !SKIP.has(g) && TOWN_BUILDINGS.all().some(b => b.out?.[g]));
const BASE = new Map(TOWN_BUILDINGS.all().map(b => [b.id, {...(b.out || {})}]));
const apply = m => { for (const b of TOWN_BUILDINGS.all()) { const o = BASE.get(b.id); if (!b.out) continue; for (const g of Object.keys(o)) b.out[g] = o[g] * (m[g] ?? 1); } };

const world = seed => generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north'});
// the measure of worlds as they stand: lack, idle
function measure(worlds) {
  let lack = 0, ask = 0, idle = 0, rows = 0;
  const by = {};
  for (const a of worlds) for (const t of a.towns.filter(x => x.alive)) {
    const e = t.econ;
    for (const [g, d] of Object.entries(e.dem)) {
      if (SKIP.has(g)) continue;
      const v = d * goodPrice(g), s = (e.short[g] || 0) * v; ask += v; lack += s;
      (by[g] ||= [0, 0]); by[g][0] += s; by[g][1] += v;
    }
    for (const r of e.rows) { const b = TOWN_BUILDINGS.get(r.id); if (b.cat === 'housing' || !(b.jobs || b.in)) continue; rows += r.n; if (r.eff < 0.5) idle += r.n; }
  }
  return {lack: ask ? lack / ask : 0, idle: rows ? idle / rows : 0, by: Object.fromEntries(Object.entries(by).map(([g, [s, v]]) => [g, v ? s / v : 0]))};
}
// the fast stage: the worlds' towns run their seasons again from the stores and treasuries they had
function snapshot(a) { return a.towns.filter(t => t.alive).map(t => [t, JSON.stringify({stock: t.stock || {}, gold: t.gold, unpaid: t.unpaid})]); }
function rerun(worlds, snaps, m) {
  apply(m);
  worlds.forEach((a, k) => {
    for (const [t, s] of snaps[k]) Object.assign(t, JSON.parse(s));
    const T = a.towns.filter(t => t.alive);
    for (let q = 0; q < SEASONS; q++) seasonMoney(a, T);
  });
  const M = measure(worlds);
  return {...M, score: M.lack + IDLE * M.idle + NEAR * Object.values(m).reduce((s, v) => s + Math.abs(Math.log(v)), 0)};
}

const t0 = Date.now();
const worlds = SEEDS.map(world), snaps = worlds.map(snapshot);
console.log(`миры: ${SEEDS.join(', ')} (${((Date.now() - t0) / 1000).toFixed(0)} с); блага: ${GOODS.join(', ')}`);
let m = Object.fromEntries(GOODS.map(g => [g, 1]));
let best = rerun(worlds, snaps, m);
const start = best;
console.log(`как есть: нехватка ${(best.lack * 100).toFixed(1)}%, простаивает ${(best.idle * 100).toFixed(1)}%`);
// coordinate descent: each good in turn takes the step that scores best, till a pass changes nothing
for (let pass = 0; pass < 4; pass++) {
  let moved = false;
  for (const g of GOODS) {
    let bv = m[g];
    for (const v of STEPS) { if (v === m[g]) continue; const r = rerun(worlds, snaps, {...m, [g]: v}); if (r.score < best.score - 1e-4) { best = r; bv = v; } }
    if (bv !== m[g]) { m[g] = bv; moved = true; console.log(`  круг ${pass + 1}: ${g} ×${bv} → нехватка ${(best.lack * 100).toFixed(1)}%, простаивает ${(best.idle * 100).toFixed(1)}%`); }
  }
  if (!moved) break;
}
console.log(`\nнайдено: нехватка ${(start.lack * 100).toFixed(1)}% → ${(best.lack * 100).toFixed(1)}%, простаивает ${(start.idle * 100).toFixed(1)}% → ${(best.idle * 100).toFixed(1)}%`);
console.log('нехватка по благам (было → стало):', GOODS.filter(g => (start.by[g] || 0) > 0.02 || (best.by[g] || 0) > 0.02).map(g => `${g} ${Math.round((start.by[g] || 0) * 100)}→${Math.round((best.by[g] || 0) * 100)}%`).join(', '));
console.log('множители:', JSON.stringify(Object.fromEntries(Object.entries(m).filter(([, v]) => v !== 1))));
console.log('новые out:');
for (const b of TOWN_BUILDINGS.all()) {
  const o = BASE.get(b.id), ch = Object.keys(o).filter(g => (m[g] ?? 1) !== 1);
  if (ch.length) console.log(`  ${b.id}: ${ch.map(g => `${g} ${o[g]} → ${Math.round(o[g] * m[g])}`).join(', ')}`);
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} с)`);

if (FULL) {
  // the whole histories again, on other seeds: as the table is, and with the × found
  const check = ['33', '44'], run = mm => { apply(mm); return measure(check.map(world)); };
  const before = run({}), after = run(m);
  console.log(`\nполная история (сиды ${check.join(', ')}): нехватка ${(before.lack * 100).toFixed(1)}% → ${(after.lack * 100).toFixed(1)}%, простаивает ${(before.idle * 100).toFixed(1)}% → ${(after.idle * 100).toFixed(1)}%`);
}
