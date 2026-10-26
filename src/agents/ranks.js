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
import {strengthOf} from './strength.js';

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
export function promote(a, band, leader) {
  a.marks = [...(a.marks || []).filter(m => m !== 'officer'), 'officer'];
  for (const it of allItems(a)) { const d = ITEMS.get(it.type); if (d.quality !== false) it.q = Math.min(3, (it.q || 0) + RANK_RULES.quality); }
  recalcGear(a); refreshBody(a); a.hp = maxHp(a);
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
  // the one before it); the leader heads its own
  const nos = [...new Set(people.map(a => a.linkNo).filter(x => x != null))];
  if (nos.length && people.every(a => a.linkNo != null)) {
    const groups = [];
    for (const no of nos) { const g = people.filter(a => a.linkNo === no); if (g.length < 2 && groups.length) groups[groups.length - 1].push(...g); else groups.push(g); }
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

// is this creature an officer (the mark)
export const isOfficer = a => hasMark(a, 'officer');
