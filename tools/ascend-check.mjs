// Ascension (Ver_E Э7; campaign/ascend.js; docs/CAMPAIGN.md «Вознесение»).
//   a company home with the crown raises its living, free members — with all they became and the gear on them; the dead,
//   captives, those who left — not; the registry is outside the world, a plain record;
//   a capital summons only the races it takes, at most four, each taking a place of the eight; chosen — erased at once;
//   the campaign keeps the snapshots (K.summoned): it replays the same with no registry, the rest of the core as drawn without;
//   a piece the game does not know stays in the registry; a summoned who falls does not come back.
//   node tools/ascend-check.mjs
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, stepCampaign} from '../src/campaign/index.js';
import {gearDef} from '../src/local/index.js';
import {XP} from '../src/data/experience.js';
import {playStop} from '../src/campaign/fight.js';
import {ASCEND, emptyRegistry, mayAscend, ascend, summonable, takeHeroes, snapshotOf, racesOf} from '../src/campaign/ascend.js';
import {ensureXp, levelOn} from '../src/campaign/experience.js';

let fails = 0;
const ok = (cond, what, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!cond) fails++; };

const base = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const fz = JSON.stringify(saveAtlas(base));
const fresh = () => loadAtlas(JSON.parse(fz));
const caps = capitals(base), hum = caps.find(c => c.people === 'humans'), orc = caps.find(c => c.people === 'orcs');

// a company home with the crown: two raised with their deeds, a dead one and a captive not
const a = fresh(), K = newCampaign(a, hum.town, {mode: 'auto'});
for (const m of K.members) ensureXp(m);
const [h1, h2, dead, cap] = K.members;
Object.assign(h1, {level: 9, xp: 600, perks: [{id: 'oldWolf', rank: 1, day: 40, at: [40], why: 'fight'}], maims: 1, wounds: [{id: 'lostArm', day: null, got: 50}, {id: 'cut', day: 60}]});
h1.acts.fight = 22; h2.level = 4;
dead.alive = false; dead.died = {day: 70, why: 'пал'}; cap.captive = {since: 1};
ok(mayAscend(K).length === 0, 'пока поход не кончился с короной — возносить некого');
K.phase = 'won';
const may = mayAscend(K);
ok(may.includes(h1) && may.includes(h2) && !may.includes(dead) && !may.includes(cap), 'с короной — живые и свободные; погибший и пленный — нет', may.map(m => m.name).join(', '));
let reg = ascend(a, K, emptyRegistry());
const s1 = reg.heroes.find(h => h.name === h1.name);
ok(reg.heroes.length === may.length && s1.level === 9 && s1.perks[0].id === 'oldWolf' && s1.maims === 1 && s1.wounds.length === 1 && s1.wounds[0].id === 'lostArm' && s1.acts.fight === 22,
  'снимок: уровень, перки, увечья и раны навсегда (не временные), дела', JSON.stringify({lv: s1.level, perks: s1.perks.length, maims: s1.maims, wounds: s1.wounds.map(w => w.id)}));
ok(JSON.stringify(s1.gear) === JSON.stringify(h1.gear) && !('relations' in s1) && !('id' in s1) && !('ride' in s1) && !('gold' in s1), 'переносится снаряжение на нём; связей, id, верхового, золота — нет');
ok(K.ascended && mayAscend(K).length === 0 && ascend(a, K, reg).heroes.length === reg.heroes.length, 'вознести можно один раз');

// summoning: only the races the capital takes
const ra = fresh();
ok(summonable(ra, hum.town, reg).length === reg.heroes.filter(h => racesOf(ra, hum.town).has(h.race)).length && (!orc || summonable(ra, orc.town, reg).every(h => racesOf(ra, orc.town).has(h.race))), 'столица зовёт только те расы, что берёт в свиту');
// chosen → erased; at most four
const many = {v: ASCEND.version, heroes: Array.from({length: 6}, (_, k) => ({...s1, uid: `x${k}`, name: `${s1.name}${k}`}))};
const {reg: after, snaps} = takeHeroes(many, many.heroes.map(h => h.uid));
ok(snaps.length === ASCEND.max && after.heroes.length === 2 && snaps.every(s => !after.heroes.some(h => h.uid === s.uid)), 'выбранные сразу стёрты из реестра; не больше четырёх', `взято ${snaps.length}, осталось ${after.heroes.length}`);

// into the core: the summoned in its place, the rest as drawn without them; the campaign replays with no registry
const plain = newCampaign(fresh(), hum.town, {mode: 'auto'});
const b1 = fresh(), K1 = newCampaign(b1, hum.town, {mode: 'auto', summon: [s1]});
const sm = K1.members.find(m => m.summoned);
ok(sm && sm.name === s1.name && sm.level === 9 && sm.maims === 1 && sm.perks[0].id === 'oldWolf' && sm.wounds.some(w => w.id === 'lostArm') && JSON.stringify(sm.gear.hand) === JSON.stringify(s1.gear.hand),
  'призванный в ядре: уровень, перки, увечья, снаряжение', sm ? `${sm.name}, ${sm.level}-й, ${sm.fight}` : 'нет');
ok(K1.members.length === 8 && K1.members.filter(m => !m.summoned).every(m => plain.members.some(p => p.id === m.id && p.name === m.name && JSON.stringify(p.special) === JSON.stringify(m.special))), 'остальные семь — те же, что выпали бы без призыва (поток рождения не сдвинут)');
ok(K1.summoned?.length === 1 && K1.summoned[0].uid === s1.uid && K1.log.some(l => /призван.* из вознесённых: в прошлый раз/.test(l.text)), 'снимок записан в K.summoned; в летописи — «в прошлый раз…»');
const K2 = newCampaign(fresh(), hum.town, {mode: 'auto', summon: JSON.parse(JSON.stringify(K1.summoned))});
ok(JSON.stringify(K2.members) === JSON.stringify(K1.members), 'повтор по сиду и K.summoned — тот же отряд, реестр не нужен');
// a piece the game does not know stays in the registry
const odd = {...s1, uid: 'odd', gear: {hand: [...s1.gear.hand, 'nosuchthing'], body: s1.gear.body}};
const t2 = takeHeroes({v: ASCEND.version, heroes: [odd]}, ['odd']), K3 = newCampaign(fresh(), hum.town, {mode: 'auto', summon: t2.snaps});
ok(t2.reg.left?.[0]?.items.includes('nosuchthing') && !K3.members.find(m => m.summoned).gear.hand.includes('nosuchthing'), 'вещь, которой игра не знает, остаётся в реестре');
// a summoned who falls does not come back: it is not raised, and the registry no longer has it
const sf = K3.members.find(m => m.summoned); sf.alive = false; sf.died = {day: 3, why: 'пал'}; K3.phase = 'won';
ok(!mayAscend(K3).includes(sf) && !t2.reg.heroes.some(h => h.uid === 'odd'), 'павший призванный не возвращается');
// a raised summoned counts its walks
const K4 = newCampaign(fresh(), hum.town, {mode: 'auto', summon: [s1]}); K4.phase = 'won';
const again = snapshotOf(fresh(), K4, K4.members.find(m => m.summoned));
ok(again.story.walks === 2 && again.story.before?.from === s1.story.from, 'вознесённый второй раз помнит, что это второй поход');

// Р3: the core's needs (RETINUE.least) kept: one who closes a need gives place only to one who closes the same
{
  const plain = newCampaign(fresh(), hum.town, {mode: 'auto'});
  const healer = plain.members.find(m => m.required === 'healer');
  const beast = {...s1, uid: 'bc', fight: 'summoner', name: 'Звероклич'}, heal = {...s1, uid: 'hl', fight: 'healer', name: 'Травница'};
  const Kb = newCampaign(fresh(), hum.town, {mode: 'auto', summon: [beast]}), Kh = newCampaign(fresh(), hum.town, {mode: 'auto', summon: [heal]});
  const need = K => Object.entries({line: 2, shooter: 1, healer: 1}).every(([n, c]) => K.members.filter(m => m.required === n).length === c);
  ok(healer && Kb.members.some(m => m.id === healer.id && m.name === healer.name) && need(Kb), 'призванный не знахарь не встаёт на место единственного знахаря', `знахарь ${healer?.name}`);
  ok(Kh.members.find(m => m.id === healer.id)?.name === 'Травница' && Kh.members.find(m => m.id === healer.id).required === 'healer', 'призванная знахарка встаёт на место знахаря и закрывает ту же нужду');
  const four = newCampaign(fresh(), hum.town, {mode: 'auto', summon: [1, 2, 3, 4].map(k => ({...s1, uid: `f${k}`, fight: 'cleaver', name: `Рубака${k}`}))});
  ok(four.members.filter(m => m.summoned).length === 4 && need(four), 'четверо призванных рубак — нужды ядра (линия 2, стрелок, знахарь) на месте');
}
// Р3: the level of one summoned on a day older than the daily record — its level at coming, not 1
{
  const Ks = newCampaign(fresh(), hum.town, {mode: 'auto', summon: [s1]}), m = Ks.members.find(x => x.summoned);
  Ks.day = 100; Ks.daily = [];
  ok(levelOn(Ks, m, 5) === s1.level, 'уровень призванного на давний день — с каким пришёл', `${levelOn(Ks, m, 5)}`);
}
// Р3: two walks from one capital in one year are not one hero twice
{
  const A1 = fresh(), Ka = newCampaign(A1, hum.town, {mode: 'auto'}); Ka.phase = 'won'; Ka.day = 120;
  const Kb2 = JSON.parse(JSON.stringify(Ka)); Kb2.day = 133; Kb2.ascended = null;
  const r1 = ascend(A1, Ka, emptyRegistry()), r2 = ascend(A1, Kb2, r1);
  ok(r2.heroes.length === 2 * r1.heroes.length, 'два похода из одной столицы в один год — герои обоих в реестре', `${r1.heroes.length} → ${r2.heroes.length}`);
}


// К-1 (аудит Ver_E): the summoned walks — its values a list, as everywhere; a snapshot of the first build (values an object) read too;
// the walk goes on in the quick mode, and a camp on the local map opens with it
{
  ok(Array.isArray(s1.values), 'снимок хранит ценности списком', JSON.stringify(s1.values));
  const old = {...s1, uid: 'oldv', values: Object.fromEntries((s1.values || ['gold']).map((v, k) => [k, v]))};
  const b = fresh(), Kw = newCampaign(b, hum.town, {mode: 'auto', summon: [s1, old]}); b.campaign = Kw;
  ok(Kw.members.filter(m => m.summoned).every(m => Array.isArray(m.values)), 'призванные — с ценностями списком (и из снимка, где они были объектом)');
  let err = null; try { for (let q = 0; q < 2; q++) stepCampaign(b); } catch (e) { err = e; }
  ok(!err && Kw.day > 20, 'поход с призванными идёт (быстрый режим, два сезона)', err ? err.message : `день ${Kw.day}`);
  const c = fresh(), Kl = newCampaign(c, hum.town, {mode: 'local', summon: [s1, old]}); c.campaign = Kl;
  let errL = null; try { Kl.why = 'food'; playStop(c, Kl); } catch (e) { errL = e; }
  ok(!errL, 'стоянка на карте с призванными открывается и играется', errL ? errL.message : 'ок');
}
// В-1: the camp's tools of the core stay when the summoned take their places (an axe is not lost for want of one in its hands)
{
  const tools = K => K.members.flatMap(m => m.gear.hand.filter(id => gearDef(id)?.tool)).sort().join(',');
  const plain = newCampaign(fresh(), hum.town, {mode: 'auto'});
  const bare = [1, 2, 3, 4].map(k => ({...s1, uid: `t${k}`, name: `Безрукий${k}`, gear: {hand: s1.gear.hand.filter(id => !gearDef(id)?.tool), body: s1.gear.body}}));
  const Kt = newCampaign(fresh(), hum.town, {mode: 'auto', summon: bare});
  ok(tools(Kt) === tools(plain), 'инструменты стоянки ядра на месте и с призванными без инструментов', `${tools(plain)} → ${tools(Kt)}`);
}
// the cap: one ascended past it comes at the cap
{
  const Kc = newCampaign(fresh(), hum.town, {mode: 'auto', summon: [{...s1, uid: 'cap', level: 46}]});
  ok(Kc.members.find(m => m.summoned).level === XP.cap, `призванный старше потолка приходит на ${XP.cap}-м уровне`);
}

if (fails) { console.log(`\n${fails} проверок не прошло`); process.exit(1); }
