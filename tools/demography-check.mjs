// People are a resource (atlas/demography.js, docs/WORLD.md «Демография»): they are born of people, move, march, are carried
// off and die — nothing makes them out of nothing. Each rule that moves people is checked on a copy of one world: the
// moving, the settlers, a town left empty, the captives freed, the crowned seat, an army home; a year of the peoples with
// no births makes nobody. `node tools/demography-check.mjs`
import {generateAtlas} from '../src/atlas/generate.js';
import {WORLD_PEOPLES, TOWN_LIFE} from '../src/data/peoples.js';
import {migrate, abandonEmpty, freeCaptives, drawTo, mayMove, lifeOf, deathRate, brawlRate, lifeYear, breedOf, foundAge} from '../src/atlas/demography.js';
import {foundFrom, settleSpot, stepPeoples, bornOf} from '../src/atlas/peoples.js';
import {returnArmy} from '../src/atlas/army.js';
import {mulberry} from '../src/core/rng.js';
import {setCell, resetAll} from '../src/data/schema/edits.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {stepHistory} from '../src/atlas/history.js';
import {groupSize} from '../src/atlas/population.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const near = (x, y, tol = 1e-6) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y));
const live = a => a.towns.filter(t => t.alive);
const people = a => live(a).reduce((s, t) => s + t.pop, 0);
const say = () => {};

const base = generateAtlas({seed: 'democheck', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const saved = saveAtlas(base, 'democheck'), copy = () => loadAtlas(structuredClone(saved));
check('мир сложился: города и державы', live(base).length > 5 && base.realms.length > 1, `городов ${live(base).length}`);
check('города после прихода народа основали поселенцы', base.towns.some(t => t.from != null), `основали ${base.towns.filter(t => t.from != null).length}`);
check('ни в одном живом городе нет меньше, чем держит город', live(base).every(t => t.pop >= TOWN_LIFE.abandon), live(base).filter(t => t.pop < TOWN_LIFE.abandon).map(t => `${t.name} ${t.pop}`).join(', '));

// ── moving: nobody made, nobody lost; only where they may go
{
  const a = copy(), p0 = people(a), m0 = a.hist.moved || 0;
  for (const t of live(a)) if (t.needs) t.needs.basic = (t.id % 3) / 2;   // some towns live better: people want to move
  const moved = migrate(a);
  check('переезд не делает и не теряет жителей', near(people(a), p0), `${p0.toFixed(3)} → ${people(a).toFixed(3)}, переехало ${Math.round(moved)}`);
  check('переезд записан в летопись чисел', near((a.hist.moved || 0) - m0, moved));
  const t = live(a)[0], o = live(a).find(x => x.realm !== t.realm && x.people !== t.people && !(WORLD_PEOPLES.get(x.people).welcome || []).includes(t.people));
  check('в город чужого народа, который не принимает, не переезжают', !o || !mayMove(a, t, o));
}

// ── settlers: they leave their town and as many are in the new one; what they carry leaves its store
{
  const a = copy(), t = live(a).filter(t => settleSpot(a, t) >= 0).sort((p, q) => q.pop - p.pop)[0];
  if (!t) check('поселенцы: есть город с местом рядом', false);
  else {
    const S = WORLD_PEOPLES.get(t.people).settlers;
    t.pop = Math.max(t.pop, S.pop + S.keep + 1);
    t.stock = {...(t.stock || {}), ...Object.fromEntries(Object.entries(S.goods).map(([g, v]) => [g, v / 2]))};   // half of what they would take
    const p0 = people(a), n0 = a.towns.length, before = t.pop, goods0 = {...t.stock};
    const made = foundFrom(a, t, mulberry(1), say);
    check('поселенцы: уходят из своего города, столько же в новом', made && near(t.pop, before - S.pop) && near(made.pop, S.pop) && near(people(a), p0) && a.towns.length === n0 + 1,
      made ? `${Math.round(before)} → ${Math.round(t.pop)}, новый ${made.pop}` : 'не основали');
    check('поселенцы: новый город — той же державы', made && made.realm === t.realm && made.from === t.id);
    const moved = Object.keys(S.goods).every(g => near((made?.stock?.[g] || 0) + (t.stock?.[g] || 0), goods0[g] || 0));
    check('поселенцы: уносят со склада, что есть, и не больше', made && moved, JSON.stringify(made?.stock));
    check('поселенцы: еду несут заготовками — первый склад нового города', (made?.stock?.stores || 0) > 0, `заготовок ${made?.stock?.stores}`);
    t.pop = S.pop + S.keep - 1;
    check('поселенцы: из города, где останется меньше keep, не уходят', !foundFrom(a, t, mulberry(2), say));
  }
}

// ── a town left empty: its people go to the nearest town of its realm
{
  const a = copy(), t = live(a).find(t => t.realm != null && !t.capital && live(a).some(o => o !== t && o.realm === t.realm));
  if (!t) check('опустевший город: есть город с соседом по державе', false);
  else {
    t.pop = TOWN_LIFE.abandon - 1;
    const p0 = people(a);
    abandonEmpty(a, mulberry(3), say);
    check('опустевший город бросают, жители уходят к своим', !t.alive && near(people(a), p0), `${p0.toFixed(2)} → ${people(a).toFixed(2)}`);
  }
}

// ── the captives of a lair gone go home
{
  const a = copy(), l = (a.lairs || []).find(l => l.alive), P = live(a)[0].people;
  l.captives = {[P]: 17}; l.alive = false;
  const p0 = people(a), freed = freeCaptives(a);
  check('пленные павшего логова уходят домой — все', freed === 17 && near(people(a), p0 + 17) && l.captives === null, `вернулось ${freed}`);
}

// ── the crowned seat draws people, it does not make them
{
  const a = copy(), seat = live(a).filter(t => t.capital && live(a).some(o => o !== t && o.realm === t.realm)).sort((p, q) => q.pop - p.pop)[0];
  if (seat) {
    const p0 = people(a), s0 = seat.pop, got = drawTo(a, seat, 100);
    check('венец стягивает людей в столицу, а не делает их', got > 0 && near(people(a), p0) && near(seat.pop, s0 + got), `пришло ${Math.round(got)}`);
  } else check('венец: есть столица с другими городами', false);
}

// ── an army whose town fell comes back to the nearest town of its realm
{
  const a = copy(), t = live(a).find(t => t.realm != null && live(a).some(o => o !== t && o.realm === t.realm));
  const p = {kind: 'army', owner: t.realm, people: t.people, from: t.id, men: 40.5};
  t.alive = false;
  const p0 = people(a);
  returnArmy(a, p);
  check('войско павшего города возвращается к своим, все до одного', near(people(a), p0 + 40.5), `${p0.toFixed(1)} → ${people(a).toFixed(1)}`);
}

// ── the peoples breed by their kind: the elder ones (elves, dwarves) slower than the younger (humans, greenskins)
{
  const t = {pop: 200, needs: {basic: 1, comfort: 0}}, fx = {prestige: 0}, rate = id => bornOf(t, WORLD_PEOPLES.get(id), fx, 1000) / t.pop;
  const r = Object.fromEntries(['elves', 'dwarves', 'humans', 'orcs'].map(id => [id, rate(id)]));
  check('прирост по народу: эльфы и дварфы медленнее людей и зеленокожих', Math.max(r.elves, r.dwarves) < Math.min(r.humans, r.orcs),
    Object.entries(r).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', '));
  check('прирост упирается в предел: полный город не растёт', bornOf({...t, pop: 1000}, WORLD_PEOPLES.get('humans'), fx, 1000) <= 1e-9);
}

// ── a hungry year eats the stores of the store (a store a man a year)
{
  const a = copy(), t = live(a).sort((p, q) => q.pop - p.pop)[0];
  t.pop *= 10; t.stock = {...(t.stock || {}), stores: 50};
  stepPeoples(a, mulberry(5), say);
  check('голодный год: город ест заготовки со склада', (t.stock?.stores || 0) < 50 && t.ateStores > 0, `съедено ${t.ateStores}, осталось ${t.stock?.stores || 0}`);
}

// ── a year of the peoples with no births makes nobody (no roll, no floor, no town out of nothing)
{
  const a = copy();
  setCell('worldLife', 'townLife.growth', 'value', 0);
  const p0 = people(a), n0 = live(a).length;
  stepPeoples(a, mulberry(4), say);
  resetAll();
  check('год без рождений: жителей не прибавилось', people(a) <= p0 + 1e-6, `${p0.toFixed(2)} → ${people(a).toFixed(2)}, городов ${n0} → ${live(a).length}`);
  check('после сброса таблиц прирост вернулся', TOWN_LIFE.growth > 0);
}

// ── age and death (atlas/demography.js lifeYear; the races table: lifeFrom, life, fertility, brawled; data/peoples.js brawl)
{
  const rate = (kind, age, health = 0) => deathRate(lifeOf(kind, health), age, health);
  check('эльфы почти не умирают за историю, люди умирают, гоблины — быстрее всех', rate('elf', 300) < 0.002 && rate('human', 40) > 0.01 && rate('goblin', 15) > rate('orc', 15) && rate('orc', 15) > rate('human', 15),
    `эльф в 300: ${rate('elf', 300).toFixed(4)}, человек в 40: ${rate('human', 40).toFixed(3)}, в 15 лет: гоблин ${rate('goblin', 15).toFixed(3)}, орк ${rate('orc', 15).toFixed(3)}, человек ${rate('human', 15).toFixed(3)}`);
  check('тролли и огры живут дольше орков и людей', lifeOf('troll') > 100 && lifeOf('ogre') > 100 && lifeOf('orc') < lifeOf('human'));
  check('здоровье продлевает жизнь к верхней границе и бережёт детей', lifeOf('human', 0) === 60 && lifeOf('human', 0.3) > 60 && lifeOf('human', 10) <= 80 && rate('human', 10, 1) < rate('human', 10, 0));
  check('основатели — треть срока своего вида', foundAge('human') === 20 && foundAge('goblin') < foundAge('orc') && foundAge('troll') > foundAge('orc'));
  const town = (people, race) => ({people, pop: 100, kin: {[race]: 1}});
  check('гоблины плодовитее орков, тролли и огры — реже', breedOf(null, town('orcs', 'goblin')) > 1 && breedOf(null, town('orcs', 'troll')) < 1 && near(breedOf(null, town('humans', 'human')), 1));
  check('драки за место у костра — только у зеленокожих, от тесноты и преступности', (() => {
    const a = {realms: [{id: 'r1', kingdom: {ruin: {crime: 10}}}]}, fx = {housing: 0, health: 0};
    return brawlRate(a, {people: 'humans', realm: 'r1', pop: 120}, fx) === 0 && brawlRate(a, {people: 'orcs', realm: 'r1', pop: 120}, fx) > brawlRate({realms: []}, {people: 'orcs', realm: 'r1', pop: 60}, fx);
  })());
  {
    const t = {people: 'humans', pop: 1000, age: 30}, young0 = () => (t.heads?.human?.[0] || 0);
    const v = lifeYear(null, t, 50, 10, {health: 0, housing: 0}), y1 = young0();
    check('год жизни: родились и пришли + выжили, умершие не возвращаются; дети рождаются детьми, пришедшие — по полосам', Math.abs(t.pop - (1000 - v.dead - v.brawl - v.want + v.born + v.came)) < 0.1 && v.born > 0 && v.came > 0 && y1 >= v.born && t.age > 20 && t.age < 50, `жителей ${t.pop.toFixed(1)}, родилось ${v.born}, пришло ${v.came}, умерло ${v.dead}, детей ${y1.toFixed(1)}, возраст ${t.age}`);
  }
  {
    const a = {realms: [{id: 'r1', kingdom: {ruin: {crime: 10}}}]};
    const t = {people: 'orcs', realm: 'r1', pop: 1000, kin: {orc: 0.5, goblin: 0.3, troll: 0.2}, kinAge: {orc: 15, goblin: 8, troll: 50}};   // (an old save's town: its races and their mean ages become bands)
    const v = lifeYear(a, t, 0, 0, {health: 0, housing: 10});
    check('виды города расходятся: гоблины гибнут в драках и от старости быстрее, тролли держатся', t.kin.goblin < 0.3 && t.kin.goblin > 0.1 && t.kin.troll > 0.2 && v.brawl > 0, JSON.stringify(t.kin));
  }
  check('рабы зеленокожих живут 1–4 года', 2 / (WORLD_PEOPLES.get('orcs').slaveLife[0] + WORLD_PEOPLES.get('orcs').slaveLife[1]) >= 0.4);
}

// ── the composition (atlas/population.js): one place changes who lives in a town. A year of history with every town's
// `pop` watched: nothing outside atlas/population.js writes it; the sums hold (pop = Σ heads, the shares sum to 1); the
// year's losses are booked by cause, the war's among them
{
  const a = copy(), bad = [];
  const outside = () => { const st = new Error().stack.split('\n').slice(2); return st.some(l => /atlas\/population\.js/.test(l)) ? null : (st.find(l => /\/src\//.test(l)) || '?').trim(); };
  for (const t of a.towns) { let v = t.pop; Object.defineProperty(t, 'pop', {get: () => v, set: x => { if (x !== v) { const o = outside(); if (o) bad.push(o); } v = x; }, enumerable: true, configurable: true}); }
  const live0 = live(a).length;
  for (let k = 0; k < 4; k++) stepHistory(a);
  for (const t of a.towns) { const d = Object.getOwnPropertyDescriptor(t, 'pop'); if (d?.get) { const v = d.get(); delete t.pop; t.pop = v; } }
  check('жителей города меняет только atlas/population.js', bad.length === 0, bad.slice(0, 3).join(' | '));
  const sums = live(a).every(t => t.heads && Math.abs(t.pop - groupSize(t.heads)) < 1e-6 && Math.abs(Object.values(t.kin).reduce((s, v) => s + v, 0) - 1) < 0.01);
  check('жители — сумма состава по расам и полосам возраста; доли рас сходятся к 1', sums);
  const booked = live(a).filter(t => t.vital && Object.keys(t.vital).length > 4).length;
  check('потери года записаны по причинам (война, набег, осада, голод…)', booked > 0, `городов с причинами: ${booked} из ${live(a).length}; были ${live0}`);
}

if (fail.length) { console.log(`\nНе прошло: ${fail.length}`); process.exit(1); }
console.log('\nДемография: люди не берутся из воздуха');
