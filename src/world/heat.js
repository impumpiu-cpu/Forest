// Heat on the grid as the rest of the game sees it. The field itself (grid.heat) is the DEVIATION
// of a cell from the air, in °C, and is computed in world/fields.js over active chunks only; this
// small module is the door to it for everyone else, with no heavy imports, so brains and tasks
// can use it without pulling the whole field model in.
import {perTick} from '../core/util.js';
import {ambientTemp} from '../core/time.js';

export const CHUNK = 8;
// below these a chunk is quiet: heat in °C of deviation, smoke in its own units
export const HEAT_EPS = 0.05, SMOKE_EPS = 0.002;

// ── temperature as the rest of the game sees it
export const airTemp = w => perTick(w, 'airTemp', () => ambientTemp(w));
export const tempAt = (w, i) => airTemp(w) + w.grid.heat[i];
// heat cell i to at least `t` °C (a torch, lightning): sets the deviation and wakes the chunk
export function heatTo(w, i, t) {
  const d = t - airTemp(w);
  if (w.grid.heat[i] < d) w.grid.heat[i] = d;
  touchHeat(w, i);
}
// cool cell i to at most `t` °C (rain from a click)
export function coolTo(w, i, t) {
  const d = t - airTemp(w);
  if (w.grid.heat[i] > d) w.grid.heat[i] = d;
  touchHeat(w, i);
}

// ── chunks
export function chunks(w) {
  if (w.chunks && w.chunks.n === w.n) return w.chunks;
  const cw = Math.ceil(w.w / CHUNK), ch = Math.ceil(w.h / CHUNK);
  return (w.chunks = {n: w.n, cw, ch, active: new Uint8Array(cw * ch)});
}
export const chunkOf = (w, i) => { const c = chunks(w); return (((i / w.w) | 0) / CHUNK | 0) * c.cw + ((i % w.w) / CHUNK | 0); };
export function touchHeat(w, i) { chunks(w).active[chunkOf(w, i)] = 1; }

// old saves carry an absolute temperature: turn it into a deviation and wake every chunk once
export function ensureHeat(w) {
  const g = w.grid;
  if (!g.heat) {
    g.heat = new Float32Array(w.n);
    if (g.temp) { const amb = ambientTemp(w); for (let i = 0; i < w.n; i++) g.heat[i] = g.temp[i] - amb; }
  }
  delete g.temp; delete g.temp2;
  g.heat2 ??= new Float32Array(w.n);
  if (!w.chunks || w.chunks.n !== w.n) { delete w.chunks; chunks(w).active.fill(1); }
}

