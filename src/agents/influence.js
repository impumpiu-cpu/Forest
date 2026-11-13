// The map of influence (plan claude/combat-plan.md Бой-3; the donor Wesnoth's power projection): the strength of each side over
// the cells — each fighter's (agents/squad.js strength) spread about it, falling off to nothing at INFLUENCE.r cells. Two
// sides: the colony's (the caravan's people, their allies) and the rest who are hostile to it. Laid anew every
// INFLUENCE.every ticks while a fight is on; read by a flanking band for the side of the foe's line that is weakest.
//   w.influence = {at, colony: Float32Array, foe: Float32Array} — not saved (laid anew from the agents)
import {INFLUENCE} from '../data/behaviour.js';
import {strength} from './squad.js';
import {isHostile} from '../data/factions.js';

const sideOf = a => (a.faction === 'colony' || a.faction === 'allies' ? 'colony' : 'foe');
export function stepInfluence(w) {
  const I = INFLUENCE;
  if (w.tick % I.every || !w.campaign?.spawned) return;
  const n = w.w * w.h, M = w.influence?.colony?.length === n ? w.influence : {colony: new Float32Array(n), foe: new Float32Array(n)};
  M.colony.fill(0); M.foe.fill(0); M.at = w.tick;
  for (const a of w.agents) {
    if (a.dead || a.downed || a.gone || a.captive || (a.tame && !a.warBeast)) continue;
    const side = sideOf(a); if (side === 'foe' && !w.agents.some(o => o.faction === 'colony' && isHostile(a, o))) continue;   // (one hostile to nobody of ours: no side of the fight)
    const s = strength(a), R = I.r, x0 = Math.max(0, Math.floor(a.x - R)), x1 = Math.min(w.w - 1, Math.ceil(a.x + R)), y0 = Math.max(0, Math.floor(a.y - R)), y1 = Math.min(w.h - 1, Math.ceil(a.y + R));
    const G = M[side];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d = Math.hypot(x + I.mid - a.x, y + I.mid - a.y); if (d < R) G[y * w.w + x] += s * (1 - d / R); }
  }
  w.influence = M;
}
// the influence of a side at a point (0 with no map laid yet)
export function influenceAt(w, side, x, y) {
  const M = w.influence; if (!M) return 0;
  const cx = Math.max(0, Math.min(w.w - 1, x | 0)), cy = Math.max(0, Math.min(w.h - 1, y | 0));
  return M[side][cy * w.w + cx];
}
export const enemySideOf = a => (sideOf(a) === 'colony' ? 'foe' : 'colony');
