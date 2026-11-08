// The camp set up for the night (campaign/works.js, docs/CAMPAIGN.md «Обустройство стоянки»): with wheels, beasts and
// hides a night's camp plans the cart, the tether, the hide poles, the spit and the stakes the cart brought; the company
// makes them in the evening's first hours; the hides are cured into leather by morning; a stop with an axe and no wheels
// cuts stakes that stand there the next day; a camp with nothing brought has only the spit; the stakes are terrain one
// walks slowly; the same seed sets up the same camp.
//   node tools/works-check.mjs
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campSetup, openCamp, campOutcome, stepCamp, campDone} from '../src/campaign/camp.js';
import {applyCamp} from '../src/campaign/fight.js';
import {CAMP_WORKS} from '../src/data/camp.js';
import {VEHICLES} from '../src/data/transport.js';
import {T, BY_CODE} from '../src/data/terrain.js';
import {HOUR} from '../src/core/time.js';

let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const base = generateAtlas({seed: '790', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0}), fz = JSON.stringify(saveAtlas(base));
const fresh = (k, rich) => {
  const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, capitals(a)[k % capitals(a).length].town, {mode: 'local'});
  K.day = 10 + k;
  if (rich) { K.vehicles.push({kind: 'cart'}); K.beasts.push({id: 901, kind: 'mule', hp: 1}, {id: 902, kind: 'horse', hp: 1}); K.cargo.hide = 5; }
  return {a, K};
};
const run = (a, K, ev, ticks = 4 * 2400) => {
  const S = campSetup(a, K, ev), w = openCamp(S), t0 = w.tick, doneAt = {};
  for (let g = 0; g < ticks && !campDone(w); g++) { stepCamp(w); for (const x of w.works) if (x.done && doneAt[x.key] == null) doneAt[x.key] = (w.tick - t0) / HOUR; }
  return {S, w, o: campOutcome(w), doneAt};
};
const keys = w => [...new Set(w.works.map(x => x.key))].sort().join();

// a night's camp with everything brought
{
  const {a, K} = fresh(1, true), {S, w, o, doneAt} = run(a, K, {kind: 'night', dayIn: 1, foe: null});
  check('с тележкой, зверями и шкурами ставят повозку, коновязь, колья, вертел и судесы', keys(w) === 'racks,spit,stakes,tether,wagon', keys(w));
  const st = w.works.filter(x => x.key === 'stakes');
  check('судес столько, сколько везёт тележка', st.length === VEHICLES.cart.stakes, `${st.length}`);
  check('всё сделано в первые часы стоянки', w.works.every(x => x.done) && Object.values(doneAt).every(h => h <= CAMP_WORKS.setup.hours + 1), JSON.stringify(doneAt));
  check('судесы — местность, проходимая, но медленная', st.every(x => w.grid.terr[x.cells[0]] === T.STAKES) && BY_CODE[T.STAKES].walkable && BY_CODE[T.STAKES].speed < 0.5);
  check('шкуры за ночь выделаны в кожу', o.works.cured === CAMP_WORKS.racks.cure.hides && o.cargo.leather === CAMP_WORKS.racks.cure.leather && o.cargo.hide === 5 - CAMP_WORKS.racks.cure.hides, `шкур ${o.cargo.hide}, кожи ${o.cargo.leather}`);
  check('кольцо судес не перекрывает дорогу', st.every(x => { const i = x.cells[0], xx = i % w.w, yy = (i / w.w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.grid.terr[(yy + dy) * w.w + xx + dx] === T.ROAD) return false; return true; }));
  const B = run(...Object.values(fresh(1, true)), {kind: 'night', dayIn: 1, foe: null});
  check('тот же сид — та же стоянка', JSON.stringify(B.w.works.map(x => [x.key, x.cells])) === JSON.stringify(w.works.map(x => [x.key, x.cells])));
}
// a camp with nothing brought
{
  const {a, K} = fresh(0, false), {w} = run(a, K, {kind: 'night', dayIn: 0, foe: null});
  check('без обоза — только вертел', keys(w) === 'spit', keys(w));
}
// a stop with an axe and no wheels: the stakes are cut, and stand the next day; the hunt's meat is smoked
{
  const {a, K} = fresh(2, false); K.beasts.push({id: 903, kind: 'mule', hp: 1});
  const A = run(a, K, {kind: 'stop', dayIn: 0});
  check('на стоянке с топором судесы рубят на месте', A.S.axe && A.w.works.filter(x => x.key === 'stakes' && x.cut).length > 0 && A.o.works.cut > 0, `нарублено ${A.o.works.cut}`);
  applyCamp(a, K, A.S, A.o, null, 'stop'); K.day++;
  check('день стоянки записан', K.campHere?.i === K.i && K.campHere.days === 1 && K.campHere.cut === A.o.works.cut, JSON.stringify(K.campHere));
  const B = run(a, K, {kind: 'stop', dayIn: 1}, 10);
  check('назавтра всё стоит с вечера, судесы — с первого дня', B.S.stayed === 1 && B.w.works.every(x => x.done) && B.w.works.filter(x => x.key === 'stakes').length === A.o.works.cut, `${B.w.works.filter(x => x.key === 'stakes').length}`);
}
// a stop whose hunt brings fresh meat: a smoking rack, the meat into jerky
{
  const {a, K} = fresh(0, false), S = campSetup(a, K, {kind: 'stop', dayIn: 0}), w = openCamp(S);
  w.stock.meat = CAMP_WORKS.smoke.min + 5;
  for (let g = 0; g < 3 * HOUR && !campDone(w); g++) stepCamp(w);
  check('мясо с охоты: коптильня поставлена, мясо коптится в вяленое', w.works.some(x => x.key === 'smoke' && x.done) && (w.stock.meat || 0) < CAMP_WORKS.smoke.min + 5 && w.stock.jerky > 27, `мяса ${w.stock.meat?.toFixed(1)}, вяленого ${w.stock.jerky?.toFixed(1)}`);
}
if (!ok) { console.log('\nОбустройство стоянки: есть ошибки.'); process.exit(1); }
console.log('\nОбустройство стоянки: все проверки прошли.');
