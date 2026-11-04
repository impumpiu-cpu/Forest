// Lairs of the monsters (data/lairs.js): points with an owner species, a strength, an age and a
// territory. At the start of the wild era they are placed on suitable ground, spaced by territory.
// Each season a lair feeds on the prey of its territory (strength grows when fed, wanes when not),
// holds the density of its species up around it, fights rival lairs whose territories touch, grows old,
// and dies out when it is starved or beaten — that is its body. What it does — a brood that founds a
// new lair, a camp's raid, the dragon's flight — are the deeds of its species' row (data/deeds.js
// `deeds.lair`, the code in atlas/deeds/), chosen by the actor's brain (atlas/actor.js, the role
// `lair` below). Every one of these turns writes a line to the chronicle.
// Tribes (data/lairs.js, `tribe`) are lairs whose owner is a thinking race: the camp lives off its
// land (the race's `home` over the territory) rather than prey, thins out where the peoples settle,
// and in autumn raids the towns of the peoples its race dislikes (data/relations.js).
// The rot (data/lairs.js ROT): a field on the coarse grid fed by the graves; where it is thick the
// undead lairs spawn (wights on the barrows, ghouls by the ruins, a necromancer's tower where it is
// thickest), live off it and raid any town in reach, leaving more graves.
import {PLURAL_INSTR} from '../data/names.js';
import {LAND_BIOMES, LAIR_GROUND as LG, ROCK_CAVES, TOWN_ROLES} from '../data/worldLand.js';
import {LAIR_LIFE as LL, LAIRS, NAME_ADJ, GENDER_INDEX, LAIR_AGE, TRIBE_HOME, TRIBE_RAID, ROT, CAPTIVE_RAID, WILD, LAIR_FIELD as LF, RAID_MIX, NECRO} from '../data/lairs.js';
import {killShare, strangersOf} from './population.js';
import {CAL} from '../data/calamities.js';
import {barrows, raidGraves} from './diplomacy.js';
import {WORLD_PEOPLES, TOWN_WAR} from '../data/peoples.js';
import {townFx, might, raidShare, townLabel} from './towns.js';
import {BIOMES} from '../data/biomes.js';
import {SPECIES} from '../data/species.js';
import {ROCK_BY_CODE} from '../data/geology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {faunaCell, faunaSpeed} from './fauna.js';
import {raidSite} from './sites.js';
import {BEHAVIOURS, goHome} from './parties.js';
import {actorStep} from './actor.js';
import {DOES} from './deeds/index.js';
import {towerBirth, stepTower, deadField, bend, necroLabel, livingAt, darkness} from './necro.js';
import {BURNT, townAt} from './peoples.js';
import {realmLand} from './realms.js';
import {dist, cap1} from '../core/util.js';

const rel = (a, i) => (a.f.elev[i] - a.sea) / (1 - a.sea);

// how well a camp's ground suits a cell, 0..1: the lair kind's own `home` (data/lairs.js), else its race's (data/races.js)
const homeAt = (a, L, i) => (L.home || SPECIES.get(L.species).home)[biomeAt(a, i).id] || 0;

// can this kind of lair stand on this cell
export function groundFits(a, L, i) {
  if (a.f.ocean[i] || a.f.lake[i] >= 0) return false;
  // not in a living town or on its works: a nest «founded» in the market square is nonsense (a vampire's
  // manor is the exception, placed by spawnLairs in a town on purpose, not through here)
  if (townAt(a, i) || (a.siteAt && a.siteAt[i])) return false;
  if (L.ground === 'home') return homeAt(a, L, i) >= TRIBE_HOME && (!L.needsAny || L.needsAny.some(g => groundKind(a, g, i)));
  if (L.ground === 'rot') return !!a.rot && a.rot[faunaCell(a, i)] >= L.rotAt && (L.at === 'barrows' ? (a.f.barrows?.[i] || 0) >= LG.barrows : L.at === 'ruins' ? !!ruinNear(a, i) : true);
  if (L.ground === 'rift') return a.f.volc[i] > LG.rift.volc || (!!a.f.bnd && a.f.bnd[i] > 0 && (a.f.elev[i] - a.sea) / (1 - a.sea) > LG.rift.rel);
  return groundKind(a, L.ground, i);
}
function groundKind(a, ground, i) {
  const b = biomeAt(a, i).id, rock = ROCK_BY_CODE[a.f.rock[i]]?.id;
  switch (ground) {
    case 'heights': return rel(a, i) > LG.heights.rel && a.f.flat[i] < LG.heights.flat && b !== 'ice';
    case 'volcano': return a.f.volc[i] > LG.volcano || b === 'volcano';
    case 'caves': return (ROCK_CAVES[rock] || 0) > 0;
    case 'deep': return LAND_BIOMES.deep.includes(b) && a.f.trees[i] > LG.deepTrees;
    case 'open': return LAND_BIOMES.open.includes(b);
  }
  return false;
}

// a burnt town within LAIR_GROUND.ruins cells
const ruinNear = (a, i) => (a.ruins || []).find(r => Math.abs(r.x - i % a.w) <= LG.ruins && Math.abs(r.y - ((i / a.w) | 0)) <= LG.ruins) || null;
// how good a cell is for the lair's species: its carrying capacity there (a tribe: its race's home;
// the dead: the rot)
const goodness = (a, L, i) => (L.fiend || L.dragon ? 0.5 : L.undead ? a.rot[faunaCell(a, i)] : L.tribe ? homeAt(a, L, i) : a.fauna.list[a.fauna.idx[L.species]].K[faunaCell(a, i)]);

const DIRS = ['на востоке', 'на юго-востоке', 'на юге', 'на юго-западе', 'на западе', 'на северо-западе', 'на севере', 'на северо-востоке'];
// «in the taiga in the north-east» — where a cell lies, for the chronicle: the commonest land biome
// around it (water does not count) and the side of the world
export function wherePhrase(a, i) {
  const x = i % a.w, y = (i / a.w) | 0, dx = x / a.w - 0.5, dy = y / a.h - 0.5;
  const dir = Math.hypot(dx, dy) < 0.12 ? 'в сердце мира' : DIRS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
  const cnt = {};
  for (let yy = Math.max(0, y - 3); yy <= Math.min(a.h - 1, y + 3); yy++) for (let xx = Math.max(0, x - 3); xx <= Math.min(a.w - 1, x + 3); xx++) {
    const b = biomeAt(a, yy * a.w + xx); if (b && b.id !== 'water') cnt[b.id] = (cnt[b.id] || 0) + 1;
  }
  const top = Object.entries(cnt).sort((p, q) => q[1] - p[1])[0];
  return `${top ? BIOMES.get(top[0]).where : ''} ${dir}`.trim();
}

function lairName(L, rnd, used) {
  for (let t = 0; t < 30; t++) {
    const [noun, gen] = L.nouns[(rnd() * L.nouns.length) | 0], adj = NAME_ADJ[(rnd() * NAME_ADJ.length) | 0][GENDER_INDEX[gen]];
    const name = `${adj} ${noun}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  return `${L.label} ${used.size + 1}`;
}

export function newLair(a, L, i, rnd, strength, born = a.hist.year) {
  const H = a.hist, name = lairName(L, rnd, H.names);
  // a tribe lives off its land: the field is made the first time a lair of its kind stands (a calamity's retinue in a
  // world of «Заселение мира» may be the first; atlas/settle.js)
  if (L.tribe) (a.tribeLand ||= {})[L.id] ||= homeField(a, L);
  const lair = {id: H.nextLair++, kind: L.id, i, x: i % a.w, y: (i / a.w) | 0, name, born, strength, ancient: born <= H.year - LAIR_AGE.ancient, alive: true};
  a.lairs.push(lair);
  pour(a, lair, L, LF.pulse * strength, false);   // a new lair brings its own about it
  return lair;
}

// ── the lairs' folk as fields (data/lairs.js LAIR_FIELD): the owners of the lairs on the beasts' grid
// once a world: the tribes get a field of their own (K — their race's home over the land), every lair kind's owners are
// marked `lair` (they breed only at a lair: atlas/fauna.js stepFauna); in a world with no lair yet their density starts
// empty — the lairs pour it out about them
export function lairFolk(a) {
  const F = a.fauna; if (!F || F.folk) return;
  const bySp = new Map();
  for (const L of LAIRS.all()) if (L.species && !L.undead && !L.fiend && SPECIES.has(L.species)) bySp.set(L.species, [...(bySp.get(L.species) || []), L]);
  const empty = !(a.lairs || []).length, N = F.W * F.H;
  for (const [id, Ls] of bySp) {
    let s = F.list[F.idx[id]];
    if (!s) {
      const K = new Float32Array(N), cnt = new Float32Array(N), sp = SPECIES.get(id);
      for (let i = 0; i < a.n; i++) {
        if (a.f.ocean[i]) continue;
        const j = faunaCell(a, i); let v = 0;
        for (const L of Ls) { const h = homeAt(a, L, i); if (h >= TRIBE_HOME && h > v) v = h; }
        K[j] += v; cnt[j]++;
      }
      let usual = 0; for (let j = 0; j < N; j++) { K[j] = cnt[j] ? K[j] / cnt[j] : 0; usual += K[j]; }
      s = {id, sp, role: 'folk', K, N: new Float32Array(N), speed: faunaSpeed(sp), usual, flagged: -99};
      F.idx[id] = F.list.length; F.list.push(s);
    }
    s.lair = true;
    if (empty) s.N.fill(0);
  }
  deadField(a);   // the field of the dead the necromancers raise (atlas/necro.js)
  F.buf = null; F.folk = true;
}
// how near a coarse cell's middle is to a point, 1 at it … 0 one cell past `rr` (coarse cells)
const closeness = (x, y, cx, cy, rr) => 1 - Math.hypot(x + 1 / 2 - cx, y + 1 / 2 - cy) / (rr + 1);
// the owners of a lair poured about it, falling off to its edge: `add` — on top of what lives there (a brood's
// migration), else at least so many (a new lair)
function pour(a, lair, L, amount, add) {
  const F = a.fauna, s = F && F.list[F.idx[L.species]]; if (!s || amount <= 0) return;
  const c = F.c, rr = R(a, L) / c, cx = lair.x / c, cy = lair.y / c, R0 = Math.ceil(rr);
  for (let y = Math.max(0, (cy | 0) - R0); y <= Math.min(F.H - 1, (cy | 0) + R0); y++) for (let x = Math.max(0, (cx | 0) - R0); x <= Math.min(F.W - 1, (cx | 0) + R0); x++) {
    const j = y * F.W + x, w = closeness(x, y, cx, cy, rr); if (w <= 0 || s.K[j] <= 0) continue;
    const v = s.K[j] * amount * w; s.N[j] = add ? s.N[j] + v : Math.max(s.N[j], v);
  }
}
export const pourBrood = (a, at, L) => pour(a, {x: at % a.w, y: (at / a.w) | 0}, L, LF.brood, true);
// how thick a lair's folk live about it (their density at its coarse cell: the halo the trackers follow)
export const felt = (a, lair) => { const F = a.fauna, s = F && F.list[F.idx[LAIRS.get(lair.kind).species]]; return s ? s.N[faunaCell(a, lair.i)] : 0; };
// how thick the owners of a lair kind live about a cell, against what the land holds (0 — none)
const thick = (a, L, i) => { const F = a.fauna, s = F && F.list[F.idx[L.species]], j = F ? faunaCell(a, i) : 0; return s && s.K[j] > 0 ? s.N[j] / s.K[j] : 0; };
const liveByKind = a => { const n = new Map(); for (const o of a.lairs) if (o.alive) n.set(o.kind, (n.get(o.kind) || 0) + 1); return n; };
const wildKinds = a => { const n = liveByKind(a); return LAIRS.filter(L => !L.spawn && !L.dragon && L.at !== 'town' && (n.get(L.id) || 0) < L.max * LL.crowdMax); };
// the kind of a lair that rises by itself (born of the density, or come into the wild — not a brood: a brood founds its
// own kind): drawn among the kinds whose ground fits, each with the chance of how thick its owners live there (so a
// thinner kind may settle too, and the wild keeps its variety) — the newcomers' kind (`own`) weighing LAIR_FIELD.own
// more; a kind with a lair of its own within two territories is left out → the kind, or null
// (`at`: what kindAt asks of the lairs — the kinds of the wild and the living lairs by kind — made once for a run of calls
// in which no lair is added nor dies: kindsHere(a); without it they are made for the call)
export const kindsHere = a => { const byKind = new Map(); for (const o of a.lairs) if (o.alive) (byKind.get(o.kind) || byKind.set(o.kind, []).get(o.kind)).push(o); return {kinds: wildKinds(a), byKind}; };
export function kindAt(a, i, rnd, own = null, at = kindsHere(a)) {
  const p = {x: i % a.w, y: (i / a.w) | 0}, room = L => !(at.byKind.get(L.id) || []).some(o => dist(o, p) < 2 * R(a, L));   // (one kind's lairs keep apart)
  const C = at.kinds.filter(L => groundFits(a, L, i) && room(L)).map(L => [L, thick(a, L, i) + (L.id === own ? LF.own : 0)]).filter(([, w]) => w > 0);
  if (!C.length) return null;
  let t = rnd() * C.reduce((v, [, w]) => v + w, 0);
  for (const [L, w] of C) if ((t -= w) <= 0) return L;
  return C[C.length - 1][0];
}
// spring: where the owners of a lair kind live thick and no lair stands, a lair is born of the density — whose, a draw
// by the densities of all the kinds about (atlas/lairs.js kindAt)
function bornOfDensity(a, rnd) {
  const F = a.fauna, lines = []; if (!F) return lines;
  const cand = [];
  for (const s of F.list) if (s.lair) for (let j = 0; j < s.N.length; j++) if (s.K[j] > LF.landMin && s.N[j] >= LF.birth * s.K[j]) cand.push([s.N[j] / s.K[j] + LF.jitter * rnd(), j]);
  if (!cand.length) return lines;
  cand.sort((p, q) => q[0] - p[0]);
  const k = scaleOf(a), want = LF.births * k * k, n = Math.floor(want) + (rnd() < want % 1 ? 1 : 0);
  let made = 0, at = kindsHere(a);   // (made again after each lair born: the kinds and their lairs change only then)
  for (const [, j] of cand) {
    if (made >= n) break;
    const x0 = (j % F.W) * F.c, y0 = ((j / F.W) | 0) * F.c;
    for (let t = 0; t < 12; t++) {
      const i = Math.min(a.n - 1, Math.min(a.h - 1, y0 + ((rnd() * F.c) | 0)) * a.w + Math.min(a.w - 1, x0 + ((rnd() * F.c) | 0)));
      const L = kindAt(a, i, rnd, null, at); if (!L) continue;   // whose lair: a draw by how thick each kind's owners live here
      const p = {x: i % a.w, y: (i / a.w) | 0};
      if (a.lairs.some(o => o.alive && dist(o, p) < Math.max(R(a, L), R(a, LAIRS.get(o.kind))))) continue;
      const lair = hideIfWild(a, newLair(a, L, i, rnd, LL.broodStart)), who = SPECIES.get(L.species).plural;
      lines.push(lair.hidden ? `В глуши ${wherePhrase(a, i)} осели бродячие ${who}: где их ${L.nouns[0][0]}, не знает ни одна держава.`
        : `Бродячие ${who} осели ${wherePhrase(a, i)}: ${G[L.g].fresh} ${acc(L)} — «${lair.name}».`);
      made++; at = kindsHere(a); break;
    }
  }
  return lines;
}

export const R = (a, L) => L.radius * scaleOf(a);

// a free spot for a lair: fits the ground, not inside another lair's territory of the same kind,
// as good as possible among a sample of candidates
export function findSpot(a, L, rnd, near, tries = 400, ok = null) {
  let best = -1, bv = 0;
  for (let t = 0; t < tries; t++) {
    let i;
    if (near) {
      const ang = rnd() * Math.PI * 2, d = R(a, L) * (2 + 2 * rnd());
      const x = Math.round(near.x + Math.cos(ang) * d), y = Math.round(near.y + Math.sin(ang) * d);
      if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
      i = y * a.w + x;
    } else i = (rnd() * a.n) | 0;
    if (!groundFits(a, L, i) || (ok && !ok(i))) continue;
    const v = goodness(a, L, i) * (0.6 + 0.4 * rnd());
    if (v <= 0.02 || v <= bv) continue;
    const p = {x: i % a.w, y: (i / a.w) | 0};
    if (a.lairs.some(o => o.alive && o.kind === L.id && dist(o, p) < 2 * R(a, L))) continue;
    best = i; bv = v;
  }
  return best;
}

// the race's home over each coarse cell of the beasts' grid, 0..1: what a tribe's land feeds
export function homeField(a, L) {
  const F = a.fauna, N = F.W * F.H, out = new Float32Array(N), cnt = new Float32Array(N);
  for (let i = 0; i < a.n; i++) { if (a.f.ocean[i]) continue; const j = faunaCell(a, i); out[j] += homeAt(a, L, i); cnt[j]++; }
  for (let j = 0; j < N; j++) out[j] = cnt[j] ? out[j] / cnt[j] : 0;
  return out;
}

// the rot's field and the mean temperature of each coarse cell (frost and heat burn the rot out);
// a few barrows older than the chronicle, so the dead have somewhere to rise from
export function seedRot(a, rnd) {
  const F = a.fauna, N = F.W * F.H, k = scaleOf(a);
  a.rot = new Float32Array(N);
  const temp = new Float32Array(N), cnt = new Float32Array(N);
  for (let i = 0; i < a.n; i++) { if (a.f.ocean[i]) continue; const j = faunaCell(a, i); temp[j] += a.f.temp[i]; cnt[j]++; }
  for (let j = 0; j < N; j++) temp[j] = cnt[j] ? temp[j] / cnt[j] : 0;
  a.rotTemp = temp;
  const n = ROT.ancient[0] + Math.floor(rnd() * (ROT.ancient[1] - ROT.ancient[0] + 1)), spots = [];
  for (let t = 0; t < 400 && spots.length < n; t++) {
    const i = (rnd() * a.n) | 0, b = biomeAt(a, i)?.id;
    if (a.f.ocean[i] || a.f.lake[i] >= 0 || !LAND_BIOMES.barrowLand.includes(b)) continue;
    if (spots.some(q => Math.hypot(q % a.w - i % a.w, ((q / a.w) | 0) - ((i / a.w) | 0)) < 25 * k)) continue;
    spots.push(i); barrows(a, i, Math.max(2, Math.round(3 * k)), ROT.ancientGraves);
  }
  return spots;
}

// a season of the rot: it seeps from the graves, spreads, and fades — faster in frost and heat
export function stepRot(a) {
  const F = a.fauna, N = F.W * F.H, rot = a.rot;
  const B = a.rotBuf ||= {src: new Float32Array(N), cnt: new Float32Array(N), tmp: new Float32Array(N), ward: new Float32Array(N), cell: Int32Array.from({length: a.n}, (_, i) => (a.f.ocean[i] ? -1 : faunaCell(a, i)))};
  const {src, cnt, tmp, cell, ward} = B;
  // the wards of mage towers and temples of the fallen: the rot fades faster around them
  ward.fill(0);
  for (const t of a.towns || []) {
    if (!t.alive) continue;
    let w = 0; for (const [id, k] of Object.entries(TOWN_ROLES.rotWard)) if (t.built.includes(id)) w += ROT[k];
    if (!w) continue;
    const j = cell[t.i], x0 = j % F.W, y0 = (j / F.W) | 0;
    for (let y = Math.max(0, y0 - 1); y <= Math.min(F.H - 1, y0 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(F.W - 1, x0 + 1); x++) ward[y * F.W + x] = Math.max(ward[y * F.W + x], w);
  }
  src.fill(0); cnt.fill(0);
  if (a.f.barrows) for (let i = 0; i < a.n; i++) { const j = cell[i]; if (j < 0) continue; src[j] += a.f.barrows[i]; cnt[j]++; }
  else for (let i = 0; i < a.n; i++) { const j = cell[i]; if (j >= 0) cnt[j]++; }
  // rats: the rot travels with the caravans between towns joined by road
  if (a.roadPairs && a.towns) {
    const byId = new Map(a.towns.map(t => [t.id, t])), health = new Map();   // (a town's health once a step: townFx is dear)
    const healthOf = t => { let h = health.get(t); if (h == null) health.set(t, h = Math.min(1, townFx(t).health)); return h; };
    for (const key of a.roadPairs) {
      const t = byId.get(Math.floor(key / 100000)), o = byId.get(key % 100000);
      if (!t || !o || !t.alive || !o.alive) continue;
      for (const [from, to] of [[t, o], [o, t]]) {
        const jf = cell[from.i], jt = cell[to.i];
        if (jf < 0 || jt < 0 || rot[jf] < ROT.ratsFrom) continue;
        const keep = 1 - ROT.ratsHealth * healthOf(to);
        src[jt] += ROT.rats * rot[jf] * keep * cnt[jt] / ROT.seed;   // in the units of the graves' seeding
        if (rot[jt] < ROT.ratsFrom && !to.ratsTold) { to.ratsTold = true; (a.ratsLines ||= []).push(`Крысы с обозами занесли гниль в ${townLabel(to, 1)} ${to.name}.`); }
      }
    }
  }
  tmp.set(rot);
  for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
    const j = y * F.W + x;
    if (!cnt[j]) { rot[j] = 0; continue; }
    let s = 0, c = 0;
    if (x > 0) { s += tmp[j - 1]; c++; } if (x < F.W - 1) { s += tmp[j + 1]; c++; }
    if (y > 0) { s += tmp[j - F.W]; c++; } if (y < F.H - 1) { s += tmp[j + F.W]; c++; }
    const T = a.rotTemp[j], fade = ROT.decay + ward[j] + (T < 0 ? ROT.frost * Math.min(1, -T / 10) : 0) + (T > 20 ? ROT.heat * Math.min(1, (T - 20) / 10) : 0);
    rot[j] = Math.max(0, Math.min(1, tmp[j] + ROT.seed * src[j] / cnt[j] + ROT.diffuse * (s / c - tmp[j]) - fade * tmp[j]));
  }
}

export function placeLairs(a, rnd) {
  a.lairs = []; a.tribeLand = {};
  lairFolk(a);
  a.ancientBarrows = seedRot(a, rnd);
  return wildLairs(a, rnd);
}
// the lairs of the wild the land gives (each kind as many as its ground feeds); also «Заселение мира»'s «логова по сиду»
export function wildLairs(a, rnd) {
  const tally = {};
  for (const L of LAIRS.all()) {
    if (L.spawn) continue;   // the dead and the rifts come through history (spawnLairs)
    if (L.tribe) a.tribeLand[L.id] ||= homeField(a, L);
    let fit = 0;
    for (let i = 0; i < a.n; i += 3) if (groundFits(a, L, i) && goodness(a, L, i) > 0.02) fit += 3;
    const want = Math.min(L.max, Math.round(fit / 10000 * L.density * (0.7 + 0.6 * rnd())));
    for (let q = 0; q < want; q++) {
      const i = findSpot(a, L, rnd);
      if (i < 0) break;
      // the lairs of the wild were there long before the chronicle begins
      newLair(a, L, i, rnd, L.dragon ? LL.dragonStart : LL.start[0] + LL.start[1] * rnd(), a.hist.year - Math.floor(rnd() * 2 * LAIR_AGE.ancient) - (L.dragon ? 10 * LAIR_AGE.ancient : 0));
      tally[L.id] = (tally[L.id] || 0) + 1;
    }
  }
  return tally;
}

export const power = sp => { const s = SPECIES.get(sp).special; return (s.S[0] + s.S[1]) / 2 + (s.E[0] + s.E[1]) / 2; };
// a town of a realm against a lair (the deeds clearLair, liberate, captives): the town's might × TOWN_WAR.might against the
// lair's strength × its owner's power × `guard`, luck on both sides (the town's drawn first) → true when the town wins
export function townBeatsLair(t, l, r, guard = 1, fx = townFx(t)) {
  const W = TOWN_WAR, town = might(t, fx) * W.might * (W.luck[0] + W.luck[1] * r());
  return town > l.strength * power(LAIRS.get(l.kind).species) * guard * (W.luck[0] + W.luck[1] * r());
}

// one season of every lair; returns lines for the chronicle
export function stepLairs(a, rnd, seasonId) {
  const H = a.hist, F = a.fauna, lines = [];
  lairFolk(a);   // (a world saved before the lairs' folk had fields)
  stepRot(a);
  if (a.ratsLines) { lines.push(...a.ratsLines); a.ratsLines = null; }
  if (seasonId === 'spring') lines.push(...spawnLairs(a, rnd), ...spawnWild(a, rnd), ...bornOfDensity(a, rnd), ...towerBirth(a, rnd, {newLair, hideIfWild, wherePhrase, R, groundFits}));
  for (const lair of a.lairs) {
    if (!lair.alive) continue;
    const L = LAIRS.get(lair.kind), r = R(a, L), s = L.tribe || L.undead || L.fiend || L.dragon ? null : F.list[F.idx[L.species]];
    // feed: the prey of the owner around the lair, against what the biomes there could hold;
    // a tribe lives off its land, and the peoples' settlers crowd it out
    let food = 0, cap = 0, land = 0, crowd = 0;
    const cells = [], c = F.c, rr = Math.ceil(r / c);
    const cx = (lair.x / c) | 0, cy = (lair.y / c) | 0;
    for (let y = Math.max(0, cy - rr); y <= Math.min(F.H - 1, cy + rr); y++) for (let x = Math.max(0, cx - rr); x <= Math.min(F.W - 1, cx + rr); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue;
      const j = y * F.W + x; cells.push(j);
      if (s) for (const q of s.prey || []) { food += F.list[q].N[j]; cap += F.list[q].K[j]; }
      else if (L.undead) land = Math.max(land, a.rot[j]);   // the dead feed on the thickest rot they reach
      else if (L.fiend || L.dragon) land = LL.fiendFed;
      else { land += a.tribeLand[L.id][j]; for (const pe of a.peoples || []) crowd += pe.u[j] * pe.K[j]; }
    }
    const host = L.at === 'town' ? a.towns.find(t => t.id === lair.town) : null;
    let fed = s ? (cap > 0 ? Math.min(LL.fedMax, food / cap) : LL.fedNone)
      : L.fiend || L.dragon ? land
      : host ? (host.alive ? Math.min(LL.fedMax, host.pop / LL.vampirePop) : 0)   // a vampire drinks its town
      : L.undead ? Math.min(LL.fedMax, land / (L.rotAt * LL.rotFeed))
      : Math.min(LL.fedMax, land / cells.length / LL.tribeFeed) * (1 - LL.crowd * Math.min(1, crowd / cells.length));
    // a necromancer's tower (atlas/necro.js): fed by the mean rot it reaches, and it takes that rot into its dead
    if (L.domain) fed = Math.min(LL.fedMax, stepTower(a, lair, L, rnd, lines, revealLair) / NECRO.feed);
    const winter = seasonId === 'winter' ? LL.winter : 0;
    lair.strength = Math.max(0, Math.min(1, lair.strength + LL.grow * (fed - LL.need) - winter + LL.wobble * (rnd() - 0.5)));
    // a calamity's boss (atlas/calamity.js) keeps its lair up while it lives: it falls only with the boss
    if (lair.boss != null) lair.strength = Math.max(lair.strength, CAL.boss.floor);
    // the lair is its owners' source: they breed here and spread out about it (data/lairs.js LAIR_FIELD)
    const own = F.list[F.idx[L.species]];
    if (own) for (const j of cells) {
      const K = own.K[j]; if (K <= 0) continue;
      const w = closeness(j % F.W, (j / F.W) | 0, lair.x / c, lair.y / c, r / c); if (w <= 0) continue;
      if (own.N[j] < LF.cap * K) own.N[j] = Math.min(LF.cap * K, own.N[j] + LF.source * lair.strength * K * w);
    }
    if (host && host.alive && seasonId === 'autumn') { killShare(a, host, L.drinks * lair.strength, 'vampire'); raidGraves(a, host); }
    // the captives at the lair waste away (CAPTIVE_RAID.keep a year): eaten, worked to death, raised
    if (seasonId === 'spring' && lair.captives) for (const k of Object.keys(lair.captives)) { lair.captives[k] = Math.floor(lair.captives[k] * CAPTIVE_RAID.keep); if (!lair.captives[k]) delete lair.captives[k]; }
    if (lair.strength < LL.dies) {
      lair.alive = false; lair.died = H.year;
      if (lair.captives && Object.values(lair.captives).some(v => v > 0)) { lines.push(`Пленные «${lair.name}» — ${captiveCount(lair)} — остались без хозяев и разбрелись по домам.`); }   // (home: atlas/demography.js freeCaptives)
      lines.push(L.at === 'town' ? `${G[L.g].emptied} ${L.label} «${lair.name}»: ${host ? `в ${townLabel(host, 3)} ${host.name} не осталось, кого пить` : 'город сгинул'}, и вампир ушёл.`
        : L.fiend ? `Закрылся ${L.label} «${lair.name}» ${wherePhrase(a, lair.i)}: демоны ушли туда, откуда пришли.`
        : L.undead ? `${G[L.g].emptied} ${L.label} «${lair.name}» ${wherePhrase(a, lair.i)}: гниль иссякла, и ${L.domain ? `${necroLabel(lair.race)} ушёл` : `${SPECIES.get(L.species).plural} рассыпались в прах`}.`
        : `${G[L.g].emptied} ${L.label} «${lair.name}» ${wherePhrase(a, lair.i)}: ${s ? 'добычи' : 'земли'} не стало, и ${SPECIES.get(L.species).plural} ушли.`);
      continue;
    }
    // what the lair does this season by the deeds of its species (data/deeds.js `deeds.lair`; atlas/deeds/): a camp's
    // autumn raid, a spring brood, the dragon's summer flight — the lair's role of the actor's brain (atlas/actor.js);
    // a lair with a leader leaves the deeds to it (atlas/leaders.js)
    if (!lair.leader && SPECIES.has(L.species)) actorStep(a, lair, {...lairRole, list: SPECIES.get(L.species).deeds?.lair || []}, {L, sp: SPECIES.get(L.species), role: 'lair', season: seasonId, r: rnd, say: t => lines.push(t)});
    if (lair.hidden && seasonId === 'spring') {   // a town stands right by it: the settlers stumble on it
      const t = (a.towns || []).find(t => t.alive && dist(t, lair) <= WILD.settle * scaleOf(a));
      if (t) { revealLair(a, lair, t.name); lines.push(`Жители ${townLabel(t, 2)} ${t.name} наткнулись в округе на ${acc(L)} «${lair.name}»: теперь о ${G[L.g].about} знают.`); }
    }
    const age = H.year - lair.born;
    if (!lair.ancient && age >= LAIR_AGE.ancient) {
      lair.ancient = true;
      lines.push(`${cap1(L.label)} «${lair.name}» ${G[L.g].stands} уже ${age} лет: о ${G[L.g].about} слагают страшные сказки.`);
    }
  }
  // rivals whose territories touch fight now and then; the stronger and the fiercer wins
  for (const p of a.lairs) {
    if (!p.alive) continue;
    const Lp = LAIRS.get(p.kind);
    for (const q of a.lairs) {
      if (!q.alive || q.id <= p.id || !Lp.rivals.includes(q.kind) || p.boss != null || q.boss != null) continue;   // nobody fights a boss's lair
      const Lq = LAIRS.get(q.kind);
      if (dist(p, q) > R(a, Lp) + R(a, Lq) || rnd() > LL.rivals) continue;
      const sp = p.strength * power(Lp.species) * (LL.luck[0] + LL.luck[1] * rnd()), sq = q.strength * power(Lq.species) * (LL.luck[0] + LL.luck[1] * rnd());
      const [win, lose, Lw, Ll] = sp >= sq ? [p, q, Lp, Lq] : [q, p, Lq, Lp];
      lose.strength *= LL.loser; win.strength *= LL.winner;
      const who = SPECIES.get(Lw.species), whom = SPECIES.get(Ll.species);
      if (lose.strength < LL.routed) {
        lose.alive = false; lose.died = H.year;
        lines.push(`${cap1(who.plural)} ${Lw.from} «${win.name}» разорили ${acc(Ll)} «${lose.name}» ${wherePhrase(a, lose.i)}.`);
      } else lines.push(`${cap1(who.plural)} ${Lw.from} «${win.name}» схватились с ${whomInstr(whom)} ${Ll.from} «${lose.name}» и отогнали их.`);
    }
  }
  return lines;
}

// who comes: «Гноллы с гиенами», «Некромант повёл мертвецов» (by the kind alone; a raid that sets out reads its company
// from the land: raidBand)
export function raidWho(L) {
  const race = SPECIES.get(L.species);
  return L.leads ? L.leads : cap1(L.plural || race.plural) + (L.riders ? ` ${L.on}` : '');
}
// who goes on this lair's raid, by the fields about it (data/lairs.js RAID_MIX): its own, its riders if they live there,
// and maybe a second kind of its land → {who, k: × the raid's might, riders}
export function raidBand(a, lair, L, rnd) {
  const F = a.fauna, M = RAID_MIX, race = SPECIES.get(L.species);
  // a necromancer leads his dead and his cult: stronger with the living about him (data/lairs.js NECRO.cultMight)
  if (L.domain && F) {
    const j = faunaCell(a, lair.i), living = Math.min(1, livingAt(a, j).reduce((v, [r, x]) => v + x * darkness(r), 0));   // (the cult weighs the living as its pool does: atlas/necro.js)
    return {who: 'Мертвецы и культисты', k: 1 + NECRO.cultMight * living, riders: false};   // (the subject of «… из башни «X» опустошили …»)
  }
  if (L.leads || !F) return {who: raidWho(L), k: 1, riders: false};
  const j = faunaCell(a, lair.i), at = id => { const s = F.list[F.idx[id]]; return s ? s.N[j] : 0; };
  let who = cap1(L.plural || race.plural), k = 1;
  const riders = !!L.riders && at(L.riders) >= M.riders;
  if (riders) { who += ` ${L.on}`; k += M.ridersMight; }
  const C = F.list.filter(s => s.id !== L.species && s.id !== L.riders && s.role !== 'spirit' && (s.lair || s.role === 'folk' || s.role === 'predator') && s.N[j] >= M.at);
  const tot = C.reduce((v, s) => v + s.N[j], 0), own = at(L.species);
  if (C.length && rnd() < M.chance * tot / (tot + own)) {
    let t = rnd() * tot, o = C[C.length - 1];
    for (const s of C) if ((t -= s.N[j]) <= 0) { o = s; break; }
    who += `, с ними ${o.sp.plural}`; k += M.might * Math.min(1, o.N[j]);
  }
  return {who, k, riders};
}

// ── a raid at a town (the deeds raid and captives: atlas/deeds/). The town stands with its might × luck (a mage tower's
// wards turn the dead); the camp comes with its strength × its kind's power × its might × the raid's company × luck
export const townStands = (target, L, rnd) => might(target, townFx(target)) * (TRIBE_RAID.luck[0] + TRIBE_RAID.luck[1] * rnd()) * (L.undead && TOWN_ROLES.deadWard.some(id => target.built.includes(id)) ? ROT.wardMight : 1);
export const campMight = (lair, L, k, rnd) => lair.strength * power(L.species) * (L.might || 1) * TRIBE_RAID.might * k * (TRIBE_RAID.luck[0] + TRIBE_RAID.luck[1] * rnd()) * (lair.boss != null ? CAL.boss.might : 1);
// the raid strikes: won — `win(fx)` does what the raid came for and says it; beaten — the camp thins, the town tells
// of it (a raid struck where the camp stands is counted once a year instead, atlas/history.js); either way a hidden
// lair's trail may show (traceRaid) → {line, won} (line null: counted, not told)
export function hitTown(a, lair, L, target, tribe, rnd, atOnce, win, tail = '') {
  const town = townStands(target, L, rnd);
  target.raided = a.hist.year;
  if (tribe > town) return {line: win(townFx(target)) + traceRaid(a, lair, L, target, true, rnd), won: true};
  lair.strength *= TRIBE_RAID.beaten;
  const trace = traceRaid(a, lair, L, target, false, rnd);
  if (!atOnce) return {line: `${cap1(WORLD_PEOPLES.get(target.people).label)} ${townLabel(target, 2)} ${target.name} отбили набег ${L.gen} ${L.from} «${lair.name}»${tail}.` + trace, won: false};
  const rep = a.hist.repelled ||= {};
  rep[target.people] = (rep[target.people] || 0) + 1;
  return {line: trace ? trace.trim() : null, won: false};
}
// the raid for loot: the town loses people and a work, the camp grows (at once, or when the party gets home)
export function strikeTown(a, lair, L, target, tribe, rnd, atOnce, who = raidWho(L)) {
  const T = TRIBE_RAID;
  return hitTown(a, lair, L, target, tribe, rnd, atOnce, fx => {
    const loss = T.loss * raidShare(fx);
    killShare(a, target, loss, 'raid');
    if (atOnce) lair.strength = Math.min(1, lair.strength + T.loot);
    raidGraves(a, target);   // the dead of the raid lie unburied, and the rot takes them
    const burnt = raidSite(a, target, rnd);
    return `${who} ${L.from} «${lair.name}» ${L.raidVerb || 'разграбили'} ${townLabel(target, 1)} ${target.name}: погибло ${Math.round(loss * 100)}% жителей${burnt ? `, ${BURNT[burnt.g]} ${burnt.name}` : ''}.`;
  });
}

// the lair's role for the actor's brain (atlas/actor.js): the deeds of its species' row; a lair is many wills and waits for
// no party of its own (a raid out in autumn does not stop a brood in spring); the deed sets its party out or is done
// where the lair stands (`act` → the chronicle line)
const lairRole = {
  list: [],
  party: () => null,
  setOut(a, l, [plan, , , d], ctx) { const line = DOES[d.id].act?.(a, l, plan, ctx); if (line) ctx.say(line); },
};
// the parties a lair sends: the deed that sent them does the work when they arrive and when they are home
const byOwner = (a, p) => a.lairs.find(l => l.id === p.owner) || null;
BEHAVIOURS.raid = {   // (a raid, or a raid for captives: the party carries the deed's id in `plan`)
  arrive(a, p, rnd, say) { const l = byOwner(a, p); if (l?.alive) DOES[p.plan || 'raid'].arrive(a, p, l, LAIRS.get(l.kind), rnd, say); goHome(a, p); },
  home(a, p) { const l = byOwner(a, p); if (l?.alive) DOES[p.plan || 'raid'].home(a, p, l); },
};
// the brood founds the new lair where it arrives (its parent may be gone by then) and is no more
BEHAVIOURS.brood = {
  arrive(a, p, rnd, say) { p.state = 'gone'; DOES.expand.arrive(a, p, byOwner(a, p), LAIRS.get(p.lairKind), rnd, say); },
};
BEHAVIOURS.dragon = {
  arrive(a, p, rnd, say) { const l = byOwner(a, p); if (l) DOES.strike.arrive(a, p, l, LAIRS.get(l.kind), rnd, say); goHome(a, p); },
};

// ── the hidden lairs of the wild (data/lairs.js WILD)
// the wild: no realm holds the land (atlas/realms.js realmLand — the same land the map's «Державы» shows)
export function wildAt(a, i) {
  if (a.f.ocean[i]) return false;
  const own = realmLand(a);
  return !own || own[i] < 0;
}
// a lair born in the wild once the peoples are in the world is hidden
export function hideIfWild(a, lair) { if (a.peoples?.length && wildAt(a, lair.i)) lair.hidden = true; return lair; }
// the lair is found: no longer hidden; `by` — who found it, for its card
export function revealLair(a, lair, by) { lair.hidden = false; lair.found = {year: a.hist.year, by}; }
// a raid of a hidden lair on a town may show the way back to it → the line to add, or ''
export function traceRaid(a, lair, L, town, won, rnd) {
  if (!lair?.hidden || rnd() >= WILD.raid[won ? 1 : 0]) return '';
  revealLair(a, lair, town.name);
  return ` По следам набега из ${townLabel(town, 2)} ${town.name} нашли, откуда он пришёл: ${L.label} «${lair.name}» ${wherePhrase(a, lair.i)}.`;
}
// spring: the wild gives new lairs, hidden (once the peoples are here)
function spawnWild(a, rnd) {
  const lines = []; if (!a.peoples?.length) return lines;
  const k = scaleOf(a), want = WILD.perYear * k * k, n = Math.floor(want) + (rnd() < want % 1 ? 1 : 0);
  for (let q = 0; q < n; q++) {
    const kinds = wildKinds(a);
    while (kinds.length) {
      const L0 = kinds.splice((rnd() * kinds.length) | 0, 1)[0], i = findSpot(a, L0, rnd, null, WILD.tries, j => wildAt(a, j));
      if (i < 0) continue;
      const L = kindAt(a, i, rnd, L0.id) || L0;   // the land's own monsters take in the newcomers
      const lair = newLair(a, L, i, rnd, WILD.start); lair.hidden = true;
      lines.push(`В глуши ${wherePhrase(a, i)} завелись ${SPECIES.get(L.species).plural}: где их ${L.nouns[0][0]}, не знает ни одна держава.`);
      break;
    }
  }
  return lines;
}

// spring: the lairs that come through history. The dead rise where the rot is thick enough (on the
// barrows, by the ruins, a vampire in a mixed town); a rift opens at a volcano or a seam. Each kind with
// a chance a year, on the ground it asks for, apart from its own kind.
function spawnLairs(a, rnd) {
  const F = a.fauna, lines = [];
  for (const L of LAIRS.filter(L => L.spawn && !L.domain)) {   // (the necromancer's tower is born of the rot by itself: atlas/necro.js)
    if (rnd() > L.spawn || a.lairs.filter(o => o.alive && o.kind === L.id).length >= L.max) continue;
    let best = -1, bv = 0, town = null;
    if (L.at === 'town') {
      // a town with folk of another people and some rot about, and no vampire yet
      const hosts = (a.towns || []).filter(t => t.alive && t.tier >= 1 && strangersOf(a, t).strangers >= 0.1 && a.rot[faunaCell(a, t.i)] >= L.rotAt && !a.lairs.some(o => o.alive && o.kind === L.id && o.town === t.id));
      if (!hosts.length) continue;
      town = hosts[(rnd() * hosts.length) | 0]; best = town.i;
    } else {
      const cells = [];
      if (L.ground === 'rot') { for (let j = 0; j < a.rot.length; j++) if (a.rot[j] >= L.rotAt) cells.push(j); }
      else for (let j = 0; j < F.W * F.H; j++) cells.push(j);
      if (!cells.length) continue;
      for (let t = 0; t < (L.ground === 'rot' ? 60 : 200); t++) {
        const j = cells[(rnd() * cells.length) | 0], x0 = (j % F.W) * F.c, y0 = ((j / F.W) | 0) * F.c;
        const i = Math.min(a.n - 1, (y0 + ((rnd() * F.c) | 0)) * a.w + Math.min(a.w - 1, x0 + ((rnd() * F.c) | 0)));
        if (!groundFits(a, L, i)) continue;
        const v = goodness(a, L, i) * (0.7 + 0.3 * rnd()), p = {x: i % a.w, y: (i / a.w) | 0};
        if (v <= bv || a.lairs.some(o => o.alive && o.kind === L.id && dist(o, p) < 2 * R(a, L))) continue;
        best = i; bv = v;
      }
    }
    if (best < 0) continue;
    const lair = newLair(a, L, best, rnd, L.fiend ? LL.fiendStart : LL.spawnStart), where = wherePhrase(a, best);
    const bent = bend(a, lair);   // within a necromancer's seat: his vassal
    if (town) { lair.town = town.id; a.hist.names.delete(lair.name); lair.name = `${L.nouns[(rnd() * L.nouns.length) | 0][0] === 'усадьба' ? 'Старая' : 'Тёмная'} усадьба`; }
    lines.push(L.id === 'wights' ? `На курганах ${where} поднялись костяки: ${L.label} «${lair.name}».`
      : L.id === 'vampire' ? `В ${townLabel(town, 3)} ${town.name} поселился вампир: в усадьбе на окраине по ночам горит свет, а на улицах пропадают люди.`
      : L.id === 'rift' ? `Земля треснула ${where}: из разлома «${lair.name}» лезут демоны.`
      : `На пепелище ${where} завелись упыри: ${L.label} «${lair.name}».`);
    if (bent) lines.push(bent);
  }
  return lines;
}

// words that agree with the lair's noun
export const G = {n: {emptied: 'Опустело', fresh: 'новое', stands: 'стоит', about: 'нём', it: 'его'}, f: {emptied: 'Опустела', fresh: 'новую', stands: 'стоит', about: 'ней', it: 'её'},
  m: {emptied: 'Опустел', fresh: 'новый', stands: 'стоит', about: 'нём', it: 'его'}, pl: {emptied: 'Опустели', fresh: 'новые', stands: 'стоят', about: 'них', it: 'их'}};
export const acc = L => L.labelAcc || L.label;
// how many captives a lair holds, in words («люди 3, дварфы 1») — for the chronicle and the readout
export const captiveCount = l => Object.entries(l.captives || {}).filter(([, n]) => n > 0).map(([p, n]) => `${WORLD_PEOPLES.get(p).label} ${n}`).join(', ');
// «with the griffins» — the instrumental plural for the few owners
const whomInstr = sp => PLURAL_INSTR[sp.id] || sp.plural;   // (data/names.js)

// the living lair whose territory holds a cell, if any
export function lairAt(a, i) {
  if (!a.lairs) return null;
  const p = {x: i % a.w, y: (i / a.w) | 0};
  let best = null, bd = Infinity;
  for (const l of a.lairs) {
    if (!l.alive) continue;
    const d = dist(l, p);
    if (d <= R(a, LAIRS.get(l.kind)) && d < bd) { best = l; bd = d; }
  }
  return best;
}
