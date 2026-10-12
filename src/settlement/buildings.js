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

const ending = d => (d.gender === 'f' ? 'а' : '');

export function canAfford(w, cost) { return Object.entries(cost).every(([r, v]) => (w.stock[r] || 0) >= v); }

export function missing(w, cost) {
  return Object.entries(cost).filter(([r, v]) => (w.stock[r] || 0) < v).map(([r, v]) => [r, Math.ceil(v - (w.stock[r] || 0))]);
}

// can the colony consider this building at all (ignoring cost)?
export function eligible(w, key) {
  const d = BUILDINGS.get(key);
  return count(w, key, true) < d.max && (!d.needs || has(w, d.needs)) && (!d.available || d.available(w));
}

// a 2×2 lot on dry land, in a ring around the camp, away from other buildings.
// near: 'fish' looks further out (up to 24 cells) for a lot on the shore of a lake with fish.
function findLot(w, near) {
  if (near === 'fish') { const lot = findLot(w, 'fish-shore'); if (lot >= 0) return lot; }
  const shore = near === 'fish-shore', R = shore ? 24 : 14;
  const g = w.grid; let best = -1, bd = 1e9;
  for (let y = w.camp.y - R; y <= w.camp.y + R - 1; y++) for (let x = w.camp.x - R; x <= w.camp.x + R - 1; x++) {
    if (x < 1 || y < 1 || x >= w.w - 2 || y >= w.h - 2) continue;
    const d = (x + 1 - w.camp.x) ** 2 + (y + 1 - w.camp.y) ** 2; if (d < 25 || d >= bd) continue;
    let ok = true;
    for (let yy = -1; yy <= 2 && ok; yy++) for (let xx = -1; xx <= 2; xx++) {
      const j = (y + yy) * w.w + x + xx, inner = xx >= 0 && xx <= 1 && yy >= 0 && yy <= 1;
      if (g.bld[j] >= 0 || (inner && (!walkable(w, j) || g.fire[j] > 0 || isCampArea(w, j)))) { ok = false; break; }
    }
    if (ok && shore) ok = [0, 1, w.w, w.w + 1].some(o => lakeBeside(w, y * w.w + x + o, 0));
    if (ok) { bd = d; best = y * w.w + x; }
  }
  return best;
}

export function laySite(w, key) {
  const d = BUILDINGS.get(key);
  if (!eligible(w, key) || !canAfford(w, d.cost)) return null;
  const lot = findLot(w, d.near);
  if (lot < 0) { log(w, 'Вокруг лагеря не осталось места под постройку.', 'build'); return null; }
  for (const [r, v] of Object.entries(d.cost)) w.stock[r] -= v;
  const b = {id: w.bldSeq++, key, x: lot % w.w, y: (lot / w.w) | 0, progress: 0, done: false, cells: []};
  const g = w.grid;
  for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
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
  plantGarden(w, b) {
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
  w.nav.dirty('sites'); w.nav.dirty('rockface');
  for (const id of w.nav.order) if (id.startsWith('station:')) w.nav.dirty(id);
  log(w, `Построен${ending(d)} <b>${d.name.toLowerCase()}</b>. ${d.effect}`, 'build');
  w.chronicle.built.push({key: b.key, tick: w.tick, by: by?.name});
  const ctx = {building: d.name.toLowerCase(), f: d.gender === 'f'};
  for (const a of w.agents) if (a.faction === 'colony' && !a.dead) think(w, a, a === by ? 'finishedBuilding' : 'newBuilding', ctx);
}

export function burnBuilding(w, id) {
  const b = buildingById(w, id); if (!b) return;
  for (const j of b.cells) w.grid.bld[j] = -1;
  w.buildings = w.buildings.filter(x => x !== b);
  if (b.plots) { const own = new Set(b.plots); w.gardenCells = w.gardenCells.filter(j => !own.has(j)); }
  recomputeMods(w);
  recomputeZone(w);
  w.nav.dirty('sites');
  const d = BUILDINGS.get(b.key);
  log(w, `${b.done ? 'Сгорел' + ending(d) : 'Сгорела стройка:'} <b>${d.name.toLowerCase()}</b>.`, 'build', 'alert');
}

export const resLabel = id => RESOURCES.get(id).label;
