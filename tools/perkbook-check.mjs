// The book of perks (plan claude/bestiary-plan.md З-1, the expert's note 13.11): one book for all — the learned ones, a
// species' innate ones, a role's. Every grant names a perk of the book at a rank it has; a perk given (learn: false) is never
// offered at a level; the old fields read as grants keep their numbers (a wyvern's venom, a spider's web, a vampire's blood);
// one holds the perks of its species and of its role beside its own learned ones; the table «Перки: кому можно» shows them all.
//   node tools/perkbook-check.mjs
import {SPECIES} from '../src/data/species.js';
import {COMBAT_ROLES} from '../src/data/roles.js';
import {PERKS, rowOf, perkOf, perkAccess, perkRanks, speciesGrants, innateOf, perksOf, heldOf, perkProfile, PERK_WHO} from '../src/data/perks.js';
import {offered} from '../src/campaign/perks.js';
import {TABLES} from '../src/data/schema/index.js';
import {heatHarm} from '../src/agents/body.js';

let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };

// ── every grant names a perk of the book, at a rank it has
{
  const bad = [];
  for (const sp of SPECIES.all()) for (const g of speciesGrants(sp)) if (!PERKS.has(g.id) || (g.rank || 1) > perkRanks(PERKS.get(g.id)) || (!g.own && !perkProfile(g.id, g.rank))) bad.push(`${sp.id}:${g.id}`);
  for (const R of COMBAT_ROLES.all()) for (const g of R.perks || []) if (!PERKS.has(g.id) || (g.rank || 1) > perkRanks(PERKS.get(g.id))) bad.push(`роль ${R.id}:${g.id}`);
  ok(!bad.length, 'каждая выдача вида и роли — перк справочника с допустимым рангом', bad.join(', ') || `${SPECIES.all().reduce((n, sp) => n + speciesGrants(sp).length, 0)} выдач у видов`);
  const who = PERKS.all().filter(P => { const A = perkAccess(P); return !PERK_WHO[A.pawn] || !PERK_WHO[A.monster]; });
  ok(!who.length, 'у каждого перка есть статус «пешке» и «монстру»', who.map(P => P.id).join(', '));
}

// ── the old fields keep their numbers, read through the book
{
  const same = (id, field, perk, f) => { const sp = SPECIES.get(id), p = innateOf(sp, perk); return !!p && JSON.stringify(f(p)) === JSON.stringify(sp[field]); };
  ok(same('scorpion', 'venom', 'venom', p => p) && !innateOf(SPECIES.get('wyvern'), 'venom') && speciesGrants(SPECIES.get('wyvern')).some(g => g.id === 'sting'),
    'яд скорпиона — прежние числа (выдача с own); у виверны травит жало, не укус', JSON.stringify(innateOf(SPECIES.get('scorpion'), 'venom')));
  ok(same('vampire', 'drinks', 'bloodDrink', p => p.share), 'вампир пьёт кровь той же долей', JSON.stringify(innateOf(SPECIES.get('vampire'), 'bloodDrink')));
  ok(!innateOf(SPECIES.get('human'), 'venom') && !innateOf(SPECIES.get('wolf'), 'web'), 'у человека нет яда, у волка паутины');
}

// ── a perk given is never chosen at a level: a member who has done everything is offered none of them
{
  const acts = Object.fromEntries(['fight', 'watch', 'swap', 'dress', 'tend', 'town', 'trade', 'beside', 'shield', 'hit', 'clean', 'killBlow', 'fight:линия', 'fight:дальний бой'].map(k => [k, 99]));
  const m = {race: 'dwarf', role: 'forgemaster', fight: 'forgemaster', level: 30, acts, workBy: {medicine: 99, woodcutting: 99, mining: 99, construction: 99}, special: {S: 9, P: 9, E: 9, C: 9, I: 9, A: 9, L: 9}, gear: {hand: []}, perks: []};
  const got = offered(m).map(o => o.P.id), given = PERKS.all().filter(P => !perkAccess(P).learn).map(P => P.id);
  ok(got.length > 0 && !got.some(id => given.includes(id)), 'врождённое и выданное ролью не выбирается за уровень', `предложено ${got.length}, выдаваемых ${given.join(', ')}`);
}

// ── one holds its species' and its role's perks beside its own learned ones; the forge-master's fire is a perk
{
  const forge = {species: 'dwarf', fightRole: 'forgemaster', perks: [{id: 'oldWolf', rank: 1}]}, plain = {species: 'dwarf', fightRole: 'smith', perks: []};
  const held = perksOf(forge).map(p => p.id);
  ok(held.includes('oldWolf') && held.includes('fireproof') && !perksOf(plain).some(p => p.id === 'fireproof'), 'мастер горна: свой перк и «Огнестойкость» роли; молотобоец — без неё', held.join(', '));
  const sp = SPECIES.get('dwarf'), a = {...forge, hp: 1}, b = {...plain, hp: 1};
  const hurt = heatHarm(a, sp, sp.heatHarm + 200, 'colonist'), hurt2 = heatHarm(b, sp, sp.heatHarm + 200, 'colonist');
  ok(!hurt && hurt2 && b.hp < 1 && heldOf(forge, 'fireproof')?.heat, 'жар земли мастера горна не берёт (перк роли), молотобойца берёт', `${a.hp} / ${b.hp.toFixed(3)}`);
  const vg = perksOf({species: 'spider'}).find(p => p.id === 'venom');
  ok(vg?.from === 'species' && vg.rank === 1 && !vg.own, 'паук несёт «Ядовитый укус I» как перк вида', JSON.stringify(vg));
}

// ── a rank is its own row, written out (the author's word 13.11): never × the rank
{
  const fd = PERKS.get('fieldDressing'), wy = PERKS.get('venom');
  ok(perkOf({perks: [{id: 'fieldDressing', rank: 2}]}, 'dressHp') === rowOf(fd, 2).fight.dressHp && perkOf({perks: [{id: 'oldWolf', rank: 3}]}, 'dressHp') === 0,
    'второй ранг перевязи — своя строка, не «× 2»', `${rowOf(fd, 1).fight.dressHp} → ${rowOf(fd, 2).fight.dressHp}`);
  ok(PERKS.all().every(P => !('ranks' in P)) && perkProfile('venom', 5).dmg === wy.rank[4].dmg && perkProfile('venom', 9).dmg === wy.rank[4].dmg,
    'рангов столько, сколько строк; за последним — последняя', `яд: ${wy.rank.length} строк`);
}

// ── the table shows them all, with who holds each
{
  const T = TABLES.find(t => t.id === 'perkAccess'), rows = T?.rows() || [];
  const v = rows.find(r => r.id === 'venom'), f = rows.find(r => r.id === 'fireproof');
  ok(rows.length === PERKS.all().length && /паук/.test(v?.holders || '') && /мастер горна/.test(f?.holders || ''), 'таблица «Перки: кому можно» — все перки и у кого они', `${rows.length} строк; яд: ${v?.holders}`);
}

if (fails) { console.log(`\nperkbook-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nperkbook-check: ok');
