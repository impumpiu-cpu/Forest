// Persons of the world map (docs/WORLD.md «Правители и личности»): the lasting people of the history — the rulers of the
// realms, the leaders of the lairs, the holders of a court's offices. A person is one record, kept in a.persons, whoever
// points at it: a lair's `leader`, a realm's court office, a party on the march. It has a body (its species), a name, an
// age and a place, and it dies exactly once (personDies): by age, in a fight it was in, with the seat it was in when it
// was stormed, or by a caravan's hand (campaign/march.js). What its death does to the world — the office it held, the
// things it held by its own power (atlas/control.js), who takes its place (atlas/succession.js) — follows from that one
// event; nothing else writes `alive`. An office is not a body: a term that runs out (data/kingdom.js OFFICES years)
// sends the holder off the office and leaves it alive.
//
// a.persons = [{id, name, g, species, race?, title?: [nom, gen], born, dies, at: {kind: 'town' | 'lair' | 'party', id} | null,
//               alive, died?: {year, how, at}, special?, add?, deeds, abilities: [id]}]
import {SPECIES} from '../data/species.js';
import {SUCCESSION} from '../data/polities.js';

export const personOf = (a, id) => (id == null ? null : (a.persons || []).find(p => p.id === id) || null);
export const livingPersons = a => (a.persons || []).filter(p => p.alive);
export const personLabel = p => (p.title ? `${p.title[0]} ${p.name}` : p.name);
export const ageOf = (a, p) => (a.hist?.year ?? 0) - p.born;

// how long one of a race lives, for a person's span (data/races.js body: lifeFrom … life)
const lifeOf = species => { const B = SPECIES.has(species) ? SPECIES.get(species).body || {} : {}; return B.life || B.lifeFrom || 70; };
const lifeFromOf = species => { const B = SPECIES.has(species) ? SPECIES.get(species).body || {} : {}; return B.lifeFrom ?? B.life ?? 60; };

// a new person: `born` as given, or by an age drawn between SUCCESSION.ageFrom of its race's lifeFrom (a grown one);
// `dies` as given (the lairs' leaders: data/lairs.js LEADER.life), or at its race's life × SUCCESSION.dies
export function newPerson(a, {name, g = 'm', species, race = null, title = null, born = null, dies = null, at = null, special = null, add = null, abilities = [], r = null}) {
  const H = a.hist, year = H?.year ?? 0;
  const id = (H.nextPerson = (H.nextPerson || 0) + 1);
  if (born == null) { const [lo, hi] = SUCCESSION.ageFrom; born = year - Math.round(lifeFromOf(species) * (lo + (r ? r() : 1 / 2) * (hi - lo))); }
  if (dies == null) dies = born + Math.round(lifeOf(species) * SUCCESSION.dies);
  const p = {id, name, g, species, title, born, dies, at, alive: true, deeds: 0, abilities: [...abilities]};
  if (race) p.race = race;
  if (special) p.special = special;
  if (add) p.add = add;
  (a.persons ||= []).push(p);
  return p;
}

// where a person is: {kind, id} → the town, the lair or the party, or null
export function whereIs(a, p) {
  const at = p?.at; if (!at) return null;
  if (at.kind === 'town') return (a.towns || []).find(t => t.id === at.id) || null;
  if (at.kind === 'lair') return (a.lairs || []).find(l => l.id === at.id) || null;
  if (at.kind === 'party') return (a.parties || []).find(x => x.id === at.id && x.state !== 'gone') || null;
  return null;
}
export const moveTo = (p, kind, id) => { p.at = {kind, id}; return p; };
export const isAt = (p, kind, id) => !!p?.at && p.at.kind === kind && p.at.id === id;
// the persons at a place
export const personsAt = (a, kind, id) => livingPersons(a).filter(p => isAt(p, kind, id));

// ── the one event of death. `how`: 'age' | 'battle' | 'storm' | 'razed' | 'caravan' | 'lair' | 'boss' | …; `say` tells the
// chronicle what the holders of the dead one's places say (atlas/succession.js, atlas/control.js); → true when it died now
// (false: it was dead already — a scene applied twice changes nothing)
import {rulerFell} from './succession.js';
import {loseChannels} from './control.js';
export function personDies(a, p, how, say = () => {}, ctx = {}) {
  if (!p || !p.alive) return false;
  p.alive = false;
  p.died = {year: a.hist?.year ?? 0, how, at: p.at ? {...p.at} : null};
  // first the things it held by its own power go (the necromancer's dead, the summoner's beasts): they are its, not its office's
  loseChannels(a, p, say, ctx);
  // then its offices: the realm's throne, the lair's leadership, a court's chair
  rulerFell(a, p, how, say, ctx);
  p.at = null;
  return true;
}

// ── the persons on the march. A ruler whose profile says it leads (data/polities.js ruler.leads) rides with the host its
// seat sends (atlas/army.js): it may fall when the host is beaten, and it comes home with it
import {profileOf, ruledBy} from './polities.js';
export function rideWith(a, t, party) {
  for (const p of personsAt(a, 'town', t.id)) { const x = ruledBy(a, p); if (x && profileOf(x).ruler.leads) moveTo(p, 'party', party.id); }
}
// the host is beaten (or lost): each person with it may fall by its polity's `battle`
export function partyBeaten(a, party, rnd, say) {
  for (const p of personsAt(a, 'party', party.id)) { const x = ruledBy(a, p), B = x ? profileOf(x).ruler.battle ?? 0 : 0; if (rnd() < B) personDies(a, p, 'battle', say); }
}
// a town stormed (atlas/diplomacy.js): each person in it — the realm's ruler, its court — falls by its polity's `storm`, or
// `razed` when the town is burnt to the ground (data/polities.js); a court's chair with no polity of its own goes by the
// realm's profile too
export function townStormed(a, t, razed, rnd, say) {
  const realm = (a.realms || []).find(r => r.id === t.realm), prof = realm ? profileOf(realm) : null;
  for (const p of personsAt(a, 'town', t.id)) {
    const x = ruledBy(a, p) || realm, P = x ? profileOf(x).ruler : prof?.ruler; if (!P) continue;
    if (rnd() < (razed ? P.razed : P.storm)) personDies(a, p, razed ? 'razed' : 'storm', say);
  }
}
// a town is gone (burnt, left): the persons still in it go to the seat of its realm, or to its nearest living town; of no
// realm with a town left, they are lost with it
export function townGone(a, t, say) {
  const realm = (a.realms || []).find(r => r.id === t.realm);
  const towns = (a.towns || []).filter(o => o.alive && o !== t && o.realm === t.realm);
  const to = towns.find(o => realm && o.id === realm.capital) || towns.sort((p, q) => Math.hypot(p.x - t.x, p.y - t.y) - Math.hypot(q.x - t.x, q.y - t.y))[0] || null;
  for (const p of personsAt(a, 'town', t.id)) { if (to) moveTo(p, 'town', to.id); else personDies(a, p, 'lost', say); }
}
// the host is home: its persons step off at the town
export function stepOff(a, party, t) {
  for (const p of personsAt(a, 'party', party.id)) moveTo(p, 'town', t.id);
}

// ── a year of the persons (spring): age takes those whose years are out. The lairs' leaders are counted by their own
// stream in atlas/leaders.js (LEADER.life) — here the rest: a realm's ruler, its court
export function stepPersons(a, say) {
  if (!a.persons || a.hist.season !== 0) return;
  const y = a.hist.year;
  for (const p of a.persons) if (p.alive && p.dies != null && y >= p.dies && !(a.lairs || []).some(l => l.leader?.id === p.id)) personDies(a, p, 'age', say);
}
