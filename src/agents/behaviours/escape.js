// Escape: a captive running away (settlement/escape.js) makes for the map's edge as fast as its bonds let it; over the
// edge — got away; no way to the edge for a long while — lost in the wilds, gone all the same. Reads: nothing of its own (a.fugitive).
import {follow} from '../movement.js';
import {gotAway} from '../../settlement/escape.js';
import {ESCAPE} from '../../data/captives.js';

export const escape = {
  want(w, a) { return [[a.task?.id === 'escape' ? a.task : {id: 'escape'}, 1, () => 'бежит из плена']]; },
  step(w, a) {
    if (follow(w, a, 'edge', ESCAPE.runPace * (a.fugitive?.slow ?? 1)) === 'arrived' || w.tick - (a.fugitive?.since ?? w.tick) > ESCAPE.lost) gotAway(w, a);
  },
};
