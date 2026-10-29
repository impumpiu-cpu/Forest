// Who may still join the caravan (docs/CAMPAIGN.md, «Отряд: наём и пополнение»; numbers: data/market.js, data/captives.js).
// One answer for every way in: a hireling for a term, a companion from a town, the freed from a foe's camp, a
// captive freed into a former slave, a hireling who stays for good, a captive bound or bought.
//   the free (everyone but the captives, the eight included) — at most COMPANY_MAX;
//   the joined (companions, the freed, former slaves, hirelings who stayed: all who keep by loyalty) — at most JOINED_MAX;
//   hirelings — at most HIRES.max of each kind;
//   captives — at most CAPTIVE.max, outside the company's count.
import {isFighter} from '../data/campaign.js';
import {COMPANY_MAX, JOINED_MAX, HIRES} from '../data/market.js';
import {CAPTIVE} from '../data/captives.js';

const living = K => K.members.filter(m => m.alive);
export const freeOf = K => living(K).filter(m => !m.captive);
export const heldOf = K => living(K).filter(m => m.captive);
// the joined: those who stay by loyalty (not the eight, not a hireling under contract)
const core = m => m.core ?? isFighter(m);   // saves from before the joiners
export const joinedOf = K => freeOf(K).filter(m => !core(m) && !m.contract && m.loyalty != null);

// A member's place in the company (docs/BEHAVIOUR.md «Словарь»: место в дружине) and its record go together: a captive
// has its bonds (m.captive), a former slave the time since they came off (m.former). setPlace() changes both at once,
// so the place and the record cannot disagree; any other place clears both records.
export function setPlace(m, place, record = null) {
  m.role = place;
  m.captive = place === 'captive' ? record : null;
  m.former = place === 'former' ? record : null;
  if ((place === 'captive' || place === 'former') && !record) throw new Error(`place: a ${place} without its record`);
}

// is there room for one more of this kind?
//   kind: 'hire:<role>' (a hireling), 'joined' (a companion, the freed), 'former' (a captive freed — already
//   among the members, so it takes a free place and a joined one), 'stay' (a hireling who stays for good — already
//   among the free, it takes a joined place), 'captive'
export function room(K, kind) {
  const free = freeOf(K).length, joined = joinedOf(K).length;
  if (kind === 'captive') return heldOf(K).length < CAPTIVE.max;
  if (kind === 'stay') return joined < JOINED_MAX;
  if (kind === 'former') return free < COMPANY_MAX && joined < JOINED_MAX;
  if (kind === 'joined') return free < COMPANY_MAX && joined < JOINED_MAX;
  if (kind.startsWith('hire:')) {
    const role = kind.slice(5);
    return free < COMPANY_MAX && living(K).filter(m => m.role === role && m.contract).length < HIRES.max;
  }
  throw new Error(`room: unknown kind ${kind}`);
}
