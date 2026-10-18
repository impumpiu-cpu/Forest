// Wind, rain showers and lightning.
import {DAY, HOUR, hourOf} from '../core/time.js';
import {log} from '../core/log.js';
import {T} from '../data/terrain.js';
import {season, seasonStarts, snowy} from '../data/seasons.js';
import {heatTo} from './heat.js';

export function setWind(w) {
  const a = w.wind.dir * Math.PI / 180;
  w.wind.x = Math.cos(a) * w.wind.str * 0.5;
  w.wind.y = Math.sin(a) * w.wind.str * 0.5;
}

export function stepWeather(w) {
  // a new season: say what it brings
  if (w.tick % DAY === 0 && seasonStarts(w)) {
    const S = season(w);
    log(w, `Наступает ${S.label.toLowerCase()}. ${S.note}`, 'weather', 'notice');
    // the first frost: wild bushes lose most of their berries at once (planted gardens are tended)
    if (S.frost != null) { const g = w.grid, garden = new Set(w.gardenCells); for (let i = 0; i < w.n; i++) if (g.bush[i]) g.food[i] *= garden.has(i) ? Math.max(S.frost, 0.4) : S.frost; w.nav.dirty('berries'); }
  }
  const wx = w.weather, fires = w.stats.fireCount;
  if (wx.rainLeft > 0) {
    wx.rainLeft--; wx.rain = Math.min(1, wx.rain + 0.02);
    if (wx.rainLeft === 0) log(w, snowy(w) ? 'Снегопад кончился.' : 'Дождь закончился.', 'weather');
  } else {
    wx.rain = Math.max(0, wx.rain - 0.01);
    // a big fire pulls up smoke clouds (pyrocumulus): rain gets much more likely while it burns
    const fireClouds = 1 + fires / 20;
    if (w.rngs.weather() < w.climate.rain * season(w).rain * fireClouds / DAY) {
      wx.rainLeft = Math.round(HOUR * (1.5 + w.rngs.weather() * 3));
      if (snowy(w)) log(w, fires > 0 ? 'Пошёл снег, огонь слабеет.' : 'Пошёл снег.', 'weather');
      else log(w, fires > 40 ? 'Над пожаром собрались тучи, пошёл дождь.' : fires > 0 ? 'Пошёл дождь, огонь слабеет.' : 'Пошёл дождь.', 'weather');
    }
  }
  if (w.cfg.lightning) lightning(w);
}

function lightning(w) {
  const h = hourOf(w.tick), dry = 0.4 / Math.max(0.1, w.climate.rain);   // the drier the climate, the more often lightning strikes
  if (h < 11 || h > 19 || w.weather.rain > 0.2 || w.rngs.weather() >= 0.00025 * dry * w.n / 12288) return;
  for (let k = 0; k < 40; k++) {
    const i = (w.rngs.weather() * w.n) | 0, x = i % w.w, y = (i / w.w) | 0;
    if (w.grid.terr[i] !== T.FOREST || w.grid.fire[i] > 0 || (x - w.camp.x) ** 2 + (y - w.camp.y) ** 2 < 22 * 22) continue;
    w.grid.fire[i] = 0.7; heatTo(w, i, 350); w.nav.dirty('fire');
    log(w, `Молния ударила в лес в ${Math.round(Math.hypot(x - w.camp.x, y - w.camp.y))} клетках от лагеря.`, 'weather', 'notice');
    return;
  }
}
