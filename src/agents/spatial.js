// Who is near a point. Every brain asks «who is within r of me» several times a tick, and walking
// the whole list of creatures for each question grows as the square of their number. The creatures
// are binned once per tick into cells of CELL × CELL map cells (perTick, so the bins are never
// saved), and a question reads the bins its circle touches. The answer keeps the order of w.agents,
// so that whoever used to win a tie («the first of the nearest») still wins it.
import {perTick} from '../core/util.js';

const CELL = 8;

function bins(w) {
  return perTick(w, 'agentBins', () => {
    const bw = Math.ceil(w.w / CELL), bh = Math.ceil(w.h / CELL), cells = new Array(bw * bh);
    const ags = w.agents;
    for (let k = 0; k < ags.length; k++) {
      const a = ags[k];
      const bx = Math.min(bw - 1, Math.max(0, (a.x / CELL) | 0)), by = Math.min(bh - 1, Math.max(0, (a.y / CELL) | 0));
      const c = by * bw + bx; (cells[c] || (cells[c] = [])).push(k);
    }
    return {bw, bh, cells, ags};
  });
}

// the creatures within r of (x, y) — a square prefilter; the caller checks the exact distance.
// For a radius wider than the map it is simply the whole list.
export function nearAgents(w, x, y, r) {
  const B = bins(w), {bw, bh, cells, ags} = B;
  if (r >= Math.max(w.w, w.h)) return ags;
  const x0 = Math.max(0, ((x - r) / CELL) | 0), x1 = Math.min(bw - 1, ((x + r) / CELL) | 0);
  const y0 = Math.max(0, ((y - r) / CELL) | 0), y1 = Math.min(bh - 1, ((y + r) / CELL) | 0);
  const idx = [];
  for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) { const c = cells[by * bw + bx]; if (c) for (const k of c) idx.push(k); }
  if (y1 - y0 > 0 && x1 - x0 > 0) idx.sort((p, q) => p - q);   // several bins: back into list order
  const out = new Array(idx.length); for (let k = 0; k < idx.length; k++) out[k] = ags[idx[k]];
  return out;
}
