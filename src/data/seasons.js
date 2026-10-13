// Seasons. The year is these seasons in order, each SEASON_DAYS long; a game starts on the first
// day of the first one (spring). Everything a season changes is a number here; systems ask
// season(w) and read the field they need, so a new effect is one more field.
//
//   temp:    air temperature offset, °C (blended over BLEND_DAYS around each change, so it drifts)
//   grow:    how fast wild berries and herbs ripen (×); 0 — nothing grows
//   wither:  share of what is ripe on wild bushes lost per sampled step (berries drop, frost bites)
//   garden:  how fast a planted garden ripens (×)
//   jobs:    work speed by job id (fishing through the ice is slow, picking in snow is slower)
//   hares:   how many hares drift in (×);  hunger: how fast predators get hungry (×)
//   spoil:   how fast food spoils in the stock (×): heat rots it, frost keeps it
//   rain:    how often it rains (×); snow: true — what falls is snow, and the ground turns white
//   ignite:  fire ignition threshold offset, °C (wet spring and snowy winter burn badly)
//   drying:  whether food can be dried on the racks (no drying in a wet, freezing winter)
//   tint:    [r, g, b, k] — colour mixed into grass and forest on the world layer
//   dress:   how much people value warm clothing over armour (×)
//   frost:   when the season begins, wild bushes keep only this share of their berries (the first frost)
import {Registry} from '../core/registry.js';

export const SEASON_DAYS = 30;
const BLEND_DAYS = 4;

export const SEASONS = new Registry('season');

SEASONS.registerAll([
  {id: 'spring', label: 'Весна', next: 'лето', temp: -2, dress: 1, grow: 1, wither: 0, garden: 1, jobs: {},
    hares: 1.2, hunger: 1, spoil: 0.9, rain: 1.4, snow: false, ignite: 15, drying: true, tint: [120, 170, 90, 0.08],
    note: 'Тает снег, луга оживают, звери возвращаются.'},
  {id: 'summer', label: 'Лето', next: 'осень', temp: 5, dress: 0.5, grow: 1.4, wither: 0, garden: 1.3, jobs: {},
    hares: 1, hunger: 1, spoil: 1.4, rain: 0.8, snow: false, ignite: -8, drying: true, tint: [0, 0, 0, 0],
    note: 'Жарко: ягоды зреют быстро, но и еда портится быстрее. Лес легко загорается.'},
  {id: 'autumn', label: 'Осень', next: 'зима', temp: -3, dress: 1.5, grow: 0.5, wither: 0, garden: 0.6, jobs: {},
    hares: 0.8, hunger: 1.1, spoil: 0.8, rain: 1.3, snow: false, ignite: 5, drying: true, tint: [208, 178, 70, 0.3],
    note: 'Пора заготовок: сушить, солить, запасать дрова. Зима близко.'},
  {id: 'winter', label: 'Зима', next: 'весна', temp: -13, dress: 3, grow: 0, wither: 0.04, garden: 0, jobs: {fish: 0.5, gather: 0.6, chop: 0.85},
    hares: 0.35, hunger: 1.35, spoil: 0.25, rain: 0.9, snow: true, ignite: 40, drying: false, frost: 0.15, tint: [236, 240, 246, 0.62],
    note: 'Снег и мороз: ничего не растёт, рыба ловится вдвое хуже, волки голодны. Живут запасами и костром.'},
]);

const LIST = SEASONS.all();
const DAY_TICKS = 1200;   // core/time.js DAY; kept here so this table does not import the clock
const YEAR = () => LIST.length * SEASON_DAYS;

export const seasonIndex = tick => Math.floor(tick / DAY_TICKS / SEASON_DAYS) % LIST.length;
export const seasonAt = tick => LIST[seasonIndex(tick)];
export const season = w => seasonAt(w.tick);
export const seasonDay = tick => Math.floor(tick / DAY_TICKS) % SEASON_DAYS + 1;
export const yearOf = tick => Math.floor(tick / DAY_TICKS / YEAR()) + 1;
export const daysLeftInSeason = tick => SEASON_DAYS - (tick / DAY_TICKS) % SEASON_DAYS;

// temperature offset that drifts from one season to the next over BLEND_DAYS around the change
export function seasonTemp(tick) {
  const d = tick / DAY_TICKS, i = seasonIndex(tick), into = d % SEASON_DAYS, cur = LIST[i].temp;
  const half = BLEND_DAYS / 2;
  if (into < half) { const prev = LIST[(i + LIST.length - 1) % LIST.length].temp; const k = 0.5 + into / BLEND_DAYS; return prev + (cur - prev) * k; }
  if (into > SEASON_DAYS - half) { const nxt = LIST[(i + 1) % LIST.length].temp; const k = (into - (SEASON_DAYS - half)) / BLEND_DAYS; return cur + (nxt - cur) * k; }
  return cur;
}

export const seasonJob = (w, job) => season(w).jobs[job] ?? 1;
