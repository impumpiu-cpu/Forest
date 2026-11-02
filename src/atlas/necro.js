// The necromancer (data/lairs.js NECRO; docs/WORLD.md «Некромант»). The rot of the dead gives birth to a tower where it
// is thick — a lair of the kind `necromancer` (data/lairs.js, `domain`): its master was one of the thinking folk living
// there (drawn by their density × their world view), and a leader rises in it as in any old lair (atlas/leaders.js).
// The tower is a pump: each season it takes the rot about it — the corpses it raises — and the field of the dead grows
// round it (a field on the beasts' grid, like the lairs' folk: data/lairs.js LAIR_FIELD), the dead melting away without
// a master. Its seat reaches further than its territory (`zone`): the lairs of the dead that rise there bend the knee and
// pay it tribute, the living there are drawn into its cult (the peoples' and tribes' density, the towns' people thin a
// little), and its cultists — any of the living about, and the dead with them — walk its raids and roam its land
// (campaign/land.js, data/raids.js `cultists`). Born in the wild it is hidden, as any lair; with a leader in it, it is a
// seat that is hard to keep secret: a season's chance it is found.
import {LAIRS, NECRO} from '../data/lairs.js';
import {heldDead} from './control.js';
import {takeHeads, groupSize} from './population.js';
import {SPECIES} from '../data/species.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {faunaCell} from './fauna.js';
import {scaleOf} from './tectonics.js';
import {dist} from '../core/util.js';

const cap1 = s => s[0].toUpperCase() + s.slice(1);
export const isTower = l => !!l && l.alive && !!LAIRS.get(l.kind).domain;
export const towers = a => (a.lairs || []).filter(isTower);

// ── the field of the dead: one field (`dead`) on the beasts' grid, K = 1 on any land
const DEAD_SP = {id: 'dead', label: 'мертвец', plural: 'мертвецы'};
export function deadField(a) {
  const F = a.fauna; if (!F) return null;
  if (F.idx.dead != null) return F.list[F.idx.dead];
  const N = F.W * F.H, K = new Float32Array(N), cnt = new Float32Array(N);
  for (let i = 0; i < a.n; i++) { const j = faunaCell(a, i); cnt[j]++; if (!a.f.ocean[i]) K[j]++; }
  for (let j = 0; j < N; j++) K[j] = cnt[j] ? K[j] / cnt[j] : 0;
  const s = {id: 'dead', sp: DEAD_SP, role: 'dead', K, N: new Float32Array(N), speed: NECRO.deadSpeed, usual: 0, flagged: -99};
  F.idx.dead = F.list.length; F.list.push(s); F.buf = null;
  return s;
}

// how thick the risen stand about a cell
export const deadAt = (a, i) => { const F = a.fauna; return F && F.idx.dead != null ? F.list[F.idx.dead].N[faunaCell(a, i)] : 0; };

// ── who lives in a coarse cell among the thinking: [[race, density]] — the peoples (their field × the land they hold)
// and the tribes (their folk); `sentient` only
export function livingAt(a, j) {
  const out = [], F = a.fauna;
  for (const pe of a.peoples || []) { const v = pe.u[j] * pe.K[j]; if (v > 0) out.push([WORLD_PEOPLES.get(pe.id).race, v]); }
  if (F) for (const s of F.list) if (s.role === 'folk' && s.N[j] > 0 && SPECIES.get(s.id)?.mind === 'sentient') out.push([s.id, s.N[j]]);
  return out;
}
// the weight of a race in the necromancer's draw and in his cult: × its world view (the merciless likelier)
export const darkness = race => { const al = SPECIES.get(race)?.align; return NECRO.align.base + NECRO.align.mercy * (5 - (al?.mercy ?? 0)) / 10; };
const draw = (C, rnd) => { const tot = C.reduce((v, [, w]) => v + w, 0); if (!(tot > 0)) return null; let t = rnd() * tot; for (const [x, w] of C) if ((t -= w) <= 0) return x; return C[C.length - 1][0]; };
// who the necromancer of a tower at a cell was: a draw among the thinking about, by density × world view (null: none lives)
export const raceAt = (a, i, rnd) => draw(livingAt(a, faunaCell(a, i)).map(([r, v]) => [r, v * darkness(r)]), rnd);
// «некромант-орк»
export const necroLabel = race => (race && SPECIES.has(race) ? `некромант-${SPECIES.get(race).label.split(' ').pop()}` : 'некромант');

// ── the seat: how far it reaches, and the tower whose seat a cell is in
export const zoneOf = (a, l) => (NECRO.zone[0] + NECRO.zone[1] * l.strength) * scaleOf(a);
export function towerAt(a, x, y, k = 1, list = towers(a)) {   // (`list`: the towers, made once by a caller asking cell by cell)
  let best = null, bd = Infinity;
  for (const l of list) { const d = Math.hypot(l.x - x, l.y - y); if (d <= zoneOf(a, l) * k && d < bd) { bd = d; best = l; } }
  return best;
}
// the seats on the map at once: for each cell the index in `list` of the tower whose seat it is (the nearest), or −1 —
// for a map painted cell by cell (ui/atlasView.js «Державы»)
export function seatMap(a, list = towers(a)) {
  const out = new Int32Array(a.n).fill(-1); if (!list.length) return out;
  const best = new Float32Array(a.n).fill(Infinity);
  list.forEach((l, n) => {
    const z = zoneOf(a, l), R0 = Math.ceil(z);
    for (let y = Math.max(0, l.y - R0); y <= Math.min(a.h - 1, l.y + R0); y++) for (let x = Math.max(0, l.x - R0); x <= Math.min(a.w - 1, l.x + R0); x++) {
      const d = Math.hypot(l.x - x, l.y - y), i = y * a.w + x; if (d <= z && d < best[i]) { best[i] = d; out[i] = n; }
    }
  });
  return out;
}
// a lair of the dead (not a tower) within a tower's seat bends the knee: its vassal → the line, or null
export function bend(a, lair, say) {
  const L = LAIRS.get(lair.kind);
  if (!lair.alive || !L.undead || L.domain || lair.lord != null) return null;
  const t = towerAt(a, lair.x, lair.y); if (!t || !heldDead(t)) return null;   // (a tower holds its vassals by its master, a necromancer: atlas/control.js)
  lair.lord = t.id;
  return `${cap1(L.label)} «${lair.name}» склонил${L.g === 'f' ? 'ась' : L.g === 'pl' ? 'ись' : L.g === 'n' ? 'ось' : 'ся'} перед башней «${t.name}»${t.leader ? `, где правит ${t.leader.name}` : ''}: теперь ${L.g === 'pl' ? 'они платят' : 'платит'} ей дань.`;
}

// ── the birth: in spring, where the rot is past the tower's rotAt, by the chance of how far past it
export function towerBirth(a, rnd, {newLair, hideIfWild, wherePhrase, R, groundFits}) {
  const lines = [], F = a.fauna; if (!a.rot || !F) return lines;
  const L = LAIRS.filter(x => x.domain)[0]; if (!L) return lines;
  if (towers(a).filter(l => l.kind === L.id).length >= L.max) return lines;
  const k = scaleOf(a), want = NECRO.most * k * k, n = Math.floor(want) + (rnd() < want % 1 ? 1 : 0);
  // the cells past rotAt that pass their roll, in a random order (not the map's: the north-west would always win)
  const cand = [];
  for (let j = 0; j < a.rot.length; j++) { const v = a.rot[j]; if (v >= L.rotAt && rnd() < NECRO.births * (v - L.rotAt) / (1 - L.rotAt)) cand.push(j); }
  for (let q = cand.length - 1; q > 0; q--) { const k2 = (rnd() * (q + 1)) | 0; [cand[q], cand[k2]] = [cand[k2], cand[q]]; }
  let made = 0;
  for (const j of cand) {
    if (made >= n) break;
    const x0 = (j % F.W) * F.c, y0 = ((j / F.W) | 0) * F.c;
    for (let t = 0; t < 8; t++) {
      const i = Math.min(a.h - 1, y0 + ((rnd() * F.c) | 0)) * a.w + Math.min(a.w - 1, x0 + ((rnd() * F.c) | 0));
      if (!groundFits(a, L, i)) continue;   // as any lair's spot: dry land, the rot, no town or its works
      const p = {x: i % a.w, y: (i / a.w) | 0};
      if (towers(a).some(o => dist(o, p) < 2 * R(a, L))) continue;
      const race = raceAt(a, i, rnd);
      const lair = hideIfWild(a, newLair(a, L, i, rnd, NECRO.start)); lair.race = race;
      lines.push(lair.hidden ? `В глуши ${wherePhrase(a, i)}, где гниль гуще всего, ${necroLabel(race)} поставил ${L.labelAcc} «${lair.name}»: о ней не знает ни одна держава.`
        : `${cap1(necroLabel(race))} поставил ${L.labelAcc} «${lair.name}» ${wherePhrase(a, i)}: по ночам там поднимают мертвецов.`);
      made++; break;
    }
  }
  // the lairs of the dead within a seat bend the knee
  for (const l of a.lairs) { const line = bend(a, l); if (line) lines.push(line); }
  return lines;
}

// ── a season of a tower: it takes the rot about it into its dead, draws the living of its seat into its cult; a hidden
// one with a leader is found by chance → the mean rot it reached (what feeds it), and its lines into `lines`
export function stepTower(a, lair, L, rnd, lines, revealLair) {
  const F = a.fauna, dead = deadField(a); if (!F || !a.rot) return 0;
  const c = F.c, r = L.radius * scaleOf(a) / c, cx = lair.x / c, cy = lair.y / c, R0 = Math.ceil(r);
  let sum = 0, ws = 0;
  for (let y = Math.max(0, (cy | 0) - R0); y <= Math.min(F.H - 1, (cy | 0) + R0); y++) for (let x = Math.max(0, (cx | 0) - R0); x <= Math.min(F.W - 1, (cx | 0) + R0); x++) {
    const j = y * F.W + x, w = 1 - Math.hypot(x + 1 / 2 - cx, y + 1 / 2 - cy) / (r + 1); if (w <= 0 || dead.K[j] <= 0) continue;
    const v = a.rot[j]; sum += v * w; ws += w;
    if (!heldDead(lair)) continue;   // no master with the art, no raising: the dead of a tower are its master's (atlas/control.js)
    const take = NECRO.take * v * w;
    a.rot[j] = v - take;
    dead.N[j] = Math.min(NECRO.deadCap * dead.K[j], dead.N[j] + take * NECRO.raise);
  }
  // its cult: the living of its seat thin a little
  const zone = zoneOf(a, lair), zr = zone / c, Z0 = Math.ceil(zr);
  for (let y = Math.max(0, (cy | 0) - Z0); y <= Math.min(F.H - 1, (cy | 0) + Z0); y++) for (let x = Math.max(0, (cx | 0) - Z0); x <= Math.min(F.W - 1, (cx | 0) + Z0); x++) {
    const j = y * F.W + x, w = 1 - Math.hypot(x + 1 / 2 - cx, y + 1 / 2 - cy) / (zr + 1); if (w <= 0) continue;
    for (const pe of a.peoples || []) pe.u[j] *= 1 - NECRO.recruit.land * w;
    for (const s of F.list) if (s.role === 'folk') s.N[j] *= 1 - NECRO.recruit.land * w;
  }
  // the living of the towns in its seat go to its cult: out of the town's count, into the tower's (lair.cult — the heads of the cult it
  // has drawn over the years; the raids' company still comes of the fields about, atlas/necro.js cultPool)
  for (const t of a.towns || []) { if (!t.alive) continue; const d = dist(t, lair); if (d < zone) lair.cult = Math.round(((lair.cult || 0) + groupSize(takeHeads(a, t, t.pop * NECRO.recruit.town * (1 - d / zone), {how: 'cult'}))) * 100) / 100; }
  // a seat with a leader is hard to keep secret
  if (lair.hidden && lair.leader && rnd() < NECRO.reveal) {
    revealLair(a, lair, 'молва');
    lines.push(`Молва донесла, где стоит ${L.label} «${lair.name}»: ${lair.leader.title[0].toLowerCase()} ${lair.leader.name} больше не прячется.`);
  }
  return ws > 0 ? sum / ws : 0;
}

// ── the cult about a cell: who its cultists are, each head drawn by itself — the living by density × world view, the
// dead by the field of the dead × NECRO.dead → [[species, weight]] (data/raids.js `cultists`)
export function cultPool(a, i) {
  const F = a.fauna; if (!F) return [];
  const j = faunaCell(a, i), out = livingAt(a, j).map(([r, v]) => [r, v * darkness(r)]);
  const dead = F.idx.dead != null ? F.list[F.idx.dead].N[j] : 0, tot = NECRO.dead.reduce((v, [, w]) => v + w, 0);
  if (dead > 0) for (const [sp, w] of NECRO.dead) out.push([sp, dead * w / tot]);
  // the same race from several peoples or tribes is one entry
  const m = new Map(); for (const [sp, w] of out) m.set(sp, (m.get(sp) || 0) + w);
  return [...m].filter(([, w]) => w > 0).map(([sp, w]) => [sp, Math.round(w * 1000) / 1000]);
}
