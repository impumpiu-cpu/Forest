// What a world's history comes to — its events and its peoples — for comparing two ways of reckoning the towns' economy
// (claude/world-lean: the full flows against the lean profile). Not a check: a measure. One seed per process.
// Usage: node tools/world-events-probe.mjs <seed> [--size=small] [--econ=full|soft|lean|yearly|r7] [--out=file.json]
//   --econ   cfg.econ (atlas/economy.js econMode): the way the towns' works are reckoned
import {writeFileSync} from 'node:fs';
import {newAtlas, runNextStage, landDone} from '../src/atlas/generate.js';
import {startHistory, stepHistory, historyDone} from '../src/atlas/history.js';
import {lineLevel} from '../src/atlas/chronicle.js';
import {SEASONS_PER_YEAR as S} from '../src/data/atlas.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';

const args = process.argv.slice(2), seed = args.find(s => !s.startsWith('--')) || '5';
const opt = k => args.find(s => s.startsWith(`--${k}=`))?.split('=')[1];
const size = opt('size') || 'small', econ = opt('econ') || 'full', lean = econ !== 'full', out = opt('out');
const PEOPLES = WORLD_PEOPLES.all().map(p => p.id);

// the chronicle's kinds of lines (data/worldChronicle.js LEVEL_RULES and what the towns' history says)
const KINDS = {
  war: /началась война|не поделили/, peace: /заключили мир/, storm: /взяло штурмом|осталось пепелище/,
  schism: /Раскол|объявил[аои]? себя/, founded: /основали|и заложили/, raidBeaten: /отбили набег|^За год отбито/,
  raid: /набег/, siege: /осадило/, famine: /голод|привозным хлебом|Тяжёлые годы/, plenty: /Год изобилия/,
  built: /появил(ся|ась|ось|ись)/, tribute: /платят/, levy: /Набор войска|собрали войско|Войско /,
  disaster: /^(Половодье|Засуха|Лютая зима|Крысы|Мор)/, tax: /^Подати/, court: /При дворе|Совет /, feast: /Праздники/,
  ruler: /Умер|пал[аи]? в бою|погиб|на трон|Трон пуст/, settled: /осели/,
};
const kindOf = text => Object.entries(KINDS).filter(([, re]) => re.test(text)).map(([k]) => k);

const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', ...(lean ? {econ} : {}), ...(opt('choose') ? {choose: opt('choose')} : {})});
let t0 = performance.now();
while (!landDone(a)) runNextStage(a);
const landMs = performance.now() - t0;
startHistory(a);
t0 = performance.now();
const series = [];   // a line a year (at its spring): the peoples' towns and people, realms, wars
let famine = 0, hungryTowns = 0, needsSum = 0, needsN = 0, unpaidSum = 0, idleN = 0, rowsN = 0;
while (!historyDone(a)) {
  stepHistory(a);
  const H = a.hist, live = a.towns.filter(t => t.alive);
  for (const t of live) {
    if (t.ateStores) famine += t.ateStores;
    if (t.econ && t.econ.feeds + 1 < 0) hungryTowns++;
    if (t.needs) { needsSum += t.needs.basic; needsN++; }
    unpaidSum += t.unpaid || 0;
    for (const r of t.econ?.rows || []) { rowsN++; if (r.eff < 0.25) idleN++; }
  }
  if (H.season === 0) series.push({
    y: H.year,
    pop: Object.fromEntries(PEOPLES.map(p => [p, Math.round(live.filter(t => t.people === p).reduce((s, t) => s + t.pop, 0))])),
    towns: Object.fromEntries(PEOPLES.map(p => [p, live.filter(t => t.people === p).length])),
    tier2: live.filter(t => t.tier >= 2).length,
    realms: (a.realms || []).filter(r => r.fallen == null).length,
    wars: Object.values(a.rel || {}).filter(r => r.war).length,
    armies: (a.parties || []).filter(p => p.kind === 'army' && p.state !== 'gone').length,
    realmGold: Math.round((a.realms || []).reduce((s, r) => s + (r.gold || 0), 0)),
    stock: Math.round(live.reduce((s, t) => s + Object.values(t.stock || {}).reduce((q, v) => q + v, 0), 0)),
  });
}
const histMs = performance.now() - t0;

const chron = a.chronicle.filter(c => c.season != null);
const kinds = {};
for (const c of chron) for (const k of kindOf(c.text)) kinds[k] = (kinds[k] || 0) + 1;
// the fingerprint of the history: its major lines, as (decade, kind, the peoples it names)
const pnames = WORLD_PEOPLES.all().map(p => [p.id, new RegExp(p.label.slice(0, 5), 'i')]);
const major = chron.filter(c => lineLevel(c) === 'major').map(c => ({y: c.year, k: kindOf(c.text)[0] || 'other', p: pnames.filter(([, re]) => re.test(c.text)).map(([id]) => id).sort().join('+'), text: c.text}));
const trade = [...(a.net?.links?.values() || [])].reduce((s, l) => s + (l.goods || 0), 0);
const res = {
  seed, size, econ, choose: opt('choose') || null, landMs: Math.round(landMs), histMs: Math.round(histMs), years: a.hist.year - 1,
  end: series.at(-1), series, kinds, majorN: major.length, major: major.map(({y, k, p}) => ({y, k, p})),
  towns: a.towns.length, ruins: Object.fromEntries(PEOPLES.map(p => [p, (a.ruins || []).filter(r => r.people === p).length])),
  warsStarted: Object.values(a.rel || {}).reduce((s, r) => s + (r.wars || 0), 0),
  famine: Math.round(famine), hungryTowns, needs: needsN ? +(needsSum / needsN).toFixed(3) : null, unpaid: +(unpaidSum / Math.max(1, needsN)).toFixed(3),
  idleRows: rowsN ? +(idleN / rowsN).toFixed(3) : 0, trade: Math.round(trade), chronicle: a.chronicle.length,
};
const txt = JSON.stringify(res);
if (out) writeFileSync(out, txt); else console.log(txt);
console.error(`seed ${seed}${lean ? ' ' + econ : ''}: land ${(landMs / 1000).toFixed(1)} s, history ${(histMs / 1000).toFixed(1)} s, ${res.years} years, towns ${res.towns}, wars ${res.warsStarted}, major ${res.majorN}`);
