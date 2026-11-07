// The season's frame (docs/WORLD.md «Кадр сезона»): what a pass over the towns asks again and again — which towns live and
// of which realm, how far two towns are, whether two realms deal — worked out once as the pass opens and read as matrices
// while it runs. A pass is a stretch of the season in which these do not change: the towns' money (seasonMoney), the
// people's moving (migrate), the councils' sittings (stepNeeds), the builds (stepBuilds). Where something of it does change
// inside a pass — a town founded or razed, a town changing its realm — the place of the change calls frameChanged, and the
// frame is made again on the next ask. Relations between realms change in the court's and the diplomats' steps, never
// inside these passes, so the deals hold for a pass.
// Nothing here is saved (atlas/save.js SCRATCH): a world loaded has no frame until a pass opens one.
import {trades as tradesOf} from './diplomacy.js';

// the frame open now, or null (outside a pass everything is asked of the world itself)
export const frameOf = a => (a.frameOn ? (a.frame ||= makeFrame(a)) : null);
export const frameChanged = a => { if (a) a.frame = null; };
// the realms' metals (atlas/economy.js realmMetals) are kept on the frame too: made again when a town's buildings or stores
// change inside a pass (atlas/towns.js builtChanged, atlas/treasury.js doBuild)
export const metalsChanged = a => { if (a?.frame) a.frame.metals = null; };
// a pass: the frame is open while `fn` runs
export function withFrame(a, fn) {
  const was = a.frameOn; a.frameOn = true; a.frame = null;
  try { return fn(); } finally { a.frameOn = was; a.frame = null; }
}

function makeFrame(a) {
  const towns = (a.towns || []).filter(t => t.alive), n = towns.length, at = new Map(), byRealm = new Map();
  towns.forEach((t, k) => { at.set(t.id, k); if (t.realm != null) { let L = byRealm.get(t.realm); if (!L) byRealm.set(t.realm, L = []); L.push(t); } });
  // the distances between the living towns, by their places in `towns`
  const dist = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = Math.hypot(towns[i].x - towns[j].x, towns[i].y - towns[j].y); dist[i * n + j] = d; dist[j * n + i] = d; }
  // the realms (every id that a town or a relation names), and whether two of them deal
  const realms = [...new Set([...(a.realms || []).map(r => r.id), ...towns.map(t => t.realm).filter(r => r != null)])], ri = new Map(realms.map((r, k) => [r, k])), R = realms.length;
  const tr = new Uint8Array(R * R);
  for (let p = 0; p < R; p++) for (let q = 0; q < R; q++) tr[p * R + q] = tradesOf(a, realms[p], realms[q]) ? 1 : 0;
  return {step: a.hist?.step ?? -1, towns, at, byRealm, n, dist, realms, ri, R, tr};
}

// the living towns of a town's realm (itself alone with no realm), in the world's order
export function realmTowns(a, t) {
  const F = frameOf(a);
  if (F) return t.realm == null ? [t] : F.byRealm.get(t.realm) || [];
  return t.realm == null ? [t] : (a.towns || []).filter(x => x.alive && x.realm === t.realm);
}
// how far two towns are
export function townDist(a, t, o) {
  const F = frameOf(a), i = F?.at.get(t.id), j = F?.at.get(o.id);
  return i != null && j != null ? F.dist[i * F.n + j] : Math.hypot(t.x - o.x, t.y - o.y);
}
// whether two realms deal — from the frame when one is open (atlas/diplomacy.js trades asks it first)
export function tradesFramed(a, p, q) {
  const F = a.frameOn && a.frame; if (!F) return null;
  const i = F.ri.get(p), j = F.ri.get(q);
  return i != null && j != null ? F.tr[i * F.R + j] === 1 : null;
}
