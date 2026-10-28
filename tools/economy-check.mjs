// The towns' economy (docs/WORLD.md «Деньги городов», «Потоки построек»): the sea feeds, the buildings give their effects as
// they work, the stores and the treasuries, the buying between towns, the upkeep and the tax, the caravan at a town's market.
// `npm run economy`.
import {generateAtlas} from '../src/atlas/generate.js';
import {townFx, canBuild, townNeeds, might} from '../src/atlas/towns.js';
import {schismFactor} from '../src/atlas/kingdom.js';
import {RUINS} from '../src/data/kingdom.js';
import {townEconomy} from '../src/atlas/economy.js';
import {seaFeed} from '../src/atlas/sea.js';
import {roomOf, taxYear, marketK, toTown, fromTown} from '../src/atlas/treasury.js';
import {TOWN_BUILDINGS, TOWN_MONEY, foodNet} from '../src/data/townBuildings.js';
import {rationPrice} from '../src/campaign/town.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

// the buildings
{
  const B = id => TOWN_BUILDINGS.get(id);
  check('рыбная пристань — у всех народов; гавань даёт еду и хочет свою пристань; маяк — свою пристань или хижину рыбака',
    !B('pier').peoples && B('harbor').out.food > 0 && B('harbor').here.includes('pier') && B('lighthouse').here.includes('fishhut'));
}

const a = generateAtlas({seed: '5', size: 'small', land: 1, plates: 1, hemisphere: 'north'});
const T = a.towns.filter(t => t.alive);

// the sea
{
  const fishers = T.filter(x => ['pier', 'harbor', 'fishhut'].some(id => x.built.includes(id))); fishers.forEach(x => seaFeed(a, x));
  const t = fishers.find(x => x.place.sea > 0) || fishers[0] || T[0];
  const sea = seaFeed(a, t), keep = t.built; t.built = keep.filter(id => !['pier', 'harbor', 'fishhut'].includes(id)); const none = seaFeed(a, t); t.built = keep;
  check('море кормит город с рыбаками, без рыбаков — нет', none === 0 && (sea > 0 || t.place.sea === 0), `${t.name}: доля моря ${t.place.sea}, кормит ${sea.toFixed(2)}`);
  const h = T.find(x => x.people === 'humans' && x.tier >= 2) || T[0], was = h.built;
  h.built = [...was.filter(id => id !== 'pier' && id !== 'harbor'), 'shipyard', 'fishhut'];
  const e = townEconomy(a, h, undefined, {planks: 1e4, fiber: 1e4, cloth: 1e4}); const boats = e.boats;   // the yard with all it takes
  h.built = was;
  check('верфь даёт лодки: рыбаки ловят больше', boats > 1, `×${boats.toFixed(2)}`);
  const c = {...h, built: [...was.filter(id => id !== 'pier' && id !== 'harbor')], tier: 2, place: {coast: true}};
  check('гавани нужна своя пристань', !canBuild(a, c, TOWN_BUILDINGS.get('harbor')));
}
// the effects follow the work
{
  const t = T.find(x => x.built.includes('forge')), keep = t.work;
  t.work = {...keep, forge: 1}; const full = townFx(t).defence;
  t.work = {...keep, forge: 0}; const idle = townFx(t).defence;
  t.work = {...keep, forge: 1}; t.unpaid = 1; const unpaid = townFx(t).defence; t.unpaid = 0;
  t.work = keep;
  check('кузня без металла даёт половину обороны; неоплаченное содержание — хуже', idle < full && Math.abs(idle - (full - TOWN_BUILDINGS.get('forge').fx.defence / 2)) < 1e-9 && unpaid < full,
    `оборона ${full.toFixed(2)} → без работы ${idle.toFixed(2)}, без оплаты ${unpaid.toFixed(2)}`);
  check('большому городу нужна своя пашня', townNeeds(a, {...t, tier: 2}, townFx(t), {feeds: 1e9, threat: 0, road: 0}).food > 0);
}
// the money
{
  const rich = T.filter(t => t.gold > 0).length, traded = T.filter(t => t.trade).length;
  const bought = T.reduce((s, t) => s + (t.trade?.bought || 0), 0), sold = T.reduce((s, t) => s + (t.trade?.sold || 0), 0);
  check('у городов казна и склад; города покупают друг у друга — золото уходит продавцу', rich > T.length / 2 && traded > 0 && Math.abs(bought - sold) < 1 && T.some(t => Object.keys(t.stock || {}).length),
    `с деньгами ${rich} из ${T.length}, торговали ${traded}, оборот ${Math.round(bought)} зол.`);
  const over = T.flatMap(t => Object.entries(t.stock || {}).filter(([g, v]) => t.econ && v > roomOf(t, g) + 0.01).map(([g]) => `${t.name}:${g}`));
  check('склад не больше своей вместимости (лишнее уходит купцам)', !over.length, over.slice(0, 3).join(', '));
  check('у держав своя казна', a.realms.some(r => r.fallen == null && r.gold > 0), a.realms.filter(r => r.fallen == null).map(r => Math.round(r.gold || 0)).join(' '));
  const t = {pop: 100, gold: 500}, R = {gold: 0}; const v = taxYear(R, [t], 'high');
  check('подати: держава берёт долю казны сверх запаса, тяжёлые — больше', v > 0 && R.gold === v && t.gold < 500 && taxYear({gold: 0}, [{pop: 100, gold: 500}], 'light') < v);
}
// the caravan's market
{
  const t = T.find(x => x.market && Object.keys(x.market).length) || T[0], g0 = t.gold;
  toTown(t, 10); const after = t.gold; const paid = fromTown({gold: 5}, 20);
  const dear = Object.entries(t.market || {}).find(([, k]) => k > 1), cheap = Object.entries(t.market || {}).find(([, k]) => k < 1);
  check('караван платит в казну города; город платит не больше своей казны; цены рынка — от склада и нехватки',
    Math.abs(after - g0 - 10) < 0.01 && paid === 5 && (!!dear || !!cheap) && marketK(t, dear?.[0]) > 1, `${t.name}: дороже ${dear?.join(' ×') || '—'}, дешевле ${cheap?.join(' ×') || '—'}`);
  const fed = {...t, supply: {own: 3 * t.pop, got: 0, gave: 0}}, hungry = {...t, supply: {own: 0.5 * t.pop, got: 0, gave: 0}};
  check('паёк дешевле, где у города излишек еды', rationPrice(fed, 'own') < rationPrice(hungry, 'own'), `${rationPrice(fed, 'own').toFixed(3)} против ${rationPrice(hungry, 'own').toFixed(3)}`);
  check('цены в пределах', T.every(x => Object.values(x.market || {}).every(k => k >= TOWN_MONEY.price.lo && k <= TOWN_MONEY.price.hi)));
}

// the stores, the realm back to the world, the beasts
{
  const fed = TOWN_BUILDINGS.all().filter(b => b.fx.food).map(b => b.id), field = foodNet(TOWN_BUILDINGS.get('field'));
  check('эффект «запасы» — только у амбара, погреба, коптильни, вешал, солеварни; пашня кормит своим зерном', fed.every(id => ['granary', 'cellar', 'smokehouse', 'dryrack', 'saltworks'].includes(id)) && field > 0, `${fed.join(', ')}; пашня ${field}`);
  const R = a.realms.find(r => r.kingdom && r.fallen == null), t = T.find(x => x.realm === R.id);
  check('показатели державы правят миром: рост городов от экономики, сила — от стабильности, расколы — от лояльности и раздоров',
    t.realmFx && t.realmFx.grow > 0 && t.realmFx.might > 0 && schismFactor({kingdom: {stats: {loyalty: 0}, ruin: {strife: 5}}}) > 1, JSON.stringify(t.realmFx));
  const k0 = might(t, townFx(t)), keep = t.stock; t.stock = {...keep, beasts: (keep?.beasts || 0) + 50}; const k1 = might(t, townFx(t)); t.stock = keep;
  check('скот на складе — конница и боевые звери: сила города растёт', k1 > k0, `${k0.toFixed(1)} → ${k1.toFixed(1)}`);
  check('упадок растёт и от пустой казны державы', RUINS.get('decay').grows.broke > 0);
}

if (fail.length) process.exit(1);
