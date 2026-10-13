// Layer 1: fields on the grid. Heat diffuses and drifts with the wind (semi-Lagrangian advection,
// as in stable fluids), smoke spreads and fades, fire burns fuel and ignites overheated dry cells.
import {clamp} from '../core/util.js';
import {ambientTemp, nightness} from '../core/time.js';
import {T} from '../data/terrain.js';
import {isCampArea, distToCamp2} from './grid.js';
import {burnBuilding} from '../settlement/buildings.js';
import {burnStock, spoil, campFuel, burnCampFuel} from '../settlement/stock.js';
import {colonists} from '../settlement/query.js';

// Fire model knobs. Wet ground (high fertility) is harder to ignite and puts fires out by itself.
export const FIRE = {cap: 320, heat: 46, pF: 0.011, pG: 0.005, burn: 0.03, wetIgn: 80, outBase: 0.002, outWet: 0.012, ignForest: 80, ignGrass: 120};

// the wind is the same over the whole map, so where each column and row samples from is worked out
// once per call (per column and per row), not per cell; the arithmetic per cell is unchanged
function advect(w, src, dst, ux, uy) {
  const W = w.w, H = w.h;
  if (ux === 0 && uy === 0) { dst.set(src); return; }
  const X0 = new Int32Array(W), TX = new Float64Array(W), Y0 = new Int32Array(H), TY = new Float64Array(H);
  for (let x = 0; x < W; x++) { const sx = clamp(x - ux, 0, W - 1.001); X0[x] = sx | 0; TX[x] = sx - X0[x]; }
  for (let y = 0; y < H; y++) { const sy = clamp(y - uy, 0, H - 1.001); Y0[y] = sy | 0; TY[y] = sy - Y0[y]; }
  for (let y = 0; y < H; y++) {
    const ty = TY[y], row = Y0[y] * W, out = y * W;
    for (let x = 0; x < W; x++) {
      const tx = TX[x], i0 = row + X0[x];
      dst[out + x] = (src[i0] * (1 - tx) + src[i0 + 1] * tx) * (1 - ty) + (src[i0 + W] * (1 - tx) + src[i0 + W + 1] * tx) * ty;
    }
  }
}

// smoke is skipped entirely while there is none: no fire burning and the last puff has thinned
// to nothing (w.stats.smokeMax is the densest smoke cell after the last step)
const SMOKE_GONE = 0.002;

function heatAndSmoke(w) {
  const g = w.grid, W = w.w, H = w.h, amb = ambientTemp(w), rain = w.weather.rain, st = w.stats;
  const smokeOn = st.fireCount > 0 || (st.smokeMax ?? 1) >= SMOKE_GONE;
  if (smokeOn) { advect(w, g.smoke, g.smoke2, w.wind.x, w.wind.y); [g.smoke, g.smoke2] = [g.smoke2, g.smoke]; }
  else if (st.smokeMax > 0) { g.smoke.fill(0); g.smoke2.fill(0); st.smokeMax = 0; }
  advect(w, g.temp, g.temp2, w.wind.x * 0.35, w.wind.y * 0.35); [g.temp, g.temp2] = [g.temp2, g.temp];
  const {temp, temp2, smoke, smoke2, fire, terr} = g;
  let smax = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, l = x > 0 ? i - 1 : i, r = x < W - 1 ? i + 1 : i, u = y > 0 ? i - W : i, d = y < H - 1 ? i + W : i;
    const Tc = temp[i], relax = terr[i] === T.WATER ? 0.05 : 0.012;
    const Tn = Tc + 0.15 * (temp[l] + temp[r] + temp[u] + temp[d] - 4 * Tc) + (relax + rain * 0.03) * (amb - Tc) + fire[i] * FIRE.heat;
    temp2[i] = Tn > FIRE.cap ? FIRE.cap : Tn;
    if (!smokeOn) continue;
    const Sm = smoke[i], Sn = Sm + 0.12 * (smoke[l] + smoke[r] + smoke[u] + smoke[d] - 4 * Sm) - 0.012 * Sm + fire[i] * 0.25;
    const sv = Sn > 4 ? 4 : Sn;
    smoke2[i] = sv; if (sv > smax) smax = sv;
  }
  [g.temp, g.temp2] = [g.temp2, g.temp];
  if (smokeOn) { [g.smoke, g.smoke2] = [g.smoke2, g.smoke]; st.smokeMax = smax; }
}

// the campfire is a heat source fed from the stock: wood, then charcoal, then coal
function campfire(w) {
  const cold = colonists(w).some(a => a.needs.warmth < 0.6);
  w.campLit = !!campFuel(w) && (nightness(w.tick) > 0.3 || cold);
  if (!w.campLit) return;
  burnCampFuel(w, 0.004);
  for (const c of w.camp.cells) if (w.grid.temp[c] < 30) w.grid.temp[c] += 3.2;
}

function burn(w) {
  const g = w.grid, rain = w.weather.rain, st = w.stats;
  const ignF = FIRE.ignForest + w.climate.ign, ignG = FIRE.ignGrass + w.climate.ign;
  st.fireCount = 0; st.fireNearCamp = 0;
  for (let i = 0; i < w.n; i++) {
    const f = g.fire[i];
    if (f > 0) {
      const wet = g.fert[i];
      g.fuel[i] -= FIRE.burn * f;
      let nf = g.fuel[i] > 0.15 ? Math.min(1, f + 0.05 * (1 - rain)) : f * 0.85;
      if (w.rng() < FIRE.outBase + FIRE.outWet * wet) nf *= 0.6;   // a wet patch chokes the flame
      nf -= rain * 0.045;
      if (g.fuel[i] <= 0) g.fuel[i] = 0;
      if (nf < 0.03) {
        g.fire[i] = 0;
        if (g.fuel[i] < 0.25) {   // burnt out completely
          if (g.terr[i] !== T.WATER && g.terr[i] !== T.ROCK) g.terr[i] = T.BURNT;
          g.wood[i] = 0; g.food[i] = 0; g.bush[i] = 0; st.burntCells++;
          w.nav.dirty('trees'); w.nav.dirty('berries');
          if (g.bld[i] >= 0) burnBuilding(w, g.bld[i]);
        } else { g.wood[i] = Math.min(g.wood[i], Math.max(0, g.fuel[i] - 1.2)); w.nav.dirty('trees'); }   // scorched but standing
      } else g.fire[i] = nf;
      if (g.fire[i] > 0) {
        st.fireCount++;
        if (distToCamp2(w, i) < 400) st.fireNearCamp++;
        if (isCampArea(w, i)) burnStock(w, 0.0015);
      }
    } else if (g.fuel[i] > 0.12) {
      const forest = g.fuel[i] > 1, wet = g.fert[i];
      if (g.temp[i] > (forest ? ignF : ignG) + FIRE.wetIgn * wet &&
          w.rng() < (forest ? FIRE.pF : FIRE.pG) * (1 - 0.6 * wet) * (1 - 0.9 * rain)) { g.fire[i] = 0.2; w.nav.dirty('fire'); }
    }
  }
}

// planted garden bushes regrow fast; the well cools the camp area; wild plants regrow slowly
function growth(w) {
  const g = w.grid;
  for (const c of w.gardenCells) if (g.bush[c] && g.fire[c] === 0 && g.food[c] < 1) {
    g.food[c] = Math.min(1, g.food[c] + 0.0035); if (g.food[c] > 0.35 && g.food[c] < 0.354) w.nav.dirty('berries');
  }
  if (w.mods.add.coolCamp) for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) {
    const x = w.camp.x + xx, y = w.camp.y + yy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    const j = y * w.w + x; if (g.temp[j] > 40) g.temp[j] -= (g.temp[j] - 40) * 0.08;
  }
  const samples = Math.round(160 * w.n / 12288 * w.climate.regrow);
  for (let k = 0; k < samples; k++) {
    const i = (w.rng() * w.n) | 0; if (g.fire[i] > 0 || g.bld[i] >= 0) continue;
    const t = g.terr[i], f = g.fert[i];
    if (t === T.BURNT) { if (w.rng() < 0.02) { g.terr[i] = T.GRASS; g.fuel[i] = 0.1; } }
    else if (t === T.GRASS) {
      if (g.fuel[i] < 0.4) g.fuel[i] = Math.min(0.4, g.fuel[i] + 0.02);
      if (g.bush[i]) { g.food[i] = Math.min(1, g.food[i] + 0.05 * f); if (g.food[i] > 0.35) w.nav.dirty('berries'); }
      else if (!isCampArea(w, i) && w.rng() < 0.0025 * f) { g.bush[i] = 1; g.food[i] = 0.1; g.fuel[i] += 0.2; }
      if (w.rng() < 0.0015 * f && f > 0.55 && !isCampArea(w, i)) { g.terr[i] = T.FOREST; g.wood[i] = 0.3; g.fuel[i] = 1.5; g.bush[i] = 0; }
    } else if (t === T.FOREST && g.wood[i] < 1) { g.wood[i] = Math.min(1, g.wood[i] + 0.03); g.fuel[i] = 1.2 + g.wood[i]; }
  }
}

export function stepFields(w) {
  heatAndSmoke(w);
  campfire(w);
  burn(w);
  growth(w);
  spoil(w);
}
