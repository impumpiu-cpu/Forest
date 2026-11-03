// The caravan's council across walks (docs/CAMPAIGN.md «Вечерний совет и стоянки»): how the walks end, how long they take,
// how many of the eight come home, and what the council chose — the camps by why, the towns by why. For comparing the
// council before and after a change of its choice (its policy, its weights, the caravan's mission profile).
// Usage: node tools/council-probe.mjs [worlds=4] [--json] [--peoples=humans,dwarves] [--want=caravan.camp.goOn=0 …]
// (the fights settled at once; --want sets a weight of data/campaign.js COUNCIL.want for this run only)
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, runCampaign} from '../src/campaign/index.js';
import {CAMPAIGN, COUNCIL} from '../src/data/campaign.js';
import {core} from '../src/campaign/march.js';
import {traceMode} from '../src/core/decide.js';

const worlds = +(process.argv.find(x => /^\d+$/.test(x)) || 4), asJson = process.argv.includes('--json');
const onlyPeoples = (process.argv.find(x => x.startsWith('--peoples=')) || '').slice(10).split(',').filter(Boolean);
for (const x of process.argv.filter(x => x.startsWith('--want='))) { const [id, v] = x.slice(7).split('=') ; COUNCIL.want[id] = +v; }
const sum = {walks: 0, won: 0, lost: 0, timeout: 0, days: 0, home: 0, camp: {}, visit: {}};
const per = {};
const add = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
for (let s = 0; s < worlds; s++) {
  const seed = String(777 + s * 13), base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const frozen = JSON.stringify(saveAtlas(base)), caps = capitals(base);
  for (const p of CAMPAIGN.peoples) {
    if (onlyPeoples.length && !onlyPeoples.includes(p)) continue;
    const c = caps.find(x => x.people === p); if (!c) continue;
    const a = loadAtlas(JSON.parse(frozen));
    const camp = {}, visit = {};
    traceMode('collect', {sink: r => { if (r.point === 'caravan.camp' && r.pick) add(camp, r.pick.split('.').pop()); if (r.point === 'caravan.visit' && r.pick) add(visit, r.pick.split('.').pop()); }});
    newCampaign(a, c.town, {mode: 'auto'});
    const K = runCampaign(a);
    traceMode('off');
    const P = per[p] ||= {walks: 0, won: 0, days: 0, home: 0};
    sum.walks++; P.walks++; add(sum, K.phase); if (K.phase === 'won') P.won++;
    sum.days += K.day; P.days += K.day;
    const h = K.phase === 'won' ? core(K).length : 0; sum.home += h; P.home += h;
    for (const [k, n] of Object.entries(camp)) add(sum.camp, k, n);
    for (const [k, n] of Object.entries(visit)) add(sum.visit, k, n);
    process.stderr.write(`${seed}/${p}: ${K.phase}, ${K.day} дн., домой ${h}; стоянки ${JSON.stringify(camp)}; города ${JSON.stringify(visit)}\n`);
  }
}
const per1 = (o, n) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v / n * 10) / 10]));
const out = {walks: sum.walks, won: sum.won, lost: sum.lost, timeout: sum.timeout, days: Math.round(sum.days / sum.walks), homeOfWon: sum.won ? Math.round(sum.home / sum.won * 10) / 10 : 0,
  campsPerWalk: per1(sum.camp, sum.walks), visitsPerWalk: per1(sum.visit, sum.walks),
  peoples: Object.fromEntries(Object.entries(per).map(([p, P]) => [p, {won: `${P.won}/${P.walks}`, days: Math.round(P.days / P.walks)}]))};
console.log(asJson ? JSON.stringify(out) : out);
