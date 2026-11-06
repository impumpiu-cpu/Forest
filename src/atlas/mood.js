// The mood of a town (docs/WORLD.md «Довольство»; the numbers: data/peoples.js TOWN_LIFE.mood): how content its people are,
// 0 … 100 (t.mood, saved; a new town at `start`). After Unknown Horizons' happiness and Emberfall's morale: not worked out anew
// each season but a store that moves — each season `pace` of the way to where the season's life points: 100 × the weighted
// share of its people's basic needs met, their comfort, and how well its food fed them last spring (t.fed). The weights go by
// the town's step (`w[step]`: a hamlet asks only to be fed); a people may have its own (data/peoples.js `mood`, by step). The
// realm's edict of taxes adds to where it points (TOWN_MONEY.tax.mood). The town's growth goes by it (moodGrow), its step
// (atlas/peoples.js), and its pull on the movers (atlas/demography.js)
import {TOWN_LIFE} from '../data/peoples.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {TOWN_MONEY} from '../data/townBuildings.js';

const T = () => TOWN_LIFE.mood;
export const moodOf = t => t.mood ?? T().start;
// where a town's season points (0 … 100), and the season's step toward it
export function moodAim(t, a = null) {
  const w = T().w, W = {...w[Math.min(t.tier || 0, w.length - 1)], ...(WORLD_PEOPLES.get(t.people)?.mood?.[t.tier || 0] || {})}, has = {basic: t.needs?.basic ?? 1, comfort: t.needs?.comfort ?? 1, food: t.fed ?? 1};
  let sum = 0, all = 0;
  for (const [k, w] of Object.entries(W)) { sum += w * Math.max(0, Math.min(1, has[k] ?? 1)); all += w; }
  // the realm's edict of taxes weighs on it (TOWN_MONEY.tax.mood, after Unknown Horizons: heavy taxes sour the people, light
  // ones please them)
  const R = a && t.realm != null ? (a.realms || []).find(r => r.id === t.realm) : null, tax = TOWN_MONEY.tax.mood[R?.kingdom?.edicts?.taxes] || 0;
  return Math.max(0, Math.min(100, (all > 0 ? 100 * sum / all : T().start) + tax));
}
export function moodStep(t, a = null) {
  const m = moodOf(t), to = moodAim(t, a);
  t.mood = Math.round((m + (to - m) * T().pace) * 10) / 10;
  return t.mood;
}
// × a town's growth by its mood: 1 + `grow` × (mood − `mid`) / 50 — a content town grows the faster, a sore one the slower; a town
// over its target dies off the faster the sorer it is (`shrinking`)
export function moodGrow(t, shrinking = false) {
  const k = 1 + T().grow * (moodOf(t) - T().mid) / 50;
  return Math.max(0, shrinking ? 2 - k : k);
}
