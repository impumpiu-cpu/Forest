// Leave hurt: a predator badly wounded leaves the woods for good (the pack's leader says so in the log), and a
// night hunter (`nocturnal`) goes at sunrise; once on its way it keeps going. The walk is the shared `leave`
// task. Reads: predator.
import {maxHp} from '../agent.js';
import {holdsGround} from '../auras.js';
import {log} from '../../core/log.js';
import {packOf} from '../hunting.js';
import {PROWL} from '../../data/behaviour.js';
import {SPECIES} from '../../data/species.js';
import {hasMorale, inFight} from '../morale.js';

export const leaveHurt = {
  want(w, a, {sp, night}) {
    const going = a.task?.id === 'leave';
    if (sp.nocturnal && night < PROWL.dawn) return [[{id: 'leave', pace: PROWL.leavePace}, PROWL.want.leave, () => 'рассвело: ночному охотнику пора']];
    if (going) return [[a.task, PROWL.want.leave, () => 'уходит']];
    if ((!hasMorale(a) || !inFight(w, a)) && a.hp < maxHp(a) * PROWL.hurtBelow && !holdsGround(w, a)) {   // (one with a morale breaks by it: agents/behaviours/rout.js)   // (a boss's aura: agents/auras.js)
      return [[{id: 'leave', pace: PROWL.leavePace, hurt: true}, PROWL.want.leave, () => 'тяжело ранен']];
    }
    return null;
  },
  // taken: the pack's leader tells it once (not each tick the offer is weighed)
  pick(w, a, t) { if (t?.hurt && packOf(w, a)[0] === a) { const sp = SPECIES.get(a.species); log(w, `Раненые ${sp.plural || sp.label} уходят из леса.`, 'wildlife'); } },
};
