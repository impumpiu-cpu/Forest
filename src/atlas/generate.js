// The world map (atlas). A separate core from the local map (src/world/): no screen, no browser.
// The two meet later through outside/ — the atlas becomes the provider behind the border and each of
// its cells becomes the region of a local map (docs/WORLD.md, «Шов»).
//
// The atlas is made stage by stage (atlas/stages.js) so the screen can draw and write the chronicle
// after each one; generateAtlas runs them all at once (tests, headless).
import {mulberry, seedNumber} from '../core/rng.js';
import {ATLAS_SIZES} from '../data/atlas.js';
import {ATLAS_STAGES} from './stages.js';

export function newAtlas(cfg) {
  const {w, h} = ATLAS_SIZES[cfg.size];
  return {cfg: {...cfg}, w, h, n: w * h, f: {}, sea: 0, year: 0, stage: 0, chronicle: [], ms: {}};
}

export const atlasDone = a => a.stage >= ATLAS_STAGES.all().length;

// runs the next stage on its own random stream; returns the stage, or null when all are done
export function runNextStage(a) {
  const st = ATLAS_STAGES.all()[a.stage];
  if (!st) return null;
  const rnd = mulberry(seedNumber(`${a.cfg.seed}:atlas:${st.id}`));
  const t0 = Date.now();
  const text = st.run(a, rnd);
  a.ms[st.id] = Date.now() - t0;
  if (text) a.chronicle.push({era: st.era, year: a.year, stage: st.id, text});
  a.stage++;
  return st;
}

export function generateAtlas(cfg) {
  const a = newAtlas(cfg);
  while (runNextStage(a));
  return a;
}

// a short fingerprint of every field: the same seed and settings must give the same world
export function atlasHash(a) {
  let hsh = 2166136261;
  const mix = v => { hsh ^= v; hsh = Math.imul(hsh, 16777619); };
  for (const k of Object.keys(a.f).sort()) for (const v of a.f[k]) mix(Math.round(v * 1000) | 0);
  return (hsh >>> 0).toString(16);
}
