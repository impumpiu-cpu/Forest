// Expand: a brood out of a strong lair founds a new one.
//   the lair (ctx.role 'lair', atlas/lairs.js): in spring, a lair stronger than LAIR_LIFE.breedAt and older than breedAge,
//     with its kind's chance (`breed`; a calamity's boss's lair breeds more), while its kind has fewer than max × crowdMax
//     lairs (a boss's: × bossCrowd); the brood walks (or flies) to a spot found in broodTries tries and costs the mother
//     lair × broodCost of its strength; it founds the lair when it gets there, if the spot is still free (brood party).
//   the leader (ctx.role 'leader'): leads the brood out itself (LEADER.expand) — the daughter lair is its vassal.
import {LEADER, LAIR_LIFE as LL} from '../../data/lairs.js';
import {CAL} from '../../data/calamities.js';
import {SPECIES} from '../../data/species.js';
import {newLair, findSpot, wherePhrase, groundFits, hideIfWild, pourBrood, R, G, acc} from '../lairs.js';
import {sendParty} from '../parties.js';
import {leaderName} from '../leaders.js';
import {dist} from './shared.js';

const ofKind = (a, L) => a.lairs.filter(o => o.alive && o.kind === L.id).length;
// a spot is still free when the brood arrives: no lair of the kind within two territories, the ground not built over
const spotFree = (a, L, i) => !a.lairs.some(o => o.alive && o.kind === L.id && dist(o, {x: i % a.w, y: (i / a.w) | 0}) < 2 * R(a, L)) && groundFits(a, L, i);

export const expand = {
  want(a, l, {L, role, season, r}) {
    if (role === 'lair') {
      if (season !== 'spring' || l.leader || l.strength <= LL.breedAt || a.hist.year - l.born < LL.breedAge) return null;
      const boss = l.boss != null;
      if (!(r() < L.breed * (boss ? CAL.boss.breed : 1)) || ofKind(a, L) >= L.max * (boss ? LL.bossCrowd : LL.crowdMax)) return null;
      const i = findSpot(a, L, r, l, LL.broodTries);
      return i >= 0 ? [[{goal: i}, 1, () => 'весна, логово сильно: выводок']] : null;
    }
    const X = LEADER.expand;
    if (!(l.strength > X.from && ofKind(a, L) < L.max * X.crowd)) return null;
    const i = findSpot(a, L, r, l, 60);
    return i >= 0 ? [[{goal: i}, LEADER.plans.expand, () => 'логово сильно, своих ещё немного']] : null;
  },
  // the lair without a leader: the brood sets out (no line: the founding is told when it gets there)
  act(a, l, plan, {L}) {
    if (sendParty(a, 'brood', l.i, plan.goal, {owner: l.id, plan: 'expand', lairKind: L.id, speed: L.flies ? 'flight' : L.riders ? 'rider' : 'foot', label: `выводок: ${SPECIES.get(L.species).plural}`, color: L.color})) l.strength *= LL.broodCost;
    return null;
  },
  arrive(a, p, l, L, rnd, say) {
    if (!spotFree(a, L, p.goal)) return;   // another brood got there first, or a town grew over the spot
    if (p.kind !== 'leader') {
      // a brood is a migration (data/lairs.js LAIR_FIELD): its own kind's lair, and its folk poured out over the land
      const at = wherePhrase(a, p.goal), young = hideIfWild(a, newLair(a, L, p.goal, rnd, LL.broodStart));
      pourBrood(a, p.goal, L);
      if (young.hidden) { say(`Молодые ${SPECIES.get(L.species).plural} ${L.from} «${l ? l.name : '…'}» ушли в глушь ${at} и основали там ${G[L.g].fresh} ${acc(L)}: где — не знает ни одна держава.`); return; }
      say(`Молодые ${SPECIES.get(L.species).plural} ${L.from} «${l ? l.name : '…'}» основали ${G[L.g].fresh} ${acc(L)} — «${young.name}» ${wherePhrase(a, p.goal)}.`);
      return;
    }
    const young = hideIfWild(a, newLair(a, L, p.goal, rnd, LEADER.young));
    young.lord = l.id; l.strength *= LEADER.expand.cost; l.leader.deeds++;
    say(`${leaderName(l)} увёл молодых из «${l.name}» и основал «${young.name}» ${wherePhrase(a, p.goal)}: новое логово под его рукой.`);
  },
};
