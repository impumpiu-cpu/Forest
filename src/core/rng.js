// Deterministic random numbers: the same seed and settings give the same world.

// The whole simulation draws from one stream (w.rng), so a seed plus the same player actions
// always give the same story. `rng.state` reads or restores the position in the stream (saves).
export function mulberry(a) {
  const rng = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  Object.defineProperty(rng, 'state', {get: () => a | 0, set: v => { a = v | 0; }});
  return rng;
}

// any text works as a seed: digits are used as is, words are hashed (FNV-1a)
export function seedNumber(text) {
  const t = String(text).trim();
  if (/^\d{1,9}$/.test(t)) return +t;
  let h = 2166136261;
  for (const ch of t) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
