// A captive running away (settlement/escape.js): for the map's edge, as fast as its bonds let it.
import {follow} from '../movement.js';
import {stepDowned} from '../wounds.js';
import {gotAway} from '../../settlement/escape.js';
import {ESCAPE} from '../../data/captives.js';

export const fugitiveBrain = {
  id: 'fugitive',
  step(w, a) {
    if (a.downed) { a.task = {id: 'downed'}; stepDowned(w, a); return; }
    a.task = {id: 'escape'};
    // over the edge — got away; no way to the edge for a long while — lost in the wilds, gone all the same
    if (follow(w, a, 'edge', 1.15 * (a.fugitive?.slow ?? 1)) === 'arrived' || w.tick - (a.fugitive?.since ?? w.tick) > ESCAPE.lost) gotAway(w, a);
    if (a.cd > 0) a.cd--;
  },
};
