// Fields (data/crops.js). A field building ploughs plots around its shed (b.plots); each plot is
// {i: cell, crop: id | null, g: growth 0…1}. The 'farm' job sows empty plots in a sowing season
// (one seed each, the crop the colony needs most of those it has seed for) and reaps ripe ones.
// Growth follows the season's `grow`; the first frost of winter kills what is still unripe.
import {CROPS} from '../data/crops.js';
import {T} from '../data/terrain.js';
import {DAY} from '../core/time.js';
import {season} from '../data/seasons.js';
import {isCampArea} from '../world/grid.js';
import {colonists, foodTotal} from './query.js';
import {log} from '../core/log.js';
import {perTick} from '../core/util.js';

const EVERY = 10;
export const PLOTS = 16;

export const fields = w => w.buildings.filter(b => b.done && b.plots && b.key === 'field');

// plough plots around a finished field (FINISH_HOOKS in settlement/buildings.js)
export function plowField(w, b) {
  const g = w.grid, cand = [];
  for (let yy = -3; yy <= 4; yy++) for (let xx = -3; xx <= 4; xx++) {
    const x = b.x + xx, y = b.y + yy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    const j = y * w.w + x;
    if ((g.terr[j] === T.GRASS || g.terr[j] === T.BURNT || g.terr[j] === T.FOREST) && g.bld[j] < 0 && !isCampArea(w, j)) cand.push([j, xx * xx + yy * yy]);
  }
  cand.sort((p, q) => p[1] - q[1]);
  b.plots = [];
  for (const [j] of cand.slice(0, PLOTS)) {
    g.terr[j] = T.GRASS; g.bush[j] = 0; g.food[j] = 0; g.wood[j] = 0; g.fuel[j] = 0.2; g.bld[j] = b.id;
    b.plots.push({i: j, crop: null, g: 0});
  }
  w.nav.dirty('fieldwork');
}

// what the colony would sow now: the neediest crop it has seed for, in a sowing season
export const sowable = w => perTick(w, 'sowable', () => {
  const s = season(w).id, pop = colonists(w).length;
  const ctx = {pop, food: foodTotal(w), stock: id => w.stock[id] || 0};
  let best = null, bv = 0;
  for (const c of CROPS.all()) {
    if (!c.sow.includes(s) || (w.stock[c.seed] || 0) < 1) continue;
    const v = c.need(ctx); if (v > bv) { bv = v; best = c; }
  }
  return best;
});

export const ripe = p => p.crop && p.g >= 1;
export const needsWork = (w, p) => ripe(p) || (!p.crop && !!sowable(w));

export function plotAt(w, i) {
  for (const b of fields(w)) { const p = b.plots.find(x => x.i === i); if (p) return p; }
  return null;
}

export function stepFarms(w) {
  if (w.tick % EVERY) return;
  const S = season(w);
  // the first frost: whatever is still unripe in the ground is lost
  if (S.frost != null && w.tick % DAY < EVERY && w.tick / DAY % 30 < 1) {
    let lost = 0;
    for (const b of fields(w)) for (const p of b.plots) if (p.crop && p.g < 1) { p.crop = null; p.g = 0; lost++; }
    if (lost) log(w, `Мороз побил несжатые посевы: ${lost} грядок пропало.`, 'weather', 'notice');
  }
  let ripened = false;
  for (const b of fields(w)) for (const p of b.plots) {
    if (!p.crop || p.g >= 1) continue;
    if (w.grid.fire[p.i] > 0) { p.crop = null; p.g = 0; continue; }
    p.g = Math.min(1, p.g + EVERY * S.grow / (CROPS.get(p.crop).days * DAY));
    if (p.g >= 1) ripened = true;
  }
  if (ripened) w.nav.dirty('fieldwork');
}

// sow or reap the plot at cell i; returns what was reaped ({resource: n}) or null
export function workPlot(w, i) {
  const p = plotAt(w, i); if (!p) return null;
  if (ripe(p)) {
    const c = CROPS.get(p.crop), got = {...c.yields};
    const back = Math.floor(c.seedBack) + (w.rng() < c.seedBack % 1 ? 1 : 0);
    if (back) got[c.seed] = (got[c.seed] || 0) + back;
    p.crop = null; p.g = 0; w.nav.dirty('fieldwork');
    w.stats.reaped = (w.stats.reaped || 0) + 1;
    return got;
  }
  if (!p.crop) {
    const c = sowable(w); if (!c) return null;
    w.stock[c.seed] -= 1; p.crop = c.id; p.g = 0; w.nav.dirty('fieldwork');
  }
  return null;
}
