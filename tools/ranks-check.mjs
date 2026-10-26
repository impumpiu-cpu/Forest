// Roles and ranks of a band (docs/BEHAVIOUR.md «Роли в отряде», «Ранги и звенья»): every fighter who carries things
// comes in a role the matrix allows it, with the kit of that role; a big band splits into links under officers (finer,
// sturdier, holding their link to the ground while they stand); an officer's fall shakes its link's share of the band;
// a settlement's raids take no ranks unless data/ranks.js says so. Part of `npm test`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {spawnGroup} from '../src/settlement/migration.js';
import {RANK_RULES} from '../src/data/ranks.js';
import {COMBAT_ROLES, rolesOf} from '../src/data/roles.js';
import {raiderStrength} from '../src/data/raids.js';
import {squadOf, moraleOf, noteFallen} from '../src/agents/squad.js';
import {holdsGround} from '../src/agents/auras.js';
import {maxHp} from '../src/agents/agent.js';
import {hasMark} from '../src/data/conditions.js';
import {allItems} from '../src/agents/equipment.js';

const bad = [];
const expect = (ok, what) => { if (!ok) bad.push(what); };
const game = seed => newGame({...DEFAULT_CFG, seed, size: 'small', raids: 'off'});

// roles: what the matrix allows, the kit of the role
{
  const w = game('roles');
  for (const band of ['bandits', 'orcs', 'goblins', 'darkelves', 'gnolls']) {
    const g = spawnGroup(w, 'raiders', raiderStrength(10) * 8, {band});
    for (const a of g.filter(x => !x.warBeast)) {
      const may = rolesOf(a.species).map(([r]) => r);
      expect(a.fightRole && may.includes(a.fightRole), `${band}: ${a.species} в роли «${a.fightRole}», а может ${may.join(', ')}`);
      const R = COMBAT_ROLES.get(a.fightRole), ranged = !!a.gear?.ranged;
      if (R.squad === 'shooter') expect(ranged, `${band}: ${a.fightRole} без стрелкового оружия`);
      if (a.fightRole === 'cutthroat') expect(!!a.gear?.offhand || allItems(a).filter(it => /dagger|hatchet/.test(it.type)).length >= 1, `${band}: головорез без кинжала или топорика`);
      if (a.fightRole === 'catcher') expect(allItems(a).some(it => /net$/.test(it.type)), `${band}: ловчий без сети`);
      if (a.fightRole === 'shield') expect(allItems(a).some(it => it.type.endsWith('shield')), `${band}: щитоносец без щита`);
    }
    expect(!g.filter(x => !x.warBeast).some(a => a.species === 'darkelf' && a.fightRole === 'shield'), 'тёмный эльф со щитом');
    for (const a of g.filter(x => x.warBeast)) expect(hasMark(a, 'trained') && !a.fightRole, `${band}: боевой зверь без выучки или с ролью`);
  }
}

// a settlement's raid: no ranks by default
{
  const w = game('ranks-off'), g = spawnGroup(w, 'raiders', raiderStrength(5) * 12, {band: 'bandits'});
  expect(RANK_RULES.settlement === false && !g.some(a => hasMark(a, 'officer')), 'набег на поселение пришёл с офицерами');
}

// ranks where they are given: links, officers, the small aura, the fall of an officer
{
  RANK_RULES.settlement = true;
  const w = game('ranks-on'), g = spawnGroup(w, 'raiders', raiderStrength(5) * 12, {band: 'bandits'});
  RANK_RULES.settlement = false;
  const officers = g.filter(a => hasMark(a, 'officer')), sq = squadOf(w, g[0]);
  expect(officers.length === Math.ceil(g.length / RANK_RULES.size), `офицеров ${officers.length} на ${g.length} голов`);
  expect(officers.some(o => o.id === sq.leader), 'вожак банды — не офицер');
  expect(g.every(a => a.link != null && officers.some(o => o.id === a.link)), 'не у всех есть звено');
  expect(officers.every(o => o.name !== 'Налётчик'), 'офицер без звания');
  const o = officers.find(x => x.id !== sq.leader) || officers[0], pawn = g.find(a => a.link === o.id && a !== o);
  expect(allItems(o).some(it => (it.q || 0) >= RANK_RULES.quality), 'у офицера вещи не лучше');
  pawn.hp = maxHp(pawn) * (RANK_RULES.hurt + 0.1);
  expect(holdsGround(w, pawn), 'раненая пешка бежит, хотя её офицер стоит');
  const m0 = moraleOf(w, sq);
  o.dead = true; noteFallen(w, o);
  expect(!holdsGround(w, pawn), 'пешка стоит, хотя её офицер пал');
  expect(moraleOf(w, sq) < m0 - RANK_RULES.loss * 0.1, `павший офицер не пошатнул дух: ${m0.toFixed(2)} → ${moraleOf(w, sq).toFixed(2)}`);
}

if (bad.length) { console.log('Роли и ранги:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   роли и ранги: бойцы в ролях своей матрицы и с их вещами, звери выучены; звенья под офицерами держат строй, павший офицер шатает дух; в набегах на поселение рангов нет`);
