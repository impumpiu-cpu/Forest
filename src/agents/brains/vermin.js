// Vermin brain (rats, the kikimora): each keeps a hiding place in the brush a little way off the camp
// and waits there while anyone is awake by the stores; when the camp is quiet (mostly at night, while
// people sleep) it sneaks in and nibbles the food lying in the open. Someone coming close sends it back
// to its hole; a colonist who gets right next to one may kill it. Pots and a granary keep food out of
// their reach (settlement/stock.js exposedFood). A kikimora comes only by night (`spoils`), and goes
// for a carcass in the woods first.
import {SPECIES} from '../../data/species.js';
import {cellOf, walkable, inBounds, inMap} from '../../world/grid.js';
import {T, BY_CODE} from '../../data/terrain.js';
import {follow, bolt, nearFire, escapeHeat, approach, sameLand} from '../movement.js';
import {kill} from '../agent.js';
import {nibble} from '../../settlement/stock.js';
import {smellCarcass} from '../carcass.js';
import {log} from '../../core/log.js';
import {nightness} from '../../core/time.js';
import {esc, g} from '../../core/util.js';
import {tempAt} from '../../world/heat.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const VERMIN = {
  den: [7, 13],     // the hiding place is this many cells from the camp fire…
  watch: 5,         // …and it waits while someone awake is this close to the stores,
  patience: 160,    // …but not longer than this: then it makes a dash for the food anyway
  grab: 100,        // a raid on the stores lasts this long, then it runs back to its hole
};

// a hiding place: brush or wood a little way off the camp, outside the settlement zone if it can
function denOf(w, a) {
  if (a.den) return a.den;
  let best = null, bv = -Infinity;
  for (let k = 0; k < 40; k++) {
    const ang = w.rngs.wild() * Math.PI * 2, r = VERMIN.den[0] + w.rngs.wild() * (VERMIN.den[1] - VERMIN.den[0]);
    const x = w.camp.x + 0.5 + Math.cos(ang) * r, y = w.camp.y + 0.5 + Math.sin(ang) * r;
    if (!inMap(w, x, y)) continue;
    const i = (y | 0) * w.w + (x | 0);
    if (!walkable(w, i) || !sameLand(w, a, i)) continue;
    const v = (BY_CODE[w.grid.terr[i]].shelter || w.grid.bush[i] ? 2 : 0) + (w.zone[i] ? 0 : 1) + w.rngs.wild() * 0.5;
    if (v > bv) { bv = v; best = [x, y]; }
  }
  return (a.den = best || [w.camp.x + 0.5 + VERMIN.den[0], w.camp.y + 0.5]);
}

export const verminBrain = {
  id: 'vermin',
  step(w, a) {
    const sp = SPECIES.get(a.species), V = sp.vermin, Tc = tempAt(w, cellOf(w, a));
    // a kikimora is seen only up close (agents/combat.js): colonists do not chase her across the map
    if (V.veil != null) a.veil = V.veil;
    if (Tc > sp.heatHarm || nearFire(w, a, 1)) { escapeHeat(w, a, 1.2); return; }
    let near = null;
    for (const o of w.agents) if (o.faction === 'colony' && !o.dead && !o.sleeping && dist(o, a) < V.flee) { near = o; break; }
    if (near) {
      if (dist(near, a) < 0.8 && w.rngs.wild() < V.caught) {
        kill(w, a, 'палки', near);
        if (!sp.resident && w.rngs.wild() < 0.3) log(w, `<b>${esc(near.name)}</b> ${g(near, 'прибил', 'прибила')} ${sp.labelAcc || sp.label} у припасов.`, 'wildlife');
        return;
      }
      a.task = {id: 'bolt'}; a.waited = w.tick; bolt(w, a, [near], 1.3); return;
    }
    // a raid that is under way runs its course (unless someone comes close, above)
    const t = a.task?.id === 'nibble' ? a.task : null;
    if (t?.at != null && w.tick - t.at >= VERMIN.grab) { a.task = {id: 'hide'}; a.waited = w.tick; }
    // otherwise wait in the hole while the stores are watched — till patience runs out
    // (a kikimora keeps to the marsh while it is light, whatever happens)
    if (a.task?.id !== 'nibble') {
      const camp = {x: w.camp.x + 0.5, y: w.camp.y + 0.5};
      const watched = w.agents.some(o => o.faction === 'colony' && !o.dead && !o.sleeping && dist(o, camp) < VERMIN.watch);
      const bold = w.tick - (a.waited ?? w.tick) > VERMIN.patience;
      if ((V.spoils && nightness(w.tick) < 0.4) || (watched && !bold) || (a.task?.id === 'hide' && w.tick - (a.waited ?? 0) < 60)) {
        a.waited ??= w.tick;
        const [dx, dy] = denOf(w, a);
        if (a.task?.id !== 'hide') a.task = {id: 'hide'};
        if (dist(a, {x: dx, y: dy}) > 0.6 && approach(w, a, dx, dy, 0.9) === null) a.den = null;   // no way there: find another hole
        return;
      }
      a.task = {id: 'nibble'};
    }
    // a kikimora would rather spoil a carcass in the woods than risk the camp: she hastens its rot
    // (agents/carcass.js: an old carcass in the dark may raise an upyr)
    if (V.spoils) {
      const c = smellCarcass(w, a, 25);
      if (c) {
        if (dist(a, c) > 0.9) { if (approach(w, a, c.x, c.y, 0.9) === null) a.task = {id: 'hide'}; }
        else { c.food = Math.max(0, c.food - 0.003); c.t -= 4; }
        return;
      }
    }
    if (follow(w, a, 'camp') === 'arrived') {
      a.task.at ??= w.tick;
      nibble(w, V.eats);
      if (V.spoils && w.tick - (w.lastSpoil || -1e9) > 300) { w.lastSpoil = w.tick; log(w, `Ночью у припасов шебуршала ${sp.label}: часть еды испорчена.`, 'wildlife', 'notice'); }
    }
  },
};
