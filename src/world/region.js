// The outpost's region (data/regions.js), rolled once from the world seed on its own random stream,
// so it does not change the rest of a world made from the same seed. Every system asks it through
// the helpers here: an ore, a beast or a wild bed the region does not have simply is not there.
import {mulberry, seedNumber} from '../core/rng.js';
import {REGIONS, LEVELS, REGION_SHIFT, LEGACY_REGION} from '../data/regions.js';
import {RARITY, FAUNA_FLOOR} from '../data/biomes.js';
import {SPECIES} from '../data/species.js';

// mithril and magma never appear where the kind of land has none; everything else may
const RARE = new Set(['mithril']);
const shift = (rnd, v, key) => {
  if (rnd() >= REGION_SHIFT || (v === 0 && RARE.has(key))) return v;
  const k = LEVELS.indexOf(v), up = rnd() < 0.5;
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, k + (up ? 1 : -1)))] ?? v;
};

// biome shares move by up to a third either way, then add up to 1 again
function rollBiomes(rnd, biomes) {
  const out = {};
  for (const [b, v] of Object.entries(biomes)) out[b] = v * (1 + (rnd() * 2 - 1) / 3);
  const sum = Object.values(out).reduce((t, v) => t + v, 0);
  for (const b of Object.keys(out)) out[b] = Math.round(out[b] / sum * 100) / 100;
  return out;
}

// how many of a beast a mix of biomes holds: Σ share × rarity in that biome
export function faunaFrom(biomes, sp) {
  const hab = SPECIES.get(sp).habitat;
  if (!hab) return 1;   // hares and rats live everywhere
  let v = 0;
  for (const [b, r] of Object.entries(hab)) v += (biomes[b] || 0) * RARITY[r].mul;
  return v;
}

export function rollRegion(seed) {
  const rnd = mulberry(seedNumber(String(seed) + ':region'));
  const all = REGIONS.all(), total = all.reduce((s, r) => s + r.weight, 0);
  let x = rnd() * total, t = all[0];
  for (const r of all) { x -= r.weight; if (x <= 0) { t = r; break; } }
  const levels = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, shift(rnd, v, k)]));
  const reg = {id: t.id, label: t.label, note: t.note, ores: levels(t.ores), placer: shift(rnd, t.placer),
    goldVein: t.goldVein, magma: t.magma, road: t.road, biomes: rollBiomes(rnd, t.biomes), flora: levels(t.flora), faunaShift: {}};
  // two valleys of one kind still differ: each beast a little more or less common
  for (const sp of SPECIES.filter(s => s.habitat)) reg.faunaShift[sp.id] = Math.round((0.7 + rnd() * 0.6) * 100) / 100;
  // everyone needs a way to live: some game or goats
  reg.extra = {};
  if (faunaLevel({region: reg}, 'deer') <= 0 && faunaLevel({region: reg}, 'goat') <= 0) reg.extra.deer = 0.5;
  return reg;
}

export const region = w => w.region || LEGACY_REGION;
export const oreLevel = (w, oreId) => region(w).ores[oreId] ?? 0;
// how common a beast is here: 0 — it does not live in this land at all.
// Saves from before biomes keep the levels they had for the old beasts (`fauna`).
export function faunaLevel(w, sp) {
  const r = region(w);
  if (r.fauna && sp in r.fauna) return r.fauna[sp];
  const v = faunaFrom(r.biomes || {}, sp) * (r.faunaShift?.[sp] ?? 1);
  return Math.max(v < FAUNA_FLOOR ? 0 : v, r.extra?.[sp] || 0);
}
// every beast of the region with its level, most common first (for the panel)
export const regionFauna = w => SPECIES.filter(s => s.habitat).map(s => [s, faunaLevel(w, s.id)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
export const floraLevel = (w, id) => (id === 'placer' ? region(w).placer : region(w).flora[id] ?? 1);

// older saves: the land they were made on
export function ensureRegion(w) {
  w.region ??= {...LEGACY_REGION};
  // saves from before biomes: the shares of their kind of land (the old beasts keep their `fauna` levels)
  w.region.biomes ??= {...(REGIONS.has(w.region.id) ? REGIONS.get(w.region.id).biomes : LEGACY_REGION.biomes)};
}
