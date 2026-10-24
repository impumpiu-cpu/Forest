// Flee fire: one of the people runs from heat and from fire close by (the shared `flee` task, agents/tasks.js), whatever
// it was doing; the mindless dead walk into fire. Reads: nothing of its own.
import {nearFire} from '../movement.js';
import {RAID} from '../../data/behaviour.js';

export const fleeFire = {
  want(w, a, {sp, T}) {
    if (sp.mindless) return null;
    return T > RAID.fire.heat || nearFire(w, a, RAID.fire.near) ? [[a.task?.id === 'flee' ? a.task : {id: 'flee'}, RAID.want.fire, () => 'огонь рядом']] : null;
  },
};
