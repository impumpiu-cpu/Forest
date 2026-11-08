// The caravan's camp set up for the night, on the local map (docs/CAMPAIGN.md «Обустройство стоянки»; the numbers:
// data/camp.js CAMP_WORKS; what is planned from what the caravan brought: campaign/works.js planWorks): the chores as
// things on the map, taken up and made by the company (agents/behaviours/campwork.js), and what a finished one does.
// w.works = [{id, key, cells, x, y (the middle), progress, ticks, done, by}]: `cells` — the cells it stands on (a stake
// is one work a cell); `by` — the id of the one at it now; w.works.plan — what the planning left for the night.
import {CAMP_WORKS} from '../data/camp.js';
import {T, BY_CODE} from '../data/terrain.js';
import {log} from '../core/log.js';
import {atHour} from '../core/time.js';

const W = () => CAMP_WORKS, MID = 1 / 2;
export const worksOf = w => w.works || [];
export const workDone = (w, key) => worksOf(w).some(x => x.key === key && x.done);

// a cell for a thing: `r` from the fire about the angle `ang`, on open ground that is nobody's — the nearest such on the ring
export function spotNear(w, r, ang, taken, n = 1) {
  const cx = w.camp.x + MID, cy = w.camp.y + MID;
  for (let k = 0; k < 24; k++) {
    const a = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * W().place.step;
    const cells = [];
    for (let m = 0; m < n; m++) {
      const x = Math.floor(cx + Math.cos(a) * r + Math.cos(a + Math.PI / 2) * (m - (n - 1) / 2)), y = Math.floor(cy + Math.sin(a) * r + Math.sin(a + Math.PI / 2) * (m - (n - 1) / 2));
      const i = y * w.w + x;
      if (!freeCell(w, x, y, taken)) { cells.length = 0; break; }
      cells.push(i);
    }
    if (cells.length === n) return cells;
  }
  return null;
}
// ground a thing may stand on: dry land one can walk (a wood is cleared for it), not the road, nobody's
export const freeCell = (w, x, y, taken) => x >= 1 && y >= 1 && x < w.w - 1 && y < w.h - 1 && (() => { const i = y * w.w + x, t = w.grid.terr[i]; return BY_CODE[t].walkable && BY_CODE[t].kind !== 'water' && t !== T.SWAMP && t !== T.ROAD && t !== T.STAKES && w.grid.bld[i] < 0 && !w.camp.set.has(i) && !taken.has(i); })();

export function addWork(w, key, cells, ticks, extra = {}) {
  const xs = cells.map(i => i % w.w), ys = cells.map(i => (i / w.w) | 0);
  const x = xs.reduce((s, v) => s + v, 0) / cells.length + MID, y = ys.reduce((s, v) => s + v, 0) / cells.length + MID;
  const work = {id: (w.workSeq = (w.workSeq || 0) + 1), key, cells, x, y, progress: 0, ticks, done: ticks <= 0, by: null, ...extra};
  w.works.push(work);
  if (work.done) finish(w, work, true);
  return work;
}

// what a finished thing does to the map
function finish(w, work, silent = false) {
  work.done = true; work.by = null;
  if (work.key === 'stakes') for (const i of work.cells) { const g = w.grid; g.terr[i] = T.STAKES; g.bush[i] = 0; g.food[i] = 0; g.wood[i] = 0; g.fuel[i] = BY_CODE[T.STAKES].fuel; for (const id of ['camp', 'zone', 'sites', 'berries', 'trees']) w.nav.dirty(id); }
  if (silent) return;
  const label = W()[work.key].label;
  if (work.key === 'stakes') { const left = worksOf(w).filter(x => x.key === 'stakes' && !x.done).length; if (!left) log(w, `Судесы вбиты: лагерь обнесён кольями${work.cut ? ', нарубленными на месте' : ''}.`, 'build'); return; }
  log(w, `${label[0].toUpperCase()}${label.slice(1)} — готово.`, 'build');
}

// the chore for `a` to take up: the nearest not done that nobody is at (a stake set is one cell's work; the others one pair
// of hands each); null when there is nothing
export function workFor(w, a) {
  let best = null, bd = Infinity;
  for (const x of worksOf(w)) {
    if (x.done || (x.by != null && x.by !== a.id)) continue;
    const d = Math.hypot(x.x - a.x, x.y - a.y) + (x.key === 'stakes' ? 0 : -2);   // (the things by the fire first, the ring after)
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}
export const workById = (w, id) => worksOf(w).find(x => x.id === id) || null;
// a tick of work on `x` by `a`: done at `ticks`
export function workOn(w, a, x) {
  x.by = a.id; x.progress++;
  if (x.progress >= x.ticks) finish(w, x);
}
export const inSetup = w => w.tick - w.campaign.start < atHour(w, W().setup.hours);

// the tether's place, for the beasts (agents/behaviours/penned.js): the middle of the posts, or null
export function tetherAt(w) { const t = worksOf(w).find(x => x.key === 'tether' && x.done); return t ? [t.x, t.y] : null; }

// a tick of the camp (campaign/camp.js stepCamp): the smoking rack turns fresh meat into jerky while it stands
export function stepWorks(w) {
  if (!w.works) return;
  const S = W().smoke, P = w.works.plan;
  // a stop's hunt brought fresh meat: a smoking rack is wanted (once)
  if (P?.stop && !P.smoked && (w.stock.meat || 0) >= S.min) { P.smoked = true; const taken = new Set(worksOf(w).flatMap(x => x.cells)); const cells = spotNear(w, S.at, P.a0 + W().place.smoke, taken, 1); if (cells) addWork(w, 'smoke', cells, P.stood ? 0 : S.ticks); }
  if (workDone(w, 'smoke') && (w.stock.meat || 0) > 0) { const d = Math.min(w.stock.meat, S.perTick); w.stock.meat -= d; w.stock.jerky = (w.stock.jerky || 0) + d * S.jerky; }
}

