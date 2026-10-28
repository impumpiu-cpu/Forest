// The start of a campaign: which capitals may send a caravan, who the eight are, where they go, what
// they know of the world. The campaign lives in the world itself (a.campaign), as plain data, so the
// world is saved with it (atlas/save.js); the caravan is a party of the world (a.parties, kind 'caravan').
//
// a.campaign = {seed, started: {year, season}, day, capital, realm, people, home, goal, phase,
//   members: [{id, name, gender, race, people, role, special, align, values, hp, alive, gear, died}],
//   food, gold, i, x, y, path, k, camp, why, hungry, seen (Uint8Array, 1 — known), log: [{day, year,
//   season, i, text, kind}], track, stats, rng: {name → position}, party (id)}
import {mulberry, seedNumber} from '../core/rng.js';
import {gearDef} from '../agents/equipment.js';
import {rollCreature} from '../agents/special.js';
import {SPECIES} from '../data/species.js';
import {ITEMS} from '../data/items.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {CAMPAIGN, RETINUE} from '../data/campaign.js';
import {realmOf, realmLabel, realmTowns} from '../atlas/realms.js';
import {trades, realmAlign} from '../atlas/diplomacy.js';
import {scaleOf} from '../atlas/tectonics.js';
import {townLabel, townKin} from '../atlas/towns.js';
import {COMBAT_ROLES, rolesOf, roleKit} from '../data/roles.js';
import {weighted} from '../core/util.js';
import {landDone} from '../atlas/generate.js';
import {say, reveal} from './march.js';
import {EPIC} from '../data/calamities.js';
import {capacity} from './baggage.js';
import {makeQuest, questTarget, questIntro} from './quest.js';
import {CAPTIVE} from '../data/captives.js';
import {ALCHEMY} from '../data/market.js';

// a named random stream of the campaign, kept by its position (so the campaign stays plain data)
export function draw(K, name) {
  const r = mulberry(K.rng[name] ?? seedNumber(`${K.seed}:campaign:${name}`));
  return {r, done: () => { K.rng[name] = r.state; }};
}

// the capitals that may send a caravan: living capitals of the major peoples' realms
export function capitals(a) {
  return (a.realms || []).filter(r => CAMPAIGN.peoples.includes(r.people)).map(r => a.towns.find(t => t.id === r.capital && t.alive))
    .filter(Boolean).map(t => ({town: t.id, name: t.name, label: `${townLabel(t, 0)} ${t.name}`, realm: t.realm, realmLabel: realmLabel(a, t.realm), people: t.people,
      peopleLabel: WORLD_PEOPLES.get(t.people).label, align: realmAlign(a, t.realm), x: t.x, y: t.y, pop: Math.round(t.pop), towns: realmTowns(a, t.realm).length}));
}

// someone who walks with the caravan: a creature of a race (and sub-race), rolled as the local map rolls
// them, with a name nobody in the caravan has. `core` — one of the eight who set out (the campaign is lost
// when none of them is left); the rest are hired (`contract`) or joined on the way (`loyalty`)
// `align` — the world view it stands near (its realm's: data/values.js); none — its race's
export function makeMember(K, rnd, {race, sub = null, role, gear, core = false, lean = null, align = null, ...more}) {
  const sp = SPECIES.get(race), spOf = sub && sp.peoples ? {...sp, peoples: sp.peoples.filter(p => p.id === sub)} : sp;
  const m = {id: (K.nextMember = (K.nextMember || K.members.length) + 1), name: sp.label, gender: 'm', race, role, core, hp: 1, alive: true, joined: K.day, back: 1, ride: null, ...more};
  rollCreature({rngs: {birth: rnd}}, m, spOf, {...(lean ? {lean} : {}), ...(align ? {align} : {})});
  const used = new Set(K.members.map(x => x.name)), names = (sp.names || []).filter(n => !used.has(n[0]));
  if (names.length) [m.name, m.gender] = names[(rnd() * names.length) | 0];
  m.gear = {hand: [...gear.hand], body: gear.body};
  return m;
}

// The core (data/campaign.js RETINUE): CAMPAIGN.fighters fighters of the realm's kinds — at most RETINUE.big.max of the great
// ones — each of a fighting role drawn by its kind's weights; first the roles a core has at least (RETINUE.least: the line, a
// shooter, a healer), then the rest. → [{species, role}]
const GROUP = {line: 'линия', shooter: 'дальний бой'};
const mayRole = (sp, id) => { const R = COMBAT_ROLES.get(id); return !R.mount && !R.linkOnly; };   // (no horse at the start, no role of a link only)
const rolesFor = (sp, test = () => true) => rolesOf(sp).filter(([id]) => mayRole(sp, id) && test(COMBAT_ROLES.get(id)));
export function drawCore(a, K, rnd) {
  const R = RETINUE[K.people], cap = a.towns.find(t => t.id === K.capital);
  const kinds = R.kinds === 'kin' ? (townKin(a, cap) || {[WORLD_PEOPLES.get(K.people).race]: 1}) : R.kinds;
  const B = RETINUE.big, out = [];
  for (let k = 0; k < CAMPAIGN.fighters; k++) {
    const big = out.filter(m => B.kinds.includes(m.species)).length >= B.max;
    out.push({species: weighted(rnd, Object.entries(kinds).filter(([sp, w]) => w > 0 && SPECIES.has(sp) && !(big && B.kinds.includes(sp))))});
  }
  // the roles it must have, on whoever of it may take them
  for (const [need, n] of Object.entries(RETINUE.least)) for (let q = 0; q < n; q++) {
    const test = need === 'healer' ? R2 => R2.id === 'healer' : R2 => R2.group === GROUP[need];
    const m = out.find(x => !x.role && rolesFor(x.species, test).length); if (!m) continue;
    m.role = weighted(rnd, rolesFor(m.species, test));
  }
  for (const m of out) if (!m.role) m.role = weighted(rnd, rolesFor(m.species)) || null;
  return out;
}
// one of the core: of its kind (the realm's sub-race for the realm's own race), in its role's kit, a camp's tool on its back
function member(K, a, rnd, {species, role}, k) {
  const r = realmOf(a, K.realm), R = role ? COMBAT_ROLES.get(role) : null;
  const kit = role ? roleKit(species, role, rnd, RETINUE.level) : [];
  const body = kit.find(id => gearDef(id)?.slot === 'body') || RETINUE.body;
  const hand = [...kit.filter(id => gearDef(id)?.slot !== 'body'), ...(RETINUE.tools[k] || [])];   // (the tool goes on the back: agents/equipment.js dress)
  const lean = R ? RETINUE.lean[R.group] || [] : [];
  const own = species === WORLD_PEOPLES.get(K.people).race;
  return makeMember(K, rnd, {race: species, sub: own ? r.sub : null, role: 'fighter', fight: role, potions: R?.potions || 0, gear: {hand, body}, core: true, lean, align: own ? realmAlign(a, K.realm) : null});
}

// mode: 'local' — fights and stops are played on the local map (campaign/camp.js); 'auto' — settled at once (quick runs)
export function newCampaign(a, townId, {seed = null, mode = 'local'} = {}) {
  if (!landDone(a) || !a.hist) throw new Error('Кампании нужен мир с историей.');
  const t = a.towns.find(x => x.id === townId && x.alive);
  if (!t || !t.capital || !CAMPAIGN.peoples.includes(t.people)) throw new Error('Это не столица мажорного народа.');
  const K = a.campaign = {
    seed: seed || `${a.cfg.seed}:${t.id}`, mode, started: {year: a.hist.year, season: a.hist.season}, day: 0,
    capital: t.id, capitalName: t.name, capitalFrom: `${townLabel(t, 2)} ${t.name}`, realm: t.realm, people: t.people, home: t.i, goal: null, phase: 'out',
    members: [], food: 0, gold: 0, i: t.i, x: t.x + 0.5, y: t.y + 0.5, path: null, k: 0, camp: 0, why: '', hungry: 0,
    seen: new Uint8Array(a.n), log: [], track: [], stats: {walked: 0, camps: 0, fights: 0, won: 0, fled: 0, hungryDays: 0, finds: 0, tamed: 0, built: 0, left: 0}, rng: {}, party: null,
    // the baggage (campaign/baggage.js): beasts, vehicles, goods besides food, what is being built in camp, the way chosen
    beasts: [], nextBeast: 1, vehicles: [], cargo: {rope: CAPTIVE.campaign.startRope, pots: ALCHEMY.pots}, build: null, route: null,   // (pots for the healer's hut: data/market.js ALCHEMY)
  };
  const {r, done} = draw(K, 'birth');
  drawCore(a, K, r).forEach((m, k) => K.members.push(member(K, a, r, m, k)));
  K.food = capacity(K);   // the satchels are full: a cell of food on every back
  // the quest (campaign/quest.js): the crown, the clues; the first target — where the capital says to look
  K.quest = makeQuest(a, K, r);
  K.goal = K.quest ? questTarget(a, K, r) : null;
  if (K.quest?.epic) K.years = EPIC.years;
  done();
  // what they know: their realm's lands, the towns of those their realm trades with
  const k = scaleOf(a);
  for (const o of a.towns.filter(x => x.alive)) {
    if (o.realm === K.realm) reveal(a, K, o.i, CAMPAIGN.fog.known * k);
    else if (o.realm && trades(a, K.realm, o.realm)) reveal(a, K, o.i, CAMPAIGN.fog.partner * k);
  }
  reveal(a, K, K.home, CAMPAIGN.fog.known * k);
  // the caravan on the world map: a party the world does not walk (atlas/parties.js)
  const p = {id: (a.hist.nextParty = (a.hist.nextParty || 0) + 1), kind: 'caravan', i: t.i, x: K.x, y: K.y, px: K.x, py: K.y, home: t.i, goal: K.goal,
    state: 'camp', days: 0, stay: 0, speed: 'foot', people: t.people, might: 0, men: K.members.length, owner: t.realm, target: null,
    label: `караван ${townLabel(t, 2)} ${t.name}`, color: WORLD_PEOPLES.get(t.people).color};
  (a.parties ||= []).push(p); K.party = p.id;
  const R = RETINUE[t.people];
  say(a, K, `Из ${townLabel(t, 2)} ${t.name} вышел караван: ${CAMPAIGN.fighters} ${R.title[2]} — ${K.members.map(m => `${m.name} (${m.fight ? COMBAT_ROLES.get(m.fight).label : SPECIES.get(m.race).label})`).join(', ')}. ` +
    (K.quest ? `${questIntro(a, K)} Еды — на ${Math.floor(K.food / K.members.length)} дней.` : 'Куда идти, никто не знает.'), 'start', true);
  if (!K.quest) K.phase = 'lost';
  return K;
}
