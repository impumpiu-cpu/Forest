// The guild's branches and its move (campaign/branches.js; data/guild.js GUILD.branch; plan claude/guild-plan.md Г7, the
// author's word 14.11): the branches the guild's level allows; a branch idle without its manager; at work — its contracts on
// the board besides the board's own, its door, its town's goods; a party of its contract out of it and back to it, the local
// fame; the road between houses; a branch lost with its town, idle in a war; the move to a branch's town and to a bare one —
// the downtime, the rooms lost, the old house a branch, those tied to the town staying; saved and loaded, the same branches.
//   node tools/branch-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, foundGuild, hire, stepGuild, guildBoard, launch, launchWhy, membersOf, takeChore, choreWhy, refreshRecruits, roomLevel, buildRoom, shopOf, parties,
  branchesOf, branchAt, branchesMost, branchIdle, branchWorks, houseTown, managerOf, openWhy, openBranch, closeBranch, managerWhy, setManager, roadDays, transferWhy, transfer,
  moveWhy, moveGuild, tiedHere, takeRecruit, recruitWhy, rosterMost, buyItem, buyPrice, priceK, payK, tierAt, feeK} from '../src/campaign/index.js';
import {localFame} from '../src/campaign/branches.js';
import {tierOf} from '../src/campaign/contracts.js';
import {contractsOf} from '../src/campaign/contracts.js';
import {relKey} from '../src/atlas/common.js';
import {GUILD} from '../src/data/guild.js';
import {ROOMS} from '../src/data/rooms.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const throws = f => { try { f(); return null; } catch (e) { return e.message; } };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base));
const cap = capitals(base)[0];
const io = {pay: (g, gold, why) => { g.gold = Math.round((g.gold + gold) * 10) / 10; g.ledger.push({day: g.day, gold, why}); }, tell: () => {}, r: () => 0.5};
const BR = GUILD.branch, need = L => GUILD.level.need[L];
const opened = (fame = need(3)) => { const a = loadAtlas(JSON.parse(frozen)), G = foundGuild(a, cap.town); G.fame = fame; hire(a, G.candidates.slice(0, GUILD.start.pick).map(m => m.id)); G.gold = 5000; return [a, G]; };
const others = (a, G) => a.towns.filter(t => t.alive && t.id !== G.town).sort((p, q) => roadDays(a, G.town, p.id) - roadDays(a, G.town, q.id));
const season = (a, n = 1) => { for (let k = 0; k < n; k++) stepGuild(a); };
const atBranch = (G, town) => membersOf(G).filter(m => m.house === town);
// a branch at work: opened at the nearest town, a manager sent from home (on the road till he comes)
function working(a, G, t) {
  openBranch(a, G, t.id, io);
  const m = membersOf(G, 'ready')[0]; m.level = Math.max(m.level || 1, BR.manager.level);
  setManager(a, G, t.id, m.id, io);
  for (let k = 0; k < 4 && !managerOf(G, branchAt(G, t.id)); k++) season(a);
  return m;
}

// ── how many: by the guild's level
{
  const [a, G] = opened(0), t = others(a, G)[0];
  ok(!!openWhy(a, G, t.id) && branchesMost(G) === 0, `гильдии 0-го уровня филиала не открыть (${openWhy(a, G, t.id)})`);
  G.fame = need(3); ok(branchesMost(G) === 1 && !openWhy(a, G, t.id), 'с 3-го уровня — один филиал');
  openBranch(a, G, t.id, io);
  ok(!!openWhy(a, G, others(a, G)[1].id), `второй — нельзя на 3-м уровне (${openWhy(a, G, others(a, G)[1].id)})`);
  G.fame = need(6); ok(branchesMost(G) === 2 && !openWhy(a, G, others(a, G)[1].id), 'с 6-го — два');
  G.fame = need(9); ok(branchesMost(G) === 3, 'с 9-го — три');
  ok(G.ledger.some(l => l.why.startsWith('филиал в') && l.gold === -BR.cost[0]), `открытие стоит ${BR.cost[0]} зол.`);
}

// ── a manager: idle without him; sent from home by the road; his Charisma
{
  const [a, G] = opened(), t = others(a, G)[0];
  openBranch(a, G, t.id, io);
  const br = branchAt(G, t.id);
  ok(branchIdle(a, G, br) === 'нет управляющего', 'без управляющего филиал стоит');
  const low = membersOf(G, 'ready').find(m => (m.level || 1) < BR.manager.level);
  if (low) ok(!!managerWhy(a, G, t.id, low), `управляющий — не ниже ${BR.manager.level}-го уровня`);
  const m = membersOf(G, 'ready')[0]; m.level = BR.manager.level;
  setManager(a, G, t.id, m.id, io);
  ok(m.guild.state === 'road' && m.guild.to === t.id && m.guild.until - G.day === roadDays(a, G.town, t.id), `управляющий идёт туда по дороге: ${roadDays(a, G.town, t.id)} дн.`);
  for (let k = 0; k < 4 && !managerOf(G, br); k++) season(a);
  ok(managerOf(G, br) === m && m.house === t.id && branchWorks(a, G, br), 'пришёл — принял филиал, живёт там; филиал работает');
}

// ── at work: its contracts besides the board's, its door, its town's goods
{
  const [a, G] = opened();
  let t = null;
  for (const x of others(a, G).slice(0, 6)) { const [a2, G2] = opened(); working(a2, G2, x); season(a2); if (contractsOf(a2).records.some(c => c.state === 'open' && c.branch === x.id)) { t = x; break; } }
  ok(!!t, 'есть город, где филиал вывешивает договоры', t?.name);
  if (t) {
    working(a, G, t); season(a);
    const C = contractsOf(a).records.filter(c => c.state === 'open'), mine = C.filter(c => c.branch === t.id), home = C.filter(c => c.branch == null && !c.side);
    ok(mine.length >= 1 && mine.length <= BR.slots, `договоры филиала: ${mine.length} (не больше ${BR.slots})`);
    ok(home.length <= 4, `доска дома — по-прежнему не больше своих 4 мест (${home.length})`);
    const card = guildBoard(a, []).errands.find(e => e.branch === t.id);
    ok(!!card && card.facts[0].startsWith('Из филиала'), 'карточка помечена: из филиала');
    const rs = (G.recruits || []).filter(m => m.house === t.id);
    ok(rs.length >= BR.door[0] && rs.length <= BR.door[1], `у дверей филиала ${rs.length} (${BR.door.join('–')}), живут там`);
    const items = shopOf(a, G).items, far = items.filter(o => o.at === t.id);
    ok(far.every(o => !items.some(x => x.token === o.token && x.at == null)), `товар города филиала — то, чего нет дома (${far.length} поз.)`);

    // a party of the branch's contract: those of the house not, those of the branch yes; out of it and back to it
    const rec = mine[0], homeIds = membersOf(G, 'ready').filter(m => m.house == null).slice(0, 2).map(m => m.id);
    ok(!!launchWhy(a, {ids: homeIds, contract: rec.uid}), `живущим дома договор филиала не взять (${launchWhy(a, {ids: homeIds, contract: rec.uid})})`);
    const go = membersOf(G, 'ready').filter(m => m.house == null && m !== managerOf(G, branchAt(G, t.id))).slice(0, 4);
    for (const m of go) { m.level = 12; transfer(a, G, m.id, t.id, io); }
    ok(go.every(m => m.guild.state === 'road') && G.ledger.some(l => l.why.startsWith('дорога:')), 'перевод — по дороге и за плату');
    for (let k = 0; k < 4 && go.some(m => m.guild.state === 'road'); k++) season(a);
    ok(go.every(m => m.house === t.id && m.guild.state === 'ready'), 'дошли — живут в филиале');
    ok(!!choreWhy(a, G.offers[0], go.slice(0, 1).map(m => m.id)) || !G.offers.length, 'дела в городе — не для живущих в филиале');
    const rec2 = contractsOf(a).records.find(c => c.state === 'open' && c.branch === t.id);
    if (rec2) {
      const why = launchWhy(a, {ids: go.map(m => m.id), contract: rec2.uid});
      ok(!why, `живущим в филиале — можно${why ? ` (${why})` : ''}`);
      if (!why) {
        const K = launch(a, {contract: rec2.uid, ids: go.map(m => m.id), mode: 'auto'}), fame0 = branchAt(G, t.id).fame;
        ok(K.capital === t.id, 'отряд выходит из города филиала');
        for (let k = 0; k < 12 && parties(a).length; k++) season(a);
        const back = go.filter(m => m.alive && m.guild.state !== 'dead');
        ok(!parties(a).length && back.every(m => m.house === t.id), `вернулись в филиал (${back.length} из ${go.length})`);
        const won = G.expeditions.at(-1)?.how === 'вернулся с победой';
        ok(!won || branchAt(G, t.id).fame > fame0, `местная слава: ${fame0} → ${branchAt(G, t.id).fame}${won ? '' : ' (не победили)'}`);
      }
    }

    // saved and loaded: the same branches, the same houses
    const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
    ok(JSON.stringify(b.guild.branches) === JSON.stringify(G.branches) && b.guild.members.filter(m => m.house === t.id).length === G.members.filter(m => m.house === t.id).length, 'сохранено и загружено — те же филиалы и жильцы');

    // a war with its realm: idle; its town fallen: lost, its people on the road home, its contracts off
    const R = t.realm != null && t.realm !== G.realm ? (a.rel ||= {})[relKey(G.realm, t.realm)] : null;
    if (R) { const was = R.war; R.war = {since: 0}; ok(branchIdle(a, G, branchAt(G, t.id)) === 'его держава воюет с нашей', 'война с его державой — филиал стоит'); R.war = was; }
    const people = atBranch(G, t.id).filter(m => m.guild.state === 'ready' || m.guild.state === 'post');
    t.alive = false; season(a);
    ok(!branchAt(G, t.id), 'город пал — филиал потерян');
    ok(people.every(m => !m.alive || m.guild.state === 'road' || m.house == null), 'его люди идут домой');
    ok(!contractsOf(a).records.some(c => c.state === 'open' && c.branch === t.id), 'его договоры сняты');
  }
}

// ── the goods of a town of another people: on the guild's racks' shop, at its prices × the manager's; paid to that town
{
  const [a, G] = opened(), home = new Set(shopOf(a, G).items.map(o => o.token));
  const t = others(a, G).find(x => { const [a2, G2] = opened(); openBranch(a2, G2, x.id, io); const m = membersOf(G2, 'ready')[0]; m.level = BR.manager.level; m.house = x.id; setManager(a2, G2, x.id, m.id, io); return shopOf(a2, G2).items.some(o => o.at === x.id); });
  ok(!!t, 'есть город с чужим товаром', t?.name);
  if (t) {
    openBranch(a, G, t.id, io);
    ok(!shopOf(a, G).items.some(o => o.at === t.id), 'филиал стоит — его товара нет');
    const m = membersOf(G, 'ready')[0]; m.level = BR.manager.level; m.house = t.id; m.special.C = 9;
    setManager(a, G, t.id, m.id, io);
    ok(managerOf(G, branchAt(G, t.id)) === m, 'живущий в филиале принимает его сразу');
    const far = shopOf(a, G).items.filter(o => o.at === t.id), o = far[0];
    ok(far.length > 0 && far.every(x => !home.has(x.token)), `товар филиала: ${far.length} поз., того, чего нет дома (${o?.label})`);
    ok(o.price === Math.max(1, Math.round(buyPrice(G, o.token) * priceK(G, branchAt(G, t.id)))) && priceK(G, branchAt(G, t.id)) < 1 && feeK(G, branchAt(G, t.id)) < 1, `Харизма 9 у управляющего — дешевле: цена ×${priceK(G, branchAt(G, t.id)).toFixed(2)}, найм ×${feeK(G, branchAt(G, t.id)).toFixed(2)}`);
    buildRoom(a, 'armory', io); season(a);
    const mk = x => x.makersGold ?? 0, o2 = shopOf(a, G).items.find(x => x.at === t.id), hm = a.towns.find(x => x.id === G.town), g0 = mk(t), h0 = mk(hm);
    if (o2) { buyItem(a, G, o2.token, io.pay); ok(mk(t) > g0 && mk(hm) === h0, `купленное в городе филиала оплачено его мастерам (+${Math.round((mk(t) - g0) * 10) / 10} зол.), не дому`); }
    // local fame: the pay of its town × (1 + pay × fame), and one tier above from `tier`
    const br = branchAt(G, t.id); localFame(G, t.id, BR.fame.tier);
    ok(br.fame === BR.fame.tier * BR.fame.share && payK(br) > 1 && tierAt(G, br) === Math.min(5, tierOf(G) + 1), `местная слава ${br.fame}: плата ×${payK(br).toFixed(2)}, тир ${tierAt(G, br)} при тире гильдии ${tierOf(G)}`);
  }
}

// ── the move to a branch's town: a season or two; nothing new meanwhile; rooms a level lower; the old house a branch; the tied stay
{
  const [a, G] = opened(), t = others(a, G)[0], old = G.town;
  working(a, G, t);
  buildRoom(a, 'barracks', io); season(a);
  for (let k = 0; k < 6 && membersOf(G).length < 10; k++) { if (!(G.recruits || []).length) season(a); const r = (G.recruits || []).find(x => !recruitWhy(a, x.id) && x.house == null); if (r) takeRecruit(a, r.id); }
  const L0 = roomLevel(G, 'barracks'), tied = membersOf(G, 'ready').find(m => m.house == null); tied.wedTown = {year: 0};
  ok(!!tiedHere(a, G, tied), 'женатый в городе — привязан к нему');
  ok(!moveWhy(a, G, t.id), 'переезд в город филиала возможен');
  moveGuild(a, G, t.id, io);
  ok(!!G.moving && G.moving.until - a.hist.step >= BR.move.branch[0] && G.moving.until - a.hist.step <= BR.move.branch[1], `переезд — ${G.moving.until - a.hist.step} сез. (${BR.move.branch.join('–')})`);
  ok(!guildBoard(a, []).errands.length && !guildBoard(a, []).chores.length && !!launchWhy(a, {ids: [tied.id]}), 'пока переезжает — ни дел, ни походов');
  for (let k = 0; k < 4 && G.moving; k++) season(a);
  ok(!G.moving && G.town === t.id, 'переехали');
  ok(roomLevel(G, 'barracks') === Math.max(ROOMS.get('barracks').start, L0 - BR.move.lose.branch), `комнаты теряют ${BR.move.lose.branch} ур.: казармы ${L0} → ${roomLevel(G, 'barracks')}`);
  ok(!!branchAt(G, old) && !branchAt(G, t.id), 'старый дом — теперь филиал, новый — дом');
  { const n = membersOf(G).length, most = rosterMost(G), m0 = membersOf(G).find(m => m.house == null && m.guild.state === 'ready'), mood0 = m0?.mood ?? 0, log0 = G.log.length;
    ok(n > most, `людей больше, чем коек: ${n} на ${most} — никого не выгнали`);
    const r = (G.recruits || [])[0]; if (r) ok(!!recruitWhy(a, r.id), `нанять сверх коек нельзя (${recruitWhy(a, r.id)})`);
    season(a);
    ok(membersOf(G).length === n && G.log.slice(log0).some(l => l.text.startsWith('В казармах тесно')) && (m0.mood ?? 0) < mood0 + GUILD.mood.won, `тесно — люди ворчат: настроение ${mood0} → ${m0.mood}`); }
  ok(tied.house === old, 'привязанный к старому городу остался там');
  ok(membersOf(G).filter(m => m !== tied && m.alive && m.guild.state !== 'road').every(m => houseTown(G, m) === t.id || m.house === old), 'остальные — в новом доме');
}

// ── a bare move: a house bought, a year or two, two levels lost; no place for a branch — the tied may leave
{
  const [a, G] = opened(need(1)), t = others(a, G)[0];
  ok(branchesMost(G) === 0, 'гильдия без филиалов');
  const tied = membersOf(G, 'ready')[0]; tied.wedTown = {year: 0};
  const gold = G.gold; moveGuild(a, G, t.id, io);
  ok(G.gold === gold - BR.move.house, `дом в новом городе — ${BR.move.house} зол.`);
  ok(G.moving.until - a.hist.step >= BR.move.bare[0] && G.moving.until - a.hist.step <= BR.move.bare[1], `без филиала — ${G.moving.until - a.hist.step} сез. (${BR.move.bare.join('–')})`);
  ok(tied.guild.state === 'left' || tied.guild.state === 'road', `привязанный: ${tied.guild.state === 'left' ? 'ушёл из гильдии' : 'поехал со всеми'}`);
  for (let k = 0; k < 9 && G.moving; k++) season(a);
  ok(!G.moving && G.town === t.id && !branchesOf(G).length, 'переехали; старый дом не стал филиалом (уровень не позволяет)');
}

console.log(fails ? `\n${fails} FAIL` : '\nвсё ок');
process.exit(fails ? 1 : 0);
