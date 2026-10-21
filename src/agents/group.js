// Groups (docs/MIND.md stage 6): the colony, a wild herd, a wolf pack on a hunt, a raiding squad.
// Four different minds over one skeleton — the group knows and announces, the member chooses:
//   members   — by id, plain data on the world; who of them is still there (liveMembers / prune)
//               and where their middle is (middleOf);
//   lookouts  — who looks round for everyone this tick: each member in its turn every N ticks
//               (inTurn: the colony) or a few members a tick, round the group (nextLookouts: a herd);
//   knowledge — what the group has seen, where and when, fading when not seen again
//               (see / fade / seenIds: the colony's flags, a herd's alarm);
//   breaking off — a member that acts on its own (a colonist's reflexes, a beast that bolts, a bull that
//               stands up for the herd) does so in its own brain and is still counted with the group.
// Each group keeps its own data shape and rules; these helpers are only the parts they share, so that
// the same thing is done the same way everywhere.
import {liveById} from './lookup.js';

// the members still there, in the group's own order: alive (liveById), and passing `keep`
export function liveMembers(w, g, keep) {
  const out = [];
  for (const id of g.members) { const a = liveById(w, id); if (a && (!keep || keep(a))) out.push(a); }
  return out;
}

// the same, and the group's list cut down to them; `drop(a)` is told of each member that left alive
export function prune(w, g, keep, drop) {
  const out = [], ids = [];
  for (const id of g.members) {
    const a = liveById(w, id);
    if (a && (!keep || keep(a))) { out.push(a); ids.push(id); } else if (a && drop) drop(a);
  }
  g.members = ids; g.n = ids.length;
  return out;
}

// the middle of a list of creatures
export function middleOf(ms) {
  let x = 0, y = 0;
  for (const a of ms) { x += a.x; y += a.y; }
  return ms.length ? {x: x / ms.length, y: y / ms.length} : null;
}

// lookouts, the colony's way: each member looks round once every `every` ticks, in turn by its id
export const inTurn = (w, a, every) => (w.tick + a.id) % every === 0;

// lookouts, a herd's way: the next `k` members round the group (g.look counts on)
export function nextLookouts(g, ms, k) {
  const out = [];
  for (let i = 0; i < Math.min(k, ms.length); i++) out.push(ms[(g.look++) % ms.length]);
  return out;
}

// knowledge: what a group has seen, {id: {x, y, t}} in g[key]
export function see(g, o, tick, key = 'seen') {
  const s = g[key] ||= {};
  const fresh = !s[o.id];
  s[o.id] = {x: o.x, y: o.y, t: tick};
  return fresh;
}
// forget what was not seen for `ttl` ticks; returns the ids forgotten
export function fade(g, tick, ttl, key = 'seen') {
  const s = g[key], gone = [];
  if (!s) return gone;
  for (const id of Object.keys(s)) if (tick - s[id].t > ttl) { delete s[id]; gone.push(+id); }
  return gone;
}
// where the group last saw them, on average
export function seenMiddle(g, key = 'seen') {
  const pts = Object.values(g[key] || {});
  return pts.length ? middleOf(pts) : null;
}
