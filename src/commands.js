// Everything a player (or any front end) can do to a running world. The screen never changes the
// world directly: it calls one of these. Kept in the core so another shell — a different renderer,
// a bot, a replay — gets exactly the same actions.
import {log} from './core/log.js';
import {ambientTemp} from './core/time.js';
import {inBounds} from './world/grid.js';
import {setWind as applyWind} from './world/weather.js';
import {arriveNow} from './outside/index.js';
import {heatTo, coolTo} from './world/heat.js';
import {COMMAND} from './data/colony.js';

export const COMMANDS = {
  // wind direction in degrees, strength 0…1
  setWind(w, dir, str) {
    if (dir != null) w.wind.dir = dir;
    if (str != null) w.wind.str = str;
    applyWind(w);
  },
  // set a 3×3 patch on fire
  ignite(w, cx, cy) {
    const I = COMMAND.ignite;
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (!inBounds(w, x, y)) continue; const i = y * w.w + x;
      if (w.grid.fuel[i] > I.fuel) { w.grid.fire[i] = I.fire; heatTo(w, i, I.heat); }
    }
    w.nav.dirty('fire'); log(w, 'Кто-то поджёг траву.', 'weather', 'notice');
  },
  // a short downpour in a radius of COMMAND.rain.r cells
  rain(w, cx, cy) {
    const g = w.grid, amb = ambientTemp(w), R = COMMAND.rain, r = R.r;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!inBounds(w, x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = y * w.w + x; g.fire[i] = 0; coolTo(w, i, amb - R.cool); g.smoke[i] *= R.smoke;
    }
    w.nav.dirty('fire'); log(w, 'Прошёл короткий ливень.', 'weather');
  },
  // a raid right now, outside the schedule
  raid(w) { return arriveNow(w, 'raiders'); },
};
