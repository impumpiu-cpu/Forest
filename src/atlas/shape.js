// The hand on the land («Создать землю», docs/TABLE.md, этап 8): edits of the base the generator works from, not of
// its result. They live in the world's settings (a.cfg.shape), so they are saved with the land and a land is the
// same land when made again from its seed and its shape:
//   plates  — {[plate id]: {vx, vy, lift}}: a new motion of the plate (the boundaries and the hot-spot trails follow it)
//             and the plate raised or lowered as a whole;
//   strokes — [{x, y, r, dz}]: the ground raised or lowered by a brush, a Gaussian dab each;
//   climate — {equator, pole, wet}: degrees added at the equator and at the poles, and the rain's multiplier.
// Each edit enters the chain at its own stage (FROM) and everything after it is worked out again: a moved plate
// changes the seams, the ranges, the sea, the climate, the rivers, the rocks, the ores and the biomes; a raised
// plate or a brush — from the relief on; the climate — from the temperature on. The sea level is found on the
// relief as it was before the hand, so a raised plate gives land rather than lifting the sea with it.
import {SHAPE} from '../data/atlas.js';
import {blur, scaleOf} from './tectonics.js';

export const emptyShape = () => ({plates: {}, strokes: [], climate: {equator: 0, pole: 0, wet: 1}});
export const shapeOf = a => a.cfg.shape || null;

// the stage a kind of edit enters the chain at (atlas/stages.js ids)
export const FROM = {motion: 'tectonics', lift: 'relief', stroke: 'relief', climate: 'temperature'};

// is there anything in it at all
export function shapeEmpty(s) {
  if (!s) return true;
  const c = s.climate || {};
  return !Object.keys(s.plates || {}).length && !(s.strokes || []).length && !c.equator && !c.pole && (c.wet ?? 1) === 1;
}

// how many edits, for the screen and the library
export function shapeCount(s) {
  if (!s) return 0;
  const c = s.climate || {};
  let n = (s.strokes || []).length ? 1 : 0;
  for (const p of Object.values(s.plates || {})) n += (p.vx != null ? 1 : 0) + (p.lift ? 1 : 0);
  return n + (c.equator ? 1 : 0) + (c.pole ? 1 : 0) + ((c.wet ?? 1) !== 1 ? 1 : 0);
}

// a plate's new motion, before the seams are worked out (stage 'tectonics')
export function plateMotion(a) {
  const s = shapeOf(a); if (!s) return;
  for (const [id, e] of Object.entries(s.plates || {})) {
    const p = a.plates[+id];
    if (p && e.vx != null) { p.vx = e.vx; p.vy = e.vy; }
  }
}

// raised plates and brush strokes, over the made relief (stage 'relief'); the relief before them is kept for the sea
export function shapeRelief(a) {
  const s = shapeOf(a); if (!s) return;
  const lifts = Object.entries(s.plates || {}).filter(([, e]) => e.lift);
  if (!lifts.length && !(s.strokes || []).length) return;
  const {w, h, n} = a, elev = a.f.elev, k = scaleOf(a);
  a.f.elev0 = Float32Array.from(elev);
  if (lifts.length) {
    const by = new Float32Array(64);
    for (const [id, e] of lifts) by[+id] = e.lift;
    const up = new Float32Array(n);
    for (let i = 0; i < n; i++) up[i] = by[a.f.plate[i]];
    blur(a, up, Math.max(1, Math.round(SHAPE.lift.soft * k)));
    for (let i = 0; i < n; i++) elev[i] += up[i];
  }
  for (const st of s.strokes || []) dab(a, elev, st);
  // the edge of the world stays ocean floor
  const edge = Math.min(w, h) * 0.04;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, d = Math.min(x, y, w - 1 - x, h - 1 - y);
    elev[i] = Math.max(0, Math.min(1, d < edge ? Math.min(elev[i], a.f.elev0[i]) : elev[i]));
  }
}

// one dab of the brush into a field (also used by the screen to show a stroke before the chain is worked out again)
export function dab(a, field, {x, y, r, dz}) {
  const R = Math.ceil(r * 2.2);
  for (let yy = Math.max(0, Math.floor(y - R)); yy <= Math.min(a.h - 1, Math.ceil(y + R)); yy++)
    for (let xx = Math.max(0, Math.floor(x - R)); xx <= Math.min(a.w - 1, Math.ceil(x + R)); xx++) {
      const i = yy * a.w + xx, d2 = (xx - x) ** 2 + (yy - y) ** 2;
      field[i] = Math.max(0, Math.min(1, field[i] + dz * Math.exp(-d2 / (r * r))));
    }
}

// degrees added at a latitude (|lat| 0..90) by the climate edit
export function climateShift(a, lat) {
  const c = shapeOf(a)?.climate; if (!c) return 0;
  const t = Math.min(1, Math.abs(lat) / 90);
  return (c.equator || 0) * (1 - t) + (c.pole || 0) * t;
}
export const wetOf = a => shapeOf(a)?.climate?.wet ?? 1;

// a copy of the world at a stage boundary: the chain is worked out again from it (the screen keeps these)
export const snapshot = a => structuredClone({...a, ms: {}});
export function resume(snap, shape) {
  const a = structuredClone(snap);
  a.cfg = {...a.cfg, shape: shapeEmpty(shape) ? undefined : structuredClone(shape)};
  if (!a.cfg.shape) delete a.cfg.shape;
  return a;
}
