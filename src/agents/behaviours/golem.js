// A golem of the colony or the caravan (data/constructs.js, agents/golem.js): it stands at its post — the golem forge
// that made it, the caravan's camp — and goes for any foe of its side that comes within its sight or falls on one of its
// own; with no foe it walks back to the post. It never runs (tag «Механизм»). At a forge it is mended (`always`).
// Reads: a.post {x, y}.
import {GOLEM_GUARD} from '../../data/constructs.js';
import {nearestHostile} from '../combat.js';
import {nearAgents} from '../spatial.js';
import {approach} from '../movement.js';
import {mendAtForge} from '../golem.js';

const ours = (a, o) => o.faction === a.faction || (a.faction === 'allies' && o.faction === 'colony');

export const golem = {
  want(w, a) {
    const G = GOLEM_GUARD;
    let foe = nearestHostile(w, a, G.sight);
    if (!foe) for (const o of nearAgents(w, a.x, a.y, G.help)) {
      if (!o.dead && !o.downed && o.task?.target && ours(a, o.task.target) && (o.task.id === 'fight' || o.task.id === 'maul')) { foe = o; break; }
    }
    if (foe) return [[a.task?.id === 'fight' && a.task.target === foe ? a.task : {id: 'fight', target: foe}, G.want.fight, () => `бьётся за своих: ${foe.name}`]];
    return [[a.task?.id === 'golem' ? a.task : {id: 'golem'}, G.want.post, () => 'стоит на посту']];
  },
  step(w, a) {
    const p = a.post; if (!p) return;
    if (Math.hypot(p.x - a.x, p.y - a.y) > GOLEM_GUARD.off) approach(w, a, p.x, p.y);
  },
  always(w, a) { mendAtForge(w, a); },
};
