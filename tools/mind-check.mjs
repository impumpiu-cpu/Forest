// The realms' councils (atlas/mind.js, data/mind.js; docs/WORLD.md «Совет державы»): a building's vector, the wind of three
// shares, a role for every town but the seat, the grants by the wind spending exactly the budget, the town's choice and
// the court leaning along the wind; the tables reach the game. `node tools/mind-check.mjs`
import {generateAtlas} from '../src/atlas/generate.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {VECTOR_IDS, MIND, vectorOf, deedVector, along} from '../src/data/mind.js';
import {stepMinds, councilShares, leanOf, mindOf} from '../src/atlas/mind.js';
import {realmSpend} from '../src/atlas/treasury.js';
import {setCell, resetAll} from '../src/data/schema/edits.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const near = (x, y, tol = 1e-6) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y));
const sum = v => VECTOR_IDS.reduce((s, k) => s + (v?.[k] || 0), 0);
const live = a => a.towns.filter(t => t.alive);
const say = () => {};

// ── a building's vector: its own `vec`, else from its effects and what it gives; every one sums to 1
{
  const bad = TOWN_BUILDINGS.all().filter(b => !near(sum(vectorOf(b)), 1, 1e-9));
  check('вектор каждой постройки — три доли, в сумме 1', !bad.length, bad.map(b => b.id).join(', '));
  const B = TOWN_BUILDINGS.get('barracks');
  check('казармы тянут к агрессии (свой вектор)', near(vectorOf(B).agg, 0.9), JSON.stringify(vectorOf(B)));
  const field = TOWN_BUILDINGS.all().find(b => b.out?.grain || b.out?.food);
  check('постройка, что даёт еду, тянет к росту', field && vectorOf(field).grow > vectorOf(field).econ, field?.id);
  check('дела двора: война — агрессия, мир — экономика', deedVector('warOn').agg === 1 && deedVector('makePeace').econ === 1 && deedVector('expand') === null);
}

const base = generateAtlas({seed: 'mindcheck', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const saved = saveAtlas(base, 'mindcheck'), copy = () => loadAtlas(structuredClone(saved));
const realms = a => a.realms.filter(r => r.fallen == null && live(a).some(t => t.realm === r.id));
check('мир сложился: города и державы', live(base).length > 5 && realms(base).length > 1, `городов ${live(base).length}, держав ${realms(base).length}`);
check('за историю советы сложились у всех держав', realms(base).every(r => r.mind), realms(base).filter(r => !r.mind).map(r => r.name).join(', '));

// ── a season of the councils: a wind of three shares, every town but the seat flagged with a role
{
  const a = copy();
  a.hist.season = 0;
  stepMinds(a, say);
  const rs = realms(a), bad = rs.filter(r => !r.mind || !near(sum(r.mind.wind), 1, 1e-2) || !near(sum(r.mind.course), 1, 1e-2));
  check('совет: ветер и курс — три доли', rs.length > 0 && !bad.length, `держав ${rs.length}`);
  const noRole = live(a).filter(t => t.realm != null && !t.capital && !t.role);
  check('совет: у каждого города, кроме столицы, роль', !noRole.length, noRole.map(t => t.name).join(', '));
  const seatRole = live(a).filter(t => t.capital && t.role);
  check('совет: у столицы роли нет — она идёт по ветру', !seatRole.length, seatRole.map(t => t.name).join(', '));
  const flags = rs.flatMap(r => Object.values(r.mind.flags)), obey = rs.map(r => r.mind.obey);
  check('совет: нужды сезона и послушание — от 0 до 1', flags.every(v => v >= 0 && v <= 1) && obey.every(v => v >= 0 && v <= 1));
  // the same world stepped again gives the same council (no die)
  const b = copy(); b.hist.season = 0; stepMinds(b, say);
  check('совет без жребия: тот же мир — тот же ветер и роли', JSON.stringify(rs.map(r => [r.mind.wind, r.mind.flags])) === JSON.stringify(realms(b).map(r => [r.mind.wind, r.mind.flags]))
    && live(a).every((t, i) => t.role === live(b)[i].role));
}

// ── the grants by the wind: they spend the budget exactly, more to the towns of the leading vector's role
{
  const a = copy(), r = realms(a).find(r => live(a).filter(t => t.realm === r.id).length >= 3) || realms(a)[0];
  a.hist.season = 0; stepMinds(a, say);
  const towns = live(a).filter(t => t.realm === r.id), M = mindOf(a, r), budget = 1000;
  const sh = councilShares(a, r, towns, budget), total = sh.reduce((s, [, g]) => s + g, 0);
  check('гранты по ветру: делят ровно весь бюджет', near(total, budget, 1e-9), `${total.toFixed(6)} из ${budget}`);
  check('гранты по ветру: доли векторов — по ветру', VECTOR_IDS.every(k => near(M.spent[k], Math.round(budget * M.wind[k] * 1000) / 1000, 1e-2)), JSON.stringify(M.spent));
  // with the wind set all along one vector, the towns of that role take it all (and the seat its share)
  const k = towns.find(t => t.role)?.role;
  if (k) {
    M.wind = Object.fromEntries(VECTOR_IDS.map(x => [x, x === k ? 1 : 0]));
    for (const t of towns) if (t.needs) t.needs.basic = 1;   // nobody in want: growth goes by role alone
    const got = new Map(councilShares(a, r, towns, budget));
    const off = towns.filter(t => t.role && t.role !== k && got.get(t) > 1e-9);
    check(`гранты по ветру: весь ветер в «${k}» — чужим ролям ничего`, !off.length, off.map(t => `${t.name} ${t.role} ${got.get(t).toFixed(1)}`).join(', '));
  } else check('гранты по ветру: в державе есть город с ролью', false);
  // the realm's spending goes through the council: the gold that leaves the treasury is what the towns got
  const b = copy(), rb = realms(b).find(x => x.id === r.id);
  b.hist.season = 0; stepMinds(b, say);
  rb.gold = 5000;
  const tb = live(b).filter(t => t.realm === rb.id), g0 = tb.reduce((s, t) => s + (t.grant || 0) + (t.peopleGold || 0), 0);
  const sp = realmSpend(rb, tb, false, b), g1 = tb.reduce((s, t) => s + (t.grant || 0) + (t.peopleGold || 0), 0);
  check('казна державы: что ушло из казны, пришло в города', near(g1 - g0, sp.army + sp.build, 1e-3) && near(rb.gold, 5000 - sp.army - sp.build, 1e-3), `ушло ${(sp.army + sp.build).toFixed(2)}, пришло ${(g1 - g0).toFixed(2)}`);
}

// ── a town leans its choice along its role; the court along the wind
{
  const a = copy();
  a.hist.season = 0; stepMinds(a, say);
  const t = live(a).find(t => t.role), L = t && leanOf(a, t);
  check('роль города клонит его выбор (leanOf)', L && L.vec[t.role] === 1 && L.k > 0 && L.k <= MIND.build, L ? JSON.stringify(L) : 'нет города с ролью');
  const seat = live(a).find(t => t.capital && t.realm != null), S = seat && leanOf(a, seat);
  check('столица клонится по ветру, слабее (seat)', S && near(S.k, MIND.build * MIND.seat * a.realms.find(r => r.id === seat.realm).mind.obey));
  check('двор по ветру: при ветре к войне война весит больше мира', along(deedVector('warOn'), {agg: 1, grow: 0, econ: 0}) > along(deedVector('makePeace'), {agg: 1, grow: 0, econ: 0}));
}

// ── the tables reach the game
{
  const was = MIND.build;
  setCell('mindRules', 'mind.build', 'value', 3);
  const ok = MIND.build === 3;
  resetAll();
  check('таблица «Совет державы» доходит до игры и сбрасывается', ok && MIND.build === was);
}

if (fail.length) { console.log(`\nНе прошло: ${fail.length}`); process.exit(1); }
console.log('\nСовет державы: всё сходится');
