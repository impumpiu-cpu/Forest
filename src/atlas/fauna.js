// The beasts of the world map as fields: reaction–diffusion on a coarse grid (data/history.js FAUNA).
// Every species with a habitat gets a carrying capacity K from the biomes of each coarse cell and a
// density N. Each season herbivores grow logistically, predators eat their prey (Holling type II) and
// grow or starve, everyone wanders a little to the neighbours, and spirits stay bound to their places.
// Lairs (atlas/lairs.js) hold the density of their owners up around them.
//
// a.fauna = {c, W, H, list: [{id, sp, role: 'prey'|'predator'|'spirit', K, N, prey: [indices], usual}]}
import {SPECIES} from '../data/species.js';
import {RARITY} from '../data/biomes.js';
import {FAUNA} from '../data/history.js';
import {ROCK_BY_CODE} from '../data/geology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';

export function initFauna(a, rnd) {
  const c = Math.max(2, Math.round(FAUNA.cell * scaleOf(a))), W = Math.ceil(a.w / c), H = Math.ceil(a.h / c), N = W * H;
  const species = SPECIES.filter(s => s.habitat);
  // the biome shares of each coarse cell (land cells only; caves from the rock count as underground)
  const shares = Array.from({length: N}, () => ({}));
  for (let i = 0; i < a.n; i++) {
    if (a.f.ocean[i]) continue;
    const j = (((i / a.w) | 0) / c | 0) * W + ((i % a.w) / c | 0), b = biomeAt(a, i), sh = shares[j];
    sh[b.id] = (sh[b.id] || 0) + 1;
    const rock = ROCK_BY_CODE[a.f.rock[i]]?.id;
    if (rock === 'limestone') sh.underground = (sh.underground || 0) + 0.15;
    else if (rock === 'basalt') sh.underground = (sh.underground || 0) + 0.08;
  }
  const list = species.map(sp => {
    const K = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      let v = 0;
      for (const [b, r] of Object.entries(sp.habitat)) v += (shares[j][b] || 0) * RARITY[r].mul;
      K[j] = v / (c * c);
    }
    const role = sp.resident ? 'spirit' : sp.predator ? 'predator' : 'prey';
    const Nf = new Float32Array(N);
    for (let j = 0; j < N; j++) Nf[j] = role === 'spirit' ? K[j] : K[j] * (0.3 + 0.6 * rnd());
    return {id: sp.id, sp, role, K, N: Nf, speed: Math.min(2, (sp.speed || 0.15) / 0.15), usual: 0, flagged: -99};
  });
  const idx = Object.fromEntries(list.map((s, k) => [s.id, k]));
  for (const s of list) if (s.role === 'predator') s.prey = [...(s.sp.predator.prey || []), ...(s.sp.predator.weakPrey || [])].filter(id => id in idx).map(id => idx[id]);
  for (const s of list) { let t = 0; for (const v of s.K) t += v; s.usual = t; }
  a.fauna = {c, W, H, list, idx};
}

function diffuse(F, arr, K, rate, tmp) {
  const {W, H} = F;
  tmp.set(arr);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = y * W + x;
    if (K[j] <= 0 && tmp[j] <= 0) continue;
    let s = 0, c = 0;
    if (x > 0) { s += tmp[j - 1]; c++; } if (x < W - 1) { s += tmp[j + 1]; c++; }
    if (y > 0) { s += tmp[j - W]; c++; } if (y < H - 1) { s += tmp[j + W]; c++; }
    arr[j] = tmp[j] + rate * (s / c - tmp[j]);
  }
}

// this year's weather: a broad random field −1 … 1 over the coarse grid (bilinear over a few knots)
export function rollWeather(a, rnd) {
  const F = a.fauna, kw = 6, kh = 5, knots = Array.from({length: kw * kh}, () => rnd() * 2 - 1), out = new Float32Array(F.W * F.H);
  for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
    const fx = x / (F.W - 1 || 1) * (kw - 1), fy = y / (F.H - 1 || 1) * (kh - 1), x0 = Math.min(kw - 2, fx | 0), y0 = Math.min(kh - 2, fy | 0), tx = fx - x0, ty = fy - y0;
    const k = (i, j) => knots[j * kw + i];
    out[y * F.W + x] = (k(x0, y0) * (1 - tx) + k(x0 + 1, y0) * tx) * (1 - ty) + (k(x0, y0 + 1) * (1 - tx) + k(x0 + 1, y0 + 1) * tx) * ty;
  }
  F.weather = out;
  return out;
}

// a murrain: a species crowded somewhere loses most of its numbers around there; returns the cell or −1
export function plague(a, rnd) {
  const F = a.fauna, P = FAUNA;
  for (const s of F.list) {
    if (s.role === 'spirit' || rnd() > P.plague) continue;
    let best = -1, bv = P.crowd;
    for (let j = 0; j < s.N.length; j++) if (s.K[j] > 0.2 && s.N[j] / s.K[j] > bv) { bv = s.N[j] / s.K[j]; best = j; }
    if (best < 0) continue;
    const bx = best % F.W, by = (best / F.W) | 0, r = P.plagueRadius;
    for (let y = Math.max(0, by - r); y <= Math.min(F.H - 1, by + r); y++) for (let x = Math.max(0, bx - r); x <= Math.min(F.W - 1, bx + r); x++)
      if ((x - bx) ** 2 + (y - by) ** 2 <= r * r) s.N[y * F.W + x] *= 1 - P.plagueKill;
    return {s, j: best};
  }
  return null;
}

// one season; returns the world totals of every species
export function stepFauna(a, seasonId) {
  const F = a.fauna, P = FAUNA, n = F.W * F.H, g0 = P.season[seasonId] ?? 1, tmp = new Float32Array(n);
  const wx = F.weather || new Float32Array(n);
  // a good year speeds growth and softens the winter; a bad one the other way round
  const gAt = j => (g0 > 0 ? g0 * (1 + P.weather * wx[j]) : g0 * (1 - P.weather * wx[j]));
  const eaten = F.list.map(() => new Float32Array(n));
  // predators eat first: what they take is split over their prey by how much of each is about
  for (const s of F.list) {
    if (s.role !== 'predator' || !s.prey.length) continue;
    for (let j = 0; j < n; j++) {
      const pr = s.N[j]; if (pr <= 0) continue;
      let avail = 0; for (const q of s.prey) avail += F.list[q].N[j];
      if (avail <= 0) { s.N[j] -= pr * P.starve; continue; }
      const sat = avail / (avail + P.half), take = Math.min(avail * 0.5, P.predation * P.trophic * pr * sat);
      for (const q of s.prey) eaten[q][j] += take * F.list[q].N[j] / avail;
      // fed predators breed in the good seasons; hungry ones die off; never past their habitat
      const Kp = Math.max(s.K[j], 1e-4);
      const g = gAt(j);
      s.N[j] += pr * (P.growth * Math.max(0, g) * sat * (1 - pr / Kp) - P.starve * (1 - sat) - (g < 0 ? -g * 0.3 : 0));
    }
  }
  for (const [k, s] of F.list.entries()) {
    if (s.role === 'spirit') continue;
    if (s.role === 'prey') for (let j = 0; j < n; j++) {
      const N0 = s.N[j], K = s.K[j];
      const g = gAt(j);
      // logistic growth; a hard winter thins even a herd below its capacity
      s.N[j] = K > 0 ? N0 + P.growth * g * N0 * (g > 0 ? 1 - N0 / K : 1) - eaten[k][j] : N0 * 0.5;
    }
    diffuse(F, s.N, s.K, P.diffuse * s.speed, tmp);
    for (let j = 0; j < n; j++) if (s.N[j] < P.floor * Math.max(s.K[j], 0.05)) s.N[j] = 0;
  }
  return F.list.map(s => { let t = 0; for (const v of s.N) t += v; return t; });
}

// how many of a species live in a world cell against how many its biomes could hold (0 — none);
// for the cell card and later the region's faunaShift
export function faunaAt(a, i, id) {
  const F = a.fauna; if (!F) return 0;
  const s = F.list[F.idx[id]], j = (((i / a.w) | 0) / F.c | 0) * F.W + ((i % a.w) / F.c | 0);
  return s.K[j] > 0 ? s.N[j] / s.K[j] : 0;
}
export const faunaCell = (a, i) => (((i / a.w) | 0) / a.fauna.c | 0) * a.fauna.W + ((i % a.w) / a.fauna.c | 0);
