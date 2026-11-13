// The guild's families and its spirits (data/guild.js GUILD.kin, GUILD.mood; plans Г4–Г5, the author's word 13.11): kin at the
// door (a brother of one of the guild, a son of a ruler of the town), couples and their children, a kin's death felt wherever it
// happens, a party lost felt by all; the spirits fading by themselves and, low, sending one away — as a companion leaves a
// caravan. Pure records on the members: m.kin = [{id | person, rel}], m.mood; the children — G.children.
//   rel: 'sibling' | 'parent' | 'child' | 'spouse' (the word by the other's gender: relWord)
import {GUILD} from '../data/guild.js';
import {SPECIES} from '../data/species.js';
import {makeName} from '../data/names.js';
import {personOf} from '../atlas/index.js';

const K_ = GUILD.kin, M_ = GUILD.mood;
const WORD = {sibling: ['брат', 'сестра'], parent: ['отец', 'мать'], child: ['сын', 'дочь'], spouse: ['муж', 'жена']};
const BACK = {sibling: 'sibling', parent: 'child', child: 'parent', spouse: 'spouse'};
export const relWord = (rel, g) => WORD[rel]?.[g === 'f' ? 1 : 0] || 'родня';
const clamp = v => Math.max(-1, Math.min(1, v));
export const moodOf = m => m.mood ?? 0;
export const moodBy = (m, d) => { m.mood = Math.round(clamp(moodOf(m) + d) * 100) / 100; };

// everyone the guild knows of: its members, the recruits at its door, its children
const people = G => [...G.members, ...(G.recruits || []), ...(G.children || [])];
export const personById = (G, id) => people(G).find(x => x.id === id) || null;
// a member's kin: [{who (a member, recruit or child; or a person of the world), rel, word}]
export function kinOf(a, G, m) {
  return (m.kin || []).map(k => {
    const who = k.person != null ? personOf(a, k.person) : personById(G, k.id);
    return who ? {who, rel: k.rel, person: k.person != null, word: relWord(k.rel, who.g || who.gender)} : null;
  }).filter(Boolean);
}
export const isKin = (x, y) => (x.kin || []).some(k => k.id === y.id);
// two made kin (each way), with a bond of GUILD.kin.bond each way
export function makeKin(G, x, y, rel, bondBy) {
  if (isKin(x, y)) return;
  (x.kin ||= []).push({id: y.id, rel}); (y.kin ||= []).push({id: x.id, rel: BACK[rel]});
  if (bondBy) { bondBy(x.id, y.id, K_.bond); bondBy(y.id, x.id, K_.bond); }
}

// the door: one of those who came may be the brother or sister of one of the guild (or of another at the door): the same people,
// the same race, the same family name; or the kin of a person of the world in the town (its ruler, its officers)
export function doorKin(a, G, ms, r, bondBy, tell) {
  for (const m of ms) {
    if (r() < K_.door) {
      const pool = [...G.members.filter(x => x.alive && x.guild && !['dead', 'left'].includes(x.guild.state)), ...ms.filter(x => x !== m)].filter(x => x.race === m.race && !isKin(x, m));
      const sib = pool[Math.floor(r() * pool.length)];
      if (sib) {
        makeKin(G, m, sib, 'sibling', bondBy);
        const fam = (sib.name.split(' ').slice(1).join(' ')); if (fam && !m.name.includes(' ')) m.name = `${m.name} ${fam}`;
        if (G.members.includes(sib)) tell(`У дверей гильдии — ${relWord('sibling', m.gender)} ${sib.name}: ${m.name}.`, 'people');
      }
    }
    if (r() < K_.person) {
      const t = a.towns.find(x => x.id === G.town), ps = (a.persons || []).filter(p => p.alive && p.at?.kind === 'town' && p.at.id === t?.id && p.species === m.race);
      const p = ps[Math.floor(r() * ps.length)];
      if (p) { (m.kin ||= []).push({person: p.id, rel: r() * 2 < 1 ? 'sibling' : 'child'}); m.kinOfPerson = p.id; }
    }
  }
}

// a death: the kin grieve (devotion and mood, the chapel softening the devotion's loss), the friends are sad
export function kinGrief(a, G, dead, {soft = 0, bondOf, tell}) {
  for (const m of G.members) {
    if (m === dead || !m.alive || !m.guild || ['dead', 'left'].includes(m.guild.state)) continue;
    if (isKin(m, dead)) {
      m.devotion = Math.round(Math.max(0, (m.devotion ?? GUILD.devotion.start) - K_.grief * (1 - soft)) * 100) / 100; moodBy(m, -K_.mood);
      tell(`${m.name} оплакивает: ${dead.name} — ${relWord((m.kin.find(k => k.id === dead.id) || {}).rel, dead.gender)} ${m.gender === 'f' ? 'ей' : 'ему'}.`, 'people');
    } else if (bondOf(m.id, dead.id) > GUILD.muster.friend / 2) moodBy(m, -M_.friend);
  }
  for (const c of G.children || []) if (isKin(c, dead)) c.orphan = (c.orphan || 0) + 1;
}
// the world's persons the guild's people are kin to: one dead since the last season — mourned
export function personsMourned(a, G, tell) {
  for (const m of G.members) {
    if (!m.alive || !m.guild || ['dead', 'left'].includes(m.guild.state)) continue;
    for (const k of m.kin || []) {
      if (k.person == null || k.mourned) continue;
      const p = personOf(a, k.person); if (!p || p.alive) continue;
      k.mourned = true; moodBy(m, -K_.mood); m.devotion = Math.max(0, (m.devotion ?? GUILD.devotion.start) - K_.grief / 2);
      tell(`${m.name} узнал${m.gender === 'f' ? 'а' : ''}: умер${p.g === 'f' ? 'ла' : ''} ${p.title?.[0] ? `${p.title[0]} ` : ''}${p.name} — ${relWord(k.rel, p.g)} ${m.gender === 'f' ? 'ей' : 'ему'}.`, 'people');
    }
  }
}
// one leaves the guild: his kin there feel it
export function parted(G, gone) {
  for (const m of G.members) if (m !== gone && m.alive && isKin(m, gone) && !['dead', 'left'].includes(m.guild?.state)) moodBy(m, -K_.parting);
}
// a party home: lost whole, or more than half of it — the guild's spirits fall; its errand done — they rise
export function partyFelt(G, went, fell, won) {
  const all = G.members.filter(m => m.alive && m.guild && !['dead', 'left'].includes(m.guild.state));
  if (went && fell >= went) for (const m of all) moodBy(m, -M_.lost);
  else if (went && fell * 2 > went) for (const m of all) moodBy(m, -M_.half);
  else if (won) for (const m of all) moodBy(m, M_.won);
}

// ── a season: the spirits fade; one low may leave (as a caravan's companion), his kin perhaps with him
export function spiritsSeason(a, G, r, {leave, tell}) {
  for (const m of [...G.members]) {
    if (!m.alive || m.guild?.state !== 'ready') continue;
    const v = moodOf(m);
    if (v < M_.low && r() < (M_.low - v) * M_.leave) { leave(m, 'тоска: в гильдии стало невмоготу'); continue; }
    m.mood = Math.round(v * M_.fade * 100) / 100;
  }
}
// the muster's word on spirits and family (campaign/guild.js muster): his mood; a parent of a small child less willing
export function familyWill(a, G, m) {
  const small = (m.kin || []).some(k => k.rel === 'child' && (G.children || []).some(c => c.id === k.id && !c.grown));
  return M_.will * moodOf(m) - (small ? M_.parent : 0);
}

// ── couples and children (Г5): a season — two of the guild with a bond of couple.bond each way may wed; one alone may wed in
// the town; a spring — a couple's child; a child grown comes to the door
const age = (a, x) => (a.hist?.year ?? 0) - (x.born ?? 0);
const grownAt = race => SPECIES.get(race)?.body?.adult ?? 16;
const lifeAt = race => SPECIES.get(race)?.body?.life ?? 80;
const spouseOf = m => (m.kin || []).find(k => k.rel === 'spouse');
export function familySeason(a, G, r, {bondOf, tell, spring}) {
  const C = K_.couple, live = G.members.filter(m => m.alive && m.guild && !['dead', 'left'].includes(m.guild.state) && !spouseOf(m) && !m.wedTown && age(a, m) >= grownAt(m.race));
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const x = live[i], y = live[j];
    if (spouseOf(x) || spouseOf(y) || x.gender === y.gender || isKin(x, y)) continue;
    if (bondOf(x.id, y.id) >= C.bond && bondOf(y.id, x.id) >= C.bond && r() < C.chance) { makeKin(G, x, y, 'spouse'); tell(`В гильдии свадьба: ${x.name} и ${y.name}.`, 'people'); }
  }
  for (const m of live) if (!spouseOf(m) && !m.wedTown && r() < C.town) { m.wedTown = {year: a.hist?.year ?? 0}; tell(`${m.name} ${m.gender === 'f' ? 'вышла замуж' : 'женился'} в городе.`, 'people'); }
  if (!spring) return;
  // the children of the year: a couple of the guild (counted once, by the wife), or one of the guild wed in the town
  for (const m of G.members) {
    if (!m.alive || !m.guild || ['dead', 'left'].includes(m.guild.state)) continue;
    const sp = spouseOf(m), mate = sp ? personById(G, sp.id) : null;
    if (mate ? m.gender !== 'f' : !m.wedTown) continue;
    if (age(a, m) > lifeAt(m.race) * K_.fertile) continue;
    const fert = SPECIES.get(m.race)?.body?.fertility ?? 1;
    if (r() >= K_.child * fert) continue;
    const g = r() * 2 < 1 ? 'f' : 'm', name = makeName(m.race, r, {gender: g, nick: 'never', used: new Set(people(G).map(x => x.name.split(' ')[0]))}) || 'дитя';
    const fam = m.name.split(' ').slice(1).join(' '), id = G.nextMember = (G.nextMember || 0) + 1;
    const c = {id, name: fam ? `${name} ${fam}` : name, gender: g, g, race: m.race, born: a.hist?.year ?? 0, grown: false, kin: []};
    (G.children ||= []).push(c);
    makeKin(G, m, c, 'child');
    if (mate) makeKin(G, mate, c, 'child');
    tell(`В семье ${m.name}${mate ? ` и ${mate.name}` : ''} родил${g === 'f' ? 'ась дочь' : 'ся сын'}: ${c.name}.`, 'people');
  }
}
// the children grown this season: to the door — their names, their kin, the people of their parents
export function grownUp(a, G) {
  const out = [];
  for (const c of G.children || []) if (!c.grown && age(a, c) >= grownAt(c.race)) { c.grown = true; out.push(c); }
  return out;
}
