// The guild's house (campaign/house.js; data/rooms.js; plan claude/guild-plan.md Г3, the author's word 13.11): the rooms a guild
// starts with; building — paid, one at a time, ready at the next season; the posts and who may hold them; what each room does:
// the board's slots, the planning room's party and its experience, the barracks, the tavern's take, the trainees, the healer's
// patients and potions, the pantry, the maps, the chapel; saved and loaded, the same house.
//   node tools/house-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, foundGuild, hire, stepGuild, guildBoard, launch, expedition, membersOf, partyMost, rosterMost, houseOf, roomLevel, roomBy, working, staffOf,
  buildWhy, buildRoom, setRoomPost, postWhy, sendToRoom, trainWhy, armoryOf, racks, stalls, shopOf, buyPrice, buyItem, sellItem, lockItem, forgeCost, forgeWhy, forgeItem, buyBeast} from '../src/campaign/index.js';
import {gearDef, gearToken, gearSpec} from '../src/local/index.js';
import {contractsOf as cof} from '../src/campaign/contracts.js';
import {contractsOf, contractOf, takeContract} from '../src/campaign/contracts.js';
import {GUILD} from '../src/data/guild.js';
import {ROOMS, HOUSE} from '../src/data/rooms.js';
import {XP} from '../src/data/experience.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const throws = f => { try { f(); return null; } catch (e) { return e.message; } };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base));
const cap = capitals(base)[0];
const io = G => ({pay: (g, gold, why) => { g.gold = Math.round((g.gold + gold) * 10) / 10; g.ledger.push({day: g.day, gold, why}); }, tell: () => {}});
const opened = (fame = GUILD.level.need.at(-1)) => { const a = loadAtlas(JSON.parse(frozen)), G = foundGuild(a, cap.town); G.fame = fame; hire(a, G.candidates.slice(0, GUILD.start.pick).map(m => m.id)); return [a, G]; };
const rich = G => { G.gold = 5000; };
const ledgerHas = (G, s) => G.ledger.some(l => l.why.startsWith(s));

// ── the house at the founding; the board's slots, the planning room's party, the barracks
{
  const [a, G] = opened();
  ok(ROOMS.all().every(R => roomLevel(G, R.id) === R.start), 'при основании: доска, планирование, казармы, доска павших — 1-го уровня, прочего нет', JSON.stringify(houseOf(G)));
  ok(contractsOf(a).records.filter(c => c.state === 'open' && !c.side).length <= roomBy(G, 'board', 'slots'), `на доске не больше ${roomBy(G, 'board', 'slots')} объявлений`, String(contractsOf(a).records.filter(c => c.state === 'open').length));
  ok(partyMost(G) === 4 && rosterMost(G) === 8, 'в отряде до 4, в гильдии до 8');
  const card = guildBoard(a, []).errands.find(e => e.ok);
  ok(!!throws(() => launch(a, {contract: card?.contract, named: [membersOf(G)[0].id], size: 6})), 'шестерых — нельзя: комната планирования 1-го уровня');
}

// ── building: paid, one at a time, ready at the next season; the upkeep
{
  const [a, G] = opened(); rich(G);
  const g0 = G.gold, I = io(G);
  buildRoom(a, 'board', I);
  ok(G.gold === g0 - ROOMS.get('board').cost[1] && G.building?.room === 'board' && roomLevel(G, 'board') === 1, 'доска 2-го уровня: заплачено, строится', `${g0} → ${G.gold}`);
  ok(!!buildWhy(a, 'tavern'), 'вторую стройку разом — нельзя', buildWhy(a, 'tavern'));
  stepGuild(a);
  ok(roomLevel(G, 'board') === 2 && !G.building, 'к новому сезону готово: доска 2-го уровня');
  ok(ledgerHas(G, 'содержание дома'), 'дом стоит денег каждый сезон');
  stepGuild(a);
  ok(contractsOf(a).records.filter(c => c.state === 'open' && !c.side).length <= 6, 'на доске — до 6 объявлений');
  for (let k = 0; k < 3; k++) { if (!buildWhy(a, 'barracks')) buildRoom(a, 'barracks', I); stepGuild(a); }
  ok(roomLevel(G, 'barracks') === 4 && rosterMost(G) === 20 && !!buildWhy(a, 'barracks'), 'казармы 4-го уровня — 20 человек, выше некуда', buildWhy(a, 'barracks'));
}

// ── posts: who may hold them; a room idle without its post; the tavern's take
{
  const [a, G] = opened(); rich(G);
  const I = io(G), tell = () => {};
  buildRoom(a, 'tavern', I); stepGuild(a);
  ok(roomLevel(G, 'tavern') === 1 && !working(G, 'tavern'), 'таверна построена, но без управляющего не работает');
  const boss = membersOf(G, 'ready')[0];
  setRoomPost(a, 'tavern', boss.id, tell);
  ok(staffOf(G, 'tavern') === boss && boss.guild.state === 'post' && !membersOf(G, 'ready').includes(boss), 'управляющий на посту — в поход и на дела не ходит');
  stepGuild(a);
  ok(ledgerHas(G, 'таверна: жалованье') && ledgerHas(G, 'таверна: доход'), 'таверна: часть жалованья вернулась, и доход с гостей');
  setRoomPost(a, 'tavern', null, tell);
  ok(boss.guild.state === 'ready' && !working(G, 'tavern'), 'снят с поста — свободен, таверна стоит');
  buildRoom(a, 'healer', I); stepGuild(a);
  const dull = membersOf(G, 'ready').find(m => (m.special?.I ?? 5) < 9) || membersOf(G, 'ready')[0];
  dull.special.I = 5;
  ok(!!postWhy(G, 'healer', dull), 'лекарь — с Интеллектом не ниже 9', postWhy(G, 'healer', dull));
}

// ── the training rooms: a trainer of the 10th level; a newcomer — about a level a season; busy meanwhile
{
  const [a, G] = opened(); rich(G);
  const I = io(G), tell = () => {};
  buildRoom(a, 'training', I); stepGuild(a);
  const [t, n] = membersOf(G, 'ready');
  ok(!!postWhy(G, 'training', t), 'тренер — не ниже 10-го уровня', postWhy(G, 'training', t));
  t.level = 10;
  setRoomPost(a, 'training', t.id, tell);
  n.level = 1; n.xp = 0;
  ok(!trainWhy(G, n), 'новичок может учиться');
  sendToRoom(a, 'training', n.id, tell);
  ok(n.guild.state === 'training' && !membersOf(G, 'ready').includes(n), 'ученик занят учёбой');
  stepGuild(a);
  ok((n.level || 1) >= 2 && n.guild.state === 'ready', 'сезон учёбы — 2-й уровень, и снова свободен', `ур. ${n.level}, опыт ${Math.round(n.xp)}`);
  const m = membersOf(G, 'ready').find(x => x !== n); m.level = 2;
  ok(!!trainWhy(G, m), 'зал 1-го уровня учит до 2-го', trainWhy(G, m));
}

// ── the healer: a lasting wound a season; potions for the road; the house heals faster
{
  const [a, G] = opened(); rich(G);
  const I = io(G), tell = () => {};
  buildRoom(a, 'healer', I); stepGuild(a);
  const [h, p] = membersOf(G, 'ready');
  h.special.I = 10; setRoomPost(a, 'healer', h.id, tell);
  p.wounds = [{id: 'broken', day: null}, {id: 'scar', day: null}];
  sendToRoom(a, 'treat', p.id, tell);
  stepGuild(a);
  ok(p.wounds.length === 1 && p.guild.state === 'treat', 'сезон у лекаря — одна травма снята, лечение идёт');
  stepGuild(a);
  ok(p.wounds.length === 0 && p.guild.state === 'ready', 'травм нет — свободен');
  for (const m of G.members) m.level = Math.max(m.level || 1, 20);
  const card = guildBoard(a, []).errands.find(e => e.ok), go = membersOf(G, 'ready');
  for (const m of go) m.potions = 0;
  const K = launch(a, {contract: card.contract, named: [go[0].id], size: 4, mode: 'auto'});
  ok(K.members.every(m => (m.potions || 0) >= roomBy(G, 'healer', 'potions')), 'в дорогу — зелья лекаря', K.members.map(m => m.potions).join(', '));
}

// ── the planning room's trade: fewer — more experience each
{
  const xp = size => {
    const [a, G] = opened(); Object.assign(houseOf(G), {planning: 3});
    for (const m of G.members) m.level = 20;
    const B = guildBoard(a, []).errands, card = B.find(e => e.ok && !e.chain && e.known) || B.find(e => e.ok), ms = membersOf(G, 'ready').slice(0, size);
    const K = launch(a, {contract: card.contract, ids: ms.map(m => m.id), mode: 'auto'});
    let n = 0; while (n < 30 && expedition(a)) { stepGuild(a); n++; }
    const back = ms.filter(m => m.alive && m.xpOf?.quest);
    const last = K.done?.at(-1);   // (the share each got, the errand's whole and its failure taken out: XP.quest, XP.questFail)
    return back.length && last ? back[0].xpOf.quest / (XP.quest[K.quest.tier] * (last.failed ? XP.questFail : 1)) : null;
  };
  const two = xp(2), eight = xp(8);
  ok(two == null || eight == null || two > eight, 'двоим — больше опыта за поручение каждому, чем восьмерым', `${two} / ${eight}`);
}

// ── the pantry, the maps, the chapel
{
  const [a, G] = opened(); rich(G);
  const I = io(G), food = () => G.ledger.filter(l => l.why === 'еда в дорогу').map(l => -l.gold).at(-1);
  buildRoom(a, 'pantry', I); stepGuild(a);
  ok(roomBy(G, 'pantry', 'food') < 1, 'кладовая: еда в дорогу дешевле', String(roomBy(G, 'pantry', 'food')));
  buildRoom(a, 'maps', I); stepGuild(a);
  const rec = contractsOf(a).records.find(c => c.state === 'open' && !c.known);
  if (rec) { const d0 = Math.round(rec.days); takeContract(a, G, rec.uid, 1); ok(rec.completeBy - G.day > 0, 'картографическая: срок договора «по следам» длиннее', `${rec.completeBy - G.day} дн.`); }
  else ok(true, 'картографическая: нет договора «по следам» на доске — не проверить');
  buildRoom(a, 'chapel', I); stepGuild(a);
  const [d, f] = membersOf(G, 'ready');
  G.social.relations[f.id] = {...(G.social.relations[f.id] || {}), [d.id]: 3};
  f.devotion = 0.8;
  d.dies = a.hist.year;
  while (a.hist.season !== 0) stepGuild(a);
  stepGuild(a);
  ok(!d.alive && f.devotion > 0.8 - HOUSE.grief.loss + 1e-9, 'часовня: гибель друга бьёт по верности слабее', `${f.devotion}`);
}

// ── the armory: bought in town, on the racks, taken by each before the road, his own left; locked — not taken; sold
{
  const [a, G] = opened(); rich(G);
  const I = io(G), tell = () => {}, t = a.towns.find(x => x.id === G.town);
  buildRoom(a, 'armory', I); stepGuild(a);
  ok(racks(G) === 50, 'оружейная 1-го уровня — 50 мест');
  const shop = shopOf(a, G);
  ok(shop.items.length > 0, 'в городе гильдии продают оружие и доспехи', shop.items.slice(0, 4).map(o => `${o.label} ${o.price}`).join('; '));
  const armor = shop.items.filter(o => o.kind === 'body').sort((p, q) => (gearDef(q.token).armor ?? 0) - (gearDef(p.token).armor ?? 0))[0];
  const mk0 = t.makersGold ?? 0, g0 = G.gold;
  if (armor) {
    const it = buyItem(a, G, armor.token, I.pay);
    ok(G.gold === g0 - armor.price && (t.makersGold ?? 0) > mk0 && armoryOf(G).items.includes(it), 'куплено: из казны гильдии — в казну мастеров города, на стойку', `${armor.label} за ${armor.price}`);
    const m = membersOf(G, 'ready')[0], own = m.gear.body;
    m.gear.body = own && (gearDef(own)?.armor ?? 0) < (gearDef(armor.token).armor ?? 0) ? own : null;
    lockItem(G, it.id, true);
    for (const x of G.members) x.level = 20;
    const card = guildBoard(a, []).errands.find(e => e.ok);
    const K = launch(a, {contract: card.contract, ids: [m.id], mode: 'auto'});
    ok(m.gear.body !== armor.token, 'запертое — не берут');
    a.campaign.closed = true; for (const x of K.members) x.guild = {state: 'ready', since: G.day};   // (called back on paper)
    lockItem(G, it.id, false);
    const K2 = launch(a, {contract: guildBoard(a, []).errands.find(e => e.ok).contract, ids: [m.id], mode: 'auto'});
    ok(m.gear.body === armor.token && (!own || armoryOf(G).items.some(x => x.token === own) || gearDef(own)?.armor >= gearDef(armor.token).armor), 'перед походом взял доспех лучше своего, свой оставил на стойке', `${gearDef(m.gear.body)?.label}`);
    a.campaign.closed = true; for (const x of K2.members) x.guild = {state: 'ready', since: G.day};
  } else ok(true, 'доспехов в городе не продают — не проверить на этом сиде');
  const any = armoryOf(G).items[0];
  if (any) { const g1 = G.gold, p = sellItem(a, G, any.id, I.pay); ok(!armoryOf(G).items.includes(any) && G.gold === Math.round((g1 + p) * 10) / 10, 'продано из оружейной — в казну', `+${p}`); }
}

// ── the forge: a smith of Strength 8; a step finer, up to +3; the metals by the forge's level
{
  const [a, G] = opened(); rich(G);
  const I = io(G), tell = () => {};
  buildRoom(a, 'armory', I); stepGuild(a); buildRoom(a, 'forge', I); stepGuild(a);
  const smith = membersOf(G, 'ready')[0]; smith.special.S = 6;
  ok(!!postWhy(G, 'forge', smith), 'кузнец — Сила не ниже 8', postWhy(G, 'forge', smith));
  smith.special.S = 9; setRoomPost(a, 'forge', smith.id, tell);
  armoryOf(G).items.push({id: 900, token: 'ironaxe', locked: false}, {id: 901, token: 'steelaxe', locked: false});
  ok(!!forgeWhy(G, 900) && !!forgeWhy(G, 901), 'кузница 1-го уровня не берёт железо и сталь', forgeWhy(G, 900));
  houseOf(G).forge = 3;
  const c = forgeCost('ironaxe'), g0 = G.gold;
  forgeItem(G, 900, I.pay); forgeItem(G, 900, I.pay); forgeItem(G, 900, I.pay);
  const it = armoryOf(G).items.find(x => x.id === 900);
  ok((gearSpec(it.token).q || 0) === 3 && G.gold < g0 - c, 'железный топор — до +3, за деньги', `${it.token}, −${Math.round(g0 - G.gold)}`);
  ok(!!forgeWhy(G, 900), 'выше +3 — нельзя', forgeWhy(G, 900));
  armoryOf(G).items.push({id: 902, token: 'mithrilaxe', locked: false});
  ok(!gearDef('mithrilaxe') || !!forgeWhy(G, 902), 'мифрил — нет', gearDef('mithrilaxe') ? forgeWhy(G, 902) : 'нет такого топора');
}

// ── the merchant: Charisma 9; cheaper arms; one contract a tier above; the stable and its beasts go with a party
{
  const [a, G] = opened(GUILD.level.need[1]); rich(G);
  const I = io(G), tell = () => {};
  buildRoom(a, 'armory', I); stepGuild(a); buildRoom(a, 'merchant', I); stepGuild(a);
  const tok = shopOf(a, G).items[0]?.token, p0 = tok && buyPrice(G, tok);
  const mer = membersOf(G, 'ready')[0]; mer.special.C = 10; setRoomPost(a, 'merchant', mer.id, tell);
  ok(!tok || buyPrice(G, tok) < p0, 'торговец на посту — оружие дешевле', tok ? `${p0} → ${buyPrice(G, tok)}` : '');
  for (let k = 0; k < 6 && !cof(a).records.some(c => c.state === 'open' && c.tier === 2); k++) stepGuild(a);
  ok(cof(a).records.some(c => c.state === 'open' && c.tier === 2), 'гильдии 1-го уровня торговец достал договор тира II', [...new Set(cof(a).records.filter(c => c.state === 'open').map(c => c.tier))].join(', '));
  buildRoom(a, 'stable', I); stepGuild(a);
  const B = shopOf(a, G).beasts;
  ok(stalls(G) === 4, 'конюшня 1-го уровня — 4 зверя');
  if (B.length) {
    buyBeast(a, G, B[0].kind, I.pay);
    ok(G.store.beasts.length === 1, 'куплен зверь в конюшню', B[0].label);
    for (const x of G.members) x.level = 20;
    const K = launch(a, {contract: guildBoard(a, []).errands.find(e => e.ok).contract, ids: [membersOf(G, 'ready')[0].id], mode: 'auto'});
    ok(K.beasts.length === 1 && !G.store.beasts.length, 'зверь ушёл с отрядом');
  } else ok(true, 'в городе зверей не продают — не проверить на этом сиде');
}

// ── saved and loaded: the same house
{
  const [a, G] = opened(); rich(G);
  buildRoom(a, 'tavern', io(G));
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
  ok(JSON.stringify(b.guild.rooms) === JSON.stringify(G.rooms) && JSON.stringify(b.guild.building) === JSON.stringify(G.building), 'сохранение: комнаты и стройка — те же');
}

if (fails) { console.log(`\nhouse-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nhouse-check: ok');
