// Shun fire: a beast with no fear of anything else still runs from fire (the shared `bolt` task in the `fire`
// mode). The grazers' `bolt` and the predators' `scare` carry their own fire check. Reads: nothing of its own.
import {shunsHeat} from '../movement.js';
import {STAND} from '../../data/behaviour.js';

export const shunFire = {
  want(w, a, {sp, T}) {
    return shunsHeat(w, a, sp, T, STAND.fire.near) ? [[{id: 'bolt', mode: 'fire', pace: STAND.fire.pace}, STAND.want.fire, () => 'огонь рядом']] : null;
  },
};
