// Value noise for the world map. Each call takes its own random stream, so a stage that adds or
// drops an octave does not shift the noise of the other stages.

function layer(rnd, w, h, cell, out, weight) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = rnd();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0;
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    out[y * w + x] += ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) * weight;
  }
}

// fractal noise normalised to 0..1; `base` is the size of the largest features in cells
export function fbm(rnd, w, h, base, octaves = 6, gain = 0.5) {
  const out = new Float32Array(w * h);
  let cell = base, wt = 1;
  for (let o = 0; o < octaves && cell >= 1; o++) { layer(rnd, w, h, cell, out, wt); cell /= 2; wt *= gain; }
  let mn = Infinity, mx = -Infinity;
  for (const v of out) { if (v < mn) mn = v; if (v > mx) mx = v; }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn || 1);
  return out;
}
