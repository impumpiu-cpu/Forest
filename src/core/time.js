// Game clock: 1 day = 1200 ticks, 20 ticks per real second at 1×.
import {clamp} from './util.js';
import {seasonTemp} from '../data/seasons.js';

export const DAY = 1200;
export const HOUR = DAY / 24;
export const TICK_MS = 50;

export const hourOf = t => (t % DAY) / HOUR;
export const dayOf = t => Math.floor(t / DAY);

export function clockStr(t) {
  const d = dayOf(t) + 1, h = hourOf(t), hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  return `День ${d}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 0 at midday, 1 at night, with soft dusk and dawn
export function nightness(t) {
  const sun = Math.sin(2 * Math.PI * (hourOf(t) - 6) / 24);
  return clamp((0.2 - sun) * 2.2, 0, 1);
}

// air temperature, shifted by the climate and the season (data/seasons.js)
export function ambientTemp(world, t = world.tick) {
  return 11 + world.climate.tOff + seasonTemp(t) + 9 * Math.sin(2 * Math.PI * (hourOf(t) - 9) / 24);
}
