// A stop to dig in the quick mode and the council's want of it (data/campaign.js MINE). Out of campaign/march.js.
import {NORM} from '../data/special.js';
import {CAMPAIGN, MINE} from '../data/campaign.js';
import {ORES} from '../data/ores.js';
import {kitOf} from '../data/transport.js';
import {RESOURCES} from '../data/resources.js';
import {EARN} from '../data/market.js';
import {cellRegion} from './land.js';
import {capacity, load, metalTier} from './baggage.js';
import {free} from './captives.js';
import {alive} from './march.js';

// ── a stop to dig (data/campaign.js MINE): the best ore worth stopping for on the cell the caravan stands on.
// An ore of a metal only above the caravan's own; silver, gems, gold sand (with a pan) — while it is short of gold.
// → {ore, level} or null
// the room left to dig into: what food for MINE.food days would take is kept for it
const digRoom = K => Math.max(0, capacity(K) - load(K) - Math.max(0, alive(K).length * CAMPAIGN.ration * MINE.food - K.food));
export function wantMine(a, K) {
  if (K.food < alive(K).length * CAMPAIGN.ration * MINE.food || digRoom(K) < MINE.room || (K.mined || []).includes(K.i)) return null;   // not while the food runs low
  const tier = metalTier(K), poor = K.gold < MINE.rich, reg = cellRegion(a, K.i);
  let best = null, bv = 0;
  for (const id of MINE.ores) {
    const O = ORES.get(id), lvl = reg.ores?.[id] ?? 0;
    if (lvl <= 0 || (O.tier ? O.tier <= tier : !poor)) continue;
    const v = lvl * (O.tier ? 1 + O.tier : 1);
    if (v > bv) { bv = v; best = {ore: id, level: lvl}; }
  }
  if (poor && reg.placer > bv && free(K).some(m => m.gear.hand.includes(EARN.panTool))) best = {ore: 'placer', level: reg.placer};
  return best;
}
export const mineRes = ore => (ore === 'placer' ? 'goldDust' : ORES.get(ore).resource);
export const mineLabel = ore => (ore === 'placer' ? 'золотой песок' : ORES.get(ore).label);
// a day of digging in the quick mode: the diggers (Strength enough; gold sand — the one with the pan) bring the
// face's units, as far as the face and the room go
export function autoMine(a, K, r) {
  const ore = K.why.slice(5), reg = cellRegion(a, K.i), lvl = ore === 'placer' ? reg.placer : reg.ores?.[ore] ?? 0, res = mineRes(ore);
  const diggers = ore === 'placer' ? (free(K).some(m => m.gear.hand.includes(EARN.panTool)) ? 1 : 0) : free(K).filter(m => (m.special?.S ?? NORM) >= MINE.strength && m.hp >= 0.5).length;
  const room = Math.floor(digRoom(K) / (RESOURCES.get(res).bulk || 1));
  const n = Math.min(room, Math.round(MINE.auto[ore] * lvl * diggers * (0.6 + 0.8 * r()) * (kitOf(K).mine ?? 1)));   // (the dwarves dig more: data/transport.js PEOPLE_KIT)
  if (n > 0) K.cargo[res] = (K.cargo[res] || 0) + n;
  return n;
}
