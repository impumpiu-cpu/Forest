// Game clock: 1 day = 1200 ticks, 20 ticks per real second at 1×.
import {clamp} from './util.js';
import {seasonalTemp, daylight} from '../data/seasons.js';

// A world may run its sun slower (`w.dayScale`: the caravan's camp, data/camp.js CAMP.clock — docs/CAMPAIGN.md «Часы
// стоянки»): a day there is DAY × scale ticks, so hands and feet (walking, fighting, a chore's ticks) do more by the sun
// than in a settlement, while the body (hunger, sleep, warmth, mending: agents/body.js, data/needs.js) and what lasts by the
// sun (a brew's hours, a wound's days, a thought's days) are counted by the sun — their rates and spans take the scale too
// (agents/potions.js, agents/wounds.js, agents/mind.js). Time of day is always asked with the world: hourOf(t, w).
export const DAY = 1200;
export const HOUR = DAY / 24;
export const TICK_MS = 50;

export const scaleOf = w => w?.dayScale || 1;
export const dayLen = w => DAY * scaleOf(w);
export const hourOf = (t, w) => ((t / scaleOf(w)) % DAY) / HOUR;
export const dayOf = (t, w) => Math.floor(t / dayLen(w));
// the tick of the day (0 … dayLen), and the tick of the hour `h` of a day, in the world's ticks
export const tickOfDay = (w, t = w.tick) => t % dayLen(w);
export const atHour = (w, h) => Math.round(h * HOUR * scaleOf(w));
// a span by the sun — `ticks` of a settlement's clock — in this world's ticks, and back
export const sunTicks = (w, ticks) => ticks * scaleOf(w);
export const ofSun = (w, ticks) => ticks / scaleOf(w);

export function clockStr(t, w) {
  const d = dayOf(t, w) + 1, h = hourOf(t, w), hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  return `День ${d}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 0 at midday, 1 at night, with soft dusk and dawn. The day's length follows the season and the
// climate (data/seasons.js daylight): equal day and night at the equinoxes (the first days of spring
// and autumn), the longest day at the summer solstice, the longest night at the winter one — a cold
// land's winter is a long night, when the undead are abroad and the fire is the only warmth
export function nightness(w, t = w.tick) {
  if (w.scene?.dark) return 1;   // under the ground (world/pieces.js: a vault) the night never ends
  const day = daylight(w, t), h = hourOf(t, w), rise = 12 - day / 2, set = 12 + day / 2;
  const sun = h >= rise && h <= set ? Math.sin(Math.PI * (h - rise) / day) : -Math.sin(Math.PI * ((h - set + 24) % 24) / (24 - day));
  return clamp((0.2 - sun) * 2.2, 0, 1);
}

// air temperature: the climate's yearly mean, the season (a sine over the year, data/seasons.js) and the hour
export function ambientTemp(world, t = world.tick) {
  return world.climate.meanT + seasonalTemp(world, t) + 9 * Math.sin(2 * Math.PI * (hourOf(t, world) - 9) / 24);
}
