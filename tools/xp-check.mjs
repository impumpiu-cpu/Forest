// Experience, acts and levels (plan claude/xp-plan.md, Ver_E Э0–Э2; docs/CAMPAIGN.md «Опыт, дела и уровни»).
// Э0: the fields come with every member and with an old save, at level 1 and nothing; the curve is the one written; only the
//     free living earn, a captive only by its work and at its share.
// Э1: an act is written by the doer's own hand on the map (a kill, a shot, a shield over another, a work's units before they
//     are skill — a master at the top of his skill earns by his work too) and taken back once; a fact of a deed is an act of
//     its doer; a fight gives its ground to all who stood in it by its danger, the role's letter to whoever did nothing of its
//     own; the same seed gives the same experience in both modes.
// Э2: a level grows the letter its acts wrote most, inside the race's limits, the next one at a limit, none when all are at
//     their limits; the letters written are cleared; the level is a fact and a line of the log, and the screen reads it as of
//     the day shown.
//   node tools/xp-check.mjs
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, runCampaign, levelOn} from '../src/campaign/index.js';
import {makeMember, upgradeMembers} from '../src/campaign/start.js';
import {campSetup, runCamp, campOutcome} from '../src/campaign/camp.js';
import {applyCamp} from '../src/campaign/fight.js';
import {takeFromCamp} from '../src/campaign/captives.js';
import {trade} from '../src/campaign/town.js';
import {noteKill} from '../src/agents/acts.js';
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent} from '../src/agents/agent.js';
import {autoWork} from '../src/campaign/experience.js';
import {need, levelAt, award, ensureXp, levelEvening, letterFor, fightActs, factActs, campActs, specialOn} from '../src/campaign/experience.js';
import {ACTS, XP, KILL} from '../src/data/experience.js';
import {SPECIES} from '../src/data/species.js';
import {COMBAT_ROLES} from '../src/data/roles.js';
import {RETINUE} from '../src/data/campaign.js';
import {practice} from '../src/agents/skills.js';
import {mulberry} from '../src/core/rng.js';

let fails = 0;
const ok = (cond, what, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!cond) fails++; };

// ── Э0: the curve and the fields
ok(need(1) === 0 && need(2) === XP.need * (2 + XP.lead) && need(10) === XP.need * 9 * (10 + XP.lead) && levelAt(0) === 1 && levelAt(need(10) - 1) === 9 && levelAt(need(10)) === 10 && levelAt(1e6) > 20,
  `кривая: need(L) = ${XP.need}·(L−1)·(L+${XP.lead}), потолка нет`, `2-й ${need(2)}, 10-й ${need(10)}, 20-й ${need(20)}, миллион — ${levelAt(1e6)}-й`);

const base = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const fz = JSON.stringify(saveAtlas(base));
const fresh = () => loadAtlas(JSON.parse(fz));
const caps = capitals(base), cap = caps.find(c => c.people === 'humans') || caps[0];

{
  const a = fresh(), K = newCampaign(a, cap.town, {mode: 'auto'});
  ok(K.members.every(m => m.xp === 0 && m.level === 1 && m.xpBy && m.acts && Array.isArray(m.perks) && m.maims === 0), 'поля опыта у каждого из ядра с рождения', K.members.map(m => `${m.name} ${m.level}`).join(', '));
  const joined = makeMember(K, mulberry(5), {race: 'human', role: 'companion', gear: {hand: ['club'], body: 'clothes'}});
  ok(joined.xp === 0 && joined.level === 1, 'и у приставшего в пути');
  // an old save: no fields — upgradeMembers starts them at 1 with nothing (the author's call: no back-filling)
  const old = K.members[0]; for (const k of ['xp', 'level', 'xpBy', 'acts', 'xpOf', 'workBy', 'grew', 'perks', 'maims']) delete old[k];
  upgradeMembers(K);
  ok(old.xp === 0 && old.level === 1 && old.maims === 0, 'старое сохранение: уровень 1, опыта нет, ничего задним числом');

  // who earns
  const m = K.members[1], before = m.xp;
  award(K, m, 'watch'); award(K, m, 'nope'); award(K, m, 'road', 0);
  ok(m.xp - before === ACTS.get('watch').xp && !m.acts.nope, 'свободный получает за дело; неизвестного дела и нуля нет', `+${m.xp - before}`);
  const c = K.members[2]; c.captive = {since: 0}; const c0 = c.xp;
  award(K, c, 'killBlow', 2); award(K, c, 'fight', 1, {xp: 40}); award(K, c, 'work', 200, {skill: 'mining'});
  ok(c.xp - c0 === ACTS.get('work').xp * 200 * XP.captive && !c.acts.killBlow, 'пленный: только за работу и вполовину, боевого нет', `+${c.xp - c0}`);
  delete c.captive;
  const d = K.members[3]; d.alive = false; const d0 = d.xp; award(K, d, 'watch'); d.alive = true;
  ok(d.xp === d0, 'павшему и ушедшему опыта нет');
  // the ground has no letter; an act writes its own, a work its skill's
  const g = K.members[4]; g.xpBy = {};
  award(K, g, 'road'); award(K, g, 'fight', 1, {xp: 20});
  const noLetter = !Object.keys(g.xpBy).length;
  award(K, g, 'dress'); award(K, g, 'work', 100, {skill: 'woodcutting'});
  ok(noLetter && g.xpBy.I === ACTS.get('dress').xp && g.xpBy.S === ACTS.get('work').xp * 100, 'основа без буквы; дело пишет свою букву, работа — букву навыка', JSON.stringify(g.xpBy));
}

// ── Э1: the acts on the map
{
  // a master at the top of his skill: the work done is written before it becomes skill, so he earns by it all the same
  const ag = {member: 7, prefs: {}, skill: {mining: 1}, special: {S: 5}, mods: {}};
  const gain = practice(ag, 'mining', 300);
  ok(gain === 0 && ag.practiced?.mining === 300, 'мастер с навыком 1,0: навык не растёт, а работа записана', `прирост ${gain}, единиц ${ag.practiced?.mining}`);
  const settler = {prefs: {}, skill: {mining: 0.2}, special: {S: 5}, mods: {}};
  practice(settler, 'mining', 50);
  ok(!settler.practiced, 'поселенец без места в караване дел не пишет');

  // a camp on the local map: the acts come back with the outcome, and are taken once
  const a = fresh(), K = newCampaign(a, cap.town, {mode: 'local'});
  const S = campSetup(a, K, {kind: 'stop', dayIn: 0}), o = campOutcome(runCamp(S)), o2 = campOutcome(runCamp(S));
  const units = o.members.reduce((n, mo) => n + Object.values(mo.practiced || {}).reduce((s, v) => s + v, 0), 0);
  ok(units > 0, 'день стоянки на карте: работа записана в руки каждому', `${Math.round(units)} единиц практики`);
  ok(JSON.stringify(o.members.map(mo => [mo.acts, mo.practiced])) === JSON.stringify(o2.members.map(mo => [mo.acts, mo.practiced])), 'повтор стоянки даёт те же дела');
  const x0 = K.members.map(m => m.xp);
  applyCamp(a, K, S, o, null, 'stop'); const x1 = K.members.map(m => m.xp);
  applyCamp(a, K, S, o, null, 'stop'); const x2 = K.members.map(m => m.xp);
  ok(x1.some((v, k) => v > x0[k]) && JSON.stringify(x1) === JSON.stringify(x2), 'итог стоянки берётся один раз', `опыт ${x0.reduce((s, v) => s + v, 0)} → ${Math.round(x1.reduce((s, v) => s + v, 0))} → ${Math.round(x2.reduce((s, v) => s + v, 0))}`);

  // a fact of a deed is its doer's act: one dressed a fallen one
  const [p, q] = K.members, p0 = p.acts.dress || 0;
  factActs(K, {kind: 'saved', by: p.id, to: q.id}); factActs(K, {kind: 'quarrel', by: p.id, to: q.id});
  ok((p.acts.dress || 0) === p0 + 1 && !p.acts.quarrel && !(q.acts.dress), 'факт «спас упавшего» — дело того, кто спас; ссора — не дело');
  const r = K.members[2], s = K.members[3], r0 = r.acts.mend || 0, s0 = s.acts.mend || 0;
  factActs(K, {kind: 'reconciled', by: r.id, to: s.id});
  ok(r.acts.mend === r0 + 1 && s.acts.mend === s0 + 1, 'примирение — дело обоих');
}

// ── a fight: the ground by danger to all who stood in it, the role's letter to whoever did nothing of its own
{
  const a = fresh(), K = newCampaign(a, cap.town, {mode: 'auto'}), ms = K.members.filter(m => !m.captive);
  for (const m of ms) { m.xpBy = {}; m.xp = 0; m.xpOf = {}; }
  const acted = new Set([ms[0].id]);
  fightActs(K, {kind: 'bandits'}, 'night', true, {theirs: 10, ours: 5, foes: 6, acted}, ms);
  const want = ACTS.get('fight').xp * 2;
  ok(ms.every(m => m.xp === want), 'бой вдвое сильнее отряда: основа ×2 всем бившимся', `${ms[0].xp} у каждого`);
  ok(!Object.keys(ms[0].xpBy).length && ms.slice(1).every(m => Object.values(m.xpBy).some(v => v > 0)), 'кто бился своими делами — без буквы роли; кто нет — с буквой роли (с весом)');
  const m = ms[1]; m.xp = 0;
  fightActs(K, {kind: 'bandits'}, 'night', true, {theirs: 1000, ours: 1, foes: 9, acted}, [m]);
  ok(m.xp === ACTS.get('fight').xp * XP.danger[1], 'опасность боя в пределах', `${m.xp}`);
  m.xp = 0; fightActs(K, {kind: 'bandits'}, 'night', true, {theirs: 0, ours: 5, foes: 0, acted}, [m]);
  ok(m.xp === 0, 'никто не пришёл — нет и боя');
}


// ── Р1: what counts as an act (the expert's review of 9776460)
{
  // 1. a foe brought down is one, however heavy; its weight is experience; its death apart; taken alive — brought down, not slain
  const w = newGame({...DEFAULT_CFG, seed: 'xp', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  const put = (sp, fac) => createAgent(w, sp, fac, 20.5, 20.5);
  const ogre = put('ogre', 'raiders');
  const by = {member: 1}, other = {member: 2};
  noteKill(ogre, by, false, false); ogre.downed = {since: 0};   // knocked down
  noteKill(ogre, other, false, true);                           // finished by another
  ok(by.acts.killBlow === 1 && by.actXp.killBlow > KILL.xp && !by.acts.slew && other.acts.slew === 1 && !other.acts.killBlow,
    'огр: один поверженный, вес — опытом; добивший получает «добил», не второго поверженного', `счёт ${by.acts.killBlow}, опыт ${by.actXp.killBlow}, добил: ${other.acts.slew}`);
  const raider = put('human', 'raiders'), binder = {member: 3};
  noteKill(raider, binder, true, false); raider.downed = {since: 0}; delete raider.downed; noteKill(raider, binder, true, false);
  ok(binder.acts.killShot === 1 && !binder.acts.slew, 'сбитый с ног, вставший и сбитый снова — всё тот же один поверженный; взятый живым не убит');
  const deer = {faction: 'wild', mods: {}}, hunter = {member: 4};
  noteKill(deer, hunter, true, false); noteKill(deer, hunter, true, true);
  ok(hunter.acts.game === 1 && !hunter.acts.killShot, 'дичь — добыча охотника, не поверженный враг');

  // 2. the quick mode's stop: the work is on the stop's purpose, never on the fight's skills
  const a = fresh(), K = newCampaign(a, cap.town, {mode: 'auto'}), m = K.members.find(x => !x.captive);
  m.local.skill = {melee: 0.9, ranged: 0.8, gathering: 0.2, cooking: 0.1, woodcutting: 0.5}; m.workBy = {}; m.lvWork = {};
  autoWork(K, 'food');
  ok(m.workBy.gathering > 0 && !m.workBy.melee && !m.workBy.woodcutting, 'быстрый режим, стоянка за едой: работа — по делу стоянки (собирательство), не по рукопашной', JSON.stringify(m.workBy));
  m.workBy = {}; autoWork(K, 'camp');
  ok(m.workBy.woodcutting > 0 && !m.workBy.melee, 'стоянка без особого дела — лучший мирный навык', JSON.stringify(m.workBy));

  // 3. a deal is struck after the exchange: buying counts, a visit without one does not
  const t = a.towns.find(x => x.id === K.home) || a.towns.find(x => x.id === cap.town.id) || a.towns[0];
  const ms = K.members.filter(x => !x.captive);
  const tr0 = ms.reduce((n, x) => n + (x.acts.trade || 0), 0);
  K.food = 0; K.gold = 500; trade(a, K, t, 'friend');
  const tr1 = ms.reduce((n, x) => n + (x.acts.trade || 0), 0);
  ok(tr1 === tr0 + 1, 'купили пайки — сделка засчитана лучшему торговцу', `сделок ${tr0} → ${tr1}`);
  const g = K.gold; K.gold = 0; K.cargo = {}; K.spoils = []; K.food = 1e6; trade(a, K, t, 'friend');
  ok(ms.reduce((n, x) => n + (x.acts.trade || 0), 0) === tr1 && K.gold === 0, 'ни купить, ни продать — сделки нет'); K.gold = g;

  // 4. the role's letter has weight, and it is what the level grows
  const f = ms.find(x => x.fight && COMBAT_ROLES.get(x.fight).group === 'линия') || ms[0];
  f.xpBy = {}; f.lvOf = {};
  fightActs(K, {kind: 'bandits'}, 'night', true, {theirs: 5, ours: 5, foes: 6, acted: new Set()}, [f]);
  const lean = RETINUE.lean[COMBAT_ROLES.get(f.fight).group].filter(x => x !== 'L');
  ok(lean.every(x => f.xpBy[x] === Math.round(XP.roleWeight / lean.length * 100) / 100) && lean.includes(letterFor(f)?.stat), 'бой без своих дел: буквы роли с весом, и уровень растит одну из них', `${JSON.stringify(f.xpBy)} → ${letterFor(f)?.stat} (${letterFor(f)?.why})`);

  // 5. the reason is of this level: medicine grew the last one, cooking this one
  const h = ms.at(-1); h.lvOf = {}; h.lvWork = {}; h.xpBy = {}; h.workBy = {};
  for (const s2 of XP.letters) h.special[s2] = Math.min(h.special[s2], SPECIES.get(h.race).special[s2][1] - 1);
  award(K, h, 'work', 1000, {skill: 'medicine'}); h.xp = need(h.level + 1); levelEvening(a, K);
  const first = h.grew.at(-1);
  award(K, h, 'work', 300, {skill: 'cooking'}); h.xp = need(h.level + 1); levelEvening(a, K);
  ok(first.why === 'work:medicine' && h.grew.at(-1).why === 'work:cooking', 'причина роста — дела этого уровня: сначала медицина, потом готовка', `${first.why} → ${h.grew.at(-1).why}`);

  // 6. a captive taken on the map comes with its level and empty counts at once
  const before = K.members.length;
  takeFromCamp(a, K, {taken: [{name: 'Пленник', gender: 'm', race: 'human', hp: 0.3, special: {...m.special}, gear: {hand: [], body: null}, bonds: 'rope'}]}, () => {});
  const c = K.members[before];
  ok(c && c.level === 1 && c.xp === 0 && c.acts && c.maims === 0, 'взятый на карте пленный — сразу с уровнем 1 и пустыми счетами');

  // 7. one gone keeps the level it left with on the days after
  const gone = ms[1]; gone.level = 6; K.daily = [{d: 0, lv: {[gone.id]: 5}}, {d: 1, lv: {}}]; K.day = 4;
  ok(levelOn(K, gone, 3) === 5, 'выбывший на следующих днях — с уровнем, с которым ушёл', `${levelOn(K, gone, 3)}`);
}

// ── Э2: the evening of a level
{
  const a = fresh(), K = newCampaign(a, cap.town, {mode: 'auto'}), lines = [];
  const m = K.members.find(x => x.race === 'human') || K.members[0], lim = SPECIES.get(m.race).special;
  m.special.S = lim.S[1] - 1; m.special.P = 3; m.xpBy = {S: 30, P: 5}; m.xp = need(3);
  levelEvening(a, K, text => lines.push(text));
  ok(m.level === 3 && m.special.S === lim.S[1] && m.grew[0].stat === 'S' && m.grew[1].stat === 'P', 'два уровня за вечер: первый — Сила (больше всего дел) до предела расы, второй — следующая буква дел (Восприятие), а не буква роли', `S ${m.special.S}/${lim.S[1]}, второй — ${m.grew[1].stat}`);
  ok(!Object.keys(m.xpBy).length && m.grew.length === 2 && lines.length === 1, 'буквы дел очищены после обоих; рост записан; одна строка за вечер', lines.join(' | '));
  ok((K.social.facts || []).filter(f => f.kind === 'levelUp' && f.by === m.id).length === 2, 'уровень — факт отряда с очевидцами');
  // at every limit: no letter, but the level is taken
  for (const s of XP.letters) m.special[s] = lim[s][1];
  m.xp = need(m.level + 1);
  levelEvening(a, K, text => lines.push(text));
  ok(m.level === 4 && m.grew.at(-1).stat === null && XP.letters.every(s => m.special[s] === lim[s][1]), 'все буквы на пределе — уровень есть, буквы нет', lines.at(-1));
  // a dangerous fight: three levels from nothing, the letters its acts wrote, in their order
  const z = K.members.find(x => x !== m && x.race === 'human') || K.members[2], zl = SPECIES.get(z.race).special;
  for (const s2 of XP.letters) z.special[s2] = Math.min(z.special[s2], zl[s2][1] - 2);
  z.level = 1; z.xp = 0; z.xpBy = {}; z.lvOf = {}; z.lvWork = {}; z.grew = [];
  award(K, z, 'dress', 2); award(K, z, 'killBlow', 1, {xp: 5}); award(K, z, 'fight', 1, {xp: 120 - 17});
  const zn = lines.length; levelEvening(a, K, text => lines.push(text));
  ok(z.level === 4 && z.grew.map(g => g.stat).join('') === 'IS' + z.grew[2].stat && z.grew[2].stat && lines.length === zn + 1 && /сразу 3 уровня/.test(lines.at(-1)),
    'опасный бой: три уровня за вечер — буквы дел по порядку, третий — буква роли, одна строка', lines.at(-1));
  // nothing written: the role's letter
  const f = K.members.find(x => x !== m && x.fight), fl = SPECIES.get(f.race).special;
  for (const s of XP.letters) f.special[s] = Math.min(f.special[s], fl[s][1] - 1);
  f.xpBy = {};
  const pick = letterFor(f);
  ok(pick && ['S', 'E', 'P', 'A', 'I', 'C'].includes(pick.stat), 'нет дел с буквой — растёт буква роли', `${f.fight}: ${pick?.stat}`);
  // Luck is never grown by a level
  ok(!XP.letters.includes('L'), 'Удача уровнем не растёт');
  // the screen: the level and the letters as of the day shown
  K.daily = [{d: 0, lv: {[m.id]: 1}}];
  K.day = 5; m.grew = [{level: 2, day: 2, stat: 'S', from: 5, to: 6}]; m.special.S = 6;
  ok(levelOn(K, m, 1) === 1 && levelOn(K, m, 5) === m.level && specialOn(K, m, 1).S === 5 && specialOn(K, m, 3).S === 6, 'экран читает уровень и буквы на день показа');
}

// ── the same seed, the same experience (both modes)
{
  const run = mode => { const a = fresh(); newCampaign(a, cap.town, {mode}); return runCampaign(a, mode === 'auto' ? 8 : 1).members.map(m => `${m.id}:${m.xp}:${m.level}:${JSON.stringify(m.special)}`).join('|'); };
  ok(run('auto') === run('auto'), 'быстрый режим: тот же сид — тот же опыт и уровни');
  ok(run('local') === run('local'), 'карта: тот же сид — тот же опыт и уровни');
}

if (fails) { console.log(`\n${fails} проверок не прошло`); process.exit(1); }
