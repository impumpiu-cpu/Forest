// A captive running away (settlement/escape.js): for the map's edge, as fast as its bonds let it.
import {follow} from '../movement.js';
import {stepDowned} from '../wounds.js';
import {gotAway} from '../../settlement/escape.js';

export const fugitiveBrain = {
  id: 'fugitive',
  step(w, a) {
    if (a.downed) { a.task = {id: 'downed'}; stepDowned(w, a); return; }
    a.task = {id: 'escape'};
    if (follow(w, a, 'edge', 1.15 * (a.fugitive?.slow ?? 1)) === 'arrived') gotAway(w, a);
    if (a.cd > 0) a.cd--;
  },
};
