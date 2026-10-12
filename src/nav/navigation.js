// Layer 2: navigation. One Dijkstra distance map per NAVMAPS entry; agents walk downhill.
// Maps rebuild on a round-robin schedule (sparser on big worlds) and when marked dirty.
import {NAVMAPS} from '../data/navmaps.js';
import {BY_CODE, WALKABLE} from '../data/terrain.js';
import {DX, DY} from '../world/grid.js';

export const FAR = 1e9;
// rebuild pacing, in ticks (multiplied by `every` on big maps); a navmap may override minGap/period
const MIN_GAP = 24, PERIOD = 600, REFRESH_BURNING = 24;

export class Navigation {
  constructor(world) {
    this.w = world;
    const n = world.n;
    this.dist = {};
    for (const d of NAVMAPS.all()) this.dist[d.id] = new Float64Array(n).fill(FAR);
    this.dirtySet = new Set(NAVMAPS.ids());
    this.order = NAVMAPS.ids();
    this.last = Object.fromEntries(this.order.map(id => [id, -Infinity]));   // tick of the last rebuild
    this.cost = new Float32Array(n);
    this.closed = new Uint8Array(n);
    this.heapI = new Int32Array(n * 9);
    this.heapD = new Float64Array(n * 9);
    // bigger maps rebuild each field less often, so a tick stays cheap
    this.every = Math.max(1, Math.round(n / 12288));
  }

  get(id) { return this.dist[id]; }
  dirty(id) { this.dirtySet.add(id); }

  // fire, heat and smoke make cells expensive; `hazard` scales that for the escape map
  computeCost(hazard) {
    const g = this.w.grid, cost = this.cost;
    for (let i = 0; i < this.w.n; i++) {
      const t = g.terr[i];
      if (!WALKABLE[t]) { cost[i] = -1; continue; }
      let c = BY_CODE[t].pathCost + (g.fire[i] * 60 + g.smoke[i] * 1.5) * hazard;
      if (g.temp[i] > 45) c += (g.temp[i] - 45) * 0.3 * hazard;
      cost[i] = c;
    }
  }

  build(id) {
    const def = NAVMAPS.get(id), w = this.w, W = w.w, H = w.h;
    const dist = this.dist[id], cost = this.cost, closed = this.closed, hI = this.heapI, hD = this.heapD;
    this.computeCost(def.hazard ?? 1);
    const ctx = def.prepare ? def.prepare(w) : null;
    dist.fill(FAR); closed.fill(0);
    let hn = 0;
    const push = (i, d) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hD[p] <= d) break; hI[k] = hI[p]; hD[k] = hD[p]; k = p; } hI[k] = i; hD[k] = d; };
    for (let i = 0; i < w.n; i++) if (cost[i] >= 0 && def.seed(w, i, ctx)) { dist[i] = 0; push(i, 0); }
    while (hn > 0) {
      const i = hI[0], d = hD[0];
      hn--; const li = hI[hn], ld = hD[hn]; let k = 0;
      for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && hD[c + 1] < hD[c]) c++; if (hD[c] >= ld) break; hI[k] = hI[c]; hD[k] = hD[c]; k = c; }
      hI[k] = li; hD[k] = ld;
      if (closed[i] || d > dist[i]) continue; closed[i] = 1;
      const x = i % W, y = (i / W) | 0;
      for (let q = 0; q < 8; q++) {
        const nx = x + DX[q], ny = y + DY[q]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; let c = cost[j]; if (c < 0) continue;
        if (q >= 4) { if (cost[y * W + nx] < 0 || cost[ny * W + x] < 0) continue; c *= 1.414; }
        const nd = d + c; if (nd < dist[j]) { dist[j] = nd; push(j, nd); }
      }
    }
    this.dirtySet.delete(id);
    this.last[id] = w.tick;
  }

  buildAll() { for (const id of this.order) this.build(id); }

  // Which map to rebuild this tick. Fields are not rebuilt on a blind round-robin any more:
  //  · a map marked dirty is rebuilt, but not more often than every `minGap` ticks (berries get
  //    dirty almost every tick while bushes regrow, and the field barely changes);
  //  · a clean map is refreshed every `period` ticks — or every REFRESH_BURNING while something
  //    burns, because fire and smoke change the cost of every path;
  //  · urgent maps (escape from fire) refresh every other slot while they are active.
  // At most one regular map per slot, the most overdue one, so a tick stays cheap.
  step() {
    const w = this.w;
    if (w.tick % this.every !== 0) return;
    const t = w.tick, burning = w.stats.fireCount > 0, k = this.every;
    let best = null, bestOver = 1;
    for (const d of NAVMAPS.all()) {
      const dirty = this.dirtySet.has(d.id);
      if (d.urgent) { if ((dirty || d.active(w)) && t - this.last[d.id] >= 2 * k) this.build(d.id); continue; }
      if (!dirty && d.active && !d.active(w)) continue;
      const due = (dirty ? d.minGap ?? MIN_GAP : burning ? REFRESH_BURNING : d.period ?? PERIOD) * k;
      const over = (t - this.last[d.id]) / due;
      if (over >= bestOver) { best = d.id; bestOver = over; }
    }
    if (best) this.build(best);
  }
}
