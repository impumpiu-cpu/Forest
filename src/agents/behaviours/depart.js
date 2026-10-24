// Depart: someone who left the outpost (settlement/life.js) walks off the map and is gone — the shared `leave` task,
// offered whatever happens. Reads: nothing.
import {WANT} from '../../data/behaviour.js';

export const depart = {
  want(w, a) { return [[a.task?.id === 'leave' ? a.task : {id: 'leave'}, WANT.leave, () => 'уходит из поселения']]; },
};
