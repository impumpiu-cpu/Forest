// Rest and retirement, and the names of the guild's people (campaign/retire.js, data/guild.js GUILD.retire; data/names.js CLAN;
// the author's word 13.11): the old ask to rest, unheard they sour; at rest — at the house, out of the muster, on a pension, at a
// post if wanted, back to the ranks; let go with honour (a gift) or without (his friends hurt); each people its own way of naming,
// a sibling of the same family, saved and loaded.
//   node tools/retire-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, foundGuild, hire, stepGuild, membersOf, muster, guildBoard, houseOf, moodOf, restMember, refreshRecruits, setRoomPost, staffOf} from '../src/campaign/index.js';
import {makeKin} from '../src/campaign/kin.js';
import {CLAN, fullName, clanOf} from '../src/data/names.js';
import {GUILD} from '../src/data/guild.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base));
const cap = capitals(base)[0];
const R0 = JSON.parse(JSON.stringify(GUILD.retire)), K0 = JSON.parse(JSON.stringify(GUILD.kin));
const opened = () => { const a = loadAtlas(JSON.parse(frozen)), G = foundGuild(a, cap.town); G.fame = GUILD.level.need[3]; Object.assign(houseOf(G), {barracks: 4, planning: 3, board: 3, training: 1}); hire(a, G.candidates.slice(0, GUILD.start.pick).map(m => m.id)); G.gold = 5000; return [a, G]; };
const old = (a, m) => { m.born = a.hist.year - 60; m.dies = a.hist.year + 20; };

// ── the old ask to rest; unheard — they sour
{
  GUILD.retire.ask = 1;
  const [a, G] = opened(), m = membersOf(G)[0];
  old(a, m); m.mood = 0;
  stepGuild(a);
  ok(m.asks?.why === 'годы', 'старый просится на покой', `${m.name}: ${m.asks?.why}`);
  const v = moodOf(m); stepGuild(a);
  ok(moodOf(m) < v * GUILD.mood.fade + 1e-9 || m.guild.state === 'left', 'не отпустили — настроение падает', `${v} → ${moodOf(m)}`);
  const y = membersOf(G)[1]; y.maims = GUILD.retire.maims; stepGuild(a);
  ok(y.asks?.why === 'увечья' || y.guild.state !== 'ready', 'увечный тоже просится', y.asks?.why);
  GUILD.retire.ask = R0.ask;
}

// ── at rest: at the house, out of the muster, on a pension; a post — the whole wage; back to the ranks
{
  const [a, G] = opened(), [m, other] = membersOf(G);
  m.asks = {why: 'годы', year: a.hist.year}; m.mood = 0; m.level = 12;
  restMember(a, m.id, 'rest');
  ok(m.guild.state === 'retired' && m.retired && !m.asks && moodOf(m) > 0, 'на покое: живёт при гильдии, рад', `${m.guild.state}, настроение ${moodOf(m)}`);
  const card = guildBoard(a, []).errands.find(e => e.ok);
  const M = muster(a, {contract: card?.contract, size: 4, named: [other.id]});
  ok(!M.answers.some(x => x.id === m.id) && !(M.going || []).some(x => x.id === m.id), 'на покое — в сбор не зовут');
  const W = GUILD.wage, full = Math.round((W.base + W.perLevel * (m.level - 1)) * 10) / 10;
  stepGuild(a);
  const paid = G.ledger.filter(e => e.why === `жалованье: ${m.name}`).at(-1)?.gold;
  ok(Math.abs(-paid - full * GUILD.retire.pension) < 0.11, 'на покое — пенсия, половина жалованья', `${-paid} из ${full}`);
  setRoomPost(a, 'training', m.id, () => {});
  ok(staffOf(G, 'training') === m && m.retired, 'на покое — может быть тренером');
  setRoomPost(a, 'training', null, () => {});
  ok(m.guild.state === 'retired', 'снят с поста — снова на покое');
  restMember(a, m.id, 'back');
  ok(m.guild.state === 'ready' && !m.retired, 'вернулся в строй');
}

// ── let go: with honour — the gift; without — his friends hurt
{
  const [a, G] = opened(), [m, f, n] = membersOf(G);
  const g0 = G.gold; restMember(a, m.id, 'honour');
  ok(m.guild.state === 'left' && m.left.why === 'отставка с почётом' && G.gold < g0, 'отставка с почётом — прощальный дар', `${g0 - G.gold} зол.`);
  G.social.relations[f.id] = {...(G.social.relations[f.id] || {}), [n.id]: 6};
  const d0 = f.devotion ?? GUILD.devotion.start; restMember(a, n.id, 'fire');
  ok(n.guild.state === 'left' && n.left.why === 'уволен' && f.devotion < d0, 'уволен — друг обижен', `${d0} → ${f.devotion}`);
}

// ── the names: each people its own; a sibling at the door — the same family; saved and loaded
{
  const r = () => 0.42;
  ok(/^Ждан \S+ов$|^Ждан \S+ин$|^Ждан \S+ёв$|^Ждан \S+ев$/.test(fullName('Ждан', 'm', clanOf('human', r))) && /а$/.test(fullName('Злата', 'f', clanOf('human', r))), 'люди — фамилии, у женщин — на -а', fullName('Злата', 'f', clanOf('human', r)));
  ok(fullName('Дорин', 'm', clanOf('dwarf', r, {father: 'Торин'})) === 'Дорин сын Торина' && fullName('Дагна', 'f', clanOf('dwarf', r, {father: 'Кетиль'})) === 'Дагна дочь Кетиля', 'гномы — по отцу', 'Дорин сын Торина');
  ok(/ из дома /.test(fullName('Аэлдир', 'm', clanOf('elf', r))) && CLAN.orc.style === 'nick', 'эльфы — по дому, орки — по прозвищу', fullName('Аэлдир', 'm', clanOf('elf', r)));
  GUILD.kin.door = 1;
  const [a, G] = opened(); refreshRecruits(a, G);
  const sib = G.recruits.find(m => (m.kin || []).some(k => k.rel === 'sibling')), other = sib && [...G.members, ...G.recruits].find(x => x.id === sib.kin.find(k => k.rel === 'sibling').id);
  ok(!!sib && (sib.clan?.style === 'nick' || JSON.stringify(sib.clan) === JSON.stringify(other.clan)), 'брат у дверей — той же семьи', sib && `${sib.name} — ${other.name}`);
  ok(G.members.every(m => !CLAN[m.race] || m.clan), 'у каждого в гильдии — имя своего народа', G.members.map(m => m.name).join(', '));
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
  ok(JSON.stringify(b.guild.members.map(m => [m.name, m.clan])) === JSON.stringify(G.members.map(m => [m.name, m.clan])), 'сохранение: имена и семьи — те же');
  GUILD.kin.door = K0.door;
}

if (fails) { console.log(`\nretire-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nretire-check: ok');
