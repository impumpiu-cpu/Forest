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
import {WORLD_PEOPLES} from '../data/peoples.js';
import {CAMPAIGN, RETINUE} from '../data/campaign.js';
import {realmOf, realmLabel, realmTowns} from '../atlas/realms.js';
import {trades} from '../atlas/diplomacy.js';
import {moveCost} from '../atlas/roads.js';
import {scaleOf} from '../atlas/tectonics.js';
import {settleable} from '../seam/cell.js';
import {townLabel} from '../atlas/towns.js';
import {landDone} from '../atlas/generate.js';
import {say, reveal, scratch} from './march.js';

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

// one of the eight: a creature of the realm's race and sub-race, rolled as the local map rolls them
function member(K, a, rnd, used, role, k) {
  const r = realmOf(a, K.realm), race = WORLD_PEOPLES.get(K.people).race, sp = SPECIES.get(race);
  const spOf = r.sub && sp.peoples ? {...sp, peoples: sp.peoples.filter(p => p.id === r.sub)} : sp;
  const m = {id: K.members.length + 1, name: sp.label, gender: 'm', race, role, hp: 1, alive: true, joined: 0};
  rollCreature({rngs: {birth: rnd}}, m, spOf);
  const names = (sp.names || []).filter(n => !used.has(n[0]));
  if (names.length) { const n = names[(rnd() * names.length) | 0]; [m.name, m.gender] = n; used.add(n[0]); }
  const R = RETINUE[K.people];
  m.gear = role === 'knight' ? {hand: [...R.knightGear[k % R.knightGear.length]], body: RETINUE.armour[k % RETINUE.armour.length]}
    : {hand: [...RETINUE.squireGear[k % RETINUE.squireGear.length]], body: RETINUE.squireBody};
  return m;
}

// where the caravan goes this stage: a land cell far enough, that can be walked to
// (the land that can be walked to from home is found first: a capital may stand on an island)
function pickGoal(a, K, rnd) {
  const diag = Math.hypot(a.w, a.h), [x0, y0] = [K.home % a.w, (K.home / a.w) | 0], G = CAMPAIGN.goal;
  const seen = new Uint8Array(a.n), reach = [], queue = [K.home]; seen[K.home] = 1;
  while (queue.length) {
    const c = queue.pop(), x = c % a.w, y = (c / a.w) | 0;
    if (settleable(a, c)) reach.push(c);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, j = ny * a.w + nx;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && !seen[j] && moveCost(a, j, K.people) < Infinity) { seen[j] = 1; queue.push(j); }
    }
  }
  reach.sort((p, q) => p - q);   // the order of the flood must not decide the draw
  const dist = i => Math.hypot(i % a.w - x0, ((i / a.w) | 0) - y0) / diag;
  for (const [near, far] of [[G.near, G.far], G.wide]) {
    const ring = reach.filter(i => dist(i) >= near && dist(i) <= far);
    if (ring.length) return ring[(rnd() * ring.length) | 0];
  }
  const far = reach.reduce((b, i) => (dist(i) > dist(b) ? i : b), K.home);
  return far === K.home ? null : far;
}

export function newCampaign(a, townId, {seed = null} = {}) {
  if (!landDone(a) || !a.hist) throw new Error('Кампании нужен мир с историей.');
  const t = a.towns.find(x => x.id === townId && x.alive);
  if (!t || !t.capital || !CAMPAIGN.peoples.includes(t.people)) throw new Error('Это не столица мажорного народа.');
  const K = a.campaign = {
    seed: seed || `${a.cfg.seed}:${t.id}`, started: {year: a.hist.year, season: a.hist.season}, day: 0,
    capital: t.id, capitalName: t.name, capitalFrom: `${townLabel(t, 2)} ${t.name}`, realm: t.realm, people: t.people, home: t.i, goal: null, phase: 'out',
    members: [], food: 0, gold: 0, i: t.i, x: t.x + 0.5, y: t.y + 0.5, path: null, k: 0, camp: 0, why: '', hungry: 0,
    seen: new Uint8Array(a.n), log: [], track: [], stats: {walked: 0, camps: 0, fights: 0, won: 0, fled: 0, hungryDays: 0, finds: 0}, rng: {}, party: null,
  };
  const {r, done} = draw(K, 'birth'), used = new Set();
  for (let k = 0; k < CAMPAIGN.knights; k++) K.members.push(member(K, a, r, used, 'knight', k));
  for (let k = 0; k < CAMPAIGN.squires; k++) K.members.push(member(K, a, r, used, 'squire', k));
  K.food = CAMPAIGN.pack * K.members.length;
  K.goal = pickGoal(a, K, r);
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
  say(a, K, `Из ${townLabel(t, 2)} ${t.name} вышел караван: ${CAMPAIGN.knights} ${R.knight[1]} и ${CAMPAIGN.squires} ${R.squire[1]} — ${K.members.map(m => m.name).join(', ')}. ` +
    (K.goal == null ? 'Куда идти, никто не знает.' : `У них поручение и еды на ${CAMPAIGN.pack} дней.`), 'start', true);
  if (K.goal == null) K.phase = 'lost';
  return K;
}
