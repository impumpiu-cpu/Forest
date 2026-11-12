// The start of a campaign: which capitals may send a caravan, who the eight are, where they go, what
// they know of the world. The campaign lives in the world itself (a.campaign), as plain data, so the
// world is saved with it (atlas/save.js); the caravan is a party of the world (a.parties, kind 'caravan').
//
// a.campaign = {seed, started: {year, season}, day, capital, realm, people, home, goal, phase,
//   members: [{id, name, gender, race, people, role, special, align, values, hp, alive, gear, died}],
//   food, gold, i, x, y, path, k, camp, why, hungry, seen (Uint8Array, 1 — known), log: [{day, year,
//   season, i, text, kind}], track, stats, rng: {name → position}, party (id)}
import {mulberry, seedNumber} from '../core/rng.js';
import {rulerOf, rulerTitle} from '../atlas/index.js';
import {gearDef, gearType} from '../local/index.js';
import {rollCreature} from '../local/index.js';
import {personality} from '../local/index.js';
import {SPECIES, isSentient} from '../data/species.js';
import {makeName} from '../data/names.js';
import {CAMP} from '../data/camp.js';
import {ensureSocial} from './social.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {CAMPAIGN, RETINUE} from '../data/campaign.js';
import {realmOf, realmLabel, realmTowns} from '../atlas/index.js';
import {trades, realmAlign} from '../atlas/index.js';
import {scaleOf} from '../atlas/index.js';
import {townLabel, townKin} from '../atlas/index.js';
import {COMBAT_ROLES, rolesOf, roleKit} from '../data/roles.js';
import {weighted} from '../core/util.js';
import {landDone} from '../atlas/index.js';
import {say, reveal} from './march.js';
import {EPIC} from '../data/calamities.js';
import {capacity} from './baggage.js';
import {makeQuest, questTarget, questIntro} from './quest.js';
import {contractQuest} from './contracts.js';
import {makeErrand, targetWhy} from './errands.js';
import {CAPTIVE} from '../data/captives.js';
import {ALCHEMY} from '../data/market.js';
import {CAMP_KIT} from '../data/transport.js';
import {ensureXp} from './experience.js';
import {summonInto, sayStart} from './ascend.js';

// a named random stream of the campaign, kept by its position (so the campaign stays plain data)
export function draw(K, name) {
  const r = mulberry(K.rng[name] ?? seedNumber(`${K.seed}:campaign:${name}`));
  return {r, done: () => { K.rng[name] = r.state; }};
}

// the capitals that may send a caravan: living capitals of the major peoples' realms
export function capitals(a) {
  return (a.realms || []).filter(r => CAMPAIGN.peoples.includes(r.people)).map(r => a.towns.find(t => t.id === r.capital && t.alive))
    .filter(Boolean).map(t => {
      const R = a.realms.find(r => r.id === t.realm), ruler = rulerOf(a, R);   // (the ruler as a person: atlas/persons.js)
      return {town: t.id, name: t.name, label: `${townLabel(t, 0)} ${t.name}`, realm: t.realm, realmLabel: realmLabel(a, t.realm), people: t.people,
        peopleLabel: WORLD_PEOPLES.get(t.people).label, align: realmAlign(a, t.realm), x: t.x, y: t.y, pop: Math.round(t.pop), towns: realmTowns(a, t.realm).length,
        ruler: ruler ? `${rulerTitle(R, ruler)} ${ruler.name}` : null};
    });
}

// someone who walks with the caravan: a creature of a race, rolled as the local map rolls
// them, with a name nobody in the caravan has. `core` — one of the eight who set out (the campaign is lost
// when none of them is left); the rest are hired (`contract`) or joined on the way (`loyalty`)
// `align` — the world view it stands near (its realm's: data/values.js); none — its race's
export function makeMember(K, rnd, {race, role, gear, core = false, lean = null, align = null, ...more}) {
  const sp = SPECIES.get(race), spOf = sp;
  const m = {id: (K.nextMember = (K.nextMember || K.members.length) + 1), name: sp.label, gender: 'm', race, role, core, hp: 1, alive: true, joined: K.day, back: 1, ride: null, ...more};
  rollCreature({rngs: {birth: rnd}}, m, spOf, {...(lean ? {lean} : {}), ...(align ? {align} : {})});
  const used = new Set(K.members.map(x => x.name)), names = (sp.names || []).filter(n => !used.has(n[0]));
  if (names.length) [m.name, m.gender] = names[(rnd() * names.length) | 0];
  else if (K.moreNames) { m.gender = rnd() * 2 < 1 ? 'f' : 'm'; m.name = makeName(race, rnd, {gender: m.gender, nick: 'always', used}) || m.name; }   // (the guild's door: more people than the race's list of names — data/names.js makeName, a nickname after)
  m.gear = {hand: [...gear.hand], body: gear.body};
  ensureXp(m);   // experience and level (campaign/experience.js)
  memberLocal(K, m);   // the working character, from the day one joins — not from the first camp (docs/CAMPAIGN.md «Живая команда: договор»)
  return m;
}

// The working character of a member (m.local: liked and disliked work, preferences, traits, taste, own extras, skills, leanings)
// — the same as agents/agent.js personality() gives a colonist, rolled once, when one joins, of the member's own streams
// (`personality` and `leans` by the campaign's seed and the member's id: no other stream of the campaign moves, and a save
// from before gets the same character whenever it is filled in). What one already has is kept: a captive taken on the local
// map brings its own (campaign/captives.js takeFromCamp); an old save keeps what its first camp gave. The ranks' skills and
// a tool's own (data/camp.js CAMP.skills, CAMP.tools) come with it, as the first camp gave them before.
// A character of a save from before with some of it missing (no leanings, no skills…) gets the missing parts of the same roll,
// never a new roll of what it has.
const LOCAL_KEYS = ['likes', 'dislikes', 'prefs', 'traits', 'food', 'own', 'skill', 'leans'];
export function memberLocal(K, m) {
  if (!isSentient(SPECIES.get(m.race))) return m.local || null;
  if (m.local) {
    const lack = LOCAL_KEYS.filter(k => m.local[k] == null);
    if (lack.length) { const born = rollLocal(K, m); for (const k of lack) m.local[k] = born[k]; }
    return m.local;
  }
  m.local = rollLocal(K, m);
  return m.local;
}
function rollLocal(K, m) {
  const rng = s => mulberry(seedNumber(`${K.seed}:campaign:${s}:${m.id}`));
  const c = {special: m.special};
  personality({rngs: {birth: rng('personality'), leans: rng('leans')}}, c);
  for (const [id, v] of Object.entries(CAMP.skills[m.role] || {})) c.skill[id] = Math.max(c.skill[id] || 0, v);
  for (const tok of m.gear?.hand || []) { const id = gearType(tok); if (CAMP.tools[id]) c.skill[CAMP.tools[id]] = Math.max(c.skill[CAMP.tools[id]] || 0, CAMP.toolSkill); }   // (a bought or forged piece is a word with marks: «ironaxe@dwarf»)
  return {likes: c.likes, dislikes: c.dislikes, prefs: c.prefs, traits: c.traits, food: c.food, own: c.own, skill: c.skill, leans: c.leans};
}
// a campaign of a save from before: every member gets the character it lacks (idempotent — memberLocal keeps what is there)
export function upgradeMembers(K) { ensureSocial(K); for (const m of K.members || []) { memberLocal(K, m); ensureXp(m); } }

// The core (data/campaign.js RETINUE): CAMPAIGN.fighters fighters of the realm's kinds — at most RETINUE.big.max of the great
// ones — each of a fighting role drawn by its kind's weights; first the roles a core has at least (RETINUE.least: the line, a
// shooter, a healer), then the rest. → [{species, role}]
export const GROUP = {line: 'линия', shooter: 'дальний бой'};
const mayRole = (sp, id) => { const R = COMBAT_ROLES.get(id); return !R.mount && !R.linkOnly; };   // (no horse at the start, no role of a link only)
const rolesFor = (sp, test = () => true) => rolesOf(sp).filter(([id]) => mayRole(sp, id) && test(COMBAT_ROLES.get(id)));
export function drawCore(a, K, rnd, n = CAMPAIGN.fighters) {   // (n — how many: the guild's candidates at its door, guild/index.js)
  const R = RETINUE[K.people], cap = a.towns.find(t => t.id === K.capital);
  const kinds = R.kinds === 'kin' ? (townKin(a, cap) || {[WORLD_PEOPLES.get(K.people).race]: 1}) : R.kinds;
  const B = RETINUE.big, out = [];
  for (let k = 0; k < n; k++) {
    const big = out.filter(m => B.kinds.includes(m.species)).length >= B.max;
    out.push({species: weighted(rnd, Object.entries(kinds).filter(([sp, w]) => w > 0 && SPECIES.has(sp) && !(big && B.kinds.includes(sp))))});
  }
  // the roles it must have, on whoever of it may take them
  for (const [need, n] of Object.entries(RETINUE.least)) for (let q = 0; q < n; q++) {
    const test = need === 'healer' ? R2 => R2.id === 'healer' : R2 => R2.group === GROUP[need];
    const m = out.find(x => !x.role && rolesFor(x.species, test).length); if (!m) continue;
    m.role = weighted(rnd, rolesFor(m.species, test)); m.required = need;   // (it closes a need of the core: a summoned does not take its place unless it closes the same — campaign/ascend.js)
  }
  for (const m of out) if (!m.role) m.role = weighted(rnd, rolesFor(m.species)) || null;
  return out;
}
// one of the core: of its kind, in its role's kit, a camp's tool on its back (also the guild's recruit: guild/index.js)
export function coreMember(K, a, rnd, {species, role}, k) {
  const r = realmOf(a, K.realm), R = role ? COMBAT_ROLES.get(role) : null;
  const kit = role ? roleKit(species, role, rnd, RETINUE.level) : [];
  const body = kit.find(id => gearDef(id)?.slot === 'body') || RETINUE.body;
  const hand = [...kit.filter(id => gearDef(id)?.slot !== 'body'), ...(RETINUE.tools[k] || [])];   // (the tool goes on the back: agents/equipment.js dress)
  const lean = R ? RETINUE.lean[R.group] || [] : [];
  const own = species === WORLD_PEOPLES.get(K.people).race;
  return makeMember(K, rnd, {race: species, role: 'fighter', fight: role, potions: R?.potions || 0, gear: {hand, body}, core: true, lean, align: own ? realmAlign(a, K.realm) : null});
}

// ── an expedition of the adventurers' guild (guild/index.js launch; plan claude/guild-plan.md Г1): a campaign of chapters
// whose people are the guild's own — the same objects as its roster (one person, two lists: the save keeps them shared,
// core/serialize.js), their bonds the guild's (G.social), what they know of the world the guild's (G.seen), the beasts, carts
// and goods of the guild's store taken along. Its seed is the guild's and the expedition's number: two expeditions never
// share a stream. The guild settles what comes back (guild/index.js closeExpedition).
//   ms — the guild's members going (alive, free); errand, targetId — as newCampaign's; purse — gold from the treasury
// contract — a contract of the board taken (campaign/contracts.js takeContract): its quest instead of an errand's
export function newExpedition(a, G, ms, {errand = null, targetId = null, purse = 0, mode = 'local', contract = null} = {}) {
  const t = a.towns.find(x => x.id === G.town && x.alive);
  if (!t) throw new Error('Город гильдии пал.');
  if (targetId != null) { const why = targetWhy(a, {home: t.i, people: t.people, realm: t.realm, capital: t.id}, errand, targetId); if (why) throw new Error(`Цель не ждёт: ${why}.`); }
  const n = G.nextExpedition = (G.nextExpedition || 0) + 1, S = G.store;
  const K = {
    seed: `${G.seed}:exp:${n}`, mode, guild: G.id, expedition: n, chapters: true, started: {year: a.hist.year, season: a.hist.season}, day: 0,
    capital: t.id, capitalName: t.name, capitalFrom: `${townLabel(t, 2)} ${t.name}`, realm: t.realm, people: t.people, home: t.i, goal: null, phase: 'out',
    members: ms, nextMember: G.nextMember, food: 0, gold: purse, i: t.i, x: t.x + 0.5, y: t.y + 0.5, path: null, k: 0, camp: 0, why: '', hungry: 0,
    seen: G.seen, log: [], track: [], stats: {walked: 0, camps: 0, fights: 0, won: 0, fled: 0, hungryDays: 0, finds: 0, tamed: 0, built: 0, left: 0}, rng: {}, party: null, social: G.social,
    beasts: S.beasts, nextBeast: S.nextBeast || 1, vehicles: S.vehicles, buildings: S.buildings, cargo: S.cargo, build: null, route: null,
  };
  S.beasts = []; S.vehicles = []; S.cargo = {}; S.buildings = [];   // (taken along: they come back with whoever comes back)
  for (const m of ms) { m.joined = 0; m.core = true; memberLocal(K, m); ensureXp(m); }
  const {r, done} = draw(K, 'birth');
  K.food = capacity(K);
  K.quest = contract ? contractQuest(a, K, r, contract, G) : makeErrand(a, K, r, errand, {targetId});
  if (contract) K.contract = contract.uid;
  if (!K.quest) { done(); throw new Error('В этом мире такого поручения сейчас нет.'); }
  K.goal = questTarget(a, K, r);
  if (K.quest.epic) K.years = EPIC.years;
  done();
  reveal(a, K, K.home, CAMPAIGN.fog.known * scaleOf(a));
  const p = {id: (a.hist.nextParty = (a.hist.nextParty || 0) + 1), kind: 'caravan', i: t.i, x: K.x, y: K.y, px: K.x, py: K.y, home: t.i, goal: K.goal,
    state: 'camp', days: 0, stay: 0, speed: 'foot', people: t.people, might: 0, men: ms.length, owner: t.realm, target: null,
    label: `отряд гильдии «${G.name}»`, color: WORLD_PEOPLES.get(t.people).color};
  (a.parties ||= []).push(p); K.party = p.id;
  say(a, K, `Из ${townLabel(t, 2)} ${t.name} вышел отряд гильдии «${G.name}»: ${ms.map(m => `${m.name} (${m.fight ? COMBAT_ROLES.get(m.fight).label : SPECIES.get(m.race).label}, ур. ${m.level || 1})`).join(', ')}. ` +
    `${questIntro(a, K)} Еды — на ${Math.floor(K.food / ms.length)} дней.`, 'start', true);
  return K;
}

// mode: 'local' — fights and stops are played on the local map (campaign/camp.js); 'auto' — settled at once (quick runs)
// summon — the snapshots of the ascended chosen for its core (campaign/ascend.js): taken whole into K.summoned
// errand — the errand chosen of the capital's (data/errands.js; none: the world's own, as before errands were); chapters — the
// errand handed in does not end the campaign: the player gives the next or ends it (campaign/ending.js handIn — the screen's)
// targetId — the lair picked on the board (campaign/errands.js boardFor); one no longer there throws before the campaign is made
export function newCampaign(a, townId, {seed = null, mode = 'local', summon = null, errand = null, targetId = null, chapters = false} = {}) {
  if (!landDone(a) || !a.hist) throw new Error('Кампании нужен мир с историей.');
  const t = a.towns.find(x => x.id === townId && x.alive);
  if (!t || !t.capital || !CAMPAIGN.peoples.includes(t.people)) throw new Error('Это не столица мажорного народа.');
  if (targetId != null) { const why = targetWhy(a, {home: t.i, people: t.people, realm: t.realm, capital: t.id}, errand, targetId); if (why) throw new Error(`Цель не ждёт: ${why}.`); }
  const K = a.campaign = {
    seed: seed || `${a.cfg.seed}:${t.id}`, mode, started: {year: a.hist.year, season: a.hist.season}, day: 0,
    capital: t.id, capitalName: t.name, capitalFrom: `${townLabel(t, 2)} ${t.name}`, realm: t.realm, people: t.people, home: t.i, goal: null, phase: 'out',
    members: [], food: 0, gold: 0, i: t.i, x: t.x + 0.5, y: t.y + 0.5, path: null, k: 0, camp: 0, why: '', hungry: 0,
    seen: new Uint8Array(a.n), log: [], track: [], stats: {walked: 0, camps: 0, fights: 0, won: 0, fled: 0, hungryDays: 0, finds: 0, tamed: 0, built: 0, left: 0}, rng: {}, party: null, social: {version: 1, relations: {}, why: {}, facts: [], commitments: [], applied: {}, faded: {}},
    // the baggage (campaign/baggage.js): beasts, vehicles, goods besides food, what is being built in camp, the way chosen
    beasts: [], nextBeast: 1, vehicles: [], buildings: [...CAMP_KIT.start], cargo: {rope: CAPTIVE.campaign.startRope, pots: ALCHEMY.pots}, build: null, route: null,   // (pots for the healer's hut: data/market.js ALCHEMY)
  };
  const {r, done} = draw(K, 'birth');
  drawCore(a, K, r).forEach((m, k) => { const x = coreMember(K, a, r, m, k); if (m.required) x.required = m.required; K.members.push(x); });
  if (summon?.length) summonInto(a, K, summon);   // the ascended take places in the core (the eight drawn first: the birth stream is the same)
  K.food = capacity(K);   // the satchels are full: a cell of food on every back
  // the quest (campaign/quest.js): the crown, the clues; the first target — where the capital says to look
  K.quest = errand ? makeErrand(a, K, r, errand, {targetId}) : makeQuest(a, K, r);
  if (chapters) K.chapters = true;
  if (K.quest && !K.quest.errand) { K.quest.errand = K.quest.epic ? 'calamity' : 'crown'; K.quest.tier = K.quest.epic ? 4 : 3; K.quest.from = 0; }   // (the world's own: named as an errand of the list)
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
  sayStart(a, K);   // «в прошлый раз…» of the summoned (campaign/ascend.js)
  if (!K.quest) K.phase = 'lost';
  return K;
}
