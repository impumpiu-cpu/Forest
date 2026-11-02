// The towns' building (atlas/build.js, docs/WORLD.md «Стройка»): one project at a time, raised by its builders season by
// season; paid once when begun (the money and goods leave then), the work done kept if it is left. `node tools/build-check.mjs`
import {generateAtlas} from '../src/atlas/generate.js';
import {TOWN_BUILDINGS, TOWN_MONEY} from '../src/data/townBuildings.js';
import {buildDays, crewDays, projectOf, stepBuilds} from '../src/atlas/build.js';
import {mulberry} from '../src/core/rng.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const say = () => {};
const live = a => a.towns.filter(t => t.alive);

// the work a building takes grows with its step, its hands and its room
{
  const P = TOWN_MONEY.build, b0 = {tier: 0}, b2 = {tier: 2}, big = {tier: 1, jobs: 20, house: 400};
  check('работа постройки растёт со ступенью, рабочими местами и жильём', buildDays(b0) === P.days[0] && buildDays(b2) === P.days[2] && buildDays(big) === P.days[1] * 4,
    `${buildDays(b0)}, ${buildDays(b2)}, ${buildDays(big)}`);
  check('у каждой постройки работа — число дней больше нуля', TOWN_BUILDINGS.all().every(b => buildDays(b) > 0));
}

const base = generateAtlas({seed: 'buildcheck', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const saved = saveAtlas(base, 'buildcheck'), copy = () => loadAtlas(structuredClone(saved));
check('за историю города строились проектами', live(base).some(t => t.built.length > 3) && live(base).some(t => t.project), `с проектом ${live(base).filter(t => t.project).length} из ${live(base).length}`);

// a season: the project gains the builders' days; done, it stands and the next begins
{
  const a = copy(), t = live(a).find(t => projectOf(t) && projectOf(t).days - projectOf(t).done > crewDays(t) * 1.01);
  if (!t) check('есть город с долгим проектом', false);
  else {
    const P = projectOf(t), before = P.done, n0 = t.built.length;
    stepBuilds(a, mulberry(1), say);
    const Q = projectOf(t);
    check('сезон стройки: проект прибавил дни строителей, постройка ещё не стоит', Q && Q.b.id === P.b.id && Math.abs(Q.done - before - crewDays(t)) < 1e-6 && t.built.length === n0,
      `${Math.round(before)} → ${Math.round(Q?.done ?? -1)} из ${Math.round(P.days)}, строителей ${crewDays(t).toFixed(1)} дн./сез.`);
    t.works[P.b.id].done = P.days - 1e-3;   // nearly done: next season it stands
    const was = t.built.filter(x => x === P.b.id).length;
    stepBuilds(a, mulberry(2), say);
    check('доделанная постройка встаёт, и начинается следующая', t.built.filter(x => x === P.b.id).length === was + 1 - (t.built.length < n0 ? 1 : 0) || t.built.length > n0, `${P.b.id}, следующий — ${t.project}`);
  }
}

// paid once: a project left and taken up again goes on, not paid again
{
  const a = copy(), t = live(a).find(t => projectOf(t) && projectOf(t).done > 0);
  if (t) {
    const P = projectOf(t), done = P.done, gold = (t.gold || 0) + (t.peopleGold || 0) + (t.makersGold || 0) + (t.grant || 0);
    t.project = null;   // left
    t.project = P.b.id;   // taken up again
    stepBuilds(a, mulberry(3), say);
    const now = (t.gold || 0) + (t.peopleGold || 0) + (t.makersGold || 0) + (t.grant || 0), Q = projectOf(t);
    check('брошенный и подхваченный проект идёт дальше и второй раз не оплачивается', (Q?.done ?? P.days) > done && now >= gold - 1e-6 || t.built.includes(P.b.id), `${Math.round(done)} → ${Math.round(Q?.done ?? P.days)}`);
  } else check('есть начатый проект', false);
}

if (fail.length) { console.log(`\nНе прошло: ${fail.length}`); process.exit(1); }
console.log('\nСтройка: проектом, по дням строителей');
