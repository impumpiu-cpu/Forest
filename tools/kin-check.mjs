// The guild's families and spirits (campaign/kin.js; data/guild.js GUILD.kin, GUILD.mood; plans Г4–Г5, the author's word 13.11):
// kin at the door (a brother of one of the guild, the kin of a person of the world), their bond and their pull in the muster;
// a kin's death felt in another party and in the world; a party lost felt by all; low spirits sending one away; couples,
// their children, a child grown at the door; saved and loaded, the same families.
//   node tools/kin-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, foundGuild, hire, stepGuild, membersOf, refreshRecruits, takeRecruit, muster, guildBoard, houseOf, kinOf, moodOf} from '../src/campaign/index.js';
import {isKin, makeKin, partyFelt, kinGrief, familyWill} from '../src/campaign/kin.js';
import {bondOf} from '../src/campaign/social.js';
import {GUILD} from '../src/data/guild.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base));
const cap = capitals(base)[0];
const K0 = JSON.parse(JSON.stringify(GUILD.kin));
const opened = () => { const a = loadAtlas(JSON.parse(frozen)), G = foundGuild(a, cap.town); G.fame = GUILD.level.need[3]; Object.assign(houseOf(G), {barracks: 4, planning: 3, board: 3}); hire(a, G.candidates.slice(0, GUILD.start.pick).map(m => m.id)); G.gold = 5000; return [a, G]; };
const live = G => membersOf(G);

// ── kin at the door: a brother or sister of one of the guild — a bond each way, the family's name, a pull in the muster
{
  GUILD.kin.door = 1;
  const [a, G] = opened(); refreshRecruits(a, G);
  const sib = G.recruits.find(m => (m.kin || []).some(k => k.rel === 'sibling' && G.members.some(x => x.id === k.id)));
  ok(!!sib, 'у дверей — брат или сестра одного из гильдии', sib && kinOf(a, G, sib).map(k => `${k.word} ${k.who.name}`).join(', '));
  if (sib) {
    const other = G.members.find(x => isKin(x, sib));
    ok(bondOf(G, sib.id, other.id) >= GUILD.kin.bond && bondOf(G, other.id, sib.id) >= GUILD.kin.bond, 'родня связана с первого дня', `${bondOf(G, sib.id, other.id)}`);
    takeRecruit(a, sib.id);
    const card = guildBoard(a, []).errands.find(e => e.ok);
    for (const m of G.members) m.level = 20;
    const M = muster(a, {contract: card?.contract, size: 4, named: [other.id]});
    ok(M.answers.find(x => x.id === sib.id)?.go, 'брат идёт за братом', M.answers.find(x => x.id === sib.id)?.why);
  }
  GUILD.kin.door = K0.door;
}

// ── a kin's death in another party: grief at home — devotion and mood; a friend's — mood
{
  const [a, G] = opened(), [x, y, z] = live(G);
  makeKin(G, x, y, 'sibling');
  G.social.relations[z.id] = {...(G.social.relations[z.id] || {}), [y.id]: 4};
  const d0 = x.devotion ?? GUILD.devotion.start;
  y.alive = false; y.guild.state = 'dead';
  kinGrief(a, G, y, {soft: 0, bondOf: (p, q) => bondOf(G, p, q), tell: () => {}});
  ok(x.devotion < d0 && moodOf(x) <= -GUILD.kin.mood, 'гибель брата — горе: верность и настроение', `${d0} → ${x.devotion}, настроение ${moodOf(x)}`);
  ok(moodOf(z) < 0 && moodOf(z) > moodOf(x), 'гибель друга — печаль, меньше, чем родного', `${moodOf(z)}`);
}

// ── a party lost: whole — the guild's spirits fall; more than half — less; back with the errand — they rise
{
  const [a, G] = opened(), m = live(G)[0];
  partyFelt(G, 4, 4, false); const whole = moodOf(m);
  partyFelt(G, 4, 3, false); const half = moodOf(m) - whole;
  ok(whole <= -GUILD.mood.lost && half <= -GUILD.mood.half + 1e-9 && half > whole, 'отряд погиб целиком — всем тяжело; больше половины — легче', `${whole}, ещё ${half}`);
}

// ── low spirits: one may leave (as a caravan's companion); his kin feel it
{
  const [a, G] = opened(), [x, y] = live(G);
  makeKin(G, x, y, 'sibling');
  x.mood = -1;
  let n = 0; while (n < 12 && x.guild.state !== 'left') { x.mood = -1; stepGuild(a); n++; }
  ok(x.guild.state === 'left' && x.left?.why.startsWith('тоска'), 'тоска — ушёл из гильдии', `${n} сезонов: ${x.left?.why}`);
  ok(y.guild.state === 'left' || moodOf(y) < 0, 'ушёл брат — родне тяжело', `${moodOf(y)}`);
}

// ── couples and children: wed in the guild, a child in the spring; a parent of a small child less willing; the child grown at the door
{
  GUILD.kin.couple.chance = 1; GUILD.kin.child = 3;
  const [a, G] = opened(), ms = live(G), x = ms.find(m => m.gender === 'f'), y = ms.find(m => m.gender === 'm' && m.race === x?.race);
  if (!x || !y) ok(true, 'семья: нет пары мужчины и женщины одного народа на этом сиде — не проверить');
  else {
    for (const m of [x, y]) m.born = Math.min(m.born, a.hist.year - 30);
    G.social.relations[x.id] = {...(G.social.relations[x.id] || {}), [y.id]: 6}; G.social.relations[y.id] = {...(G.social.relations[y.id] || {}), [x.id]: 6};
    let n = 0; while (n < 8 && !(G.children || []).length) { stepGuild(a); n++; }
    ok((x.kin || []).some(k => k.id === y.id && k.rel === 'spouse'), 'свадьба в гильдии', kinOf(a, G, x).map(k => `${k.word} ${k.who.name}`).join(', '));
    const c = (G.children || [])[0];
    ok(!!c && isKin(x, c) && isKin(y, c), 'весной родился ребёнок', c?.name);
    ok(familyWill(a, G, x) < familyWill(a, G, {mood: 0}), 'родитель малого ребёнка неохотнее уходит в поход');
    if (c) {
      c.born = a.hist.year - 300;   // (grown on paper)
      stepGuild(a);
      const r = (G.recruits || []).find(m => m.id === c.id);
      ok(!!r && r.family && isKin(r, x), 'выросший ребёнок — у дверей гильдии, с родней', r && `${r.name}, ур. ${r.level || 1}`);
      stepGuild(a);
      ok((G.recruits || []).some(m => m.id === c.id), 'и ждёт у дверей, пока не возьмут');
      takeRecruit(a, c.id);
      ok(G.members.some(m => m.id === c.id) && kinOf(a, G, x).some(k => k.who.id === c.id), 'принят: сын (дочь) в гильдии');
    }
  }
  GUILD.kin.couple.chance = K0.couple.chance; GUILD.kin.child = K0.child;
}

// ── the kin of a person of the world: mourned when the person dies
{
  GUILD.kin.person = 1;
  const [a, G] = opened(); refreshRecruits(a, G);
  const m = G.recruits.find(x => x.kinOfPerson != null);
  if (!m) ok(true, 'родня именных личностей: в городе нет личностей этого народа — не проверить');
  else {
    takeRecruit(a, m.id);
    const p = a.persons.find(x => x.id === m.kinOfPerson); p.alive = false;
    const v0 = moodOf(m); stepGuild(a);
    ok(m.kin.find(k => k.person === p.id)?.mourned && (moodOf(m) < v0 || m.guild.state === 'left'), 'умерла именная личность — её родня в гильдии горюет', `${p.name}`);
  }
  GUILD.kin.person = K0.person;
}

// ── saved and loaded: the same families
{
  GUILD.kin.door = 1;
  const [a, G] = opened(); refreshRecruits(a, G);
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
  ok(JSON.stringify(b.guild.recruits.map(m => m.kin || [])) === JSON.stringify(G.recruits.map(m => m.kin || [])), 'сохранение: родня — та же');
  GUILD.kin.door = K0.door;
}

if (fails) { console.log(`\nkin-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nkin-check: ok');
