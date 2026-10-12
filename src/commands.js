// Everything a player (or any front end) can do to a running world. The screen never changes the
// world directly: it calls one of these. Kept in the core so another shell — a different renderer,
// a bot, a replay — gets exactly the same actions.
import {log} from './core/log.js';
import {ambientTemp} from './core/time.js';
import {inBounds} from './world/grid.js';
import {setWind as applyWind} from './world/weather.js';
import {arriveNow} from './outside/index.js';

export const COMMANDS = {
  // wind direction in degrees, strength 0…1
  setWind(w, dir, str) {
    if (dir != null) w.wind.dir = dir;
    if (str != null) w.wind.str = str;
    applyWind(w);
  },
  // set a 3×3 patch on fire
  ignite(w, cx, cy) {
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (!inBounds(w, x, y)) continue; const i = y * w.w + x;
      if (w.grid.fuel[i] > 0.05) { w.grid.fire[i] = 0.6; w.grid.temp[i] = 300; }
    }
    w.nav.dirty('fire'); log(w, 'Кто-то поджёг траву.', 'weather', 'notice');
  },
  // a short downpour in a radius of 7 cells
  rain(w, cx, cy) {
    const g = w.grid, amb = ambientTemp(w);
    for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 7; x <= cx + 7; x++) {
      if (!inBounds(w, x, y) || (x - cx) ** 2 + (y - cy) ** 2 > 49) continue;
      const i = y * w.w + x; g.fire[i] = 0; g.temp[i] = Math.min(g.temp[i], amb - 2); g.smoke[i] *= 0.3;
    }
    w.nav.dirty('fire'); log(w, 'Прошёл короткий ливень.', 'weather');
  },
  // a raid right now, outside the schedule
  raid(w) { return arriveNow(w, 'raiders'); },
};
