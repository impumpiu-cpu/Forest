// Polities, persons and requirements (docs/WORLD.md «Державы и уклады», «Правители и личности», «Требования построек и
// рецептов»; atlas/polities.js, persons.js, succession.js, control.js, requirements.js): the scenarios of the overhaul,
// each on a copy of one world. A ruler sent off its office lives; a chief that falls with its beaten host leaves a horde
// that fights over the fire; an army beaten without its king kills no king; a seat burnt with the king elsewhere keeps
// him; a necromancer dead loses his dead and his vassals, a dwarven king dead keeps his golems; a rift closed with its
// prince alive ends both once; a dragon's polity ends with the dragon; settlers keep their races and ages; a scene applied
// twice changes nothing; a realm in mourning gets no ruler out of thin air. The requirements: 5 % of gnolls meets «≤ 5 %»,
// 80 % of humans fails «> 80 %», the town's share is not the realm's, an empty town meets no share, a captured town changes
// its uklad and keeps its buildings, the council and the builders ask the same checker. Part of `npm test`.
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {WORLD_PEOPLES, KIN} from '../src/data/peoples.js';
import {LAIRS} from '../src/data/lairs.js';
import {POLITIES} from '../src/data/polities.js';
import {OFFICES} from '../src/data/kingdom.js';
import {SPECIES} from '../src/data/species.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {C, ALL, ANY, needsOf, reqNeeds} from '../src/data/requirements.js';
import {meets, explain, reqText, reqErrors} from '../src/core/requirements.js';
import {townFacts, whyBuild} from '../src/atlas/requirements.js';
import {profileOf, rulerOf, ruledBy, polities, seatOf, holdingsOf, vassalsOf, lordOf, mayBend} from '../src/atlas/polities.js';
import {personOf, personDies, livingPersons, partyBeaten, townStormed, isAt, moveTo} from '../src/atlas/persons.js';
import {crownRuler, stepSuccession} from '../src/atlas/succession.js';
import {channelsOf} from '../src/atlas/control.js';
import {stepKingdom} from '../src/atlas/kingdom.js';
import {raise, freeVassals, leaderSlain} from '../src/atlas/leaders.js';
import {newLair, findSpot, revealLair} from '../src/atlas/lairs.js';
import {bend} from '../src/atlas/necro.js';
import {muster} from '../src/atlas/diplomacy.js';
import {seatFallen, realmTowns, capitalOf} from '../src/atlas/realms.js';
import {foundFrom, settleSpot} from '../src/atlas/peoples.js';
import {headsOf, groupSize, addHeads, takeHeads, sync} from '../src/atlas/population.js';
import {townKin, canBuild} from '../src/atlas/towns.js';
import {mulberry} from '../src/core/rng.js';
import {SEASONS_PER_YEAR} from '../src/data/atlas.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const say = () => {};
const lines = () => { const L = []; return Object.assign(t => L.push(typeof t === 'string' ? t : t?.text || ''), {L}); };

const base = generateAtlas({seed: 'polity', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const saved = saveAtlas(base, 'polity'), copy = () => loadAtlas(structuredClone(saved));
const realmsOf = (a, people) => a.realms.filter(r => r.fallen == null && r.people === people && realmTowns(a, r.id).length);
const withRuler = (a, people) => realmsOf(a, people).find(r => rulerOf(a, r)) || null;
const makeRuler = (a, r) => { const p = crownRuler(a, r, mulberry(3)); const O = OFFICES.get('ruler'); r.kingdom.court.ruler = {person: p.id, since: a.hist.year, until: a.hist.year + O.years[1]}; return p; };
const lairOf = (a, kind) => a.lairs.find(l => l.alive && l.kind === kind) || (() => { const L = LAIRS.get(kind), i = findSpot(a, L, mulberry(5), null); return i >= 0 ? newLair(a, L, i, mulberry(6), 0.8, a.hist.year - 40) : null; })();
const lead = (a, l) => { l.ancient = true; raise(a, l, mulberry(7)); return l.leader; };

// ── the world as polities: every realm and every lair is one, with a profile, a seat and holdings
{
  const a = base, all = polities(a);
  check('каждая держава и каждое логово — субъект с укладом, местом и владениями', all.length > 0 && all.every(h => h.profile && seatOf(a, h.obj) && holdingsOf(a, h.obj).length >= (h.kind === 'realm' ? 1 : 1)),
    `субъектов ${all.length}: держав ${all.filter(h => h.kind === 'realm').length}, логов ${all.filter(h => h.kind === 'lair').length}`);
  const kinds = {}; for (const h of all) kinds[h.profile.id] = (kinds[h.profile.id] || 0) + 1;
  check('профили по видам: башня — tower, стан — camp, дракон — dragon, зверь — den', Object.keys(kinds).length >= 3 && a.lairs.filter(l => l.alive && LAIRS.get(l.kind).domain).every(l => profileOf(l).id === 'tower') && a.lairs.filter(l => l.alive && LAIRS.get(l.kind).tribe).every(l => profileOf(l).id === 'camp'),
    Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', '));
  const rulers = all.filter(h => rulerOf(a, h.obj));
  check('правители — личности мира: живы, со своим телом и местом; каждая правит одним', rulers.length > 0 && rulers.every(h => { const p = rulerOf(a, h.obj); return p.alive && SPECIES.has(p.species) && p.at && ruledBy(a, p) === h.obj; }), `правителей ${rulers.length} из ${all.length}`);
  check('данники не образуют колец', a.lairs.every(v => !v.alive || v.lord == null || mayBend(a, v, {id: -1}) !== undefined) && (() => { const v = a.lairs.find(x => x.alive && x.lord != null); return !v || !mayBend(a, lordOf(a, v), v); })());
}

// ── 1. a ruler sent off its office lives; the office is filled again by the court, on its own
{
  const a = copy(), r = withRuler(a, 'humans') || realmsOf(a, 'humans')[0];
  if (!r) check('есть людская держава', false);
  else {
    const p = rulerOf(a, r) || makeRuler(a, r), h = r.kingdom.court.ruler;
    h.until = a.hist.year; a.hist.season = SEASONS_PER_YEAR - 1;
    stepKingdom(a, say);
    const now = rulerOf(a, r);
    check('правитель снят с поста: личность жива, трон занят заново или пуст — но не им', p.alive && !p.died && (now == null || now.id !== p.id), `${p.name} жив: ${p.alive}; на троне: ${now?.name || 'никого'}`);
  }
}

// ── 2. a chief falls with its beaten host: one death, the horde fights over the fire, the towns stay; the next spring a chief
//      rises or the realm breaks
{
  const a = copy(), r = realmsOf(a, 'orcs')[0];
  if (!r) check('есть орда', false);
  else {
    const chief = rulerOf(a, r) || makeRuler(a, r), seat = capitalOf(a, r.id), foe = a.towns.find(t => t.alive && t.realm !== r.id && t.realm != null);
    moveTo(chief, 'town', seat.id);
    seat.heads = {orc: [0, 2000, 0]}; sync(seat); seat.stock = {...(seat.stock || {}), stores: 500};
    const before = new Set((a.parties || []).map(p => p.id));
    muster(a, seat, foe, null, () => 0.5, say);
    const army = (a.parties || []).find(p => p.kind === 'army' && p.from === seat.id && !before.has(p.id));
    check('вождь орды идёт с войском (ruler.leads)', !!army && isAt(chief, 'party', army.id), army ? `войско ${army.men}, вождь ${JSON.stringify(chief.at)}` : 'войска нет');
    const towns0 = realmTowns(a, r.id).length, L = lines();
    partyBeaten(a, army, () => 0, L);   // the worst roll: it falls
    check('вождь пал в разбитом войске: одно событие, орда без вождя, города на месте', !chief.alive && chief.died?.how === 'battle' && !rulerOf(a, r) && r.contest != null && realmTowns(a, r.id).length === towns0 && L.L.some(t => /без вождя/.test(t)), L.L.join(' | '));
    a.hist.year++; a.hist.season = 0; const L2 = lines();
    stepSuccession(a, L2);
    const now = rulerOf(a, r);
    check('следующей весной орда поставила нового вождя или раскололась', (now && now.alive && now.id !== chief.id && isAt(now, 'town', capitalOf(a, r.id).id)) || L2.L.some(t => /не поделила власть/.test(t)), L2.L.join(' | ') || 'тихо');
  }
}

// ── 3. an army beaten without its king: no king dies
{
  const a = copy(), r = realmsOf(a, 'humans')[0];
  if (r) {
    const king = rulerOf(a, r) || makeRuler(a, r), seat = capitalOf(a, r.id), foe = a.towns.find(t => t.alive && t.realm !== r.id && t.realm != null);
    seat.heads = {human: [0, 2000, 0]}; sync(seat);
    const before = new Set((a.parties || []).map(p => p.id));
    muster(a, seat, foe, null, () => 0.5, say);
    const army = (a.parties || []).find(p => p.kind === 'army' && p.from === seat.id && !before.has(p.id));
    if (army) partyBeaten(a, army, () => 0, say);
    check('войско людей разбито без короля: король жив, он не ведёт войска', !!army && king.alive && isAt(king, 'town', seat.id), army ? `${king.name} жив: ${king.alive}, ${JSON.stringify(king.at)}` : 'войска нет');
  }
}

// ── 4. the seat burnt with the king elsewhere: the seat moves, the king lives and comes to the new seat
{
  const a = copy(), r = realmsOf(a, 'elves').find(x => realmTowns(a, x.id).length >= 2) || realmsOf(a, 'humans').find(x => realmTowns(a, x.id).length >= 2);
  if (!r) check('есть держава с двумя городами', false, 'нет');
  else {
    const king = rulerOf(a, r) || makeRuler(a, r), seat = capitalOf(a, r.id), other = realmTowns(a, r.id).find(t => t !== seat);
    moveTo(king, 'town', other.id);
    townStormed(a, seat, true, () => 0, say);   // the storm: nobody of the court is there but those at the seat
    seat.alive = false; seatFallen(a, seat, mulberry(1), say);
    const nowSeat = capitalOf(a, r.id);
    check('столица сожжена, король был в другом городе: столица перенесена, король жив', king.alive && nowSeat && nowSeat !== seat && r.fallen == null, `${king.name} жив: ${king.alive}; столица — ${nowSeat?.name}`);
    const king2 = rulerOf(a, r), court = Object.values(r.kingdom.court).filter(Boolean).map(h => personOf(a, h.person));
    townStormed(a, nowSeat, false, () => 0, say);   // stormed again, the king there now: it falls by the profile's `storm`
    check('штурм столицы с королём в ней: король гибнет по укладу, двор — с ним', !!king2 && !king2.alive && king2.died.how === 'storm' && court.every(p => !p.alive || !isAt(p, 'town', nowSeat.id)), `${king2?.name}: ${king2?.died?.how}`);
  }
}

// ── 5–6. a necromancer dead: his dead lose their master, his vassals go free, the tower stands; a king dead elsewhere leaves
//        the necromancer's hold as it was
{
  const a = copy(), tw = lairOf(a, 'necromancer');
  if (!tw) check('есть башня некроманта', false);
  else {
    const master = tw.leader || lead(a, tw);
    const L = LAIRS.get('wights'), i = findSpot(a, L, mulberry(9), {x: tw.x, y: tw.y});
    const v = i >= 0 ? newLair(a, L, i, mulberry(10), 0.6) : null; if (v) { v.lord = null; bend(a, v); }
    const ch = channelsOf(a, master);
    check('некромант держит мертвецов лично (канал undead), башня с хозяином держит данников', ch.some(c => c.kind === 'undead') && (!v || v.lord === tw.id), `каналы: ${ch.map(c => c.kind).join(', ')}; данник: ${v?.lord}`);
    // a king of a realm dies: the tower's hold stays
    const r = realmsOf(a, 'humans')[0]; if (r) { const k = rulerOf(a, r) || makeRuler(a, r); personDies(a, k, 'age', say); }
    check('король умер — хозяин башни и его мертвецы на месте', master.alive && tw.leader === master && (!v || v.lord === tw.id));
    const Ls = lines();
    personDies(a, master, 'age', Ls); freeVassals(a);
    check('некромант погиб: башня без хозяина, мертвецов не поднимают, данники вольны, башня стоит', !master.alive && !tw.leader && tw.masterless != null && (!v || v.lord == null) && tw.alive && Ls.L.some(t => /без хозяина/.test(t)), Ls.L.join(' | '));
  }
}

// ── 7. an elven summoner-king dead: nothing of the world's is lost (the summons are a thing of the local map)
{
  const a = copy(), r = realmsOf(a, 'elves')[0];
  if (r) {
    const king = rulerOf(a, r) || makeRuler(a, r), towns = realmTowns(a, r.id), tre = towns.reduce((s, t) => s + (t.treants || 0), 0);
    check('эльфийский владыка держит канал призыва', channelsOf(a, king).some(c => c.kind === 'summons'));
    personDies(a, king, 'age', say);
    check('владыка-призыватель погиб: древни и города державы на месте', !king.alive && towns.every(t => t.alive) && towns.reduce((s, t) => s + (t.treants || 0), 0) === tre);
  }
}

// ── 8–9. a dwarven king dead: the golems stay in their works and on guard; the forge gone, the made ones stay
{
  const a = copy(), r = realmsOf(a, 'dwarves').find(x => realmTowns(a, x.id).some(t => t.golems)) || realmsOf(a, 'dwarves')[0];
  if (r) {
    const king = rulerOf(a, r) || makeRuler(a, r), t = realmTowns(a, r.id).find(x => x.golems) || realmTowns(a, r.id)[0];
    t.golems ||= {auto: {}, guard: [], since: a.hist.year}; t.golems.guard.push('iron');
    const guard = t.golems.guard.length, auto = JSON.stringify(t.golems.auto);
    personDies(a, king, 'age', say);
    t.built = t.built.filter(id => id !== 'golemforge');
    check('король дварфов погиб, кузня снесена: големы в работе и на страже как были', !king.alive && t.golems.guard.length === guard && JSON.stringify(t.golems.auto) === auto, `стражей ${t.golems.guard.length}`);
  }
}

// ── 10. a rift closed with its prince alive and his demons out: both end once, nothing is removed twice
{
  const a = copy(), rift = lairOf(a, 'rift');
  if (!rift) check('есть разлом', false, 'разлому негде встать');
  else {
    const prince = rift.leader || lead(a, rift), n0 = (a.fallenLeaders || []).length;
    rift.alive = false; rift.died = a.hist.year;
    leaderSlain(a, rift.id, say);   // the lair gone takes its leader with it (stepLeaders does the same each spring)
    const first = !prince.alive && (a.fallenLeaders || []).length === n0 + 1;
    leaderSlain(a, rift.id, say); personDies(a, prince, 'lair', say);
    check('разлом закрыт при живом князе: князь сгинул с ним, и ровно один раз', first && (a.fallenLeaders || []).length === n0 + 1 && !rift.alive);
  }
}

// ── 11. a camp's chief dead: the camp lives on and waits for a new one; its vassals go free
{
  const a = copy(), camp = lairOf(a, 'goblins');
  if (!camp) check('есть стан гоблинов', false);
  else {
    const chief = camp.leader || lead(a, camp);
    const sub = lairOf(a, 'ogres'); if (sub && sub !== camp) sub.lord = camp.id;
    personDies(a, chief, 'age', say); freeVassals(a);
    check('вождь стана погиб: стан живёт и ждёт нового (heir), подчинённые вольны', !chief.alive && camp.alive && !camp.leader && camp.heirAt === a.hist.year + 1 && (!sub || sub.lord == null));
  }
}

// ── 12. a dragon dead: its polity ends; the lair is no more a living polity
{
  const a = copy(), L = LAIRS.get('dragon'), i = findSpot(a, L, mulberry(11), null);
  const dr = i >= 0 ? newLair(a, L, i, mulberry(12), 0.9, a.hist.year - 50) : null;
  if (!dr) check('есть логово дракона', false, 'дракону негде встать');
  else {
    const dragon = { ...dr.leader } ;
    dr.leader = null;
    // (a dragon raises no leader of its own: the dragon is its polity — a person made for it here)
    const {newPerson} = await import('../src/atlas/persons.js');
    dr.leader = newPerson(a, {name: 'Старый', title: ['Дракон', 'Дракона'], species: 'dragon', born: a.hist.year - 300, dies: a.hist.year + 100, at: {kind: 'lair', id: dr.id}});
    check('профиль дракона — solo, преемства нет', profileOf(dr).rule === 'solo' && profileOf(dr).ruler.vacancy === 'none');
    personDies(a, dr.leader, 'caravan', say);
    check('дракон погиб: держава кончилась (логово мертво), второй раз не умирает', !dr.alive && !dr.leader && personDies(a, personOf(a, a.persons.at(-1).id), 'age', say) === false);
  }
}

// ── 13. settlers keep their races and ages
{
  const a = copy(), t = a.towns.filter(t => t.alive && t.people === 'humans' && settleSpot(a, t) >= 0).sort((p, q) => q.pop - p.pop)[0];
  if (!t) check('есть людской город с местом рядом', false);
  else {
    const S = WORLD_PEOPLES.get('humans').settlers;
    addHeads(a, t, 'halfling', 200, 1); addHeads(a, t, 'human', 400, 0); addHeads(a, t, 'human', 400, 1);
    const H0 = JSON.parse(JSON.stringify(headsOf(a, t))), pop0 = t.pop;
    const made = foundFrom(a, t, mulberry(1), say);
    const G = made?.heads, shares = G && Object.entries(G).every(([race, b]) => Math.abs((b[0] + b[1] + b[2]) / S.pop - (H0[race][0] + H0[race][1] + H0[race][2]) / pop0) < 1e-6);
    check('поселенцы уходят как есть: те же расы и возрасты в тех же долях, числом settlers.pop', !!made && Math.abs(groupSize(G) - S.pop) < 1e-6 && shares && Math.abs(t.pop + S.pop - pop0) < 1e-6, made ? JSON.stringify(Object.fromEntries(Object.entries(G).map(([k, b]) => [k, b.map(x => Math.round(x))]))) : 'не основали');
  }
}

// ── 14–15. a scene applied twice changes nothing; a realm in mourning gets no ruler out of thin air
{
  const a = copy(), r = realmsOf(a, 'humans')[0];
  if (r) {
    const king = rulerOf(a, r) || makeRuler(a, r), n0 = livingPersons(a).length;
    const once = personDies(a, king, 'caravan', say), twice = personDies(a, king, 'caravan', say);
    check('одна сцена дважды: смерть короля применяется один раз', once && !twice && livingPersons(a).length === n0 - 1);
    a.hist.season = SEASONS_PER_YEAR - 1;
    stepKingdom(a, say);
    check('держава в трауре: двор не назначает правителя до срока, остальные должности живут', !rulerOf(a, r) && r.mourn > a.hist.year, `траур до ${r.mourn}, год ${a.hist.year}`);
    a.hist.year = r.mourn + 1; let got = null;
    for (let k = 0; k < 12 && !got; k++) { stepKingdom(a, say); got = rulerOf(a, r); a.hist.year++; }
    check('после траура двор назначает нового правителя — личность с телом и местом', !!got && got.alive && got.id !== king.id && SPECIES.has(got.species) && got.at?.kind === 'town', got ? `${got.name}, ${got.species}` : 'нет');
  }
}

// ── the requirements (data/requirements.js, core/requirements.js, atlas/requirements.js)
{
  const a = copy(), t = a.towns.find(x => x.alive && x.people === 'humans' && x.realm != null), r = a.realms.find(x => x.id === t.realm);
  t.heads = {human: [0, 800, 0], gnoll: [0, 50, 0], elf: [0, 150, 0]}; sync(t);   // 80 % humans, 5 % gnolls, 15 % elves
  const F = townFacts(a, t);
  check('ровно 5 % гноллов проходит «не больше 5 %»; ровно 80 % людей не проходит «больше 80 %»', meets(C('kinShare', 'gnoll', '<=', 0.05), F) && !meets(C('kinShare', 'human', '>', 0.8), F) && meets(C('kinShare', 'human', '>=', 0.8), F),
    `гноллы ${townKin(a, t).gnoll}, люди ${townKin(a, t).human}`);
  check('уклад читается с державы города; условие «уклад одно из»', meets(C('polity', '=', 'humans'), F) && meets(C('polity', 'in', ['humans', 'elves']), F) && !meets(C('polity', '=', 'dwarves'), F));
  const other = a.towns.find(x => x.alive && x.realm === t.realm && x !== t) || null;
  if (other) { other.heads = {human: [0, 100, 0]}; sync(other); check('доля в городе — не доля в державе: у соседа гноллов 0, у города 5 %', townFacts(a, other).get('kinShare', 'gnoll') === 0 && F.get('kinShare', 'gnoll') === 0.05); }
  const empty = {...t, id: -1, pop: 0, heads: {}, kin: {}};
  check('пустой город: доли нет — ни «≤ 5 %», ни «> 80 %» не выполняются', !meets(C('kinShare', 'gnoll', '<=', 0.05), townFacts(a, empty)) && !meets(C('kinShare', 'human', '>', 0.8), townFacts(a, empty)));
  check('неизвестная раса — доля 0 при живом городе; неизвестный факт — ошибка данных', F.get('kinShare', 'troll') === 0 && reqErrors(C('kinShare', 'troll', '<', 0.1)).length === 0 && reqErrors({fact: 'nothing', op: '=', value: 1}).length === 1);
  // the old short fields and the new `need` are one requirement; the checker explains
  const b = TOWN_BUILDINGS.get('throne'), req = needsOf(b), why = whyBuild(a, t, b);
  check('старые поля строки — требование: тронный зал просит столицу и жителей; объяснение называет каждое условие', !!req && why.length >= 2 && why.every(x => typeof x.text === 'string' && 'ok' in x), why.map(x => `${x.text} — ${x.ok ? 'да' : 'нет'}`).join('; '));
  const mixed = {id: 'test', tier: 0, need: ALL(C('polity', '=', 'humans'), C('kinShare', 'human', '>', 0.8), C('kinShare', 'gnoll', '<=', 0.05))};
  check('смешанное требование: уклад людской И людей > 80 % И гноллов ≤ 5 % — не выполнено при ровно 80 %', !meets(needsOf(mixed), F) && reqText(needsOf(mixed)).includes('%'), reqText(needsOf(mixed)));
  addHeads(a, t, 'human', 100, 1);
  check('…и выполнено при 82 %', meets(needsOf(mixed), townFacts(a, t)), `люди ${townKin(a, t).human}`);
  // a captured town: the uklad is the new owner's, the buildings stay
  const foe = a.realms.find(x => x.fallen == null && x.people !== t.people && realmTowns(a, x.id).length);
  if (foe) {
    const built = [...t.built]; t.realm = foe.id;
    check('захват города: уклад — нового владельца, постройки и люди на месте', townFacts(a, t).get('polity') === (WORLD_PEOPLES.get(foe.people).polity || foe.people) && JSON.stringify(t.built) === JSON.stringify(built) && t.pop > 0);
    t.realm = r.id;
  }
  // the builders and the council ask the same checker: canBuild agrees with the requirement for every building
  const agree = TOWN_BUILDINGS.all().every(b2 => { const ok = meets([needsOf(b2)].filter(Boolean), townFacts(a, t)); return ok || !canBuild(a, t, b2); });
  check('стройка и совет спрашивают одну проверку: что не проходит требование, того нельзя построить', agree);
  check('рецепт: req читается как требование («kin:ogre» — доля огров не меньше KIN.least)', JSON.stringify(reqNeeds(['kin:ogre'])) === JSON.stringify(ALL(C('kinShare', 'ogre', '>=', KIN.least))) && JSON.stringify(reqNeeds(['a|b'])) === JSON.stringify(ALL(ANY(C('opens', 'a', '=', true), C('opens', 'b', '=', true)))));
  const bad = TOWN_BUILDINGS.all().flatMap(b2 => reqErrors(needsOf(b2), b2.id));
  check('требования всех построек правильно сложены', bad.length === 0, bad.slice(0, 3).join('; '));
  check('таблица укладов: у каждого народа свой', WORLD_PEOPLES.all().every(P => POLITIES.has(P.polity || P.id)));
}

if (fail.length) { console.log(`\nНе прошло: ${fail.length}`); process.exit(1); }
console.log('\nДержавы, личности и требования: всё сходится');
