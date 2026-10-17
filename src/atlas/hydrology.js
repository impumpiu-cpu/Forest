// Water on the world map: the ocean, erosion, rivers, lakes, floodplains, gold sand.
//
// The ocean is the water below sea level that reaches the edge of the world; a hollow below sea level
// inside a continent is not ocean but a basin that fills into a lake.
// Where water goes comes from Priority-Flood (Barnes et al.): starting at the coast the land is
// taken in order of height, hollows are filled up to their spill point, and every cell drains to
// the cell it was reached from. That gives one downhill tree per river mouth, through lakes and flats.
// Erosion cuts along that tree by the stream power law dz/dt = −K·A^m·S, solved implicitly (Braun &
// Willett), so big rivers carve valleys down towards sea level while ridges between them stand.
//
// Fields (a.f): ocean (1 — ocean), elev (eroded), down (where each land cell drains: a cell index,
// −1 for the ocean itself), flow (water gathered from upstream, RIVERS.unit), lake (lake id or −1),
// alluvium (0..1, floodplains and deltas), and after the ores: ore_placer.
import {Heap, DIRS8} from './heap.js';
import {scaleOf} from './tectonics.js';
import {temperature, rain} from './climate.js';
import {EROSION, RIVERS} from '../data/hydrology.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// the ocean: cells at or below `level` joined (side by side) to the edge of the map
export function oceanMask(a, z, level) {
  const {w, h, n} = a, ocean = new Uint8Array(n), stack = [];
  const seed = i => { if (!ocean[i] && z[i] <= level) { ocean[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w);
  }
  return ocean;
}

// the sea level that leaves `share` of the world outside the ocean (inland basins count as land).
// The ocean share can jump as the level rises — a basin joins the sea all at once through a strait —
// so the level on whichever side of the jump comes closer is taken.
export function seaLevel(a, share) {
  const z = a.f.elev, oceanShare = lv => { const oc = oceanMask(a, z, lv); let c = 0; for (let i = 0; i < a.n; i++) c += oc[i]; return c / a.n; };
  let lo = 0, hi = 1;
  for (let it = 0; it < 22; it++) {
    const mid = (lo + hi) / 2;
    if (oceanShare(mid) < 1 - share) lo = mid; else hi = mid;
  }
  const level = Math.abs(oceanShare(lo) - (1 - share)) < Math.abs(oceanShare(hi) - (1 - share)) ? lo : hi;
  a.sea = level;
  a.f.ocean = oceanMask(a, z, level);
  const land = new Uint8Array(a.n);
  for (let i = 0; i < a.n; i++) land[i] = a.f.ocean[i] ? 0 : 1;
  a.f.land = land;
}

// Priority-Flood: filled surface, where each land cell drains, and the land cells from the coast
// upwards (so walking `order` backwards visits every cell before the one it drains into)
export function flood(a, z) {
  const {w, h, n} = a, ocean = a.f.ocean, done = new Uint8Array(n), filled = Float32Array.from(z);
  const down = new Int32Array(n).fill(-1), order = new Int32Array(n), heap = new Heap(n >> 2);
  let cnt = 0;
  for (let i = 0; i < n; i++) if (ocean[i]) done[i] = 1;
  for (let i = 0; i < n; i++) {
    if (!ocean[i]) continue;
    const x = i % w, y = (i / w) | 0;
    let coast = false;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !ocean[ny * w + nx]) { coast = true; break; }
    }
    if (coast) heap.push(a.sea, i);
  }
  while (heap.size) {
    const c = heap.pop(), kc = heap.top, x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (done[j]) continue;
      done[j] = 1;
      const fz = Math.max(z[j], kc + 1e-7);
      filled[j] = fz; down[j] = c; order[cnt++] = j;
      heap.push(fz, j);
    }
  }
  return {filled, down, order, cnt};
}

// water (or anything else) gathered from upstream: each cell adds its own `own` and passes the sum
// down; a cell marked in `sink` keeps what reaches it (a salt lake)
function gather(a, fl, own, sink) {
  const acc = Float32Array.from(own), {down, order, cnt} = fl, ocean = a.f.ocean;
  for (let k = cnt - 1; k >= 0; k--) {
    const c = order[k], d = down[c];
    if (d < 0 || ocean[d]) continue;
    if (sink && sink[c] && !sink[d]) continue;
    acc[d] += acc[c];
  }
  return acc;
}

const rainUnits = a => { const o = new Float32Array(a.n); for (let i = 0; i < a.n; i++) o[i] = a.f.ocean[i] ? 0 : a.f.rain[i] / RIVERS.unit; return o; };
const isDiag = (a, i, j) => (i % a.w !== j % a.w) && (((i / a.w) | 0) !== ((j / a.w) | 0));

// the epochs of erosion; the climate is worked out again on the worn relief at the end
export function erode(a) {
  const E = EROSION, z = a.f.elev, ocean = a.f.ocean, {w, h, n} = a, k = scaleOf(a);
  const startBelow = new Uint8Array(n);   // inland basins below sea level stay basins
  for (let i = 0; i < n; i++) if (!ocean[i] && z[i] <= a.sea) startBelow[i] = 1;
  let cut = 0;
  const before = Float32Array.from(z), tmp = new Float32Array(n);
  for (let ep = 0; ep < E.epochs; ep++) {
    const fl = flood(a, z), acc = gather(a, fl, rainUnits(a));
    // implicit stream power, downstream first: the receiver is already at its new height
    for (let q = 0; q < fl.cnt; q++) {
      const i = fl.order[q], r = fl.down[i], zr = ocean[r] ? a.sea : z[r];
      if (z[i] <= zr) continue;
      const F = E.k * Math.pow(acc[i] / (k * k), E.m) / (isDiag(a, i, r) ? Math.SQRT2 : 1) / 6;
      z[i] = (z[i] + F * zr) / (1 + F);
    }
    // slope creep on land; the coast does not sink into the sea
    for (let p = 0; p < E.creepPasses; p++) {
      tmp.set(z);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (ocean[i]) continue;
        const avg = (tmp[i - 1] + tmp[i + 1] + tmp[i - w] + tmp[i + w]) / 4;
        z[i] = tmp[i] + E.creep * (avg - tmp[i]);
      }
    }
    // the ranges keep rising a little
    for (let i = 0; i < n; i++) if (!ocean[i] && a.f.uplift[i] > 0) z[i] += E.uplift * a.f.uplift[i] / E.epochs;
    for (let i = 0; i < n; i++) if (!ocean[i] && !startBelow[i] && z[i] <= a.sea) z[i] = a.sea + 1e-4;
  }
  for (let i = 0; i < n; i++) if (!ocean[i]) cut += Math.max(0, before[i] - z[i]);
  // the relief changed: heights, temperature and rain follow it
  temperature(a); rain(a);
  return cut;
}

// rivers, lakes and floodplains on the final relief
export function rivers(a) {
  const {w, h, n} = a, f = a.f, z = f.elev, k2 = scaleOf(a) ** 2;
  const fl = flood(a, z);
  // lakes: water standing over the ground in a filled hollow
  const lake = new Int16Array(n).fill(-1), lakes = [];
  for (let s = 0; s < n; s++) {
    if (f.ocean[s] || lake[s] >= 0 || fl.filled[s] - z[s] <= EROSION.lakeEps) continue;
    const id = lakes.length, cells = [s], stack = [s]; lake[s] = id;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (lake[j] >= 0 || f.ocean[j] || fl.filled[j] - z[j] <= EROSION.lakeEps) continue;
        lake[j] = id; cells.push(j); stack.push(j);
      }
    }
    lakes.push({id, size: cells.length, cells, salt: false});
  }
  // a lake that loses more to the air than flows in has no outlet: a salt lake that keeps its water
  let flow = gather(a, fl, rainUnits(a));
  const sink = new Uint8Array(n);
  for (const L of lakes) {
    let inflow = 0, evap = 0;
    for (const c of L.cells) {
      inflow = Math.max(inflow, flow[c]);
      evap += RIVERS.evap * Math.max(0.1, 1 + f.temp[c] / 15) / RIVERS.unit;
    }
    L.inflow = inflow;
    if (inflow < evap) { L.salt = true; for (const c of L.cells) sink[c] = 1; }
    delete L.cells;
  }
  if (lakes.some(L => L.salt)) flow = gather(a, fl, rainUnits(a), sink);
  for (let i = 0; i < n; i++) if (f.ocean[i]) flow[i] = 0;
  // floodplains: flat valley floors of big enough rivers, a little wider for bigger ones; deltas at
  // the mouths of rivers
  const allu = new Float32Array(n);
  const mark = (i, r, v) => {
    const x0 = i % w, y0 = (i / w) | 0;
    for (let y = Math.max(0, y0 - r); y <= Math.min(h - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(w - 1, x0 + r); x++) {
      const j = y * w + x, d = Math.hypot(x - x0, y - y0);
      if (d <= r + 0.5 && !f.ocean[j] && lake[j] < 0) allu[j] = Math.max(allu[j], v * (1 - d / (r + 1)));
    }
  };
  for (let i = 0; i < n; i++) {
    if (f.ocean[i] || flow[i] < RIVERS.alluvium * k2) continue;
    const r = fl.down[i], drop = (z[i] - (f.ocean[r] ? a.sea : z[r])) * 192 * scaleOf(a);
    const big = Math.log10(flow[i] / (RIVERS.alluvium * k2));
    if (drop < 0.6) mark(i, Math.round(1 + big * 1.5), clamp01(0.5 + 0.3 * big));
    if (f.ocean[r] && flow[i] >= RIVERS.river * k2) mark(i, Math.round(2 + big * 2), 1);
  }
  Object.assign(f, {down: fl.down, flow, lake, alluvium: allu});
  a.lakes = lakes; a.hydro = {order: fl.order, cnt: fl.cnt};
  const riverCells = flow.reduce((s, v) => s + (v >= RIVERS.river * k2 ? 1 : 0), 0);
  return {lakes: lakes.length, salt: lakes.filter(L => L.salt).length, riverCells};
}

export const riverKind = (a, i) => {
  const k2 = scaleOf(a) ** 2, v = a.f.flow?.[i] || 0;
  return v >= RIVERS.great * k2 ? 'great' : v >= RIVERS.river * k2 ? 'river' : v >= RIVERS.stream * k2 ? 'stream' : null;
};

// gold sand: the average gold of the rock upstream, washed down and dropped where the river slows
export function placer(a) {
  const f = a.f, n = a.n, gold = f.ore_gold, k2 = scaleOf(a) ** 2;
  const fl = {down: f.down, order: a.hydro.order, cnt: a.hydro.cnt};
  const ones = new Float32Array(n), g = new Float32Array(n);
  for (let i = 0; i < n; i++) if (!f.ocean[i]) { ones[i] = 1; g[i] = gold[i]; }
  const area = gather(a, fl, ones), load = gather(a, fl, g), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (f.ocean[i] || f.flow[i] < RIVERS.stream * k2 || f.lake[i] >= 0) continue;
    const r = f.down[i], drop = (f.elev[i] - (f.ocean[r] ? a.sea : f.elev[r])) * 192 * scaleOf(a);
    const slow = clamp01(1 - drop / 1.5);   // gold settles where the river runs slack
    out[i] = clamp01((load[i] - g[i]) / Math.max(1, area[i] - 1) * 1.6 * (0.3 + 0.7 * slow));
  }
  f.ore_placer = out;
  return out;
}
