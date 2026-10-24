// Alert: a herd beast at the herd's alarm that its own nerve does not yet send running (agents/wildHerd.js):
// heads up, standing still, until the alarm passes or comes closer. Reads: herd.
import {recover} from '../movement.js';
import {herdOf, herdAlarm} from '../wildHerd.js';
import {WANT} from '../../data/behaviour.js';

export const alert = {
  want(w, a) {
    return herdAlarm(w, herdOf(w, a)) ? [[{id: 'alert'}, WANT.alert, () => 'тревога стада: смотрит']] : null;
  },
  step(w, a) { recover(a); },
};
