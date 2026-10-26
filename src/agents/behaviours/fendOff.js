// Fend off: a tamed beast with a beast of prey or a raider right here (any of the bestiary's hunters, not only
// wolves) — a mule turns and kicks where it stands (the shared `maul` task in the `kick` mode, `stay`: no pursuit),
// a goat runs (`bolt`). Reads: nothing of its own (the species' `mule` block says which it is).
import {SPECIES, isPredator} from '../../data/species.js';
import {nearAgents} from '../spatial.js';
import {PEN} from '../../data/behaviour.js';
import {dist} from '../../core/util.js';


export const fendOff = {
  want(w, a, {sp}) {
    const foe = nearAgents(w, a.x, a.y, PEN.foeNear).find(o => !o.dead && (isPredator(SPECIES.get(o.species)) || o.faction === 'raiders') && dist(o, a) < PEN.foeNear);
    if (!foe) return null;
    if (sp.mule) return dist(foe, a) < sp.mule.kickRange ? [[{id: 'maul', mode: 'kick', target: foe, mule: true, stay: true}, PEN.want.foe, () => `лягает: ${SPECIES.get(foe.species).label}`]] : null;
    return [[{id: 'bolt', mode: 'from', from: [foe], sprint: PEN.flee, drain: 0}, PEN.want.foe, () => `бежит: ${SPECIES.get(foe.species).label}`]];
  },
};
