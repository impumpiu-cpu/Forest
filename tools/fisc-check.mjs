// The realm's treasury, its duties and its dealings (atlas/treasury.js, atlas/kingdom.js; docs/WORLD.md «Деньги городов»,
// «Казна державы»): corruption takes its share of the tax; the tax in kind fills the realm's store; the court is paid a year,
// the armies in the field each season (pay, stores, kit) — the unpaid desert, the court unpaid decays; customs on what a town buys of another realm; tribute of the weak to the mighty it hates; a seat stormed
// loses its treasury; the edict of dues by what the treasury holds. `node tools/fisc-check.mjs`
import {TOWN_MONEY as M, goodPrice} from '../src/data/townBuildings.js';
import {EDICTS, whenErrors} from '../src/data/kingdom.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {taxYear, corruptShare, realmDuties, realmKeep, payTribute, lootSeat, fiscOf, reserveOf} from '../src/atlas/treasury.js';
import {ARMY} from '../src/data/parties.js';
import {SEASONS_PER_YEAR as S, SEASON_DAYS} from '../src/data/atlas.js';
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

// the court, once a year: what is not paid — decay
{
  const realm = {id: 1, gold: 1000, kingdom: {court: {ruler: {name: 'А'}, marshal: {name: 'Б'}, a: null}}};
  const unpaid = realmDuties({}, realm, [{pop: 2000}]), court = 2 * R.court * 2;
  check('казна платит двору; хватает — упадка нет', unpaid === 0 && near(realm.gold, 1000 - court), `двору ${court}`);
  const poor = {id: 2, gold: 0, kingdom: {court: {ruler: {name: 'А'}}}};
  check('пустая казна: двор недоплачен — упадок растёт', realmDuties({}, poor, [{pop: 1000}]) === 1);
}

// each season the realm keeps its armies in the field: pay in gold, food in stores, kit made up out of its store
{
  const realm = {id: 1, gold: 1000, stock: {stores: 50, arms: 20, armor: 5}};
  const army = {kind: 'army', owner: 1, state: 'go', men: 100, supplies: 40, kit: {arms: 8, armor: 5}};
  const k = realmKeep({parties: [army]}, realm, [{pop: 2000, gold: 0}], false), wage = 100 * R.wage / S, eat = 100 / S;
  check('сезон войска: жалованье золотом, заготовки на сезон, снаряжение до нормы из склада державы',
    near(k.wages, wage) && near(k.food, eat) && near(realm.stock.stores, 50 - eat) && near(army.supplies, 40 + SEASON_DAYS) && near(army.kit.arms, ARMY.kit.arms * 100) && army.men === 100,
    `жалованье ${k.wages}, заготовок ${k.food}, припасов ${army.supplies}, оружия ${army.kit.arms}`);
  const poor = {id: 2, gold: 0}, b = {kind: 'army', owner: 2, state: 'go', men: 100, supplies: 40, kit: {}};
  const k2 = realmKeep({parties: [b]}, poor, [{pop: 1000, gold: 0}], false);
  check('пустая казна: войско не кормлено и не плачено — едят свои припасы, бегут за сезон', b.supplies === 40 && near(k2.short, b.men / S, 1e-3) && near(b.men, 100 * (1 - R.desert / S)),
    `осталось ${b.men.toFixed(1)}, не хватило заготовок ${k2.short}`);
}

// the tax in kind: the realm takes the goods its store lacks out of what the towns can spare, the rest in gold
{
  const realm = {id: 1, gold: 0}, town = {pop: 1000, gold: 2020, stock: {stores: 200, arms: 100}}, rate = M.tax.rate.usual;
  const got = taxYear(realm, [town], 'usual'), stores = Math.min(rate * 200, R.kind.stores * 10), arms = Math.min(rate * 100, R.kind.arms * 10);
  const worth = stores * goodPrice('stores') + arms * goodPrice('arms');
  check('подати натурой: держава берёт долю заготовок и оружия, чего не хватает её складу, и долю золота',
    near(realm.stock.stores, stores) && near(realm.stock.arms, arms) && near(got, 2000 * rate) && near(fiscOf(realm).tax, worth + got),
    `заготовок ${realm.stock.stores}, оружия ${realm.stock.arms}, золотом ${got.toFixed(2)}`);
  const full = {id: 2, gold: 0, stock: {stores: 1000, arms: 1000, armor: 1000, herbs: 1000}}, t2 = {pop: 1000, gold: 220, stock: {stores: 200}};
  check('полный склад державы: натурой не берёт', near(taxYear(full, [t2], 'usual'), (220 - M.tax.keep * 1000) * M.tax.rate.usual) && t2.stock.stores === 200);
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
