// The ways over the net of towns, as a matrix for the season (docs/WORLD.md «Деньги городов»): from every living town to every
// other — the cheapest way by the links' costs (atlas/roads.js: the road worn there), the weakest link on it, the least
// roaded, the number of links — twice over: within the province (the links of one realm: the buyer's own sellers, realmPool)
// and over all the links the caravans of history walk (the links of realms that trade, no route abroad already made:
// farNet — the ways through other lands, farWays). Worked out once as the season's buying opens, with one search from each
// town (a binary heap over typed arrays), and read as rows after: before Ver_D each buyer searched for itself, and the
// province's search scanned every town for its nearest at each step — a square of the towns for every town.
// A way through other lands is the cheapest over all the links; the realms it crosses are read off it after (`via`), and a
// way that crosses more than TOWN_MONEY.trade.through of them is not taken (before Ver_D the search itself kept within
// `through`, so a dearer way round could still be found: the caravans go no roundabout way now).
import {TOWN_MONEY} from '../data/townBuildings.js';
import {trades} from './diplomacy.js';
import {linkKey} from './common.js';

const T = () => TOWN_MONEY.trade;
// the cost of a link's way: what its road costs to walk (atlas/roads.js, worked out as its road is worn), else by its length
export const costOfLink = (a, l) => l.cost ?? Math.hypot(l.p.x - l.q.x, l.p.y - l.q.y) * T().step;

// one search from `s` over a CSR graph (`off`, `to`, `w`, `lk` — the link's index), into the row `s` of the matrix
function search(G, s, n, M, heapI, heapD) {
  const {off, to, w, lc, lr} = G, row = s * n, cost = M.cost, c = M.c, road = M.road, hop = M.hop, prev = M.prev, link = M.link;
  for (let j = 0; j < n; j++) { cost[row + j] = Infinity; prev[row + j] = -1; link[row + j] = -1; hop[row + j] = 0; }
  cost[row + s] = 0; c[row + s] = 1; road[row + s] = 1;
  let hn = 0;
  const push = (i, d) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (heapD[p] <= d) break; heapI[k] = heapI[p]; heapD[k] = heapD[p]; k = p; } heapI[k] = i; heapD[k] = d; };
  push(s, 0);
  while (hn > 0) {
    const i = heapI[0], d = heapD[0];
    hn--; const li = heapI[hn], ld = heapD[hn]; let k = 0;
    for (;;) { let x = 2 * k + 1; if (x >= hn) break; if (x + 1 < hn && heapD[x + 1] < heapD[x]) x++; if (heapD[x] >= ld) break; heapI[k] = heapI[x]; heapD[k] = heapD[x]; k = x; }
    heapI[k] = li; heapD[k] = ld;
    if (d > cost[row + i]) continue;
    for (let e = off[i]; e < off[i + 1]; e++) {
      const j = to[e], nd = d + w[e];
      if (nd < cost[row + j]) { cost[row + j] = nd; c[row + j] = Math.min(c[row + i], lc[e]); road[row + j] = Math.min(road[row + i], lr[e]); hop[row + j] = hop[row + i] + 1; prev[row + j] = i; link[row + j] = G.lk[e]; push(j, nd); }
    }
  }
}
// a CSR graph of the links that `take`
function graph(a, n, at, links, take) {
  const deg = new Int32Array(n + 1), es = [];
  links.forEach((l, k) => { if (!take(l)) return; const p = at.get(l.p.id), q = at.get(l.q.id); if (p == null || q == null) return; es.push([p, q, k], [q, p, k]); deg[p + 1]++; deg[q + 1]++; });
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const off = deg, to = new Int32Array(es.length), w = new Float64Array(es.length), lc = new Float64Array(es.length), lr = new Float64Array(es.length), lk = new Int32Array(es.length), fill = Int32Array.from(off.subarray(0, n));
  for (const [p, q, k] of es) { const e = fill[p]++, l = links[k]; to[e] = q; w[e] = costOfLink(a, l); lc[e] = l.c; lr[e] = l.road || 0; lk[e] = k; }
  return {off, to, w, lc, lr, lk};
}
const matrix = n => ({cost: new Float64Array(n * n), c: new Float64Array(n * n), road: new Float64Array(n * n), hop: new Int16Array(n * n), prev: new Int32Array(n * n), link: new Int32Array(n * n)});

// the matrices of the season: `towns` — the living towns of the season's money (or those the links name), `links` — its links
export function waysMatrix(a, towns, links) {
  const ts = towns || [...new Set(links.flatMap(l => [l.p, l.q]))], n = ts.length, at = new Map(ts.map((t, k) => [t.id, k]));
  const prov = graph(a, n, at, links, l => l.p.realm === l.q.realm), all = graph(a, n, at, links, l => !l.via && trades(a, l.p.realm, l.q.realm));
  const P = matrix(n), A = matrix(n), heapI = new Int32Array(Math.max(16, all.to.length + n)), heapD = new Float64Array(heapI.length);
  for (let s = 0; s < n; s++) { search(prov, s, n, P, heapI, heapD); search(all, s, n, A, heapI, heapD); }
  const W = {towns: ts, n, at, links, prov: P, all: A,
    // the links of a way, as keys, from `s` to `t` (atlas/treasury.js setHops: a trade route's way over the net)
    hops(M, s, t) { const out = []; for (let x = t; x !== s && x >= 0; x = M.prev[s * n + x]) { const l = links[M.link[s * n + x]]; if (!l) break; out.push(linkKey(l.p, l.q)); } return out.reverse(); },
    // the realms a way crosses between its ends, in the way's order, each once
    via(M, s, t) { const out = []; for (let x = M.prev[s * n + t]; x !== s && x >= 0; x = M.prev[s * n + x]) { const r = ts[x].realm; if (r !== ts[s].realm && r !== ts[t].realm && !out.includes(r)) out.push(r); } return out.reverse(); }};
  return W;
}

// the province's pool: every seller of its realm a buyer reaches over the realm's links, by the cheapest way, and the pair's own
// link if they have one (a neighbour, or a trade route made before) → Map buyer id → [[seller, way]]
export function provincePool(a, W) {
  const out = new Map(), P = W.prov, n = W.n;
  for (let s = 0; s < n; s++) {
    const b = W.towns[s], L = [];
    for (let t = 0; t < n; t++) {
      if (t === s || P.cost[s * n + t] === Infinity) continue;
      const o = W.towns[t], w = {c: P.c[s * n + t], cost: P.cost[s * n + t], road: P.road[s * n + t], hop: P.hop[s * n + t], pair: a.net?.links.get(linkKey(b, o)) || null, src: s, dst: t, M: P, W};
      if (w.pair?.cost != null && w.hop > 1) w.cost = Math.min(w.cost, w.pair.cost);
      L.push([o, w]);
    }
    if (L.length) { L.sort((p, q) => p[0].id - q[0].id); out.set(b.id, L); }
  }
  return out;
}
// from buyer `b`, the ways through other lands to each town of another realm it deals with and has no way to yet (`known`): no
// farther than its carriage doubles the price, crossing no more than `through` realms between theirs → [[seller, way]]
export function farRow(a, W, b, known, deal, cap) {
  const s = W.at.get(b.id); if (s == null) return [];
  const A = W.all, n = W.n, out = [];
  for (let t = 0; t < n; t++) {
    const o = W.towns[t], cost = A.cost[s * n + t];
    if (t === s || cost === Infinity || cost > cap || o.realm === b.realm || known.has(o.id) || !(deal(b, o) > 0)) continue;
    const via = W.via(A, s, t);
    if (via.length > T().through) continue;
    out.push([o, {c: A.c[s * n + t], cost, road: A.road[s * n + t], via, pair: a.net?.links.get(linkKey(b, o)) || null, src: s, dst: t, M: A, W}]);
  }
  return out.sort((p, q) => p[0].id - q[0].id);
}
