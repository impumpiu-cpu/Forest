// Defend the caravan: a guard answers anyone going for the caravan within reach — a foe of the caravan's people, a wolf
// or an angry mule at the caravan's beasts (the shared `fight` task). Reads: nothing of its own (a.caravan).
import {nearestHostile} from '../combat.js';
import {CARAVAN} from '../../data/behaviour.js';

export const defendCaravan = {
  want(w, a) {
    const c = w.caravan, G = CARAVAN.guard; if (!c) return null;
    const e = nearestHostile(w, a, G.sight) || w.agents.find(o => !o.dead && o.task?.target?.caravan === c.id && (o.task.id === 'maul' || o.task.id === 'chase') && Math.hypot(o.x - a.x, o.y - a.y) < G.help);   // scan: only the few caravan guards ask, and only while their caravan is set upon
    return e ? [[a.task?.id === 'fight' && a.task.target === e ? a.task : {id: 'fight', target: e}, CARAVAN.want.fight, () => `защищает караван: ${e.name}`]] : null;
  },
};
