// The acts of a fight (plan claude/bestiary-plan.md З-2, the expert's note 13.11; the perks of `how: 'act'` in data/perks.js:
// a fire's breath, a tail's sweep, a roar). What an act does is its rank's row, written out whole — its shape, its harm, its
// wind-up, its wait (the author's word: never × the rank). How any act goes:
//   1. one that holds an act, in a fight and ready (its wait over), looks every ABILITY.look ticks for a use: a direction where
//      foes stand in the shape and none of its own — the most foes (a breath), anyone behind it (a tail), foes about it not
//      yet shaken (a roar: once a meeting, again after a heavy wound);
//   2. the wind-up: it stands, the direction fixed, plain to see (w.fx `cone`); whoever sees it and stands in it steps out
//      (o.dodge: towards the nearest way out, past the rim) — out of it by the release, it takes nothing;
//   3. the release, once: everyone in the shape then (its own side too), behind no wall or rock — the harm at once (fire past
//      a fire's answer and a fireproof perk; a blow past the body and the armour), one still inside dodges at A / (A + dodge):
//      half the harm, no burning; the burning (a.burning: the stronger kept, the longer); a knock (stunned); fear (morale,
//      once in `calm` ticks for each); the ground in it catches where there is something to burn (`kindle`).
//   A wind-up is broken by a stun: ABILITY.interrupt ticks before the next try.
//   a.act = {id, rank, x, y, dir, at} — the wind-up under way; a.actReady = {id: tick} — when each is ready again (plain data)
import {ABILITY, FLIGHT} from '../data/abilities.js';
import {PERKS, perksOf, perkProfile, heldOf} from '../data/perks.js';
import {SPECIES, isMindless} from '../data/species.js';
import {isHostile} from '../data/factions.js';
import {resistTo} from '../data/balance/combat.js';
import {effectResist} from '../data/conditions.js';
import {KINDLE} from '../data/behaviour.js';
import {lineOfFire} from '../nav/astar.js';
import {nearAgents} from './spatial.js';
import {ours, liveById} from './lookup.js';
import {canSee, resistOf, armorAgainst, aggressor, reachOf} from './combat.js';
import {moveToward} from './movement.js';
import {lethal} from './wounds.js';
import {noteHit} from './trophies.js';
import {moraleShock, moraleWound, fleeing} from './morale.js';
import {maxHp} from './agent.js';
import {heatTo} from '../world/heat.js';
import {cellMid, cellOf, walkable} from '../world/grid.js';
import {handItems, def} from './equipment.js';
import {log} from '../core/log.js';
import {esc} from '../core/util.js';

const RAD = Math.PI / 180;
const holds = (a, form) => handItems(a).some(it => def(it).form === form);
// the acts one holds now, each at its rank's row (a grant may ask a thing in hand: the forge-master's coal)
export function actsOf(a) {
  const out = [];
  for (const g of perksOf(a)) {
    const P = PERKS.has(g.id) ? PERKS.get(g.id) : null;
    if (P?.how !== 'act' || (g.hold && !holds(a, g.hold))) continue;
    const row = perkProfile(g.id, g.rank || 1, g.own); if (row) out.push({id: g.id, rank: g.rank || 1, row, P});
  }
  return out;
}
// (the species and the role of one decide whether it has acts at all: a cheap first look, kept on the side)
const HAS = new Map();
const mayAct = a => {
  const k = `${a.species}|${a.fightRole || ''}|${a.perks?.length || 0}`;
  if (!HAS.has(k)) HAS.set(k, actsOf(a).length > 0);
  return HAS.get(k);
};

// ── the shapes
const angDiff = (x, y) => { let d = x - y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
export function inShape(w, row, ox, oy, dir, x, y) {
  const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
  if (d > row.length + ABILITY.edge) return false;
  if (row.shape !== 'aura' && d > ABILITY.eps) {
    const face = row.shape === 'rear' ? dir + Math.PI : dir;
    if (Math.abs(angDiff(Math.atan2(dy, dx), face)) > row.angle * RAD / 2) return false;
  }
  return lineOfFire(w, ox, oy, x, y);   // (a wall, a rock shuts it off)
}
const caught = (w, a, row, ox, oy, dir) => nearAgents(w, ox, oy, row.length + ABILITY.edge + 1)
  .filter(o => o !== a && !o.dead && !o.downed && !o.gone && inShape(w, row, ox, oy, dir, o.x, o.y));
// a foe: of a side at war with its own, or one fighting it or its side, or of the side it hunts (a beast's prey's kin: a
// dragon at war with nobody, mauling one of the caravan)
const foeOf = (a, o) => !ours(a, o) && o.faction !== a.faction && (isHostile(a, o) || aggressor(a, o) || o.task?.target === a ||
  (!!a.task?.target && (a.task.target === o || a.task.target.faction === o.faction)));

// ── the choice: where it would strike, or null
function aimOf(w, a, act) {
  const {row, id} = act;
  if (row.fear) {   // a roar: foes about it it has not shaken lately; once a meeting, again after a heavy wound
    const foes = caught(w, a, row, a.x, a.y, 0).filter(o => foeOf(a, o) && !(o.feared > w.tick));
    if (!foes.length) return null;
    const S = (a.roar ||= {});
    if (S.hp != null && S.hp - a.hp / maxHp(a) < row.again && foes.every(o => o.fearedBy === a.id)) return null;
    return {dir: 0};
  }
  if (row.shape === 'rear') {   // a tail: the front is where its foe is
    const t = a.task?.target; if (!t || t.dead) return null;
    const dir = Math.atan2(t.y - a.y, t.x - a.x), in_ = caught(w, a, row, a.x, a.y, dir);
    return in_.some(o => foeOf(a, o)) && !in_.some(o => ours(a, o)) ? {dir} : null;
  }
  if (row.shape === 'shot' || row.shape === 'touch') return markAim(w, a, act);
  if (a.aloft && flightOf(a)?.high) return null;   // (a breath, a tail from the ground: it comes down first)
  return coneAim(w, a, row, a.x, a.y);
}
// one target: its own foe first, else the nearest foe it sees within range, the way clear; spikes left
function markAim(w, a, {row, id}) {
  if (a.aloft && flightOf(a)?.high && !row.high) return null;
  if (row.ammo && (a.ammo?.[id] ?? row.ammo) <= 0) return null;
  const R = row.range + ABILITY.edge, fits = t => t && !t.dead && !t.downed && !t.captive && foeOf(a, t) && Math.hypot(t.x - a.x, t.y - a.y) <= R && canSee(w, a, t) && lineOfFire(w, a.x, a.y, t.x, t.y);
  let t = fits(a.task?.target) ? a.task.target : null;
  if (!t) { let bd = Infinity; for (const o of nearAgents(w, a.x, a.y, R)) { const d = Math.hypot(o.x - a.x, o.y - a.y); if (d < bd && fits(o)) { bd = d; t = o; } } }
  return t ? {dir: Math.atan2(t.y - a.y, t.x - a.x), tid: t.id} : null;
}
// a cone from (ox, oy): towards each foe it sees within reach — the direction with the most foes in it and nobody else (its
// own, a neutral beast) → {dir, n} or null
function coneAim(w, a, row, ox, oy) {
  let best = null, bn = 0;
  const R = row.length + ABILITY.edge;
  for (const t of nearAgents(w, ox, oy, R)) {
    if (t === a || t.dead || t.downed || !foeOf(a, t) || !canSee(w, a, t)) continue;
    if (Math.hypot(t.x - ox, t.y - oy) > R * ABILITY.aim) continue;
    const dir = Math.atan2(t.y - oy, t.x - ox), in_ = caught(w, a, row, ox, oy, dir);
    if (in_.some(o => !foeOf(a, o))) continue;
    if (in_.length > bn) { bn = in_.length; best = {dir, n: bn}; }
  }
  return best;
}
// its own in the way of a ready cone, a foe near: a step aside (ABILITY.shift) to where the cone is clear, or null
function sidestep(w, a, row) {
  const R = row.length + ABILITY.edge, Sh = ABILITY.shift;
  if (!nearAgents(w, a.x, a.y, R + Sh.far).some(t => !t.dead && !t.downed && foeOf(a, t) && canSee(w, a, t))) return null;
  let best = null;
  for (let k = 0; k < Sh.ways; k++) {
    const ang = (k / Sh.ways) * 2 * Math.PI, x = a.x + Math.cos(ang) * Sh.by, y = a.y + Math.sin(ang) * Sh.by;
    if (x < 0 || y < 0 || x >= w.w || y >= w.h || !lineOfFire(w, a.x, a.y, x, y)) continue;
    const aim = coneAim(w, a, row, x, y);
    if (aim && (!best || aim.n > best.n)) best = {x, y, n: aim.n};
  }
  return best;
}

// ── each tick, before one's brain (sim.js): → true while it winds up an act (it does nothing else) or steps out of one
export function stepAct(w, a) {
  if (a.flightRow !== null) stepFlight(w, a);   // (one that cannot fly is marked so on its first tick: flightRow null)
  let now = false;   // (stepped aside for a clear cone and there: look at once)
  if (a.dodge) {
    const there = Math.hypot(a.dodge.x - a.x, a.dodge.y - a.y) <= ABILITY.there;
    if (w.tick < a.dodge.until && !a.downed && !there) { moveToward(w, a, a.dodge.x, a.dodge.y, ABILITY.pace); return true; }
    now = !!a.dodge.aim; a.dodge = null;
  }
  if (a.act) {
    if (a.stunned && w.tick < a.stunned.until) { (a.actReady ||= {})[a.act.id] = w.tick + ABILITY.interrupt; a.act = null; return false; }
    if (w.tick < a.act.at) return true;
    release(w, a); return false;
  }
  if ((!now && (w.tick + a.id) % ABILITY.look) || a.downed || a.captive || a.dead || !mayAct(a) || fleeing(a) || (a.stunned && w.tick < a.stunned.until)) return false;
  for (const act of actsOf(a)) {
    if ((a.actReady?.[act.id] ?? 0) > w.tick) continue;
    const aim = aimOf(w, a, act);
    if (!aim) {   // a cone with its own in the way: one with a mind steps aside to a clear one
      if (act.row.shape !== 'cone' || isMindless(SPECIES.get(a.species)) || SPECIES.get(a.species).mind === 'beast') continue;
      const to = sidestep(w, a, act.row);
      if (to) { a.dodge = {x: to.x, y: to.y, until: w.tick + ABILITY.shift.ticks, aim: true}; return true; }
      continue;
    }
    begin(w, a, act, aim.dir, aim.tid);
    return true;
  }
  return false;
}

function begin(w, a, act, dir, tid = null) {
  const {row} = act;
  a.act = {id: act.id, rank: act.rank, x: a.x, y: a.y, dir, at: w.tick + row.prep, ...(tid != null ? {tid} : {})};
  if (tid != null) return;   // (one target: a quick throw, no shape to step out of)
  w.fx.push({kind: 'cone', x1: a.x, y1: a.y, dir, angle: row.shape === 'aura' ? 360 : row.angle, rear: row.shape === 'rear', length: row.length + ABILITY.edge, t: row.prep, T: row.prep, prep: true, x2: a.x, y2: a.y});
  if (row.fear) return;   // (a roar is heard, not stepped out of)
  // whoever sees it coming and stands in it steps out: past the rim, or out past its end
  for (const o of caught(w, a, row, a.x, a.y, dir)) {
    if (isMindless(SPECIES.get(o.species)) || o.captive || o.sleeping || !canSee(w, o, a)) continue;
    const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy);
    let x, y;
    if (row.shape === 'aura' || row.shape === 'rear' || d < ABILITY.eps) { const k = (row.length + ABILITY.edge + ABILITY.out) / Math.max(d, ABILITY.eps); x = a.x + dx * k; y = a.y + dy * k; }
    else {
      const side = Math.sign(angDiff(Math.atan2(dy, dx), dir)) || 1, phi = dir + side * (row.angle / 2 + ABILITY.slack) * RAD;
      const sideX = a.x + Math.cos(phi) * d, sideY = a.y + Math.sin(phi) * d;
      const far = row.length + ABILITY.edge + ABILITY.out, endX = a.x + Math.cos(dir) * far, endY = a.y + Math.sin(dir) * far;
      [x, y] = Math.hypot(sideX - o.x, sideY - o.y) <= Math.hypot(endX - o.x, endY - o.y) ? [sideX, sideY] : [endX, endY];
    }
    o.dodge = {x: Math.max(0, Math.min(w.w - 1, x)), y: Math.max(0, Math.min(w.h - 1, y)), until: a.act.at};
  }
}

// × the harm of a kind to one: fire past its fire's answer, a fire-ward, a fireproof perk; a blow past the body and the armour
function harmTo(w, o, type) {
  const sp = SPECIES.get(o.species);
  if (type === 'fire') return resistTo(sp, 'fire') * (o.effects ? effectResist(w, o, 'fire') : 1) * (heldOf(o, 'fireproof')?.fire ?? 1);
  return resistOf(sp, type, true) * (1 - (o.gear ? armorAgainst(o.gear, type) : 0));
}

function release(w, a) {
  const {id, rank, x, y, dir, tid} = a.act, P = PERKS.get(id), g = perksOf(a).find(p => p.id === id), row = perkProfile(id, g?.rank || rank, g?.own);
  a.act = null; (a.actReady ||= {})[id] = w.tick + row.wait;
  let targets;
  if (tid != null) {   // one target: still there, in range, in sight
    const t = liveById(w, tid), R = row.range + ABILITY.edge + 1;
    targets = t && !t.dead && !t.downed && Math.hypot(t.x - a.x, t.y - a.y) <= R && lineOfFire(w, a.x, a.y, t.x, t.y) ? [t] : [];
    if (row.ammo) (a.ammo ||= {})[id] = (a.ammo[id] ?? row.ammo) - 1;
    if (targets[0]) w.fx.push({x1: a.x, y1: a.y, x2: targets[0].x, y2: targets[0].y, t: 8, kind: row.web || row.venom && !row.dmg ? 'stone' : 'arrow'});
  } else {
    targets = caught(w, a, row, x, y, dir);
    w.fx.push({kind: 'cone', x1: x, y1: y, dir, angle: row.shape === 'aura' ? 360 : row.angle, rear: row.shape === 'rear', length: row.length + ABILITY.edge, t: 8, T: 8, type: row.type || 'fear', x2: x, y2: y});
  }
  let hit = 0;
  for (const o of targets) {
    if (row.fear) {
      if (foeOf(a, o) && !(o.feared > w.tick)) { moraleShock(w, o, row.fear, 'fear', `${P.label.toLowerCase()}: ${SPECIES.get(a.species).label}`); o.feared = w.tick + row.calm; o.fearedBy = a.id; hit++; }
      continue;
    }
    if (strike(w, a, o, row)) hit++;
  }
  if (row.fear) { (a.roar ||= {}).hp = a.hp / maxHp(a); }
  if (row.kindle) {   // the ground in it catches where there is something to burn (a stone floor: no fire, the harm stands)
    const R = Math.ceil(row.length + ABILITY.edge), cx = x | 0, cy = y | 0, B = KINDLE.breath;
    for (let j = cy - R; j <= cy + R; j++) for (let i = cx - R; i <= cx + R; i++) {
      if (i < 0 || j < 0 || i >= w.w || j >= w.h) continue;
      const c = j * w.w + i, m = cellMid(w, c); if (!inShape(w, row, x, y, dir, m.x, m.y)) continue;
      if (w.grid.fuel[c] > B.fuel) { w.grid.fire[c] = Math.max(w.grid.fire[c], B.fire); heatTo(w, c, B.heat); }
    }
    w.nav.dirty('fire');
  }
  (w.chronicle.acts ||= {})[id] = ((w.chronicle.acts ||= {})[id] || 0) + 1;
  if (hit && a.faction === 'colony' && a.name) log(w, `<b>${esc(a.name)}</b>: ${P.label.toLowerCase()} — задето ${hit}.`, 'people');
}

// what an act does to one it reached: a raised shield may catch a spit; A may dodge (half the harm, nothing else); the harm
// at once; a burning, a poison, a web, a knock left behind. → true when it reached the body
function strike(w, a, o, row) {
  const sp = SPECIES.get(o.species);
  if (row.shield && o.gear?.cover > 0 && w.rngs.combat() < o.gear.cover) { o.flash = 3; return false; }
  const A = o.special?.A ?? 5, dodged = row.dodge && w.rngs.combat() < A / (A + row.dodge);
  const harm = (row.dmg || 0) * (dodged ? ABILITY.dodged : 1) * harmTo(w, o, row.type);
  o.flash = 6; o.hurtBy = {id: a.id, tick: w.tick, far: true}; noteHit(o, a);
  if (harm > 0) { o.hp -= harm; moraleWound(w, o, harm); }
  if (!dodged) {
    if (row.burn && harmTo(w, o, 'fire') > 0) {
      const b = row.burn.dmg * harmTo(w, o, 'fire');
      o.burning = {dmg: Math.max(b, o.burning?.dmg || 0), until: Math.max(w.tick + row.burn.ticks, o.burning?.until || 0)};
    }
    if (row.venom && !sp.undead && !sp.mechanism) {
      const v = row.venom.dmg * resistTo(sp, 'poison') * effectResist(w, o, 'poison');
      o.poison = {dmg: Math.max(v, o.poison && o.poison.until > w.tick ? o.poison.dmg : 0), until: Math.max(w.tick + row.venom.ticks, o.poison?.until || 0)};
    }
    if (row.web && !sp.mechanism) o.webbed = {slow: Math.min(row.web.slow, o.webbed && o.webbed.until > w.tick ? o.webbed.slow : 1), until: Math.max(w.tick + row.web.ticks, o.webbed?.until || 0)};
    if (row.knock && !sp.mechanism) o.stunned = {until: Math.max(o.stunned?.until || 0, w.tick + row.knock)};
  }
  if (o.hp <= 0) lethal(w, o, row.type === 'fire' ? 'огня' : row.venom && !row.dmg ? 'яда' : 'ран', a);
  return true;
}

// ── flight (the perk «Полёт»; data/abilities.js FLIGHT): up in the air while it goes; down to strike, `ground` ticks there,
// then up for `rise`; its wings fail below `grounded` of its health. a.aloft — in the air now (agents/movement.js: straight
// over water and walls, not through rock, at `air`; agents/combat.js: a short blade does not reach one `high` up)
export const flightOf = a => (a.flightRow !== undefined ? a.flightRow : (a.flightRow = heldOf(a, 'flight')));
export function stepFlight(w, a) {
  const F = flightOf(a); if (!F) return;
  if (a.downed || a.dead || a.captive || a.hp / maxHp(a) < F.grounded) { a.aloft = false; return; }
  const t = a.task?.target, near = !!t && !t.dead && !t.downed && Math.hypot(t.x - a.x, t.y - a.y) <= reachOf(a) + FLIGHT.land;
  const fly = (a.fly ||= {});
  if (a.aloft) {
    if (near && w.tick >= (fly.rise || 0) && walkable(w, cellOf(w, a))) { a.aloft = false; fly.landed = w.tick; }
  } else if (!near || (F.high && fly.landed != null && w.tick - fly.landed >= F.ground)) { a.aloft = true; fly.rise = w.tick + F.rise; fly.landed = null; }
}

// a body on fire (a.burning; agents/body.js each tick): it burns until its time runs out or it gets into water
export function stepBurning(w, a, inWater) {
  if (!a.burning) return;
  if (w.tick >= a.burning.until || inWater) { a.burning = null; return; }
  a.hp -= a.burning.dmg;
  if (a.hp <= 0) lethal(w, a, 'огня', null);
}
