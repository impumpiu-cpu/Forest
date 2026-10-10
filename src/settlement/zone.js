// The settlement zone: a circle around the camp plus a circle around every building (laid or
// finished). Overlapping circles merge into one area. Inside it defenders fight harder, a palisade
// shields them, wolves do not hunt and a lone colonist is not "alone".
import {BUILDINGS, ZONE} from '../data/buildings.js';

function mark(w, cx, cy, r) {
  const z = w.zone, r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(w.h - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w.w - 1, Math.ceil(cx + r)); x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) z[y * w.w + x] = 1;
}

export function recomputeZone(w) {
  if (!w.zone) w.zone = new Uint8Array(w.n); else w.zone.fill(0);
  mark(w, w.camp.x + 0.5, w.camp.y + 0.5, ZONE.camp);
  for (const b of w.buildings) mark(w, b.x + 1, b.y + 1, BUILDINGS.get(b.key).zone ?? ZONE.building);
  w.zoneVersion = (w.zoneVersion || 0) + 1;
  w.nav?.dirty('zone');
}

export const inZone = (w, i) => w.zone[i] === 1;
export const agentInZone = (w, a) => w.zone[(Math.max(0, Math.min(w.h - 1, a.y | 0))) * w.w + Math.max(0, Math.min(w.w - 1, a.x | 0))] === 1;
