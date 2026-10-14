// Construction: picking a lot, laying a site, finishing it, losing it to fire.
import {BUILDINGS} from '../data/buildings.js';
import {RESOURCES} from '../data/resources.js';
import {T} from '../data/terrain.js';
import {log} from '../core/log.js';
import {walkable, isCampArea} from '../world/grid.js';
import {count, has, buildingById} from './query.js';
import {recomputeMods} from './mods.js';
import {recomputeZone} from './zone.js';
import {lakeBeside} from '../world/lakes.js';
import {think} from '../agents/mind.js';
import {ambientTemp, DAY, HOUR} from '../core/time.js';
import {plowField} from './farming.js';

const ending = d => (d.gender === 'f' ? 'а' : d.gender === 'pl' ? 'ы' : d.gender === 'n' ? 'о' : '');

// can the colony pay for it and still keep the fire going? Wood for a few cold nights is never spent on building
export const fuelReserve = w => (ambientTemp(w, w.tick - (w.tick % DAY) + 3 * HOUR) < 6 ? 10 : 4);
export function canAfford(w, cost) {
  return Object.entries(cost).every(([r, v]) => (w.stock[r] || 0) >= v + (r === 'wood' ? fuelReserve(w) : 0));
}

export function missing(w, cost) {
  const need = (r, v) => v + (r === 'wood' ? fuelReserve(w) : 0);
  return Object.entries(cost).filter(([r, v]) => (w.stock[r] || 0) < need(r, v)).map(([r, v]) => [r, Math.ceil(need(r, v) - (w.stock[r] || 0))]);
}

// can the colony consider this building at all (ignoring cost)?
export function eligible(w, key) {
  const d = BUILDINGS.get(key);
  return !d.captureOnly && count(w, key, true) < d.max && (!d.needs || has(w, d.needs)) && (!d.available || d.available(w))
    && (!d.key || (w.stock[d.key] || 0) >= 1);   // a town-made tool it cannot be built without
}

export const lotSize = d => d.lot || [2, 2];

// average fertility of a lot (fields and gardens grow by it)
export function lotFertility(w, x, y, lw, lh) {
  let s = 0;
  for (let yy = 0; yy < lh; yy++) for (let xx = 0; xx < lw; xx++) s += w.grid.fert[(y + yy) * w.w + x + xx];
  return s / (lw * lh);
}

// A lot of the building's size (`lot`, default 2×2) on dry land around the camp, with a free ring
// around it. Ordinary buildings take the nearest one; `soil: true` (fields, gardens) weigh the
// ground: a lot a few cells further out on much better soil wins. `near: 'fish'` looks further out
// (up to 24 cells) for a lot on the shore of a lake with fish.
function findLot(w, d, near = d.near) {
  if (near === 'fish') { const lot = findLot(w, d, 'fish-shore'); if (lot >= 0) return lot; }
  const shore = near === 'fish-shore', [lw, lh] = lotSize(d), R = shore ? 24 : d.soil ? 20 : 14;
  const g = w.grid; let best = -1, bs = Infinity;
  for (let y = w.camp.y - R; y <= w.camp.y + R - 1; y++) for (let x = w.camp.x - R; x <= w.camp.x + R - 1; x++) {
    if (x < 1 || y < 1 || x + lw >= w.w || y + lh >= w.h) continue;
    const d2 = (x + lw / 2 - w.camp.x) ** 2 + (y + lh / 2 - w.camp.y) ** 2; if (d2 < 25) continue;
    if (!d.soil && d2 >= bs) continue;
    let ok = true;
    for (let yy = -1; yy <= lh && ok; yy++) for (let xx = -1; xx <= lw; xx++) {
      const j = (y + yy) * w.w + x + xx, inner = xx >= 0 && xx < lw && yy >= 0 && yy < lh;
      if (g.bld[j] >= 0 || (inner && (!walkable(w, j) || g.fire[j] > 0 || isCampArea(w, j)))) { ok = false; break; }
    }
    if (!ok) continue;
    if (shore && ![0, 1, w.w, w.w + 1].some(o => lakeBeside(w, y * w.w + x + o, 0))) continue;
    // soil: every 0.1 of fertility is worth walking 3 cells further
    const score = d.soil ? Math.sqrt(d2) - 30 * lotFertility(w, x, y, lw, lh) : d2;
    if (score < bs) { bs = score; best = y * w.w + x; }
  }
  return best;
}

export function laySite(w, key) {
  const d = BUILDINGS.get(key);
  if (!eligible(w, key) || !canAfford(w, d.cost)) return null;
  const lot = findLot(w, d);
  if (lot < 0) { log(w, 'Вокруг лагеря не осталось места под постройку.', 'build'); return null; }
  for (const [r, v] of Object.entries(d.cost)) w.stock[r] -= v;
  if (d.key) recomputeMods(w);   // a tool left the stock
  const [lw, lh] = lotSize(d);
  const b = {id: w.bldSeq++, key, x: lot % w.w, y: (lot / w.w) | 0, w: lw, h: lh, progress: 0, done: false, cells: []};
  const g = w.grid;
  for (let yy = 0; yy < lh; yy++) for (let xx = 0; xx < lw; xx++) {
    const j = (b.y + yy) * w.w + b.x + xx; b.cells.push(j);
    g.bld[j] = b.id; g.terr[j] = T.GRASS; g.bush[j] = 0; g.food[j] = 0; g.wood[j] = 0; g.fuel[j] = d.wooden ? 0.9 : 0;
  }
  w.buildings.push(b);
  recomputeZone(w);
  for (const id of ['sites', 'berries', 'trees']) w.nav.dirty(id);
  log(w, `Заложен${ending(d)} ${d.name.toLowerCase()}. Нужно ${d.work} человеко-тиков работы.`, 'build');
  return b;
}

// custom effects that need more than modifiers; referenced by name from data/buildings.js
const FINISH_HOOKS = {
  plowField,
  // a garden of the new kind (a lot of its own): every cell of it is a berry bush
  plantGarden(w, b) {
    if (b.w > 2) {
      const g = w.grid; b.plots = [];
      for (const j of b.cells) { g.bush[j] = 1; g.food[j] = 0.5; g.fuel[j] = 0.6; w.gardenCells.push(j); b.plots.push(j); }
      w.nav.dirty('berries'); return;
    }
    const g = w.grid, cand = [];
    for (let yy = -4; yy <= 5; yy++) for (let xx = -4; xx <= 5; xx++) {
      const x = b.x + xx, y = b.y + yy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const j = y * w.w + x;
      if ((g.terr[j] === T.GRASS || g.terr[j] === T.BURNT) && g.bld[j] < 0 && !isCampArea(w, j) && !g.bush[j]) cand.push([j, xx * xx + yy * yy]);
    }
    cand.sort((p, q) => p[1] - q[1]);
    b.plots = [];
    for (const [j] of cand.slice(0, 12)) { g.terr[j] = T.GRASS; g.bush[j] = 1; g.food[j] = 0.5; g.fuel[j] = 0.6; g.fert[j] = 1; w.gardenCells.push(j); b.plots.push(j); }
    w.nav.dirty('berries');
  },
};

export function addLabour(w, b, amount, by) {
  if (b.done) return;
  b.progress += amount;
  const d = BUILDINGS.get(b.key);
  if (b.progress < d.work) return;
  b.done = true;
  recomputeMods(w);
  if (d.onFinish) (typeof d.onFinish === 'function' ? d.onFinish : FINISH_HOOKS[d.onFinish])(w, b);
  w.nav.dirty('sites'); w.nav.dirty('rockface'); w.nav.dirty('warm'); w.nav.dirty('healer');
  for (const id of w.nav.order) if (id.startsWith('station:')) w.nav.dirty(id);
  log(w, `Построен${ending(d)} <b>${d.name.toLowerCase()}</b>. ${d.effect}`, 'build');
  w.chronicle.built.push({key: b.key, tick: w.tick, by: by?.name});
  const ctx = {building: d.name.toLowerCase(), f: d.gender === 'f'};
  for (const a of w.agents) if (a.faction === 'colony' && !a.dead) think(w, a, a === by ? 'finishedBuilding' : 'newBuilding', ctx);
}

export function burnBuilding(w, id) {
  const b = buildingById(w, id); if (!b) return;
  for (const j of b.cells) w.grid.bld[j] = -1;
  for (const p of b.plots || []) if (p.i != null) w.grid.bld[p.i] = -1;   // a field's plots
  w.buildings = w.buildings.filter(x => x !== b);
  if (b.plots) { const own = new Set(b.plots); w.gardenCells = w.gardenCells.filter(j => !own.has(j)); }
  recomputeMods(w);
  recomputeZone(w);
  w.nav.dirty('sites'); w.nav.dirty('warm'); w.nav.dirty('healer');
  const d = BUILDINGS.get(b.key);
  log(w, `${b.done ? 'Сгорел' + ending(d) : 'Сгорела стройка:'} <b>${d.name.toLowerCase()}</b>.`, 'build', 'alert');
}

export const resLabel = id => RESOURCES.get(id).label;
