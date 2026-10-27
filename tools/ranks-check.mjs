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
  expect(g2.some(a => hasMark(a, 'officer')) && sideStrength(g2, {now: true}) < sideStrength(g, {now: true}) * (RANK_RULES.pay.settlement + 0.15), `с офицерами банда сильнее купленного: ${Math.round(sideStrength(g2, {now: true}))} против ${Math.round(sideStrength(g, {now: true}))}`);
}

// the dead under wights: the strongest bones of each link; its link follows it, the necromancer above; it falls — they go
// to the necromancer; he is gone too — they lose their way
{
  const {formUndeadLinks} = await import('../src/agents/ranks.js'), retreatMod = await import('../src/agents/behaviours/retreat.js');
  const w = game('wights'); w.fame = 14;
  const g = spawnGroup(w, 'raiders', raiderStrength(14) * 10, {band: 'undead'});
  const wights = g.filter(a => hasMark(a, 'wight')), nec = g.find(a => a.species === 'necromancer');
  expect(wights.length >= 1 && wights.every(o => o.species === 'skeleton' && o.name === 'Умертвие'), `умертвий ${wights.length}`);
  const o = wights[0], link = g.filter(a => a.obeys === o.id);
  expect(link.length >= 2 && link.every(a => a.obeysUp === (nec ? nec.id : null)), 'звено мертвецов не идёт за умертвием или забыло некроманта');
  o.dead = true;
  for (const a of link) retreatMod.retreat.always(w, a);
  expect(nec ? link.every(a => a.obeys === nec.id && !a.lost) : link.every(a => a.lost), 'павшее умертвие: звено не перешло к некроманту');
  if (nec) { nec.dead = true; for (const a of link) retreatMod.retreat.always(w, a); expect(link.every(a => a.lost), 'без умертвия и некроманта мертвецы не разбрелись'); }
  void formUndeadLinks;
  RANK_RULES.settlement = true;   // as the table has it
}

// ranks where they are given: links, officers, the small aura, the fall of an officer
{
  const w = game('ranks-on'), g = spawnGroup(w, 'raiders', raiderStrength(5) * 12, {band: 'bandits'});
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
  const {roleTactic, bandSide} = await import('../src/agents/tactics.js'), {createAgent} = await import('../src/agents/agent.js');
  const {dress} = await import('../src/agents/equipment.js'), {TASKS} = await import('../src/agents/tasks.js'), {TACTICS} = await import('../src/data/behaviour.js'), {canSee} = await import('../src/agents/combat.js'), {maxHp} = await import('../src/agents/agent.js');
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
    expect(roleTactic(w, a, bandSide(w, sq), 14)?.id === 'kite', 'стрелок не отходит от клинка'); }
  // a sentient shield-bearer turns on whoever is on its archer
  { const {w, g, sq} = scene(), s = g[0], arc = g[1]; as(s, 'shield', ['ironspear', 'ironshield']); as(arc, 'archer', ['bow', 'quiver']);
    const near = foe(w, s.x - 1.5, s.y), on = foe(w, arc.x + 1, arc.y + 1); on.task = {id: 'fight', target: arc};
    expect(roleTactic(w, s, bandSide(w, sq), 14)?.target === on, 'щитоносец не прикрыл стрелка'); void near; }
  // a spearman joins on the one a shield-bearer of its band holds
  { const {w, g, sq} = scene(), s = g[0], sp = g[1]; as(s, 'shield', ['ironspear', 'ironshield']); as(sp, 'spearman', ['ironspear']);
    const free = foe(w, sp.x - 1, sp.y), held = foe(w, s.x + 1, s.y + 0.5); held.task = {id: 'fight', target: s};
    expect(roleTactic(w, sp, bandSide(w, sq), 14)?.target === held, 'копейщик не бьёт того, кого держит щитоносец'); void free; }
  // a cutthroat creeps and goes for the archer, not the nearest
  { const {w, g, sq} = scene(), a = g[0]; as(a, 'cutthroat', ['irondagger', 'irondagger']);
    const near = foe(w, a.x + 3, a.y), bow = foe(w, a.x + 6, a.y, ['bow', 'quiver']);
    const t = roleTactic(w, a, bandSide(w, sq), 14);
    expect(a.sneaking && t?.target === bow, `головорез: крадётся ${a.sneaking}, цель ${t?.target === bow ? 'стрелок' : t?.target === near ? 'ближний' : '—'}`); }
  // a healer goes to the fallen one of its band and puts it back on its feet
  { const {w, g, sq} = scene(), h = g[0], f = g[2]; as(h, 'healer', ['staff']); foe(w, h.x + 12, h.y);
    f.downed = {until: w.tick + 9999}; f.hp = 0.01;
    const t = roleTactic(w, h, bandSide(w, sq), 14);
    expect(t?.id === 'mend' && t.who === f.id, 'знахарь не идёт к упавшему');
    h.task = t; for (let k = 0; k < 200 && f.downed; k++) { w.tick++; TASKS.get('mend').step(w, h, h.task); if (!h.task) break; }
    expect(!f.downed, 'знахарь не поднял упавшего');
    expect(f.hp >= TACTICS.mend.standUp * maxHp(f) - 1e-9 && !f.fellNoted, 'поднятый знахарем не встал на бой или числится павшим'); }
  // an archer steps back once, then stands and shoots a while before it steps back again
  { const {w, g, sq} = scene(), a = g[0]; as(a, 'archer', ['bow', 'quiver']);
    const c = foe(w, a.x + 1.5, a.y); c.task = {id: 'fight', target: a};
    a.task = roleTactic(w, a, bandSide(w, sq), 14); for (let k = 0; k < TACTICS.kiteFor + 5 && a.task; k++) { w.tick++; TASKS.get('kite').step(w, a, a.task); }
    c.x = a.x + 1.5; c.y = a.y;
    expect(roleTactic(w, a, bandSide(w, sq), 14)?.id !== 'kite', 'стрелок отходит без передышки'); }
  // a cutthroat that fell or was bound creeps no more
  { const {w, g, sq} = scene(), a = g[0]; as(a, 'cutthroat', ['irondagger', 'irondagger']);
    const c = foe(w, a.x + 6, a.y); roleTactic(w, a, bandSide(w, sq), 14);
    const crept = a.sneaking; a.downed = {until: w.tick + 999};
    expect(crept && canSee(w, c, a), 'упавшего головореза не видно'); }
}

// the caravan's people fight in roles too: by their place in the company and their gear; a sentient shield-bearer of the
// caravan covers its archer as a band's does
{
  const {kitRole, roleTactic, caravanSide} = await import('../src/agents/tactics.js'), {createAgent} = await import('../src/agents/agent.js');
  const {dress} = await import('../src/agents/equipment.js');
  const w = game('caravan'); w.agents = w.agents.filter(a => a.faction !== 'colony');
  const man = (kit, place, extra = {}) => { const a = createAgent(w, 'human', 'colony', 30, 30); a.equip = {left: null, right: null, body: null, back: null}; dress(a, kit, 15); a.place = place; Object.assign(a, extra); return a; };
  const cases = [[['ironspear', 'ironshield'], 'knight', 'shield'], [['bow', 'quiver'], 'squire', 'archer'], [['crossbow', 'quiver'], 'sellsword', 'archer'],
    [['sling'], 'guide', 'skirmisher'], [['ironjavelin', 'ironshield'], 'companion', 'skirmisher'], [['irondagger', 'irondagger'], 'companion', 'cutthroat'],
    [['irondagger', 'irondagger'], 'knight', 'cleaver'], [['ironspear'], 'squire', 'spearman'], [['ironwarhammer'], 'knight', 'cleaver'], [['net', 'club'], 'companion', 'catcher'],
    [['staff'], 'companion', 'healer', {master: {skill: 'medicine'}}], [['ironspear'], 'captive', null, {captive: {since: 0}}]];
  for (const [kit, place, want, extra] of cases) { const a = man(kit, place, extra); expect(kitRole(a) === want, `${place} с ${kit.join('+')}: ${kitRole(a)}, а должно ${want}`); }
  // a sentient shield-bearer of the caravan turns on whoever is on its archer
  w.campaign = {people: new Map()};
  const s = man(['ironspear', 'ironshield'], 'knight'), arc = man(['bow', 'quiver'], 'squire');
  s.member = 1; arc.member = 2; w.campaign.people.set(1, s).set(2, arc); s.fightRole = kitRole(s); arc.fightRole = kitRole(arc);
  arc.x = s.x + 2;
  const foe = createAgent(w, 'human', 'raiders', arc.x + 1, arc.y + 1); dress(foe, ['ironaxe']); foe.task = {id: 'fight', target: arc};
  createAgent(w, 'human', 'raiders', s.x - 1.5, s.y);
  expect(roleTactic(w, s, caravanSide(w), 14)?.target === foe, 'щитоносец каравана не прикрыл своего стрелка');
}

// the band's plan survives the ranks: a band that came to loot keeps its looters when its weakest stay home; the orcs bring
// their ogres again (a role no link has a place for comes in among the links)
{
  let looted = 0, bands = 0, ogres = 0;
  for (let i = 0; i < 12; i++) {
    const w = game('plan' + i), g = spawnGroup(w, 'raiders', raiderStrength(8) * 8, {band: 'bandits'}), sq = squadOf(w, g[0]);
    if (sq?.goal === 'loot') { bands++; if (g.some(a => a.sqRole === 'looter' && !a.gone)) looted++; }
  }
  const {RAID_BANDS} = await import('../src/data/raids.js'), {mulberry} = await import('../src/core/rng.js'), r = mulberry(5);
  for (let i = 0; i < 40; i++) ogres += RAID_BANDS.get('orcs').members({}, r, raiderStrength(15) * 14, 15).filter(m => m.species === 'ogre').length;
  expect(looted === bands, `банды за добычей без грабителей: ${bands - looted} из ${bands}`);
  expect(ogres > 0, 'огры не приходят с орками');
}

if (bad.length) { console.log('Роли и ранги:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   роли и ранги: бойцы в ролях своей матрицы и с их вещами, звери выучены; звенья под офицерами держат строй, павший офицер шатает дух; ранги в набегах на поселение выключаются таблицей, офицеров оплачивают слабейшие; умертвия ведут мертвецов, павшее передаёт их некроманту; стрелок отходит от клинка, щитоносец прикрывает стрелка, копейщик бьёт удержанного, головорез крадётся к стрелку, знахарь поднимает упавшего; у каравана роли по месту в дружине и снаряжению`);
