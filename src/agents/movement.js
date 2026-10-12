// Moving through the world: straight steps, walking down a flow field, escaping heat.
import {SPECIES} from '../data/species.js';
import {BY_CODE} from '../data/terrain.js';
import {cellOf, walkable, inBounds, DX, DY} from '../world/grid.js';
import {FAR} from '../nav/navigation.js';
import {clearLine, findPath} from '../nav/astar.js';

export function speedOf(w, a) {
  return SPECIES.get(a.species).speed * a.mods.speed * (a.gear?.speed || 1) * BY_CODE[w.grid.terr[cellOf(w, a)]].speed;
}

// returns true when arrived, false while moving, null when the step is blocked
export function moveToward(w, a, tx, ty, mul = 1) {
  const dx = tx - a.x, dy = ty - a.y, len = Math.hypot(dx, dy), sp = speedOf(w, a) * mul;
  if (Math.abs(dx) > 0.01) a.faceX = Math.sign(dx);
  if (len <= sp) { a.x = tx; a.y = ty; return true; }
  const nx = a.x + dx / len * sp, ny = a.y + dy / len * sp;
  const ok = (x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h && walkable(w, (y | 0) * w.w + (x | 0));
  if (ok(nx, ny)) { a.x = nx; a.y = ny; return false; }
  // clipping a corner of water or rock: slide along whichever axis is free
  if (Math.abs(dx) > 0.01 && ok(a.x + Math.sign(dx) * sp, a.y)) { a.x += Math.sign(dx) * sp; return false; }
  if (Math.abs(dy) > 0.01 && ok(a.x, a.y + Math.sign(dy) * sp)) { a.y += Math.sign(dy) * sp; return false; }
  return null;   // blocked
}

// step toward the neighbour with the smallest distance; returns 'arrived' | 'moving' | 'stuck' | 'none'
export function follow(w, a, mapId, mul = 1) {
  const dist = w.nav.get(mapId), i = cellOf(w, a);
  if (dist[i] === 0) return 'arrived';
  const x = i % w.w, y = (i / w.w) | 0; let best = dist[i], bj = -1;
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k], ny = y + DY[k]; if (!inBounds(w, nx, ny)) continue;
    const j = ny * w.w + nx; if (dist[j] < best) { best = dist[j]; bj = j; }
  }
  if (bj < 0) return dist[i] >= FAR ? 'none' : 'stuck';
  const sp = speedOf(w, a) * mul, tx = (bj % w.w) + 0.5, ty = ((bj / w.w) | 0) + 0.5;
  const dx = tx - a.x, dy = ty - a.y, len = Math.hypot(dx, dy);
  if (len <= sp) { a.x = tx; a.y = ty; } else { a.x += dx / len * sp; a.y += dy / len * sp; }
  return 'moving';
}

export const danger = (w, i) => w.grid.temp[i] + w.grid.fire[i] * 400 + w.grid.smoke[i] * 6;

export function nearFire(w, a, r) {
  const cx = a.x | 0, cy = a.y | 0, R = Math.ceil(r);
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (!inBounds(w, x, y)) continue;
    if (w.grid.fire[y * w.w + x] > 0.05 && (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2 <= r * r) return true;
  }
  return false;
}

// escape heat: the 'safe' flow field routes around fire; fall back to the coolest neighbour
export function escapeHeat(w, a, mul = 1.35) {
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
const roomAt = (w, x, y) => Math.min(6, x, y, w.w - x, w.h - y);

// run away from a set of threats. The direction is scored by the distance gained from the threats
// plus open space (so a cornered animal slides along the edge instead of pressing into it),
// and kept for a few ticks so the animal does not jitter between two choices.
export function bolt(w, a, threats, mul) {
  if (a.boltDir && a.boltDir.left-- > 0) {
    const [dx, dy] = a.boltDir.v;
    if (moveToward(w, a, a.x + dx, a.y + dy, mul) !== null) return;
  }
  let best = null, bs = -Infinity;
  for (let k = 0; k < 16; k++) {
    const ang = k / 16 * Math.PI * 2, dx = Math.cos(ang) * 1.5, dy = Math.sin(ang) * 1.5, tx = a.x + dx, ty = a.y + dy;
    if (!inBounds(w, tx | 0, ty | 0) || !walkable(w, (ty | 0) * w.w + (tx | 0))) continue;
    let s = 0; for (const t of threats) s += Math.min(8, Math.hypot(tx - t.x, ty - t.y));
    s += roomAt(w, tx, ty) * 0.9 * Math.max(1, threats.length);
    if (s > bs) { bs = s; best = [dx, dy]; }
  }
  if (!best) return;
  a.boltDir = {v: best, left: 6};
  moveToward(w, a, a.x + best[0], a.y + best[1], mul);
}

// head for a point, going around water and rocks. Walks straight while the line is clear,
// otherwise follows an A* path, re-planned when the target drifts or every couple of seconds.
// Returns true when there, false while on the way, null when the target cannot be reached.
export function approach(w, a, tx, ty, mul = 1) {
  if (!inBounds(w, tx | 0, ty | 0)) return null;
  // safety net: trying to go somewhere and not moving at all for a while means "unreachable"
  const g = a.approachGuard;
  if (!g || Math.hypot(g.x - a.x, g.y - a.y) > 0.6 || w.tick - g.t > 120) a.approachGuard = {x: a.x, y: a.y, t: w.tick};
  else if (w.tick - g.t > 40) { a.approachGuard = null; a.path = null; return null; }
  if (clearLine(w, a.x, a.y, tx, ty)) {
    a.path = null;
    const r = moveToward(w, a, tx, ty, mul);
    if (r !== null) return r;   // walking straight (true once there)
  }
  let p = a.path;
  const goal = (ty | 0) * w.w + (tx | 0);
  if (!p || Math.hypot((p.goal % w.w) - (tx | 0), ((p.goal / w.w) | 0) - (ty | 0)) > 3 || w.tick - p.at > 40 || p.k >= p.cells.length) {
    const cells = findPath(w, a.x, a.y, tx, ty);
    if (!cells) { a.path = null; return null; }
    p = a.path = {cells, k: 0, goal, at: w.tick};
  }
  // skip ahead to the furthest waypoint still in plain sight, then step toward it
  while (p.k + 1 < p.cells.length && p.k < 6) {
    const c = p.cells[p.k + 1];
    if (!clearLine(w, a.x, a.y, (c % w.w) + 0.5, ((c / w.w) | 0) + 0.5)) break;
    p.k++;
  }
  const c = p.cells[p.k];
  if (c == null) return true;
  const cx = (c % w.w) + 0.5, cy = ((c / w.w) | 0) + 0.5;
  const r = moveToward(w, a, cx, cy, mul);
  if (r === null) moveToward(w, a, (a.x | 0) + 0.5, (a.y | 0) + 0.5, mul);   // step back to the middle of our cell and try again
  else if (r === true || Math.hypot(cx - a.x, cy - a.y) < 0.3) p.k++;
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
  return a.stamina > 0.15 ? sprint : 1;
}
export const recover = a => { a.stamina = Math.min(1, a.stamina + 0.002); };

// soft push so agents don't stack on the same spot
export function separate(w) {
  const ags = w.agents;
  for (let p = 0; p < ags.length; p++) for (let q = p + 1; q < ags.length; q++) {
    const A = ags[p], B = ags[q], dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy;
    if (d2 >= 0.16 || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), push = (0.4 - d) * 0.25, ux = dx / d * push, uy = dy / d * push;
    const ok = (x, y) => inBounds(w, x | 0, y | 0) && walkable(w, (y | 0) * w.w + (x | 0));
    if (ok(A.x - ux, A.y - uy)) { A.x -= ux; A.y -= uy; }
    if (ok(B.x + ux, B.y + uy)) { B.x += ux; B.y += uy; }
  }
}
