// The start of a campaign: which capitals may send a caravan, who the eight are, where they go, what
// they know of the world. The campaign lives in the world itself (a.campaign), as plain data, so the
// world is saved with it (atlas/save.js); the caravan is a party of the world (a.parties, kind 'caravan').
//
// a.campaign = {seed, started: {year, season}, day, capital, realm, people, home, goal, phase,
//   members: [{id, name, gender, race, people, role, special, align, values, hp, alive, gear, died}],
//   food, gold, i, x, y, path, k, camp, why, hungry, seen (Uint8Array, 1 — known), log: [{day, year,
//   season, i, text, kind}], track, stats, rng: {name → position}, party (id)}
import {mulberry, seedNumber} from '../core/rng.js';
import {rollCreature} from '../agents/special.js';
import {SPECIES} from '../data/species.js';
import {ITEMS} from '../data/items.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {CAMPAIGN, RETINUE} from '../data/campaign.js';
import {realmOf, realmLabel, realmTowns} from '../atlas/realms.js';
import {trades} from '../atlas/diplomacy.js';
import {scaleOf} from '../atlas/tectonics.js';
import {townLabel} from '../atlas/towns.js';
import {landDone} from '../atlas/generate.js';
import {say, reveal} from './march.js';
import {EPIC} from '../data/calamities.js';
import {capacity} from './baggage.js';
import {makeQuest, questTarget, questIntro} from './quest.js';
import {CAPTIVE} from '../data/captives.js';

// a named random stream of the campaign, kept by its position (so the campaign stays plain data)
export function draw(K, name) {
  const r = mulberry(K.rng[name] ?? seedNumber(`${K.seed}:campaign:${name}`));
  return {r, done: () => { K.rng[name] = r.state; }};
}

// the capitals that may send a caravan: living capitals of the major peoples' realms
export function capitals(a) {
  return (a.realms || []).filter(r => CAMPAIGN.peoples.includes(r.people)).map(r => a.towns.find(t => t.id === r.capital && t.alive))
    .filter(Boolean).map(t => ({town: t.id, name: t.name, label: `${townLabel(t, 0)} ${t.name}`, realm: t.realm, realmLabel: realmLabel(a, t.realm), people: t.people,
      peopleLabel: WORLD_PEOPLES.get(t.people).label, x: t.x, y: t.y, pop: Math.round(t.pop), towns: realmTowns(a, t.realm).length}));
}

// someone who walks with the caravan: a creature of a race (and sub-race), rolled as the local map rolls
// them, with a name nobody in the caravan has. `core` — one of the eight who set out (the campaign is lost
// when none of them is left); the rest are hired (`contract`) or joined on the way (`loyalty`)
export function makeMember(K, rnd, {race, sub = null, role, gear, core = false, lean = null, ...more}) {
  const sp = SPECIES.get(race), spOf = sub && sp.peoples ? {...sp, peoples: sp.peoples.filter(p => p.id === sub)} : sp;
  const m = {id: (K.nextMember = (K.nextMember || K.members.length) + 1), name: sp.label, gender: 'm', race, role, core, hp: 1, alive: true, joined: K.day, back: 1, ride: null, ...more};
  rollCreature({rngs: {birth: rnd}}, m, spOf, lean ? {lean} : {});
  const used = new Set(K.members.map(x => x.name)), names = (sp.names || []).filter(n => !used.has(n[0]));
  if (names.length) [m.name, m.gender] = names[(rnd() * names.length) | 0];
  m.gear = {hand: [...gear.hand], body: gear.body};
  return m;
}

// one of the eight: of the realm's race and sub-race, in the gear of their rank
function member(K, a, rnd, role, k) {
  const r = realmOf(a, K.realm), R = RETINUE[K.people];
  const gear = role === 'knight' ? {hand: R.knightGear[k % R.knightGear.length], body: RETINUE.armour[k % RETINUE.armour.length]}
    : {hand: RETINUE.squireGear[k % RETINUE.squireGear.length], body: RETINUE.squireBody};
  // the rank's leaning: the fighters to the fighting stats (a bowman — also to Perception), the squires to the others
  const L = RETINUE.lean, bow = gear.hand.some(id => ITEMS.get(id)?.ranged);
  const lean = role === 'knight' ? [...L.knight, ...(bow ? L.bowman : [])] : L.squire;
  return makeMember(K, rnd, {race: WORLD_PEOPLES.get(K.people).race, sub: r.sub, role, gear, core: true, lean});
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
    beasts: [], nextBeast: 1, vehicles: [], cargo: {rope: CAPTIVE.campaign.startRope}, build: null, route: null,
  };
  const {r, done} = draw(K, 'birth');
  for (let k = 0; k < CAMPAIGN.knights; k++) K.members.push(member(K, a, r, 'knight', k));
  for (let k = 0; k < CAMPAIGN.squires; k++) K.members.push(member(K, a, r, 'squire', k));
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
  say(a, K, `Из ${townLabel(t, 2)} ${t.name} вышел караван: ${CAMPAIGN.knights} ${R.knight[2]} и ${CAMPAIGN.squires} ${R.squire[2]} — ${K.members.map(m => m.name).join(', ')}. ` +
    (K.quest ? `${questIntro(a, K)} Еды — на ${Math.floor(K.food / K.members.length)} дней.` : 'Куда идти, никто не знает.'), 'start', true);
  if (!K.quest) K.phase = 'lost';
  return K;
}
