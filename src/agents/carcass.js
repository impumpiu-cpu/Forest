// Carcasses and pack hunts.
//
// A carcass is a thing on the map (w.carcasses): what a predator killed lies where it fell, with so
// much food in it (fullness units for beasts) and the share of its meat, hide and bone still on it.
//   — the pack eats it, a few at a time; eating is broken off by people, fire, a crowd, and taken up
//     again: a hungry beast goes back to a carcass it knows of;
//   — scavengers come to it: hyenas and other predators that smell it, the kikimora by night;
//   — a hunter may take it from the beasts (agents/jobRunners.js hunt): bold, starving beasts turn on
//     him, the rest give way; what is left of meat, hide and bone goes home;
//   — one left lying feeds the rot: it spoils, and after a few days in the dark an upyr may rise from it.
//
// A pack hunt (w.hunts) is one record per chase the whole pack shares: the prey, who is in it, each
// member's role and the place and time the prey was last seen.
//   lead  — runs the prey down straight;
//   flank — comes at it from the side, ahead of where it runs;
//   wait  — out of breath: trots after the others to the last sighting and gets its wind back.
// The hunt ends once, for everyone, with an outcome: kill, escaped (lost from sight too long), zone
// (the prey reached the settlement), unreachable, tired (everyone out of breath), help (people came to
// the victim's aid), gave (the pack backed off), taken (someone else killed the prey). Counted in w.behave.hunts.
// Plain data, saved with the world.
import {SPECIES} from '../data/species.js';
import {DAY, nightness} from '../core/time.js';
import {log} from '../core/log.js';
import {agentInZone} from '../settlement/zone.js';
import {createAgent} from './agent.js';
import {inMap, walkable} from '../world/grid.js';

export const CARCASS = {
  life: 4 * DAY,       // rots away entirely after this
  rotFrom: 2 * DAY,    // from this age on it feeds the rot…
  upyr: 0.25,          // …and each night past that an upyr may rise from it with this chance,
  upyrFrom: 0.4,       // if it is of a beast this big (species hp) and at least…
  upyrLeft: 0.1,       // …this share of it is still uneaten
  smell: 30,           // a hungry beast knows of a carcass this close
  eatAt: 0.9,          // eats from this close
  takeAt: 1.4,         // a hunter takes what is left from this close
  scare: 4,            // feeders this close to a hunter either give way or turn on him
};
export const PACK = {
  lost: 70,            // ticks without sight of the prey before the hunt is given up
  flankOff: 3.5,       // a flanker aims this far to the side of the prey…
  flankAhead: 2.5,     // …and this far ahead of where it runs
  closeIn: 2.5,        // from this close everyone goes straight for it
  winded: 0.25,        // stamina below which a member drops back to wait
  rested: 0.6,         // …and from which it rejoins
  roles: 15,           // roles are dealt again this often
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const byId = (w, id) => w.agents.find(o => o.id === id && !o.dead);
const hunts = w => w.hunts || (w.hunts = {});

// ── carcasses
export function dropCarcass(w, prey, food, by) {
  const sp = SPECIES.get(prey.species);
  const c = {id: w.nextCarcass = (w.nextCarcass || 0) + 1, species: prey.species, x: prey.x, y: prey.y, food, food0: food,
    yields: {...(sp.yields || {})}, t: w.tick, by: by?.pack ?? null, risen: false};
  (w.carcasses ||= []).push(c);
  return c;
}
export const carcassById = (w, id) => (w.carcasses || []).find(c => c.id === id) || null;
export const share = c => (c.food0 ? c.food / c.food0 : 0);

// the nearest carcass with food left that `a` can smell
export function smellCarcass(w, a, r = CARCASS.smell) {
  let best = null, bd = r;
  for (const c of w.carcasses || []) { if (c.food < 0.05) continue; const d = dist(a, c); if (d < bd) { bd = d; best = c; } }
  return best;
}

// one tick of eating: returns false when there is nothing (more) to eat here
export function eat(w, a, c, rate) {
  if (!c || c.food < 0.05) return false;
  const bite = Math.min(c.food, rate, 1 - a.needs.food);
  if (bite <= 0) return false;
  c.food -= bite; a.needs.food += bite;
  return true;
}

// once a tick (sim.js): carcasses rot; an old one in the dark may raise an upyr
export function stepCarcasses(w) {
  const cs = w.carcasses; if (!cs?.length) return;
  if (w.tick % 60) return;
  const night = nightness(w);
  for (const c of cs) {
    const age = w.tick - c.t;
    // rot eats into it too, slowly at first
    if (age > CARCASS.rotFrom) c.food = Math.max(0, c.food - c.food0 * 0.01);
    const big = (SPECIES.get(c.species).hp || 0) >= CARCASS.upyrFrom && share(c) >= CARCASS.upyrLeft;
    // checked every 60 ticks; about a third of the day is this dark, so the chance is spread over those checks
    if (age > CARCASS.rotFrom && big && !c.risen && night > 0.7 && w.rngs.wild() < CARCASS.upyr * 60 / (DAY * 0.3) && SPECIES.has('upyr')) {
      c.risen = true;
      const u = createAgent(w, 'upyr', 'raiders', c.x, c.y);
      u.brain = 'raider'; u.band = 'upyrs'; u.name = 'Упырь';
      log(w, `Над неубранной тушей (${SPECIES.get(c.species).label}) поднялся упырь: гниль своё взяла.`, 'danger', 'notice');
      if (w.behave) w.behave.hunts.upyr = (w.behave.hunts.upyr || 0) + 1;
    }
  }
  // gone when eaten clean (nothing left for a hunter either) or rotted away
  w.carcasses = cs.filter(c => w.tick - c.t < CARCASS.life && (c.food >= 0.05 || (Object.keys(c.yields).length > 0 && w.tick - c.t < CARCASS.rotFrom)));
}

// a hunter takes what is left: the yields scaled by what the beasts have not eaten yet
export function butcher(w, c) {
  const k = Math.max(0.2, share(c)), got = {};
  for (const [r, n] of Object.entries(c.yields)) { const v = Math.round(n * (r === 'meat' ? k : 1)); if (v > 0) got[r] = v; }
  w.carcasses = w.carcasses.filter(x => x !== c);
  return got;
}

// the prey of a hunt died (agents/agent.js kill): whoever killed it, the pack's hunt is over
export function noteHuntDeath(w, a) { for (const h of Object.values(w.hunts || {})) if (h.prey === a.id) h.preyDead = true; }

// ── pack hunts
export const huntOf = (w, a) => (a.hunt != null ? w.hunts?.[a.hunt] || null : null);

export function startHunt(w, pack, prey, kind) {
  const id = w.nextHunt = (w.nextHunt || 0) + 1;
  const h = hunts(w)[id] = {id, prey: prey.id, kind, members: pack.map(m => m.id), started: w.tick, seen: {x: prey.x, y: prey.y, t: w.tick}, roles: {}, dealt: -1};
  for (const m of pack) m.hunt = id;
  dealRoles(w, h);
  if (w.behave) w.behave.hunts.started++;
  return h;
}

export function endHunt(w, h, outcome) {
  if (!h || !w.hunts?.[h.id]) return;
  delete w.hunts[h.id];
  for (const id of h.members) { const m = byId(w, id); if (m && m.hunt === h.id) { m.hunt = null; if (['chase', 'maul'].includes(m.task?.id)) m.task = {id: 'roam'}; } }
  const b = w.behave; if (b) b.hunts[outcome] = (b.hunts[outcome] || 0) + 1;
}

// the closest one leads, the winded wait, the rest come in from alternate sides
function dealRoles(w, h) {
  const prey = byId(w, h.prey); if (!prey) return;
  const ms = h.members.map(id => byId(w, id)).filter(Boolean).sort((x, y) => dist(x, prey) - dist(y, prey));
  let side = 1;
  const prev = h.roles || {};   // read before dealing anew: one who waited keeps waiting until rested
  h.roles = {};
  ms.forEach((m, k) => {
    const winded = m.stamina < PACK.winded || (prev[m.id] === 'wait' && m.stamina < PACK.rested);
    h.roles[m.id] = k === 0 ? 'lead' : winded ? 'wait' : (side = -side) > 0 ? 'flankL' : 'flankR';
  });
  h.dealt = w.tick;
}

// once a tick (sim.js): sightings, roles, the end of a hunt
export function stepHunts(w) {
  const hs = w.hunts; if (!hs) return;
  for (const h of Object.values(hs)) {
    const prey = w.agents.find(o => o.id === h.prey);
    const ms = h.members.map(id => byId(w, id)).filter(m => m && m.hunt === h.id);
    if (!ms.length) { endHunt(w, h, 'gave'); continue; }
    // the pack's own kill ends the hunt at the bite (agents/brains/predator.js); dead otherwise: someone else got it
    if (!prey || prey.dead) { endHunt(w, h, prey?.dead || h.preyDead ? 'taken' : 'escaped'); continue; }
    if (agentInZone(w, prey)) { endHunt(w, h, 'zone'); continue; }
    const P = SPECIES.get(ms[0].species).predator;
    if (ms.some(m => dist(m, prey) < P.sight)) h.seen = {x: prey.x, y: prey.y, t: w.tick};
    else if (w.tick - h.seen.t > PACK.lost) { endHunt(w, h, 'escaped'); continue; }
    if (ms.every(m => m.stamina < PACK.winded)) { endHunt(w, h, 'tired'); continue; }
    if (w.tick - h.dealt >= PACK.roles) dealRoles(w, h);
  }
}

// where a member of a hunt heads this tick: [x, y, sprint?]
export function huntAim(w, a, h, prey) {
  const role = h.roles[a.id] || 'lead';
  if (role === 'wait') return [h.seen.x, h.seen.y, false];
  if (!prey || dist(a, prey) > SPECIES.get(a.species).predator.sight * 1.3) return [h.seen.x, h.seen.y, true];
  if (role === 'lead' || dist(a, prey) < PACK.closeIn) return [prey.x, prey.y, true];
  // a flanker: to the side of the line from the lead to the prey, and a little ahead of it
  const lead = byId(w, Object.keys(h.roles).find(id => h.roles[id] === 'lead') | 0) || a;
  let dx = prey.x - lead.x, dy = prey.y - lead.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const s = role === 'flankL' ? 1 : -1;
  const fx = prey.x + dx * PACK.flankAhead - dy * s * PACK.flankOff, fy = prey.y + dy * PACK.flankAhead + dx * s * PACK.flankOff;
  // the side point lies in water or rock, or off the map: straight at the prey then
  if (!inMap(w, fx, fy) || !walkable(w, (fy | 0) * w.w + (fx | 0))) return [prey.x, prey.y, true];
  return [fx, fy, true];
}

export const ROLE_LABEL = {lead: 'ведёт погоню', flankL: 'заходит сбоку', flankR: 'заходит сбоку', wait: 'отстал, переводит дух'};
export const HUNT_END = {kill: 'добыча взята', escaped: 'добыча ушла', zone: 'добыча укрылась в поселении', unreachable: 'не добраться',
  tired: 'стая выдохлась', help: 'к жертве пришла помощь', gave: 'стая отступила', taken: 'добычу перехватили'};
