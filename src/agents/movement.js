// Moving through the world: straight steps, walking down a flow field, escaping heat.
import {SPECIES} from '../data/species.js';
import {BY_CODE} from '../data/terrain.js';
import {cellOf, walkable, inBounds, DX, DY} from '../world/grid.js';
import {FAR} from '../nav/navigation.js';

export function speedOf(w, a) {
  return SPECIES.get(a.species).speed * a.mods.speed * (a.gear?.speed || 1) * BY_CODE[w.grid.terr[cellOf(w, a)]].speed;
}

// returns true when arrived, false while moving, null when the step is blocked
export function moveToward(w, a, tx, ty, mul = 1) {
  const dx = tx - a.x, dy = ty - a.y, len = Math.hypot(dx, dy), sp = speedOf(w, a) * mul;
  if (Math.abs(dx) > 0.01) a.faceX = Math.sign(dx);
  if (len <= sp) { a.x = tx; a.y = ty; return true; }
  const nx = a.x + dx / len * sp, ny = a.y + dy / len * sp;
  if (!walkable(w, (Math.max(0, ny) | 0) * w.w + (Math.max(0, nx) | 0))) return null;   // blocked
  a.x = nx; a.y = ny; return false;
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

// run directly away from a set of threats, choosing the open direction that gains most distance
export function bolt(w, a, threats, mul) {
  let best = null, bs = -Infinity;
  for (let k = 0; k < 16; k++) {
    const ang = k / 16 * Math.PI * 2, tx = a.x + Math.cos(ang) * 1.5, ty = a.y + Math.sin(ang) * 1.5;
    if (!inBounds(w, tx | 0, ty | 0) || !walkable(w, (ty | 0) * w.w + (tx | 0))) continue;
    let s = 0; for (const t of threats) s += Math.min(8, Math.hypot(tx - t.x, ty - t.y));
    if (s > bs) { bs = s; best = [tx, ty]; }
  }
  if (best) moveToward(w, a, best[0], best[1], mul);
}

// head for a moving target, sidestepping water and rocks: pick the open direction that gets closest
export function approach(w, a, tx, ty, mul = 1) {
  if (moveToward(w, a, tx, ty, mul) !== null) return;
  let best = null, bd = Infinity;
  for (let k = 0; k < 16; k++) {
    const ang = k / 16 * Math.PI * 2, nx = a.x + Math.cos(ang), ny = a.y + Math.sin(ang);
    if (!inBounds(w, nx | 0, ny | 0) || !walkable(w, (ny | 0) * w.w + (nx | 0))) continue;
    const d = Math.hypot(tx - nx, ty - ny); if (d < bd) { bd = d; best = [nx, ny]; }
  }
  if (best) moveToward(w, a, best[0], best[1], mul);
}

// walk uphill on a flow field: away from whatever seeds it (wolves leaving the settlement zone)
export function ascend(w, a, mapId, mul = 1) {
  const dist = w.nav.get(mapId), i = cellOf(w, a), x = i % w.w, y = (i / w.w) | 0;
  let best = dist[i], bj = -1;
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k], ny = y + DY[k]; if (!inBounds(w, nx, ny)) continue;
    const j = ny * w.w + nx; if (walkable(w, j) && dist[j] > best && dist[j] < FAR) { best = dist[j]; bj = j; }
  }
  if (bj >= 0) moveToward(w, a, (bj % w.w) + 0.5, ((bj / w.w) | 0) + 0.5, mul);
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
