// Subdue and rival: the lairs near a leader's own (LEADER.subdue.reach territories) that have no leader, no lord and no
// boss — a rival kind (the lair kind's `rivals`) is gone to war on, any other is brought under the hand: a vassal pays
// tribute every year. Both are settled by might on arrival: the stronger wins; a beaten leader may fall.
import {cap1} from '../../core/util.js';
import {LAIRS, LEADER} from '../../data/lairs.js';
import {SPECIES} from '../../data/species.js';
import {power, R, wherePhrase} from '../lairs.js';
import {leaderFalls, leaderName} from '../leaders.js';
import {dist} from './shared.js';


// the lairs a leader may go to, nearest first, split into rivals and the meek
function neighbours(a, l, L) {
  const sub = (a.lairs || []).filter(o => o.alive && o !== l && o.boss == null && !o.leader && o.lord == null && !LAIRS.get(o.kind).dragon && !LAIRS.get(o.kind).domain && LAIRS.get(o.kind).at !== 'town'
    && dist(o, l) <= LEADER.subdue.reach * (R(a, L) + R(a, LAIRS.get(o.kind))));
  const near = (p, q) => dist(p, l) - dist(q, l);
  return {rivals: sub.filter(o => L.rivals.includes(o.kind)).sort(near), meek: sub.filter(o => !L.rivals.includes(o.kind)).sort(near)};
}

// the fight at the other lair: a vassal taken, a rival beaten or wiped out, or a beating
function settle(a, p, l, L, rnd, say) {
  const o = a.lairs.find(x => x.id === p.target), Lo = o && LAIRS.get(o.kind);
  if (!o?.alive || o.leader || o.boss != null) return;
  const who = leaderName(l), theirs = o.strength * power(Lo.species) * (Lo.might || 1) * (LEADER.luck[0] + LEADER.luck[1] * rnd());
  if (p.plan === 'subdue' && p.might >= theirs * LEADER.subdue.ratio) {
    o.lord = l.id; l.leader.deeds++;
    say(`${who} из «${l.name}» подчинил «${o.name}»: ${SPECIES.get(Lo.species).plural} оттуда платят ему данью.`);
  } else if (p.might >= theirs) {
    o.strength *= LEADER.beat; l.leader.deeds++;
    if (o.strength < LEADER.wiped) { o.alive = false; o.died = a.hist.year; say(`${who} из «${l.name}» разорил «${o.name}» ${wherePhrase(a, o.i)}.`); }
    else say(`${who} из «${l.name}» разбил ${SPECIES.get(Lo.species).plural} «${o.name}» и отогнал их.`);
  } else {
    l.strength *= LEADER.beatenCost;
    say(`${cap1(SPECIES.get(Lo.species).plural)} «${o.name}» отбились от ${l.leader.title[1].toLowerCase()} ${l.leader.name}.`);
    if (rnd() < LEADER.fall) leaderFalls(a, l, 'beaten', say);
  }
}

export const subdue = {
  want(a, l, {L, role}) {
    if (role !== 'leader') return null;   // a lair without a leader takes no vassals
    const o = neighbours(a, l, L).meek[0];
    return o ? [[{plan: 'subdue', goal: o.i, target: o.id}, LEADER.plans.subdue, () => `слабый сосед: «${o.name}»`]] : null;
  },
  arrive: settle,
};

export const rival = {
  want(a, l, {L, role}) {
    if (role !== 'leader') return null;   // without a leader the rivals' fights are the lairs' own system (atlas/lairs.js)
    const o = neighbours(a, l, L).rivals[0];
    return o ? [[{plan: 'rival', goal: o.i, target: o.id}, LEADER.plans.rival, () => `соперник рядом: «${o.name}»`]] : null;
  },
  arrive: settle,
};
