// The pieces of terrain on a camp's map (data/pieces.js; plan claude/terrain-pieces-plan.md): stamps laid on the random
// land by rules of their own, as the terrain of a wargame. Called from the generator (world/generate.js makeTerrain)
// twice: before the roads (a scene, or the land's own pieces and the scatter) and after them (the road's pieces, an
// ambush's barricade). Everything here draws from a stream of its own (`seed:pieces`), so the rest of the map is the
// same with pieces or without; a map is laid out only when its site asks for it (`site.layout`: the camps of a campaign
// made since the pieces came — older camps kept to be watched again stay as they were played).
//
// What the generator gets back, in t.pieces: [{id, label, layer, x, y, w, h, anchor, caches}] — `anchor` the cell where
// a scene's guards stand, `caches` the cells of the caches laid (campaign/camp.js makes a chore of each to search it);
// t.scene — {id, label, anchor} of the scene the map was laid out as, or null.
import {mulberry, seedNumber} from '../core/rng.js';
import {T, BY_CODE, OPEN, TERRAIN} from '../data/terrain.js';
import {BIOMES} from '../data/biomes.js';
import {PIECES, LEGEND, DECAY, SCENES, SCENE_OF, PIECE_RULES} from '../data/pieces.js';
import {DX, DY} from './grid.js';

const BIOME_LIST = BIOMES.all();
const BY_ID = new Map(PIECES.map(p => [p.id, p]));
export const pieceOf = id => BY_ID.get(id) || null;
const code = id => (id === 'clear' ? -1 : TERRAIN.get(id).code);
// what a piece may break to keep the map whole: its own walls, columns, palisades and rocks
const BLOCKER = new Set([T.WALL, T.COLUMN, T.PALISADE, T.ROCK]);

// the mask turned `rot` quarters and mirrored: [{dx, dy, ch}], width, height
function shape(mask, rot, mirror) {
  const H = mask.length, W = Math.max(...mask.map(r => r.length)), out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = mask[y][x]; if (!ch || ch === ' ') continue;
    const u = mirror ? W - 1 - x : x, v = y;
    const [dx, dy] = rot === 1 ? [H - 1 - v, u] : rot === 2 ? [W - 1 - u, H - 1 - v] : rot === 3 ? [v, W - 1 - u] : [u, v];
    out.push({dx, dy, ch});
  }
  // the frame of what came out (a blank border of the mask is not part of the piece)
  const mx = Math.min(...out.map(c => c.dx)), my = Math.min(...out.map(c => c.dy));
  for (const c of out) { c.dx -= mx; c.dy -= my; }
  return {cells: out, w: Math.max(...out.map(c => c.dx)) + 1, h: Math.max(...out.map(c => c.dy)) + 1};
}

// which cells can be walked to from cell `from` (four directions and the diagonal rule of the game)
export function reachFrom(t, from) {
  const {w, h, terr} = t, seen = new Uint8Array(w * h), stack = [from]; seen[from] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    for (let q = 0; q < 8; q++) {
      const nx = x + DX[q], ny = y + DY[q]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx; if (seen[j] || !BY_CODE[terr[j]].walkable) continue;
      if (q >= 4 && (!BY_CODE[terr[y * w + nx]].walkable || !BY_CODE[terr[ny * w + x]].walkable)) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  return seen;
}

// ── the layer
export function newLayout(t) {
  const site = t.site, L = site.layout;
  if (!L) return null;
  return {rnd: mulberry(seedNumber(String(site.seed) + ':pieces')), used: new Uint8Array(t.w * t.h), mine: new Uint8Array(t.w * t.h), list: [], scene: null, L};
}

// can piece `p` (its shape `s`) lie with its corner at (x0, y0)? → null, or how much of it falls on bad ground
function fits(t, P, p, s, x0, y0, keep) {
  const {w, h, terr} = t, R = PIECE_RULES, e = R.edge;
  if (x0 < e || y0 < e || x0 + s.w > w - e || y0 + s.h > h - e) return null;
  let bad = 0, rock = 0;
  for (const c of s.cells) {
    const x = x0 + c.dx, y = y0 + c.dy, i = y * w + x;
    if (P.used[i]) return null;
    if (Math.hypot(x - t.cx, y - t.cy) < keep) return null;
    const k = terr[i];
    if (k === T.WATER || k === T.ROAD || k === T.FORD) bad++;
    else if (k === T.ROCK) rock++;
  }
  const n = s.cells.length;
  if (bad / n > R.wet || rock / n > R.rocky) return null;
  // its anchor and its caches where the camp can walk to (a hollow walled in by the land itself is no place for them)
  if (P.reach0) for (const c of s.cells) {
    if (!'Aa$s'.includes(c.ch)) continue;
    const x = x0 + c.dx, y = y0 + c.dy; let seen = false;
    for (let yy = y - 1; yy <= y + 1 && !seen; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h && P.reach0[yy * w + xx]) { seen = true; break; }
    if (!seen) return null;
  }
  // the piece's own ground: the biome under its middle
  if (p.biomes) { const b = BIOME_LIST[t.biome[(y0 + (s.h >> 1)) * w + x0 + (s.w >> 1)] - 1]; if (!b || !p.biomes.includes(b.id)) return null; }
  const beside = (kinds, r) => {
    for (let y = y0 - r; y < y0 + s.h + r; y++) for (let x = x0 - r; x < x0 + s.w + r; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (kinds.includes(terr[y * w + x])) return true;
    }
    return false;
  };
  if (p.nearWater && !beside([T.WATER, T.FORD], p.nearWater)) return null;
  if (p.nearRoad && !beside([T.ROAD], p.nearRoad)) return null;
  return bad;
}

// lay piece `p` with its shape `s` at (x0, y0): the cells, the crumbled walls, the anchor and the caches
function stamp(t, P, p, s, x0, y0, layer) {
  const {w, terr, under} = t, r = P.rnd, cache = (p.cache || 0) > 0 && r() < p.cache;
  const rec = {id: p.id, label: p.label, layer, x: x0, y: y0, w: s.w, h: s.h, anchor: null, caches: []};
  for (const c of s.cells) {
    const x = x0 + c.dx, y = y0 + c.dy, i = y * w + x;
    // a margin of one cell about it stays the piece's own: two pieces never touch
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < t.h) P.used[yy * w + xx] = 1;
    const k = terr[i];
    if (k === T.WATER || k === T.ROAD || k === T.FORD) continue;   // the water and the road stay what they are
    let id = LEGEND[c.ch]; if (!id) continue;
    if (DECAY[id] && r() < (p.decay || 0)) id = DECAY[id];
    const ground = OPEN[under[i]] ? under[i] : T.GRASS;
    terr[i] = id === 'clear' ? ground : code(id);
    if (id === 'clear' || id === 'forest' || BY_CODE[terr[i]].kind === 'built') under[i] = ground;
    P.mine[i] = 1;
    if (c.ch === 'A' || c.ch === 'a') rec.anchor = i;
    if ((c.ch === '$' || c.ch === 's') && cache) rec.caches.push(i);
  }
  P.list.push(rec);
  return rec;
}

// try to lay piece `p` somewhere `where()` offers a corner: → its record, or null
function place(t, P, p, layer, where, keep = PIECE_RULES.keep) {
  const r = P.rnd;
  for (let k = 0; k < PIECE_RULES.tries; k++) {
    const s = shape(p.mask, (r() * 4) | 0, ((r() * 2) | 0) === 1);
    const [x0, y0] = where(s);
    if (fits(t, P, p, s, x0, y0, keep) == null) continue;
    return stamp(t, P, p, s, x0, y0, layer);
  }
  return null;
}
const anywhere = (t, r) => s => [1 + ((r() * (t.w - s.w - 1)) | 0), 1 + ((r() * (t.h - s.h - 1)) | 0)];
// a weighted pick of the pieces that pass `ok`
function pick(r, list) {
  const sum = list.reduce((s, p) => s + (p.weight || 1), 0); if (!sum) return null;
  let v = r() * sum;
  for (const p of list) { v -= p.weight || 1; if (v <= 0) return p; }
  return list[list.length - 1];
}

// which scene a foe brings: its band, its beast, its boss's kind, its own kind (data/pieces.js SCENE_OF)
export function sceneFor(foe) {
  if (!foe) return null;
  const keys = [foe.band, foe.beast, foe.boss, foe.kind].filter(Boolean);
  for (const k of keys) {
    if (/spider/.test(k)) return 'nest';
    if (SCENE_OF[k]) return SCENE_OF[k];
  }
  for (const k of keys) {
    if (/skelet|zomb|upyr|ghoul|wight|lich|vampir|necro/.test(k)) return 'necropolis';
    if (/troll|ogre|giant|goblin|orc|gnoll/.test(k)) return 'warcamp';
    if (/wolf|bear|boar|lion|varg|griff|wyvern|drake|dragon|worm|bat/.test(k)) return 'den';
    if (/demon|fiend|rift/.test(k)) return 'rift';
  }
  return 'keep';
}

// ── before the roads: a scene, or the land's pieces and the scatter
export function layPieces(t, P) {
  const L = P.L, r = P.rnd, R = PIECE_RULES;
  const reach0 = P.reach0 = reachFrom(t, t.cy * t.w + t.cx);
  const sceneId = L.scene ? (L.force && SCENES[L.force] ? L.force : sceneFor(L.foe)) : null;   // (`force`: a scene named outright — the arena's vault)
  if (sceneId && SCENES[sceneId]) layScene(t, P, sceneId);
  else {
    // the land: what the world says is here, each mark with its chance, at most `land.max` of them
    const lore = t.site.lore || {};
    const marks = Object.keys(R.land.chance).filter(k => lore[k] && r() < R.land.chance[k]);
    let n = 0;
    for (const k of marks) {
      if (n >= R.land.max) break;
      const p = pick(r, PIECES.filter(q => q.layer === 'land' && q.lore === k)); if (!p) continue;
      if (place(t, P, p, 'land', anywhere(t, r))) n++;
    }
  }
  // the scatter, by the land's size; a scene strews its own instead (layScene)
  if (!P.scene) {
    const S = R.scatter, want = Math.max(S.min, Math.min(S.max, Math.round(t.w * t.h / 1000 * S.per1000 * (S.roll[0] + S.roll[1] * r()))));
    const here = new Set([...t.biome].filter(Boolean).map(b => BIOME_LIST[b - 1]?.id));
    const pool = PIECES.filter(p => p.layer === 'scatter' && (!p.biomes || p.biomes.some(b => here.has(b))));
    for (let k = 0; k < want; k++) { const p = pick(r, pool); if (p) place(t, P, p, 'scatter', anywhere(t, r)); }
  }
  mend(t, P, reach0);
}

// a scene: the heart `far` from the camp where there is room, the wood thinned, the small pieces over the whole map
function layScene(t, P, id) {
  const S = SCENES[id], r = P.rnd, R = PIECE_RULES, heart = pieceOf(S.heart);
  const at = s => { const a = r() * Math.PI * 2, d = R.far[0] + r() * (R.far[1] - R.far[0]); return [Math.round(t.cx + Math.cos(a) * d - s.w / 2), Math.round(t.cy + Math.sin(a) * d - s.h / 2)]; };
  let rec = place(t, P, heart, 'heart', at, R.heartKeep);
  // a cramped map: anywhere far enough from the camp
  if (!rec) rec = place(t, P, heart, 'heart', anywhere(t, r), R.heartKeep);
  P.scene = {id, label: S.label, anchor: rec?.anchor ?? null, dark: !!S.dark};   // (dark: under the ground — core/time.js nightness)
  // the wood thinned from its fringes (the cells of the highest tree noise go first)
  if (S.clear > 0 && t.treeNoise) {
    const wood = []; for (let i = 0; i < t.w * t.h; i++) if (t.terr[i] === T.FOREST && !P.mine[i]) wood.push(i);
    wood.sort((p, q) => t.treeNoise[q] - t.treeNoise[p] || p - q);
    for (let k = 0; k < Math.round(wood.length * S.clear); k++) { const i = wood[k]; t.terr[i] = OPEN[t.under[i]] ? t.under[i] : T.GRASS; }
  }
  for (const [pid, n] of S.scatter) { const p = pieceOf(pid); for (let k = 0; k < n; k++) place(t, P, p, 'scene', anywhere(t, r)); }
}

// ── after the roads: a piece by the road; on an ambush a barricade across it
export function layRoadPieces(t, P) {
  const L = P.L, r = P.rnd, R = PIECE_RULES, {w, h, terr} = t;
  const reach0 = P.reach0 = reachFrom(t, t.cy * w + t.cx);
  const roads = []; for (let i = 0; i < w * h; i++) if (terr[i] === T.ROAD) roads.push(i);
  if (!roads.length) return;
  if (L.kind === 'ambush') {
    // the road `at` cells from the caravan: felled trunks and a barricade across it and a cell either side
    const A = R.ambush, d = i => Math.hypot((i % w) - t.cx, ((i / w) | 0) - t.cy);
    const near = roads.filter(i => d(i) >= A.at[0] && d(i) <= A.at[1]);
    if (near.length) {
      const c = near[(r() * near.length) | 0], x0 = c % w, y0 = (c / w) | 0, rec = {id: 'roadblock', label: 'завал на дороге', layer: 'road', x: x0 - A.half, y: y0 - A.half, w: 2 * A.half + 1, h: 2 * A.half + 1, anchor: c, caches: []};
      for (let y = y0 - A.half; y <= y0 + A.half; y++) for (let x = x0 - A.half; x <= x0 + A.half; x++) {
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const i = y * w + x, k = terr[i];
        if (k === T.WATER || k === T.FORD || k === T.ROCK || P.used[i] || Math.hypot(x - x0, y - y0) > A.half + A.round) continue;
        terr[i] = k === T.ROAD || r() < A.barricade ? T.BARRICADE : T.LOG; P.mine[i] = 1; P.used[i] = 1;
      }
      P.list.push(rec);
    }
  }
  if (r() < R.road.chance) { const p = pick(r, PIECES.filter(q => q.layer === 'road')); if (p) place(t, P, p, 'road', anywhere(t, r)); }
  mend(t, P, reach0);
}

// Whatever could be walked to from the camp before the pieces were laid still can be, and so can every anchor and
// cache: the fewest walls of the pieces are broken into rubble (a 0-1 search from the reached ground, through the
// pieces' own blockers at a cost of one, to the nearest cell that was cut off)
function mend(t, P, reach0) {
  const {w, h, terr} = t, n = w * h, from = t.cy * w + t.cx;
  for (let guard = 0; guard < 24; guard++) {
    const reach = reachFrom(t, from);
    const want = new Uint8Array(n); let any = false;
    for (let i = 0; i < n; i++) if (!reach[i] && ((reach0[i] && BY_CODE[terr[i]].walkable) || false)) { want[i] = 1; any = true; }
    for (const p of P.list) for (const i of [p.anchor, ...p.caches]) if (i != null && !reach[i]) { want[i] = 1; any = true; }
    if (!any) return;
    // 0-1 search: walkable cells cost 0, a piece's blocker 1; the first wanted cell reached ends it
    const dist = new Int32Array(n).fill(1e9), prev = new Int32Array(n).fill(-1), dq = new Int32Array(2 * n + 4);
    let head = n + 2, tail = n + 2;
    for (let i = 0; i < n; i++) if (reach[i]) { dist[i] = 0; dq[tail++] = i; }
    let goal = -1;
    while (head < tail) {
      const i = dq[head++];
      if (want[i]) { goal = i; break; }
      const x = i % w, y = (i / w) | 0;
      for (let q = 0; q < 4; q++) {
        const nx = x + DX[q], ny = y + DY[q]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx, k = terr[j];
        const c = BY_CODE[k].walkable ? 0 : P.mine[j] && BLOCKER.has(k) ? 1 : -1;
        if (c < 0 || dist[i] + c >= dist[j]) continue;
        dist[j] = dist[i] + c; prev[j] = i;
        if (c === 0) dq[--head] = j; else dq[tail++] = j;
      }
    }
    if (goal < 0) return;   // cut off by the land itself, not by a piece: nothing of ours to break
    for (let c = goal; c >= 0 && !reach[c]; c = prev[c]) if (!BY_CODE[terr[c]].walkable) { terr[c] = terr[c] === T.PALISADE ? (OPEN[t.under[c]] ? t.under[c] : T.GRASS) : T.RUBBLE; }
  }
}
