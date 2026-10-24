// Flee fire: one of the people runs from heat and from fire close by (the shared `flee` task, agents/tasks.js), whatever
// it was doing; the mindless dead walk into fire. The thresholds are the role's (`fire` of agents/brains/index.js; a
// raider's by default): a colonist fighting a fire holds out a little longer. Reads: nothing of its own.
import {nearFire} from '../movement.js';
import {hpShare} from '../agent.js';
import {think} from '../mind.js';
import {RAID} from '../../data/behaviour.js';

export const fleeFire = {
  want(w, a, {sp, T, brain}) {
    if (sp.mindless) return null;
    const F = brain.fire || RAID.fire, fleeing = a.task?.id === 'flee';
    const hot = a.task?.id === 'douse' ? T > F.douseHeat || hpShare(a) < F.douseHp : T > F.heat || nearFire(w, a, F.near);
    if (!hot) return null;
    if (!fleeing && a.task?.id !== 'douse' && a.diary) think(w, a, 'fledFire');
    return [[fleeing ? a.task : {id: 'flee'}, RAID.want.fire, () => 'огонь рядом']];
  },
};
