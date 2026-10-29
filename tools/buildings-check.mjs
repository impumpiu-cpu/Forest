// The table of the world's buildings (data/townBuildings.js) is the one truth about a building: who builds it, what its
// realm must have first, what it houses, employs, takes and gives, the metals it opens; the local map reads its races
// from it. `npm run buildings`.
import {TOWN_BUILDINGS, TOWN_GOODS, TOWN_WORKS, TOOL_USES, EFFECTS, goodPrice, metalBuildings, localPeoples, worksOf, upkeepOf} from '../src/data/townBuildings.js';
import {BUILDINGS} from '../src/data/buildings.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {MATERIALS} from '../src/data/balance/materials.js';
import {realmBuilt, realmWorks, canBuild} from '../src/atlas/towns.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const all = TOWN_BUILDINGS.all();
const isCount = v => v == null || (Number.isInteger(v) && v >= 0);

// the flows: whole numbers of people, fuel, cycles and head; goods that exist, amounts above zero; room is `house`,
// not an effect; a building that works by ways has its ways in TOWN_WORKS and no in/out of its own
{
  const bad = [];
  const goodsOk = (where, m) => { for (const [g, n] of Object.entries(m || {})) {
    if (!TOWN_GOODS.has(g)) bad.push(`${where}.${g} — нет такого блага`);
    if (!(typeof n === 'number' && n > 0)) bad.push(`${where}.${g} = ${n}`);
  } };
  for (const b of all) {
    for (const k of ['house', 'jobs', 'heat', 'fire', 'cycles', 'herd']) if (!isCount(b[k])) bad.push(`${b.id}: ${k} — не целое ≥ 0`);
    for (const k of ['in', 'out', 'repair']) goodsOk(`${b.id}: ${k}`, b[k]);
    if (b.quality && !(b.quality in TOOL_USES)) bad.push(`${b.id}: материал изделий ${b.quality}`);
    if (b.works && (b.in || b.out)) bad.push(`${b.id}: работает переделами, но в нём самом есть in/out`);
    if (b.works && !worksOf(b).length) bad.push(`${b.id}: работает переделами, а их в «Переделах построек» нет`);
    if ('housing' in (b.fx || {})) bad.push(`${b.id}: жильё в эффектах — оно задаётся полем house`);
    for (const k of Object.keys(b.fx || {})) if (!(k in EFFECTS)) bad.push(`${b.id}: эффект ${k}`);
  }
  for (const w of TOWN_WORKS.all()) {
    const b = TOWN_BUILDINGS.has(w.at) ? TOWN_BUILDINGS.get(w.at) : null;
    if (!b) bad.push(`передел ${w.id}: нет постройки ${w.at}`); else if (!b.works) bad.push(`передел ${w.id}: ${w.at} не отмечена works`);
    goodsOk(`передел ${w.id}: in`, w.in); goodsOk(`передел ${w.id}: out`, w.out);
    if (!Object.keys(w.out || {}).length) bad.push(`передел ${w.id}: ничего не даёт`);
    if (w.quality && !(w.quality in TOOL_USES)) bad.push(`передел ${w.id}: материал ${w.quality}`);
    if (!isCount(w.fire)) bad.push(`передел ${w.id}: жар не целое ≥ 0`);
  }
  // a building that makes tools or arms says of what
  for (const b of all) for (const w of worksOf(b)) if ((w.out.tools || w.out.arms || w.out.armor) && !w.quality) bad.push(`${w.id}: делает орудия или оружие, а материал не указан`);
  const used = new Set([...all.flatMap(b => [...worksOf(b).flatMap(w => [...Object.keys(w.in), ...Object.keys(w.out), ...(w.fire ? ['coal'] : [])]), ...Object.keys(upkeepOf(b))]),
    ...TOWN_GOODS.filter(g => g.start || g.need).map(g => g.id)]);
  for (const G of TOWN_GOODS.all()) {
    if (!(goodPrice(G.id) > 0)) bad.push(`благо ${G.id}: нет цены`);
    if (!used.has(G.id)) bad.push(`благо ${G.id}: его никто не тратит и не даёт`);
    if (!['base', 'made'].includes(G.kind)) bad.push(`благо ${G.id}: не сказано, базовое или продвинутое`);
  }
  const housed = all.filter(b => b.house > 0).length, working = all.filter(b => b.jobs > 0).length;
  check('потоки построек: числа целые, блага известны, у каждого блага есть цена и место, переделы сходятся', !bad.length,
    bad.length ? bad.slice(0, 5).join('; ') : `${all.length} построек, ${TOWN_WORKS.all().length} переделов: вмещают ${housed}, берут руки ${working}, благ ${TOWN_GOODS.all().length}`);
}

// raw food is not eaten: what people use up is made, and every raw food has a building that makes food of it
{
  const bad = [];
  for (const G of TOWN_GOODS.all()) {
    if (G.raw && G.need) bad.push(`${G.id}: сырое, а жители его тратят`);
    if (G.raw && !all.some(b => worksOf(b).some(w => w.in[G.id] && (w.out.food || w.out.stores || w.out.flour || w.out.drink || w.out.milk || w.out.beasts))))
      bad.push(`${G.id}: сырое, а переработать его негде`);
  }
  check('сырую еду не едят, и каждую есть где переработать', !bad.length, bad.join('; '));
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

if (fail.length) process.exit(1);
