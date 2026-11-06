// The towns' needs and their councils' answers (atlas/townNeeds.js, docs/WORLD.md «Нужды совета»), on the situations the
// design names: the metal is there but there is no money; there is money but the way is weak; the house is being built
// already; there is no land; two councils want the same gold. Each sitting is read off the need's record (`last`): what it
// picked, and why each other answer was not given.
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {stepNeeds} from '../src/atlas/townNeeds.js';
import {NEEDS, NEED} from '../src/data/townNeeds.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {townFx, room, canBuild} from '../src/atlas/towns.js';
import {SEASONS_PER_YEAR as S} from '../src/data/atlas.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const base = generateAtlas({seed: 'needs', size: 'small', land: 1, plates: 1, hemisphere: 'north'});
const saved = saveAtlas(base, 'needs');
// a copy as a loaded world, the season's reckoning (not saved) laid on as an empty one: the checks give it what they test
const copy = () => { const a = loadAtlas(structuredClone(saved)); for (const t of a.towns) if (t.alive) t.econ ||= {dem: {}, made: {}, used: {}, short: {}, why: {works: {by: {}}}}; return a; };
const opt = (st, id) => st?.last?.opts.find(o => o.answer === id);
const towns = a => a.towns.filter(t => t.alive && t.econ && t.realm != null);
// a town's works lacking iron (by value, after the buying), with the cause laid as given
function lackIron(t, cause) {
  t.econ.dem = {...t.econ.dem, iron: 40 * S};
  t.econ.why = {...(t.econ.why || {}), works: {gold: 0, by: {iron: {want: 40, left: 40, money: cause === 'money' ? 40 : 0, route: cause === 'route' ? 40 : 0, goods: cause === 'goods' ? 40 : 0}}}};
}
const quiet = a => { for (const t of a.towns) { t.need = null; t.goal = null; t.budget = null; if (t.econ) t.econ.why = {works: {by: {}}}; } };

// ── room: lit at its threshold, out below the lower one
{
  const a = copy(); quiet(a);
  const t = towns(a).find(x => TOWN_BUILDINGS.all().some(b => b.house > 0 && canBuild(a, x, b)));
  const R = room(townFx(t)), D = NEEDS.get('room');
  t.pop = R * (0.6 + 0.4 * D.on) + 1; stepNeeds(a);
  const lit = t.need?.room?.on;
  t.pop = R * (0.6 + 0.4 * (D.on + D.off) / 2); stepNeeds(a);
  const holds = t.need?.room?.on;
  t.pop = R * (0.6 + 0.4 * D.off) - 1; stepNeeds(a);
  check('теснота зажигается на пороге «зажечь», держится между порогами, гаснет ниже «погасить»', lit && holds && !t.need?.room?.on, `${lit} → ${holds} → ${!!t.need?.room?.on}`);
}
// ── room: the house is answered with a goal; the town that builds a house already is not given another
{
  const a = copy(); quiet(a);
  const t = towns(a).find(x => TOWN_BUILDINGS.all().some(b => b.house > 0 && canBuild(a, x, b)));
  t.pop = room(townFx(t)) * 0.98; stepNeeds(a);
  const st = t.need.room, plan = st.plans['room.build'];
  check('тесно, жильё поставить можно: цель стройки — дом, план с итогом «жильё встало»', !!plan && t.goal?.b === plan.target.b && TOWN_BUILDINGS.get(t.goal.b).house > 0, JSON.stringify(st.last));
  const b = TOWN_BUILDINGS.all().find(x => x.house > 0);
  const t2 = towns(a).find(x => x !== t && x.people === t.people) || t;
  t2.need = null; t2.goal = null; t2.project = b.id; t2.pop = room(townFx(t2)) * 0.98; stepNeeds(a);
  check('жильё уже строится: ответ «строить жильё» не даётся, причина названа', /уже строится/.test(opt(t2.need?.room, 'room.build')?.why || ''), opt(t2.need?.room, 'room.build')?.why);
}
// ── room: settlers not given, with the reason (sent lately)
{
  const a = copy(); quiet(a);
  const t = towns(a).sort((p, q) => q.pop - p.pop)[0];
  t.pop = room(townFx(t)) * 0.98; t.settled = a.hist.year; stepNeeds(a);
  check('поселенцев посылали недавно: ответ не даётся, причина в записи', /недавно|мало жителей|земли/.test(opt(t.need?.room, 'room.settle')?.why || ''), opt(t.need?.room, 'room.settle')?.why);
}
// ── metal: the seller had it, the makers had no money → the realm's budget, taken from its treasury at once
{
  const a = copy(); quiet(a);
  const t = towns(a)[0], R = a.realms.find(r => r.id === t.realm);
  R.gold = 1000; lackIron(t, 'money');
  const g0 = R.gold; stepNeeds(a);
  const st = t.need?.metal, p = st?.plans?.['metal.budget'];
  check('металл у соседа есть, денег нет: держава даёт казну на привоз, причина подсказана', !!p && st.cause === 'money' && t.budget?.iron?.gold > 0, JSON.stringify(st?.last));
  check('казна на привоз отнята от казны державы сразу и не больше её доли за сезон', !!p && Math.abs(g0 - R.gold - p.target.gold) < 0.02 && p.target.gold <= g0 * NEED.budget.share + 0.01, `${g0} → ${R.gold}, дано ${p?.target.gold}`);
  // its review: nothing came (no seller ran in this check) → it failed, the gold went back, the answer is not offered again a while
  for (let k = 0; k < 4; k++) { lackIron(t, 'money'); a.hist.step++; stepNeeds(a); }
  const log = st.log?.at(-1);
  check('к сроку ничего не привезли: план не помог, остаток вернулся в казну, ответ закрыт на время', log?.answer === 'metal.budget' && log.outcome === 'fail' && Math.abs(R.gold - g0) < 0.05 && st.blocked['metal.budget'] > a.hist.step && !t.budget,
    `${JSON.stringify(log)}, казна ${R.gold}`);
}
// ── metal: money is not what stops it (a weak way) → no budget, with the reason; the cause hints, it does not exclude
{
  const a = copy(); quiet(a);
  const t = towns(a)[0]; a.realms.find(r => r.id === t.realm).gold = 1000; lackIron(t, 'route');
  stepNeeds(a);
  const st = t.need?.metal;
  check('путь слаб, деньги не мешают: казны на привоз не дают — «деньги не мешают»', /деньги не мешают/.test(opt(st, 'metal.budget')?.why || '') && !t.budget, opt(st, 'metal.budget')?.why);
}
// ── two councils, one treasury: the budgets of a season take no more than its share
{
  const a = copy(); quiet(a);
  const R = a.realms.find(r => towns(a).filter(t => t.realm === r.id).length >= 2), T = towns(a).filter(t => t.realm === R.id).slice(0, 3);
  R.gold = 100; for (const t of T) lackIron(t, 'money');
  stepNeeds(a);
  const given = T.reduce((s, t) => s + (t.budget?.iron?.gold || 0), 0);
  check('несколько советов одной державы: казна на привоз за сезон — не больше доли казны, золото не тратится дважды', given <= 100 * NEED.budget.share + 0.05 && Math.abs(R.gold - (100 - given)) < 0.05, `дано ${given}, в казне ${R.gold}`);
}
// ── metal: nothing to buy, the realm may raise a maker — a goal in a town of the realm whose cell gives the metal
{
  const a = copy(); quiet(a);
  const t = towns(a).find(x => ['humans', 'dwarves', 'orcs'].includes(x.people));
  if (t) {
    lackIron(t, 'goods'); stepNeeds(a);
    const st = t.need?.metal, p = st?.plans?.['metal.build'], o = opt(st, 'metal.build');
    check('железа ни у кого нет: цель — рудник в городе державы, или названо, почему его не поставить', (!!p && !!a.towns.find(x => x.id === p.target.town)?.goal) || /не может поставить/.test(o?.why || ''), JSON.stringify(st?.last));
  }
}

if (fail.length) { console.log(`\nНе прошло: ${fail.length}`); process.exit(1); }
console.log('\nНужды совета: сходится');
