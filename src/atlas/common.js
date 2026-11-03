// Small helpers the systems of the world map share: their own random streams kept in the world by position, a draw
// between two numbers, and the keys of the pairs (two realms; two towns of a link, road or sea lane).
import {mulberry, seedNumber} from '../core/rng.js';

// a system's own stream (seed:atlas:<name>), kept by its position in the world at a.<key> → {r, done()}; done() saves it
export function stream(a, key, name) {
  const r = mulberry(a[key] ?? seedNumber(`${a.cfg.seed}:atlas:${name}`));
  return {r, done: () => { a[key] = r.state; }};
}
// a number drawn between lo and hi
export const between = (r, [lo, hi]) => lo + r() * (hi - lo);
// the key of two realms in a.rel, a.contacts («r1:r4», the lesser first)
export const relKey = (p, q) => (p < q ? `${p}:${q}` : `${q}:${p}`);
// the key of two towns in the net, the roads and the sea lanes (the lesser id first)
export const linkKey = (p, q) => Math.min(p.id, q.id) * 100000 + Math.max(p.id, q.id);
// how many wars a realm is in now (a.rel; atlas/diplomacy.js)
export const warsOf = (a, id) => { let n = 0; for (const [k, x] of Object.entries(a.rel || {})) if (x.war && k.split(':').includes(String(id))) n++; return n; };
