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
import {OFFICES, COURT} from '../src/data/kingdom.js';
import {SPECIES} from '../src/data/species.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {C, ALL, ANY, needsOf, reqNeeds} from '../src/data/requirements.js';
import {meets, explain, reqText, reqErrors} from '../src/core/requirements.js';
import {townFacts, whyBuild} from '../src/atlas/requirements.js';
import {profileOf, rulerOf, ruledBy, polities, seatOf, holdingsOf, vassalsOf, lordOf, mayBend} from '../src/atlas/polities.js';
import {personOf, personDies, livingPersons, partyBeaten, townStormed, isAt, moveTo} from '../src/atlas/persons.js';
import {sendArmy, armyLosses, returnArmy} from '../src/atlas/army.js';
import {crownRuler, stepSuccession} from '../src/atlas/succession.js';
import {channelsOf} from '../src/atlas/control.js';
import {stepKingdom} from '../src/atlas/kingdom.js';
import {raise, freeVassals, leaderSlain} from '../src/atlas/leaders.js';
import {newLair, findSpot, revealLair} from '../src/atlas/lairs.js';
import {bend, towerAt} from '../src/atlas/necro.js';
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
    // (a spot in this tower's own seat — beside it: two towers may stand close, and the nearer one takes the knee, atlas/necro.js
    // towerAt; the rot's best spot may lie by the other)
    const L = LAIRS.get('wights'); let i = findSpot(a, L, mulberry(9), {x: tw.x, y: tw.y});
    if (i >= 0 && towerAt(a, i % a.w, (i / a.w) | 0) !== tw) i = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => (tw.y + dy) * a.w + tw.x + dx).find(j => j >= 0 && j < a.n && !a.f.ocean[j] && towerAt(a, j % a.w, (j / a.w) | 0) === tw) ?? -1;
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
  const a = copy(), L = LAIRS.get('dragon');
  let i = findSpot(a, L, mulberry(11), null);
  if (i < 0) for (let j = 0; j < a.n && i < 0; j++) if (!a.f.ocean[j] && a.f.lake[j] < 0 && !a.towns.some(t => t.alive && Math.hypot(t.x - j % a.w, t.y - ((j / a.w) | 0)) < 6)) i = j;   // (any dry ground: the dragon's ground is not what is tested)
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
  check('рецепт: req читается как требование («kin:ogre» — доля огров не меньше KIN.least)', JSON.stringify(reqNeeds(['kin:ogre'])) === JSON.stringify(ALL(C('kinShare', 'ogre', '>=', KIN.least))) && JSON.stringify(reqNeeds(['people:elves|kin:ogre'])) === JSON.stringify(ALL(ANY(C('people', '=', 'elves'), C('kinShare', 'ogre', '>=', KIN.least)))));
  const bad = TOWN_BUILDINGS.all().flatMap(b2 => reqErrors(needsOf(b2), b2.id));
  check('требования всех построек правильно сложены', bad.length === 0, bad.slice(0, 3).join('; '));
  check('таблица укладов: у каждого народа свой', WORLD_PEOPLES.all().every(P => POLITIES.has(P.polity || P.id)));
}

// ── the review's scenarios (docs/MIGRATION.md «Ревизия»): the seams between the systems
{
  // F01: the levy is what the town has of grown ones; fewer than ARMY.minMen is no host
  const a = copy(), t = a.towns.find(x => x.alive && x.people === 'humans' && x.realm != null);
  t.heads = {human: [990, 10, 0]}; sync(t); t.stock = {...(t.stock || {}), stores: 100};
  const goal = a.towns.find(x => x.alive && x !== t).i;
  const before = new Set(a.parties.map(p => p.id)), p = sendArmy(a, t, goal, 100, {owner: t.realm});
  check('F01: войско не больше взрослых города; взрослых меньше minMen — войска нет, никто не взят', p == null && !a.parties.some(x => !before.has(x.id)) && Math.abs(t.pop - 1000) < 1e-6, `pop ${t.pop}`);
  t.heads = {human: [900, 40, 0]}; sync(t);
  const q = sendArmy(a, t, goal, 100, {owner: t.realm});
  check('F01: просили 100, взрослых 40 — войско из 40, men = men0 = взятые, город 900', !!q && q.men === 40 && q.men0 === 40 && Math.abs(groupSize(q.group) - 40) < 1e-6 && Math.abs(t.pop - 900) < 1e-6, q ? `men ${q.men}, pop ${t.pop}` : 'нет войска');
}
{
  // F02/F03: the scene's outcome for the world — the person's own fate, the party's losses, once
  const a = copy(), lair = a.lairs.find(l => l.alive && l.leader) || (() => { const l = lairOf(a, 'goblins'); lead(a, l); return l; })();
  const p0 = lair.leader, t = a.towns.find(x => x.alive);
  const {sendParty} = await import('../src/atlas/parties.js');
  const party = sendParty(a, 'leader', lair.i, t.i, {owner: lair.id, plan: 'raid', target: t.id, might: 3, label: 'тест', color: [1, 1, 1], leader: true});
  moveTo(p0, 'party', party.id);
  const K = {day: 1, members: [], fights: [{mode: 'local', foes: 10, killed: 4, boss: {fate: 'fled'}}], stats: {}, log: []};
  const thing = {party: party.id, person: p0.id, boss: {name: 'X'}, kind: 'tribe'};
  const {worldOutcome} = await import('../src/campaign/march.js');
  const m0 = party.might;
  worldOutcome(a, K, thing, true);
  check('F02: караван победил, главарь бежал — он жив; F03: отряд потерял долю павших и повернул домой, один раз', p0.alive && !p0.died && party.might < m0 && Math.abs(party.might - m0 * 0.6) < 1e-9 && party.state === 'home', `жив ${p0.alive}, сила ${m0} → ${party.might}, ${party.state}`);
  worldOutcome(a, K, thing, true);
  check('F03: тот же исход дважды — потери не удваиваются', Math.abs(party.might - m0 * 0.6) < 1e-9);
  K.fights.push({mode: 'local', foes: 10, killed: 2, boss: {fate: 'bound'}}); K.day = 2;
  worldOutcome(a, K, thing, true);
  check('F02: главарь связан, но в караване его нет — бежал: жив, не в плену, при логове', p0.alive && !p0.captive && lair.leader?.id === p0.id, `${JSON.stringify(p0.captive)}`);
  K.fights.push({mode: 'auto'}); K.day = 3;
  const l2 = lairOf(a, 'gnolls') || lairOf(a, 'ogres'); const p2 = l2 && (l2.leader || lead(a, l2));
  if (p2) { worldOutcome(a, K, {person: p2.id, boss: {name: 'Y'}}, false); check('F02: быстрый режим, караван проиграл — главарь стоит', p2.alive && !p2.captive); worldOutcome(a, K, {person: p2.id, boss: {name: 'Y'}}, true); check('F02: быстрый режим, караван победил — главарь мёртв (явное правило CAMPAIGN.scene.auto)', !p2.alive && p2.died.how === 'caravan'); }
}
{
  // F04: a world saved before the persons: its leaders and courts become persons and die as persons
  const leader = {name: 'Старый', title: ['Главарь', 'Главаря'], species: 'goblin', born: 0, dies: 20, deeds: 3};
  const l = {id: 1, kind: 'goblins', strength: 1, alive: true, leader};
  const a = {cfg: {seed: 'x'}, hist: {year: 100, season: 0}, lairs: [l], realms: [{id: 'r1', people: 'humans', capital: 1, kingdom: {court: {ruler: {name: 'Яр', f: false, since: 90, until: 110}, general: null}}}], towns: [{id: 1, alive: true, pop: 100, people: 'humans', heads: {human: [20, 60, 20]}}]};
  const {upgradePersons} = await import('../src/atlas/persons.js');
  upgradePersons(a);
  const {leaderFalls} = await import('../src/atlas/leaders.js');
  leaderFalls(a, l, 'age', say);
  check('F04: старый мир — главарь и двор стали личностями; главарь умирает по-новому', a.persons.length === 2 && l.leader == null && a.fallenLeaders?.length === 1 && a.realms[0].kingdom.court.ruler.person === 2 && personOf(a, 2).alive);
}
{
  // F05: a leader out with its band is at the band, not at the lair; home again at its lair
  const a = copy(), l = lairOf(a, 'goblins'), p = l.leader || lead(a, l);
  const {sendParty, goHome, stepParties} = await import('../src/atlas/parties.js');
  const {dangers} = await import('../src/campaign/land.js');
  const t = a.towns.find(x => x.alive);
  const party = sendParty(a, 'leader', l.i, t.i, {owner: l.id, plan: 'raid', target: t.id, might: 3, label: 'тест', color: [1, 1, 1], leader: true});
  moveTo(p, 'party', party.id);   // (leaderRole.setOut does this when the brain sends it: tested through the same move)
  const home = dangers(a, l.i, null).find(d => d.lair === l.id);
  check('F05: главарь в походе — у логова его нет (встреча без главаря), он при отряде', isAt(p, 'party', party.id) && home && home.person == null, JSON.stringify(home?.person));
  goHome(a, party); for (let k = 0; k < 6 && party.state !== 'gone'; k++) stepParties(a, mulberry(1), say);
  check('F05: отряд дома или пропал — главарь снова в логове', isAt(p, 'lair', l.id), JSON.stringify(p.at));
}
{
  // F06: a project begun re-checks what it asks; F07: the build need is not the work need
  const a = copy(), t = a.towns.find(x => x.alive && x.people === 'humans' && x.pop > 100 && x.realm != null);
  const b = TOWN_BUILDINGS.get('woodcut'), keep = {...b};
  b.need = C('pop', '>', 1e9); t.project = 'woodcut'; (t.works ||= {})['woodcut'] = {done: 1e9};
  t.wants ||= {feeds: 1, threat: 0};
  const {stepBuilds} = await import('../src/atlas/build.js');
  const n0 = t.built.filter(id => id === 'woodcut').length;
  stepBuilds(a, mulberry(1), say);
  check('F06: начатая стройка, требование утрачено — здание не вводится, работа ждёт', t.built.filter(id => id === 'woodcut').length === n0 && t.works?.woodcut, `${t.built.filter(id => id === 'woodcut').length} vs ${n0}`);
  delete b.need; Object.assign(b, keep);
  const E0 = (await import('../src/atlas/economy.js')).townEconomy(null, {people: 'humans', pop: 1000, heads: {human: [0, 790, 0], elf: [0, 210, 0]}, built: ['woodcut'], slaves: 0}, 1);
  b.need = C('kinShare', 'human', '>', 0.8);
  const E1 = (await import('../src/atlas/economy.js')).townEconomy(null, {people: 'humans', pop: 1000, heads: {human: [0, 790, 0], elf: [0, 210, 0]}, built: ['woodcut'], slaves: 0}, 1);
  b.workNeed = C('kinShare', 'human', '>', 0.8); delete b.need;
  const E2 = (await import('../src/atlas/economy.js')).townEconomy(null, {people: 'humans', pop: 1000, heads: {human: [0, 790, 0], elf: [0, 210, 0]}, built: ['woodcut'], slaves: 0}, 1);
  delete b.workNeed; Object.assign(b, keep);
  check('F07: порог стройки (need) не гасит работу стоящей постройки; порог работы (workNeed) — гасит', E0.made.wood > 0 && E1.made.wood === E0.made.wood && !(E2.made.wood > 0), `${E0.made.wood} / ${E1.made.wood} / ${E2.made.wood}`);
}
{
  // F08–F11: exact shares, the land's pull keeps the count, explain is meets, typos are errors
  const t = {people: 'humans', built: [], heads: {human: [0, 800.04, 0], gnoll: [0, 50.04, 0], elf: [0, 149.92, 0]}};
  sync(t);
  const f = townFacts({realms: [], towns: []}, t);
  check('F08: доли читаются из точных чисел, не из округлённых: 80,004 % > 80 %, 5,004 % не ≤ 5 %', meets(C('kinShare', 'human', '>', 0.8), f) && !meets(C('kinShare', 'gnoll', '<=', 0.05), f));
  const a = copy(); let drift = 0;
  for (const x of a.towns.filter(o => o.alive).slice(0, 40)) { const n = x.pop; (await import('../src/atlas/population.js')).pullToLand(a, x); drift = Math.max(drift, Math.abs(x.pop - n)); }
  check('F09: тяга земли не меняет число жителей (доли земли точные)', drift < 1e-6, `дрейф ${drift}`);
  const req = ANY(ALL(C('pop', '>', 0), C('pop', '<', 0)), ALL(C('pop', '<', 0), C('pop', '>', 0))), src = {get: () => 10};
  check('F10: объяснение вложенных И/ИЛИ совпадает с проверкой', meets(req, src) === explain(req, src)[0].ok && meets(req, src) === false);
  check('F11: опечатка в расе, чужое значение уклада, «больше» у перечисления — ошибки данных', reqErrors({fact: 'kinShare', arg: 'typo_missing_species', op: '<=', value: 0.05}).length === 1 && reqErrors({fact: 'polity', op: '=', value: 123}).length === 1 && reqErrors(C('polity', '>', 'humans')).length === 1 && reqErrors(C('kinShare', 'troll', '<', 0.1)).length === 0);
}
{
  // F12: nobody is expelled into nothing; A4: a person named out of a town leaves its count; A3: the art holds the channel
  const a = copy(), t = a.towns.find(x => x.alive && x.people === 'dwarves');
  for (const o of a.towns) if (o !== t) o.alive = false;
  addHeads(a, t, 'human', 100, 1); const p0 = t.pop;
  (await import('../src/atlas/diplomacy.js')).stepDiplomacy(a, mulberry(1), say, () => 0);
  check('F12: выселять некуда — чужаки остаются, жители не пропадают', Math.abs(t.pop - p0) < 1e-6, `${p0} → ${t.pop}`);
  const b = copy(), r = realmsOf(b, 'humans')[0], seat = capitalOf(b, r.id), n0 = seat.pop, named0 = seat.book?.named || 0;   // (the book may already hold this year's named: count from it)
  for (const o of Object.keys(r.kingdom.court)) r.kingdom.court[o] = null;
  makeRuler(b, r);   // (crownRuler names it out of the seat)
  check('A4: именованный ко двору — из счёта города: жителей на одного меньше, в книге «ко двору»', Math.abs(seat.pop - (n0 - 1)) < 1e-6 && seat.book?.named === named0 + 1, `${n0} → ${seat.pop}, в книге ${named0} → ${seat.book?.named}`);
  const tw = lairOf(b, 'necromancer');
  if (tw) {
    const master = tw.leader || lead(b, tw);
    const {able, heldDead} = await import('../src/atlas/control.js');
    check('A3: хозяин башни держит мертвецов искусством: без некромантии — не держит, канала нет', able(master, 'undead') && heldDead(tw) && (() => { master.abilities = []; const held = heldDead(tw) || channelsOf(b, master).length > 0; master.abilities = ['necromancy']; return !held; })());
  }
}

// ── the second review (N01–N10): the scene's counts, the captive person, the court's candidates, the validator
{
  const a = copy(), t = a.towns.find(x => x.alive && x.people === 'humans' && x.realm != null), goal = a.towns.find(x => x.alive && x !== t).i;
  t.heads = {human: [0, 400, 0]}; sync(t); t.stock = {...(t.stock || {}), herbs: 50, stores: 100}; t.warBeasts = {list: {varg: 100}, men: 100}; t.golems = {auto: {}, guard: ['iron', 'iron'], since: 0};
  const p = sendArmy(a, t, goal, 100, {owner: t.realm}); p.warBeasts = {varg: 100}; p.golems = ['iron', 'iron']; p.kit.herbs = 10;
  const {worldOutcome} = await import('../src/campaign/march.js');
  const K = {day: 1, members: [], stats: {}, fights: [{mode: 'local', foes: 100, killed: 10, taken: 2, led: 2}]};
  worldOutcome(a, K, {party: p.id, kind: 'army'}, true);
  check('N01–N03: павшие и уведённые сцены — ровно столько из отряда, травы мёртвых не лечат; N05: звери и големы той же долей', Math.abs(p.men - 88) < 1e-9 && p.kit.herbs === 10 && p.warBeasts.varg === 88 && p.golems.length === 2 && Math.abs(groupSize(p.group) - 100) < 1e-6 && p.taken === 2, `men ${p.men}, варгов ${p.warBeasts.varg}, трав ${p.kit.herbs}`);
  check('N04: разбитый караваном отряд поворачивает домой', p.state === 'home' || p.state === 'gone', p.state);
  K.fights.push({mode: 'local', foes: 10, killed: 8, taken: 0}); K.day = 2; p.state = 'go';
  worldOutcome(a, K, {party: p.id, kind: 'army'}, false);
  check('N03: караван проиграл — подтверждённые павшие всё равно списаны', Math.abs(p.men - 80) < 1e-9 && p.state === 'go', `men ${p.men}`);
}
{
  // N06: the bound person is the caravan's captive member; its escape frees it, back at the head of its lair if that waits
  const a = copy(), l = lairOf(a, 'goblins'), p = l.leader || lead(a, l);
  const {worldOutcome} = await import('../src/campaign/march.js');
  const {memberFate} = await import('../src/atlas/persons.js');
  const K = {day: 1, members: [], stats: {}, fights: [{mode: 'local', foes: 5, killed: 0, taken: 0, boss: {fate: 'bound'}}], log: []};
  worldOutcome(a, K, {person: p.id, boss: {name: p.name}}, true);
  check('N06: связан, но в караван не взят (нет места) — считается бежавшим: жив, свободен, при логове', p.alive && !p.captive && l.leader?.id === p.id);
  const m = {id: 1, name: p.name, race: p.species, person: p.id, alive: true, captive: {since: 1, bonds: 'rope'}};
  K.members.push(m); K.day = 2; K.fights.push({mode: 'local', foes: 5, killed: 0, taken: 1, boss: {fate: 'bound'}});
  worldOutcome(a, K, {person: p.id, boss: {name: p.name}}, true);
  check('N06: связан и уведён — пленник каравана, логово без главаря, статистика +1', p.alive && p.captive?.by === 'caravan' && !l.leader && K.stats.leaders === 1);
  worldOutcome(a, K, {person: p.id, boss: {name: p.name}}, true);
  check('N06: тот же исход дважды — ничего', K.stats.leaders === 1 && p.captive?.by === 'caravan');
  m.alive = false; m.left = {escaped: true}; memberFate(a, m, 'escaped');   // (campaign/captives.js escaped does this)
  check('N06: бежал из каравана — свободен и снова во главе своего логова', p.alive && !p.captive && l.leader?.id === p.id && isAt(p, 'lair', l.id), JSON.stringify(p.at));
}
{
  // N07: an office is filled only from a grown one of the race at the seat; a holder off its office goes back into the crowd
  const a = copy(), r = realmsOf(a, 'humans')[0], seat = capitalOf(a, r.id);
  for (const o of Object.keys(r.kingdom.court)) r.kingdom.court[o] = null;
  seat.heads = {human: [100, 0, 0], elf: [0, 50, 0]}; sync(seat); const n0 = seat.pop;
  a.hist.season = SEASONS_PER_YEAR - 1;
  stepKingdom(a, say);
  check('N07: при столице нет взрослых людей — должности пусты, жителей столько же', Object.values(r.kingdom.court).every(h => !h) && Math.abs(seat.pop - n0) < 1e-6 && crownRuler(a, r, mulberry(1)) == null, `${n0} → ${seat.pop}`);
  seat.heads = {human: [100, 10, 0]}; sync(seat);
  for (let k = 0; k < 8 && !Object.values(r.kingdom.court).some(Boolean); k++) { a.hist.year++; stepKingdom(a, say); }
  const held = Object.values(r.kingdom.court).filter(Boolean).length;
  check('N07: взрослые есть — должности заняты, каждый взят из счёта', held > 0 && Math.abs(seat.pop - (110 - held)) < 1e-6, `занято ${held}, жителей ${seat.pop}`);
  const h = Object.values(r.kingdom.court).find(Boolean), hp = personOf(a, h.person); h.until = a.hist.year;
  stepKingdom(a, say);
  check('N07: срок вышел — обратно в счёт города, личность больше не ведётся отдельно', hp.alive && hp.inCount && Math.abs(seat.pop - (110 - Object.values(r.kingdom.court).filter(Boolean).length)) < 1e-6 && !livingPersons(a).includes(hp));
}
{
  // N08–N10: the validator holds the tree; explain reads a list as meets does; an unknown scope is an error and not met
  const src = {get: () => 100};
  check('N08: группа не списком, пустая группа, лишние поля — ошибки; проверка не падает', reqErrors({all: {fact: 'pop', op: '>', value: 0}}).length === 1 && reqErrors({all: []}).length === 1 && reqErrors({fact: 'pop', op: '>', value: 0, extra: 1}).length === 1 && meets({all: {fact: 'pop', op: '>', value: 0}}, src) === false);
  check('N09: область только town/realm; чужая — ошибка и не выполняется', reqErrors({fact: 'built', arg: 'field', op: '=', value: true, scope: 'galaxy'}).length === 1 && meets({fact: 'built', arg: 'field', op: '=', value: true, scope: 'galaxy'}, {get: () => true}) === false);
  const r = {any: [[C('pop', '>', 0), C('pop', '<', 0)]]};
  check('N10: список внутри группы — ошибка; читается как «все»: проверка и объяснение сходятся', reqErrors(r).length === 1 && meets(r, src) === explain(r, src)[0].ok);
}

// ── the third review (B01–B04): the chains after the change — the levy home, the office's end on the march, the unbound
//    captive's one place, the bound the caravan had no room for
{
  // B01: a levy of two races, three kinds of loss, home twice: the town's count, the fallen and the led away add up
  const a = copy(), t = a.towns.find(x => x.alive && x.people === 'humans' && x.realm != null), goal = a.towns.find(x => x.alive && x !== t).i;
  t.heads = {human: [0, 600, 0], halfling: [0, 400, 0]}; sync(t); t.book = null;
  const p = sendArmy(a, t, goal, 100, {owner: t.realm}), G0 = structuredClone(p.group);
  armyLosses(p, 0.1, mulberry(2));                                        // the road's loss: 90 left (no battle, no herbs)
  const {worldOutcome} = await import('../src/campaign/march.js');
  const K = {day: 1, members: [], stats: {}, fights: [{mode: 'local', foes: 90, killed: 10, taken: 4, led: 2}]};
  worldOutcome(a, K, {party: p.id, kind: 'army'}, true);                  // a scene: 10 dead, 2 led away (2 bound got away)
  check('B01: состав войска — набор как взят, не режется потерями; потери только в men', Math.abs(groupSize(p.group) - 100) < 1e-6 && Math.abs(p.men - 78) < 1e-9, `group ${groupSize(p.group)}, men ${p.men}`);
  returnArmy(a, p); const pop1 = t.pop, H = headsOf(a, t);
  const want = r => (r === 'human' ? 600 : 400) - G0[r][1] * (1 - 0.78);
  check('B01: домой — 900 + 78 = 978; по расам — каждая раса набора меньше на свою долю ушедших', Math.abs(pop1 - 978) < 1e-6 && Math.abs(H.human[1] - want('human')) < 1e-6 && Math.abs(H.halfling[1] - want('halfling')) < 1e-6, `${pop1}; людей ${H.human[1]}, полуросликов ${H.halfling[1]}`);
  check('B01: в книге — на войне 20, уведено 2: 978 + 20 + 2 = 1000', Math.abs((t.book?.war || 0) - 20) < 0.11 && Math.abs((t.book?.taken || 0) - 2) < 0.11, JSON.stringify(t.book));
  returnArmy(a, p);
  check('B01: второе возвращение ничего не добавляет', Math.abs(t.pop - pop1) < 1e-9);
}
{
  // B02: the office's years run out while its holder is with the host: it is not lost — it stays apart, and goes into the count of
  // the town it steps off at (home, or the nearest if the host is stranded); the count is one owner at a time
  const {returnArmy: back, sendArmy: send} = await import('../src/atlas/army.js');
  const {stranded, whereIs, backToCrowd} = await import('../src/atlas/persons.js');
  for (const way of ['home', 'stranded', 'seat burnt']) {
    const a = copy(), r = realmsOf(a, 'humans').find(x => realmTowns(a, x.id).length >= 2) || realmsOf(a, 'humans')[0], seat = capitalOf(a, r.id), goal = a.towns.find(x => x.alive && x !== seat).i;
    seat.heads = {human: [0, 500, 0]}; sync(seat); seat.book = null;
    const hp = makeRuler(a, r), army = send(a, seat, goal, 50, {owner: r.id}); moveTo(hp, 'party', army.id);
    const n0 = seat.pop; r.kingdom.court.ruler.until = a.hist.year; a.hist.season = SEASONS_PER_YEAR - 1;
    const fill = COURT.fill; COURT.fill = 0; stepKingdom(a, say); COURT.fill = fill;   // (no other office filled from the seat this year: the count is the ruler's alone)
    const apart = hp.alive && !hp.inCount && hp.crowd && isAt(hp, 'party', army.id) && livingPersons(a).includes(hp) && !r.kingdom.court.ruler?.person && Math.abs(seat.pop - n0) < 1e-6;
    check(`B02 (${way}): срок вышел в походе — пост свободен, личность жива и ведётся отдельно при отряде, в счёт города никто не добавлен`, apart, `${JSON.stringify(hp.at)}, inCount ${!!hp.inCount}, pop ${n0} → ${seat.pop}`);
    let to = seat;
    if (way === 'home') back(a, army);
    else if (way === 'stranded') { army.state = 'gone'; stranded(a, army); }
    else { seat.alive = false; back(a, army); to = whereIs(a, hp) || a.towns.find(x => x.alive && x.realm === r.id); }
    const expect = way === 'home' ? n0 + army.men + 1 : way === 'stranded' ? n0 + 1 : null;
    check(`B02 (${way}): сошёл в городе — в его счёте, личность больше не ведётся отдельно (ровно один раз)`, hp.alive && hp.inCount && !hp.crowd && !livingPersons(a).includes(hp) && (expect == null ? to && to.alive : Math.abs(seat.pop - expect) < 1e-6), `pop ${seat.pop}${expect != null ? ` (ждали ${expect})` : ''}, ${JSON.stringify(hp.at)}`);
    check(`B02 (${way}): повторный возврат в счёт — ничего`, backToCrowd(a, hp, to) === false);
  }
  // age and the office's end in one spring: death wins, no count is touched
  const a = copy(), r = realmsOf(a, 'humans')[0], seat = capitalOf(a, r.id); seat.heads = {human: [0, 500, 0]}; sync(seat);
  const hp = makeRuler(a, r), n0 = seat.pop; hp.dies = a.hist.year; r.kingdom.court.ruler.until = a.hist.year; a.hist.season = 0;
  const {stepPersons} = await import('../src/atlas/persons.js'); stepPersons(a, say); stepKingdom(a, say);
  check('B02: смерть по возрасту и конец срока в одну весну — умер один раз, в счёт не возвращён, пост пуст', !hp.alive && !hp.inCount && Math.abs(seat.pop - n0) < 1e-6 && !r.kingdom.court.ruler?.person);
}
{
  // B03: a captive unbound walks on with the caravan — the person is with the caravan, not at its lair; it is back at the lair only
  // when it leaves the caravan (let go at the end, or escaped); a death after the unbinding is one death
  const {freedomEvening, escaped} = await import('../src/campaign/captives.js');
  const {memberFate} = await import('../src/atlas/persons.js');
  for (const way of ['freed', 'escaped', 'dead']) {
    const a = copy(), l = lairOf(a, 'goblins'), p = l.leader || lead(a, l);
    const {worldOutcome} = await import('../src/campaign/march.js');
    const m = {id: 2, name: p.name, gender: 'm', race: p.species, person: p.id, alive: true, role: 'captive', core: false, hp: 1, gear: {hand: [], body: null}, captive: {since: 1, bonds: 'rope', resigned: true, service: 10}};
    const vouch = {id: 1, name: 'Поручитель', alive: true, role: 'knight', core: true, master: true, hp: 1, gear: {hand: [], body: null}};
    const K = {day: 3, members: [vouch, m], stats: {}, cargo: {}, beasts: [], vehicles: [], fights: [{mode: 'local', foes: 5, killed: 0, taken: 1, led: 1, boss: {fate: 'bound'}}], log: []};
    worldOutcome(a, K, {person: p.id, boss: {name: p.name}}, true);
    freedomEvening(a, K, () => {});
    const one = m.alive && m.role === 'former' && !m.captive && p.alive && !p.captive && p.at?.kind === 'caravan' && !l.leader;
    check(`B03 (${way}): путы сняты — спутник каравана; личность при караване, логово всё ещё без главаря`, one, `${m.role}, ${JSON.stringify(p.at)}, главарь ${l.leader?.name ?? '—'}`);
    freedomEvening(a, K, () => {});
    check(`B03 (${way}): вечер ещё раз — ничего не меняется`, K.stats.freed === 1 && p.at?.kind === 'caravan' && !l.leader);
    if (way === 'freed') { m.alive = false; m.left = {day: 9}; memberFate(a, m, 'freed'); check('B03: отпущен из каравана — свободен и во главе своего логова', p.alive && !p.captive && l.leader?.id === p.id && isAt(p, 'lair', l.id)); }
    if (way === 'escaped') { escaped(a, K, m, 'бежал', () => {}); check('B03: бежал уже без пут — личность в логове, в караване его нет', !m.alive && l.leader?.id === p.id && isAt(p, 'lair', l.id)); }
    if (way === 'dead') { m.alive = false; memberFate(a, m, 'dead'); check('B03: погиб спутником — одна смерть, логово без главаря', !p.alive && !l.leader && a.persons.filter(x => x.id === p.id).length === 1); }
  }
}
{
  // B04: the caravan's room is short: the bound it could not take are not lost to the host — only those really led away
  const {takeFromCamp} = await import('../src/campaign/captives.js');
  const {CAPTIVE} = await import('../src/data/captives.js');
  const a = copy(), K = {day: 1, members: [], stats: {}, nextMember: 0};
  for (let i = 0; i < CAPTIVE.max; i++) K.members.push({id: i + 1, name: `П${i}`, alive: true, role: 'captive', captive: {since: 0, bonds: 'rope'}});
  const bound = [{name: 'A', race: 'orc', hp: 1, bonds: 'rope'}, {name: 'B', race: 'orc', hp: 1, bonds: 'rope'}];
  const got0 = takeFromCamp(a, K, {taken: bound}, () => {});
  K.members[0].alive = false;
  const got1 = takeFromCamp(a, K, {taken: bound}, () => {});
  check('B04: мест нет — никого не взяли; одно место — взят один, первый из связанных', got0.length === 0 && got1.length === 1 && got1[0].name === 'A', `${got0.length}, ${got1.length}`);
  const t = a.towns.find(x => x.alive && x.people === 'humans' && x.realm != null), goal = a.towns.find(x => x.alive && x !== t).i;
  t.heads = {human: [0, 400, 0]}; sync(t);
  const p = sendArmy(a, t, goal, 100, {owner: t.realm});
  const {worldOutcome} = await import('../src/campaign/march.js');
  worldOutcome(a, {day: 1, members: [], stats: {}, fights: [{mode: 'local', foes: 100, killed: 0, taken: 2, led: got1.length}]}, {party: p.id, kind: 'army'}, true);
  check('B04: связаны двое, уведён один — войско меньше на одного; второй ушёл', Math.abs(p.men - 99) < 1e-9 && p.taken === 1, `men ${p.men}`);
}

// ── the fourth review (C01–C02): the named person at a host's head is counted apart — the scene's one body of it is not a man of
//    the host too; a person walking with the caravan dies of age as a member, once
{
  const {worldOutcome} = await import('../src/campaign/march.js');
  const {returnArmy: back} = await import('../src/atlas/army.js');
  const cases = [['погиб только вождь', {fate: 'dead', killed: 1, led: 0, member: false}, 100, false],
    ['пленён только вождь', {fate: 'bound', killed: 0, led: 1, member: true}, 100, true],
    ['погиб боец, вождь жив', {fate: 'stood', killed: 1, led: 0, member: false}, 99, true],
    ['погибли оба', {fate: 'dead', killed: 2, led: 0, member: false}, 99, false],
    ['вождь связан, но не уведён', {fate: 'bound', killed: 0, led: 0, member: false}, 100, true]];
  for (const [name, c, menAfter, aliveAfter] of cases) {
    const a = copy(), r = realmsOf(a, 'orcs')[0], seat = capitalOf(a, r.id), goal = a.towns.find(x => x.alive && x !== seat).i;
    seat.heads = {orc: [0, 1000, 0]}; sync(seat); seat.book = null;
    const chief = makeRuler(a, r), army = sendArmy(a, seat, goal, 100, {owner: r.id}); moveTo(chief, 'party', army.id);
    const total = () => seat.pop + Math.max(0, army.men) + (chief.alive && !chief.captive ? 1 : 0);   // (a captive chief is the caravan's: gone from the realm's count, as the led away are)
    const K = {day: 1, log: [], members: c.member ? [{id: 1, name: chief.name, alive: true, captive: {since: 1}, person: chief.id}] : [], stats: {}, fights: [{mode: 'local', foes: 101, killed: c.killed, taken: c.led + (c.fate === 'bound' ? 1 : 0), led: c.led, boss: {came: true, fate: c.fate}}]};
    worldOutcome(a, K, {party: army.id, kind: 'army', person: chief.id, boss: {name: chief.name}}, true);
    const lost = 1000 - total();
    check(`C01 (${name}): бойцов ${menAfter}, вождь ${aliveAfter ? 'жив' : 'мёртв'}, из тысячи не стало ровно столько, сколько ушло`, Math.abs(army.men - menAfter) < 1e-9 && chief.alive === aliveAfter && Math.abs(lost - (c.killed + c.led)) < 1e-9, `men ${army.men}, вождь ${chief.alive}, пленник ${!!chief.captive}, недостаёт ${lost}`);
    back(a, army);
    check(`C01 (${name}): войско дома — город + войско + вождь + книга = 1000`, Math.abs(seat.pop + (chief.alive && !chief.inCount && !chief.captive ? 1 : 0) + (seat.book?.war || 0) + (seat.book?.taken || 0) + (c.fate === 'dead' ? 1 : 0) + (chief.captive ? 1 : 0) - 1000) < 0.11, `pop ${seat.pop}, книга ${JSON.stringify(seat.book)}`);
  }
}
{
  const {stepPersons, personOf: pOf} = await import('../src/atlas/persons.js');
  const {agePersons} = await import('../src/campaign/index.js');
  const {worldOutcome} = await import('../src/campaign/march.js');
  for (const way of ['в плену', 'без пут']) {
    const a = copy(), l = lairOf(a, 'goblins'), p = l.leader || lead(a, l);
    const m = {id: 1, name: p.name, gender: 'm', race: p.species, alive: true, hp: 1, role: 'captive', person: p.id, captive: {since: 1, bonds: 'rope'}, gear: {hand: [], body: null}};
    const K = {day: 2, members: [m], stats: {}, cargo: {}, beasts: [], vehicles: [], log: [], fights: [{mode: 'local', foes: 5, killed: 0, taken: 1, led: 1, boss: {came: true, fate: 'bound'}}]};
    a.campaign = K;
    worldOutcome(a, K, {person: p.id, boss: {name: p.name}}, true);
    if (way === 'без пут') { const {memberFate} = await import('../src/atlas/persons.js'); m.captive = null; m.role = 'former'; m.former = {since: 2}; memberFate(a, m, 'unbound'); }
    p.dies = a.hist.year; a.hist.season = 0;
    stepPersons(a, say);
    check(`C02 (${way}): весна мира не трогает личность при караване — жива, участник жив`, p.alive && m.alive && p.at?.kind === 'caravan');
    agePersons(a, K);
    check(`C02 (${way}): караван ведёт её смерть: участник умер от старости, личность мертва, одна запись`, !m.alive && m.died?.why?.includes('старости') && !p.alive && p.died?.how === 'caravan' && a.persons.filter(x => x.id === p.id).length === 1, `${m.died?.why}, ${JSON.stringify(p.died)}`);
    agePersons(a, K); stepPersons(a, say);
    check(`C02 (${way}): повтор — ничего`, !m.alive && !p.alive && a.persons.filter(x => x.id === p.id).length === 1);
  }
  // sold to a town: the person is the town's, the member's record is closed — the world's spring takes it, the record stays closed
  const a = copy(), l = lairOf(a, 'goblins'), p = l.leader || lead(a, l), t = a.towns.find(x => x.alive);
  const {memberFate, personCaptured} = await import('../src/atlas/persons.js');
  personCaptured(a, p, 'caravan', () => {});
  const m = {id: 1, name: p.name, alive: false, left: {sold: true}, person: p.id}; memberFate(a, m, 'sold', t);
  p.dies = a.hist.year; a.hist.season = 0; stepPersons(a, say);
  check('C02 (продан в город): личность при городе умирает весной мира; запись каравана закрыта и не оживает', !p.alive && p.died?.how === 'age' && !m.alive);
}

// ── the founding bands keep apart (TOWN_LIFE.apart): the first town of each elder people and the second of its own are no nearer
//    than `others` / `own` of the coarse grid's width to one another — the elves and the dwarves do not all land in one corner
{
  const a = copy(), {TOWN_LIFE: T} = await import('../src/data/peoples.js'), F = a.fauna;
  const elder = WORLD_PEOPLES.all().filter(P => P.era === 'elder').map(P => P.id), first = {};
  for (const t of a.towns) if (elder.includes(t.people) && (first[t.people] ||= []).length < 2) first[t.people].push(t);
  const pts = Object.values(first).flat(); let worst = Infinity, pair = '';
  for (const t of pts) for (const u of pts) if (t !== u) { const d = Math.hypot(t.x - u.x, t.y - u.y) / F.c / F.W, lim = t.people === u.people ? T.apart.own : T.apart.others; if (d - lim < worst - 0) { worst = d - lim; pair = `${t.people} ${Math.round(t.x)},${Math.round(t.y)} — ${u.people} ${Math.round(u.x)},${Math.round(u.y)}`; } }
  check('первые города древних народов стоят врозь: не ближе apart.own / apart.others ширины сетки', pts.length >= 4 && worst >= -1e-9, `${pts.length} городов, худшая пара ${pair} (${worst >= 0 ? 'в норме' : 'ближе на ' + Math.round(-worst * F.W) + ' кл. сетки'})`);
}

// ── the strangers' coming (atlas/diplomacy.js mingle, atlas/demography.js migrate): the operation never passes DIPLOMACY.mingleMax
//    and makes nobody — the cap is on the coming; what the standing do afterwards (atlas/demography.js lifeYear) is their own
//    races' births and deaths, and no cap on it is claimed (tools/atlas-check.mjs checks only that the count stays a count)
{
  const {mingle} = await import('../src/atlas/diplomacy.js');
  const {migrate} = await import('../src/atlas/demography.js');
  const {DIPLOMACY} = await import('../src/data/diplomacy.js');
  const {shareOfPeople} = await import('../src/atlas/population.js');
  const a = copy(), x = a.towns.find(t => t.alive && t.people === 'humans'), o = a.towns.find(t => t.alive && t.people === 'orcs');
  x.heads = {human: [100, 800, 100]}; sync(x); o.heads = {orc: [1000, 5000, 1000]}; sync(o); x.tier = 0;
  const total = () => x.pop + o.pop, t0 = total();
  let top = 0;
  for (let y = 0; y < 200; y++) { mingle(a, [[x, [o]]], say); top = Math.max(top, shareOfPeople(a, x, 'orcs')); }
  check('чужаки: 200 лет прихода торговлей — доля орков в людском городе не выше mingleMax, никто не сделан и не потерян', top <= DIPLOMACY.mingleMax + 1e-9 && Math.abs(total() - t0) < 1e-6, `доля ${Math.round(top * 1000) / 10} % (предел ${DIPLOMACY.mingleMax * 100} %), ${t0} → ${total()}`);
  // moving: a horde's overflow pours into a human town with room, up to the cap for its people
  const b = copy(), x2 = b.towns.find(t => t.alive && t.people === 'humans'), o2 = b.towns.find(t => t.alive && t.people === 'orcs');
  x2.heads = {human: [100, 800, 100]}; sync(x2); o2.heads = {orc: [2000, 10000, 2000]}; sync(o2);
  for (const t of b.towns) if (t.alive && t !== x2 && t !== o2) t.alive = false;   // (two towns of one realm: the move is between them)
  o2.realm = x2.realm; o2.x = x2.x + 1; o2.y = x2.y;
  const all0 = x2.pop + o2.pop; let top2 = 0, moved = 0;
  for (let y = 0; y < 50; y++) { moved += migrate(b); top2 = Math.max(top2, shareOfPeople(b, x2, 'orcs')); }
  check('чужаки: переселение — доля орков в людском городе не выше mingleMax, сумма жителей та же', top2 <= DIPLOMACY.mingleMax + 1e-9 && Math.abs(x2.pop + o2.pop - all0) < 1e-6, `доля ${Math.round(top2 * 1000) / 10} %, переехало ${Math.round(moved)}, ${all0} → ${x2.pop + o2.pop}`);
}

if (fail.length) { console.log(`\nНе прошло: ${fail.length}`); process.exit(1); }
console.log('\nДержавы, личности и требования: всё сходится');
