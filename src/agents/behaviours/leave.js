// Leave: now and then a wild beast wanders off the map for good (`leaveChance` a tick), and once it has
// set off it goes on to the edge whatever the hour. The walk itself is the shared `leave` task
// (agents/tasks.js: raiders, caravans and beasts all go the same way). Reads: leaveChance.
import {WANT} from '../../data/behaviour.js';

export const leave = {
  want(w, a, {sp}) {
    // the roll is made only while not yet leaving: one that has set off keeps going
    return a.task?.id === 'leave' || w.rngs.wild() < sp.leaveChance ? [[{id: 'leave'}, WANT.leave, () => 'уходит с карты']] : null;
  },
};
