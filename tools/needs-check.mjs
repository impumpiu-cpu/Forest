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
// (a town the crowding scenes take: one that can raise a house and has no building going on — the history may have left one)
const copy = () => { const a = loadAtlas(structuredClone(saved)); for (const t of a.towns) if (t.alive) t.econ ||= {dem: {}, made: {}, used: {}, short: {}, why: {works: {by: {}}}}; return a; };
const opt = (st, id) => st?.last?.opts.find(o => o.answer === id);
const towns = a => a.towns.filter(t => t.alive && t.econ && t.realm != null);
// a town's works lacking iron (by value, after the buying), with the cause laid as given
function lackIron(t, cause) {
  t.econ.dem = {...t.econ.dem, iron: 40 * S};
  t.econ.why = {...(t.econ.why || {}), works: {gold: 0, by: {iron: {want: 40, left: 40, money: cause === 'money' ? 40 : 0, route: cause === 'route' ? 40 : 0, goods: cause === 'goods' ? 40 : 0}}}};
}
// (every need out: no lack, no goals, no budgets, food in plenty — a scene lights only what it sets)
const quiet = a => { for (const t of a.towns) { t.need = null; t.goal = null; t.budget = null; t.wants = {...(t.wants || {}), feeds: 1e12}; if (t.econ) t.econ.why = {works: {by: {}}}; } };

// ── room: lit at its threshold, out below the lower one
{
  const a = copy(); quiet(a);
  const t = towns(a).find(x => !x.project && TOWN_BUILDINGS.all().some(b => b.house > 0 && canBuild(a, x, b)));
  const R = room(townFx(t)), D = NEEDS.get('room');
  const eps = Math.max(1, R * 0.002);   // (past the rounding of the strength to 0.001, whatever the town's room)
  t.pop = R * (D.from + D.span * D.on) + eps; stepNeeds(a);
  const lit = t.need?.room?.on;
  t.pop = R * (D.from + D.span * (D.on + D.off) / 2); stepNeeds(a);
  const holds = t.need?.room?.on;
  t.pop = R * (D.from + D.span * D.off) - eps; stepNeeds(a);
  check('теснота зажигается на пороге «зажечь», держится между порогами, гаснет ниже «погасить»', lit && holds && !t.need?.room?.on, `${lit} → ${holds} → ${!!t.need?.room?.on}`);
}
// ── room: the house is answered with a goal; the town that builds a house already is not given another
{
  const a = copy(); quiet(a);
  const t = towns(a).find(x => !x.project && TOWN_BUILDINGS.all().some(b => b.house > 0 && canBuild(a, x, b)));
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

// ── food: its people near what feeds them → lit; the council raises what feeds (a goal) or sends settlers; out once it is fed
{
  const a = copy(); quiet(a);
  const t = towns(a).find(x => x.wants?.feeds > 0) || towns(a)[0], D = NEEDS.get('food');
  t.wants = {...(t.wants || {}), feeds: t.pop / (D.from + D.span * 0.8)}; stepNeeds(a);
  const st = t.need?.food, pick = st?.last?.pick;
  check('голод зажигается, когда жители подходят к тому, что их кормит, и совет отвечает: кормит или шлёт поселенцев', !!st?.on && (pick === 'food.build' ? t.goal?.need === 'food' : pick === 'food.settle' || st.last.opts.every(o => o.why)),
    `сила ${st?.s}, выбор ${pick || '—'}${pick ? '' : ': ' + st?.last?.opts.map(o => o.why).join('; ')}`);
  t.wants.feeds = t.pop * 2; stepNeeds(a);
  check('сытый город гасит голод', !t.need?.food?.on, `сила ${t.need?.food?.s ?? 0}`);
}

// ── the plans' bookkeeping (the expert's scenes): one builder a town; a town fallen gives its budget back; a paid work that does
// not move fails; brought a little while the lack stands is a plan carried out that did not help
{
  const a = copy(); quiet(a);
  const t = towns(a).find(x => !x.project && TOWN_BUILDINGS.all().some(b => b.house > 0 && canBuild(a, x, b)));
  t.pop = room(townFx(t)) * 0.98; lackIron(t, 'goods'); stepNeeds(a);
  const builds = Object.values(t.need || {}).flatMap(st => Object.keys(st.plans || {})).filter(id => /\.build$/.test(id)).filter(id => (t.need[id.split('.')[0]].plans[id].target.town === t.id));
  check('тесно и нужен металл: у города одна цель стройки, вторая стройка в нём же не утверждена', builds.length <= 1 && (!builds.length || t.goal?.need === builds[0].split('.')[0]), `${builds.join(', ')}, цель ${JSON.stringify(t.goal)}`);
}
{
  const a = copy(); quiet(a);
  const t = towns(a)[0], R = a.realms.find(r => r.id === t.realm);
  R.gold = 1000; lackIron(t, 'money'); stepNeeds(a);
  const given = t.budget?.iron?.gold || 0, g1 = R.gold;
  t.alive = false; a.hist.step++; stepNeeds(a);
  check('город с казной на привоз пал: план закрыт, остаток казны вернулся державе', given > 0 && !t.budget && Math.abs(R.gold - (g1 + given)) < 0.05, `дано ${given}, казна ${g1} → ${R.gold}`);
}
{
  const a = copy(); quiet(a);
  const t = towns(a).find(x => !x.project && TOWN_BUILDINGS.all().some(b => b.house > 0 && canBuild(a, x, b)));
  t.pop = room(townFx(t)) * 0.98; stepNeeds(a);
  const p = t.need?.room?.plans?.['room.build'];
  if (p) {
    (t.works ||= {})[p.target.b] = {done: 0, paid: true}; t.project = null;   // paid, and no work goes on it
    let k = 0; for (; k < 100 && t.need.room.plans['room.build']; k++) { a.hist.step++; stepNeeds(a); }
    const log = t.need.room.log?.at(-1);
    check('оплаченная стройка не движется: план проваливается к сроку пересмотра, а не держится вечно', !t.need.room.plans['room.build'] && log?.outcome === 'fail', `через ${k} сезонов: ${JSON.stringify(log)}`);
  } else check('оплаченная стройка не движется: план проваливается к сроку пересмотра', false, 'план жилья не взят');
}
{
  const a = copy(); quiet(a);
  const t = towns(a)[0], R = a.realms.find(r => r.id === t.realm);
  R.gold = 1000; lackIron(t, 'money'); stepNeeds(a);
  const st = t.need.metal;
  for (let k = 0; k < 4; k++) { if (t.budget?.iron) t.budget.iron.got = 0.01; lackIron(t, 'money'); a.hist.step++; stepNeeds(a); }
  const log = st.log?.at(-1);
  check('привезли 0,01 металла при той же нехватке: поручение исполнено, но нужда не спала — план не помог', log?.outcome === 'fail' && log.executed === true && log.eased === false, JSON.stringify(log));
}

if (fail.length) { console.log(`\nНе прошло: ${fail.length}`); process.exit(1); }
console.log('\nНужды совета: сходится');
