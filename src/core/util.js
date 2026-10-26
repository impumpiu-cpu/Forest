// Small helpers shared by every module.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// gendered word: g(a, 'пошёл', 'пошла')
export const g = (a, m, f) => (a?.gender === 'f' ? f : m);

export function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
}

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// weighted choice: items is [[value, weight], ...]
export function weighted(rng, items) {
  const total = items.reduce((s, it) => s + Math.max(0, it[1]), 0);
  let r = rng() * total;
  for (const [v, w] of items) { r -= Math.max(0, w); if (r <= 0) return v; }
  return items.length ? items[items.length - 1][0] : undefined;
}

// A value computed at most once per tick: perTick(w, 'orders', () => …). Kept in w.scratch, which
// is never saved (see world/save.js), so it may hold anything, functions included. Only for answers
// that depend on this tick's state alone; slower caches that must survive a save go in w.cache.
export function perTick(w, key, make) {
  const s = w.scratch || (w.scratch = {tick: w.tick});
  if (s.tick !== w.tick) { for (const k of Object.keys(s)) delete s[k]; s.tick = w.tick; }
  return key in s ? s[key] : (s[key] = make());
}

// the distance between two things with x, y (agents, towns, lairs); between two cells of a grid of width a.w by index
export const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
export const cellDist = (a, i, j) => Math.hypot(i % a.w - j % a.w, ((i / a.w) | 0) - ((j / a.w) | 0));
