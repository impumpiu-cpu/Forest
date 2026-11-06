// The mood of a town (docs/WORLD.md «Довольство»; the numbers: data/peoples.js TOWN_LIFE.mood): how content its people are,
// 0 … 100 (t.mood, saved; a new town at `start`). After Unknown Horizons' happiness and Emberfall's morale: not worked out anew
// each season but a store that moves — each season `pace` of the way to where the season's life points: 100 × the weighted
// share of its people's basic needs met, their comfort, and how well its food fed them last spring (t.fed). The weights go by
// the town's step (`w[step]`: a hamlet asks only to be fed); a people may have its own (data/peoples.js `mood`, by step). The
// town's growth goes by it (moodGrow), and its pull on the movers (atlas/demography.js)
import {TOWN_LIFE} from '../data/peoples.js';
import {WORLD_PEOPLES} from '../data/peoples.js';

const T = () => TOWN_LIFE.mood;
export const moodOf = t => t.mood ?? T().start;
// where a town's season points (0 … 100), and the season's step toward it
export function moodAim(t) {
  const w = T().w, W = {...w[Math.min(t.tier || 0, w.length - 1)], ...(WORLD_PEOPLES.get(t.people)?.mood?.[t.tier || 0] || {})}, has = {basic: t.needs?.basic ?? 1, comfort: t.needs?.comfort ?? 1, food: t.fed ?? 1};
  let sum = 0, all = 0;
  for (const [k, w] of Object.entries(W)) { sum += w * Math.max(0, Math.min(1, has[k] ?? 1)); all += w; }
  return all > 0 ? 100 * sum / all : T().start;
}
export function moodStep(t) {
  const m = moodOf(t), to = moodAim(t);
  t.mood = Math.round((m + (to - m) * T().pace) * 10) / 10;
  return t.mood;
}
// × a town's growth by its mood: 1 + `grow` × (mood − `mid`) / 50 — a content town grows the faster, a sore one the slower; a town
// over its target dies off the faster the sorer it is (`shrinking`)
export function moodGrow(t, shrinking = false) {
  const k = 1 + T().grow * (moodOf(t) - T().mid) / 50;
  return Math.max(0, shrinking ? 2 - k : k);
}
