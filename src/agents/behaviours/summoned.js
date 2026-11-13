// A forest beast called into a fight (agents/summon.js): it goes for the nearest foe of its caller's side — whoever the
// side is at war with, or whoever is on one of its people — and when none has been near for SUMMON.quiet ticks it goes
// back to the wood (the shared `leave` task). Reads: a.summoned.
import {SUMMON} from '../../data/roles.js';
import {isHostile} from '../../data/factions.js';
import {nearAgents} from '../spatial.js';
import {isAttack, ours} from '../lookup.js';   // (the caller's side: a colony's called beasts stand with the colony)


export const summoned = {
  want(w, a) {
    const S = a.summoned; if (!S) return null;
    let foe = null, best = Infinity;
    for (const o of nearAgents(w, a.x, a.y, SUMMON.sight)) {
      if (o === a || o.dead || o.downed || o.captive) continue;
      if (!(isHostile(a, o) || (isAttack(o.task) && ours(a, o.task.target)))) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < best) { best = d; foe = o; }
    }
    if (foe) {
      S.last = w.tick;
      const task = a.task?.id === 'fight' && a.task.target === foe ? a.task : {id: 'fight', target: foe};
      return [[task, SUMMON.want.fight, () => `бьётся на стороне призвавшего: ${foe.name}`]];
    }
    if (!S.keep && w.tick - S.last > SUMMON.quiet) return [[a.task?.id === 'leave' ? a.task : {id: 'leave'}, SUMMON.want.leave, () => 'бой кончился: уходит в лес']];
    return null;
  },
};
