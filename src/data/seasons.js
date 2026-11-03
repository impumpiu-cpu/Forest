// Seasons. The year is these seasons in order, each SEASON_DAYS long. The calendar day of a game is
// its age plus the start day (w.calendar.startDay: a game may begin in any season); everything that
// means «how old is the colony» keeps counting from tick 0. Everything a season changes is a number
// here; systems ask season(w) and read the field they need, so a new effect is one more field.
//
// Temperature is not a season's field any more: it follows the climate of the site (w.climate:
// yearly mean `meanT` and yearly range `trange`) as a sine over the year, warmest in the middle of
// summer and coldest in the middle of winter (seasonalTemp). Snow is where that is below freezing.
//
//   grow:    how fast wild berries and herbs ripen (×) in a warm enough day; the cold scales it down to nothing (season())
//   wither:  share of what is ripe on wild bushes lost per sampled step (berries drop, frost bites)
//   garden:  how fast a planted garden ripens (×)
//   jobs:    work speed by job id (fishing through the ice is slow, picking in snow is slower)
//   hares:   how many hares drift in (×);  hunger: how fast predators get hungry (×)
//   spoil:   how fast food spoils in the stock (×): heat rots it, frost keeps it
//   rain:    how often it rains (×). Snow is not a season's business: when the climate makes a day cold enough (snowy), what falls is snow and the ground turns white
//   ignite:  fire ignition threshold offset, °C (wet spring and snowy winter burn badly)
//   drying:  whether food can be dried on the racks (no drying in a wet, freezing winter)
//   tint:    [r, g, b, k] — colour mixed into grass and forest on the world layer (snow overrides it)
//   dress:   how much people value warm clothing over armour (×)
//   frost:   when the season begins, wild bushes keep only this share of their berries (the first frost)
//   lean:    the lean season: no taming or breeding in the pen, the herd milks less and is culled to the hay (settlement/herd.js),
//            the caravan freezes, winters in towns and finds no grass in a hard frost (campaign/march.js, land.js)
//   stockUp: the season before the lean one: the colony keeps more food ahead (settlement/plan.js), tames only with the
//            hay in (settlement/herd.js); a caravan late in it looks for a town to winter in (campaign/march.js)
//   shear:   the herd's fleece is sheared;  stockpile: × how much the workshops want stores made (data/recipes.js ctx)
import {Registry} from '../core/registry.js';
import {perTick} from '../core/util.js';
// (core/time.js imports this table back for the weather; DAY is read only when a day is counted, never at load)
import {DAY} from '../core/time.js';

export const SEASON_DAYS = 30;

// The calendar and the thaw (season(), seasonalTemp(), snowy()). `lag` — days by which the year's warmth lags behind the
// sun (the warmest day is in the middle of summer). A day colder than `frozen` °C is frozen: snow lies and the frost
// rules of the season hold. A warmer day lets things grow by (T − `from`) / `span` (nothing at `from`, all at
// `from + span`); in a winter that does not freeze the hares come back to at least `hares`, predators get hungry at
// most `hunger`, and food spoils at least `spoil[1]`; a frozen day keeps it at most `spoil[0]`.
export const THAW = {lag: 7.5, frozen: -1, from: -6, span: 10, hares: 0.8, hunger: 1.1, spoil: [0.25, 0.8]};

export const SEASONS = new Registry('season');

SEASONS.registerAll([
  {id: 'spring', label: 'Весна', next: 'лето', dress: 1, grow: 1, wither: 0, garden: 1, jobs: {},
    hares: 1.2, hunger: 1, spoil: 0.9, rain: 1.4, ignite: 15, drying: true, shear: true, stockpile: 0.7, tint: [120, 170, 90, 0.08],
    note: 'Тает снег, луга оживают, звери возвращаются.'},
  {id: 'summer', label: 'Лето', next: 'осень', dress: 0.5, grow: 1.4, wither: 0, garden: 1.3, jobs: {},
    hares: 1, hunger: 1, spoil: 1.4, rain: 0.8, ignite: -8, drying: true, shear: true, stockpile: 1, tint: [0, 0, 0, 0],
    note: 'Жарко: ягоды зреют быстро, но и еда портится быстрее. Лес легко загорается.'},
  {id: 'autumn', label: 'Осень', next: 'зима', dress: 1.5, grow: 0.5, wither: 0, garden: 0.6, jobs: {},
    hares: 0.8, hunger: 1.1, spoil: 0.8, rain: 1.3, ignite: 5, drying: true, stockUp: true, stockpile: 1.6, tint: [208, 178, 70, 0.3],
    note: 'Пора заготовок: сушить, солить, запасать дрова. Зима близко.'},
  {id: 'winter', label: 'Зима', next: 'весна', dress: 3, grow: 0.4, wither: 0.04, garden: 0.4, jobs: {fish: 0.5, gather: 0.6, chop: 0.85},
    hares: 0.35, hunger: 1.35, spoil: 0.25, rain: 0.9, ignite: 40, drying: false, frost: 0.15, lean: true, stockpile: 1, tint: [190, 176, 120, 0.3],
    note: 'Мороз: ничего не растёт, рыба ловится вдвое хуже, волки голодны. Живут запасами и костром. Где зима тёплая, это просто скудная пора.'},
]);

const LIST = SEASONS.all();
export const YEAR_DAYS = LIST.length * SEASON_DAYS;

// calendar day of a tick: the game's age plus the day the game began on (fractional: days + hours)
export const calendarDay = (w, tick = w.tick) => tick / DAY + (w.calendar?.startDay || 0);
export const seasonIndex = (w, tick) => Math.floor(calendarDay(w, tick) / SEASON_DAYS) % LIST.length;
// the season's record as written (by the calendar alone)
export const seasonRaw = (w, tick) => LIST[seasonIndex(w, tick)];
// The season as the game feels it: the record of the calendar season, with everything that is
// really the cold's doing scaled by the climate's temperature of the day (data/presets.js CLIMATES).
// A dry winter at +5° is a lean season, not a dead one; a cold spring at −8° is still frozen:
//   grow, garden — × a growth factor from the day's mean (nothing while frozen, then from −6° up to full at 4°);
//   wither, frost, the slow jobs (ice fishing), no drying, hungry predators, few hares, slow spoil — only when frozen.
export function season(w) {
  return perTick(w, 'season', () => {
    const S = seasonRaw(w), T = dayMeanTemp(w), frozen = T < THAW.frozen, gf = frozen ? 0 : clamp01((T - THAW.from) / THAW.span);
    if (gf >= 1 && !frozen && !S.frost) return S;
    return {...S, grow: S.grow * gf, garden: S.garden * gf, wither: frozen ? S.wither : 0, frost: frozen ? S.frost : null,
      jobs: frozen ? S.jobs : {}, drying: S.drying || !frozen, hares: frozen ? S.hares : Math.max(S.hares, THAW.hares),
      hunger: frozen ? S.hunger : Math.min(S.hunger, THAW.hunger), spoil: frozen ? Math.min(S.spoil, THAW.spoil[0]) : Math.max(S.spoil, THAW.spoil[1])};
  });
}
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const daysLeftInSeason = (w, tick) => SEASON_DAYS - calendarDay(w, tick) % SEASON_DAYS;
// the first day of a season (for «a new season begins» once a day)
export const seasonStarts = (w, tick) => Math.floor(calendarDay(w, tick)) % SEASON_DAYS === 0;

// the seasonal part of the air temperature: a sine over the year a week behind the sun (daylight
// below): warmest a week after the summer solstice, coldest a week after the winter one, so the
// first week of spring is still cold and the first snow comes a week into winter
export function seasonalTemp(w, tick = w.tick) {
  return (w.climate.trange / 2) * Math.sin(2 * Math.PI * (calendarDay(w, tick) - THAW.lag) / YEAR_DAYS);
}
// hours of daylight: 12 at the equinoxes (the first day of spring and of autumn), longest at the
// summer solstice (the first day of summer), shortest at the winter one; the swing is the climate's
// `daylight` (data/presets.js) — the far north has white nights and a winter that is almost all night
export function daylight(w, tick = w.tick) {
  return 12 + (w.climate.daylight ?? 4) * Math.sin(2 * Math.PI * calendarDay(w, tick) / YEAR_DAYS);
}

// mean air temperature of the day (no hour): what decides snow and frost
export const dayMeanTemp = (w, tick = w.tick) => w.climate.meanT + seasonalTemp(w, tick);
// snow instead of rain, white ground: a cold season when the day's mean is below freezing
export const snowy = (w, tick = w.tick) => dayMeanTemp(w, tick) < THAW.frozen;
// snow on the ground paints everything white, whatever the season
const SNOW_TINT = [236, 240, 246, 0.62];
// snow on the ground paints by its depth (world/weather.js w.snow), over the season's own colour
export const seasonTint = w => { const s = w.snow || 0; if (s < 0.05) return season(w).tint; const [r, g, b, k] = season(w).tint; const m = Math.min(1, s / 0.6); return [r * (1 - m) + SNOW_TINT[0] * m, g * (1 - m) + SNOW_TINT[1] * m, b * (1 - m) + SNOW_TINT[2] * m, k * (1 - m) + SNOW_TINT[3] * m]; };

export const seasonJob = (w, job) => season(w).jobs[job] ?? 1;
