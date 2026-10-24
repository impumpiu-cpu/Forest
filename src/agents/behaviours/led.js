// Led: a tame beast a raider who looted the camp leads away (campaign/camp.js, a.ledBy): it follows him and is gone
// with him; the thief fallen, the beast stays and is livestock again. Reads: nothing of its own.
import {approach} from '../movement.js';
import {liveById, agentById} from '../lookup.js';
import {PEN} from '../../data/behaviour.js';

export const led = {
  want(w, a) { return [[a.task?.id === 'led' ? a.task : {id: 'led'}, 1, () => 'уводит налётчик']]; },
  step(w, a) {
    const r = agentById(w, a.ledBy);
    if (!r || r.dead) { a.brain = 'livestock'; a.ledBy = null; a.task = null; return; }   // the thief fell: the beast stays
    if (r.gone) { a.gone = true; a.stolen = true; return; }
    if (Math.hypot(r.x - a.x, r.y - a.y) > PEN.ledNear) approach(w, a, r.x, r.y, PEN.ledPace);
  },
};
