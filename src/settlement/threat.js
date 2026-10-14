// How dangerous the next raid is. The raiders do not see the colony: they hear rumours —
// the daily report it sends out (outside/report.js). The threat grows with time, with every
// raid already sent and with how "fat" the colony looks: people, weapons, armour.
import {DAY} from '../core/time.js';

export function raidThreat(w) {
  const r = w.outside?.seen || {pop: 0, armed: 0, armour: 0};
  // + rumours of gold and mithril (settlement/precious.js)
  return w.tick / DAY * 0.4 + w.stats.raids * 1.0 + r.pop * 0.25 + r.armed * 0.2 + r.armour * 2 + (w.fame || 0);
}

export const raidSize = w => Math.min(16, 2 + Math.floor(raidThreat(w) / 3));

// settlers: the bigger the colony, the longer until the next one turns up
// (8 or fewer → 1 day, 9 → 2 days, 10 → 3 days…)
export const settlerWaitDays = pop => Math.max(1, pop - 7);
