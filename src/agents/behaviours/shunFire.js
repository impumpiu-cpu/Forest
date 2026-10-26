// Shun fire: a beast with no fear of anything else still runs from fire (the shared `bolt` task in the `fire`
// mode) — a mule, a rat, the nechist, a tame goat. The grazers' `bolt` and the predators' `scare` carry their
// own fire check. Reads: nothing of its own.
import {shunsHeat} from '../movement.js';
import {FIRE} from '../../data/behaviour.js';

export const shunFire = {
  want(w, a, {sp, T}) {
    return shunsHeat(w, a, sp, T, FIRE.near) ? [[{id: 'bolt', mode: 'fire', pace: FIRE.pace}, FIRE.want, () => 'огонь рядом']] : null;
  },
};
