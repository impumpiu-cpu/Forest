// The caravan trades in captives in towns (docs/CAPTIVES.md; numbers: data/slavery.js).
// The town's people decide the law: where it is banned, nobody buys or sells; where it is frowned on, a sale
// costs the town's realm's goodwill to the caravan's realm; where it is legal, a town sometimes has a captive
// to sell. The caravan sells an unruly captive, or any when its food runs short — never one that has earned
// enough service to be close to freedom; it buys one while it has bonds, room and gold beyond its food money. A sale is taken ill by
// the company: former slaves, companions and the freed lose loyalty, hirelings think less of the service, the
// captives left grow readier to run.
import {SLAVE, captivePrice, lawOf} from '../data/slavery.js';
import {CAPTIVE, ESCAPE} from '../data/captives.js';
import {STANDING} from '../data/market.js';
import {CAMPAIGN} from '../data/campaign.js';
import {SPECIES} from '../data/species.js';
import {relation} from '../atlas/diplomacy.js';
import {free, held, bondsSets, mouths} from './captives.js';
import {makeMember, draw} from './start.js';
import {bestBonds} from '../data/captives.js';
import {assign} from './baggage.js';
import {famed} from './road.js';

const gold = v => Math.round(v * 10) / 10;
const clamp01 = v => Math.max(0, Math.min(1, v));
const gw = (m, a, b) => (m.gender === 'f' ? b : a);
export const priceOf = m => captivePrice({hp: m.hp, S: m.special?.S ?? 5, skill: m.local?.skill, resigned: !!m.captive?.resigned, will: m.captive?.will ?? ESCAPE.will.start});

function upset(K) {
  const U = SLAVE.upset;
  for (const m of K.members) {
    if (!m.alive || m.captive) continue;
    if (m.former && m.loyalty != null) m.loyalty = clamp01(m.loyalty + U.former);
    else if (m.loyalty != null && m.loyalty < 1) m.loyalty = clamp01(m.loyalty + U.joined);
    if (m.contract) m.contract.opinion = clamp01((m.contract.opinion ?? 0.5) + U.hired);
  }
  for (const m of held(K)) if (!m.captive.resigned) m.captive.will = clamp01((m.captive.will ?? ESCAPE.will.start) + U.fear);
}

// a visit's trade in captives; → the lines for the town's journal entry
export function tradeCaptives(a, K, t, st) {
  const L = lawOf(t.people), parts = [];
  if (L.law === 'banned' || !held(K).length && !bondsSets(K)) return parts;
  const {r, done} = draw(K, 'slaves');
  try { return deal(a, K, t, st, L, r, parts); } finally { done(); }
}
function deal(a, K, t, st, L, r, parts) {
  // sell: the unruly, or anyone not resigned when the food runs short; never one close to freedom
  const short = K.food < mouths(K) * CAMPAIGN.ration * SLAVE.sell.foodDays;
  for (const m of held(K)) {
    if ((m.captive.service || 0) >= SLAVE.sell.service) continue;   // close to freedom: kept
    if (!short && (m.captive.resigned || (m.captive.will ?? 0) < SLAVE.sell.will)) continue;   // an unruly one, or anyone when food runs short
    const p = gold(priceOf(m) * L.k * STANDING[st].sell);
    m.alive = false; m.ride = null; m.left = {day: K.day, year: a.hist.year, sold: true};
    K.gold = gold(K.gold + p); K.stats.sold = (K.stats.sold || 0) + 1; famed(a, K, 'slaveSale', t.realm);   // infamy with the town's realm (campaign/road.js)
    parts.push(`${gw(m, 'продали пленного', 'продали пленную')} ${m.name} (${SPECIES.get(m.race).label}) за ${p} зол.`);
    // where it is frowned on, the town's realm thinks less of the caravan's
    if (L.law === 'frowned' && t.realm && K.realm && t.realm !== K.realm) { const rel = relation(a, K.realm, t.realm); if (rel) rel.att = Math.max(-5, rel.att + L.att); }
    upset(K);
  }
  if (parts.length) assign(K);
  // buy: where it is legal, now and then one is offered
  if (L.law !== 'legal' || r() >= SLAVE.buy.offer) return parts;
  if (held(K).length >= Math.min(CAPTIVE.max, SLAVE.buy.want) || bondsSets(K) < 1) return parts;
  const p = gold(captivePrice({hp: 1, S: 5, will: SLAVE.buy.will}) * L.k * SLAVE.buy.mark * STANDING[st].buy);
  const keep = free(K).length * CAMPAIGN.ration * 6 * 0.3;   // about a week of food money left over
  if (K.gold - p < keep) return parts;
  const R = SLAVE.buy.races, race = R[(r() * R.length) | 0];
  const B = bestBonds(K.cargo); K.cargo[B.resource] -= B.n; if (K.cargo[B.resource] <= 0) delete K.cargo[B.resource];
  const m = makeMember(K, r, {race, role: 'captive', gear: CAPTIVE.campaign.gear, captive: {since: K.day, bonds: B.id, from: 'bought', will: SLAVE.buy.will}});
  K.members.push(m); K.gold = gold(K.gold - p); K.stats.bought = (K.stats.bought || 0) + 1;
  parts.push(`${gw(m, 'купили пленного', 'купили пленную')} ${m.name} (${SPECIES.get(race).label}) за ${p} зол.`);
  assign(K);
  return parts;
}

