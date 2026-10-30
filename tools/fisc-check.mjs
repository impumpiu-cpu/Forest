// The realm's treasury, its duties and its dealings (atlas/treasury.js, atlas/kingdom.js; docs/WORLD.md «Деньги городов»,
// «Казна державы»): corruption takes its share of the tax; the armies in the field and the court are paid first, the unpaid
// desert and decay; customs on what a town buys of another realm; tribute of the weak to the mighty it hates; a seat stormed
// loses its treasury; the edict of dues by what the treasury holds. `node tools/fisc-check.mjs`
import {TOWN_MONEY as M} from '../src/data/townBuildings.js';
import {EDICTS, whenErrors} from '../src/data/kingdom.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {taxYear, corruptShare, realmDuties, payTribute, lootSeat, fiscOf, reserveOf} from '../src/atlas/treasury.js';
import {holds} from '../src/atlas/kingdom.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const near = (x, y, tol = 1e-6) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y));
const R = M.realm;

// corruption takes its share of the tax on the way
{
  const realm = {id: 1, gold: 0, kingdom: {ruin: {corruption: 5}}}, towns = [{pop: 1000, gold: 200}];
  const got = taxYear(realm, towns, 'usual'), tax = (200 - M.tax.keep * 1000) * M.tax.rate.usual, lost = tax * Math.min(R.corruptMax, R.corrupt * 5);
  check('коррупция уносит долю податей по дороге', near(got, tax - lost) && near(realm.gold, tax - lost) && near(fiscOf(realm).lost, lost) && near(corruptShare(realm), R.corrupt * 5),
    `подати ${tax.toFixed(2)}, унесено ${lost.toFixed(2)}`);
  check('бюрократия народов: эльфы меньше всех, зеленокожие больше всех', ['elves', 'dwarves', 'humans', 'orcs'].map(p => WORLD_PEOPLES.get(p).bureau).every((v, i, l) => !i || v > l[i - 1]));
}

// the duties: the armies in the field and the court first; what is not paid — desertion, decay
{
  const realm = {id: 1, gold: 1000, kingdom: {court: {ruler: {name: 'А'}, marshal: {name: 'Б'}, a: null}}};
  const a = {parties: [{kind: 'army', owner: 1, state: 'go', men: 100}]}, towns = [{pop: 2000}];
  const unpaid = realmDuties(a, realm, towns), court = 2 * R.court * 2, wages = 100 * R.wage;
  check('казна платит войскам в поле и двору; хватает — никто не бежит, упадка нет', unpaid === 0 && near(realm.gold, 1000 - court - wages) && a.parties[0].men === 100,
    `двору ${court}, войскам ${wages}`);
  const poor = {id: 2, gold: 5, kingdom: {court: {ruler: {name: 'А'}}}}, b = {parties: [{kind: 'army', owner: 2, state: 'go', men: 100}]};
  const u2 = realmDuties(b, poor, [{pop: 1000}]), share = 1 - 5 / (100 * R.wage);
  check('пустая казна: войско теряет беглецов по недоплате, двор недоплачен — упадок растёт', poor.gold === 0 && near(b.parties[0].men, 100 * (1 - R.desert * share)) && u2 === 1,
    `осталось ${b.parties[0].men.toFixed(1)}, двору недоплачено ${u2}`);
}

// tribute: the weak pays the mighty it hates; a friend pays nothing
{
  const weak = {id: 1, gold: 100}, strong = {id: 2, gold: 0}, friend = {id: 3, gold: 0}, a = {realms: [weak, strong, friend]};
  const mightOf = id => ({1: 10, 2: 100, 3: 100}[id]), att = (a, p, q) => (q === 2 ? -3 : 2);
  const tr = payTribute(a, weak, [], mightOf, att);
  check('дань: слабый платит долю казны сильному, которого ненавидит; другу — ничего', tr && tr[0] === strong && near(strong.gold, 100 * R.tribute.share) && friend.gold === 0 && near(weak.gold, 100 * (1 - R.tribute.share)),
    tr ? `уплачено ${tr[1]}` : 'не платит');
  const even = {id: 4, gold: 100};
  check('дань: равному по силе не платят', !payTribute({realms: [even, strong]}, even, [], () => 100, att));
}

// a seat stormed loses a share of its realm's treasury to the stormers' realm
{
  const from = {id: 1, gold: 0}, beaten = {id: 2, gold: 200}, v = lootSeat({}, from, beaten);
  check('штурм столицы уносит долю казны побеждённой державы', near(v, 200 * R.seat) && near(from.gold, v) && near(beaten.gold, 200 - v) && near(fiscOf(from).loot, v));
}

// the edict of dues reads what the treasury holds: empty — heavy, full — light
{
  const T = EDICTS.get('taxes'), pick = reserve => T.levels.find(l => holds(l.when, {stats: {loyalty: 1, reserve}, ruin: {}, war: false})).id;
  check('совет податей: казна пуста — тяжёлые, полна — лёгкие, иначе обычные', pick(0.1) === 'need' && pick(10) === 'rich' && pick(2) === 'usual' && T.levels.every(l => !whenErrors(l.when || {}).length));
  const realm = {gold: 300, fisc: {last: {court: 50, wages: 25, spent: 25, tribute: 0}}};
  check('запас казны — годы её трат', near(reserveOf(realm), 3) && reserveOf({gold: 5}) === 99);
}

if (fail.length) { console.log(`\nНе прошло: ${fail.length}`); process.exit(1); }
console.log('\nКазна державы: сходится');
