// Ranks and links of a band (data/ranks.js, docs/BEHAVIOUR.md «Ранги и звенья»): a band big enough is split into links,
// the strongest of each made its officer — the mark «офицер» (data/conditions.js: more health, holds its ground), its
// gear a grade finer, its name its band's rank. Its link (a.link = the officer's id) bears its small aura while it
// stands (agents/auras.js holdsGround); the band's spirit counts the links that stand (agents/squad.js moraleOf).
//   formLinks(w, group, where) — called once a band has its squad: where 'camp' (campaign/camp.js) or 'settlement'
//   (data/migrations.js); RANK_RULES says where ranks are given.
import {SPECIES} from '../data/species.js';
import {RAID_BANDS} from '../data/raids.js';
import {RANK_RULES, OFFICER_DEFAULT} from '../data/ranks.js';
import {hasMark} from '../data/conditions.js';
import {ITEMS} from '../data/items.js';
import {refreshBody} from './special.js';
import {maxHp} from './agent.js';
import {recalcGear, allItems} from './equipment.js';
import {strengthOf, sideStrength} from './strength.js';

const cap = s => s[0].toUpperCase() + s.slice(1);
// the officer's rank name in its band
export const officerName = band => (band && RAID_BANDS.has(band) ? RAID_BANDS.get(band).ranks?.officer : null) || OFFICER_DEFAULT;

// who may take a rank: a thinking fighter that carries things, not a beast, not the boss, not a necromancer or a vampire
// (they lead their own)
const mayRank = a => {
  const sp = SPECIES.get(a.species);
  return sp.inventory && !sp.mindless && !a.warBeast && !a.boss && a.role !== 'necromancer' && a.species !== 'vampire' && !a.gone;
};

// make a member an officer: the mark, a finer grade of everything it carries, full health, its rank's name
// a mark of rank and everything it carries a grade finer (RANK_RULES.quality), at full health
function raise(a, mark) {
  a.marks = [...(a.marks || []).filter(m => m !== mark), mark];
  for (const it of allItems(a)) { const d = ITEMS.get(it.type); if (d.quality !== false) it.q = Math.min(3, (it.q || 0) + RANK_RULES.quality); }
  recalcGear(a); refreshBody(a); a.hp = maxHp(a);
}
export function promote(a, band, leader) {
  raise(a, 'officer');
  // the band's leader keeps its title (Атаман, Орк-вожак); another officer is named by its rank
  if (!leader) {
    const rank = officerName(band), kind = SPECIES.get(a.species).label;
    a.name = a.name === 'Налётчик' || a.cultist ? cap(rank) : `${cap(kind)}-${rank}`;
  }
}

// split the band into links under officers; returns the officers. `leaderId` — the squad's leader, an officer first
export function formLinks(w, group, where, leaderId = null) {
  const R = RANK_RULES;
  if (!R[where]) return [];
  const people = group.filter(mayRank);
  if (people.length < R.least) return [];
  // a band that came in links (data/roles.js LINKS) keeps them: the strongest of each is its officer (a link of one joins
  // the one before it); the leader heads its own. Those who came in no link (an ogre with the orcs) join them by turns
  const nos = [...new Set(people.map(a => a.linkNo).filter(x => x != null))];
  if (nos.length) {
    const groups = [];
    for (const no of nos) { const g = people.filter(a => a.linkNo === no); if (g.length < 2 && groups.length) groups[groups.length - 1].push(...g); else groups.push(g); }
    people.filter(a => a.linkNo == null).forEach((a, k) => groups[k % groups.length].push(a));
    const officers = [];
    for (const g of groups) {
      const o = g.find(a => a.id === leaderId) || g.slice().sort((p, q) => strengthOf(q) - strengthOf(p))[0];
      promote(o, o.band, o.id === leaderId); officers.push(o);
      for (const a of g) a.link = o.id;
    }
    if (w.behave) w.behave.officers = (w.behave.officers || 0) + officers.length;
    return officers;
  }
  const n = Math.ceil(people.length / R.size);
  // the officers: the leader, then the strongest of the rest
  const byStrength = people.slice().sort((p, q) => strengthOf(q) - strengthOf(p));
  const lead = people.find(a => a.id === leaderId);
  const officers = [...(lead ? [lead] : []), ...byStrength.filter(a => a !== lead)].slice(0, n);
  for (const o of officers) { promote(o, o.band, o === lead); o.link = o.id; }
  if (w.behave) w.behave.officers = (w.behave.officers || 0) + officers.length;
  // the rest of the band's thinking fighters by turns, the shooters spread among the links as the others
  const rest = byStrength.filter(a => !officers.includes(a));
  rest.forEach((a, k) => { a.link = officers[k % n].id; });
  return officers;
}

// The dead of a band (mindless: no officer of their own) in links under a wight — the strongest bones of each link
// (data/ranks.js): the mark «умертвие», a grade finer gear, its name; its link hangs on it (a.master = its id: while it
// stands they stand, agents/behaviours/retreat.js), the one they hung on before stays above it (a.masterUp: the
// necromancer). The beasts without hands (zombies) go by turns
// to the links. Returns the wights.
export function formUndeadLinks(w, group, where) {
  const R = RANK_RULES;
  if (!R[where]) return [];
  const dead = group.filter(a => SPECIES.get(a.species).mindless && !a.gone && !a.boss && a.role !== 'necromancer');
  const bones = dead.filter(a => SPECIES.get(a.species).inventory);
  if (dead.length < R.least || !bones.length) return [];
  const nos = [...new Set(bones.map(a => a.linkNo).filter(x => x != null))];
  const groups = nos.length ? nos.map(no => bones.filter(a => a.linkNo === no)) : [];
  if (!groups.length) for (let k = 0; k < Math.ceil(bones.length / R.size); k++) groups.push(bones.filter((_, i) => i % Math.ceil(bones.length / R.size) === k));
  const wights = [];
  for (const g of groups) {
    const o = g.slice().sort((p, q) => strengthOf(q) - strengthOf(p))[0];
    raise(o, 'wight');
    o.name = 'Умертвие'; o.link = o.id; o.master = null;   // a will of its own (in a cultists' band too: «жрец» is a living one)
    wights.push(o);
  }
  // the rest of the dead: their link's wight; the zombies by turns
  const rest = dead.filter(a => !wights.includes(a)); let k = 0;
  for (const a of rest) {
    const i = a.linkNo != null ? nos.indexOf(a.linkNo) : -1, o = wights[i >= 0 ? i : k++ % wights.length];
    a.masterUp = a.master ?? null; a.master = o.id; a.link = o.id;
  }
  return wights;
}

// the side came out worth more than it was bought for (officers and wights made finer, a boss grown): its weakest
// pawns go — never the boss, an officer or a wight, nor one the band's plan rests on (a looter, a torch, a scout: the
// weakest get those tasks, agents/squad.js createSquad) — while what is left still covers `target`, and no fewer than
// `atLeast` stay; the band's squad forgets them
const KEEP_TASKS = new Set(['looter', 'torch', 'scout', 'leader']);
export function trimBand(w, group, target, atLeast = 1) {
  for (;;) {
    const rest = group.filter(g => !g.boss && !hasMark(g, 'officer') && !hasMark(g, 'wight') && !KEEP_TASKS.has(g.sqRole)).sort((p, q) => strengthOf(p, {now: true}) - strengthOf(q, {now: true}));
    if (group.length <= atLeast || !rest.length || sideStrength(group, {now: true}) - strengthOf(rest[0], {now: true}) < target) break;
    const x = rest[0]; x.gone = true; group.splice(group.indexOf(x), 1);   // never came (the map drops the gone)
    const sq = x.squad != null ? w.squads?.[x.squad] : null;
    if (sq) { sq.members = sq.members.filter(id => id !== x.id); sq.size = Math.max(1, sq.size - 1); }
  }
}

