// The caravan's name among the realms, the tongue it trades in, and the pace it keeps (docs/NRI.md, этап 8; the
// numbers: data/road.js, data/tongues.js).
//   termsOf(a, K, t)        — × the town's prices {buy, sell}: its tongue, the caravan's fame and infamy with its realm
//   famed(a, K, kind, realm) — a fight won ('win', the realm of the nearest town) or a captive sold ('slaveSale')
//   choosePace(a, K)        — the pace for the day (data/road.js PACE_RULES)
// With every number of data/road.js and data/tongues.js at its default the terms are 1 and the pace normal.
import {REPUTATION, PACES, PACE_RULES} from '../data/road.js';
import {TONGUE, shareTongue} from '../data/tongues.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {free} from './captives.js';
import {dangers} from './land.js';

const fameOf = (K, realm) => K.fame?.[realm] || {fame: 0, infamy: 0};

export function termsOf(a, K, t) {
  const race = t?.people && WORLD_PEOPLES.has(t.people) ? WORLD_PEOPLES.get(t.people).race : null;
  const mute = race && !shareTongue(free(K).map(m => m.race), race) ? TONGUE.barrier : 0;
  const R = fameOf(K, t?.realm), rep = REPUTATION.fameDiscount * R.fame - REPUTATION.infamyMarkup * R.infamy;
  return {buy: (1 + mute) * (1 - rep), sell: (1 - mute) * (1 + rep)};
}

// the realm of the nearest living town within REPUTATION.near cells, or null
function realmNear(a, K) {
  let best = null, bd = REPUTATION.near;
  for (const t of a.towns || []) {
    if (!t.alive || !t.realm) continue;
    const d = Math.hypot(t.x - K.x, t.y - K.y);
    if (d <= bd) { bd = d; best = t.realm; }
  }
  return best;
}
export function famed(a, K, kind, realm = null) {
  const id = realm ?? (kind === 'win' ? realmNear(a, K) : null);
  if (id == null) return;
  const R = (K.fame ||= {})[id] ||= {fame: 0, infamy: 0};
  if (kind === 'win') R.fame = Math.min(REPUTATION.max, R.fame + REPUTATION.win);
  if (kind === 'slaveSale') R.infamy = Math.min(REPUTATION.max, R.infamy + REPUTATION.slaveSale);
}

export function choosePace(a, K) {
  if (PACE_RULES.pursued === 'normal' && PACE_RULES.danger === 'normal') return 'normal';
  if ((K.bubble?.things || []).some(x => x.pursuit)) return PACE_RULES.pursued;   // a band on the crown's trail (campaign/quest.js)
  const ds = dangers(a, K.i), worst = ds.reduce((m, d) => Math.max(m, d.strength ?? 0), 0);
  return worst > PACE_RULES.dangerAt ? PACE_RULES.danger : 'normal';
}
export const paceOf = K => PACES.get(K.pace || 'normal');
