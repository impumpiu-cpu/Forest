// The towns' households (atlas/economy.js) over a few generated worlds: how loaded their buildings are, how wide spare
// hands make them, how much of their people's needs they meet, and what runs short most — the yardstick for balancing
// the flows of data/townBuildings.js. `npm run economy [worlds] [size]`.
import {generateAtlas} from '../src/atlas/generate.js';
import {TOWN_GOODS} from '../src/data/townBuildings.js';
import {needsOf} from '../src/atlas/economy.js';

const N = +(process.argv[2] || 2), size = process.argv[3] || 'small';
const towns = [];
for (let k = 0; k < N; k++) {
  const a = generateAtlas({seed: 'report' + k, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
  for (const t of a.towns) if (t.alive && t.econ) towns.push(t);
}
const pct = v => `${Math.round(v * 100)}%`;
const label = g => TOWN_GOODS.get(g).label;
const byRace = {};
for (const t of towns) (byRace[t.people] ||= []).push(t);
console.log(`${towns.length} городов в ${N} мирах (${size})`);
for (const [P, ts] of Object.entries(byRace)) {
  const mean = f => ts.reduce((s, t) => s + f(t), 0) / ts.length;
  // the share of the people's need of each good the town meets this season: what it made of it against what is asked
  const met = g => mean(t => {
    const want = (needsOf(t.people, t.tier ?? 0)[g] || 0) * t.pop / 100;
    if (!want) return 1;
    const have = (t.econ.prod?.[g] || 0) + (t.econ.stock[g] || 0) / 30;
    return Math.min(1, have / want);
  });
  const needs = Object.keys(needsOf(P));
  const short = {};
  for (const t of ts) for (const g of t.econ.short) short[g] = (short[g] || 0) + 1;
  const top = Object.entries(short).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([g, n]) => `${label(g)} ${pct(n / ts.length)}`).join(', ');
  console.log(`\n── ${P}: ${ts.length} городов, жителей в среднем ${Math.round(mean(t => t.pop))}`);
  console.log(`   загрузка ${pct(mean(t => t.econ.load))} (мин ${pct(Math.min(...ts.map(t => t.econ.load)))}), размах ×${mean(t => t.econ.scale).toFixed(1)}`);
  console.log(`   нужды покрыты: ${needs.map(g => `${label(g)} ${pct(met(g))}`).join(', ')}`);
  console.log(`   чаще всего не хватает: ${top || '—'}`);
}
