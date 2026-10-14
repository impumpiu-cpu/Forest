// The outpost's region (data/regions.js), rolled once from the world seed on its own random stream,
// so it does not change the rest of a world made from the same seed. Every system asks it through
// the helpers here: an ore, a beast or a wild bed the region does not have simply is not there.
import {mulberry, seedNumber} from '../core/rng.js';
import {REGIONS, LEVELS, REGION_SHIFT, LEGACY_REGION} from '../data/regions.js';

// mithril and magma never appear where the kind of land has none; everything else may
const RARE = new Set(['mithril']);
const shift = (rnd, v, key) => {
  if (rnd() >= REGION_SHIFT || (v === 0 && RARE.has(key))) return v;
  const k = LEVELS.indexOf(v), up = rnd() < 0.5;
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, k + (up ? 1 : -1)))] ?? v;
};

export function rollRegion(seed) {
  const rnd = mulberry(seedNumber(String(seed) + ':region'));
  const all = REGIONS.all(), total = all.reduce((s, r) => s + r.weight, 0);
  let x = rnd() * total, t = all[0];
  for (const r of all) { x -= r.weight; if (x <= 0) { t = r; break; } }
  const levels = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, shift(rnd, v, k)]));
  const reg = {id: t.id, label: t.label, note: t.note, ores: levels(t.ores), placer: shift(rnd, t.placer),
    goldVein: t.goldVein, magma: t.magma, road: t.road, fauna: levels(t.fauna), flora: levels(t.flora)};
  // everyone needs a way to live: some game or goats
  if (!reg.fauna.deer && !reg.fauna.goat) reg.fauna.deer = 0.5;
  return reg;
}

export const region = w => w.region || LEGACY_REGION;
export const oreLevel = (w, oreId) => region(w).ores[oreId] ?? 0;
export const faunaLevel = (w, sp) => region(w).fauna[sp] ?? 1;   // unlisted beasts (hares, rats) come everywhere
export const floraLevel = (w, id) => (id === 'placer' ? region(w).placer : region(w).flora[id] ?? 1);

// older saves: the land they were made on
export function ensureRegion(w) { w.region ??= {...LEGACY_REGION}; }
