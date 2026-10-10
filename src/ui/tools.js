// What a click on the map does. Add a tool here and a button with data-tool="<id>" in index.html.
import {log} from '../core/log.js';
import {ambientTemp} from '../core/time.js';
import {inBounds} from '../world/grid.js';

export const TOOLS = {
  inspect: {
    apply(w, cx, cy, view) {
      let best = null, bd = 4;
      for (const a of w.agents) { const d = (a.x - cx - 0.5) ** 2 + (a.y - cy - 0.5) ** 2; if (d < bd) { bd = d; best = a; } }
      view.selected = best;
    },
  },
  ignite: {
    apply(w, cx, cy) {
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
        if (!inBounds(w, x, y)) continue; const i = y * w.w + x;
        if (w.grid.fuel[i] > 0.05) { w.grid.fire[i] = 0.6; w.grid.temp[i] = 300; }
      }
      w.nav.dirty('fire'); log(w, 'Кто-то поджёг траву.');
    },
  },
  rain: {
    apply(w, cx, cy) {
      const g = w.grid, amb = ambientTemp(w);
      for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 7; x <= cx + 7; x++) {
        if (!inBounds(w, x, y) || (x - cx) ** 2 + (y - cy) ** 2 > 49) continue;
        const i = y * w.w + x; g.fire[i] = 0; g.temp[i] = Math.min(g.temp[i], amb - 2); g.smoke[i] *= 0.3;
      }
      w.nav.dirty('fire'); log(w, 'Прошёл короткий ливень.');
    },
  },
};
