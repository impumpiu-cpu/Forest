// Wind, rain showers and lightning.
import {DAY, HOUR, hourOf} from '../core/time.js';
import {log} from '../core/log.js';
import {T} from '../data/terrain.js';

export function setWind(w) {
  const a = w.wind.dir * Math.PI / 180;
  w.wind.x = Math.cos(a) * w.wind.str * 0.5;
  w.wind.y = Math.sin(a) * w.wind.str * 0.5;
}

export function stepWeather(w) {
  const wx = w.weather, fires = w.stats.fireCount;
  if (wx.rainLeft > 0) {
    wx.rainLeft--; wx.rain = Math.min(1, wx.rain + 0.02);
    if (wx.rainLeft === 0) log(w, 'Дождь закончился.', 'weather');
  } else {
    wx.rain = Math.max(0, wx.rain - 0.01);
    // a big fire pulls up smoke clouds (pyrocumulus): rain gets much more likely while it burns
    const fireClouds = 1 + fires / 20;
    if (w.rng() < w.climate.rain * fireClouds / DAY) {
      wx.rainLeft = Math.round(HOUR * (1.5 + w.rng() * 3));
      log(w, fires > 40 ? 'Над пожаром собрались тучи, пошёл дождь.' : fires > 0 ? 'Пошёл дождь, огонь слабеет.' : 'Пошёл дождь.', 'weather');
    }
  }
  if (w.cfg.lightning) lightning(w);
}

function lightning(w) {
  const h = hourOf(w.tick), dry = w.cfg.climate === 'dry' ? 2 : w.cfg.climate === 'cold' ? 0.4 : 1;
  if (h < 11 || h > 19 || w.weather.rain > 0.2 || w.rng() >= 0.00025 * dry * w.n / 12288) return;
  for (let k = 0; k < 40; k++) {
    const i = (w.rng() * w.n) | 0, x = i % w.w, y = (i / w.w) | 0;
    if (w.grid.terr[i] !== T.FOREST || w.grid.fire[i] > 0 || (x - w.camp.x) ** 2 + (y - w.camp.y) ** 2 < 22 * 22) continue;
    w.grid.fire[i] = 0.7; w.grid.temp[i] = 350; w.nav.dirty('fire');
    log(w, `Молния ударила в лес в ${Math.round(Math.hypot(x - w.camp.x, y - w.camp.y))} клетках от лагеря.`, 'weather', 'notice');
    return;
  }
}
