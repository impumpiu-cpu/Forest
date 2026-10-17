// The peoples of the world map (data/peoples.js) and their towns.
//
// A people is a field on the same coarse grid as the beasts: a carrying capacity K from how well the
// biomes (and, for dwarves, the ores) suit them, and a density u (0 … 1 of K) that spreads as a
// Fisher–KPP front — logistic growth plus diffusion, faster through the biomes they move easily in.
// Towns are points. Where the field is dense enough and no town is near, the people found one at the
// best spot around (Sugarscape-like: the band looks about and settles where the land is best). A town
// grows towards what its land feeds, more on a good road, within the room its houses give; it builds
// what it needs most (data/townBuildings.js, atlas/towns.js), and what it has built decides how it
// lives — room, food, trade, might, steadiness, fame. Towns fight the lairs that reach them,
// people hunt the beasts around them, and when two peoples first meet the chronicle says how.
//
// a.peoples = [{id, P, K, u, mob}];  a.towns = [{id, people, name, i, x, y, founded, pop, tier, built, alive}]
import {WORLD_PEOPLES, TIERS, TOWN_WAR} from '../data/peoples.js';
import {TOWN_BUILDINGS} from '../data/townBuildings.js';
import {townFx, room, might, raidShare, chooseBuilding, townLabel} from './towns.js';
import {LAIRS} from '../data/lairs.js';
import {ORE_GENESIS} from '../data/geology.js';
import {SPECIES} from '../data/species.js';
import {RIVERS} from '../data/hydrology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {faunaCell} from './fauna.js';
import {wherePhrase} from './lairs.js';
import {roadAccess} from './roads.js';
import {meet, stateOf, stateLabel, stepDiplomacy, trades, raidGraves} from './diplomacy.js';
import {DIPLOMACY} from '../data/diplomacy.js';
import {DIRS8} from './heap.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lv = id => ORE_GENESIS.get(id).levels;
const oreWealth = (a, i) => Math.max(...['iron', 'bronze', 'silver', 'gold', 'gems'].map(id => a.f[`ore_${id}`][i] / lv(id)[2]));

export function initPeoples(a, era) {
  const F = a.fauna, N = F.W * F.H;
  a.peoples ||= []; a.towns ||= []; a.contacts ||= {};
  a.f.road ||= new Float32Array(a.n);
  for (const P of WORLD_PEOPLES.filter(p => p.era === era)) {
    const K = new Float32Array(N), mob = new Float32Array(N), cnt = new Float32Array(N);
    for (let i = 0; i < a.n; i++) {
      if (a.f.ocean[i]) continue;
      const j = faunaCell(a, i), b = biomeAt(a, i).id;
      K[j] += (P.home[b] || 0) + (P.ores ? P.ores * Math.min(1, oreWealth(a, i)) * (P.home[b] ? 1 : 0.3) : 0);
      mob[j] += P.moves[b] ?? P.movesElse; cnt[j]++;
    }
    for (let j = 0; j < N; j++) { K[j] = cnt[j] ? clamp01(K[j] / (F.c * F.c)) : 0; mob[j] = cnt[j] ? mob[j] / cnt[j] : 0; }
    // how good each world cell is for a town of theirs: the land does not change, so once is enough
    const site = new Float32Array(a.n);
    for (let i = 0; i < a.n; i++) site[i] = siteScore(a, P, i);
    a.peoples.push({id: P.id, P, K, mob, site, u: new Float32Array(N)});
  }
}

// ── towns
function townName(P, rnd, used) {
  for (let t = 0; t < 40; t++) {
    const pick = arr => arr[(rnd() * arr.length) | 0];
    let n = pick(P.names.first) + pick(P.names.mid) + pick(P.names.last);
    n = n.replace(/-+/g, '-');
    if (!used.has(n)) { used.add(n); return n; }
  }
  return `${P.adj} город ${used.size}`;
}

const near = (a, i, test) => {
  const x = i % a.w, y = (i / a.w) | 0;
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && test(ny * a.w + nx)) return true;
  }
  return false;
};
const hasWater = (a, i) => a.f.flow[i] >= RIVERS.stream * scaleOf(a) ** 2 || near(a, i, j => a.f.lake[j] >= 0 || a.f.ocean[j]);

// how good a cell is for a town of this people
function siteScore(a, P, i) {
  const f = a.f, b = biomeAt(a, i);
  if (!b || f.ocean[i] || f.lake[i] >= 0 || b.id === 'water' || b.id === 'ice' || f.flow[i] >= RIVERS.great * scaleOf(a) ** 2) return -Infinity;
  const S = P.site;
  return (P.home[b.id] || 0) + S.water * (hasWater(a, i) ? 1 : 0) + S.coast * (near(a, i, j => f.ocean[j]) ? 1 : 0) +
    S.fert * f.fert[i] + S.trees * f.trees[i] + S.ores * Math.min(1.5, oreWealth(a, i)) + S.steep * (1 - f.flat[i]);
}

const farFromTowns = (a, x, y, d) => !a.towns.some(t => t.alive && Math.hypot(t.x - x, t.y - y) < d);

// whether a coarse cell and its ring (3c × 3c around its middle) have any room for a town at all:
// a town closer to the middle than `spacing` minus the window's half-diagonal covers every cell in it
function roomAround(a, P, j) {
  const F = a.fauna, c = F.c, mx = (j % F.W + 0.5) * c, my = (((j / F.W) | 0) + 0.5) * c;
  return farFromTowns(a, mx, my, P.spacing * scaleOf(a) - 1.5 * Math.SQRT2 * c);
}

// the best spot in a coarse cell and its ring
function bestSite(a, pe, j, rnd) {
  const F = a.fauna, P = pe.P, cx = (j % F.W) * F.c, cy = ((j / F.W) | 0) * F.c, k = scaleOf(a);
  if (!roomAround(a, P, j)) return -1;
  let best = -1, bv = -Infinity;
  for (let y = Math.max(0, cy - F.c); y < Math.min(a.h, cy + 2 * F.c); y++) for (let x = Math.max(0, cx - F.c); x < Math.min(a.w, cx + 2 * F.c); x++) {
    const i = y * a.w + x, v = pe.site[i] + 0.05 * rnd();
    if (v > bv && farFromTowns(a, x, y, P.spacing * k)) { bv = v; best = i; }
  }
  return bv > 0.4 ? best : -1;
}

const tierOf = pop => { let t = 0; TIERS.forEach((T, k) => { if (pop >= T.pop) t = k; }); return t; };
export {townLabel} from './towns.js';

function foundTown(a, pe, i, rnd, pop, say) {
  const P = pe.P, H = a.hist;
  const t = {id: (H.nextTown = (H.nextTown || 0) + 1), people: P.id, name: townName(P, rnd, H.names), i, x: i % a.w, y: (i / a.w) | 0,
    founded: H.year, pop, tier: tierOf(pop), built: [], alive: true};
  a.towns.push(t);
  return t;
}

const APPEARED = {m: 'появился', f: 'появилась', n: 'появилось', pl: 'появились'};
const GREW = {m: 'разросся в', f: 'разрослась в', n: 'разрослось в'};
const SHRANK = {m: 'захирел до', f: 'захирела до', n: 'захирело до'};
// a town falls a size when it has lost down to this share of the size's threshold (so it does not flicker)
const TIER_FALL = 0.7;
const cap1 = s => s[0].toUpperCase() + s.slice(1);

// the peoples arrive: each founding band wakes in the best spot of its land, far from the others
export function arrive(a, era, rnd, say) {
  initPeoples(a, era);
  const F = a.fauna;
  for (const pe of a.peoples.filter(p => p.P.era === era)) {
    const P = pe.P, picks = [];
    // where they may come: the best of their land, its best coast, or as far from every town as it lets them
    const coast = j => { const x0 = (j % F.W) * F.c, y0 = ((j / F.W) | 0) * F.c; for (let y = y0; y < Math.min(a.h, y0 + F.c); y++) for (let x = x0; x < Math.min(a.w, x0 + F.c); x++) if (a.f.ocean[y * a.w + x]) return true; return false; };
    const far = j => { const x = (j % F.W + 0.5) * F.c, y = (((j / F.W) | 0) + 0.5) * F.c; let d = Infinity; for (const t of a.towns) if (t.alive) d = Math.min(d, Math.hypot(t.x - x, t.y - y)); return Math.min(1, d / (a.w / 3)); };
    const mode = P.arrive.mode, score = j => pe.K[j] * (mode === 'far' ? 0.3 + far(j) : 1) * (0.8 + 0.2 * ((j * 7919) % 13) / 13);
    const order = [...pe.K.keys()].filter(j => pe.K[j] > 0.3 && (mode !== 'coast' || coast(j))).sort((p, q) => score(q) - score(p));
    for (const j of order) {
      if (picks.length >= P.arrive.groups) break;
      if (picks.some(q => Math.hypot(q % F.W - j % F.W, ((q / F.W) | 0) - ((j / F.W) | 0)) < F.W / 4)) continue;
      const i = bestSite(a, pe, j, rnd);
      if (i < 0) continue;
      picks.push(j);
      for (const [dx, dy] of [[0, 0], ...DIRS8]) {
        const x = j % F.W + dx, y = ((j / F.W) | 0) + dy;
        if (x >= 0 && y >= 0 && x < F.W && y < F.H && pe.K[y * F.W + x] > 0) pe.u[y * F.W + x] = 0.6;
      }
      const t = foundTown(a, pe, i, rnd, 90 + 60 * rnd());
      t.capital = true;
      say(`${cap1(P.label)} ${P.arrive.verb} ${P.arrive.where} — ${wherePhrase(a, i)} — и заложили ${townLabel(t, 1)} ${t.name}.`);
    }
    if (!picks.length) say(`${cap1(P.label)} не нашли в этом мире земли себе по душе.`);
  }
}

// a year of the peoples: their fields, their towns, their wars with the wild, their meetings
export function stepPeoples(a, rnd, say) {
  const F = a.fauna, N = F.W * F.H, tmp = new Float32Array(N), k = scaleOf(a);
  // towns are the hearths the fields grow from
  for (const pe of a.peoples) for (const t of a.towns) if (t.alive && t.people === pe.id) { const j = faunaCell(a, t.i); pe.u[j] = Math.max(pe.u[j], Math.min(1, 0.45 + 0.15 * t.tier + 0.2 * townFx(t).prestige)); }
  // every people sees the others as they were at the start of the year, whatever the order
  const was = a.peoples.map(pe => Float32Array.from(pe.u));
  for (const [pi, pe] of a.peoples.entries()) {
    const {P, K, u, mob} = pe;
    // Fisher–KPP: logistic growth where they live, spreading easiest through their own lands
    tmp.set(was[pi]);
    for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
      const j = y * F.W + x; if (K[j] <= 0) { u[j] = 0; continue; }
      let flux = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= F.W || ny >= F.H) continue;
        const q = ny * F.W + nx; flux += (mob[j] + mob[q]) / 2 * (tmp[q] - tmp[j]);
      }
      // other peoples on the same land push this one out, the more the worse they get on
      let push = 0;
      for (const [oi, o] of a.peoples.entries()) if (o !== pe && was[oi][j] > 0) push += DIPLOMACY.compete[stateOf(a, P.id, o.id)] * was[oi][j];
      u[j] = clamp01(tmp[j] + P.growth * tmp[j] * (1 - tmp[j]) * K[j] + P.spread * flux / 4 - push * tmp[j]);
    }
  }
  // people hunt: beasts thin out where people live, predators and monsters most
  const occ = new Float32Array(N);
  for (const pe of a.peoples) for (let j = 0; j < N; j++) occ[j] += pe.u[j] * pe.K[j];
  for (const s of F.list) if (s.role !== 'spirit') {
    const hit = s.role === 'predator' ? 0.3 : 0.12;
    for (let j = 0; j < N; j++) if (occ[j] > 0) s.N[j] *= 1 - hit * Math.min(1, occ[j]);
  }
  // new towns where the field is dense and no town is near
  for (const pe of a.peoples) {
    const cand = [...pe.u.keys()].filter(j => pe.u[j] >= pe.P.found && pe.K[j] >= 0.25).sort((p, q) => pe.u[q] * pe.K[q] - pe.u[p] * pe.K[p]);
    let made = 0;
    for (const j of cand) {
      if (made >= 2 || rnd() > 0.35) continue;
      const i = bestSite(a, pe, j, rnd);
      if (i < 0) continue;
      const t = foundTown(a, pe, i, rnd, 40 + 40 * rnd());
      made++;
      say(`${cap1(pe.P.label)} основали ${townLabel(t, 1)} ${t.name} ${wherePhrase(a, i)}.`);
    }
  }
  // towns grow towards what the land around feeds, more on a road, and build as they grow
  for (const t of a.towns) {
    if (!t.alive) continue;
    const pe = a.peoples.find(p => p.id === t.people), j = faunaCell(a, t.i);
    let feed = 0, c = 0;
    for (let y = Math.max(0, ((j / F.W) | 0) - 1); y <= Math.min(F.H - 1, ((j / F.W) | 0) + 1); y++) for (let x = Math.max(0, j % F.W - 1); x <= Math.min(F.W - 1, j % F.W + 1); x++) { feed += pe.K[y * F.W + x]; c++; }
    const fx = townFx(t);
    const feeds = 1400 * (feed / c) * (0.6 + 0.4 * a.f.fert[t.i]) * (1 + 0.6 * roadAccess(a, t.i)) * (t.capital ? 1.4 : 1) * (1 + fx.food + 0.3 * fx.trade);
    const target = Math.min(feeds, room(fx));
    t.pop = Math.max(10, t.pop + 0.14 * (1 + 0.6 * fx.prestige) * t.pop * (1 - t.pop / Math.max(60, target)) + 4 * rnd());
    const tier = tierOf(t.pop);
    if (tier > t.tier) {
      const T = TIERS[tier], was = TIERS[t.tier];
      say(`${cap1(was.label[t.people][0])} ${t.name} ${GREW[was.gender[t.people]]} ${T.label[t.people][1]}: ${Math.round(t.pop)} жителей.`);
      t.tier = tier;
    } else if (tier < t.tier && t.pop < TIERS[t.tier].pop * TIER_FALL) {
      // wars, raids and plagues can wear a town down a size; it keeps what it has built
      const T = TIERS[tier], was = TIERS[t.tier];
      say(`${cap1(was.label[t.people][0])} ${t.name} ${SHRANK[was.gender[t.people]]} ${T.label[t.people][2]}: осталось ${Math.round(t.pop)} жителей.`);
      t.tier = tier;
    }
    // what the town needs most gets built; a big town builds faster
    const threat = threatAt(a, t);
    for (let q = 0; q < (t.tier >= 2 ? 2 : 1); q++) {
      if (rnd() > 0.65) continue;
      const b = chooseBuilding(a, t, pe.P, townFx(t), {feeds, threat, road: roadAccess(a, t.i)}, rnd);
      if (!b) break;
      const first = !t.built.includes(b.id);
      t.built.push(b.id);
      if (first && (b.notable || b.tier >= 3)) say(`В ${townLabel(t, 3)} ${t.name} ${APPEARED[b.g]} ${b.name}.`);
    }
  }
  // towns against the lairs that reach them
  for (const l of a.lairs) {
    if (!l.alive) continue;
    const L = LAIRS.get(l.kind), reach = (L.radius + TOWN_WAR.reach) * k, owner = SPECIES.get(L.species), s = owner.special;
    for (const t of a.towns) {
      if (!t.alive || Math.hypot(t.x - l.x, t.y - l.y) > reach || rnd() > TOWN_WAR.chance) continue;
      const fx = townFx(t), town = might(t, fx) * TOWN_WAR.might * (0.6 + 0.8 * rnd()), beast = l.strength * ((s.S[0] + s.S[1]) / 2 + (s.E[0] + s.E[1]) / 2) * (0.6 + 0.8 * rnd());
      const P = WORLD_PEOPLES.get(t.people);
      if (town > beast) {
        l.alive = false; l.died = a.hist.year; l.clearedBy = t.id;
        say(`${cap1(P.label)} из ${townLabel(t, 2)} ${t.name} выжгли ${L.labelAcc || L.label} «${l.name}»: ${owner.plural} больше не тревожат их земли.`);
        break;
      }
      const loss = TOWN_WAR.raidLoss * raidShare(fx);
      t.pop *= 1 - loss; t.raided = a.hist.year; raidGraves(a, t);
      say(`${cap1(owner.plural)} ${L.from} «${l.name}» напали на ${townLabel(t, 1)} ${t.name}: погибло ${Math.round(loss * 100)}% жителей.`);
      break;
    }
  }
  // first meetings of peoples, told once: where their lands first touch
  for (const p of a.peoples) for (const q of a.peoples) {
    if (p.id >= q.id) continue;
    const key = `${p.id}:${q.id}`; if (a.contacts[key]) continue;
    let j0 = -1;
    for (let j = 0; j < N; j++) if (p.u[j] > 0.1 && q.u[j] > 0.1) { j0 = j; break; }
    // or their towns stand close
    if (j0 < 0) for (const t of a.towns) if (t.alive && t.people === p.id) for (const o of a.towns) if (o.alive && o.people === q.id && Math.hypot(t.x - o.x, t.y - o.y) <= DIPLOMACY.front * k) { j0 = faunaCell(a, Math.round((t.y + o.y) / 2) * a.w + Math.round((t.x + o.x) / 2)); break; }
    if (j0 < 0) continue;
    const fe = meet(a, p.id, q.id, a.hist.year).att;
    a.contacts[key] = {year: a.hist.year, feeling: fe};
    const how = fe <= -3 ? 'с ненавистью' : fe <= -2 ? 'с давней неприязнью' : fe < 0 ? 'настороженно' : fe === 0 ? 'с любопытством' : 'как друзья';
    const cell = Math.min(a.n - 1, (((j0 / F.W) | 0) * F.c) * a.w + (j0 % F.W) * F.c);
    say(`${cap1(p.P.label)} и ${q.P.label} впервые встретились ${wherePhrase(a, cell)} и смотрят друг на друга ${how}.` + (!trades(a, p.id, q.id) ? ' Торговать они не станут.' : ''));
  }
  // their dealings: trade, mingling, raids, wars and peace
  const overlap = (p, q) => {
    const P1 = a.peoples.find(x => x.id === p), Q1 = a.peoples.find(x => x.id === q);
    let both = 0, mine = 0;
    for (let j = 0; j < N; j++) { const u1 = P1.u[j] > 0.1, u2 = Q1.u[j] > 0.1; if (u1 || u2) mine++; if (u1 && u2) both++; }
    return mine ? both / mine : 0;
  };
  stepDiplomacy(a, rnd, say, overlap);
}

// how much the living lairs whose territory reaches a town press on it, 0 … ~1.5
function threatAt(a, t) {
  const k = scaleOf(a);
  let v = 0;
  for (const l of a.lairs) if (l.alive && Math.hypot(t.x - l.x, t.y - l.y) <= (LAIRS.get(l.kind).radius + TOWN_WAR.reach) * k) v += 0.5 * l.strength;
  return Math.min(1.5, v);
}

// the town at or right next to a cell, and whose land a cell is
export function townAt(a, i) {
  if (!a.towns) return null;
  const x = i % a.w, y = (i / a.w) | 0;
  return a.towns.find(t => t.alive && Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1) || null;
}
export function landOf(a, i) {
  if (!a.peoples || a.f.ocean[i]) return null;
  const j = faunaCell(a, i);
  let best = null, bv = 0.1;
  for (const pe of a.peoples) if (pe.u[j] > bv) { bv = pe.u[j]; best = pe; }
  return best ? {people: best.P, share: bv} : null;
}
