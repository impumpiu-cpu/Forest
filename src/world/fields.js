// Layer 1: fields on the grid. Heat diffuses and drifts with the wind (semi-Lagrangian advection,
// as in stable fluids), smoke spreads and fades, fire burns fuel and ignites overheated dry cells.
//
// Heat is kept as the DEVIATION from the air (grid.heat, °C): a cell's temperature is the air's
// temperature plus its deviation (tempAt). Ground that nothing warms lies at an exact zero and is
// not computed at all: the map is cut into chunks (CHUNK × CHUNK cells, 8 × 8), and a chunk is active only
// while something in it burns, smokes or holds heat; the pass runs over active chunks and the ring
// of chunks around them (heat and smoke move one cell a tick). Anything that heats a cell from
// outside the pass (the campfire, hearths, lightning, a torch, a click) calls touchHeat so that
// the chunk wakes up. A chunk that has gone quiet is zeroed, so nothing stale lingers in it.
import {clamp} from '../core/util.js';
import {nightness, scaleOf} from '../core/time.js';
import {CHUNK, HEAT_EPS, SMOKE_EPS, chunks, airTemp, touchHeat, ensureHeat} from './heat.js';
export {CHUNK, chunks, chunkOf, airTemp, tempAt, heatTo, coolTo, touchHeat, ensureHeat} from './heat.js';
import {T, BY_CODE} from '../data/terrain.js';
import {isCampArea, distToCamp2} from './grid.js';
import {burnBuilding} from '../settlement/buildings.js';
import {burnStock, spoil, campFuel, burnCampFuel} from '../settlement/stock.js';
import {colonists} from '../settlement/query.js';
import {season} from '../data/seasons.js';
import {BUILDINGS} from '../data/buildings.js';
import {watchOnPost, WATCH} from '../settlement/board.js';
import {FIRE, GROWTH} from '../data/nature.js';

export {FIRE};   // (data/nature.js)
// the set of chunks the pass must visit: the active ones and a ring of one chunk around them
// (heat and smoke move one cell a tick, so nothing escapes the ring in one step)
function planChunks(w) {
  const c = chunks(w), {cw, ch, active} = c;
  const todo = c.todo ??= new Uint8Array(cw * ch);
  todo.fill(0);
  let any = false;
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    if (!active[cy * cw + cx]) continue;
    any = true;
    for (let y = Math.max(0, cy - 1); y <= Math.min(ch - 1, cy + 1); y++) for (let x = Math.max(0, cx - 1); x <= Math.min(cw - 1, cx + 1); x++) todo[y * cw + x] = 1;
  }
  return any;
}

// where each column and row samples from under this wind: worked out once per wind, not per call
// (the wind changes rarely). Kept beside the world, never in it, so it is not saved
const TABLES = new WeakMap();
function sampling(w, ux, uy) {
  let m = TABLES.get(w); if (!m) TABLES.set(w, (m = new Map()));
  const key = ux + ':' + uy;   // smoke drifts with the full wind, heat with a third of it: two tables
  let t = m.get(key); if (t) return t;
  if (m.size >= 4) m.clear();
  const W = w.w, H = w.h;
  const X0 = new Int32Array(W), TX = new Float32Array(W), Y0 = new Int32Array(H), TY = new Float32Array(H);
  for (let x = 0; x < W; x++) { const sx = clamp(x - ux, 0, W - 1.001); X0[x] = sx | 0; TX[x] = sx - X0[x]; }
  for (let y = 0; y < H; y++) { const sy = clamp(y - uy, 0, H - 1.001); Y0[y] = sy | 0; TY[y] = sy - Y0[y]; }
  m.set(key, (t = {X0, TX, Y0, TY}));
  return t;
}

// semi-Lagrangian step of `src` into `dst` over the chunks flagged in `set`. A flagged chunk is
// written in full; the one-cell halo of a flagged chunk that borders an unflagged one is zeroed,
// so that the diffusion stencil (which reaches one cell out of its chunk) never reads a stale
// value there. The halo lies in a quiet chunk, where the field is below the threshold anyway.
function advect(w, src, dst, ux, uy, set) {
  const W = w.w, H = w.h, c = chunks(w), cw = c.cw, ch = c.ch;
  const still = ux === 0 && uy === 0, tb = still ? null : sampling(w, ux, uy);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    if (!set[cy * cw + cx]) continue;
    const y0 = cy * CHUNK, y1 = Math.min(H, y0 + CHUNK), x0 = cx * CHUNK, x1 = Math.min(W, x0 + CHUNK);
    if (still) for (let y = y0; y < y1; y++) dst.set(src.subarray(y * W + x0, y * W + x1), y * W + x0);
    else {
      const {X0, TX, Y0, TY} = tb;
      for (let y = y0; y < y1; y++) {
        const ty = TY[y], row = Y0[y] * W, out = y * W;
        for (let x = x0; x < x1; x++) {
          const tx = TX[x], i0 = row + X0[x];
          dst[out + x] = (src[i0] * (1 - tx) + src[i0 + 1] * tx) * (1 - ty) + (src[i0 + W] * (1 - tx) + src[i0 + W + 1] * tx) * ty;
        }
      }
    }
    // halo strips in quiet neighbours
    if (cy > 0 && !set[(cy - 1) * cw + cx]) dst.fill(0, (y0 - 1) * W + x0, (y0 - 1) * W + x1);
    if (y1 < H && !set[(cy + 1) * cw + cx]) dst.fill(0, y1 * W + x0, y1 * W + x1);
    if (cx > 0 && !set[cy * cw + cx - 1]) for (let y = y0; y < y1; y++) dst[y * W + x0 - 1] = 0;
    if (x1 < W && !set[cy * cw + cx + 1]) for (let y = y0; y < y1; y++) dst[y * W + x1] = 0;
  }
}

// smoke is skipped entirely while there is none: no fire burning and the last puff has thinned
// to nothing (w.stats.smokeMax is the densest smoke cell after the last step)
function heatAndSmoke(w) {
  const g = w.grid, W = w.w, H = w.h, rain = w.weather.rain, st = w.stats, c = chunks(w);
  if (!g.heat) ensureHeat(w);
  const smokeOn = st.fireCount > 0 || (st.smokeMax ?? 1) >= SMOKE_EPS;
  if (!smokeOn && st.smokeMax > 0) { g.smoke.fill(0); g.smoke2.fill(0); st.smokeMax = 0; }
  st.tempMax = airTemp(w) + (st.heatMax ?? 0);
  if (!planChunks(w)) { st.heatMax = 0; st.tempMax = airTemp(w); st.anyFire = false; return; }
  const {todo, active, cw} = c;
  if (smokeOn) { advect(w, g.smoke, g.smoke2, w.wind.x, w.wind.y, todo); [g.smoke, g.smoke2] = [g.smoke2, g.smoke]; }
  advect(w, g.heat, g.heat2, w.wind.x * 0.35, w.wind.y * 0.35, todo);
  // after the swap `heat` holds the advected field (valid on `todo` and its halo), `heat2` the field from the tick
  // before; the diffusion pass writes heat2 on `todo` and swaps back, so grid.heat stays one array
  [g.heat, g.heat2] = [g.heat2, g.heat];
  const {heat, heat2, smoke, smoke2, fire, terr} = g;
  let smax = 0, hmax = 0, anyFire = false;
  for (let cy = 0; cy < c.ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const ci = cy * cw + cx;
    if (!todo[ci]) continue;
    const y0 = cy * CHUNK, y1 = Math.min(H, y0 + CHUNK), x0 = cx * CHUNK, x1 = Math.min(W, x0 + CHUNK);
    let cmax = 0, csm = 0, cfire = false;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x, l = x > 0 ? i - 1 : i, r = x < W - 1 ? i + 1 : i, u = y > 0 ? i - W : i, d = y < H - 1 ? i + W : i;
      const Dc = heat[i], relax = terr[i] === T.WATER ? 0.05 : 0.012;
      let Dn = Dc + 0.15 * (heat[l] + heat[r] + heat[u] + heat[d] - 4 * Dc) - (relax + rain * 0.03) * Dc + fire[i] * FIRE.heat;
      if (Dn > FIRE.cap) Dn = FIRE.cap;
      heat2[i] = Dn;
      const ad = Dn < 0 ? -Dn : Dn; if (ad > cmax) cmax = ad;
      if (fire[i] > 0) cfire = true;
      if (!smokeOn) continue;
      const Sm = smoke[i], Sn = Sm + 0.12 * (smoke[l] + smoke[r] + smoke[u] + smoke[d] - 4 * Sm) - 0.012 * Sm + fire[i] * 0.25;
      const sv = Sn > 4 ? 4 : Sn;
      smoke2[i] = sv; if (sv > csm) csm = sv;
    }
    // quiet now: zero the chunk so that nothing stale lingers, and let it sleep
    const live = cfire || cmax >= HEAT_EPS || csm >= SMOKE_EPS;
    active[ci] = live ? 1 : 0;
    if (!live) for (let y = y0; y < y1; y++) { heat2.fill(0, y * W + x0, y * W + x1); if (smokeOn) smoke2.fill(0, y * W + x0, y * W + x1); }
    if (cmax > hmax) hmax = cmax; if (csm > smax) smax = csm; if (cfire) anyFire = true;
  }
  [g.heat, g.heat2] = [g.heat2, g.heat];
  if (smokeOn) { [g.smoke, g.smoke2] = [g.smoke2, g.smoke]; st.smokeMax = smax; }
  st.heatMax = hmax; st.tempMax = airTemp(w) + hmax; st.anyFire = anyFire;
}

// the campfire is a heat source fed from the stock: wood, then charcoal, then coal
function campfire(w) {
  const cold = colonists(w).some(a => a.needs.warmth < 0.6);
  w.campLit = !!campFuel(w) && (nightness(w) > 0.3 || cold);
  if (!w.campLit) return;
  burnCampFuel(w, 0.004 * (watchOnPost(w) ? WATCH.fuel : 1) / scaleOf(w));   // (the fire burns by the sun: core/time.js dayScale)   // a watchman tends it: less wood (settlement/board.js)
  const g = w.grid, amb = airTemp(w);
  for (const c of w.camp.cells) if (g.heat[c] < 30 - amb) { g.heat[c] += 3.2; touchHeat(w, c); }
  // lived-in buildings keep a hearth of their own on the same stock (data/buildings.js `heat`):
  // a drafty hut burns a lot and stays cool, a log house holds heat on little wood. Hay bedding
  // (a little each day) makes a hut a few degrees warmer.
  const hay = (w.stock.hay || 0) >= 1;
  for (const b of w.buildings) {
    const H = b.done && BUILDINGS.get(b.key).heat; if (!H) continue;
    if (!burnCampFuel(w, H.fuel / scaleOf(w))) continue;
    let to = H.to;
    if (hay && b.key === 'hut') { to += 5; w.stock.hay -= 0.0003; }
    for (const c of b.cells) if (g.heat[c] < to - amb) { g.heat[c] += H.add; touchHeat(w, c); }
  }
}

// a wooden building is fuel (data/buildings.js `wooden`): its cells hold at least FIRE.wooden of it, as a wood does —
// it catches as readily and burns as long; kept up every FIRE.woodEvery ticks (a new building, a mended one). A field
// (its plots) is no timber: its own fuel is what the plough leaves (settlement/farming.js)
function woodFuel(w) {
  const g = w.grid;
  for (const b of w.buildings) if (b.done && BUILDINGS.get(b.key).wooden && !b.plots) for (const c of b.cells) if (g.fuel[c] < FIRE.wooden && !(g.fire[c] > 0)) g.fuel[c] = FIRE.wooden;
}

function burn(w) {
  if (w.tick % FIRE.woodEvery === 0) woodFuel(w);
  const g = w.grid, rain = w.weather.rain, st = w.stats, c = chunks(w), W = w.w, H = w.h, amb = airTemp(w);
  const sig = season(w).ignite, ignF = FIRE.ignForest + w.climate.ign + sig, ignG = FIRE.ignGrass + w.climate.ign + sig;
  st.fireCount = 0; st.fireNearCamp = 0;
  // nothing burns and nowhere is hot enough to catch: the whole pass would change nothing
  // (fire set this tick by lightning or a click is caught by the next heat pass)
  if (!st.anyFire && st.tempMax != null && st.tempMax < Math.min(ignF, ignG)) return;
  // fire and ground hot enough to catch lie in active chunks by construction (a cell that burns
  // or holds heat keeps its chunk awake), so only those are walked
  for (let cy = 0; cy < c.ch; cy++) for (let cx = 0; cx < c.cw; cx++) {
    if (!c.active[cy * c.cw + cx]) continue;
    const y0 = cy * CHUNK, y1 = Math.min(H, y0 + CHUNK), x0 = cx * CHUNK, x1 = Math.min(W, x0 + CHUNK);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) burnCell(w, g, y * W + x, rain, st, amb, ignF, ignG);
  }
}

function burnCell(w, g, i, rain, st, amb, ignF, ignG) {
  const f = g.fire[i];
  if (f > 0) {
    const wet = Math.max(g.fert[i], BY_CODE[g.terr[i]].wet);
    g.fuel[i] -= FIRE.burn * f;
    let nf = g.fuel[i] > 0.15 ? Math.min(1, f + 0.05 * (1 - rain)) : f * 0.85;
    if (w.rngs.fire() < FIRE.outBase + FIRE.outWet * wet) nf *= 0.6;   // a wet patch chokes the flame
    nf -= rain * 0.045;
    if (g.fuel[i] <= 0) g.fuel[i] = 0;
    if (nf < 0.03) {
      g.fire[i] = 0;
      if (g.fuel[i] < 0.25) {   // burnt out completely
        if (g.terr[i] !== T.WATER && g.terr[i] !== T.ROCK) g.terr[i] = T.BURNT;
        g.wood[i] = 0; g.food[i] = 0; g.bush[i] = 0; st.burntCells++;
        g.fert[i] = Math.min(1, g.fert[i] + 0.08);   // ash feeds the ground
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
    const forest = g.fuel[i] > 1, wet = Math.max(g.fert[i], BY_CODE[g.terr[i]].wet);
    if (amb + g.heat[i] > (forest ? ignF : ignG) + FIRE.wetIgn * wet &&
        w.rngs.fire() < (forest ? FIRE.pF : FIRE.pG) * (1 - 0.6 * wet) * (1 - 0.9 * rain)) { g.fire[i] = 0.2; w.nav.dirty('fire'); touchHeat(w, i); }
  }
}

// planted garden bushes regrow fast; the well cools the camp area; wild plants regrow slowly
function growth(w) {
  const g = w.grid, S = season(w), G = GROWTH;
  for (const c of w.gardenCells) if (S.garden > 0 && g.bush[c] && g.fire[c] === 0 && g.food[c] < 1) {
    g.food[c] = Math.min(1, g.food[c] + G.garden * S.garden * (G.gardenSoil[0] + G.gardenSoil[1] * g.fert[c]));   // good soil, more berries
    if (g.food[c] > G.ripe && g.food[c] < G.ripeTo) w.nav.dirty('berries');   // ripe enough: the berry field must know
  }
  if (w.mods.add.coolCamp) {
    const amb = airTemp(w), lim = G.coolTo - amb, R = G.coolRadius;
    for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
      const x = w.camp.x + xx, y = w.camp.y + yy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const j = y * w.w + x; if (g.heat[j] > lim) g.heat[j] -= (g.heat[j] - lim) * G.coolRate;
    }
  }
  const samples = Math.round(G.samples * w.n / G.samplesPer * w.climate.regrow);
  for (let k = 0; k < samples; k++) {
    const i = (w.rngs.fire() * w.n) | 0; if (g.fire[i] > 0 || g.bld[i] >= 0) continue;
    const t = g.terr[i], f = g.fert[i], d = BY_CODE[t];
    if (t === T.BURNT) { if (w.rngs.fire() < G.burnt) { g.terr[i] = g.under?.[i] || T.GRASS; g.fuel[i] = G.burntFuel; } }
    else if (d.kind === 'ground') {
      if (g.fuel[i] < d.fuel) g.fuel[i] = Math.min(d.fuel, g.fuel[i] + G.fuel);
      if (g.bush[i]) {
        // in season the bush ripens; in winter what is left drops or freezes
        if (S.grow > 0) { g.food[i] = Math.min(1, g.food[i] + G.bush * f * S.grow); if (g.food[i] > G.ripe) w.nav.dirty('berries'); }
        else if (S.wither && g.food[i] > 0) { g.food[i] = Math.max(0, g.food[i] - S.wither * G.wither); if (g.food[i] < G.ripe) w.nav.dirty('berries'); }
      }
      else if (S.grow > 0 && d.bush > 0 && !isCampArea(w, i) && w.rngs.fire() < G.newBush * f * d.bush) { g.bush[i] = 1; g.food[i] = G.newBushFood; g.fuel[i] += G.newBushFuel; }
      if (S.grow > 0 && d.wood > 0 && w.rngs.fire() < G.newWood * f * d.wood && f > G.woodFert && !isCampArea(w, i)) { g.terr[i] = T.FOREST; g.wood[i] = G.newWoodWood; g.fuel[i] = G.newWoodFuel; g.bush[i] = 0; }
    } else if (t === T.FOREST && g.wood[i] < 1) { g.wood[i] = Math.min(1, g.wood[i] + G.forest); g.fuel[i] = G.forestFuel + g.wood[i]; }
  }
}

export function stepFields(w) {
  heatAndSmoke(w);
  campfire(w);
  burn(w);
  growth(w);
  spoil(w);
}
