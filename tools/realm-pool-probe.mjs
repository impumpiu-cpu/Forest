// The realm's pool against the buying link by link, on the same towns (claude/world-lean): a world lived to a year, saved,
// then one season run twice from that save — with cfg.trade 'realm' and without — and the two compared: what the towns'
// works bought (gold), what they still lacked after it, how many sellers each buyer reached, how far the goods went (hops),
// and the time of the season's money. Not a check: a measure.
// Usage: node tools/realm-pool-probe.mjs [seed=5] [year=80]
import {newAtlas, runNextStage, landDone} from '../src/atlas/generate.js';
import {startHistory, stepHistory, historyDone} from '../src/atlas/history.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {goodPrice} from '../src/data/townBuildings.js';
import {SEASONS_PER_YEAR as S} from '../src/data/atlas.js';

const seed = process.argv[2] || '5', year = +(process.argv[3] || 80);
const a0 = newAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north'});
while (!landDone(a0)) runNextStage(a0); startHistory(a0);
while (!historyDone(a0) && a0.hist.year < year) stepHistory(a0);
const save = saveAtlas(a0, 'probe');
const run = trade => {
  const a = loadAtlas(save); if (trade) a.cfg.trade = trade; else delete a.cfg.trade;
  const t0 = performance.now(); for (let k = 0; k < S; k++) stepHistory(a); const ms = performance.now() - t0;   // a year: four seasons
  const live = a.towns.filter(t => t.alive);
  const bought = live.reduce((s, t) => s + (t.trade?.bought || 0), 0), lackV = live.reduce((s, t) => s + Object.entries(t.econ?.short || {}).reduce((q, [g, v]) => q + v * (t.econ.dem[g] || 0) * goodPrice(g), 0), 0);
  const lacking = live.filter(t => Object.keys(t.econ?.short || {}).length).length, buyers = live.filter(t => (t.trade?.bought || 0) > 0).length;
  const links = [...a.net.links.values()], used = links.filter(l => l.goods > 0).length, home = links.filter(l => l.goods > 0 && l.p.realm === l.q.realm).length;
  return {ms: Math.round(ms), towns: live.length, bought: Math.round(bought), buyers, lacking, lackV: Math.round(lackV), links: links.length, linksUsed: used, homeUsed: home, goodsOnLinks: Math.round(links.reduce((s, l) => s + (l.goods || 0), 0))};
};
run(null); run('realm'); run(null); run('realm');   // (warmed up: the first runs pay for the compiling)
const full = run(null), realm = run('realm'), full2 = run(null), realm2 = run('realm');
full.ms = Math.min(full.ms, full2.ms); realm.ms = Math.min(realm.ms, realm2.ms);
console.log(`seed ${seed}, год ${year}, один год с сохранения; городов ${full.towns}`);
console.log('мера'.padEnd(28), 'по связям'.padStart(10), 'пул державы'.padStart(12));
const names = {ms: 'время года, мс', bought: 'куплено работами, золото', buyers: 'городов-покупателей', lacking: 'городов в нехватке', lackV: 'нехватка после, золото', links: 'связей', linksUsed: 'связей с товаром', homeUsed: '  из них внутри державы', goodsOnLinks: 'товара на связях, золото'};
for (const [k, n] of Object.entries(names)) console.log(n.padEnd(28), String(full[k]).padStart(10), String(realm[k]).padStart(12));
