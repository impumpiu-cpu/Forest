// The caravan's name among the realms, the tongue it trades in, and the pace it keeps (docs/CAMPAIGN.md; the
// numbers: data/road.js, data/tongues.js).
//   termsOf(a, K, t)        — × the town's prices {buy, sell}: its tongue, the caravan's fame and infamy with its realm
//   famed(a, K, kind, realm) — a fight won ('win', the realm of the nearest town) or a captive sold ('slaveSale')
//   choosePace(a, K)        — the pace for the day (data/road.js PACE_RULES)
// With every number of data/road.js and data/tongues.js at its default the terms are 1 and the pace normal.
import {kitOf} from '../data/transport.js';
import {REPUTATION, PACES, PACE_RULES, TERMS} from '../data/road.js';
import {TONGUE, shareTongue} from '../data/tongues.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {free} from './captives.js';
import {dangers} from './land.js';
import {scaleOf} from '../atlas/index.js';
import {allowed} from '../data/commands.js';

const fameOf = (K, realm) => K.fame?.[realm] || {fame: 0, infamy: 0};

export function termsOf(a, K, t) {
  const race = t?.people && WORLD_PEOPLES.has(t.people) ? WORLD_PEOPLES.get(t.people).race : null;
  const mute = race && !shareTongue(free(K).map(m => m.race), race) ? TONGUE.barrier : 0;
  const R = fameOf(K, t?.realm), rep = REPUTATION.fameDiscount * R.fame - REPUTATION.infamyMarkup * R.infamy;
  // clamped, so no number makes a town pay the caravan to buy, or refuse every sale (1 — as before)
  const m = Math.min(TERMS.max, Math.max(0, mute)), r = Math.min(TERMS.max, Math.max(-TERMS.max, rep));
  const T = kitOf(K).trade || {};   // (the humans trade a little better: data/transport.js PEOPLE_KIT)
  return {buy: (1 + m) * (1 - r) * (T.buy ?? 1), sell: (1 - m) * (1 + r) * (T.sell ?? 1)};
}

// the realm of the nearest living town within REPUTATION.near cells, or null
function realmNear(a, K) {
  let best = null, bd = REPUTATION.near * scaleOf(a);   // cells of a 192-high world, as every campaign distance
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

// the decision point `caravan.pace` (data/commands.js): a rule — the commands `caravan.pace.pursued` and `.danger`, each keeping
// its pace of PACE_RULES; one the run's profile switches off keeps the normal pace
export function choosePace(a, K) {
  if (PACE_RULES.pursued === 'normal' && PACE_RULES.danger === 'normal') return 'normal';
  if (allowed(a?.cfg, 'caravan.pace.pursued') && (K.bubble?.things || []).some(x => x.pursuit)) return PACE_RULES.pursued;   // a band on the crown's trail (campaign/quest.js)
  if (!allowed(a?.cfg, 'caravan.pace.danger')) return 'normal';
  const ds = dangers(a, K.i, K), worst = ds.reduce((m, d) => Math.max(m, d.strength ?? 0), 0);
  return worst > PACE_RULES.dangerAt ? PACE_RULES.danger : 'normal';
}
export const paceOf = K => PACES.get(K.pace || 'normal');
