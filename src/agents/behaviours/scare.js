// Scare: what drives a predator off — fire (it bolts from the heat), a crowd of people (more when starving),
// the settlement zone (it roams uphill away from it, farther at night and from a lit camp, closer when
// starving; one already at a person's throat is not held off). Offers the shared `bolt` and `roam` tasks.
// Reads: predator {sprint, stamina, groupFear, victims, zoneShy, zoneShyNight}.
import {matchesKind} from '../../data/species.js';
import {cellOf} from '../../world/grid.js';
import {shunsHeat} from '../movement.js';
import {nearAgents} from '../spatial.js';
import {holdsGround} from '../auras.js';
import {boldness, dist} from '../hunting.js';
import {PROWL} from '../../data/behaviour.js';

export const scare = {
  want(w, a, {sp, T, night}) {
    const P = sp.predator, W = PROWL.want;
    if (shunsHeat(w, a, sp, T, PROWL.fire.near)) return [[{id: 'bolt', mode: 'fire', pace: PROWL.fire.pace}, W.fire, () => 'огонь рядом']];
    const b = boldness(a, P);
    const people = nearAgents(w, a.x, a.y, PROWL.peopleNear).filter(o => !o.dead && matchesKind(o.species, P.victims) && dist(o, a) < PROWL.peopleNear);
    if (people.length >= P.groupFear + Math.floor(b * PROWL.crowdBold) && !holdsGround(w, a)) return [[{id: 'bolt', mode: 'from', from: people, sprint: P.sprint, drain: P.stamina}, W.crowd, () => `людей рядом: ${people.length}`]];
    const shy = (night > PROWL.nightLit || w.campLit ? P.zoneShyNight : P.zoneShy) * (1 - PROWL.boldZone * b);
    if (w.nav.get('zone')[cellOf(w, a)] < shy && a.task?.id !== 'maul') return [[{id: 'roam', mode: 'shy'}, W.zone, () => 'слишком близко к поселению']];
    return null;
  },
};
