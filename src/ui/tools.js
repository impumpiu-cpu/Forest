// What a click on the map does. Add a tool here and a button with data-tool="<id>" in index.html.
// Tools only pick things or call COMMANDS; they never change the world themselves.
import {COMMANDS} from '../commands.js';

export const TOOLS = {
  inspect: {
    apply(w, cx, cy, view) {
      let best = null, bd = 4;
      for (const a of w.agents) { const d = (a.x - cx - 0.5) ** 2 + (a.y - cy - 0.5) ** 2; if (d < bd) { bd = d; best = a; } }
      view.selected = best;
    },
  },
  ignite: {apply: (w, cx, cy) => COMMANDS.ignite(w, cx, cy)},
  rain: {apply: (w, cx, cy) => COMMANDS.rain(w, cx, cy)},
};
