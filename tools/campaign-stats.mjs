// The fights of the campaign, counted across walks (docs/TESTING.md): how many came, how many fell and fled, how the
// two sides' strength compared, and — above all — the named fights: the graves' guards, the fourth's lair, the leaders
// of the old lairs. The walks run on the local map (the fights as the player sees them), one caravan from each people
// of each world. Usage: node tools/campaign-stats.mjs [worlds=2] [seasons=40] [auto]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, stepCampaign} from '../src/campaign/index.js';
import {fightStats, fightReportText} from '../src/campaign/stats.js';
import {CAMPAIGN} from '../src/data/campaign.js';

const worlds = +(process.argv[2] || 2), seasons = +(process.argv[3] || 40), mode = process.argv[4] === 'auto' ? 'auto' : 'local';
const all = [], named = [], reports = [];
const t0 = Date.now();
for (let s = 0; s < worlds; s++) {
  const seed = String(777 + s * 13), base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const frozen = JSON.stringify(saveAtlas(base));
  const caps = capitals(base), pick = CAMPAIGN.peoples.map(p => caps.find(c => c.people === p)).filter(Boolean);
  for (const c of pick) {
    const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, c.town, {mode});
    for (let k = 0; k < seasons && stepCampaign(a); k++);
    const F = K.fights || [];
    all.push(...F.map(f => ({...f, walk: `${seed}/${c.people}`})));
    named.push(...F.filter(f => f.boss).map(f => ({...f, walk: `${seed}/${c.people}`})));
    reports.push(`── ${seed}, ${c.people}: ${K.day} дней, ${F.length} боёв\n${fightReportText(a, K)}`);
    process.stderr.write(`${seed}/${c.people}: ${K.day} дн., боёв ${F.length}, именных ${F.filter(f => f.boss).length}\n`);
  }
}
const avg = (xs, f) => (xs.length ? (xs.reduce((s, x) => s + f(x), 0) / xs.length) : 0);
const pct = (n, d) => (d ? `${Math.round(n / d * 100)}%` : '—');
console.log(`\n=== Бои за ${all.length ? new Set(all.map(f => f.walk)).size : 0} походов, режим ${mode}, ${((Date.now() - t0) / 1000).toFixed(0)} с ===`);
console.log(`всего боёв ${all.length}; выиграно ${pct(all.filter(f => f.won).length, all.length)}; средний отряд ${avg(all, f => f.fighters).toFixed(1)} бойцов`);
const kinds = [...new Set(all.map(f => f.kind))];
console.log('\nпо родам врага: род · боёв · врагов в среднем · убито · бежали · наша/их сила · победы');
for (const k of kinds) {
  const xs = all.filter(f => f.kind === k), n = xs.filter(f => f.foes != null);
  console.log(`  ${k.padEnd(8)} ${String(xs.length).padStart(4)} · ${avg(n, f => f.foes).toFixed(1).padStart(5)} · ${avg(n, f => f.killed || 0).toFixed(1).padStart(5)} · ${avg(n, f => f.fled || 0).toFixed(1).padStart(5)} · ${avg(xs.filter(f => f.theirs > 0), f => f.ours / f.theirs).toFixed(2).padStart(5)} · ${pct(xs.filter(f => f.won).length, xs.length)}`);
}
const sizes = {}; for (const f of all) if (f.foes != null) sizes[f.foes] = (sizes[f.foes] || 0) + 1;
console.log('\nсколько врагов приходит: ' + Object.entries(sizes).sort((p, q) => +p[0] - +q[0]).map(([n, c]) => `${n}: ${c}`).join(', '));
const sp = {}; for (const f of all) for (const [id, n] of Object.entries(f.species || {})) sp[id] = (sp[id] || 0) + n;
console.log('кто приходит: ' + Object.entries(sp).sort((p, q) => q[1] - p[1]).map(([id, n]) => `${id} ${n}`).join(', '));
console.log(`\n=== Именные бои: ${named.length} ===`);
const fates = {}; for (const f of named) fates[f.boss.fate] = (fates[f.boss.fate] || 0) + 1;
console.log('судьба босса: ' + Object.entries(fates).map(([k, n]) => `${k} ${n}`).join(', ') + `; свита в среднем ${avg(named, f => (f.foes || 1) - 1).toFixed(1)}; наша/их сила ${avg(named.filter(f => f.theirs > 0), f => f.ours / f.theirs).toFixed(2)}`);
for (const f of named) console.log(`  ${f.walk} день ${f.day} ${f.how} ${f.boss.name} (${f.boss.species}${f.boss.mustDie ? ', четвёртый' : ''}): свита ${(f.foes ?? 1) - 1} [${Object.entries(f.species || {}).map(([k, n]) => `${k} ${n}`).join(', ')}], босс ${f.boss.fate}${f.boss.hp != null ? ` hp ${f.boss.hp}` : ''}; убито ${f.killed}, бежали ${f.fled}; сила ${f.ours?.toFixed(1)} против ${f.theirs?.toFixed(1)}; ${f.won ? 'победа' : 'отбиты'}${f.fell.length ? `, пали ${f.fell.join(', ')}` : ''}`);
if (process.argv.includes('--reports')) console.log('\n' + reports.join('\n\n'));
