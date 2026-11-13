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
import {ABILITY, FLIGHT, GRIP, BURROW} from '../data/abilities.js';
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
import {T} from '../data/terrain.js';
import {handItems, def, wear} from './equipment.js';
import {MATERIALS} from '../data/balance/materials.js';
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
  if (row.shape === 'line') {   // a jet: along it up to its length, no wider than `width`
    const along = dx * Math.cos(dir) + dy * Math.sin(dir), across = Math.abs(-dx * Math.sin(dir) + dy * Math.cos(dir));
    if (along < 0 || across > row.width / 2) return false;
  } else if (row.shape !== 'aura' && d > ABILITY.eps) {
    const face = row.shape === 'rear' ? dir + Math.PI : dir;
    if (Math.abs(angDiff(Math.atan2(dy, dx), face)) > row.angle * RAD / 2) return false;
  }
  return lineOfFire(w, ox, oy, x, y);   // (a wall, a rock shuts it off)
}
const caught = (w, a, row, ox, oy, dir) => nearAgents(w, ox, oy, row.length + ABILITY.edge + 1)
  .filter(o => o !== a && !o.dead && !o.downed && !o.gone && !o.under && !o.swallowed && inShape(w, row, ox, oy, dir, o.x, o.y));
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
  if (a.chargeRow !== null) stepRun(w, a);
  if (a.held && stepHeld(w, a)) return true;
  if (a.holding != null && !a.act && stepHolding(w, a)) return true;
  if (a.burrowRow !== null && !a.act && stepBurrow(w, a)) return true;
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
      if ((act.row.shape !== 'cone' && act.row.shape !== 'line') || isMindless(SPECIES.get(a.species)) || SPECIES.get(a.species).mind === 'beast') continue;
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
  a.act = {id: act.id, rank: act.rank, x: a.x, y: a.y, dir, at: w.tick + row.prep, ...(tid != null ? {tid} : {}), ...(act.sub ? {sub: act.sub} : {})};
  if (tid != null) return;   // (one target: a quick throw, no shape to step out of)
  w.fx.push({kind: 'cone', x1: a.x, y1: a.y, dir, angle: row.shape === 'aura' ? 360 : row.angle, rear: row.shape === 'rear', length: row.length + ABILITY.edge, t: row.prep, T: row.prep, prep: true, x2: a.x, y2: a.y});
  if (row.fear) return;   // (a roar is heard, not stepped out of)
  // whoever sees it coming and stands in it steps out: past the rim, or out past its end
  for (const o of caught(w, a, row, a.x, a.y, dir)) {
    if (isMindless(SPECIES.get(o.species)) || o.captive || o.sleeping || o.held || (!a.act.sub && !canSee(w, o, a))) continue;   // (the ground heaving is seen by all near)
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
  if (type === 'acid') return resistTo(sp, 'acid');   // (an acid eats past the armour — and the armour with it: `corrode`)
  return resistOf(sp, type, true) * (1 - (o.gear ? armorAgainst(o.gear, type) : 0));
}

function release(w, a) {
  const {id, rank, x, y, dir, tid, sub} = a.act, P = PERKS.get(id), g = perksOf(a).find(p => p.id === id), whole = perkProfile(id, g?.rank || rank, g?.own);
  const row = sub ? whole[sub] : whole;   // (a part of a rank's row: the burrower's bursting out)
  a.act = null; (a.actReady ||= {})[id] = w.tick + (row.wait || 0);
  if (id === 'burrow') { a.under = false; a.surfaced = w.tick; }
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
    if (row.grab && o.hp > 0) grip(w, a, o, row.grab);
    // a numbing touch (a carrion crawler's): stunned, but not again until `numb` ticks have passed
    if (row.numb && !sp.mechanism && !(o.numbFree > w.tick)) { o.stunned = {until: Math.max(o.stunned?.until || 0, w.tick + row.numbFor)}; o.numbFree = w.tick + row.numb; }
  }
  // an acid, a rust: it eats its things — the iron only, for a rust (a few wears a touch, not the thing at once)
  if (row.corrode && o.equip) for (const it of [...new Set(Object.values(o.equip).filter(Boolean))]) if (!row.corrode.iron || MATERIALS[def(it).material]?.flags?.iron) wear(w, o, it, row.corrode.wear);
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
  // near: its foe within its reach — its own target, or one fighting it (a flier set upon comes down to fight: no endless
  // safety up in the air)
  const R = reachOf(a) + FLIGHT.land, t = a.task?.target;
  const near = (!!t && !t.dead && !t.downed && Math.hypot(t.x - a.x, t.y - a.y) <= R) ||
    nearAgents(w, a.x, a.y, R).some(o => o !== a && !o.dead && !o.downed && o.task?.target === a && Math.hypot(o.x - a.x, o.y - a.y) <= R);
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

// ── holding (the perks «Захват», «Сдавливание», «Проглатывание»): a.holding — the id of the one it holds; o.held = {by, power,
// every, next}; o.swallowed — inside it (unseen, out of reach, its pull against the swallow's own hold)
export const sizeOf = sp => sp.look?.size ?? (sp.big ? GRIP.size.big : GRIP.size.person);
function grip(w, a, o, G) {
  if (a.holding != null || o.held || o.dead || o.downed || sizeOf(SPECIES.get(o.species)) > G.size) return;
  a.holding = o.id; o.held = {by: a.id, power: G.hold, every: G.every, next: w.tick + G.every, since: w.tick};
  o.path = null; o.dodge = null;
  if (o.faction === 'colony' && o.name) log(w, `<b>${esc(o.name)}</b> в хватке: ${esc(SPECIES.get(a.species).label)}.`, 'danger');
}
export function letGo(w, a, o) {
  if (a) a.holding = null;
  if (!o) return;
  if (o.swallowed && a) { o.x = a.x; o.y = a.y; }   // (out of it, where it lies)
  o.held = null; o.swallowed = false;
}
const holdRow = (a, id) => (a[`${id}Row`] !== undefined ? a[`${id}Row`] : (a[`${id}Row`] = heldOf(a, id)));
// the held: it pulls every `every` ticks (its max(S, A), its own close by pulling too); inside — it is carried, digested
function stepHeld(w, o) {
  const h = liveById(w, o.held.by);
  if (!h || h.dead || h.downed || h.gone || h.holding !== o.id || (h.stunned && w.tick < h.stunned.until) || fleeing(h)) { letGo(w, h, o); return false; }
  if (o.dead) { letGo(w, h, o); return false; }
  if (o.swallowed) { o.x = h.x; o.y = h.y; const S = holdRow(h, 'swallow'); if (S) { o.hp -= S.digest; if (o.hp <= 0) lethal(w, o, 'ран', h); } }
  if (w.tick >= o.held.next && !o.downed) {
    o.held.next = w.tick + o.held.every;
    const help = o.swallowed ? 0 : nearAgents(w, o.x, o.y, GRIP.help.r).filter(x => x !== o && !x.dead && !x.downed && !x.held && ours(o, x)).length;
    const pull = Math.max(o.special?.S ?? 5, o.special?.A ?? 5) + help * GRIP.help.per;
    const power = o.swallowed ? holdRow(h, 'swallow')?.hold ?? o.held.power : o.held.power;
    if (w.rngs.combat() < pull / (pull + power)) { letGo(w, h, o); if (o.faction === 'colony' && o.name) log(w, `<b>${esc(o.name)}</b> вырвался${help ? ' — помогли свои' : ''}.`, 'notice'); return false; }
  }
  return !!o.swallowed;   // (inside it does nothing else; held, it may still strike at the holder: agents/combat.js)
}
// the holder: it holds and does nothing else — it squeezes (constrict), it swallows one small enough after a while
function stepHolding(w, a) {
  const o = liveById(w, a.holding);
  if (!o || o.dead || o.gone || o.held?.by !== a.id || fleeing(a)) { letGo(w, a, o); return false; }
  if (Math.hypot(o.x - a.x, o.y - a.y) > ABILITY.edge + 2 && !o.swallowed) { letGo(w, a, o); return false; }
  const C = holdRow(a, 'constrict');
  if (C && (w.tick - o.held.since) % C.every === C.every - 1) { o.hp -= C.dmg; o.flash = 4; moraleWound(w, o, C.dmg); if (o.hp <= 0) lethal(w, o, 'ран', a); }
  const S = holdRow(a, 'swallow');
  if (S && !o.swallowed && w.tick - o.held.since >= S.after && sizeOf(SPECIES.get(o.species)) <= S.size) {
    o.swallowed = true; o.held.next = w.tick + o.held.every;
    if (o.faction === 'colony' && o.name) log(w, `<b>${esc(o.name)}</b> проглочен: ${esc(SPECIES.get(a.species).label)}. Бейте тварь — пока не поздно.`, 'danger');
  }
  a.task = {id: 'maul', target: o};
  return true;
}

// ── a run at it (the perk «Таран и пикирование»): how far it has come straight on (a.run), read at its next blow (agents/combat.js)
function stepRun(w, a) {
  const R = holdRow(a, 'charge'); if (!R) return;
  const r = (a.run ||= {x: a.x, y: a.y, len: 0, dir: null});
  const dx = a.x - r.x, dy = a.y - r.y, d = Math.hypot(dx, dy);
  if (d > ABILITY.eps) {
    const dir = Math.atan2(dy, dx);
    r.len = r.dir != null && Math.abs(angDiff(dir, r.dir)) <= ABILITY.straight * RAD ? r.len + d : d;
    r.dir = dir;
  } else if (!a.task?.target) r.len = 0;
  r.x = a.x; r.y = a.y;
  if (a.fly?.landed === w.tick) r.len = Infinity;   // (come down from the air on it: a dive)
}

// ── under the ground (the perk «Рытьё»): it starts under where the ground is soft; it feels a foe within `sense`, comes under
// it, heaves the ground (`prep`: plain to see — one may step off) and bursts out; `stay` ticks above, then down again
const soft = (w, a, B, i) => walkable(w, i) && w.grid.terr[i] !== T.WATER && (!B.soft || !BURROW.hard.some(k => T[k] === w.grid.terr[i]));
export const burrowOf = a => holdRow(a, 'burrow');
function stepBurrow(w, a) {
  const B = burrowOf(a); if (!B) return false;
  if (a.dead || a.downed || a.captive) { a.under = false; return false; }
  if (a.under === undefined) a.under = soft(w, a, B, cellOf(w, a));
  const near = (r, pred) => { let best = null, bd = r; for (const o of nearAgents(w, a.x, a.y, r)) { if (o === a || o.dead || o.downed || o.under || o.swallowed || !pred(o)) continue; const d = Math.hypot(o.x - a.x, o.y - a.y); if (d <= bd) { bd = d; best = o; } } return best; };
  const prey = o => o.faction !== a.faction && !ours(a, o) && (foeOf(a, o) || o.faction === 'colony' || isHostile(a, o));
  if (a.under) {
    const t = near(B.sense, prey);
    if (!t) return true;   // (lies still under the ground, waiting)
    if (Math.hypot(t.x - a.x, t.y - a.y) <= B.strike) { a.task = {id: 'maul', target: t}; begin(w, a, {id: 'burrow', rank: perksOf(a).find(p => p.id === 'burrow')?.rank || 1, row: {...B.emerge, prep: B.prep}, sub: 'emerge'}, 0); return true; }
    const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy), k = Math.min(1, B.dig / d), nx = a.x + dx * k, ny = a.y + dy * k;
    const j = Math.min(w.h - 1, Math.max(0, ny | 0)) * w.w + Math.min(w.w - 1, Math.max(0, nx | 0));
    if (soft(w, a, B, j)) { a.x = nx; a.y = ny; }   // (the hard ground stops it: it waits at its edge)
    return true;
  }
  // above: down again once its time up here is over and no foe stands close — or it is badly hurt
  if (w.tick - (a.surfaced ?? -Infinity) >= B.stay && soft(w, a, B, cellOf(w, a)) && (!near(B.strike + 1, prey) || a.hp / maxHp(a) < FLIGHT.grounded)) { a.under = true; a.task = null; }
  return false;
}
