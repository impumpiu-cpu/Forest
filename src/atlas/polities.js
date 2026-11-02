// Polities (docs/WORLD.md «Державы и уклады»; the profiles: data/polities.js): one identity for the subjects of the world
// map — the realms of the peoples (a.realms, atlas/realms.js) and the lairs (a.lairs, atlas/lairs.js). A kingdom and a
// camp of goblins are the same kind of thing at different scales: a seat, holdings, a ruler or none, a liege or none, and
// a profile that says which rules run for it. The storage stays where it was — a realm is a realm record, a lair a lair
// record — and this module is the one way to ask the same questions of either: who rules it, where its seat is, what it
// holds, whom it bends the knee to, what it is called. Nothing here makes a second copy of a subject.
//
// a polity handle: {kind: 'realm' | 'lair', id, obj, profile}
import {POLITIES, lairPolity} from '../data/polities.js';
import {LAIRS} from '../data/lairs.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {personOf} from './persons.js';

export const isRealm = x => !!x && typeof x === 'object' && 'people' in x && 'capital' in x;
export const isLair = x => !!x && typeof x === 'object' && 'strength' in x && 'kind' in x;

// the profile of a realm or a lair (data/polities.js): the people's `polity`, or the first lair profile that fits the kind
export function profileOf(x) {
  if (isRealm(x)) { const P = WORLD_PEOPLES.get(x.people); return POLITIES.get(P.polity || x.people); }
  if (isLair(x)) return lairPolity(LAIRS.get(x.kind));
  throw new Error('polity: neither a realm nor a lair');
}
export const polityKey = x => (isRealm(x) ? `r:${x.id}` : `l:${x.id}`);
export const handle = x => ({kind: isRealm(x) ? 'realm' : 'lair', id: x.id, obj: x, profile: profileOf(x)});

// all the living polities of the world: the realms not fallen, the lairs alive
export function polities(a) {
  const out = [];
  for (const r of a.realms || []) if (r.fallen == null) out.push(handle(r));
  for (const l of a.lairs || []) if (l.alive) out.push(handle(l));
  return out;
}
export const polityAlive = x => (isRealm(x) ? x.fallen == null : !!x.alive);
// by its key («r:r3», «l:12»)
export function polityByKey(a, key) {
  const [k, id] = key.split(':');
  return k === 'r' ? (a.realms || []).find(r => r.id === id) || null : (a.lairs || []).find(l => String(l.id) === id) || null;
}

// ── the seat and the holdings
// the seat: a realm's crowned town, a lair itself
export const seatOf = (a, x) => (isRealm(x) ? (a.towns || []).find(t => t.id === x.capital) || null : x);
// what it holds: a realm its living towns; a lair the one place it is (and, for the cards, its captives live there)
export const holdingsOf = (a, x) => (isRealm(x) ? (a.towns || []).filter(t => t.alive && t.realm === x.id) : x.alive ? [x] : []);
// the people of its holdings: a realm's towns' people; a lair's strength has no head count
export const peopleOf = (a, x) => holdingsOf(a, x).reduce((s, t) => s + (isRealm(x) ? t.pop : 0), 0);

// ── the ruler (atlas/persons.js): a realm's — the holder of its `ruler` office; a lair's — its leader
export function rulerOf(a, x) {
  if (isRealm(x)) { const h = x.kingdom?.court?.ruler; return h ? personOf(a, h.person) : null; }
  return x.leader || null;
}
// the realm or the lair a person rules, or null
export function ruledBy(a, p) {
  if (!p) return null;
  for (const r of a.realms || []) if (r.fallen == null && r.kingdom?.court?.ruler?.person === p.id) return r;
  for (const l of a.lairs || []) if (l.alive && l.leader === p) return l;
  return null;
}
// a person's seat in the court of a realm (any office), or null → [realm, officeId]
export function officeOf(a, p) {
  for (const r of a.realms || []) if (r.kingdom?.court) for (const [o, h] of Object.entries(r.kingdom.court)) if (h?.person === p.id) return [r, o];
  return null;
}

// ── the liege: a lair's lord (atlas/leaders.js, atlas/necro.js: tribute); a realm pays tribute by might and attitude a
// year at a time (atlas/treasury.js payTribute) and has no lasting liege
export const lordOf = (a, x) => (isLair(x) && x.lord != null ? (a.lairs || []).find(l => l.id === x.lord) || null : null);
export const vassalsOf = (a, x) => (isLair(x) ? (a.lairs || []).filter(l => l.alive && l.lord === x.id) : []);
// no cycles of liege: `v` may not bend the knee to `lord` if `lord` is, through its lords, `v` already
export function mayBend(a, v, lord) {
  if (!v || !lord || v === lord) return false;
  for (let o = lord, n = 0; o && n < 64; o = lordOf(a, o), n++) if (o === v) return false;
  return true;
}

// ── names for the chronicle and the cards
import {realmLabel} from './realms.js';
export const polityLabel = (a, x) => (isRealm(x) ? realmLabel(a, x.id) : `${LAIRS.get(x.kind).label} «${x.name}»`);
// what the ruler is called by the profile: [m, f]; a lair's leader keeps its title of data/names.js
export const rulerTitle = (x, p = null) => { const T = profileOf(x).title; return T ? T[p?.g === 'f' ? 1 : 0] : p?.title?.[0]?.toLowerCase() || 'главарь'; };
