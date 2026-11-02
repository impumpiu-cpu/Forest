// Succession (docs/WORLD.md «Правители и личности»; the profiles: data/polities.js `ruler.vacancy`, SUCCESSION): what a
// polity does when the person at its head dies — the one event of atlas/persons.js personDies. The office is freed and
// the realm goes on by its profile: a kingdom's court mourns and fills the throne again (atlas/kingdom.js, COURT.fill);
// a horde quarrels — the next spring the strongest town puts a chief up, or the realm breaks (SCHISM); an old lair waits
// for a new leader to rise (LEADER.heir); a dragon's polity ends with the dragon. A seat burnt and a ruler dead are two
// different events (atlas/realms.js seatFallen): a dead ruler leaves the towns where they are, and a lost seat leaves the
// ruler alive if it was elsewhere.
import {LAIRS} from '../data/lairs.js';
import {SUCCESSION} from '../data/polities.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {makeName} from '../data/names.js';
import {profileOf, officeOf, rulerTitle} from './polities.js';
import {realmLabel, realmLabelGen, capitalOf, realmTowns, breakAway} from './realms.js';
import {townLabel, townFx} from './towns.js';
import {newPerson, moveTo, personLabel} from './persons.js';
import {mulberry, seedNumber} from '../core/rng.js';

const cap1 = s => s[0].toUpperCase() + s.slice(1);
const draw = a => { const r = mulberry(a.succRnd ?? seedNumber(`${a.cfg.seed}:atlas:succession`)); return {r, done: () => { a.succRnd = r.state; }}; };

// the fall of a person out of what it held: called by personDies, once
export function rulerFell(a, p, how, say, ctx = {}) {
  const y = a.hist?.year ?? 0;
  // a lair's leader (atlas/leaders.js): the lair is a field again; its vassals go free with the season (freeVassals)
  for (const l of a.lairs || []) {
    if (l.leader !== p) continue;
    const L = LAIRS.get(l.kind), who = personLabel(p), V = profileOf(l).ruler;
    (a.fallenLeaders ||= []).push({lair: l.id, name: who, species: p.species, year: y, how, deeds: p.deeds});
    l.leader = null;
    if (V.vacancy === 'heir' && how === 'age') l.heirAt = y + 1;
    if (V.vacancy === 'none' && l.alive) { l.alive = false; l.died = y; }   // a dragon's polity is the dragon
    say?.({age: `Умер своей смертью ${who}, хозяин «${l.name}» (${L.label}): логово ждёт нового.`,
      beaten: `${who} пал в бою, и «${l.name}» осталось без главаря.`,
      battle: `${who} пал в бою, и «${l.name}» осталось без главаря.`,
      lair: `${who} сгинул вместе с «${l.name}».`,
      caravan: `${who} из «${l.name}» убит караваном.`,
      boss: null}[how] || `${who} из «${l.name}» пропал.`);
  }
  // a realm's office: the throne by the profile, a chair of the court simply emptied
  const off = officeOf(a, p);
  if (off) {
    const [r, o] = off, K = r.kingdom, name = realmLabelGen(a, r.id);
    K.court[o] = null;
    if (o !== 'ruler') { say?.(`${cap1(p.g === 'f' ? officeLabel(o, true) : officeLabel(o))} ${name} ${p.name} умер${p.g === 'f' ? 'ла' : ''}.`); return; }
    const V = profileOf(r).ruler, title = rulerTitle(r, p);
    const died = {age: `умер${p.g === 'f' ? 'ла' : ''} своей смертью`, storm: `погиб${p.g === 'f' ? 'ла' : ''} при штурме столицы`, razed: `погиб${p.g === 'f' ? 'ла' : ''} в сожжённой столице`,
      battle: `пал${p.g === 'f' ? 'а' : ''} в бою`, caravan: `убит${p.g === 'f' ? 'а' : ''} караваном`}[how] || `погиб${p.g === 'f' ? 'ла' : ''}`;
    if (V.vacancy === 'court') { r.mourn = y + SUCCESSION.mourn; say?.(`${cap1(title)} ${name} ${p.name} ${died}: трон пуст, правит совет.`); }
    else if (V.vacancy === 'contest') { r.contest = y; say?.(`${cap1(title)} ${name} ${p.name} ${died}: орда без вождя, и за место у костра уже дерутся.`); }
    else say?.(`${cap1(title)} ${name} ${p.name} ${died}.`);
  }
}
import {OFFICES, COURT} from '../data/kingdom.js';
const officeLabel = (o, f = false) => (f ? OFFICES.get(o).labelF : OFFICES.get(o).label);

// a new ruler of a realm as a person at its seat (atlas/kingdom.js fills the court with these; the horde's contest below):
// of the realm's race, a grown one, named as the court names its people
export function crownRuler(a, r, rnd, {g = null, name = null} = {}) {
  const K = r.kingdom, race = WORLD_PEOPLES.get(r.people).race, cap = capitalOf(a, r.id);
  const used = new Set(Object.values(K.court).filter(Boolean).map(h => h.name));
  const f = g ? g === 'f' : rnd() < COURT.female, nm = name || makeName(race, rnd, {gender: f ? 'f' : 'm', used});
  if (!nm) return null;
  const p = newPerson(a, {name: nm, g: f ? 'f' : 'm', species: race, r: rnd});
  if (cap) moveTo(p, 'town', cap.id);
  return p;
}

// ── a year of succession (spring): the hordes without a chief settle it — the strongest living town's own puts one up,
// unless the realm breaks over it (the profile's `split`: the second strongest town breaks away, atlas/realms.js)
export function stepSuccession(a, say) {
  if (!a.realms?.length || a.hist.season !== 0) return;
  const {r, done} = draw(a), y = a.hist.year;
  for (const realm of a.realms) {
    if (realm.fallen != null || realm.contest == null || realm.contest >= y) continue;
    const K = realm.kingdom; if (!K || K.court.ruler) { realm.contest = null; continue; }
    const V = profileOf(realm).ruler, towns = realmTowns(a, realm.id).sort((p, q) => q.pop * (1 + townFx(q).prestige) - p.pop * (1 + townFx(p).prestige));
    if (!towns.length) { realm.contest = null; continue; }
    const seat = capitalOf(a, realm.id), [first, second] = towns;
    if (V.split && second && second !== seat && r() < V.split) {
      realm.contest = null;
      breakAway(a, realm, second, r, say, `Орда не поделила власть:`);
      continue;
    }
    const p = crownRuler(a, realm, r);
    if (!p) { realm.contest = null; continue; }
    const O = OFFICES.get('ruler'), years = Math.round(O.years[0] + r() * (O.years[1] - O.years[0]));
    K.court.ruler = {person: p.id, since: y, until: y + years};
    realm.contest = null;
    say(`${cap1(rulerTitle(realm, p))} ${realmLabelGen(a, realm.id)} теперь ${p.name}: ${first === seat ? 'ставка' : townLabel(first, 0)} ${first.name} ${first === seat ? 'поставила' : 'поставил'} своего.`);
  }
  done();
}
