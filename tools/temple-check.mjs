// The Temple of All Gods (campaign/temple.js; data/rooms.js `temple`; plan claude/guild-plan.md Г8, the author's word 14.11):
// no temple — no raising, no summoning; one of the guild raised for gold — out of the guild, into the registry with all he
// became; summoned back for gold — the same fighter, gone from the registry, mortal again; the guild's ascended summoned into a
// walk (Поход) and a walk's ascended into the guild — one pool for both games; the temple's 2nd level cheaper; a full barracks.
//   node tools/temple-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, foundGuild, hire, stepGuild, membersOf, rosterMost, buildRoom, roomLevel, newCampaign,
  templeOn, ascendPrice, summonPrice, templeAscendWhy, templeSummonable, templeSummonWhy, guildAscend, guildSummon} from '../src/campaign/index.js';
import {emptyRegistry, ascend, summonable, takeHeroes} from '../src/campaign/ascend.js';
import {HOUSE} from '../src/data/rooms.js';
import {GUILD} from '../src/data/guild.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const throws = f => { try { f(); return null; } catch (e) { return e.message; } };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base));
const cap = capitals(base)[0];
const io = {pay: (g, gold, why) => { g.gold = Math.round((g.gold + gold) * 10) / 10; g.ledger.push({day: g.day, gold, why}); }, tell: () => {}};
const opened = () => { const a = loadAtlas(JSON.parse(frozen)), G = foundGuild(a, cap.town); hire(a, G.candidates.slice(0, GUILD.start.pick).map(m => m.id)); G.gold = 5000; return [a, G]; };
const look = m => JSON.stringify({name: m.name, race: m.race, level: m.level, special: m.special, perks: (m.perks || []).map(p => [p.id, p.rank]), maims: m.maims || 0, gear: m.gear});

const [a, G] = opened();
const m = membersOf(G, 'ready')[0]; m.level = 5; m.perks = [...(m.perks || []), {id: 'tough', rank: 1, day: 0, at: [0]}]; m.maims = 1;
ok(!templeOn(G) && !!templeAscendWhy(a, G, m), `без храма — нельзя (${templeAscendWhy(a, G, m)})`);
buildRoom(a, 'temple', io); stepGuild(a);
ok(templeOn(G) && roomLevel(G, 'temple') === 1, 'храм построен — 1-й уровень');

// ── raised: paid, out of the guild, into the registry with all he became
const before = look(m), price = ascendPrice(G, m), gold = G.gold, n = membersOf(G).length;
ok(price === HOUSE.temple.ascend.base + HOUSE.temple.ascend.perLevel * 5, `вознесение 5-го уровня — ${price} зол.`);
let reg = guildAscend(a, m.id, emptyRegistry());
ok(G.gold === gold - price, 'плата списана');
ok(m.guild.state === 'left' && membersOf(G).length === n - 1 && !!m.ascended, 'вознесённый ушёл из гильдии');
const snap = reg.heroes[0];
ok(reg.heroes.length === 1 && snap.name === m.name && snap.level === 5 && snap.perks.some(p => p.id === 'tough') && snap.maims === 1 && snap.life?.age >= 0, 'в реестре — со всем, кем стал (уровень, перки, увечья, годы)');
ok(!!templeAscendWhy(a, G, m), 'дважды не вознести');

// ── summoned: paid, gone from the registry, the same fighter, a new member, mortal
ok(templeSummonable(a, G, reg).some(h => h.uid === snap.uid), 'его можно призвать в этот город');
const sp = summonPrice(G, snap), g1 = G.gold;
const {reg: reg2, m: back} = guildSummon(a, reg, snap.uid);
ok(G.gold === g1 - sp && sp === HOUSE.temple.summon.base + HOUSE.temple.summon.perLevel * 5, `призыв — ${sp} зол.`);
ok(!reg2.heroes.length, 'из реестра он ушёл сразу');
ok(look(back) === before, 'тот же боец: имя, раса, уровень, буквы, перки, увечья, вещи', look(back).slice(0, 80));
ok(back !== m && back.id !== m.id && back.guild.state === 'ready' && membersOf(G).includes(back), 'новый член гильдии, дома');
ok(back.born === a.hist.year - snap.life.age && back.dies > a.hist.year, `годы — прежние (${a.hist.year - back.born})`);
ok(!!templeSummonWhy(a, G, reg2, snap.uid, true), 'второй раз не призвать: в реестре его нет — его смерть навсегда');

// ── the 2nd level of the temple: cheaper
G.rooms.temple = 2;
ok(ascendPrice(G, back) === Math.round((HOUSE.temple.ascend.base + HOUSE.temple.ascend.perLevel * 5) * 0.75), `2-й уровень храма — дешевле: ${ascendPrice(G, back)} зол.`);

// ── a full barracks: no summoning
reg = guildAscend(a, back.id, reg2);
while (membersOf(G).length < rosterMost(G)) G.members.push({...membersOf(G)[0], id: 9000 + G.members.length, guild: {state: 'ready', since: 0}});
ok(!!templeSummonWhy(a, G, reg, reg.heroes[0].uid, membersOf(G).length < rosterMost(G)) && !!throws(() => guildSummon(a, reg, reg.heroes[0].uid)), 'казармы полны — не призвать');

// ── one pool for both games: the guild's ascended into a walk; a walk's ascended into the guild
{
  const b = loadAtlas(JSON.parse(frozen)), ready = summonable(b, cap.town, reg);
  ok(ready.some(h => h.uid === reg.heroes[0].uid), 'вознесённый гильдией виден Походу из той же столицы');
  const {snaps} = takeHeroes(reg, [reg.heroes[0].uid]);
  const K = newCampaign(b, cap.town, {summon: snaps, mode: 'auto'});
  ok(K.members.some(x => x.name === snaps[0].name && x.level === snaps[0].level && x.summoned), 'и призван в Поход тем же');
  K.phase = 'won';
  const walked = ascend(b, K, emptyRegistry(), [K.members.find(x => !x.summoned)]);
  const [a3, G3] = opened(); G3.rooms.temple = 1; G3.rooms.barracks = 2;
  const h = templeSummonable(a3, G3, walked)[0];
  ok(!!h, 'вознесённый в Походе виден храму гильдии');
  if (h) { const {m: x} = guildSummon(a3, walked, h.uid); ok(x.name === h.name && x.level === h.level && membersOf(G3).includes(x), 'и призван в гильдию'); }
}

// saved and loaded: the ascended stays one who left, the summoned one of the guild
{
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
  ok(b.guild.members.find(x => x.id === m.id)?.ascended && b.guild.members.some(x => x.name === m.name && x.ascended), 'сохранено и загружено');
}

console.log(fails ? `\n${fails} FAIL` : '\nвсё ок');
process.exit(fails ? 1 : 0);
