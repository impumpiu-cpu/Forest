// The ferry (campaign/ferry.js, docs/CAMPAIGN.md «Переправа»): a goal over the water is reached with a boat hired in a town
// of the caravan's land and left from the same shore back. Checked on a small world with an island: a deal is struck in a
// town with boats at the sea that lets the caravan in, paid once (never below nothing); aboard nothing of the land happens
// (no march, no camp, no meetings, no fights, no forage, no grazing) and the company is fed and rests; it lands on the
// goal's land and walks to the goal; back, it waits at its landing and sails to the port; the same seed gives the same
// voyage, and a world saved in the middle of one goes on exactly as the unbroken one; a goal on the caravan's land never
// takes a boat.
//   node tools/ferry-check.mjs
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {caravanDay} from '../src/campaign/march.js';
import {reachable} from '../src/campaign/quest.js';
import {overSea, landOf} from '../src/campaign/ferry.js';
import {FERRY} from '../src/data/transport.js';
import {standing} from '../src/campaign/town.js';
import {settleable} from '../src/seam/cell.js';

let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const base = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const fz = JSON.stringify(saveAtlas(base));
// a capital with a land over the water a boat reaches, and a cell there to go to (the farthest of it from the shore's start)
let pick = null;
for (const c of capitals(base)) {
  const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, c.town, {mode: 'auto'}), {mask} = reachable(a, K), S = overSea(a, K, mask);
  if (!S) continue;
  let g = -1; for (let i = 0; i < a.n; i++) if (S[i] && !mask[i] && settleable(a, i)) { g = i; break; }
  if (g >= 0) { pick = {town: c.town, goal: g}; break; }
}
if (!check('в мире есть земля за водой, куда возят лодки', !!pick)) process.exit(1);

// a walk there and back: the quest set aside, the goal over the water (the walk of a campaign before the quest)
function walk(days, stopAt = null) {
  const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, pick.town, {mode: 'auto'});
  K.quest = null; K.goal = pick.goal; K.phase = 'out'; K.path = null;
  const seen = {deal: null, boarded: 0, aboardDays: 0, landed: false, back: false, home: false, bad: [], food: [], tired: []};
  for (let d = 0; d < days && !['won', 'lost', 'timeout'].includes(K.phase); d++) {
    const was = K.ferry?.state, before = {camps: K.stats.camps, fights: K.stats.fights, walked: K.stats.walked, log: K.log.length, food: K.food, beasts: K.beasts.map(b => b.hp).join(), tired: K.members.reduce((s, m) => s + (m.social?.load?.tired || 0), 0)};
    if (was === 'go' && !seen.deal) seen.deal = {...K.ferry};
    caravanDay(a, K, K.day);
    if (was === 'aboard' && K.ferry?.state === 'aboard') {
      seen.aboardDays++;
      if (K.stats.camps !== before.camps || K.stats.fights !== before.fights || K.stats.walked !== before.walked || K.beasts.map(b => b.hp).join() !== before.beasts) seen.bad.push(K.day);
      seen.food.push(K.food - before.food);
      seen.tired.push(K.members.reduce((s, m) => s + (m.social?.load?.tired || 0), 0) - before.tired);
      if (K.log.slice(before.log).some(l => ['night', 'fight', 'camp', 'hunger', 'meet'].includes(l.kind))) seen.bad.push(`${K.day}: ${K.log.slice(before.log).map(l => l.kind).join()}`);
    }
    if (was !== 'aboard' && K.ferry?.state === 'aboard') seen.boarded++;
    if (was === 'aboard' && K.ferry?.state === 'landed') seen.landed = {at: K.i, landing: K.ferry.landing};
    if (K.phase === 'back' && !seen.back) seen.back = true;
    if (was === 'aboard' && !K.ferry && K.phase === 'back') seen.home = true;
    if (stopAt && stopAt(K)) return {a, K, seen};
  }
  return {a, K, seen};
}
const days = 3000, A = walk(days), {K, seen} = A;
check('договор в городе с лодками у моря, куда пускают', !!seen.deal && (() => { const t = A.a.towns.find(x => x.id === seen.deal.port); return t && FERRY.from.some(id => t.built.includes(id)) && !!standing(A.a, K, t); })(), seen.deal && `город ${seen.deal.port}, ${seen.deal.days} дн. пути`);
check('плата одна, казна не ниже нуля', (K.stats.ferries || 0) >= 1 && K.gold >= 0, `переправ ${K.stats.ferries || 0}, казна ${K.gold}`);
check('на борту нет суши: ни перехода, ни стоянок, ни боёв, ни встреч, ни пастбища', seen.aboardDays > 0 && !seen.bad.length, seen.bad.slice(0, 5).join('; '));
check('на борту кормят: еда не убывает', seen.food.every(v => v >= -1e-6), `дней на борту ${seen.aboardDays}`);
check('на борту отдыхают: усталость не растёт', seen.tired.every(v => v <= 1e-9));
check('высадились на земле цели', !!seen.landed && seen.landed.at === seen.landed.landing && landOf(A.a, seen.landed.at, K.people)[pick.goal] === 1);
check('дошли до цели и повернули домой', seen.back);
check('обратно — от места высадки к порту, вторая переправа без платы', seen.boarded >= 2 && seen.home && (K.stats.ferries || 0) === 1, `посадок ${seen.boarded}`);
check('поход окончен', ['won', 'lost', 'timeout'].includes(K.phase), `${K.phase}, ${K.day} дн.`);
// the same seed — the same voyage
const B = walk(days);
check('тот же сид — то же плавание', JSON.stringify(B.K.track) === JSON.stringify(K.track) && B.K.day === K.day && B.K.gold === K.gold);
// saved in the middle of a voyage: goes on as the unbroken one
const mid = walk(days, k => k.ferry?.state === 'aboard' && k.ferry.left === Math.ceil(k.ferry.days / 2));
if (check('плавание посредине нашлось', mid.K.ferry?.state === 'aboard')) {
  const a2 = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(mid.a)))), K1 = mid.K, K2 = a2.campaign;
  for (let d = 0; d < K1.ferry.left + 30; d++) { caravanDay(mid.a, K1, K1.day); caravanDay(a2, K2, K2.day); }
  check('сохранение посреди плавания идёт как без него', K1.i === K2.i && K1.day === K2.day && K1.food === K2.food && JSON.stringify(K1.ferry) === JSON.stringify(K2.ferry), `${K1.i}/${K2.i}`);
}
// a goal on the caravan's own land: no boat
{
  const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, pick.town, {mode: 'auto'}), {mask} = reachable(a, K);
  let g = -1; for (let i = a.n - 1; i >= 0; i--) if (mask[i] && settleable(a, i) && i !== K.home) { g = i; break; }
  K.quest = null; K.goal = g; K.phase = 'out'; K.path = null;
  for (let d = 0; d < 400 && K.phase === 'out'; d++) caravanDay(a, K, K.day);
  check('цель на своей земле — без лодки', !K.ferry && !(K.stats.ferries > 0), `${K.phase}, ${K.day} дн.`);
}
if (!ok) { console.log('\nПереправа: есть ошибки.'); process.exit(1); }
console.log('\nПереправа: все проверки прошли.');
