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

// (by id through an index kept beside the list, never saved: persons are only ever added — newPerson — so the index
// catches up with the list's new tail; a list replaced, as on loading, gets a new index)
const INDEX = new WeakMap();
export function personOf(a, id) {
  if (id == null || !a.persons) return null;
  let X = INDEX.get(a.persons);
  if (!X) INDEX.set(a.persons, (X = {n: 0, by: new Map()}));
  for (; X.n < a.persons.length; X.n++) { const p = a.persons[X.n]; if (!X.by.has(p.id)) X.by.set(p.id, p); }
  return X.by.get(id) || null;
}
export const livingPersons = a => (a.persons || []).filter(p => p.alive && !p.inCount);   // (one back in the crowd is counted with its town, not as a person)
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

// a world saved before the persons (atlas/save.js loadAtlas): the leaders of its lairs and the holders of its courts become
// persons of the world — the same names, species, years and stats; nothing is invented beyond what the record had (a court's
// holder gets its race's body at the seat, and an age drawn as a new one's would be). Done once; a world of the new format
// is left as it is
export function upgradePersons(a) {
  a.persons ||= [];
  const H = a.hist; if (!H) return;
  const known = new Set(a.persons.map(p => p.id));
  for (const l of a.lairs || []) {
    const ld = l.leader; if (!ld || (ld.id != null && known.has(ld.id) && ld.alive != null)) continue;
    const p = newPerson(a, {name: ld.name, title: ld.title || null, species: ld.species, race: ld.race || null, g: ld.g || 'm', born: ld.born ?? H.year, dies: ld.dies ?? null,
      special: ld.special || null, add: ld.add || null, at: {kind: 'lair', id: l.id}, abilities: LAIRS_DOMAIN(l) ? ['necromancy'] : []});
    p.deeds = ld.deeds || 0; if (ld.since != null) p.since = ld.since;
    l.leader = p;
  }
  for (const r of a.realms || []) {
    const K = r.kingdom; if (!K?.court) continue;
    const seat = (a.towns || []).find(t => t.id === r.capital && t.alive);
    for (const [o, h] of Object.entries(K.court)) {
      if (!h || h.person != null) continue;
      const race = WORLD_PEOPLES_RACE(r.people);
      const p = newPerson(a, {name: h.name, g: h.f ? 'f' : 'm', species: race, at: seat ? {kind: 'town', id: seat.id} : null});
      p.extra = true;   // (never named out of a town's count: it goes back into none)
      K.court[o] = {person: p.id, since: h.since ?? H.year, until: h.until ?? H.year};
    }
  }
}
import {LAIRS} from '../data/lairs.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
const LAIRS_DOMAIN = l => !!LAIRS.get(l.kind)?.domain;
const WORLD_PEOPLES_RACE = people => WORLD_PEOPLES.get(people).race;

// a person named out of a town's people (a court's holder, a crowned ruler): one grown one of its race leaves the count of
// the town (atlas/population.js, booked `named`) and lives on as the person — the town's people and its persons are two
// counts that never hold the same head twice; a person dead is not put back (it left the count when it was named)
import {takeHeads, groupSize} from './population.js';
export function nameOut(a, p, t) {
  if (!hasGrown(a, t, p.species)) return 0;
  const G = takeHeads(a, t, 1, {race: p.species, band: 1, how: 'named'});
  return groupSize(G);
}
// a person off its office goes back into the crowd of its town (the court's holder whose years ran out): one of its race in its
// band of age back into the count, and the person is no longer followed apart — alive, but of the town (`inCount`); it is never
// named out twice as the same record. `inCount` is set only when the count really took it: a person not at a living town (with a
// host on the march, say) keeps its place and the mark `crowd`, and goes into the count of the first town it comes to (landed) —
// a person has one owner of its count at any moment: a town's count, or itself apart. An old save's person (`extra`) was never
// out of a count: it is only let go
export function backToCrowd(a, p, t) {
  if (!p || !p.alive || p.inCount) return false;
  if (p.extra) { p.inCount = true; p.at = null; delete p.crowd; return true; }
  if (!t?.alive || !(a.towns || []).includes(t)) { p.crowd = true; return false; }   // (not at a town: it stays apart till it comes to one)
  const [ad, old] = bandEdges(p.species), age = ageOf(a, p), band = age < ad ? 0 : age < old ? 1 : 2;
  addHeads(a, t, p.species, 1, band);
  p.inCount = true; p.at = null; delete p.crowd;
  return true;
}
// a person comes to a town: one off its office (`crowd`) goes into the town's count there, the rest are at the town
export const landed = (a, p, t) => { if (p.crowd && backToCrowd(a, p, t)) return; moveTo(p, 'town', t.id); };
import {addHeads, bandEdges} from './population.js';
// is there a grown one of this race in the town to be named (a whole one: the count is fractional, a person is not)
import {headsOf} from './population.js';
export const hasGrown = (a, t, race) => !!t && !!t.alive && t.pop > 0 && (headsOf(a, t)[race]?.[1] || 0) >= 1;

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

// ── a person bound and led off (the caravan's captive, campaign/march.js): alive, but out of its seat — the office is freed
// and what it held by its own power goes, as at death; it comes back only by a rule of its own (none yet) → true if taken now
export function personCaptured(a, p, by, say = () => {}) {
  if (!p || !p.alive || p.captive) return false;
  const seat = ruledBy(a, p);
  p.captive = {year: a.hist?.year ?? 0, by, seat: seat ? {kind: 'people' in seat ? 'realm' : 'lair', id: seat.id} : null};   // (where it ruled: it may come back to it)
  loseChannels(a, p, say, {captured: true});
  rulerFell(a, p, 'captured', say, {captured: true});
  p.at = {kind: by, id: null};
  return true;
}
// a captive's fate in the caravan (campaign/: a member with `person` is this person). A person is in ONE place: while the member
// walks with the caravan — bound, or unbound as one of its own — the person is with the caravan and nowhere else; it is back in
// the world only when the member has left it.
//   'unbound' — its bonds off, it walks on with the caravan (campaign/captives.js freedomEvening): no captive, still with it
//   'escaped', 'freed' — gone from the caravan, free: back at the head of its lair if that lair still waits for a leader, else loose
//   'dead' — dead by the caravan's hand; 'sold' — a slave of the town that bought it; 'kept' — a captive held at the town the
//   caravan came home to; 'taken' — led off by raiders, a captive of no one in particular
export function memberFate(a, m, how, town = null) {
  if (m?.person == null) return;
  const p = personOf(a, m.person); if (!p || !p.alive) return;
  if (how === 'dead') { personDies(a, p, 'caravan'); return; }
  if (how === 'unbound') { if (p.captive?.seat) p.was = p.captive.seat; p.captive = null; p.at = {kind: 'caravan', id: null}; return; }   // (`was`: the seat it was taken from, for the day it is let go)
  if (how === 'sold' || how === 'kept') { p.captive = {...(p.captive || {}), by: 'town', year: a.hist?.year ?? 0}; p.at = town ? {kind: 'town', id: town.id} : null; return; }
  if (how === 'taken') { p.captive = {...(p.captive || {}), by: 'raiders', year: a.hist?.year ?? 0}; p.at = null; return; }
  // escaped, freed: free — and the member is no longer of the caravan (its caller has let it go)
  const seat = p.captive?.seat || p.was, l = seat?.kind === 'lair' ? (a.lairs || []).find(x => x.id === seat.id) : null;
  p.captive = null; delete p.was;
  if (l?.alive && !l.leader) { l.leader = p; l.heirAt = null; moveTo(p, 'lair', l.id); } else p.at = null;
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
  for (const p of personsAt(a, 'town', t.id)) { if (to) landed(a, p, to); else personDies(a, p, 'lost', say); }
}
// a party gone where it stands (lost its way, disbanded): the persons with it make their own way to the town it came from, or
// to the nearest living town of its owner's realm — a person is never left at a party that is no more
export function stranded(a, party) {
  const ps = personsAt(a, 'party', party.id); if (!ps.length) return;
  if (party.kind === 'leader' || party.kind === 'raid' || party.kind === 'brood') {   // a lair's band: its leader makes its way back to the lair, or is lost with it
    const l = (a.lairs || []).find(x => x.id === party.owner);
    for (const p of ps) { if (l?.alive) moveTo(p, 'lair', l.id); else personDies(a, p, 'lost'); }
    return;
  }
  const home = (a.towns || []).find(t => t.id === party.from && t.alive);
  const to = home || (a.towns || []).filter(t => t.alive && (party.owner != null ? t.realm === party.owner : true)).sort((p, q) => Math.hypot(p.x - party.x, p.y - party.y) - Math.hypot(q.x - party.x, q.y - party.y))[0] || null;
  for (const p of ps) { if (to) landed(a, p, to); else personDies(a, p, 'lost'); }
}
// the host is home: its persons step off at the town (one off its office goes into the town's count — backToCrowd)
export function stepOff(a, party, t) {
  for (const p of personsAt(a, 'party', party.id)) landed(a, p, t);
}

// ── a year of the persons (spring): age takes those whose years are out. The lairs' leaders are counted by their own
// stream in atlas/leaders.js (LEADER.life); one with the caravan — a captive, one unbound — by the caravan, which owns its
// record (campaign/index.js agePersons: the member dies, and the person with it); here the rest: a realm's ruler, its court
export const agedOut = (a, p) => p.alive && p.dies != null && (a.hist?.year ?? 0) >= p.dies;
export function stepPersons(a, say) {
  if (!a.persons || a.hist.season !== 0) return;
  for (const p of a.persons) if (agedOut(a, p) && p.at?.kind !== 'caravan' && !(a.lairs || []).some(l => l.leader?.id === p.id)) personDies(a, p, 'age', say);
  for (const p of a.persons) if (p.alive && p.crowd && !p.inCount && p.at?.kind === 'town') backToCrowd(a, p, whereIs(a, p));   // (one off its office that found itself at a town: into its count)
}
