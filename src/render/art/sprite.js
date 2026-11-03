// Drawing the pictures (src/art/sprites.js, made from src/art/**/*.svg by tools/art-build.mjs; docs/ART.md).
// A picture is a list of parts: a path, its fill and stroke (a colour token of src/art/palette.js or a CSS colour),
// a stroke width in the picture's own units, the size step it shows at and the flags it wants. The paths are made
// once (Path2D); a thing on the map is painted once into a small canvas per size and look (`cached`) and only copied
// after that — the scene draws bitmaps, not paths.
import {SPRITES} from '../../art/sprites.js';
import {PALETTE} from '../../art/palette.js';

// the size steps: 0 — a mark (a silhouette, the `small` parts), 1 — a figure (no `detail`), 2 — in full
export const MARK = 0, FIGURE = 1, FULL = 2;
const STEP = {small: 0, figure: 1, detail: 2};

const paths = new Map();
function partsOf(key) {
  let p = paths.get(key);
  if (p) return p;
  const s = SPRITES[key];
  if (!s) return null;
  p = s.parts.map(q => ({...q, path: new Path2D(q.d), mk: q.m ? Math.hypot(q.m[0], q.m[1]) : 1}));
  paths.set(key, p);
  return p;
}

export const hasSprite = key => key != null && Object.prototype.hasOwnProperty.call(SPRITES, key);
export const spriteBox = key => SPRITES[key]?.box;
// a named point of a picture (data-anchor in the SVG): [x, y, r] in its units, or null
export const anchorOf = (key, name) => SPRITES[key]?.anchors?.[name] || null;
export const spriteKeys = prefix => Object.keys(SPRITES).filter(k => k.startsWith(prefix));

const colorOf = (v, colors) => colors?.[v] ?? PALETTE[v] ?? v;
function shown(q, step, flags) {
  if (q.lod) { const s = STEP[q.lod]; if (q.lod === 'small' ? step !== 0 : step < s) return false; }
  if (q.when) for (const f of q.when) {
    if (f.startsWith('no-') ? flags?.has(f.slice(3)) : !flags?.has(f)) return false;
  }
  return true;
}

// Draw picture `key` with the top-left of its viewBox at (x, y), `scale` CSS pixels to its unit.
// o: colors {token: colour}, step (MARK | FIGURE | FULL), flags (a Set), flip (mirror left↔right inside its box),
// minLine — no stroke thinner than this many CSS pixels (a picture drawn small keeps its outline), alpha.
export function drawSprite(ctx, key, x, y, scale, o = {}) {
  const parts = partsOf(key);
  if (!parts) return false;
  const [bx, by, bw] = SPRITES[key].box, step = o.step ?? FULL, minLine = o.minLine ?? 1;
  ctx.save();
  ctx.translate(x, y);
  if (o.flip) { ctx.translate(bw * scale, 0); ctx.scale(-1, 1); }
  ctx.scale(scale, scale);
  ctx.translate(-bx, -by);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const a0 = o.alpha ?? 1;
  for (const q of parts) {
    if (!shown(q, step, o.flags)) continue;
    if (q.m) { ctx.save(); ctx.transform(q.m[0], q.m[1], q.m[2], q.m[3], q.m[4], q.m[5]); }
    ctx.globalAlpha = a0 * (q.o ?? 1);
    if (q.f) { ctx.fillStyle = colorOf(q.f, o.colors); ctx.fill(q.path); }
    if (q.s && q.w > 0) {
      const px = q.w * scale * q.mk;   // the stroke on the screen; a thin one is thickened, up to 2,5 times
      ctx.lineWidth = px >= minLine ? q.w : Math.min(minLine, px * 2.5) / (scale * q.mk);
      ctx.strokeStyle = colorOf(q.s, o.colors); ctx.stroke(q.path);
    }
    if (q.m) ctx.restore();
  }
  ctx.restore();
  return true;
}

// ── the cache: a little canvas per look and size; `paint(g)` draws it in CSS pixels at the device's resolution
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const cache = new Map();
const LIMIT = 6000;
export function cached(key, w, h, paint) {
  const dpr = globalThis.devicePixelRatio || 1, k = key + '@' + dpr;
  let c = cache.get(k);
  if (c) { cache.delete(k); cache.set(k, c); return c; }   // (used again: the newest — the oldest go first)
  // full: the eighth least lately used go, not the whole cache (a zoom would else paint every bitmap again in one frame)
  if (cache.size >= LIMIT) { let n = LIMIT >> 3; for (const key of cache.keys()) { cache.delete(key); if (--n <= 0) break; } }
  c = makeCanvas(Math.max(1, Math.ceil(w * dpr)), Math.max(1, Math.ceil(h * dpr)));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  paint(g);
  c.w = w; c.h = h;
  cache.set(k, c);
  return c;
}
