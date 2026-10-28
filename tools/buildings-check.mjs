// The table of the world's buildings (data/townBuildings.js) is the one truth about a building: who builds it, what its
// realm must have first, what it houses, employs, takes and gives, the metals it opens; the local map reads its races
// from it. `npm run buildings`.
import {TOWN_BUILDINGS, TOWN_GOODS, EFFECTS, goodPrice, metalBuildings, localPeoples} from '../src/data/townBuildings.js';
import {BUILDINGS} from '../src/data/buildings.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {MATERIALS} from '../src/data/balance/materials.js';
import {realmBuilt, realmWorks, canBuild} from '../src/atlas/towns.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const all = TOWN_BUILDINGS.all();
const isCount = v => v == null || (Number.isInteger(v) && v >= 0);

// the flows: whole numbers of people and wood, goods that exist, amounts above zero; room is `house`, not an effect
{
  const bad = [];
  for (const b of all) {
    for (const k of ['house', 'jobs', 'heat']) if (!isCount(b[k])) bad.push(`${b.id}: ${k} — не целое ≥ 0`);
    for (const k of ['in', 'out']) for (const [g, n] of Object.entries(b[k] || {})) {
      if (!TOWN_GOODS.has(g)) bad.push(`${b.id}: ${k}.${g} — нет такого блага`);
      if (!(typeof n === 'number' && n > 0)) bad.push(`${b.id}: ${k}.${g} = ${n}`);
    }
    if ('housing' in (b.fx || {})) bad.push(`${b.id}: жильё в эффектах — оно задаётся полем house`);
    for (const k of Object.keys(b.fx || {})) if (!(k in EFFECTS)) bad.push(`${b.id}: эффект ${k}`);
  }
  const used = new Set(all.flatMap(b => [...Object.keys(b.in || {}), ...Object.keys(b.out || {})]));
  for (const G of TOWN_GOODS.all()) {
    if (!(goodPrice(G.id) > 0)) bad.push(`благо ${G.id}: нет цены`);
    if (!used.has(G.id)) bad.push(`благо ${G.id}: его никто не тратит и не даёт`);
  }
  const housed = all.filter(b => b.house > 0).length, working = all.filter(b => b.jobs > 0).length;
  check('потоки построек: числа целые, блага известны, у каждого блага есть цена и место', !bad.length,
    bad.length ? bad.slice(0, 5).join('; ') : `${all.length} построек: вмещают ${housed}, берут руки ${working}, благ ${TOWN_GOODS.all().length}`);
}

// what a people may build it can reach: the buildings its realm must have first are open to that people too
{
  const bad = [];
  const may = (b, P) => !b.peoples || b.peoples.includes(P);
  for (const P of WORLD_PEOPLES.ids()) for (const b of all) {
    if (!may(b, P)) continue;
    for (const id of b.requires || []) if (!may(TOWN_BUILDINGS.get(id), P)) bad.push(`${P}: ${b.id} требует ${id}, а его они не строят`);
    if (b.requiresAny && !b.requiresAny.some(id => may(TOWN_BUILDINGS.get(id), P))) bad.push(`${P}: ${b.id} требует одну из ${b.requiresAny.join(', ')}, а их они не строят`);
  }
  check('что народу разрешено, он может построить: нужное в державе ему тоже разрешено', !bad.length, bad.length ? bad.slice(0, 6).join('; ') : '');
}

// the peoples' flows: multipliers and swaps name real goods; an upgrade is housing over housing
{
  const bad = [];
  for (const P of WORLD_PEOPLES.all()) {
    for (const [g, k] of Object.entries(P.flows || {})) if (!TOWN_GOODS.has(g) || !(k > 0)) bad.push(`${P.id}: потоки ${g} ×${k}`);
    for (const [g, w] of Object.entries(P.swaps || {})) if (!TOWN_GOODS.has(g) || !TOWN_GOODS.has(w?.to) || !(w.k > 0)) bad.push(`${P.id}: замена ${g} → ${w?.to}`);
  }
  for (const b of all) for (const id of b.upgrades || []) {
    const o = TOWN_BUILDINGS.has(id) ? TOWN_BUILDINGS.get(id) : null;
    if (!o) bad.push(`${b.id}: улучшает неизвестное ${id}`);
    else if (o.cat !== 'housing' || b.cat !== 'housing' || !(b.house > o.house)) bad.push(`${b.id}: улучшает ${id}, но это не жильё больше прежнего`);
  }
  check('множители и замены благ у народов, улучшение жилья — только жильём побольше', !bad.length, bad.length ? bad.join('; ') : '');
}

// a people that has gone through the asymmetry (docs/WORLD.md «Асимметрия»): every good its buildings take (after its
// swaps) one of its own buildings gives — no chain of theirs hangs on what they may not build
const DONE = ['elves'];
for (const P of DONE.map(id => WORLD_PEOPLES.get(id))) {
  const mine = all.filter(b => !b.peoples || b.peoples.includes(P.id)), made = new Set(mine.flatMap(b => Object.keys(b.out || {})));
  const taken = new Map();
  for (const b of mine) {
    for (const g of Object.keys(b.in || {})) { const to = P.swaps?.[g]?.to || g; (taken.get(to) || taken.set(to, []).get(to)).push(b.id); }
    if (b.heat) (taken.get('wood') || taken.set('wood', []).get('wood')).push(b.id);
  }
  const gaps = [...taken].filter(([g]) => !made.has(g)).map(([g, by]) => `${g} (${by.join(', ')})`);
  check(`${P.label}: всё, что их постройки тратят, их же постройки и дают`, !gaps.length, gaps.length ? gaps.join('; ') : `${mine.length} построек, благ ${made.size}`);
}

// the metals: every metal of the game is opened by a building, and only by a real material
{
  const bad = [];
  for (const b of all) for (const m of b.metals || []) if (!MATERIALS[m]) bad.push(`${b.id}: металл ${m}`);
  const metals = Object.entries(MATERIALS).filter(([, m]) => m.class.includes('metal') || m.class.includes('silver')).map(([id]) => id);
  for (const m of metals) if (!metalBuildings(m).length) bad.push(`${m}: его не открывает ни одна постройка`);
  check('металлы открывают постройки державы', !bad.length, bad.length ? bad.join('; ') : metals.map(m => `${m} — ${metalBuildings(m).join('/')}`).join(', '));
}

// the realm decides: a town builds what stands in another town of its realm; a metal is worked by the whole realm
{
  const t1 = {id: 1, people: 'humans', realm: 'r', built: ['mineshaft', 'smelter'], tier: 1, alive: true, i: 0, pop: 300};
  const t2 = {id: 2, people: 'humans', realm: 'r', built: [], tier: 1, alive: true, i: 0, pop: 300};
  const t3 = {id: 3, people: 'humans', realm: 'q', built: [], tier: 1, alive: true, i: 0, pop: 300};
  const a = {towns: [t1, t2, t3], realms: [{id: 'r'}, {id: 'q'}], place: {}};
  for (const t of a.towns) t.place = {forest: true, stone: true};
  const forge = TOWN_BUILDINGS.get('forge');
  const own = canBuild(a, t2, forge), other = canBuild(a, t3, forge);
  check('кузню строит город, в чьей державе стоит горн, даже не в нём самом; чужая держава — нет', own && !other, `свой ${own}, чужой ${other}`);
  const bronze = realmWorks(a, t2, 'bronze'), iron = realmWorks(a, t2, 'iron'), bone = realmWorks(a, t3, 'bone');
  check('металл работает вся держава: бронза есть (горн у соседа), железа нет; кость — у всех', bronze && !iron && bone && realmBuilt(a, t2).has('smelter'), `бронза ${bronze}, железо ${iron}, кость ${bone}`);
}

// the local map reads its races from here
{
  const bad = [];
  for (const b of BUILDINGS.all()) {
    if (!all.some(t => t.local === b.id)) bad.push(`${b.id}: нет постройки мира с local`);
    if (JSON.stringify(b.races) !== JSON.stringify(localPeoples(b.id))) bad.push(`${b.id}: расы не из таблицы городов`);
    if (Object.keys(b).includes('races')) bad.push(`${b.id}: races лежит в самой постройке`);
  }
  check('постройки поселения берут расы из «Построек городов»', !bad.length, bad.length ? bad.slice(0, 4).join('; ') : `${BUILDINGS.all().length} построек`);
}

// the economy of a town by its buildings' flows (atlas/economy.js): hands, slaves, a taken building, hard and soft goods,
// the people's flows and swaps
{
  const {townEconomy} = await import('../src/atlas/economy.js');
  const {TOWN_FLOW: TF} = await import('../src/data/townBuildings.js');
  const row = (E, id) => E.rows.find(r => r.id === id);
  // an elven town: fields give a quarter more; the jeweller takes wood for metal
  const elf = townEconomy(null, {people: 'elves', pop: 1000, built: ['field', 'jeweler', 'forestry', 'sacredgrove'], slaves: 0}, 1);
  const hum = townEconomy(null, {people: 'humans', pop: 1000, built: ['field', 'jeweler'], slaves: 0}, 1);
  const field = TOWN_BUILDINGS.get('field');
  check('расчёт: эльфийская пашня даёт на четверть больше зерна; ювелир эльфов берёт дерево вместо металла и работает, людской без металла стоит',
    Math.abs(elf.made.grain - field.out.grain * 1.25 * row(elf, 'field').eff) < 1e-6 && !('metal' in (elf.used || {})) && row(elf, 'jeweler').eff > 0 && row(hum, 'jeweler').eff === 0,
    `зерно ${elf.made.grain.toFixed(0)} против ${hum.made.grain.toFixed(0)}, ювелир эльфов ${row(elf, 'jeweler').eff.toFixed(2)}, людей ${row(hum, 'jeweler').eff.toFixed(2)}`);
  // hands: few people — the field works at a share; a soft good short — half strength
  const thin = townEconomy(null, {people: 'humans', pop: 20, built: ['field'], slaves: 0}, 1);
  check('руки: людей мало — пашня работает на долю; без орудий (мягкое благо) — вполсилы', Math.abs(row(thin, 'field').staff - 10 / 30) < 1e-6 && Math.abs(row(thin, 'field').eff - row(thin, 'field').staff * TF.soft) < 1e-6,
    `штат ${row(thin, 'field').staff.toFixed(2)}, сила ${row(thin, 'field').eff.toFixed(2)}`);
  // slaves: they take up to 80% of the places at 0.6 of a free hand; the rest free
  const orc = townEconomy(null, {people: 'orcs', pop: 1000, built: ['mineshaft'], slaves: 100}, 1);
  check('рабы: занимают до 80% мест и работают хуже вольных; остальное — вольные', Math.abs(row(orc, 'mineshaft').slaves - TF.slaves.share) < 1e-6 && Math.abs(orc.slavesIdle - (100 - 12 * TF.slaves.share / TF.slaves.work)) < 1e-6,
    `доля рабов ${row(orc, 'mineshaft').slaves.toFixed(2)}, без дела ${orc.slavesIdle.toFixed(1)}`);
  // a taken building of another people works at half
  const taken = townEconomy(null, {people: 'elves', pop: 1000, built: ['mushrooms'], slaves: 0}, 1);
  check('захваченная постройка чужого народа работает вполсилы', Math.abs(row(taken, 'mushrooms').eff - TF.captured) < 1e-6, `${row(taken, 'mushrooms').eff}`);
}

// the elves live by their works in the world's history: their towns feed themselves mostly by their buildings and every
// hard good their buildings take, some elven town makes (the other peoples are not gone through yet: docs/TODO.md)
{
  const {generateAtlas} = await import('../src/atlas/generate.js');
  let pop = 0, fed = 0, n = 0; const made = new Set(), taken = new Set();
  for (const seed of ['1', '2']) {
    const a = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
    for (const t of a.towns.filter(t => t.alive && t.people === 'elves' && t.econ)) {
      n++; pop += t.pop; fed += t.econ.feeds;
      for (const [g, v] of Object.entries(t.econ.made)) if (v > 0) made.add(g);
      for (const g of Object.keys(t.econ.used)) if (!TOWN_GOODS.get(g).soft) taken.add(g);
    }
  }
  const missing = [...taken].filter(g => !made.has(g));
  check('эльфы в истории мира: их постройки кормят большую часть жителей, а всё жёсткое, что они тратят, где-то у них же делается', n > 0 && fed / pop > 0.5 && !missing.length,
    `городов ${n}, еда от построек ${(100 * fed / pop).toFixed(0)}% жителей; не делают: ${missing.join(', ') || 'всё делают'}`);
}

if (fail.length) process.exit(1);
