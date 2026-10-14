// Vermin brain (rats): sneak to the camp stock and nibble the food lying in the open; dart away from
// anyone close; a colonist who gets right next to one may kill it. Pots and a granary keep food out
// of their reach (settlement/stock.js exposedFood). Winter cold in the open thins them out.
import {SPECIES} from '../../data/species.js';
import {cellOf} from '../../world/grid.js';
import {follow, bolt, nearFire, escapeHeat} from '../movement.js';
import {kill} from '../agent.js';
import {nibble} from '../../settlement/stock.js';
import {log} from '../../core/log.js';
import {nightness} from '../../core/time.js';
import {esc, g} from '../../core/util.js';

export const verminBrain = {
  id: 'vermin',
  step(w, a) {
    const sp = SPECIES.get(a.species), V = sp.vermin, T = w.grid.temp[cellOf(w, a)];
    if (T > sp.heatHarm || nearFire(w, a, 1)) { escapeHeat(w, a, 1.2); return; }
    let near = null;
    for (const o of w.agents) if (o.faction === 'colony' && !o.dead && Math.hypot(o.x - a.x, o.y - a.y) < V.flee) { near = o; break; }
    if (near) {
      if (Math.hypot(near.x - a.x, near.y - a.y) < 0.8 && w.rng() < V.caught) {
        kill(w, a, 'палки', near);
        if (!sp.resident && w.rng() < 0.3) log(w, `<b>${esc(near.name)}</b> ${g(near, 'прибил', 'прибила')} ${sp.labelAcc || sp.label} у припасов.`, 'wildlife');
        return;
      }
      a.task = {id: 'bolt'}; bolt(w, a, [near], 1.3); return;
    }
    // a kikimora does her mischief by night and keeps to the marsh by day
    if (V.spoils && nightness(w.tick) < 0.4) { a.task = {id: 'hide'}; follow(w, a, 'edge'); return; }
    a.task = {id: 'nibble'};
    if (follow(w, a, 'camp') === 'arrived') {
      nibble(w, V.eats);
      if (V.spoils && w.tick - (w.lastSpoil || -1e9) > 300) { w.lastSpoil = w.tick; log(w, `Ночью у припасов шебуршала ${sp.label}: часть еды испорчена.`, 'wildlife', 'notice'); }
    }
  },
};
