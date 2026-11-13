// The quick fight's word beside the map's, in whole campaigns (plan Г6): campaigns played on the local map, and before each fight
// what the quick fight would read for it (campaign/fight.js autoGuess, K.shadow) — the ratio it sees, its chance to win, its dead;
// after it what the map gave. By the kind of foe: where the quick fight would win more often than the map (it must not).
//   node tools/autofight-shadow.mjs [--seeds 777,790] [--caps 4]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, stepCampaign, finished} from '../src/campaign/index.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const rows = [];
for (const seed of arg('seeds', '777,790').split(',')) {
  const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0}), fz = JSON.stringify(saveAtlas(base));
  for (const cap of capitals(base).slice(0, +arg('caps', 4))) {
    const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, cap.town, {mode: 'local'}); K.shadow = [];
    let n = 0; while (!finished(K) && n < 200) { stepCampaign(a); n++; }
    rows.push(...K.shadow); console.log(`  ${seed} ${cap.people}: ${K.shadow.length} боёв`);
  }
}
const sum = f => rows.reduce((s, r) => s + f(r), 0), N = Math.max(1, rows.length);
console.log(`\nбоёв ${rows.length}: победа — карта ${Math.round(sum(r => +r.won) / N * 100)} %, быстрый бой ${Math.round(sum(r => r.win) / N * 100)} %; павших за бой — карта ${(sum(r => r.fell) / N).toFixed(2)}, быстрый ${(sum(r => r.dead * r.n) / N).toFixed(2)}`);
const by = {}; for (const r of rows) (by[r.key] ??= []).push(r);
for (const [k, v] of Object.entries(by).sort((p, q) => q[1].length - p[1].length)) {
  const m = v.filter(r => r.won).length / v.length, g = v.reduce((s, r) => s + r.win, 0) / v.length;
  console.log(`${k.padEnd(20)} ×${String(v.length).padStart(3)}  карта ${Math.round(m * 100)}%  быстрый ${Math.round(g * 100)}%${g > m + 0.1 ? '  ← выше карты' : ''}`);
}
