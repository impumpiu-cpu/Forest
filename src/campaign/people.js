// The company's evening: those who are not the core — the hired go when their term is up, the joined may go any day;
// the captives' and the masters' evening. Out of campaign/march.js.
import {NORM} from '../data/special.js';
import {CAMPAIGN} from '../data/campaign.js';
import {LOYALTY, MARKET, CONTRACT} from '../data/market.js';
import {room} from './company.js';
import {assign} from './baggage.js';
import {captivesEvening, freedomEvening} from './captives.js';
import {nameCaravanMasters} from './masters.js';
import {alive, core, isCore, rank, say} from './march.js';

// those who are not the core: the hired go when their term is up, the joined may go any day
export function people(a, K, r) {
  captivesEvening(a, K, r, (text, kind, who) => say(a, K, text, kind, false, who));   // the captives' evening (campaign/captives.js)
  nameCaravanMasters(K, (text, kind, who) => say(a, K, text, kind, false, who));   // the caravan's masters (campaign/masters.js)
  freedomEvening(a, K, (text, kind, who) => say(a, K, text, kind, false, who));   // captives freed, former slaves taken in (campaign/captives.js)
  // the best talker of those who lead keeps the joined: charm × (Charisma − 5)
  const charm = LOYALTY.charm * (Math.max(NORM, ...core(K).map(m => m.special?.C ?? NORM)) - NORM);
  for (const m of alive(K)) {
    if (isCore(m)) continue;
    if (m.contract) { contractDay(a, K, m, r); continue; }
    if (m.loyalty == null || m.loyalty >= 1) continue;
    // a day with the caravan: hunger, a bad wound, the sight of captives on a cut ration — and the leader's word
    const d = LOYALTY.daily + (K.hungry ? LOYALTY.hungry : 0) + (m.hp < 0.5 ? LOYALTY.hurt : 0) + (K.captiveCut ? LOYALTY.cruel : 0) + charm;
    m.loyalty = Math.max(0, Math.min(1, m.loyalty + d));
    if (r() < LOYALTY.leave * (1 - m.loyalty) ** 2) leave(a, K, m, `${m.name}, ${rank(K, m)}, ${K.hungry ? `не вынес${m.gender === 'f' ? 'ла' : ''} голода и` : 'однажды утром'} ${m.gender === 'f' ? 'ушла' : 'ушёл'} своей дорогой`);
    else if (m.loyalty >= 1) say(a, K, `${m.name} теперь свой${m.gender === 'f' ? '' : ''}: идёт с караваном до конца.`, 'people');
  }
}
// a hireling's day (data/market.js CONTRACT): the opinion of the service moves; a bad one may desert; at the end
// of the term it stays for good, asks for another term, or goes
function contractDay(a, K, m, r) {
  const C = CONTRACT, c = m.contract, f = m.gender === 'f';
  c.opinion = Math.max(0, Math.min(1, (c.opinion ?? C.start) + C.daily + (K.hungry ? C.hungry : 0) + (m.hp < 0.5 ? C.hurt : 0)));
  if (K.day < c.until) {
    if (c.opinion < C.desert && r() < C.deserts) { K.stats.deserted = (K.stats.deserted || 0) + 1; leave(a, K, m, `${m.name}, ${rank(K, m)}, не дождал${f ? 'ась' : 'ся'} конца срока и сбежал${f ? 'а' : ''}: служба ${f ? 'ей' : 'ему'} опостылела`); }
    return;
  }
  if (c.opinion >= C.stay && !room(K, 'stay')) {   // it would stay, but the joined are full: it goes with thanks
    K.stats.stayFull = (K.stats.stayFull || 0) + 1;
    leave(a, K, m, `${m.name}, ${rank(K, m)}, отслужил${f ? 'а' : ''} срок и остал${f ? 'ась' : 'ся'} бы с караваном, но места в отряде нет: ${f ? 'ушла' : 'ушёл'} с благодарностью`);
    return;
  }
  if (c.opinion >= C.stay) {
    m.contract = null; m.loyalty = 1; K.stats.stayed = (K.stats.stayed || 0) + 1;
    say(a, K, `${m.name}, ${rank(K, m)}, отслужил${f ? 'а' : ''} срок и остал${f ? 'ась' : 'ся'} с караваном без платы: теперь ${f ? 'своя' : 'свой'}.`, 'people', false, [m.id]);
    return;
  }
  const cost = Math.round(c.wage * C.days * 10) / 10, keep = alive(K).length * CAMPAIGN.ration * MARKET.ration * C.reserve;
  if (c.opinion >= C.extend && K.gold - cost >= keep) {
    K.gold = Math.round((K.gold - cost) * 10) / 10; c.until = K.day + C.days; K.stats.extended = (K.stats.extended || 0) + 1;
    say(a, K, `${m.name}, ${rank(K, m)}, попросил${f ? 'а' : ''} продлить службу: ещё ${C.days} дней за ${cost} зол.`, 'people', false, [m.id]);
    return;
  }
  leave(a, K, m, `${m.name}, ${rank(K, m)}, отслужил${f ? 'а' : ''} срок и ${f ? 'ушла' : 'ушёл'}${c.opinion >= C.extend ? ': продлить было нечем' : ''}`);
}
function leave(a, K, m, text) {
  m.alive = false; m.ride = null; m.left = {day: K.day, year: a.hist.year};
  say(a, K, text + '.', 'leave'); assign(K);
}
export const shake = (K, d) => {
  for (const m of alive(K)) if (m.loyalty != null && m.loyalty < 1) m.loyalty = Math.max(0, Math.min(1, m.loyalty + d));
  // hirelings: a won fight speaks for the service, a lost one against it (data/market.js CONTRACT)
  for (const m of alive(K)) if (m.contract) m.contract.opinion = Math.max(0, Math.min(1, (m.contract.opinion ?? CONTRACT.start) + (d > 0 ? CONTRACT.won : CONTRACT.lost)));
};
