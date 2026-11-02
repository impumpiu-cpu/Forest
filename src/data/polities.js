// Уклады — the profiles of the world's polities (docs/WORLD.md «Державы и уклады»). A kingdom of the humans, a camp of
// goblins, a necromancer's tower, a rift of demons and a den of wolves are one kind of thing — a polity: a subject of the
// world map with holdings, a ruler (or none), a way of being ruled and relations. What differs is the set of rules switched
// on by the profile, never a second model of existence. The systems are in src/atlas/polities.js (the common identity,
// holdings and liege), atlas/persons.js (the ruler as a lasting person) and atlas/succession.js (what happens when the
// ruler dies). A people's realm takes the profile of its id (data/peoples.js `polity`, by default the people's id); a lair
// takes the first profile whose `lairs` test fits its kind (data/lairs.js).
//
//   label      the kind of polity, for the cards («людское королевство»); labelGen — of it
//   rule       how it is ruled: council — a ruler with a court and edicts (data/kingdom.js); chief — one ruler and a
//              simple mind; personal — a master whose own power holds it together (the necromancer); pack — a leader of
//              beasts; solo — the polity is one creature (a dragon)
//   title      what the ruler is called, [m, f] (the lairs: data/names.js TITLE by the kind's mind, unless given)
//   systems    which bodies of rules run for it: court (offices, data/kingdom.js), edicts, treasury (atlas/treasury.js),
//              towns (atlas/peoples.js: it holds towns), mind (atlas/mind.js: the council's course); a lair runs none and
//              lives as atlas/lairs.js lives it — `simple: true`
//   seat       where its ruler lives: 'capital' — the crowned town; 'lair' — the lair itself
//   ruler      the ruler as a person (atlas/persons.js):
//                leads    — it rides with the realm's host (the horde's chief): it may fall in a battle the host loses
//                storm    — chance it dies when its seat is stormed (it is there): a number to calibrate
//                razed    — chance it dies when its seat is burnt to the ground
//                vacancy  — how the office is filled again (atlas/succession.js):
//                  'court'   — the court fills it with COURT.fill a year (data/kingdom.js); the council rules meanwhile
//                              (the office's `vacant` penalty)
//                  'contest' — the next spring the strongest town's own puts a chief up; with `split` chance the
//                              realm breaks instead (atlas/realms.js breakAway), the horde quarrelling over the fire
//                  'heir'    — as the old lairs: one may rise again with LEADER.heir the next years (data/lairs.js)
//                  'none'    — the polity ends with its ruler (a dragon is its own polity)
//                channels — what dies with the ruler of the things it personally held (atlas/control.js): the dead of a
//                           necromancer lose their master; the beasts of a summoner go back to the wood; golems and
//                           treants are a place's and stay
//   lairs      (lair profiles) a test of the lair kind this profile is for (data/lairs.js row)
import {Registry} from '../core/registry.js';

export const POLITIES = new Registry('polity');
POLITIES.registerAll([
  // ── the peoples' realms (data/peoples.js `polity`)
  {id: 'humans', label: 'людское королевство', labelGen: 'людского королевства', rule: 'council', title: ['король', 'королева'], seat: 'capital',
    systems: {court: true, edicts: true, treasury: true, towns: true, mind: true},
    ruler: {leads: false, storm: 0.5, razed: 1, vacancy: 'court', channels: []}},
  {id: 'elves', label: 'эльфийское королевство', labelGen: 'эльфийского королевства', rule: 'council', title: ['владыка', 'владычица'], seat: 'capital',
    systems: {court: true, edicts: true, treasury: true, towns: true, mind: true},
    ruler: {leads: false, storm: 0.5, razed: 1, vacancy: 'court', channels: ['summons']}},
  {id: 'dwarves', label: 'дварфийское королевство', labelGen: 'дварфийского королевства', rule: 'council', title: ['король-под-горой', 'королева-под-горой'], seat: 'capital',
    systems: {court: true, edicts: true, treasury: true, towns: true, mind: true},
    ruler: {leads: false, storm: 0.5, razed: 1, vacancy: 'court', channels: []}},
  {id: 'orcs', label: 'орда', labelGen: 'орды', rule: 'chief', title: ['вождь', 'вождиха'], seat: 'capital',
    systems: {court: true, edicts: true, treasury: true, towns: true, mind: true},
    ruler: {leads: true, storm: 0.7, razed: 1, vacancy: 'contest', split: 0.25, channels: []}},
  // ── the lairs (atlas/lairs.js): micro-polities of the wild, the dead and the rifts
  {id: 'camp', label: 'племенной стан', labelGen: 'племенного стана', rule: 'chief', seat: 'lair', simple: true, lairs: L => !!L.tribe,
    ruler: {leads: true, storm: 0.7, razed: 1, vacancy: 'heir', channels: []}},
  {id: 'tower', label: 'башня некроманта', labelGen: 'башни некроманта', rule: 'personal', seat: 'lair', simple: true, lairs: L => !!L.domain,
    ruler: {leads: true, storm: 0.7, razed: 1, vacancy: 'heir', channels: ['undead']}},
  {id: 'rift', label: 'владение демонов', labelGen: 'владения демонов', rule: 'chief', seat: 'lair', simple: true, lairs: L => !!L.fiend,
    ruler: {leads: true, storm: 0.7, razed: 1, vacancy: 'heir', channels: []}},
  {id: 'manor', label: 'усадьба вампира', labelGen: 'усадьбы вампира', rule: 'personal', seat: 'lair', simple: true, lairs: L => L.at === 'town',
    ruler: {leads: true, storm: 0.7, razed: 1, vacancy: 'heir', channels: []}},
  {id: 'barrow', label: 'логово мертвецов', labelGen: 'логова мертвецов', rule: 'pack', seat: 'lair', simple: true, lairs: L => !!L.undead,
    ruler: {leads: true, storm: 0.7, razed: 1, vacancy: 'heir', channels: []}},
  {id: 'dragon', label: 'одинокий дракон', labelGen: 'одинокого дракона', rule: 'solo', seat: 'lair', simple: true, lairs: L => !!L.dragon,
    ruler: {leads: true, storm: 1, razed: 1, vacancy: 'none', channels: []}},
  {id: 'den', label: 'звериное логово', labelGen: 'звериного логова', rule: 'pack', seat: 'lair', simple: true, lairs: () => true,
    ruler: {leads: true, storm: 0.7, razed: 1, vacancy: 'heir', channels: []}},
]);

// the profile of a lair kind: the first whose test fits (the order above matters: a tower before the dead, a dragon
// before any beast)
export const lairPolity = L => POLITIES.all().find(p => p.lairs && p.lairs(L)) || POLITIES.get('den');

// Succession (atlas/succession.js): what the world does when a ruler dies, beyond the profile's `vacancy`
//   mourn    years a realm's court waits before it fills the throne again (the council rules: the office's `vacant`)
//   contest  the horde's new chief: the strongest living town of the realm puts one up the next spring; `split` of the
//            profile — the chance the realm breaks instead (atlas/realms.js breakAway, the contender the second strongest)
//   ageFrom  a new ruler's age, × its race's lifeFrom (a ruler is a grown one of its kind, not a child)
//   dies     a ruler of a realm dies of age at its race's life × this (its court keeps it well), checked each year
export const SUCCESSION = {mourn: 1, ageFrom: [0.3, 0.6], dies: 0.9};
