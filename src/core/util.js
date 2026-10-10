// Small helpers shared by every module.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

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
