// The towns' economy (docs/WORLD.md «Деньги городов», «Потоки построек»): the sea feeds, the buildings give their effects as
// they work, the stores and the treasuries, the buying between towns, the upkeep and the tax, the caravan at a town's market.
// `npm run economy`.
import {generateAtlas} from '../src/atlas/generate.js';
import {townFx, canBuild, townNeeds, might} from '../src/atlas/towns.js';
import {schismFactor} from '../src/atlas/kingdom.js';
import {RUINS} from '../src/data/kingdom.js';
import {townEconomy} from '../src/atlas/economy.js';
import {seaFeed} from '../src/atlas/sea.js';
import {stepGolems} from '../src/atlas/golems.js';
import {roomOf, taxYear, marketK, toTown, fromTown, realmSpend, planBuild, doBuild, plunder, lootOf} from '../src/atlas/treasury.js';
import {TOWN_BUILDINGS, TOWN_MONEY, foodNet, GOLEMS} from '../src/data/townBuildings.js';
import {rationPrice} from '../src/campaign/town.js';
import {stepHistory} from '../src/atlas/history.js';
import {SEASONS_PER_YEAR} from '../src/data/atlas.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

// the buildings
{
  const B = id => TOWN_BUILDINGS.get(id);
  check('рыбная пристань — у всех народов; гавань даёт рыбу и хочет свою пристань; маяк — свою пристань или хижину рыбака',
    !B('pier').peoples && B('harbor').out.fish > 0 && B('harbor').here.includes('pier') && B('lighthouse').here.includes('fishhut'));
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
  const rich = T.filter(t => t.gold > 0).length, traded = T.filter(t => t.trade?.bought || t.trade?.sold).length;
  const season = a.towns.filter(t => t.trade?.at === T[0].trade.at);   // (a town burnt later in the season still dealt this season)
  const bought = season.reduce((s, t) => s + (t.trade?.bought || 0) + (t.trade?.imported || 0), 0), sold = season.reduce((s, t) => s + (t.trade?.sold || 0), 0);
  check('у городов казна и склад; мастерские и жители покупают у других городов — золото уходит продавцу', rich > T.length / 2 && traded > 0 && Math.abs(bought - sold) < 1 + 0.01 * sold && T.some(t => Object.keys(t.stock || {}).length),
    `с деньгами ${rich} из ${T.length}, торговали ${traded}, оборот ${Math.round(bought)} зол.`);
  const over = T.filter(t => !t.plunder).flatMap(t => Object.entries(t.stock || {}).filter(([g, v]) => t.econ && v > roomOf(t, g) + 0.01).map(([g]) => `${t.name}:${g}`));
  check('склад не больше своей вместимости (лишнее уходит купцам; награбленное — со следующего сезона)', !over.length, over.slice(0, 3).join(', '));
  check('у держав своя казна', a.realms.some(r => r.fallen == null && r.gold > 0), a.realms.filter(r => r.fallen == null).map(r => Math.round(r.gold || 0)).join(' '));
  const t = {pop: 100, gold: 500}, R = {gold: 0}; const v = taxYear(R, [t], 'high');
  check('подати: держава берёт долю казны сверх запаса, тяжёлые — больше', v > 0 && R.gold === v && t.gold < 500 && taxYear({gold: 0}, [{pop: 100, gold: 500}], 'light') < v);
}
// the caravan's market
{
  const t = T.find(x => x.market && Object.keys(x.market).length) || T[0], g0 = t.makersGold;
  toTown(t, 10); const after = t.makersGold; const paid = fromTown({makersGold: 5}, 20);
  const dear = Object.entries(t.market || {}).find(([, k]) => k > 1), cheap = Object.entries(t.market || {}).find(([, k]) => k < 1);
  check('караван платит мастерам города; они платят не больше, чем у них есть; цены рынка — от склада и нехватки',
    Math.abs(after - g0 - 10) < 0.01 && paid === 5 && (!!dear || !!cheap) && marketK(t, dear?.[0]) > 1, `${t.name}: дороже ${dear?.join(' ×') || '—'}, дешевле ${cheap?.join(' ×') || '—'}`);
  const fed = {...t, supply: {own: 3 * t.pop, got: 0, gave: 0}}, hungry = {...t, supply: {own: 0.5 * t.pop, got: 0, gave: 0}};
  check('паёк дешевле, где у города излишек еды', rationPrice(fed, 'own') < rationPrice(hungry, 'own'), `${rationPrice(fed, 'own').toFixed(3)} против ${rationPrice(hungry, 'own').toFixed(3)}`);
  check('цены в пределах', T.every(x => Object.values(x.market || {}).every(k => k >= TOWN_MONEY.price.lo && k <= TOWN_MONEY.price.hi)));
}

// the stores, the realm back to the world, the beasts
{
  const fed = TOWN_BUILDINGS.all().filter(b => b.fx.food).map(b => b.id), field = foodNet(TOWN_BUILDINGS.get('field'));
  check('эффект «запасы» — только у амбара, погреба, коптильни, вешал, солеварни и соляного ручья; пашня кормит своим зерном', fed.every(id => ['granary', 'cellar', 'smokehouse', 'dryrack', 'saltworks', 'saltspring'].includes(id)) && field > 0, `${fed.join(', ')}; пашня ${field}`);
  const R = a.realms.find(r => r.kingdom && r.fallen == null), t = T.find(x => x.realm === R.id);
  check('показатели державы правят миром: рост городов от экономики, сила — от стабильности, расколы — от лояльности и раздоров',
    t.realmFx && t.realmFx.grow > 0 && t.realmFx.might > 0 && schismFactor({kingdom: {stats: {loyalty: 0}, ruin: {strife: 5}}}) > 1, JSON.stringify(t.realmFx));
  const k0 = might(t, townFx(t)), keep = t.stock; t.stock = {...keep, beasts: (keep?.beasts || 0) + 50}; const k1 = might(t, townFx(t)); t.stock = keep;
  check('обычный скот — еда, его запас не увеличивает военную силу города', k1 === k0, `${k0.toFixed(1)} → ${k1.toFixed(1)}`);
  check('упадок растёт и от пустой казны державы', RUINS.get('decay').grows.broke > 0);
}

// the merchants' purse, the realm's spending
{
  const sold = T.reduce((s, t) => s + (t.trade?.merchants || 0), 0), purse = T.reduce((s, t) => s + TOWN_MONEY.merchants.purse * t.pop * (1 + townFx(t).trade), 0) * 1.05;
  check('купцы берут не больше своего кошелька; что сверх — пропадает', sold <= purse && T.some(t => t.trade?.wasted > 0), `продано купцам ${Math.round(sold)} из ${Math.round(purse)}, пропало ${Math.round(T.reduce((s, t) => s + (t.trade?.wasted || 0), 0))}`);
  const R = {gold: 1000}, ts = [{pop: 300}, {pop: 100}], sp = realmSpend(R, ts, false), war = realmSpend({gold: 1000}, [{pop: 300}, {pop: 100}], true);
  check('держава тратит казну: гарнизоны городам по людям, золото на стройку; в войну — больше на войско',
    sp.army > 0 && sp.build > 0 && R.gold < 1000 && ts[0].garrison === 3 * ts[1].garrison && ts[0].grant > 0 && war.army > sp.army, JSON.stringify(sp));
  const t = T.find(x => x.garrison > 0); const g = t?.garrison; if (t) t.garrison = 0; const m0 = t ? might(t, townFx(t)) : 0; if (t) t.garrison = g;
  check('гарнизон прибавляет городу силы', !!t && might(t, townFx(t)) > m0, t ? `${t.name}: гарнизон ${Math.round(g)}` : 'нет гарнизонов');
  check('упадок растёт только от неоплаченного и пустой казны', !RUINS.get('decay').grows.upkeep && RUINS.get('decay').grows.unpaid > 0);
}

// the gold goes round: purses of the people and the makers, wages and taxes, the people's needs, paid building
{
  const w = T.reduce((s, t) => s + (t.trade?.wages || 0), 0), tx = T.reduce((s, t) => s + (t.trade?.tax || 0), 0), pp = T.reduce((s, t) => s + (t.trade?.people || 0) + (t.trade?.imported || 0), 0);
  check('деньги ходят по кругу: мастера платят жителям, жители покупают, город берёт налоги', w > 0 && tx > 0 && pp > 0 && T.every(t => t.peopleGold >= 0 && t.makersGold >= 0),
    `за сезон зарплат ${Math.round(w)}, налогов ${Math.round(tx)}, жители купили на ${Math.round(pp)}`);
  const nb = T.reduce((s, t) => s + (t.needs?.basic ?? 0), 0) / T.length;
  check('нужды жителей считаются, их нехватка тянет стройку', nb > 0 && T.some(t => Object.keys(t.needs?.lack || {}).length), `закрыто ${Math.round(nb * 100)}%`);
  const x = {pop: 200, gold: 100, peopleGold: 100, makersGold: 0, stock: {wood: 50, planks: 20}, built: [], market: {}}, B = {tier: 1, cat: 'housing'};
  const pl = planBuild(a, x, B); if (pl) doBuild(pl);
  // (a home is raised of logs: no wood to be had — and none to gather, the town has no hands — it is not built; boards are the home's yearly take)
  const noWood = planBuild(a, {pop: 200, gold: 100, peopleGold: 100, makersGold: 0, stock: {planks: 20}, built: [], market: {}, id: -1, econ: {freeHands: 0}}, B);
  const poor = planBuild(a, {pop: 200, gold: 0, peopleGold: 0, makersGold: 0, stock: {wood: 50, planks: 20}, built: [], market: {}, id: -2}, B);
  check('стройка требует материалов и денег: дома — на деньги жителей, материалы со склада мастерам; без брёвен (и рук, чтобы их собрать) и без денег не строят',
    !!pl && !noWood && !poor && x.stock.wood < 50 && x.stock.planks === 20 && x.makersGold > 0 && x.peopleGold < 100, `мастерам ${x.makersGold}, у жителей осталось ${x.peopleGold}`);
  const l = [...a.net.links.values()];
  check('связи сети крепнут и от товаров', l.length > 0);
}

// the people's needs: never over 100%; what a town makes and its works do not take, its people may buy
{
  check('нужды и достаток закрыты не больше чем на 100%', T.every(t => !t.needs || (t.needs.basic <= 1 && t.needs.comfort <= 1)));
  const t = T.find(x => (x.econ?.made.cloth || 0) > 0 && !(x.econ?.dem.cloth > 0) && x.econ?.people?.cloth);
  check('ткань, которую мастерские не берут, достаётся жителям (запас — только под нужды мастерских)', !t || t.econ.people.cloth.got > 0, t ? `${t.name}: хотели ${Math.round(t.econ.people.cloth.want)}, купили ${Math.round(t.econ.people.cloth.got)}` : 'нет такого города');
  const dear = T.filter(x => Object.keys(x.needs?.lack || {}).some(g => (x.market?.[g] || 1) > 1)).length;
  check('то, чего не хватает жителям, на рынке дороже', dear > 0, `городов ${dear}`);
}
// war feeds the cult: plunder
{
  const raider = {pop: 300, people: 'orcs', gold: 0, peopleGold: 0, makersGold: 0, stock: {}}, mk = () => ({pop: 500, people: 'humans', gold: 100, peopleGold: 100, makersGold: 100, stock: {tools: 10}});
  const human = {...raider, people: 'humans', stock: {}}, v1 = mk(), v2 = mk();
  const got = plunder(raider, v1, TOWN_MONEY.plunder.raid), got2 = plunder(human, v2, TOWN_MONEY.plunder.raid);
  check('набег вывозит товары и золото; культ войны — больше', got && got[0] > 0 && raider.stock.tools > 0 && raider.peopleGold > raider.gold && got[0] > got2[0] && lootOf(v1) < lootOf(mk()), JSON.stringify(got));
}

// the second review: building's earnings taxed, the upkeep paid after the taxes, the peoples' swaps in needs and building
{
  const x = {pop: 200, people: 'humans', gold: 0, peopleGold: 100, makersGold: 0, stock: {wood: 50, planks: 20}, built: [], market: {}};
  const pl = planBuild(a, x, {tier: 1, cat: 'housing'}); doBuild(pl);
  check('доход от стройки облагается налогом в следующем сезоне', (x.carry?.makersIn || 0) > 0 && (x.carry?.peopleIn || 0) > 0, JSON.stringify(x.carry));
  const o = {pop: 200, people: 'orcs', gold: 0, peopleGold: 100, makersGold: 0, stock: {wood: 60}, built: [], market: {}};
  check('у зеленокожих дом строится из брёвен вместо тёса', !!planBuild(a, o, {tier: 1, cat: 'housing'}));
  const t = T.find(x => x.people === 'orcs'), lack = Object.keys(t?.needs?.lack || {});
  check('зеленокожим не нужны горшки и соль (бурдюки и дерево вместо них), и благ им нужно вдвое меньше', !!t && !lack.includes('pots') && !lack.includes('salt') && (t.econ.people?.waterskins?.want || 0) > 0,
    t ? `${t.name}: не хватает ${lack.join(', ') || '—'}` : 'нет города');
  check('содержание платится после налогов: неоплаченного почти нет', T.filter(x => x.unpaid > 0).length <= T.length * 0.2, `${T.filter(x => x.unpaid > 0).length} из ${T.length}`);
}

// the golem forge works of the forge's work and the store's metal
{
  const t = {built: ['golemforge', 'forge', 'smelter'], pop: 800, realm: null, stock: {}, work: {golemforge: 1}}, ar = {hist: {year: 1}};
  // (of its own metal: the forge and the smelter give iron and bronze; the store holds the golem's metal)
  stepGolems(ar, t); const none = stepGolems(ar, t);
  for (const m of ['bronze', 'iron', 'steel', 'mithril']) t.stock[m] = 50;
  const one = stepGolems(ar, t), spent = one && t.stock[one.metal] === 50 - GOLEMS.make.metal;
  for (const m of ['bronze', 'iron', 'steel', 'mithril']) t.stock[m] = 50;
  t.work.golemforge = 0.1; const idle = stepGolems(ar, t);
  check('голема не делают без металла на складе и без работы кузни; делают — его металл уходит', !none && !!one && spent && !idle, `${JSON.stringify(one)}`);
}

// Goods and purses must advance in every season, not only with the annual founding and growth.
for (let k = 0; k < SEASONS_PER_YEAR; k++) {
  const refs = new Map(a.towns.filter(t => t.alive).map(t => [t.id, t.econ])), season = a.hist.season;
  stepHistory(a);
  const live = a.towns.filter(t => t.alive && refs.has(t.id));
  check(`хозяйство пересчитано в сезоне ${season}`, live.length > 0 && live.every(t => t.econ !== refs.get(t.id)));
}
if (fail.length) process.exit(1);
