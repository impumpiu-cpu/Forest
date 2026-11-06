// The mechanics taken from the donor games (docs/WORLD.md; the project's «Доноры механик»): small scenes, each a rule that must hold.
import assert from 'node:assert/strict';
import {payTribute, realmPool, seasonStore, pairLink, loadStep} from '../src/atlas/treasury.js';
import {TOWN_FLOW} from '../src/data/townBuildings.js';
import {moodStep} from '../src/atlas/mood.js';
import {TOWN_LIFE} from '../src/data/peoples.js';
import {DOES} from '../src/atlas/deeds/index.js';
import {TOWN_GOODS, TOWN_MONEY, goodPrice} from '../src/data/townBuildings.js';
import {DIPLOMACY} from '../src/data/diplomacy.js';
let failed = 0;
const check = (name, f) => { try { f(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); } };
const town = (o = {}) => ({id: 1, realm: '1', name: 'Т', people: 'humans', alive: true, i: 0, x: 0, y: 0, pop: 100, tier: 1, stock: {}, built: [], trade: {}, econ: {made: {}, used: {}}, ...o});

check('дань по договору мира идёт победителю: доля казны сверх защищённого остатка, и кончается в срок', () => {
  const loser = {id: '1', people: 'humans', gold: 1000}, winner = {id: '2', people: 'dwarves', gold: 0};
  const a = {realms: [loser, winner], rel: {'1:2': {owe: {from: '1', to: '2', until: 5}}}, hist: {year: 3}};
  const towns = [town({pop: 100})], paid = payTribute(a, loser, towns, () => 1, () => 0);
  const want = (1000 - TOWN_MONEY.realm.tribute.floor * 100 / 100) * DIPLOMACY.peace.share;
  assert.ok(paid && paid[0] === winner, 'платежа нет'); assert.ok(Math.abs(paid[1] - want) < 0.01, `заплачено ${paid[1]}, ждали ${want}`);
  assert.ok(Math.abs(winner.gold - want) < 0.01 && Math.abs(loser.gold - (1000 - want)) < 0.01, `казны ${loser.gold} / ${winner.gold}`);
  a.hist.year = 6; assert.equal(payTribute(a, loser, towns, () => 1, () => 0), null, 'после срока дань идёт дальше');
});

check('продавец своей державы — по самому дешёвому пути, а не по меньшему числу шагов', () => {
  const A = town({id: 1, x: 0}), B = town({id: 2, x: 1}), C = town({id: 3, x: 2});
  const ab = {p: A, q: B, c: 1, cost: 1}, bc = {p: B, q: C, c: 1, cost: 1}, ac = {p: A, q: C, c: 1, cost: 100};
  const a = {net: {links: new Map([['1:2', ab], ['2:3', bc], ['1:3', ac]])}, w: 10, h: 10};
  const W = realmPool({a, towns: [A, B, C], links: [ab, bc, ac]}).get(1), toC = W.find(([o]) => o === C)[1];
  assert.equal(toC.cost, 2, `путь до C стоит ${toC.cost}`);
});

check('встречная торговля по новой связи: одна связь, одна вместимость и память на оба направления', () => {
  const A = town({id: 1}), C = town({id: 3}), a = {net: {links: new Map()}};
  const l1 = pairLink(a, A, C, 5); l1.carried = 10; l1.took = {'3>wood': 2};
  const l2 = pairLink(a, C, A, 5);
  assert.ok(l1 === l2, 'встречная покупка сделала вторую связь'); assert.equal(l2.carried, 10); assert.deepEqual(l2.took, {'3>wood': 2});
});

check('порча не берётся с проданного: сколько было — столько продано, сгнило и осталось', () => {
  const keep = TOWN_GOODS.get('hide').keep;
  for (const sold of [12, 6, 0]) {
    const t = town({stock: {hide: 12}});
    seasonStore([t], new Map([[t.id, {hide: sold}]]));
    const rot = (t.trade.rotted || 0) / goodPrice('hide'), left = t.stock.hide || 0;
    assert.ok(Math.abs(12 - sold - rot - left) < 1e-6, `продано ${sold}: сгнило ${rot}, осталось ${left}`);
    assert.ok(Math.abs(rot - (12 - sold) / keep) < 1e-6, `продано ${sold}: сгнило ${rot}`);
  }
});

check('малая, но сильная держава мира не просит; слабая — просит', () => {
  const mk = (big) => {
    const R1 = {id: '1', people: 'humans', gold: 0}, R2 = {id: '2', people: 'orcs', gold: 0};
    const towns = big ? [town({id: 1, realm: '1', pop: 10000}), ...[2, 3, 4].map(id => town({id, realm: '2', pop: 100}))]
      : [town({id: 1, realm: '1', pop: 100}), ...[2, 3, 4].map(id => town({id, realm: '2', pop: 10000}))];
    return {realms: [R1, R2], towns, rel: {'1:2': {war: {since: 0}, att: -5, border: true}}, hist: {year: 5}};
  };
  const lose = a => (DOES.makePeace.want(a, a.realms[0]) || []).some(([plan]) => plan.lose);
  assert.equal(lose(mk(true)), false, 'один сильный город просит мира как проигравший');
  assert.equal(lose(mk(false)), true, 'слабый один город мира не просит');
});

check('загрузка по сбыту: лишнее, которого ждёт покупатель, способный заплатить, но не довезённое, выпуск не режет', () => {
  const mk = () => town({built: ['mineshaft'], load: {mineshaft: 0.5}, econ: {rows: [{id: 'mineshaft', gave: {iron: 8}}], recipes: [], made: {iron: 8}, used: {}, over: {iron: 8}}});
  const t1 = mk(); loadStep(t1, new Set(['iron']));
  const t2 = mk(); loadStep(t2, null);
  const L = TOWN_FLOW.load;
  assert.ok(Math.abs((t1.load?.mineshaft ?? 1) - (0.5 + L.step)) < 1e-9, `ждут — загрузка ${t1.load?.mineshaft ?? 1}`);
  assert.ok(Math.abs((t2.load?.mineshaft ?? 1) - (0.5 - L.step)) < 1e-9, `никто не ждёт — загрузка ${t2.load?.mineshaft ?? 1}`);
});

check('довольство в кризисе: город большой державы падает ниже порога спуска ступени, у державы последних городов держится на полу', () => {
  const run = n => {
    const towns = Array.from({length: n}, (_, k) => town({id: k + 1, tier: 2, mood: 80, needs: {basic: 0, comfort: 0}, fed: 0}));
    const a = {towns, realms: [{id: '1', people: 'humans', kingdom: {edicts: {taxes: 'high'}}}]};
    for (let q = 0; q < 40; q++) moodStep(towns[0], a);
    return towns[0].mood;
  };
  const G = TOWN_LIFE.grace, M = TOWN_LIFE.mood;
  const big = run(G.lastStand + 1), small = run(G.lastStand);
  assert.ok(big < M.tierDown, `город большой державы: довольство ${big}, порог спуска ${M.tierDown}`);
  assert.ok(Math.abs(small - G.moodFloor) < 1e-6, `последний рубеж: довольство ${small}, пол ${G.moodFloor}`);
});

if (failed) { console.log(`\nНе прошло: ${failed}`); process.exit(1); }
console.log('Механики доноров: сходится');
