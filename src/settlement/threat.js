// How dangerous the next raid is. The raiders do not see the colony: they hear rumours —
// the daily report it sends out (outside/report.js). Two numbers:
//   raidThreat(w)   — the threat level: how far the enemy has come. It grows with time, with every raid
//                     already sent, with the colony's strength the rumours tell of and with its fame. The
//                     level decides which bands come (data/raids.js `weight`), their gear and toughness.
//   raidStrength(w) — the threat itself, in strength rating (КС, agents/strength.js): how strong the next
//                     band is. Members are added until their ratings reach it (data/raids.js fill), so a
//                     band of 600 is five bandits, a dozen goblins or two trolls, and the colony's own
//                     rating (colonyStrength) says how it stands against it.
import {DAY} from '../core/time.js';
import {raiderStrength} from '../data/raids.js';
import {THREAT} from '../data/colony.js';

export {THREAT};   // (data/colony.js)
// what the rumours say of the colony's strength; a report from before the rating was kept tells only
// heads, weapons and armour, and is read in the old way (the same scale)
const rumouredKs = r => r.ks ?? (r.pop * 0.25 + r.armed * 0.2 + r.armour * 2) / THREAT.perColonyKs;
export const colonyStrength = w => rumouredKs(w.outside?.seen || {pop: 0, armed: 0, armour: 0});

export function raidThreat(w) {
  // + rumours of gold and mithril (settlement/precious.js)
  return w.tick / DAY * THREAT.perDay + w.stats.raids * THREAT.perRaid + colonyStrength(w) * THREAT.perColonyKs + (w.fame || 0);
}

// scouts that went home with word of the camp (agents/squad.js): their band comes next, sooner and bigger
export const SCOUTED_FOR = 6 * DAY;
export const scoutedBand = w => Object.entries(w.scouted || {}).find(([, t]) => w.tick - t < SCOUTED_FOR)?.[0] || null;
// the next band, in bandits of its level (the size the panel speaks of), and in strength rating
export const raidHeads = w => Math.min(THREAT.maxHeads, Math.round((THREAT.heads[0] + Math.floor(raidThreat(w) * THREAT.heads[1])) * (scoutedBand(w) ? THREAT.scouted : 1)));
export const raidStrength = w => Math.round(raidHeads(w) * raiderStrength(raidThreat(w)) * THREAT.share);

// settlers: the bigger the colony, the longer until the next one turns up
// (8 or fewer → 1 day, 9 → 2 days, 10 → 3 days…)
export const settlerWaitDays = pop => Math.max(1, pop - 7);
