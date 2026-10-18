// Game clock: 1 day = 1200 ticks, 20 ticks per real second at 1×.
import {clamp} from './util.js';
import {seasonalTemp, daylight} from '../data/seasons.js';

export const DAY = 1200;
export const HOUR = DAY / 24;
export const TICK_MS = 50;

export const hourOf = t => (t % DAY) / HOUR;
export const dayOf = t => Math.floor(t / DAY);

export function clockStr(t) {
  const d = dayOf(t) + 1, h = hourOf(t), hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  return `День ${d}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 0 at midday, 1 at night, with soft dusk and dawn. The day's length follows the season and the
// climate (data/seasons.js daylight): equal day and night at the equinoxes (the first days of spring
// and autumn), the longest day at the summer solstice, the longest night at the winter one — a cold
// land's winter is a long night, when the undead are abroad and the fire is the only warmth
export function nightness(w, t = w.tick) {
  const day = daylight(w, t), h = hourOf(t), rise = 12 - day / 2, set = 12 + day / 2;
  const sun = h >= rise && h <= set ? Math.sin(Math.PI * (h - rise) / day) : -Math.sin(Math.PI * ((h - set + 24) % 24) / (24 - day));
  return clamp((0.2 - sun) * 2.2, 0, 1);
}

// air temperature: the climate's yearly mean, the season (a sine over the year, data/seasons.js) and the hour
export function ambientTemp(world, t = world.tick) {
  return world.climate.meanT + seasonalTemp(world, t) + 9 * Math.sin(2 * Math.PI * (hourOf(t) - 9) / 24);
}
