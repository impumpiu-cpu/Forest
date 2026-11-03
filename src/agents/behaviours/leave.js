// Leave: now and then a wild beast wanders off the map for good (`leaveChance` a tick), and once it has
// set off it goes on to the edge whatever the hour; one that hibernates leaves for the winter. The walk itself is
// the shared `leave` task (agents/tasks.js: raiders, caravans and beasts all go the same way). Reads: leaveChance.
import {WANT} from '../../data/behaviour.js';
import {season} from '../../data/seasons.js';
import {chancePerTick} from '../hunting.js';

export const leave = {
  want(w, a, {sp}) {
    // the roll is made only while not yet leaving: one that has set off keeps going
    if (a.task?.id === 'leave' || w.rngs.wild() < chancePerTick(w, a, 'leave', sp.leaveChance)) return [[{id: 'leave'}, WANT.leave, () => 'уходит с карты']];
    // a bear goes to its den for the winter (`hibernates`, data/migrations.js keeps it away till spring)
    return sp.hibernates && season(w).id === 'winter' ? [[{id: 'leave'}, WANT.leave, () => 'зима: в берлогу']] : null;
  },
};
