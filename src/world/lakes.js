// Lakes: connected bodies of water found once at world generation. A lake big enough
// (FISHING.minCells) holds fish: a finite stock that people fish down and that slowly comes back.
import {T} from '../data/terrain.js';
import {DAY} from '../core/time.js';
import {log} from '../core/log.js';

export const FISHING = {
  minCells: 40,        // smaller ponds have no fish worth catching
  perCell: 0.3,        // fish a lake can hold per cell of water…
  maxStock: 90,        // …up to this many
  growth: 0.25,        // logistic growth per day: fastest when the lake is half full, none when full
  trickle: 0.008,      // share of capacity that swims in per day even into an emptied lake
  reopenAt: 0.5,       // a fished-out lake is left alone until it is this full again
};

// worth fishing: has fish and is not resting after being fished out
export const fishable = l => l.cap > 0 && !l.resting && l.fish >= 1;

export function findLakes(w) {
  const {terr} = w.grid, W = w.w, H = w.h;
  const lakeId = new Int16Array(w.n).fill(-1), lakes = [];
  const stack = [];
  for (let s = 0; s < w.n; s++) {
    if (terr[s] !== T.WATER || lakeId[s] >= 0) continue;
    const id = lakes.length, cells = [];
    lakeId[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(); cells.push(i);
      const x = i % W, y = (i / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (terr[j] === T.WATER && lakeId[j] < 0) { lakeId[j] = id; stack.push(j); }
      }
    }
    const cap = cells.length >= FISHING.minCells ? Math.min(FISHING.maxStock, Math.round(cells.length * FISHING.perCell)) : 0;
    lakes.push({id, size: cells.length, cap, fish: cap});
  }
  w.grid.lake = lakeId;
  w.lakes = lakes;
}

// the lake with fish next to a shore cell (4 neighbours), or null; minFish 0 accepts any lake that can hold fish
export function lakeBeside(w, i, minFish) {
  const x = i % w.w, y = (i / w.w) | 0;
  for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
    if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
    const id = w.grid.lake[ny * w.w + nx];
    const l = id >= 0 ? w.lakes[id] : null;
    if (l && l.cap && (minFish === 0 || (minFish == null ? fishable(l) : l.fish >= minFish))) return l;
  }
  return null;
}

// fish come back on their own: a full lake barely grows, a half-fished one recovers fastest,
// an emptied one only by the few fish that swim in, so it takes weeks to fill again
export function stepLakes(w) {
  for (const l of w.lakes) {
    if (!l.cap || l.fish >= l.cap) continue;
    if (l.fish < 1 && !l.resting) { l.resting = true; w.nav?.dirty('shore'); log(w, `Озеро в ${l.size} клеток выловлено до последней рыбы. Рыба вернётся не скоро.`, 'wildlife'); }
    const perDay = FISHING.growth * l.fish * (1 - l.fish / l.cap) + FISHING.trickle * l.cap;
    l.fish = Math.min(l.cap, l.fish + perDay / DAY);
    if (l.resting && l.fish >= l.cap * FISHING.reopenAt) { l.resting = false; w.nav?.dirty('shore'); log(w, `В озеро в ${l.size} клеток вернулась рыба.`, 'wildlife'); }
  }
}

export const fishTotals = w => w.lakes.reduce((s, l) => [s[0] + l.fish, s[1] + l.cap], [0, 0]);
