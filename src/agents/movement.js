// Moving through the world: straight steps, walking down a flow field, escaping heat.
import {SPECIES, fearHeat, fearsFire} from '../data/species.js';
import {BY_CODE, T} from '../data/terrain.js';
import {NAVMAPS} from '../data/navmaps.js';
import {cellOf, walkable, inBounds, canStep, DX, DY, inMap} from '../world/grid.js';
import {FAR} from '../nav/navigation.js';
import {clearLine, findPath} from '../nav/astar.js';
import {tempAt} from '../world/heat.js';
import {SNOW} from '../world/weather.js';
import {CONDITIONS} from '../data/conditions.js';
import {THORNS} from '../data/buildings.js';
import {agentInZone} from '../settlement/zone.js';
import {mountSpeed} from './mount.js';
import {MOVE} from '../data/behaviour.js';

// one not of the colony inside the zone of a colony with a thorn hedge (data/buildings.js thornhedge, THORNS)
export const thornedBy = (w, a) => !!w.mods?.add?.thorns && a.faction !== 'colony' && !a.tame && !a.captive && !!w.zone && agentInZone(w, a);

export function speedOf(w, a) {
  const web = a.webbed && w.tick < a.webbed.until ? a.webbed.slow : 1;   // tangled in a spider's web
  const daze = a.stunned && w.tick < a.stunned.until ? CONDITIONS.get('stunned').slow : 1;   // stunned (data/conditions.js)
  if (a.aloft && a.flightRow) return a.flightRow.air * web * daze;   // in the air: its wings' pace, the ground does not slow it (agents/abilities.js)
  const d = BY_CODE[w.grid.terr[cellOf(w, a)]];
  // snow underfoot: deep snow halves the pace on open ground, less in the woods (a species that lives in it, `snowfoot`, is not slowed)
  const snow = w.snow > 0 && d.kind !== 'water' && !SPECIES.get(a.species).snowfoot ? 1 - SNOW.slow * w.snow * (d.kind === 'wood' ? 0.6 : 1) : 1;
  const thorns = thornedBy(w, a) ? THORNS.slow : 1;   // in the elves' thorn hedge
  return (mountSpeed(a) ?? SPECIES.get(a.species).speed) * a.mods.speed   // (a rider at its mount's pace: agents/mount.js)
     * (a.gear?.speed || 1) * web * daze * d.speed * snow * thorns;
}

// returns true when arrived, false while moving, null when the step is blocked
export function moveToward(w, a, tx, ty, mul = 1) {
  const dx = tx - a.x, dy = ty - a.y, len = Math.hypot(dx, dy), sp = speedOf(w, a) * mul;
  if (Math.abs(dx) > 0.01) a.faceX = Math.sign(dx);
  const ok = a.aloft ? (x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h && w.grid.terr[(y | 0) * w.w + (x | 0)] !== T.ROCK   // (in the air: over water and walls, not through rock)
    : (x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h && walkable(w, (y | 0) * w.w + (x | 0));
  // the last short step lands right on the target — only if the target itself is open ground
  if (len <= sp && ok(tx, ty)) { a.x = tx; a.y = ty; return true; }
  const k = Math.min(1, sp / Math.max(len, 1e-9)), nx = a.x + dx * k, ny = a.y + dy * k;
  if (ok(nx, ny)) { a.x = nx; a.y = ny; return false; }
  // clipping a corner of water or rock: slide along whichever axis is free
  if (Math.abs(dx) > 0.01 && ok(a.x + Math.sign(dx) * sp, a.y)) { a.x += Math.sign(dx) * sp; return false; }
  if (Math.abs(dy) > 0.01 && ok(a.x, a.y + Math.sign(dy) * sp)) { a.y += Math.sign(dy) * sp; return false; }
  return null;   // blocked
}

// Is cell j on the same land as the creature: both reachable from the camp, or the creature itself cut
// off (then anything goes). Animals pick spots to wander to with this, so they do not keep choosing a
// meadow across a lake and asking A* for a way that is not there.
export function sameLand(w, a, j) {
  const c = w.nav.get('camp');
  return c[cellOf(w, a)] >= FAR || c[j] < FAR;
}

// where a flow field leads, in words (for the colonist's card): the map's own `label` (data/navmaps.js)
const fieldName = id => (NAVMAPS.has(id) && NAVMAPS.get(id).label) || 'по тропе';

// step toward the neighbour with the smallest distance; returns 'arrived' | 'moving' | 'stuck' | 'none'
export function follow(w, a, mapId, mul = 1) {
  const dist = w.nav.get(mapId), i = cellOf(w, a);
  if (dist[i] === 0) return 'arrived';
  a.route = {how: dist[i] >= FAR ? `${fieldName(mapId)}: пути нет` : `${fieldName(mapId)}, ещё ~${Math.round(dist[i])} кл.`, t: w.tick};
  const x = i % w.w, y = (i / w.w) | 0; let best = dist[i], bj = -1;
  // only steps the rules allow (no corner cutting), even if a stale field points across one
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k], ny = y + DY[k]; if (!inBounds(w, nx, ny)) continue;
    const j = ny * w.w + nx; if (dist[j] < best && canStep(w, i, j)) { best = dist[j]; bj = j; }
  }
  if (bj < 0) return dist[i] >= FAR ? 'none' : 'stuck';
  // through the middle of the cell first when the step is a diagonal, so the body never clips a corner
  const tx = (bj % w.w) + 0.5, ty = ((bj / w.w) | 0) + 0.5;
  const r = moveToward(w, a, tx, ty, mul);
  if (r === null) moveToward(w, a, x + 0.5, y + 0.5, mul);
  return 'moving';
}

export const danger = (w, i) => tempAt(w, i) + w.grid.fire[i] * MOVE.danger.fire + w.grid.smoke[i] * MOVE.danger.smoke;

// does this animal run from the heat here: too hot underfoot, or flames close by (unless it fears no fire)
export const shunsHeat = (w, a, sp, T, r) => T > fearHeat(sp) || (fearsFire(sp) && nearFire(w, a, r));

export function nearFire(w, a, r) {
  const cx = a.x | 0, cy = a.y | 0, R = Math.ceil(r);
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (!inBounds(w, x, y)) continue;
    if (w.grid.fire[y * w.w + x] > 0.05 && (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2 <= r * r) return true;
  }
  return false;
}

// escape heat: the 'safe' flow field routes around fire; fall back to the coolest neighbour
export function escapeHeat(w, a, mul = MOVE.escapePace) {
  if (follow(w, a, 'safe', mul) === 'moving') return;
  const i = cellOf(w, a), x = i % w.w, y = (i / w.w) | 0;
  let bj = i, bd = danger(w, i);
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k], ny = y + DY[k]; if (!inBounds(w, nx, ny)) continue;
    const j = ny * w.w + nx; if (walkable(w, j) && danger(w, j) < bd) { bd = danger(w, j); bj = j; }
  }
  moveToward(w, a, (bj % w.w) + 0.5, ((bj / w.w) | 0) + 0.5, mul);
}

// open space around a point: distance to the map border, capped
const roomAt = (w, x, y) => Math.min(MOVE.room, x, y, w.w - x, w.h - y);

// run away from a set of threats. The direction is scored by the distance gained from the threats
// plus open space (so a cornered animal slides along the edge instead of pressing into it),
// and kept for a few ticks so the animal does not jitter between two choices.
export function bolt(w, a, threats, mul) {
  if (a.boltDir && a.boltDir.left-- > 0) {
    const [dx, dy] = a.boltDir.v;
    if (moveToward(w, a, a.x + dx, a.y + dy, mul) !== null) return;
  }
  let best = null, bs = -Infinity;
  const B = MOVE.bolt;
  for (let k = 0; k < B.dirs; k++) {
    const ang = k / B.dirs * Math.PI * 2, dx = Math.cos(ang) * B.step, dy = Math.sin(ang) * B.step, tx = a.x + dx, ty = a.y + dy;
    if (!inMap(w, tx, ty) || !walkable(w, (ty | 0) * w.w + (tx | 0))) continue;
    let s = 0; for (const t of threats) s += Math.min(B.far, Math.hypot(tx - t.x, ty - t.y));
    s += roomAt(w, tx, ty) * B.room * Math.max(1, threats.length);
    if (s > bs) { bs = s; best = [dx, dy]; }
  }
  if (!best) return;
  a.boltDir = {v: best, left: B.keep};
  moveToward(w, a, a.x + best[0], a.y + best[1], mul);
}

// head for a point, going around water and rocks. Walks straight while the line is clear,
// otherwise follows an A* path, re-planned when the target drifts or every couple of seconds.
// Returns true when there, false while on the way, null when the target cannot be reached.
export function approach(w, a, tx, ty, mul = 1) {
  if (!inMap(w, tx, ty)) return null;
  // safety net: trying to reach one target tick after tick without moving means "unreachable".
  // The watch belongs to one run of attempts at one target: a pause (sleep, work) or a new target
  // starts it afresh, so an old mark cannot refuse a fresh, open way.
  const g = a.approachGuard, G = MOVE.guard, PA = MOVE.path;
  if (!g || Math.hypot(g.x - a.x, g.y - a.y) > G.moved || !(w.tick - g.last <= G.gap) || !(Math.hypot(g.tx - tx, g.ty - ty) <= G.drift)) a.approachGuard = {x: a.x, y: a.y, t: w.tick, last: w.tick, tx, ty};
  else if (w.tick - g.t > G.stuck) { a.approachGuard = null; a.path = null; return null; }
  else g.last = w.tick;
  const where = `к точке (${tx | 0}, ${ty | 0})`;
  a.route = {how: where + ' прямо', t: w.tick};
  if (a.aloft || clearLine(w, a.x, a.y, tx, ty)) {   // (one in the air flies straight: agents/abilities.js)
    a.path = null;
    const r = moveToward(w, a, tx, ty, mul);
    if (r !== null) return r;   // walking straight (true once there)
  }
  let p = a.path;
  const goal = (ty | 0) * w.w + (tx | 0);
  if (!p || Math.hypot((p.goal % w.w) - (tx | 0), ((p.goal / w.w) | 0) - (ty | 0)) > PA.drift || w.tick - p.at > PA.every || p.k >= p.cells.length) {
    // the search budget grows with the distance: through woods (dearer than the estimate) a far target
    // needs more expansions, and a budget run out must not read as "no way there"
    const far = Math.hypot(tx - a.x, ty - a.y), cells = findPath(w, a.x, a.y, tx, ty, Math.max(PA.budget, Math.ceil(far * far * PA.perCell)));
    if (!cells) { a.path = null; a.route.how = where + ': пути нет'; if (w.behave) { w.behave.noPath++; const k = `${a.species}:${a.task?.id === 'job' ? a.task.job : a.task?.id}`; (w.behave.noPathBy ||= {})[k] = (w.behave.noPathBy[k] || 0) + 1; } return null; }
    p = a.path = {cells, k: 0, goal, at: w.tick};
  }
  a.route.how = `${where} в обход, ${p.cells.length - p.k} шагов`;
  // skip ahead to the furthest waypoint still in plain sight, then step toward it
  while (p.k + 1 < p.cells.length && p.k < PA.skip) {
    const c = p.cells[p.k + 1];
    if (!clearLine(w, a.x, a.y, (c % w.w) + 0.5, ((c / w.w) | 0) + 0.5)) break;
    p.k++;
  }
  const c = p.cells[p.k];
  if (c == null) return true;
  const cx = (c % w.w) + 0.5, cy = ((c / w.w) | 0) + 0.5;
  const r = moveToward(w, a, cx, cy, mul);
  if (r === null) moveToward(w, a, (a.x | 0) + 0.5, (a.y | 0) + 0.5, mul);   // step back to the middle of our cell and try again
  else if (r === true || Math.hypot(cx - a.x, cy - a.y) < PA.reach) p.k++;
  return false;
}

// walk uphill on a flow field: away from whatever seeds it (wolves leaving the settlement zone)
export function ascend(w, a, mapId, mul = 1) {
  const dist = w.nav.get(mapId), i = cellOf(w, a), x = i % w.w, y = (i / w.w) | 0;
  let best = dist[i], bj = -1;
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k], ny = y + DY[k]; if (!inBounds(w, nx, ny)) continue;
    const j = ny * w.w + nx; if (walkable(w, j) && dist[j] > best && dist[j] < FAR) { best = dist[j]; bj = j; }
  }
  if (bj < 0) return false;   // already at a local top: the caller should try something else
  moveToward(w, a, (bj % w.w) + 0.5, ((bj / w.w) | 0) + 0.5, mul);
  return true;
}

// sprinting drains stamina; a tired animal slows down and gets it back while walking
export function sprintMul(a, sprint, drain) {
  a.stamina = Math.max(0, a.stamina - drain);
  return a.stamina > MOVE.stamina.tired ? sprint : 1;
}
export const recover = a => { a.stamina = Math.min(1, a.stamina + MOVE.stamina.recover); };

// soft push so agents don't stack on the same spot.
// The pairs closer than 0.4 are found through a grid of 1 × 1 cells (a creature's own cell and the
// eight around it), not by comparing everyone with everyone: in a crowded camp that grew as the
// square of the crowd. They are then pushed in the old order — by the first one's place in
// w.agents, then the second one's — so the result is the one the old sweep gave: that sweep took
// every pair within 0.4 along x and skipped the ones farther apart at their turn; the grid leaves
// out only pairs a whole cell apart along y, which no push brings within 0.4 before their turn.
const SEP = new WeakMap();   // per world: the grid buffers, reused every tick (never saved)
export function separate(w) {
  const ags = w.agents, n = ags.length, W = w.w, H = w.h;
  let b = SEP.get(w);
  if (!b || b.head.length !== W * H) SEP.set(w, b = {head: new Int32Array(W * H).fill(-1), next: new Int32Array(64), cell: new Int32Array(64), pairs: new Float64Array(256)});
  if (b.next.length < n) { b.next = new Int32Array(n * 2); b.cell = new Int32Array(n * 2); }
  const {head, next, cell} = b;
  for (let k = n - 1; k >= 0; k--) {   // backwards, so that each cell's list runs in list order
    const a = ags[k], cx = Math.min(W - 1, Math.max(0, a.x | 0)), cy = Math.min(H - 1, Math.max(0, a.y | 0)), c = cy * W + cx;
    cell[k] = c; next[k] = head[c]; head[c] = k;
  }
  let np = 0;
  for (let p = 0; p < n; p++) {
    const A = ags[p], c = cell[p], cx = c % W, cy = (c - cx) / W;
    for (let yy = Math.max(0, cy - 1); yy <= Math.min(H - 1, cy + 1); yy++) {
      for (let xx = Math.max(0, cx - 1); xx <= Math.min(W - 1, cx + 1); xx++) {
        for (let q = head[yy * W + xx]; q !== -1; q = next[q]) {
          if (q <= p) continue;
          const B = ags[q];
          if (Math.abs(B.x - A.x) >= 0.4 || Math.abs(B.y - A.y) >= 1) continue;
          if (np === b.pairs.length) { const g = new Float64Array(np * 2); g.set(b.pairs); b.pairs = g; }
          b.pairs[np++] = p * n + q;
        }
      }
    }
  }
  for (let k = 0; k < n; k++) head[cell[k]] = -1;   // clear only what was used
  const pairs = b.pairs.subarray(0, np).sort();
  const ok = (x, y) => inMap(w, x, y) && walkable(w, (y | 0) * w.w + (x | 0));
  for (let k = 0; k < np; k++) {
    const p = Math.floor(pairs[k] / n), q = pairs[k] - p * n;
    const A = ags[p], B = ags[q], dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy;
    if (d2 >= 0.16 || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), push = (0.4 - d) * 0.25, ux = dx / d * push, uy = dy / d * push;
    // x >= 0 first: (−0.03 | 0) is 0, and a creature was pushed just off the map's top edge
    if (ok(A.x - ux, A.y - uy)) { A.x -= ux; A.y -= uy; }
    if (ok(B.x + ux, B.y + uy)) { B.x += ux; B.y += uy; }
  }
}
