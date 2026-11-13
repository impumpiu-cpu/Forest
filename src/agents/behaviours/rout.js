// Rout: one whose morale broke runs (agents/morale.js, data/morale.js MORALE; plan claude/combat-plan.md Бой-1). A raider, a
// beast — off the map, its band's plan or none (the shared `leave`); one of the caravan or the settlement — to its own, the
// fire or the zone (`runHome`). It runs until it rallies: its morale back, no foe close.
import {fleeing} from '../morale.js';
import {MORALE} from '../../data/morale.js';

export const rout = {
  want(w, a) {
    if (!fleeing(a)) return null;
    const home = a.faction === 'colony';
    const t = home ? (a.task?.id === 'runHome' ? a.task : {id: 'runHome'}) : (a.task?.id === 'leave' ? a.task : {id: 'leave', rout: true});
    return [[t, MORALE.want, () => (a.morale?.last?.why ? `дрогнул: ${a.morale.last.why}` : 'дрогнул и бежит')]];
  },
};
