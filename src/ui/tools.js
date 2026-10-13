// What a click on the map does. Add a tool here and a button with data-tool="<id>" in index.html.
// Tools only pick things or call COMMANDS; they never change the world themselves.
import {COMMANDS} from '../commands.js';

export const TOOLS = {
  inspect: {
    // a creature near the click first, then a building under it, otherwise the cell itself
    apply(w, cx, cy, view) {
      let best = null, bd = 4;
      for (const a of w.agents) { const d = (a.x - cx - 0.5) ** 2 + (a.y - cy - 0.5) ** 2; if (d < bd) { bd = d; best = a; } }
      const i = cy * w.w + cx, b = w.grid.bld[i];
      view.selected = best;
      view.selBld = !best && b >= 0 ? b : null;
      view.selCell = !best && b < 0 ? i : null;
    },
  },
  ignite: {apply: (w, cx, cy) => COMMANDS.ignite(w, cx, cy)},
  rain: {apply: (w, cx, cy) => COMMANDS.rain(w, cx, cy)},
};
