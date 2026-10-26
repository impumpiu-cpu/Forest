// Peddle: the trader walks in from the map edge and stops a few cells short of the fire, waiting now and then for the
// slow mules so that the caravan arrives together (not for one stuck behind water for an hour); then it keeps to that
// spot through the camp, the trading and the night (settlement/trade.js runs the visit). Never fights. The task
// `travel` wears the phase as its mode. Reads: nothing of its own (w.caravan).
import {cellOf} from '../../world/grid.js';
import {follow, moveToward} from '../movement.js';
import {CARAVAN} from '../../data/behaviour.js';

export const peddle = {
  want(w, a) {
    const c = w.caravan; if (!c) return null;
    const mode = c.phase === 'coming' ? undefined : c.phase;
    const t = a.task?.id === 'travel' ? a.task : {id: 'travel'};
    return [[Object.assign(t, {mode}), CARAVAN.want.stay, () => ({trading: 'торгует', night: 'ночует у костра', camp: 'стоит лагерем'}[c.phase] || 'идёт к лагерю')]];
  },
  step(w, a, t) {
    const c = w.caravan; if (!c) return;
    if (c.phase === 'coming') {
      const d = w.nav.get('camp')[cellOf(w, a)];
      if (d <= CARAVAN.campAt) { c.arrived = w.tick; c.spot = [a.x, a.y]; return; }
      const late = w.agents.some(o => o.caravan === c.id && !o.dead && Math.hypot(o.x - a.x, o.y - a.y) > CARAVAN.lateFar);   // scan: the caravan leader only, waiting for stragglers
      if (late) { c.lateSince ??= w.tick; if (w.tick - c.lateSince < CARAVAN.lateWait) return; } else c.lateSince = null;
      // no way to the camp at all is no arrival: settlement/trade.js sends the caravan away
      if (follow(w, a, 'camp', CARAVAN.pace) === 'none') c.noPath = (c.noPath || 0) + 1; else c.noPath = 0;
      return;
    }
    if (c.spot) moveToward(w, a, c.spot[0], c.spot[1], CARAVAN.spotPace);
  },
};
