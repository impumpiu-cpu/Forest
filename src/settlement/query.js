// Read-only questions about the world state, shared by systems and content definitions.
import {RESOURCES} from '../data/resources.js';
import {perTick} from '../core/util.js';
import {HOUR, atHour} from '../core/time.js';
import {SPECIES} from '../data/species.js';
import {exposedOre} from '../world/ores.js';
import {ORE_BY_CODE} from '../data/ores.js';
import {ofSpeciesList} from '../agents/lookup.js';
import {CAMP_LIFE} from '../data/colony.js';

export const count = (w, key, any = false) => w.buildings.reduce((n, b) => n + (b.key === key && (any || b.done) ? 1 : 0), 0);
export const has = (w, key) => w.buildings.some(b => b.key === key && b.done);
export const openSites = w => w.buildings.filter(b => !b.done);
export const buildingById = (w, id) => w.buildings.find(b => b.id === id);

// asked many times a tick by brains, panels and buildings: the list is made once per tick
export const colonists = w => perTick(w, 'colonists', () => w.agents.filter(a => a.faction === 'colony'));
export const ofSpecies = (w, id) => ofSpeciesList(w, [id]);

const FOOD = () => RESOURCES.filter(r => r.tags.includes('food'));
export const foodTotal = w => FOOD().reduce((s, r) => s + (w.stock[r.id] || 0), 0);

// how many colonists have each food as their favourite: {foodId: n}
export const favourites = w => perTick(w, 'favourites', () => {   // by fresh food id
  const out = {};
  for (const a of colonists(w)) if (a.food?.likes) out[a.food.likes] = (out[a.food.likes] || 0) + 1;
  return out;
});

export const popCap = w => CAMP_LIFE.popBase + w.mods.add.popCap;
// a job with `open` needs no building in a camp of the campaign that came to dig (the outcrop is worked by hand)
export const jobUnlocked = (w, job) => !job.requires || [].concat(job.requires).some(b => has(w, b)) || (!!job.open && w.light && w.campDig?.size > 0);

// ore kinds (codes) the colony wants dug now: those whose stock is below the resource's `target`
const ORE_RES = () => RESOURCES.filter(r => r.ore);
// (only ores the rock face actually shows: a region without gold or mithril sends nobody digging for it)
// In a camp of the campaign (w.light): only the ore its stop to dig was for, as much as there is (w.campDig)
export const wantedOre = w => perTick(w, 'wantedOre', () => {
  const seen = exposedOre(w);
  if (w.light) return new Set([...(w.campDig || [])].filter(c => seen[ORE_BY_CODE[c].id] > 0));
  return new Set(ORE_RES().filter(r => (w.stock[r.id] || 0) < r.target && seen[ORE_BY_CODE[r.ore].id] > 0).map(r => r.ore));
});

// The raid alarm: raiders on the map, and one of them close enough in time — it would reach the camp
// (by the camp flow field, at its own pace) within CAMP_LIFE.alarmHours. A fast band raises it almost as soon
// as it comes out of the woods, as before, so the colony has time to gather; the dead, who shamble for
// a day or more across a big map, raise it only on their last stretch, and nobody starves at the fire
// waiting for them. Asked many times a tick, so counted once.
export const raidAlarm = w => perTick(w, 'raidAlarm', () => {
  const camp = w.nav.get('camp'), reach = atHour(w, CAMP_LIFE.alarmHours) * CAMP_LIFE.alarmPace;   // (woods and detours slow the march)
  return w.agents.some(o => {
    if (o.faction !== 'raiders' || o.dead || o.downed) return false;   // one lying senseless is no threat (settlement/captives.js)
    // a squad falling back or leaving with its loot is no alarm any more (agents/squad.js state); who
    // still carries our goods off is a chase on the colony's board (settlement/board.js)
    if (o.squad != null && w.squads?.[o.squad] && w.squads[o.squad].state !== 'march') return false;
    const pace = SPECIES.get(o.species).speed * (o.mods?.speed ?? 1);
    return camp[clampCell(w, o)] <= pace * reach;
  });
});
const clampCell = (w, o) => Math.min(w.h - 1, Math.max(0, o.y | 0)) * w.w + Math.min(w.w - 1, Math.max(0, o.x | 0));
