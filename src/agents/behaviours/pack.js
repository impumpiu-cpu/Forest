// Pack: a pack mule ({owner: a trader's id}, settlement/trade.js) walks behind its trader and carries the caravan's
// crates (a.load); when its trader is gone it heads for the map edge (the shared `leave` task). Reads: nothing of
// its own (a.owner marks the beast).
import {approach} from '../movement.js';
import {liveById} from '../lookup.js';
import {endTask} from '../lifecycle.js';
import {STAND} from '../../data/behaviour.js';

export const pack = {
  want(w, a) {
    if (a.owner == null) return null;
    return liveById(w, a.owner) ? [[{id: 'pack'}, STAND.want.pack, () => 'идёт за купцом']] : [[{id: 'leave'}, STAND.want.pack, () => 'купца нет: уходит']];
  },
  step(w, a) {
    const o = liveById(w, a.owner), P = STAND.pack;
    if (!o) { endTask(w, a); return; }
    const k = a.slot ?? 0, ang = P.angle + k * P.step;
    const tx = o.x + Math.cos(ang) * P.at, ty = o.y + Math.sin(ang) * P.at;
    if (Math.hypot(tx - a.x, ty - a.y) > P.off && approach(w, a, tx, ty, Math.hypot(a.x - o.x, a.y - o.y) > P.hurry ? P.hurryPace : P.pace) === null) approach(w, a, o.x, o.y, P.catchUp);
  },
};
