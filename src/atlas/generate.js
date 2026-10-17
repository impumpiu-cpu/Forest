// The world map (atlas). A separate core from the local map (src/world/): no screen, no browser.
// The two meet later through outside/ — the atlas becomes the provider behind the border and each of
// its cells becomes the region of a local map (docs/WORLD.md, «Шов»).
//
// The atlas is made stage by stage (atlas/stages.js), then history runs a season a step
// (atlas/history.js), so the screen can draw and write the chronicle as it goes; generateAtlas runs
// everything at once (tests, headless).
import {mulberry, seedNumber} from '../core/rng.js';
import {ATLAS_SIZES} from '../data/atlas.js';
import {ATLAS_STAGES} from './stages.js';
import {startHistory, stepHistory, historyDone} from './history.js';

export function newAtlas(cfg) {
  const {w, h} = ATLAS_SIZES[cfg.size];
  return {cfg: {...cfg}, w, h, n: w * h, f: {}, sea: 0, year: 0, stage: 0, chronicle: [], ms: {}};
}

export const landDone = a => a.stage >= ATLAS_STAGES.all().length;
export const atlasDone = a => landDone(a) && historyDone(a);

// runs the next stage on its own random stream, or, once the land is made, the next season of
// history; returns what ran, or null when all is done
export function runNextStage(a) {
  const st = ATLAS_STAGES.all()[a.stage];
  if (!st) {
    if (historyDone(a)) return null;
    const t0 = Date.now();
    if (!a.hist) startHistory(a); else stepHistory(a);
    a.ms.history = (a.ms.history || 0) + Date.now() - t0;
    return {id: 'history'};
  }
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
  if (a.fauna) for (const s of a.fauna.list) for (const v of s.N) mix(Math.round(v * 1000) | 0);
  if (a.rot) for (const v of a.rot) mix(Math.round(v * 1000) | 0);
  for (const l of a.lairs || []) mix(l.i * 31 + Math.round(l.strength * 1000) + (l.alive ? 7 : 0));
  for (const t of a.towns || []) { mix(t.i * 31 + Math.round(t.pop * 10) + t.tier * 7 + (t.alive ? 3 : 0)); for (const b of t.built) for (let k = 0; k < b.length; k++) mix(b.charCodeAt(k)); }
  for (const k of Object.keys(a.rel || {}).sort()) { const r = a.rel[k]; mix(Math.round(r.att * 1000) + r.wars * 7 + r.routes * 13 + (r.war ? 1 : 0)); }
  for (const r of a.ruins || []) mix(r.i * 31 + r.year);
  for (const c of a.chronicle) for (let k = 0; k < c.text.length; k++) mix(c.text.charCodeAt(k));
  return (hsh >>> 0).toString(16);
}
