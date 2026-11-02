// The realm as a kingdom of docs/WORLD.md (data/kingdom.js, atlas/kingdom.js): every living realm keeps four
// attributes, four kinds of ruin, its edicts and court; the same seed gives the same kingdoms; their lines are minor
// in the chronicle; feedback at 0 changes nothing and a number turns it on; a condition or a level that cannot be
// read is refused; a town's market keeps to the limits of its step. Part of `npm test`.
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {lineLevel} from '../src/atlas/chronicle.js';
import {holds, baseStats, schismFactor} from '../src/atlas/kingdom.js';
import {realmTowns} from '../src/atlas/realms.js';
import {personOf} from '../src/atlas/persons.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {trade, standing} from '../src/campaign/town.js';
import {REALM_STATS, RUINS, RUIN_RULES, OFFICES, EDICTS, FEEDBACK, MARKET_TIERS, marketTierOf} from '../src/data/kingdom.js';
import * as E from '../src/data/schema/edits.js';

const bad = [];
const expect = (ok, what) => { if (!ok) bad.push(what); };
const make = () => generateAtlas({seed: 'kingdom', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const a = make(), b = make();

// every living realm with towns is a kingdom
const living = a.realms.filter(r => r.fallen == null && realmTowns(a, r.id).length);
expect(living.length > 0, 'в мире нет живых держав');
for (const r of living) {
  const K = r.kingdom;
  if (!K) { bad.push(`держава ${r.name}: нет состояния`); continue; }
  for (const S of REALM_STATS.all()) expect(Number.isFinite(K.stats[S.id]), `${r.name}: ${S.label} — ${K.stats[S.id]}`);
  for (const R of RUINS.all()) expect(K.ruin[R.id] >= 0 && K.ruin[R.id] <= RUIN_RULES.max, `${r.name}: ${R.label} — ${K.ruin[R.id]}`);
  for (const O of OFFICES.all()) expect(O.id in K.court && (K.court[O.id] === null || (personOf(a, K.court[O.id].person)?.alive && personOf(a, K.court[O.id].person).name)), `${r.name}: должность ${O.label}`);
  for (const Ed of EDICTS.all()) expect(Ed.levels.some(l => l.id === K.edicts[Ed.id]), `${r.name}: указ ${Ed.label} — «${K.edicts[Ed.id]}»`);
}
expect(JSON.stringify(a.realms.map(r => r.kingdom)) === JSON.stringify(b.realms.map(r => r.kingdom)), 'тот же сид дал другие державы');
const lines = a.chronicle.filter(c => c.topic === 'kingdom');
expect(lines.length > 0 && lines.every(c => lineLevel(c) === 'minor'), `строки державы: ${lines.length}, не все мелкие`);
expect(a.realms.some(r => Object.values(r.kingdom?.court || {}).some(Boolean)), 'ни одна должность не занята');
// a saved world keeps its kingdoms
expect(JSON.stringify(loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a)))).realms.map(r => r.kingdom)) === JSON.stringify(a.realms.map(r => r.kingdom)), 'сохранение не сохранило державы');

// the attributes come from the towns' buildings; conditions read attributes and ruin
{
  const r = living[0], t = realmTowns(a, r.id)[0], keep = t.built;
  t.built = []; const s0 = baseStats(a, r, [t]);
  t.built = ['temple', 'library']; const s1 = baseStats(a, r, [t]); t.built = keep;
  expect(s1.culture > s0.culture, 'храм и книжня не прибавили культуры');
  expect(holds({war: true}, {stats: {}, ruin: {}, war: true}) && !holds({war: true}, {stats: {}, ruin: {}, war: false}), 'условие войны');
  expect(holds({below: {loyalty: 0.2}}, {stats: {loyalty: 0.1}, ruin: {}}) && !holds({above: {corruption: 1}}, {stats: {}, ruin: {corruption: 0.5}}), 'условие показателя и разрухи');
}

// feedback: 1 at zero, more with strife as the number is set; a reset brings the table's number back
{
  const r = {kingdom: {stats: {loyalty: 1}, ruin: {strife: 4}}}, was = FEEDBACK.schismByStrife;
  E.setCell('kingdomRules', 'feedback.schismByStrife', 'value', 0);
  expect(schismFactor(r) === 1, 'раскол при нулевой обратной связи не 1');
  E.setCell('kingdomRules', 'feedback.schismByStrife', 'value', 0.5);
  expect(schismFactor(r) === 3, `раскол при раздорах 4 и 0,5: ×${schismFactor(r)}`);
  E.resetAll();
  expect(FEEDBACK.schismByStrife === was, 'сброс не вернул обратную связь');
}

// edits: a condition or a level that cannot be read is refused
expect(!!E.setCell('realmEvents', 'harvest', 'when', {below: {nothing: 1}}).error, 'принято условие с несуществующим показателем');
expect(!!E.setCell('edicts', 'taxes', 'levels', [{id: 'x', label: 'x', when: {war: true}}]).error, 'принят указ, где у последнего уровня есть условие');
expect(!!E.setCell('offices', 'ruler', 'adds', {glory: 1}).error, 'принята должность с несуществующим показателем');
E.resetAll();

// a town's market by its step: no limits — as before; a limit keeps the dearest goods and the purse
{
  const base = generateAtlas({seed: '790', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const frozen = JSON.stringify(saveAtlas(base)), c = capitals(base)[0];
  const visit = () => { const w = loadAtlas(JSON.parse(frozen)), K = newCampaign(w, c.town, {mode: 'auto'}), t = w.towns.find(x => x.id === c.town);
    K.gold = 500; K.cargo = {hide: 4}; const done = trade(w, K, t, standing(w, K, t)); return {done, K, t}; };
  expect(MARKET_TIERS.all().every(m => m.maxPrice == null && m.purse == null), 'рынок по ступени ограничен по умолчанию');
  const free = visit(), tier = marketTierOf(free.t).id;
  expect(free.done.some(x => x.startsWith('продали шкуры')), 'без предела город не купил шкуры');
  E.setCell('marketTiers', tier, 'purse', 0); E.setCell('marketTiers', tier, 'maxPrice', 0);
  const tight = visit();
  E.resetAll();
  expect(!tight.done.some(x => x.startsWith('продали шкуры')) && tight.K.cargo.hide === 4, 'город с пустым кошельком купил шкуры');
  expect(tight.done.filter(x => / за \d/.test(x) && !x.startsWith('купили') && !x.startsWith('продали')).length === 0, `город с пределом 0 продал: ${tight.done.join('; ')}`);
}

if (bad.length) { console.log('Держава (этап 7):\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   держава: ${living.length} живых держав — четыре показателя, разруха, указы, двор; тот же сид — те же державы, сохранение их держит; строк летописи ${lines.length}, все мелкие; обратная связь 0 — ничего; рынок по ступени держит предел`);
