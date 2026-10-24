// Rest: sit still through the night (nightness above GRAZE.restAt, or the species' own `restAt`) and get one's
// breath back; in the `winded` mode (catchBreath) a predator out of breath lies down and breathes deep. Reads: nothing of its own.
import {recover} from '../movement.js';
import {GRAZE, WANT} from '../../data/behaviour.js';

export const rest = {
  want(w, a, {night, sp}) {
    return night > (sp.restAt ?? GRAZE.restAt) ? [[{id: 'rest'}, WANT.rest, () => 'ночь']] : null;
  },
  step(w, a, t) { recover(a); if (t.mode === 'winded') { recover(a); recover(a); } },
};
