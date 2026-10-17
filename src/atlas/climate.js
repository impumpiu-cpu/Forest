// Climate of the world map: temperature, prevailing winds, moisture carried by the wind, rain.
//
// Temperature: by latitude and height (−6.5° per km), with the sea softening the coast. Far inland
// the year swings harder (continentality), which the local map will later use for its seasons.
// Winds: the belts of data/climate.js plus slow large eddies, so the flow is not ruler-straight.
// Rain: air takes up water over the sea (more over warm sea), the wind carries it (semi-Lagrangian
// advection, as for smoke on the local map), and it falls when the air rises — in the rising belts,
// when the wind climbs a slope, and when it cools below saturation. Cooling with height is built in
// (the temperature field has the lapse rate), so the windward side of a range gets the rain and
// the lee side lies in its shadow: the air coming down has nothing left to give.
//
// Fields (a.f): temp (°C, yearly mean), trange (°C, summer minus winter), windX, windY (cells per
// step, + east / + down the map), rain (mm a year), cont (0 by the sea … 1 deep inland).
import {fbm} from './noise.js';
import {latitude, towardEquator} from './latitude.js';
import {scaleOf} from './tectonics.js';
import {Heap, DIRS8} from './heap.js';
import {WIND_BELTS, MOISTURE} from '../data/climate.js';

const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// the belt values at a latitude, blended smoothly between the stops
export function belt(lat) {
  const L = Math.min(90, Math.abs(lat));
  for (let k = 1; k < WIND_BELTS.length; k++) {
    const b = WIND_BELTS[k], p = WIND_BELTS[k - 1];
    if (L <= b.lat) {
      const t = smooth((L - p.lat) / (b.lat - p.lat));
      return {east: p.east + (b.east - p.east) * t, eq: p.eq + (b.eq - p.eq) * t, rise: p.rise + (b.rise - p.rise) * t};
    }
  }
  const z = WIND_BELTS[WIND_BELTS.length - 1];
  return {east: z.east, eq: z.eq, rise: z.rise};
}

// how far each cell is from the sea, 0 on the shore … 1 at 40 cells (of a 192-high world) and more
function continentality(a) {
  const {w, h, n} = a, land = a.f.land, k = scaleOf(a), dist = new Float64Array(n).fill(Infinity), heap = new Heap(n >> 2);
  for (let i = 0; i < n; i++) if (!land[i]) { dist[i] = 0; heap.push(0, i); }
  while (heap.size) {
    const c = heap.pop(), d = heap.top;
    if (d > dist[c]) continue;
    const x = c % w, y = (c / w) | 0;
    for (const [dx, dy, len] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, nd = d + len;
      if (nd < dist[j]) { dist[j] = nd; heap.push(nd, j); }
    }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = smooth(dist[i] / (40 * k));
  return out;
}

// height above the sea in km. The relief's 0..1 is stretched so that most land is low and only the
// peaks are high, as on Earth (mean land ~0.8 km, the highest peak `peakKm`)
export const heightKm = (a, e) => (e > a.sea ? (a.cfg.peakKm ?? 5) * ((e - a.sea) / (1 - a.sea)) ** 1.6 : 0);

export function temperature(a) {
  const {w, h, n} = a, f = a.f;
  const cont = continentality(a), temp = new Float32Array(n), range = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(latitude(a, y)), base = 28 - 46 * (lat / 90) ** 1.3;   // sea level, yearly mean
    for (let x = 0; x < w; x++) {
      const i = y * w + x, km = f.land[i] ? heightKm(a, f.elev[i]) : 0;
      // inland is a little hotter in the tropics and colder towards the poles than the coast
      const inland = cont[i] * (lat < 25 ? 1.5 : -4 * (lat - 25) / 65);
      temp[i] = base - 6.5 * km + inland;
      // the year's swing: small at the equator and by the sea, large inland at high latitudes
      range[i] = 2 + (lat / 90) * (10 + 55 * cont[i]);   // Bergen (60°, by the sea) ~12°, Yakutsk (62°, inland) ~55°
    }
  }
  f.temp = temp; f.trange = range; f.cont = cont;
}

// prevailing wind per cell: the belt of its row, bent by large slow eddies and slowed by high ground
export function winds(a, rnd) {
  const {w, h, n} = a, f = a.f;
  const eddyX = fbm(rnd, w, h, Math.max(w, h) / 4, 3, 0.5), eddyY = fbm(rnd, w, h, Math.max(w, h) / 4, 3, 0.5);
  const wx = new Float32Array(n), wy = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const b = belt(latitude(a, y)), s = towardEquator(a, y) || 1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, hi = f.land[i] ? (f.elev[i] - a.sea) / (1 - a.sea) : 0;
      const slow = 1 - 0.5 * smooth(hi / 0.6);
      wx[i] = (b.east + 0.45 * (eddyX[i] - 0.5)) * slow;
      wy[i] = (b.eq * s + 0.45 * (eddyY[i] - 0.5)) * slow;
    }
  }
  f.windX = wx; f.windY = wy;
}

// half-resolution copy of a field (averages of 2×2 blocks)
function halve(a, src) {
  const W = Math.ceil(a.w / 2), H = Math.ceil(a.h / 2), out = new Float32Array(W * H), cnt = new Float32Array(W * H);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const j = (y >> 1) * W + (x >> 1); out[j] += src[y * a.w + x]; cnt[j]++; }
  for (let j = 0; j < out.length; j++) out[j] /= cnt[j];
  return out;
}

const qsat = T => 4 * Math.exp(0.04 * T);   // water air can hold, grows with warmth

export function rain(a) {
  const f = a.f, M = MOISTURE, W = Math.ceil(a.w / 2), H = Math.ceil(a.h / 2), N = W * H;
  const T = halve(a, f.temp), E = halve(a, f.elev), L = halve(a, f.land), U = halve(a, f.windX), V = halve(a, f.windY);
  const rise = new Float32Array(N), sat = new Float32Array(N), climb = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const b = belt(latitude(a, Math.min(a.h - 1, y * 2)));
    for (let x = 0; x < W; x++) {
      const j = y * W + x;
      rise[j] = b.rise; sat[j] = qsat(T[j]);
      // how steeply the wind climbs here: wind · slope of the ground (only over land)
      const ex = E[y * W + Math.min(W - 1, x + 1)] - E[y * W + Math.max(0, x - 1)], ey = E[Math.min(H - 1, y + 1) * W + x] - E[Math.max(0, y - 1) * W + x];
      climb[j] = L[j] > 0.5 ? Math.max(0, (U[j] * ex + V[j] * ey) * 0.5) : 0;
    }
  }
  let q = new Float32Array(N), q2 = new Float32Array(N);
  for (let j = 0; j < N; j++) q[j] = L[j] > 0.5 ? 0 : sat[j] * 0.8;
  // soil: what fell here lately; land gives part of it back to the air (plants and wet ground),
  // so rain reaches deep inland, but a rain shadow stays dry — there is nothing there to give back
  const soil = new Float32Array(N);
  const acc = new Float32Array(N), steps = Math.round(1.6 * (W + H)), from = steps >> 1;
  for (let s = 0; s < steps; s++) {
    // carry the air with the wind: each cell takes what was upwind of it
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = y * W + x;
      let sx = x - U[j] * M.speed, sy = y - V[j] * M.speed;
      sx = Math.max(0, Math.min(W - 1.001, sx)); sy = Math.max(0, Math.min(H - 1.001, sy));
      const x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0, i0 = y0 * W + x0;
      q2[j] = (q[i0] * (1 - tx) + q[i0 + 1] * tx) * (1 - ty) + (q[i0 + W] * (1 - tx) + q[i0 + W + 1] * tx) * ty;
    }
    // eddies mix the air a little every way, also against the wind, so no basin is cut off for good
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = y * W + x, l = x > 0 ? j - 1 : j, r = x < W - 1 ? j + 1 : j, u = y > 0 ? j - W : j, d = y < H - 1 ? j + W : j;
      q[j] = q2[j] + M.mix * (q2[l] + q2[r] + q2[u] + q2[d] - 4 * q2[j]);
    }
    for (let j = 0; j < N; j++) {
      const sea = L[j] < 0.5, gap = sat[j] - q[j];
      if (gap > 0) q[j] += sea ? gap * M.evapSea : Math.min(gap, M.recycle * soil[j]);
      let r = q[j] * (M.drizzle + M.rise * Math.max(0, rise[j]) + Math.min(M.oroMax, M.orography * climb[j]));
      if (rise[j] < 0) r *= 1 + 0.7 * rise[j];   // sinking air holds its water
      if (q[j] - r > sat[j]) r += (q[j] - r - sat[j]) * M.condense;
      q[j] -= r;
      soil[j] = soil[j] * 0.9 + r * 0.1;
      if (s >= from) acc[j] += r;
    }
  }
  // back to full resolution, bilinear, in mm a year
  const out = new Float32Array(a.n), scale = M.mm / (steps - from);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const sx = Math.max(0, Math.min(W - 1.001, (x - 0.5) / 2)), sy = Math.max(0, Math.min(H - 1.001, (y - 0.5) / 2));
    const x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0, i0 = y0 * W + x0;
    const mm = ((acc[i0] * (1 - tx) + acc[i0 + 1] * tx) * (1 - ty) + (acc[i0 + W] * (1 - tx) + acc[i0 + W + 1] * tx) * ty) * scale;
    // the crude model overshoots on the first windward coast; real rains rarely pass 4–5 m a year
    out[y * a.w + x] = mm < M.soft ? mm : M.soft + (mm - M.soft) * 0.4;
  }
  f.rain = out;
}
