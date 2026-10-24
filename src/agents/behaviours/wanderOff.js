// Wander off: a starving pack with no prey in sight may leave for other hunting grounds — the leader rolls for
// it, and the whole pack goes (the shared `leave` task). Reads: predator {prey, sight, wanderOff}.
import {SPECIES} from '../../data/species.js';
import {log} from '../../core/log.js';
import {packOf, boldness, nearest} from '../hunting.js';
import {PROWL} from '../../data/behaviour.js';

export const wanderOff = {
  want(w, a, {sp}) {
    const P = sp.predator;
    if (packOf(w, a)[0] !== a || a.task?.id === 'leave') return null;
    if (boldness(a, P) > PROWL.wanderBold && !nearest(w, a, P.prey, P.sight) && w.rngs.wild() < P.wanderOff) return [[{id: 'leave', pace: PROWL.leavePace}, PROWL.want.wander, () => 'ни следа добычи']];
    return null;
  },
  // taken: the pack follows its leader off the map
  pick(w, a) {
    for (const m of packOf(w, a)) if (m !== a) m.task = {id: 'leave', pace: PROWL.leavePace};
    const sp = SPECIES.get(a.species);
    log(w, `Голодные ${sp.plural || sp.label} ушли искать другие угодья.`, 'wildlife');
  },
};
