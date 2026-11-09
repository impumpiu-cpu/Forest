// The table of the world's buildings (data/townBuildings.js) is the one truth about a building: who builds it, what its
// realm must have first, what it houses, employs, takes and gives, the metals it opens; the local map reads its races
// from it. `npm run buildings`.
import {TOWN_BUILDINGS, TOWN_GOODS, EFFECTS, goodPrice, metalBuildings, localPeoples, POOLS, TOWN_FLOW, KITCHENS, makesOf, takesOf, recipesOf, lineHas, TOWN_SLOTS} from '../src/data/townBuildings.js';
import {BUILDINGS} from '../src/data/buildings.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {MATERIALS} from '../src/data/balance/materials.js';
import {realmBuilt, realmWorks, canBuild, slotsUsed, slotsOf} from '../src/atlas/towns.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const all = TOWN_BUILDINGS.all();
const isCount = v => v == null || (Number.isInteger(v) && v >= 0);

// the flows: whole numbers of people and wood, goods that exist, amounts above zero; room is `house`, not an effect
{
  const bad = [];
  for (const b of all) {
    for (const k of ['house', 'jobs', 'heat', 'fire']) if (!isCount(b[k])) bad.push(`${b.id}: ${k} — не целое ≥ 0`);
    for (const x of [b, ...recipesOf(b)]) for (const k of ['in', 'out']) for (const [g, n] of Object.entries(x[k] || {})) {
      if (!TOWN_GOODS.has(g)) bad.push(`${b.id}${x === b ? '' : ':' + x.id}: ${k}.${g} — нет такого блага`);
      if (!(typeof n === 'number' && n > 0)) bad.push(`${b.id}${x === b ? '' : ':' + x.id}: ${k}.${g} = ${n}`);
    }
    // a recipe is for a people or a kind, nothing else (no indicators, no «in the store»: a recipe runs on what it takes)
    const known = i => /^people:/.test(i) && WORLD_PEOPLES.has(i.slice(7)) || /^kin:/.test(i);
    for (const r of recipesOf(b).flatMap(q => q.req || [])) for (const i of r.split('|')) if (!known(i)) bad.push(`${b.id}: рецепт для неизвестного народа или расы ${i}`);
    for (const k of ['opens', 'req', 'placeOut']) if (k in b) bad.push(`${b.id}: поле ${k} — индикаторов больше нет`);
    if ('housing' in (b.fx || {})) bad.push(`${b.id}: жильё в эффектах — оно задаётся полем house`);
    for (const k of Object.keys(b.fx || {})) if (!(k in EFFECTS)) bad.push(`${b.id}: эффект ${k}`);
  }
  // (a good of a pool a building takes — a kitchen's raw food, the fuel of heat and fire — is used; brushwood is gathered by hand)
  const pooled = b => [...Object.keys(b.any || {}), ...(b.heat || b.fire || recipesOf(b).some(q => q.fire) ? ['fuel'] : [])].flatMap(id => Object.keys(POOLS[id] || {}));
  const used = new Set([...all.flatMap(b => [...takesOf(b), ...makesOf(b), ...pooled(b)]), ...Object.keys(TOWN_FLOW.gather || {})]);
  for (const b of all) for (const id of Object.keys(b.any || {})) if (!POOLS[id]) bad.push(`${b.id}: any.${id} — нет такого набора`);
  for (const [id, P] of Object.entries(POOLS)) for (const [g, w] of Object.entries(P)) { if (!TOWN_GOODS.has(g)) bad.push(`набор ${id}: нет блага ${g}`); if (!(w > 0)) bad.push(`набор ${id}: ${g} = ${w}`); }
  for (const G of TOWN_GOODS.all()) {
    if (!(goodPrice(G.id) > 0)) bad.push(`благо ${G.id}: нет цены`);
    if (!used.has(G.id)) bad.push(`благо ${G.id}: его никто не тратит и не даёт`);
  }
  const housed = all.filter(b => b.house > 0).length, working = all.filter(b => b.jobs > 0).length;
  check('потоки построек: числа целые, блага известны, у каждого блага есть цена и место', !bad.length,
    bad.length ? bad.slice(0, 5).join('; ') : `${all.length} построек: вмещают ${housed}, берут руки ${working}, благ ${TOWN_GOODS.all().length}`);
}

// the kitchens (docs/WORLD.md «Кухни и топливо»): three steps, every people's, each a tier in place of the one before; raw food is
// one good, cooked on the fire into food; a building that burns names it as heat or fire, not as logs or coal it takes
{
  const bad = [], K = KITCHENS.map(id => TOWN_BUILDINGS.get(id));
  if (K.map(b => b.tier).join() !== '0,1,2') bad.push(`ступени кухонь: ${K.map(b => b.tier).join()}`);
  if (K[1].kind !== 'tier' || !K[1].upgrades.includes(K[0].id) || K[2].kind !== 'tier' || !K[2].upgrades.includes(K[1].id)) bad.push('кухни — не тиры одна другой');
  for (const b of K) { if (b.peoples) bad.push(`${b.id}: не у всех народов`); if (!b.in?.raw || !b.out?.food || !b.fire) bad.push(`${b.id}: варит сырое на огне в еду`); }
  const raws = TOWN_GOODS.all().filter(g => g.raw).map(g => g.id);
  if (raws.join() !== 'raw') bad.push(`сырое — одно благо: ${raws.join(', ')}`);
  for (const b of all) if (b.in?.fuel || recipesOf(b).some(q => q.in?.fuel)) bad.push(`${b.id}: топливо в «Тратит» — оно идёт жаром (fire)`);
  const ratio = K.map(b => b.out.food / b.in.raw);
  if (!(ratio[0] < ratio[1] && ratio[1] < ratio[2])) bad.push(`выход кухонь не растёт со ступенью: ${ratio.join(', ')}`);
  check('кухни: три ступени-тира у всех народов, сырое одно и варится, топливо — жаром', !bad.length, bad.length ? bad.slice(0, 5).join('; ') : K.map(b => `${b.name} ${b.in.raw}→${b.out.food}`).join(', '));
}

// what a people may build it can reach: the buildings its realm must have first are open to that people too
{
  const bad = [];
  const may = (b, P) => !b.peoples || b.peoples.includes(P);
  for (const P of WORLD_PEOPLES.ids()) for (const b of all) {
    if (!may(b, P)) continue;
    for (const id of b.requires || []) if (!may(TOWN_BUILDINGS.get(id), P)) bad.push(`${P}: ${b.id} требует ${id}, а его они не строят`);
    if (b.requiresAny && !b.requiresAny.some(id => may(TOWN_BUILDINGS.get(id), P))) bad.push(`${P}: ${b.id} требует одну из ${b.requiresAny.join(', ')}, а их они не строят`);
    // an annex, a tier, an upgrade: some host of it is theirs (a tier of theirs grows from what they build)
    if (b.here && !b.here.some(id => id === b.id || may(TOWN_BUILDINGS.get(id), P))) bad.push(`${P}: ${b.id} ставится при ${b.here.join(', ')}, а их они не строят`);
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
    else if (b.cat === 'housing' ? o.cat !== 'housing' || !(b.house > o.house) : b.kind !== 'tier' || o.line !== b.line) bad.push(`${b.id}: строится на месте ${id}, но это не жильё больше прежнего и не тир своей линии`);
  }
  for (const b of all) if (b.kind === 'upgrade' && (b.jobs || !b.boost || !b.here?.every(id => b.boost[id] > 0))) bad.push(`${b.id}: улучшение без рук, но со своим усилением основы`);
  for (const b of all) if (!b.line) bad.push(`${b.id}: нет карточки (line)`);
  check('множители и замены благ у народов; на месте прежнего — жильё побольше или тир своей линии; улучшения усиливают основу', !bad.length, bad.length ? bad.slice(0, 6).join('; ') : '');
}

// a people that has gone through the asymmetry (docs/WORLD.md «Асимметрия»): every good its buildings take (after its
// swaps) one of its own buildings gives — no chain of theirs hangs on what they may not build
const DONE = ['elves', 'dwarves', 'orcs'];
for (const P of DONE.map(id => WORLD_PEOPLES.get(id))) {
  // (of the recipes — those its people and any of its kinds may run: the others' bows are not its chain)
  const mayRun = q => (q.req || []).every(r => r.split('|').some(x => !/^people:/.test(x) || x === `people:${P.id}`));
  const mine = all.filter(b => !b.peoples || b.peoples.includes(P.id));
  const made = new Set(mine.flatMap(b => [...makesOf({...b, recipes: recipesOf(b).filter(mayRun)})]));   // (a mine's metals)
  const taken = new Map();
  for (const b of mine) {
    for (const x of [b, ...recipesOf(b).filter(mayRun)]) for (const g of Object.keys(x.in || {})) { const to = P.swaps?.[g]?.to || g; (taken.get(to) || taken.set(to, []).get(to)).push(b.id); }
    if (b.heat) (taken.get('wood') || taken.set('wood', []).get('wood')).push(b.id);
  }
  // (a recipe of the forge runs on a metal of the store — brought in — is the trade's: the greenskins' forge works bought steel)
  const bought = new Set(mine.flatMap(b => recipesOf(b).filter(mayRun).flatMap(q => (b.id === 'forge' ? Object.keys(q.in || {}) : []))));
  const gaps = [...taken].filter(([g]) => !made.has(g) && !bought.has(g)).map(([g, by]) => `${g} (${by.join(', ')})`);
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
  const t1 = {id: 1, people: 'humans', realm: 'r', built: ['mineshaft'], tier: 1, alive: true, i: 0, pop: 300};
  const t2 = {id: 2, people: 'humans', realm: 'r', built: [], tier: 1, alive: true, i: 0, pop: 300};
  const t3 = {id: 3, people: 'humans', realm: 'q', built: [], tier: 1, alive: true, i: 0, pop: 300};
  const a = {towns: [t1, t2, t3], realms: [{id: 'r'}, {id: 'q'}], place: {}};
  for (const t of a.towns) t.place = {forest: true, stone: true};
  const bridge = TOWN_BUILDINGS.get('stonehouse');
  for (const t of a.towns) t.tier = 2;
  t1.built.push('quarry');
  const own = canBuild(a, t2, bridge), other = canBuild(a, t3, bridge);
  check('каменные дома строит город, в чьей державе стоит карьер, даже не в нём самом; чужая держава — нет', own && !other, `свой ${own}, чужой ${other}`);
  const bronze = realmWorks(a, t2, 'bronze'), iron = realmWorks(a, t2, 'iron'), bone = realmWorks(a, t3, 'bone');
  check('металл работает вся держава: бронза есть (рудник у соседа), железа нет; кость — у всех', bronze && !iron && bone && realmBuilt(a, t2).has('mineshaft'), `бронза ${bronze}, железо ${iron}, кость ${bone}`);
}

// the local map reads its races from here (a work of the settlement alone — the pit-saw, the potter's pit, the bloomery: the
// world's towns fold it into their mines and woodcutters — is everyone's)
const LOCAL_ONLY = new Set(['sawmill', 'potter', 'smelter']);
{
  const bad = [];
  for (const b of BUILDINGS.all()) {
    if (LOCAL_ONLY.has(b.id)) { if (localPeoples(b.id) !== null) bad.push(`${b.id}: постройка поселения без постройки мира, а расы есть`); continue; }
    if (!all.some(t => t.local?.includes(b.id))) bad.push(`${b.id}: нет постройки мира с local`);
    if (JSON.stringify(b.races) !== JSON.stringify(localPeoples(b.id))) bad.push(`${b.id}: расы не из таблицы городов`);
    if (Object.keys(b).includes('races')) bad.push(`${b.id}: races лежит в самой постройке`);
  }
  check('постройки поселения берут расы из «Построек городов»', !bad.length, bad.length ? bad.slice(0, 4).join('; ') : `${BUILDINGS.all().length} построек`);
}

// tiers, annexes, slots (docs/WORLD.md «Виды строк», «Слоты»): a tier is built in place of its base and counts as it; an annex
// wants its host in the town; a town holds TOWN_SLOTS of its own works, a tier in its base's place
{
  const t = {id: 1, people: 'humans', realm: 'r', built: ['shrine'], tier: 2, alive: true, i: 0, pop: 600, place: {}};
  const a = {towns: [t], realms: [{id: 'r'}]};
  const B = id => TOWN_BUILDINGS.get(id);
  const temple = canBuild(a, t, B('temple')), rites = !canBuild(a, t, B('warehouse'));
  t.built = ['temple', 'market'];
  const after = lineHas(t.built, 'shrine') && canBuild(a, t, B('warehouse')), noShrine = !canBuild(a, {...t, built: []}, B('temple'));
  t.tier = 1;
  t.built = Array(slotsOf(t).town).fill('market').map((x, k) => ['market', 'well', 'granary', 'cemetery', 'eldershall', 'shrine', 'inn', 'healerhut', 'loom', 'brewery', 'forge', 'tannery', 'foundry', 'charpit', 'jeweler', 'dryrack', 'firepit', 'tavern', 'alchemist', 'armory'][k]);
  const full = slotsUsed(t).town >= slotsOf(t).town && !canBuild(a, t, B('watchtower')) && canBuild(a, t, B('temple'));
  check('тир — на месте основы и считается ею; пристройка — при основе; слоты: полный город не ставит новых, а тир ставит',
    temple && rites && after && noShrine && full, `храм ${temple}, склады без рынка нельзя ${rites}, после храма и рынка ${after}, без святилища храма нет ${noShrine}, слоты ${slotsUsed(t).town}/${slotsOf(t).town}: ${full} (${TOWN_SLOTS.town.join('/')})`);
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
  check('расчёт: эльфийское поле даёт на четверть больше сырой еды; ювелир эльфов работает деревом, людской без материалов стоит',
    Math.abs(elf.made.raw - field.out.raw * 1.25 * row(elf, 'field').eff) < 1e-6 && row(elf, 'jeweler').eff > 0 && row(hum, 'jeweler').eff === 0,
    `сырой еды ${elf.made.raw.toFixed(0)} против ${hum.made.raw.toFixed(0)}, ювелир эльфов ${row(elf, 'jeweler').eff.toFixed(2)}, людей ${row(hum, 'jeweler').eff.toFixed(2)}`);
  // the recipes of a forge (docs/WORLD.md «Цепочки»): one rule over the metals — it works the metal that is in the store, dug at
  // home or brought in; two metals — they share its strength; none, it stands; the greenskins' forge works bought steel
  const forge = (imports, built = ['forge', 'charpit', 'woodcut'], people = 'humans') => { const E = townEconomy(null, {people, pop: 2000, built, slaves: 0}, 1, imports); return [Object.fromEntries(E.recipes.filter(x => x.of === built[0] && x.eff > 1e-6).map(x => [x.id.split(':')[1], Math.round(x.share * 100)])), E]; };
  const [s0] = forge(null), [s1, E1] = forge({iron: 400, leather: 40}), [s2] = forge({iron: 400, bronze: 400, leather: 40}), [f1, F1] = forge({steel: 200, leather: 40}, undefined, 'orcs'), [m1] = forge({mithril: 100, leather: 40});
  check('кузня: куёт тот металл, что на складе, два — пополам, без металла стоит; орки куют привозную сталь; мифрил — не людям',
    JSON.stringify(s0) === '{}' && JSON.stringify(s1) === '{"iron":100}' && s2.iron === 50 && s2.bronze === 50 && E1.made.tools > 0 && f1.steel === 100 && F1.made.arms > 0 && JSON.stringify(m1) === '{}',
    `без металла ${JSON.stringify(s0)}, железо ${JSON.stringify(s1)} → инструмента ${(E1.made.tools || 0).toFixed(0)}, два ${JSON.stringify(s2)}, орки ${JSON.stringify(f1)} → оружия ${(F1.made.arms || 0).toFixed(1)}, мифрил у людей ${JSON.stringify(m1)}`);
  // the mine gives metal, not ore: a human town with a mine and a forge makes tools of its own iron, with no smelter between
  const mine = townEconomy(null, {people: 'humans', pop: 2000, built: ['mineshaft', 'forge', 'charpit', 'woodcut', 'tannery', 'lodge'], slaves: 0}, 1);
  check('рудник даёт металл сразу, кузня куёт его в тот же сезон', mine.made.iron > 0 && mine.made.tools > 0 && !('ore_iron' in mine.made), `железа ${(mine.made.iron || 0).toFixed(0)}, инструмента ${(mine.made.tools || 0).toFixed(1)}`);
  // workers by tier: a building's hands are one number, however many recipes run
  const one = townEconomy(null, {people: 'orcs', pop: 2000, built: ['firepit', 'field'], slaves: 0}, 1), two = townEconomy(null, {people: 'humans', pop: 2000, built: ['firepit', 'field'], slaves: 0}, 1);
  check('рабочие — одно число по тиру, не по числу рецептов', one.jobs === two.jobs, `кострище ${one.jobs - TOWN_BUILDINGS.get('field').jobs}`);
  // the town's tools: one stock for all its works — a town with none works at half; with enough, at full
  const noTools = townEconomy(null, {people: 'humans', pop: 2000, built: ['ploughland'], slaves: 0}, 1), withTools = townEconomy(null, {people: 'humans', pop: 2000, built: ['ploughland'], slaves: 0}, 1, {tools: 100});
  check('инструмент — один запас города: без него все работы вполсилы, с ним — в полную', Math.abs(row(noTools, 'ploughland').eff - TF.soft) < 1e-6 && Math.abs(row(withTools, 'ploughland').eff - 1) < 1e-6 && noTools.short.tools > 0.99,
    `без ${row(noTools, 'ploughland').eff.toFixed(2)}, с ${row(withTools, 'ploughland').eff.toFixed(2)}, нехватка ${(noTools.short.tools || 0).toFixed(2)}`);
  // hands: few people — the ploughland (the humans' field) works at a share
  const thin = townEconomy(null, {people: 'humans', pop: 20, built: ['ploughland'], slaves: 0}, 1, {tools: 100});
  check('руки: людей мало — пашня работает на долю', Math.abs(row(thin, 'ploughland').staff - 10 / 30) < 0.02 && Math.abs(row(thin, 'ploughland').eff - row(thin, 'ploughland').staff) < 1e-6,
    `штат ${row(thin, 'ploughland').staff.toFixed(2)}, сила ${row(thin, 'ploughland').eff.toFixed(2)}`);
  // slaves: they take up to 80% of the places at 0.6 of a free hand; the rest free
  const orc = townEconomy(null, {people: 'orcs', pop: 1000, built: ['mineshaft'], slaves: 100}, 1);
  check('рабы: занимают до 80% мест и работают хуже вольных; остальное — вольные', Math.abs(row(orc, 'mineshaft').slaves - TF.slaves.share) < 1e-6 && Math.abs(orc.slavesIdle - (100 - TOWN_BUILDINGS.get('mineshaft').jobs * TF.slaves.share / TF.slaves.work)) < 1e-6,
    `доля рабов ${row(orc, 'mineshaft').slaves.toFixed(2)}, без дела ${orc.slavesIdle.toFixed(1)}`);
  // a taken building of another people works at half
  const taken = townEconomy(null, {people: 'elves', pop: 1000, built: ['mushrooms'], slaves: 0}, 1, {tools: 100});
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
      for (const g of Object.keys(t.econ.used)) if (!TOWN_GOODS.get(g).soft && !POOLS.fuel[g] && !POOLS.coin[g]) taken.add(g);   // (fuel: logs burn too; the mint's metal is bought)
    }
  }
  const missing = [...taken].filter(g => !made.has(g));
  check('эльфы в истории мира: их постройки кормят большую часть жителей, а всё жёсткое, что они тратят, где-то у них же делается', n > 0 && fed / pop > 0.5 && !missing.length,
    `городов ${n}, еда от построек ${(100 * fed / pop).toFixed(0)}% жителей; не делают: ${missing.join(', ') || 'всё делают'}`);
}

if (fail.length) process.exit(1);
