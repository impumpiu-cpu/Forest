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

// ranks can be switched off for a settlement's raids (the table «Ранги и звенья»); officers are paid by the band's own
// weakest: the band comes no stronger than it was bought
{
  RANK_RULES.settlement = false;
  const w = game('ranks-off'), g = spawnGroup(w, 'raiders', raiderStrength(5) * 12, {band: 'bandits'});
  RANK_RULES.settlement = true;
  expect(!g.some(a => hasMark(a, 'officer')), 'набег на поселение пришёл с офицерами, хотя ранги выключены');
  const {sideStrength} = await import('../src/agents/strength.js');
  const w2 = game('ranks-off'), g2 = spawnGroup(w2, 'raiders', raiderStrength(5) * 12, {band: 'bandits'});
  expect(g2.some(a => hasMark(a, 'officer')) && sideStrength(g2, {now: true}) < sideStrength(g, {now: true}) * 1.15, `с офицерами банда сильнее купленного: ${Math.round(sideStrength(g2, {now: true}))} против ${Math.round(sideStrength(g, {now: true}))}`);
}

// the dead under wights: the strongest bones of each link; its link follows it, the necromancer above; it falls — they go
// to the necromancer; he is gone too — they lose their way
{
  const {formUndeadLinks} = await import('../src/agents/ranks.js'), retreatMod = await import('../src/agents/behaviours/retreat.js');
  const w = game('wights'); w.fame = 14;
  const g = spawnGroup(w, 'raiders', raiderStrength(14) * 10, {band: 'undead'});
  const wights = g.filter(a => hasMark(a, 'wight')), nec = g.find(a => a.role === 'necromancer');
  expect(wights.length >= 1 && wights.every(o => o.species === 'skeleton' && o.name === 'Умертвие'), `умертвий ${wights.length}`);
  const o = wights[0], link = g.filter(a => a.master === o.id);
  expect(link.length >= 2 && link.every(a => a.masterUp === (nec ? nec.id : null)), 'звено мертвецов не идёт за умертвием или забыло некроманта');
  o.dead = true;
  for (const a of link) retreatMod.retreat.always(w, a);
  expect(nec ? link.every(a => a.master === nec.id && !a.lost) : link.every(a => a.lost), 'павшее умертвие: звено не перешло к некроманту');
  if (nec) { nec.dead = true; for (const a of link) retreatMod.retreat.always(w, a); expect(link.every(a => a.lost), 'без умертвия и некроманта мертвецы не разбрелись'); }
  void formUndeadLinks;
  RANK_RULES.settlement = false;   // as the table has it
}

// ranks where they are given: links, officers, the small aura, the fall of an officer
{
  RANK_RULES.settlement = true;
  const w = game('ranks-on'), g = spawnGroup(w, 'raiders', raiderStrength(5) * 12, {band: 'bandits'});
  RANK_RULES.settlement = false;
  const officers = g.filter(a => hasMark(a, 'officer')), sq = squadOf(w, g[0]);
  // the band came in links (data/roles.js LINKS): one officer to a link (a link of one joins the one before), the members
  // of a link under its officer, the link's kind on each
  const nos = [...new Set(g.map(a => a.linkNo))], whole = nos.filter(no => g.filter(a => a.linkNo === no).length >= 2 || no === nos[0]).length;
  expect(g.every(a => a.linkNo != null && a.linkKind) && officers.length === whole, `звенья: ${nos.length} (полных ${whole}), офицеров ${officers.length}`);
  expect(nos.every(no => new Set(g.filter(a => a.linkNo === no).map(a => a.link)).size === 1), 'бойцы одного звена под разными офицерами');
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

// the roles' own ways (agents/tactics.js), each on a scene of its own: a band of bandits, a few colonists about
{
  const {roleTactic} = await import('../src/agents/tactics.js'), {createAgent} = await import('../src/agents/agent.js');
  const {dress} = await import('../src/agents/equipment.js'), {TASKS} = await import('../src/agents/tasks.js');
  const scene = () => {
    const w = game('tactics'); w.agents = w.agents.filter(a => a.faction !== 'colony');
    const g = spawnGroup(w, 'raiders', raiderStrength(5) * 6, {band: 'bandits'}), sq = squadOf(w, g[0]);
    let x = 30;
    for (const a of g) { a.x = x; a.y = 30; x += 0.7; a.task = null; }
    return {w, g, sq};
  };
  const as = (a, role, kit) => { a.fightRole = role; a.equip = {left: null, right: null, body: null, back: null}; dress(a, kit, 15); a.sqRole = COMBAT_ROLES.get(role).squad === 'shooter' ? 'shooter' : 'front'; };
  const foe = (w, x, y, kit = ['ironspear']) => { const c = createAgent(w, 'human', 'colony', x, y); dress(c, kit); return c; };
  // an archer steps back from a blade coming at it; a mindless one would not
  { const {w, g, sq} = scene(), a = g[0]; as(a, 'archer', ['bow', 'quiver']);
    const c = foe(w, a.x + 1.5, a.y); c.task = {id: 'fight', target: a};
    expect(roleTactic(w, a, sq, 14)?.id === 'kite', 'стрелок не отходит от клинка'); }
  // a sentient shield-bearer turns on whoever is on its archer
  { const {w, g, sq} = scene(), s = g[0], arc = g[1]; as(s, 'shield', ['ironspear', 'ironshield']); as(arc, 'archer', ['bow', 'quiver']);
    const near = foe(w, s.x - 1.5, s.y), on = foe(w, arc.x + 1, arc.y + 1); on.task = {id: 'fight', target: arc};
    expect(roleTactic(w, s, sq, 14)?.target === on, 'щитоносец не прикрыл стрелка'); void near; }
  // a spearman joins on the one a shield-bearer of its band holds
  { const {w, g, sq} = scene(), s = g[0], sp = g[1]; as(s, 'shield', ['ironspear', 'ironshield']); as(sp, 'spearman', ['ironspear']);
    const free = foe(w, sp.x - 1, sp.y), held = foe(w, s.x + 1, s.y + 0.5); held.task = {id: 'fight', target: s};
    expect(roleTactic(w, sp, sq, 14)?.target === held, 'копейщик не бьёт того, кого держит щитоносец'); void free; }
  // a cutthroat creeps and goes for the archer, not the nearest
  { const {w, g, sq} = scene(), a = g[0]; as(a, 'cutthroat', ['irondagger', 'irondagger']);
    const near = foe(w, a.x + 3, a.y), bow = foe(w, a.x + 6, a.y, ['bow', 'quiver']);
    const t = roleTactic(w, a, sq, 14);
    expect(a.sneaking && t?.target === bow, `головорез: крадётся ${a.sneaking}, цель ${t?.target === bow ? 'стрелок' : t?.target === near ? 'ближний' : '—'}`); }
  // a healer goes to the fallen one of its band and puts it back on its feet
  { const {w, g, sq} = scene(), h = g[0], f = g[2]; as(h, 'healer', ['staff']); foe(w, h.x + 12, h.y);
    f.downed = {until: w.tick + 9999}; f.hp = 0.01;
    const t = roleTactic(w, h, sq, 14);
    expect(t?.id === 'mend' && t.who === f.id, 'знахарь не идёт к упавшему');
    h.task = t; for (let k = 0; k < 200 && f.downed; k++) { w.tick++; TASKS.get('mend').step(w, h, h.task); if (!h.task) break; }
    expect(!f.downed, 'знахарь не поднял упавшего'); }
}

if (bad.length) { console.log('Роли и ранги:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   роли и ранги: бойцы в ролях своей матрицы и с их вещами, звери выучены; звенья под офицерами держат строй, павший офицер шатает дух; ранги в набегах на поселение выключаются таблицей, офицеров оплачивают слабейшие; умертвия ведут мертвецов, павшее передаёт их некроманту; стрелок отходит от клинка, щитоносец прикрывает стрелка, копейщик бьёт удержанного, головорез крадётся к стрелку, знахарь поднимает упавшего`);
