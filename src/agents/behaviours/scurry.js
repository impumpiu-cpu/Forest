// Scurry: vermin (a rat, the kikimora) runs from anyone awake who comes close (`vermin.flee`); a colonist who gets
// right next to one may kill it (`vermin.caught`). Offers the shared `bolt` task. A kikimora is seen only up close
// (`vermin.veil`, agents/combat.js): colonists do not chase her across the map. Reads: vermin {flee, caught, veil?}.
import {kill} from '../agent.js';
import {log} from '../../core/log.js';
import {esc, g, dist} from '../../core/util.js';
import {nearAgents} from '../spatial.js';
import {VERMIN} from '../../data/behaviour.js';


export const scurry = {
  always(w, a, {sp}) { if (sp.vermin.veil != null) a.veil = sp.vermin.veil; },
  want(w, a, {sp}) {
    const V = sp.vermin;
    let near = null;
    for (const o of nearAgents(w, a.x, a.y, V.flee)) if (o.faction === 'colony' && !o.dead && !o.sleeping && dist(o, a) < V.flee) { near = o; break; }
    if (!near) return null;
    if (dist(near, a) < VERMIN.caughtAt && w.rngs.wild() < V.caught) {
      kill(w, a, 'палки', near);
      if (!sp.resident && w.rngs.wild() < VERMIN.killLog) log(w, `<b>${esc(near.name)}</b> ${g(near, 'прибил', 'прибила')} ${sp.labelAcc || sp.label} у припасов.`, 'wildlife');
      return null;
    }
    a.waited = w.tick;   // patience starts anew after a scare (agents/behaviours/hide.js)
    return [[{id: 'bolt', mode: 'from', from: [near], sprint: VERMIN.flee, drain: 0}, VERMIN.want.flee, () => `${near.name} рядом`]];
  },
};
