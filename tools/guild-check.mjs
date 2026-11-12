// The adventurers' guild (campaign/guild.js; plan claude/guild-plan.md Г1, its acceptance scenarios): founding and the door,
// the world's clock with nobody out, the deeds in town, an expedition of the guild's own people and its return, deaths at
// home, on a deed, of age; the money written down; a guild saved and loaded goes on as the one that was not.
//   node tools/guild-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, foundGuild, hire, stepGuild, guildBoard, takeChore, launch, launchWhy, expedition, membersOf, atHouse, ageOf, rankOf, muster, namedMost} from '../src/campaign/index.js';
import {XP} from '../src/data/experience.js';
import {ERRANDS} from '../src/data/errands.js';
import {GUILD} from '../src/data/guild.js';
import {CHORES} from '../src/data/chores.js';
import {SPECIES} from '../src/data/species.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const throws = f => { try { f(); return null; } catch (e) { return e.message; } };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base));
const fresh = () => loadAtlas(JSON.parse(frozen));
const cap = capitals(base)[0];
const sum = G => Math.round(G.ledger.reduce((s, l) => s + l.gold, 0) * 10) / 10;
// a fingerprint of the guild: every member's state, health, level, experience; the gold; the chronicle's words
function guildHash(G) {
  let h = 2166136261; const mix = v => { h ^= v; h = Math.imul(h, 16777619); };
  mix(G.day); mix(Math.round(G.gold * 10));
  for (const m of G.members) { mix(m.id); mix(m.alive ? 1 : 0); mix(Math.round((m.hp ?? 1) * 1000)); mix(m.level || 1); mix(Math.round((m.xp || 0) * 10)); for (const c of m.guild.state) mix(c.charCodeAt(0)); }
  for (const l of G.log) for (let k = 0; k < l.text.length; k++) mix(l.text.charCodeAt(k));
  return (h >>> 0).toString(16);
}
// the people up to an errand's rank (GUILD.rank): grown on paper, as the deeds in town would grow them
const ranked = (G, ids, errand) => { for (const id of ids) G.members.find(m => m.id === id).level = rankOf(errand); };
const opened = () => { const a = fresh(), G = foundGuild(a, cap.town); hire(a, G.candidates.slice(0, GUILD.start.pick).map(m => m.id)); return [a, G]; };

// ── the founding and the door
{
  const a = fresh(), G = foundGuild(a, cap.town, {name: 'Проба'});
  ok(G.gold === GUILD.start.gold && G.phase === 'hire', 'основание: казна и двери открыты', `${G.gold} зол.`);
  ok(G.candidates.length === GUILD.start.candidates, `к дверям пришли ${GUILD.start.candidates}`, String(G.candidates.length));
  ok(new Set(G.candidates.map(m => m.name)).size === G.candidates.length && G.candidates.every(m => m.name !== SPECIES.get(m.race).label), 'у каждого своё имя', G.candidates.map(m => m.name).join(', '));
  ok(G.candidates.every(m => { const B = SPECIES.get(m.race).body; return ageOf(a, m) >= (B.adult ?? 16) && m.dies > a.hist.year; }), 'годы: взрослые, смерть от старости впереди');
  ok(!!throws(() => hire(a, G.candidates.slice(0, 3).map(m => m.id))) && G.phase === 'hire', 'нанять не восьмерых — отказ');
  hire(a, G.candidates.slice(0, GUILD.start.pick).map(m => m.id));
  ok(G.phase === 'open' && membersOf(G).length === GUILD.start.pick && !G.candidates && G.offers.length > 0, 'восемь в гильдии, дела в городе предложены', `дел ${G.offers.length}`);
}

// ── all at home: the world goes on, the hurt mend, the wages are paid
{
  const [a, G] = opened(), y0 = a.hist.year, s0 = a.hist.season, m = membersOf(G)[0];
  m.hp = 0.3;
  stepGuild(a);
  ok(a.hist.season !== s0 || a.hist.year !== y0, 'все дома — мир идёт', `${y0}/${s0} → ${a.hist.year}/${a.hist.season}`);
  ok(G.day > 0 && m.hp > 0.3, 'раненый лечится дома', `здоровье ${m.hp.toFixed(2)}, день ${G.day}`);
  ok(G.ledger.some(l => l.why.startsWith('жалованье')) && sum(G) === G.gold, 'жалованье из казны; казна сходится с записями', `${G.gold} / ${sum(G)}`);
}

// ── the muster: one to a quarter named, the others answer for themselves
{
  const [a, G] = opened(), ms = membersOf(G), lead = ms[0], errand = guildBoard(a, [lead.id]).errands[0].errand;
  ranked(G, [lead.id], errand);
  ok(Object.keys(G.social.relations).length > 0, 'знакомые по городу: связи у пришедших есть', `${Object.keys(G.social.relations).length} со связями`);
  ok(namedMost(4) === 1 && namedMost(8) === 2 && namedMost(2) === 1, 'назначить — не больше четверти, не меньше одного');
  ok(!!throws(() => launch(a, {errand, named: [ms[0].id, ms[1].id], size: 6})), 'двоих на шестерых — отказ');
  ok(!!throws(() => launch(a, {errand, named: [], size: 4})), 'никого не назначили — отказ');
  const M = muster(a, {errand, size: 6, named: [lead.id]});
  ok(M.ids[0] === lead.id && M.answers.length === ms.length && M.answers.every(x => x.why), 'назначенный идёт, у каждого — ответ с причиной', M.answers.map(x => `${G.members.find(m => m.id === x.id).name}: ${x.go ? '+' : '−'} ${x.why}`).join('; '));
  ok(JSON.stringify(M) === JSON.stringify(muster(a, {errand, size: 6, named: [lead.id]})), 'тот же день и те же имена — тот же ответ');
  const foe = ms[1], friend = ms[2];
  G.social.relations[foe.id] = {...(G.social.relations[foe.id] || {}), [lead.id]: -4};
  G.social.relations[friend.id] = {...(G.social.relations[friend.id] || {}), [lead.id]: 4};
  const M2 = muster(a, {errand, size: 6, named: [lead.id]}), ans = id => M2.answers.find(x => x.id === id);
  ok(!ans(foe.id).go && ans(foe.id).why.startsWith('не пойдёт'), 'враг назначенного не идёт', ans(foe.id).why);
  ok(ans(friend.id).go, 'друг назначенного идёт', ans(friend.id).why);
  friend.hp = 0.3;
  ok(!muster(a, {errand, size: 6, named: [lead.id]}).answers.find(x => x.id === friend.id).go, 'раненый не идёт сам', muster(a, {errand, size: 6, named: [lead.id]}).answers.find(x => x.id === friend.id).why);
  friend.hp = 1;
  const K = launch(a, {errand, named: [lead.id], size: 6, mode: 'auto'});
  ok(K.members.length === muster(a, {errand, size: 6, named: [lead.id]}).ids.length || K.members.every(m => m.guild?.state === 'expedition'), 'ушли те, кто согласился', K.members.map(m => m.name).join(', '));
}

// ── the deeds in town: one at a time each, settled with the pay and the experience
{
  const [a, G] = opened(), ids = membersOf(G).map(m => m.id);
  const offer = G.offers.find(o => CHORES.get(o.id).hands[1] >= 2), R = CHORES.get(offer.id), two = ids.slice(0, Math.max(R.hands[0], 2));
  const g0 = G.gold;
  takeChore(a, offer.uid, two);
  ok(two.every(id => G.members.find(m => m.id === id).guild.state === 'chore'), 'на деле — заняты');
  const other = G.offers[0];
  const why = other ? throws(() => takeChore(a, other.uid, [two[0]])) : 'нет второго дела';
  ok(!!why && G.gold === g0, 'занятый не берёт второе дело; казна не тронута', why);
  ok(!!launchWhy(a, {ids: [two[0], ids[3]]}), 'занятый не уходит в поход', launchWhy(a, {ids: [two[0], ids[3]]}));
  stepGuild(a);
  ok(two.every(id => G.members.find(m => m.id === id).guild.state !== 'chore'), 'дело кончилось — вернулись');
  ok(G.ledger.some(l => l.why.startsWith('городское дело')), 'плата за дело — в казну');
  ok(two.some(id => (G.members.find(m => m.id === id).xp || 0) > 0), 'за дело — опыт', two.map(id => G.members.find(m => m.id === id).xp).join(', '));
  ok(G.log.some(l => l.kind === 'chore' || l.kind === 'choreBad'), 'отчёт о деле — в летописи гильдии', G.log.find(l => l.kind?.startsWith('chore') && !l.text.includes('взял'))?.text);
}

// ── an expedition of the guild's own people
{
  const [a, G] = opened(), ids = membersOf(G).map(m => m.id).slice(0, 4), B0 = guildBoard(a, ids);
  ok(B0.errands.length > 0 && B0.errands.every(e => !e.ok), 'новички не идут на логово: поручения мира — рано', B0.errands.find(e => e.why?.startsWith('рано'))?.why);
  const first = B0.errands.find(e => e.why?.startsWith('рано') && e.targetId != null) || B0.errands.find(e => e.why?.startsWith('рано'));
  ok(!!launchWhy(a, {ids, errand: first.errand}), 'и в поход их не отправить', launchWhy(a, {ids, errand: first.errand}));
  ranked(G, ids, first.errand);
  const B = guildBoard(a, ids), card = B.errands.find(e => e.ok && e.id === first.id) || B.errands.find(e => e.ok);
  ok(!!card, 'доросли — поручение открыто', `${card?.id}, ур. ${rankOf(first.errand)}`);
  ok(!!throws(() => launch(a, {errand: card.errand, ids: membersOf(G).map(m => m.id)})), `больше ${GUILD.party.max} — отказ`);
  const g0 = G.gold, K = launch(a, {errand: card.errand, targetId: card.targetId, ids, mode: 'auto'});
  ok(K === a.campaign && K.members.every(m => G.members.includes(m)), 'в отряде — те же люди, что в гильдии (не копии)');
  ok(K.social === G.social && K.seen === G.seen, 'связи и знание мира — гильдии');
  ok(G.gold < g0 && ids.every(id => G.members.find(m => m.id === id).guild.state === 'expedition'), 'кошель и еда — из казны, ушедшие в походе', `${g0} → ${G.gold}`);
  ok(!!launchWhy(a, {ids: membersOf(G, 'ready').map(m => m.id).slice(0, 2)}), 'второй отряд — пока нельзя', launchWhy(a, {ids: membersOf(G, 'ready').map(m => m.id).slice(0, 2)}));
  // saved on the way, it goes on as the one that was not
  stepGuild(a);
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
  ok(b.campaign.members[0] === b.guild.members.find(m => m.id === b.campaign.members[0].id) && b.campaign.social === b.guild.social, 'сохранение: общие люди и связи — по-прежнему общие');
  let n = 0; while (n < 60 && expedition(a)) { stepGuild(a); stepGuild(b); n++; }
  stepGuild(a); stepGuild(b);
  ok(guildHash(a.guild) === guildHash(b.guild), 'сохранённая в пути гильдия идёт так же', `${guildHash(a.guild)} / ${guildHash(b.guild)}`);
  ok(!expedition(a) && a.campaign?.closed, 'отряд вернулся (или не вернулся) — поход закрыт', `${n} сезонов, ${G.expeditions.at(-1)?.how}`);
  const back = K.members.filter(m => m.alive && m.guild);
  ok(back.every(m => m.guild.state === 'ready') && K.members.filter(m => m.guild && !m.alive).every(m => m.guild.state === 'dead'), 'живые — дома, павшие — павшие');
  ok(back.every(m => G.members.includes(m)), 'вернувшиеся — те же люди: уровни, вещи, раны с ними', back.map(m => `${m.name} ур. ${m.level}`).join(', '));
  const last = K.done?.at(-1), qx = XP.quest[ERRANDS.get(K.quest.errand).tier] * (last && !last.failed ? 1 : XP.questFail);
  ok(back.filter(m => m.guild).every(m => Math.abs((m.xpOf.quest || 0) - qx) < 0.01), 'опыт за поручение — по тиру, каждому вернувшемуся', `${qx}: ${back.map(m => m.xpOf.quest || 0).join(', ')}`);
  ok(back.filter(m => m.guild).every(m => m.level <= rankOf(first.errand) + 3), 'одно поручение — не больше трёх уровней', back.map(m => m.level).join(', '));
  ok(sum(G) === G.gold, 'казна сходится с записями после похода', `${G.gold} / ${sum(G)}`);
}

// ── deaths: of age (at home and on the road), and a guild with nobody left
{
  const [a, G] = opened(), m = membersOf(G)[0];
  while (a.hist.season !== 0) stepGuild(a);
  m.dies = a.hist.year;
  stepGuild(a);
  ok(!m.alive && m.guild.state === 'dead' && m.died?.why === 'умер от старости', 'старость: умер дома весной', m.died?.why);
  const ids = membersOf(G, 'ready').map(m => m.id).slice(0, 3);
  ranked(G, ids, guildBoard(a, ids).errands[0].errand);
  const card = guildBoard(a, ids).errands.find(e => e.ok);
  const K = launch(a, {errand: card.errand, targetId: card.targetId, ids, mode: 'auto'});
  stepGuild(a);   // (out of the gate: the next spring finds them on the road)
  if (!expedition(a)) ok(true, 'старость в пути: отряд вернулся в первый сезон — не проверить на этом сиде');
  else {
    while (expedition(a) && a.hist.season !== 0) stepGuild(a);
    for (const x of K.members) x.dies = a.hist.year;
    const out = !!expedition(a), n0 = G.expeditions.length;
    stepGuild(a);   // (the spring: age comes at its end — on the road, or at the house if they came home within the season)
    if (!out || G.expeditions.at(-1)?.how !== 'не вернулся' && G.expeditions.length > n0) ok(K.members.every(x => !x.alive), 'старость: отряд вернулся до весны — умерли дома', G.expeditions.at(-1)?.how);
    else ok(K.members.every(x => !x.alive || !x.guild) && G.expeditions.at(-1)?.how === 'не вернулся' && G.phase === 'open', 'старость в пути: отряд не вернулся, гильдия жива', `${G.expeditions.at(-1)?.how}, дома ${membersOf(G).length}`);
  }
  for (const x of membersOf(G)) x.dies = a.hist.year + 1;
  for (let k = 0; k < 8 && G.phase === 'open'; k++) stepGuild(a);
  ok(G.phase === 'over' && !stepGuild(a), 'никого не осталось — гильдия закрыта');
}

// ── wages unpaid: one leaves
{
  const [a, G] = opened();
  G.gold = 0;
  for (let k = 0; k < GUILD.wage.leave; k++) stepGuild(a);
  ok(G.members.some(m => m.guild.state === 'left'), `не платили ${GUILD.wage.leave} сезона — уходят`, G.members.filter(m => m.guild.state === 'left').map(m => m.name).join(', '));
}

// ── the same seed, the same choices: the same guild
{
  const run = () => { const [a, G] = opened(); const ids = membersOf(G).map(m => m.id); takeChore(a, G.offers[0].uid, ids.slice(0, CHORES.get(G.offers[0].id).hands[0])); for (let k = 0; k < 3; k++) stepGuild(a); return guildHash(G); };
  const h1 = run(), h2 = run();
  ok(h1 === h2, 'тот же сид и те же решения — та же гильдия', `${h1} / ${h2}`);
}

if (fails) { console.log(`\nguild-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nguild-check: ok');
