// Plate tectonics for the world map: the crust splits into plates, the plates move, and where they
// meet the boundary kind decides the relief — ranges where continents collide, a coastal range and a
// chain of volcanoes where an ocean dives under a continent, trenches, island arcs, rifts, ridges.
// Hot spots under the plates leave a live volcano and a trail of extinct ones.
//
// Continental crust is a field of its own (a.f.crust), not a property of a whole plate: a continent
// can sit inside an oceanic plate's edge or straddle a border, its coast is mostly a quiet shelf
// inside a plate, and where two plates meet the crust on each side decides the boundary kind.
//
// Fields this writes (a.f): plate (Int16), crust (0..1, continental above 0.5), bnd (boundary kind code on boundary cells, data/geology.js),
// bdist (distance to the nearest boundary of the own plate), uplift, and the tectonic factors 0..1 the
// rocks and ores are made from: coll, arc, basv (basaltic volcanism), volc (live), oldv (extinct), craton.
import {Heap, DIRS8} from './heap.js';
import {fbm} from './noise.js';
import {PLATE_COUNTS, BOUNDARIES} from '../data/geology.js';
import {ATLAS_LAND} from '../data/atlas.js';

const g = (d, c, s) => Math.exp(-(((d - c) / s) ** 2));
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// widths are in cells of a 192-cell-high world and scale with the map
export const scaleOf = a => Math.min(a.w, a.h) / 192;

// ── plates: seeds grow outwards over a rough cost field, so the borders wind instead of being straight
export function makePlates(a, rnd) {
  const {w, h, n} = a, count = PLATE_COUNTS[a.cfg.plates ?? 1].count;
  const rough = fbm(rnd, w, h, Math.max(w, h) / 7, 6, 0.6);
  const minD = Math.sqrt(n / count) * 0.6, seeds = [];
  for (let tries = 0; seeds.length < count && tries < count * 200; tries++) {
    const x = (rnd() * w) | 0, y = (rnd() * h) | 0;
    const near = seeds.some(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 < (tries < count * 100 ? minD * minD : minD * minD / 4));
    if (!near) seeds.push([x, y]);
  }
  const plates = seeds.map(([x, y], id) => {
    const ang = rnd() * Math.PI * 2, sp = 0.35 + 0.65 * rnd();
    return {id, sx: x, sy: y, rate: 0.7 + 0.6 * rnd(), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: rnd(), cont: false, area: 0, cx: 0, cy: 0, base: 0};
  });
  const plate = new Int16Array(n).fill(-1), heap = new Heap(n);
  for (const p of plates) heap.push(0, (p.sy * w + p.sx) * 64 + p.id);
  while (heap.size) {
    const val = heap.pop(), c = Math.floor(val / 64), id = val % 64;
    if (plate[c] >= 0) continue;
    plate[c] = id;
    const x = c % w, y = (c / w) | 0, rate = plates[id].rate;
    for (const [dx, dy, len] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (plate[j] < 0) heap.push(heap.top + len * (0.08 + 3 * rough[j] * rough[j]) / rate, j * 64 + id);
    }
  }
  for (let i = 0; i < n; i++) { const p = plates[plate[i]]; p.area++; p.cx += i % w; p.cy += (i / w) | 0; }
  for (const p of plates) { p.cx /= p.area || 1; p.cy /= p.area || 1; }
  // continents: the plates nearer the middle first (the edge of the world is ocean), until they
  // cover a little more than the land share — some continental crust stays under shallow seas
  const target = ATLAS_LAND[a.cfg.land].share * 1.1 * n;
  const order = plates.map(p => [p, Math.hypot(p.cx / w - 0.5, p.cy / h - 0.5) + rnd() * 0.5]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
  let area = 0;
  for (const p of order) { if (area >= target && order.indexOf(p) > 0) break; p.cont = true; area += p.area; }
  if (plates.every(p => p.cont)) order[order.length - 1].cont = false;
  a.plates = plates; a.f.plate = plate;
  a.f.crust = crustField(a, rnd);
  return plates;
}

// a box blur of radius r, twice (≈ Gaussian), in place
export function blur(a, c, r) {
  const {w, h} = a, t = new Float32Array(c.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let s = 0; const row = y * w;
      for (let x = -r; x <= r; x++) s += c[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { t[row + x] = s / (2 * r + 1); s += c[row + Math.min(w - 1, x + r + 1)] - c[row + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { c[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
    }
  }
  return c;
}

// continental crust: the continental plates, blurred so the edge of a continent does not follow the
// plate border, plus broad noise — bays, peninsulas, microcontinents, shallow continental seas
function crustField(a, rnd) {
  const {w, h, n, plates} = a, plate = a.f.plate, k = scaleOf(a);
  const c = new Float32Array(n);
  // no continent reaches the edge of the world: the ocean border is part of the crust, not painted on later
  const edge = Math.min(w, h) * 0.16;
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0, d = Math.min(x, y, w - 1 - x, h - 1 - y);
    c[i] = plates[plate[i]].cont ? smooth(d / edge) : 0;
  }
  blur(a, c, Math.max(2, Math.round(9 * k)));
  const nz = fbm(rnd, w, h, Math.max(w, h) / 5, 6, 0.55);
  for (let i = 0; i < n; i++) c[i] = Math.max(0, Math.min(1, c[i] + 0.9 * (nz[i] - 0.5)));
  return c;
}
const isCont = v => v > 0.5;

// what one side of a meeting line is, from the relative motion of the two plates
// (cA, cB: is the crust continental on this side and on the other)
function classify(A, B, cA, cB, conv) {
  const T = 0.3;
  if (conv > T) {
    if (cA && cB) return 'collision';
    if (cA) return 'arc';
    if (cB) return 'trench';
    return A.age > B.age ? 'trench' : 'islandArc';   // the older ocean floor is heavier and dives
  }
  if (conv < -T) return cA && cB ? 'rift' : cA ? null : 'ridge';   // a continent's edge pulled away from an ocean stays quiet
  return 'fault';
}

export function tectonics(a, rnd) {
  const {w, h, n, plates} = a, plate = a.f.plate, k = scaleOf(a);
  const rough = fbm(rnd, w, h, Math.max(w, h) / 8, 4, 0.5);
  // 1. each pair of neighbouring plates: how fast they close in across the line between their centres
  const pairs = new Map();
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0, A = plate[i];
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= w || ny >= h) continue;
      const B = plate[ny * w + nx];
      if (B === A) continue;
      const key = Math.min(A, B) * 64 + Math.max(A, B);
      if (!pairs.has(key)) {
        const pa = plates[Math.min(A, B)], pb = plates[Math.max(A, B)];
        const ux = pb.cx - pa.cx, uy = pb.cy - pa.cy, len = Math.hypot(ux, uy) || 1;
        pairs.set(key, {sum: ((pa.vx - pb.vx) * ux + (pa.vy - pb.vy) * uy) / len, cnt: 1});
      }
    }
  }
  const pairConv = new Map();   // A*64+B → {conv: > 0 when A and B close in, I}
  for (const [key, e] of pairs) {
    const A = Math.floor(key / 64), B = key % 64, conv = e.sum / e.cnt;
    const I = Math.min(1.2, Math.max(0.35, Math.abs(conv) / 0.9));
    pairConv.set(A * 64 + B, {conv, I}); pairConv.set(B * 64 + A, {conv, I});
  }
  const crust = a.f.crust, tally = {};
  // 2. boundary cells, then the distance from every cell to the nearest boundary of its own plate
  const bnd = new Uint8Array(n), bI = new Float32Array(n), dist = new Float64Array(n).fill(Infinity), src = new Int32Array(n).fill(-1);
  const heap = new Heap(n >> 2), R = 48 * k;
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0, A = plate[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const B = plate[ny * w + nx];
      if (B === A) continue;
      const pc = pairConv.get(A * 64 + B), j = ny * w + nx;
      const kind = classify(plates[A], plates[B], isCont(crust[i]), isCont(crust[j]), pc.conv);
      if (!kind) break;
      bnd[i] = BOUNDARIES.get(kind).code; bI[i] = pc.I;
      tally[kind] = (tally[kind] || 0) + 1;
      dist[i] = 0; src[i] = i; heap.push(0, i);
      break;
    }
  }
  while (heap.size) {
    const c = heap.pop(), d = heap.top;
    if (d > dist[c]) continue;
    const x = c % w, y = (c / w) | 0;
    for (const [dx, dy, len] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, nd = d + len;
      if (plate[j] !== plate[c] || nd >= dist[j] || nd > R) continue;
      dist[j] = nd; src[j] = src[c]; heap.push(nd, j);
    }
  }
  // 3. relief and factors from the nearest boundary's kind
  const f32 = () => new Float32Array(n);
  const up = f32(), coll = f32(), arc = f32(), basv = f32(), volc = f32(), oldv = f32(), craton = f32();
  const KIND = BOUNDARIES.all().map(b => b.id), kindOf = c => KIND[bnd[c] - 1];
  for (let i = 0; i < n; i++) {
    const d = dist[i];
    if (isCont(crust[i])) craton[i] = smooth((crust[i] - 0.55) / 0.3) * (d === Infinity ? 1 : smooth((d - 10 * k) / (16 * k)));
    if (src[i] < 0) continue;
    const I = bI[src[i]] * (0.7 + 0.6 * rough[i]);   // the strength wanders along a seam
    switch (kindOf(src[i])) {
      case 'collision': up[i] += 0.42 * I * g(d, 0, 10 * k); coll[i] = g(d, 0, 14 * k); break;
      case 'arc':
        up[i] += 0.2 * I * g(d, 2 * k, 4 * k) + 0.18 * I * g(d, 8 * k, 3 * k);
        arc[i] = g(d, 8 * k, 7 * k); volc[i] = I * g(d, 8 * k, 2.5 * k); break;
      case 'trench': up[i] -= 0.16 * I * g(d, 0, 3 * k); break;
      case 'islandArc': up[i] += 0.3 * I * g(d, 4 * k, 2.5 * k); arc[i] = g(d, 4 * k, 5 * k); volc[i] = I * g(d, 4 * k, 2 * k); break;
      case 'rift':
        up[i] += -0.14 * I * g(d, 0, 4 * k) + 0.07 * I * g(d, 7 * k, 3 * k);
        basv[i] = g(d, 0, 3 * k); volc[i] = 0.6 * I * g(d, k, 2.5 * k); break;
      case 'ridge': up[i] += 0.09 * I * g(d, 0, 5 * k); basv[i] = g(d, 0, 5 * k); break;
      case 'fault': up[i] += 0.06 * (rough[i] - 0.5) * g(d, 0, 3 * k); break;
    }
  }
  // 4. hot spots: a plume stays put while the plate slides over it, so the live volcano is at the plume
  // and the extinct ones trail off in the direction the plate moves, older and lower further away
  const spots = Math.max(1, Math.round(n / 49152 * (1 + rnd() * 2)));
  a.hotspots = [];
  for (let s = 0; s < spots; s++) {
    const x0 = rnd() * w, y0 = rnd() * h, p = plates[plate[(y0 | 0) * w + (x0 | 0)]];
    const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, step = 7 * k;
    a.hotspots.push({x: x0 | 0, y: y0 | 0});
    for (let q = 0; q < 6; q++) {
      const cx = x0 + ux * q * step, cy = y0 + uy * q * step, str = 1 - q * 0.13, r = Math.ceil(7 * k);
      for (let yy = Math.max(0, (cy - r) | 0); yy <= Math.min(h - 1, (cy + r) | 0); yy++)
        for (let xx = Math.max(0, (cx - r) | 0); xx <= Math.min(w - 1, (cx + r) | 0); xx++) {
          const i = yy * w + xx, d = Math.hypot(xx - cx, yy - cy);
          up[i] += 0.3 * str * g(d, 0, 2.5 * k);
          if (q === 0) { volc[i] = Math.max(volc[i], g(d, 0, 2.5 * k)); basv[i] = Math.max(basv[i], g(d, 0, 4 * k)); }
          else if (q >= 2) oldv[i] = Math.max(oldv[i], str * g(d, 0, 3 * k));
        }
    }
  }
  blur(a, up, Math.max(1, Math.round(2 * k)));   // the nearest-seam split leaves seams between stretches; soften them
  Object.assign(a.f, {bnd, bdist: Float32Array.from(dist), uplift: up, coll, arc, basv, volc, oldv, craton});
  // the chronicle counts stretches of a boundary, not cells: about one per 12 cells of a seam
  for (const kd of Object.keys(tally)) tally[kd] = Math.max(1, Math.round(tally[kd] / (12 * k)));
  return tally;
}

// the final elevation: plate floor + tectonic uplift + broad swells + rough detail, more rugged
// where the land was pushed up; pressed down to the ocean floor along the edge of the world
export function relief(a, rnd) {
  const {w, h, n} = a, k = scaleOf(a), {uplift} = a.f;
  const broad = fbm(rnd, w, h, Math.max(w, h) / 5, 4, 0.5), detail = fbm(rnd, w, h, 12 * k, 4, 0.55), ridged = fbm(rnd, w, h, 8 * k, 4, 0.5);
  const elev = new Float32Array(n), edge = Math.min(w, h) * 0.08;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, u = uplift[i];
    // the ocean floor at 0.2, continents at 0.55, a shelf between them
    const c = smooth((a.f.crust[i] - 0.4) / 0.2);
    let e = 0.2 + 0.35 * c + u + (0.08 + 0.1 * c) * (broad[i] - 0.5) + 0.05 * (detail[i] - 0.5);
    if (u > 0) e += u * 0.6 * ((1 - Math.abs(2 * ridged[i] - 1)) - 0.5);
    const d = Math.min(x, y, w - 1 - x, h - 1 - y);
    elev[i] = e * smooth(d / edge) + 0.05 * (1 - smooth(d / edge));
  }
  let mn = Infinity, mx = -Infinity;
  for (const v of elev) { if (v < mn) mn = v; if (v > mx) mx = v; }
  for (let i = 0; i < n; i++) elev[i] = (elev[i] - mn) / (mx - mn || 1);
  a.f.elev = elev;
}
