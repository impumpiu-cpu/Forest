// Classes (plan claude/bestiary-plan.md З-8; data/classes.js): a role + a body (SPECIAL) + a way through the book of perks.
// Every class names a role and perks of the book; a class's own perk only one of the class may take; its way draws a member
// to its perks at a level's pick; what it gives comes at its level (the forge-master's breath of the second rank at the
// eighth); a monster of a band carries the whole way up to its band's level (a brute's heavy swing), a pawn chooses; the
// fit by the body; the table «Классы».
//   node tools/class-check.mjs
import {CLASSES, classOfRole, bandLevel, BAND_LEVEL} from '../src/data/classes.js';
import {COMBAT_ROLES} from '../src/data/roles.js';
import {PERKS, perkRanks, perksOf, heldOf, perkMulA, PERK_PICK} from '../src/data/perks.js';
import {meets, pullOf, classFit, classesFor} from '../src/campaign/perks.js';
import {TABLES} from '../src/data/schema/index.js';

let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const member = (fight, level, more = {}) => ({race: 'human', fight, level, perks: [], acts: {}, workBy: {}, special: {S: 6, P: 6, E: 6, C: 5, I: 5, A: 6, L: 5}, gear: {hand: []}, local: {leans: {}}, values: [], ...more});

// ── every class names a role and perks of the book at ranks they have; one class a role
{
  const bad = [];
  for (const C of CLASSES.all()) {
    if (!COMBAT_ROLES.has(C.role)) bad.push(`${C.id}: роль ${C.role}`);
    for (const e of C.path) if (!PERKS.has(e.perk) || e.rank > perkRanks(PERKS.get(e.perk))) bad.push(`${C.id}: ${e.perk} ${e.rank}`);
  }
  const roles = CLASSES.all().map(C => C.role);
  ok(!bad.length && new Set(roles).size === roles.length, 'классы: у каждого роль и перки справочника с допустимым рангом; на роль — один класс', bad.join('; ') || `${CLASSES.all().length} классов`);
}

// ── a class's own perk: only one of the class; its way draws the member to it
{
  const P = PERKS.get('spearDrill');
  ok(meets(member('spearman', 3), P) && !meets(member('archer', 3), P) && !meets(member('spearman', 2), P), '«Выучка копейщика» — только копейщику и с третьего уровня');
  const sh = PERKS.get('shoulder'), a = member('shield', 3, {gear: {hand: ['shield']}}), b = member('archer', 3);
  ok(pullOf(a, sh) >= PERK_PICK.path * pullOf(b, sh) - 1e-9, 'путь стража тянет к «Плечом к плечу»', `${pullOf(a, sh)} / ${pullOf(b, sh)}`);
  ok(pullOf(member('spearman', 2), PERKS.get('spearDrill')) === pullOf(member('cleaver', 2), PERKS.get('spearDrill')), 'до уровня пути — не тянет');
}

// ── what a class gives comes at its level: the forge-master's breath II at the eighth, with the coal
{
  const fm = lv => ({species: 'dwarf', fightRole: 'forgemaster', level: lv, faction: 'colony', perks: []});
  const r7 = perksOf(fm(7)).find(p => p.id === 'fireBreath'), r8 = perksOf(fm(8)).find(p => p.id === 'fireBreath');
  ok(r7?.rank === 1 && r8?.rank === 2 && r8.hold === 'spitfire', 'мастер горна: до 8-го уровня Огнедышащий I, с 8-го — II (конус в пять клеток), всё так же с углём', `${r7?.rank} → ${r8?.rank}`);
}

// ── a monster of a band carries the whole way up to its level; a pawn only what is given
{
  const brute = lv => ({species: 'ogre', fightRole: 'brute', level: lv, faction: 'raiders', perks: []});
  ok(!perksOf(brute(1)).some(p => p.id === 'heavySwing') && perkMulA(brute(3), 'blows', 'slash') > 1, 'громила банды: с 3-го уровня — «Тяжёлый размах», рубит сильнее', `×${perkMulA(brute(3), 'blows', 'slash')}`);
  const raider = {species: 'human', fightRole: 'cleaver', level: 7, faction: 'raiders', perks: []}, pawn = {...raider, faction: 'colony'};
  ok(perkMulA(raider, 'blows', 'slash') === 1.2 && perkMulA(pawn, 'blows', 'slash') === 1, 'рубака-налётчик 7-го уровня несёт путь целиком, рубака-пешка выбирает сам');
  ok(bandLevel(0) === 1 && bandLevel(BAND_LEVEL.from[2]) === BAND_LEVEL.level[2] && bandLevel(100) === BAND_LEVEL.level.at(-1), 'уровень банды — по угрозе, ступенями', BAND_LEVEL.level.join('/'));
}

// ── the fit by the body; the table
{
  const strong = member('shield', 1, {special: {S: 8, P: 4, E: 8, C: 3, I: 3, A: 4, L: 5}}), weak = member('shield', 1, {special: {S: 3, P: 7, E: 3, C: 5, I: 7, A: 7, L: 5}});
  const w = CLASSES.get('warden');
  ok(classFit(strong, w) > 1 && classFit(weak, w) === null, 'крепкому — страж, хлипкому — нет', `${classFit(strong, w)?.toFixed(2)}`);
  const best = classesFor(weak).map(x => x.C.id);
  ok(best.length > 0 && ['archer', 'healer', 'cutthroat', 'skirmisher', 'catcher'].includes(best[0]), 'хлипкому, но ловкому и зоркому — стрелок, знахарь или головорез', best.slice(0, 3).join(', '));
  const T = TABLES.find(t => t.id === 'classes');
  ok(T && T.rows().length === CLASSES.all().length && /Огнедышащий II \(даётся\)/.test(T.rows().find(r => r.id === 'forgemaster').path), 'таблица «Классы»: путь мастера горна', T?.rows().find(r => r.id === 'forgemaster')?.path);
}

if (fails) { console.log(`\nclass-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nclass-check: ok');
