// Run a game without any screen: the same simulation the browser runs, sampled once a day.
// Used by the balance runner (tools/balance.mjs); any other front end can drive the core the same way.
import {newGame, step} from './sim.js';
import {DAY} from './core/time.js';
import {sampleMetrics} from './data/metrics.js';

// → {rows: [{day, ...metrics}], end: {day, reason} | null, ticks, msPerTick, perf}
export function simulate(cfg, {days = 30, onDay} = {}) {
  const t0 = performance.now();
  const w = newGame(cfg), start = w.tick, rows = [];
  for (let d = 1; d <= days && !w.over; d++) {
    for (let t = 0; t < DAY && !w.over; t++) step(w);
    const row = {day: w.over ? +((w.tick - start) / DAY).toFixed(2) : d, ...sampleMetrics(w)};
    rows.push(row);
    onDay?.(row, w);
  }
  const ticks = w.tick - start, ms = performance.now() - t0;
  return {rows, ticks, msPerTick: ms / Math.max(1, ticks), perf: {...w.perf},
    end: w.over ? {day: +((w.over.tick - start) / DAY).toFixed(2), reason: w.over.reason} : null, world: w};
}
