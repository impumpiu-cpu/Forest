// The settlement's vital signs now (docs/NRI.md, этап 8; what each is and its norm: data/colonyStats.js). Pure: reads
// the world, draws nothing, changes nothing. → [{id, label, value, norm, ok, low}]
import {SETTLEMENT_STATS} from '../data/colonyStats.js';
import {PLAN} from '../data/colony.js';
import {colonists, foodTotal, popCap} from './query.js';
import {raidStrength} from './threat.js';
import {sideStrength} from '../agents/strength.js';
import {moodOf} from '../agents/mind.js';

export function settlementValues(w) {
  const col = colonists(w).filter(a => !a.dead), pop = Math.max(1, col.length);
  const foe = raidStrength(w);
  return {
    food: foodTotal(w) / Math.max(PLAN.rationFloor, pop * PLAN.ration),
    beds: (w.mods?.add?.beds || 0) / pop,
    warmth: (w.mods?.add?.bedWarmth || 0) / pop,
    defence: foe > 0 ? sideStrength(col.filter(a => !a.captive && !a.downed)) / foe : Infinity,
    mood: col.length ? col.reduce((s, a) => s + moodOf(w, a), 0) / col.length : 0,
    room: col.length / Math.max(1, popCap(w)),
  };
}

export function settlementStats(w) {
  const v = settlementValues(w);
  return SETTLEMENT_STATS.all().map(S => ({id: S.id, label: S.label, value: v[S.id], norm: S.norm, ok: S.above ? v[S.id] >= S.norm : v[S.id] <= S.norm, low: S.low}));
}
