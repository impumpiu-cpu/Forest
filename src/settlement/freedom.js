// From captive to former slave to member (docs/CAPTIVES.md; numbers: data/captives.js FREEDOM).
//   - At the evening council (once it is over) a resigned captive with enough service — days at a master's side
//     (settlement/masters.js), a plot told (settlement/escape.js) — is freed, when the master who taught it last
//     vouches for it (its liking of the captive). The bonds come off (shackles back to the store): a former slave,
//     a.former = {since, bond, fought}.
//   - A former slave goes beyond the zone on peaceful work, but holds no weapon and no armour (a tool and
//     clothes, agents/equipment.js), takes no flag, no watch, no seat at the council; it answers a blow and cries.
//   - Its tie to the colony (bond) moves at dawn: fed and healthy up, hungry or badly hurt down. At the council,
//     with a weak bond, it may walk away — as a companion would.
//   - One who fought in a red alarm is made a full member at the next council.
import {FREEDOM, BONDS} from '../data/captives.js';
import {opinion} from '../data/relations.js';
import {SPECIES} from '../data/species.js';
import {COUNCIL} from '../data/colony.js';
import {colonists, raidAlarm} from './query.js';
import {raidOnBoard} from './board.js';
import {leave} from './life.js';
import {hpShare} from '../agents/agent.js';
import {refreshBody} from '../agents/special.js';
import {liveById} from '../agents/lookup.js';
import {think} from '../agents/mind.js';
import {log} from '../core/log.js';
import {esc, g, clamp} from '../core/util.js';
import {hourOf, dayOf} from '../core/time.js';
import {setStanding} from '../agents/standing.js';

const F = FREEDOM;
const name = a => `<b>${esc(a.name)}</b>`;
export const formers = w => colonists(w).filter(a => a.former && !a.dead);
const tally = w => (w.chronicle.captives ||= {taken: 0, died: 0});

// the bonds come off
export function freeCaptive(w, a, by) {
  const B = BONDS.has(a.captive.bonds) ? BONDS.get(a.captive.bonds) : null;
  if (B?.back) w.stock[B.resource] = (w.stock[B.resource] || 0) + B.n;
  const mul = a.own?.mul; if (mul) { delete mul.hunger; delete mul.work; }   // the captives' ration is over
  setStanding(a, 'former', {since: w.tick, bond: F.bond.start, fought: false, was: a.captive.was || null, service: a.captive.service || 0});
  refreshBody(a);
  if (w.scratch) delete w.scratch.colonists;
  tally(w).freed = (tally(w).freed || 0) + 1;
  const r = w.chronicle.people?.find(p => p.id === a.id); if (r) { r.captive = false; r.former = true; }
  think(w, a, 'freedFromBonds', {name: by?.name});
  log(w, `Совет снял путы с ${name(a)}: ${by ? `за ${g(a, 'него', 'неё')} поручился ${name(by)}, ` : ''}${g(a, 'бывший пленный', 'бывшая пленная')} (${SPECIES.get(a.species).label}) теперь ${g(a, 'бывший раб', 'бывшая рабыня')} — без оружия, но ходит, куда велит работа.`, 'council', 'notice');
}

// a former slave made a full member
function makeMember(w, a) {
  setStanding(a, 'colonist');   // a member now: the full standing
  if (w.scratch) delete w.scratch.colonists;
  tally(w).members = (tally(w).members || 0) + 1;
  const r = w.chronicle.people?.find(p => p.id === a.id); if (r) r.former = false;
  think(w, a, 'madeMember');
  log(w, `${name(a)} ${g(a, 'бился', 'билась')} за поселение в налёте: совет принял ${g(a, 'его', 'её')} полноправным членом.`, 'council', 'notice');
}

function council(w) {
  // freed: a resigned captive with service, the master who taught it vouching
  for (const a of colonists(w).filter(x => x.captive && !x.dead && !x.downed)) {
    const C = a.captive;
    if (!C.resigned || (C.service || 0) < F.free) continue;
    const by = C.teacher != null ? liveById(w, C.teacher) : null;
    if (!by?.master || opinion(by, a) < F.vouch) continue;
    freeCaptive(w, a, by);
  }
  for (const a of formers(w)) {
    if (a.downed) continue;
    if (a.former.fought) { makeMember(w, a); continue; }
    const b = a.former.bond;
    if (b < F.bond.stay && w.rngs.colony() < F.bond.leave * (1 - b) ** 2) { tally(w).formerLeft = (tally(w).formerLeft || 0) + 1; leave(w, a); }
  }
}

// once a tick (sim.js): the bond at dawn, the council, who fought in a red alarm
export function stepFreedom(w) {
  const fs = formers(w), S = (w.freedom ??= {dawn: -1, council: -1});
  const day = dayOf(w.tick, w), h = hourOf(w.tick, w);
  if (!w.light && S.council !== day && h >= COUNCIL.from && w.council?.lastDay === day) { S.council = day; council(w); }
  if (!fs.length) return;
  if (h >= 6 && S.dawn !== day) {
    S.dawn = day;
    for (const a of fs) {
      const B = F.bond; let d = B.day;
      if ((a.needs.food ?? 1) < 0.3) d += B.hungry;
      if (hpShare(a) < 0.5) d += B.hurt;
      if ((a.needs.food ?? 1) > 0.6 && hpShare(a) > 0.8) d += B.content;
      a.former.bond = clamp(a.former.bond + d, 0, 1);
    }
  }
  if (raidAlarm(w) || raidOnBoard(w)) for (const a of fs) if (a.task?.id === 'fight' && a.task.target?.faction === 'raiders') a.former.fought = true;
}

export const formerText = a => (a.former ? (a.gender === 'f' ? 'бывшая рабыня' : 'бывший раб') : '');
