// Expand: a brood led out of a strong lair to found a daughter lair that holds to the leader as a vassal.
import {LEADER} from '../../data/lairs.js';
import {newLair, findSpot, wherePhrase, groundFits, R} from '../lairs.js';
import {leaderName} from '../leaders.js';
import {dist} from './shared.js';

export const expand = {
  want(a, l, {L, r}) {
    const X = LEADER.expand;
    if (!(l.strength > X.from && a.lairs.filter(o => o.alive && o.kind === L.id).length < L.max * X.crowd)) return null;
    const i = findSpot(a, L, r, l, 60);
    return i >= 0 ? [[{plan: 'expand', goal: i}, LEADER.plans.expand, () => 'логово сильно, своих ещё немного']] : null;
  },
  arrive(a, p, l, L, rnd, say) {
    if (!groundFits(a, L, p.goal) || a.lairs.some(o => o.alive && o.kind === L.id && dist(o, {x: p.goal % a.w, y: (p.goal / a.w) | 0}) < 2 * R(a, L))) return;
    const young = newLair(a, L, p.goal, rnd, LEADER.young);
    young.lord = l.id; l.strength *= LEADER.expand.cost; l.leader.deeds++;
    say(`${leaderName(l)} увёл молодых из «${l.name}» и основал «${young.name}» ${wherePhrase(a, p.goal)}: новое логово под его рукой.`);
  },
};
