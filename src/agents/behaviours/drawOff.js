// Draw off: a herd beast that does not bolt (an elk) steps away from whatever the herd's alarm names that has come
// too close for its nerve (agents/wildHerd.js); the rest of the alarm it meets standing alert. Reads: herd {alert}.
import {SPECIES} from '../../data/species.js';
import {bolt as run} from '../movement.js';
import {herdOf, herdAlarm, nerveOf} from '../wildHerd.js';
import {STAND} from '../../data/behaviour.js';

const near = (w, a, sp) => { const al = herdAlarm(w, herdOf(w, a)); return al ? al.threats.filter(o => Math.hypot(a.x - o.x, a.y - o.y) < sp.herd.alert / nerveOf(w, a)) : []; };

export const drawOff = {
  want(w, a, {sp}) {
    return near(w, a, sp).length ? [[{id: 'drawOff'}, STAND.want.drawOff, () => 'опасность слишком близко к стаду']] : null;
  },
  step(w, a) {
    const from = near(w, a, SPECIES.get(a.species));
    if (from.length) run(w, a, from, STAND.drawOff);
  },
};
