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
import {WORLD_PEOPLES, TIERS, TIER_FALL, TOWN_WAR, TOWN_LIFE as TL, tierOf} from '../data/peoples.js';
import {townFx, room, might, chooseBuilding, townLabel} from './towns.js';
import {LAIRS} from '../data/lairs.js';
import {ORE_GENESIS} from '../data/geology.js';
import {RIVERS} from '../data/hydrology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {faunaCell} from './fauna.js';
import {wherePhrase} from './lairs.js';
import {roadAccess} from './roads.js';
import {seaAccess} from './sea.js';
import {meet, raceState, stepDiplomacy, trades} from './diplomacy.js';
import {foundRealm, joinRealm, realmLabel, realmHome, realmTaste, worldSubs, subHomeField} from './realms.js';
import {DIPLOMACY} from '../data/diplomacy.js';
import {growTown, abandonEmpty} from './demography.js';
import {DIRS8} from './heap.js';
import {placeSite, stepNet, fedTowns, scourgedFood} from './sites.js';
import {fadeScourge} from './diplomacy.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lv = id => ORE_GENESIS.get(id).levels;
const oreWealth = (a, i) => Math.max(...['iron', 'bronze', 'silver', 'gold', 'gems'].map(id => a.f[`ore_${id}`][i] / lv(id)[2]));

export function initPeoples(a, era) {
  for (const P of WORLD_PEOPLES.filter(p => p.era === era)) initPeople(a, P);
}
// one people's fields (once: a people already in the world is left as it is)
export function initPeople(a, P) {
  const F = a.fauna, N = F.W * F.H;
  a.peoples ||= []; a.towns ||= []; a.contacts ||= {}; a.realms ||= [];
  a.f.road ||= new Float32Array(a.n);
  if (a.peoples.some(pe => pe.id === P.id)) return a.peoples.find(pe => pe.id === P.id);
  {
    const K = new Float32Array(N), mob = new Float32Array(N), cnt = new Float32Array(N);
    for (let i = 0; i < a.n; i++) {
      if (a.f.ocean[i]) continue;
      const j = faunaCell(a, i), b = biomeAt(a, i).id;
      K[j] += (P.home[b] || 0) + (P.ores ? P.ores * Math.min(1, oreWealth(a, i)) * (P.home[b] ? 1 : TL.oresAway) : 0);
      mob[j] += P.moves[b] ?? P.movesElse; cnt[j]++;
    }
    for (let j = 0; j < N; j++) { K[j] = cnt[j] ? clamp01(K[j] / (F.c * F.c)) : 0; mob[j] = cnt[j] ? mob[j] / cnt[j] : 0; }
    // how good each world cell is for a town of theirs: the land does not change, so once is enough
    const site = new Float32Array(a.n);
    for (let i = 0; i < a.n; i++) site[i] = siteScore(a, P, i);
    const pe = {id: P.id, P, K, mob, site, u: new Float32Array(N)};
    a.peoples.push(pe);
    return pe;
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
  return bv > TL.siteBar ? best : -1;
}

export {townLabel} from './towns.js';

// a founding band comes with its supplies: TOWN_LIFE.bandStores days of stores
const withStores = t => { t.econ = {ways: {}, stock: {stores: Math.round(t.pop * TL.bandStores)}, rate: {}, short: [], load: 1}; return t; };
export function foundTown(a, pe, i, rnd, pop, say) {
  const P = pe.P, H = a.hist;
  const t = {id: (H.nextTown = (H.nextTown || 0) + 1), people: P.id, name: townName(P, rnd, H.names), i, x: i % a.w, y: (i / a.w) | 0,
    founded: H.year, pop, tier: 0, built: [], alive: true};
  a.towns.push(t);
  return t;
}

const APPEARED = {m: 'появился', f: 'появилась', n: 'появилось', pl: 'появились'};
export const BURNT = {m: 'сожжён', f: 'сожжена', n: 'сожжено', pl: 'сожжены'};
const GREW = {m: 'разросся в', f: 'разрослась в', n: 'разрослось в'};
const SHRANK = {m: 'захирел до', f: 'захирела до', n: 'захирело до'};
const cap1 = s => s[0].toUpperCase() + s.slice(1);

// the peoples arrive: each founding band wakes in the best spot of its land, far from the others
export function arrive(a, era, rnd, say) {
  initPeoples(a, era);
  const F = a.fauna;
  for (const pe of a.peoples.filter(p => p.P.era === era)) {
    const P = pe.P, picks = [];
    // where they may come: the best of their land, its best coast, or as far from every town as it lets them
    const coast = j => { const x0 = (j % F.W) * F.c, y0 = ((j / F.W) | 0) * F.c; for (let y = y0; y < Math.min(a.h, y0 + F.c); y++) for (let x = x0; x < Math.min(a.w, x0 + F.c); x++) if (a.f.ocean[y * a.w + x]) return true; return false; };
    const far = j => { const x = (j % F.W) * F.c + F.c / 2, y = ((j / F.W) | 0) * F.c + F.c / 2; let d = Infinity; for (const t of a.towns) if (t.alive) d = Math.min(d, Math.hypot(t.x - x, t.y - y)); return Math.min(1, d / (a.w / 3)); };
    // each founding band is its own sub-race (data/races.js peoples) and looks for the land that suits it
    const subs = worldSubs(P.race), mode = P.arrive.mode;
    for (let g = 0; g < P.arrive.groups; g++) {
      const sub = subs.length ? subs[g % subs.length] : null, fit = sub ? subHomeField(a, P.race, sub) : pe.K;
      const score = j => fit[j] * (mode === 'far' ? 0.3 + far(j) : 1) * (0.8 + 0.2 * ((j * 7919) % 13) / 13);
      const order = [...fit.keys()].filter(j => fit[j] > 0.3 && (mode !== 'coast' || coast(j))).sort((p, q) => score(q) - score(p));
      for (const j of order) {
        if (picks.some(q => Math.hypot(q % F.W - j % F.W, ((q / F.W) | 0) - ((j / F.W) | 0)) < F.W / 4)) continue;
        const i = bestSite(a, pe, j, rnd);
        if (i < 0) continue;
        picks.push(j);
        for (const [dx, dy] of [[0, 0], ...DIRS8]) {
          const x = j % F.W + dx, y = ((j / F.W) | 0) + dy;
          if (x >= 0 && y >= 0 && x < F.W && y < F.H && pe.K[y * F.W + x] > 0) pe.u[y * F.W + x] = TL.band;
        }
        const t = withStores(foundTown(a, pe, i, rnd, TL.bandPop[0] + TL.bandPop[1] * rnd())), r = foundRealm(a, t, sub?.id);
        say(`${cap1(sub?.plural || P.label)} ${P.arrive.verb} ${P.arrive.where} — ${wherePhrase(a, i)} — и заложили ${townLabel(t, 1)} ${t.name}. Так началась держава «${realmLabel(a, r.id)}».`);
        break;
      }
    }
    if (!picks.length) say(`${cap1(P.label)} не нашли в этом мире земли себе по душе.`);
  }
}

// «Заселение мира» (atlas/settle.js): a band of a people landed by hand near a cell — its town at the best spot within
// a coarse cell or two of it (as good as its land there lets, without the arrival's bar), its own realm of the sub-race
// given (or the one that fits the land), the field of the people woken around it. → {town, realm} or {error}
export function landBand(a, peopleId, i, subId, rnd, say) {
  const P = WORLD_PEOPLES.get(peopleId), pe = initPeople(a, P), F = a.fauna, k = scaleOf(a);
  const x0 = i % a.w, y0 = (i / a.w) | 0, Rr = 2 * F.c;
  let best = -1, bv = -Infinity;
  for (let y = Math.max(0, y0 - Rr); y <= Math.min(a.h - 1, y0 + Rr); y++) for (let x = Math.max(0, x0 - Rr); x <= Math.min(a.w - 1, x0 + Rr); x++) {
    const j = y * a.w + x, v = pe.site[j] - 0.04 * Math.hypot(x - x0, y - y0) + 0.02 * rnd();
    if (v > bv && pe.site[j] > -Infinity && farFromTowns(a, x, y, P.spacing * k * 0.6)) { bv = v; best = j; }
  }
  if (best < 0) return {error: a.towns.some(t => t.alive && Math.hypot(t.x - x0, t.y - y0) < P.spacing * k) ? 'слишком близко к другому городу' : 'здесь негде встать городу: вода, лёд или большая река'};
  const jc = faunaCell(a, best);
  for (const [dx, dy] of [[0, 0], ...DIRS8]) {
    const x = jc % F.W + dx, y = ((jc / F.W) | 0) + dy;
    if (x >= 0 && y >= 0 && x < F.W && y < F.H && pe.K[y * F.W + x] > 0) pe.u[y * F.W + x] = Math.max(pe.u[y * F.W + x], TL.band);
  }
  const t = withStores(foundTown(a, pe, best, rnd, TL.bandPop[0] + TL.bandPop[1] * rnd())), sub = subId ? worldSubs(P.race).find(s => s.id === subId) : null, r = foundRealm(a, t, sub?.id);
  const S = sub || worldSubs(P.race).find(s => s.id === r.sub);
  say?.(`${cap1(S?.plural || P.label)} ${P.arrive.verb} ${P.arrive.where} — ${wherePhrase(a, best)} — и заложили ${townLabel(t, 1)} ${t.name}. Так началась держава «${realmLabel(a, r.id)}».`);
  return {town: t, realm: r};
}

// how firmly a people holds each coarse cell, 0 … 1: by the distance to its nearest living town (TOWN_LIFE.hold) — the
// land a people has no town near any more (its towns burnt, its frontier pushed back) fades instead of living on
function holdField(a, pe) {
  const F = a.fauna, N = F.W * F.H, out = new Float32Array(N), sp = pe.P.spacing * scaleOf(a), H = TL.hold;
  const near = H.near * sp, far = H.far * sp, mine = a.towns.filter(t => t.alive && t.people === pe.id);
  for (let j = 0; j < N; j++) {
    const x = (j % F.W) * F.c + F.c / 2, y = ((j / F.W) | 0) * F.c + F.c / 2;
    let d = Infinity; for (const t of mine) { const e = Math.hypot(t.x - x, t.y - y); if (e < d) d = e; }
    out[j] = d <= near ? 1 : d >= far ? 0 : (far - d) / (far - near);
  }
  return out;
}

// a year of the peoples: their fields, their towns, their wars with the wild, their meetings
export function stepPeoples(a, rnd, say) {
  const F = a.fauna, N = F.W * F.H, tmp = new Float32Array(N), k = scaleOf(a);
  // towns are the hearths the fields grow from
  for (const pe of a.peoples) for (const t of a.towns) if (t.alive && t.people === pe.id) { const j = faunaCell(a, t.i); pe.u[j] = Math.max(pe.u[j], Math.min(1, TL.hearth[0] + TL.hearth[1] * t.tier)); }
  // every people sees the others as they were at the start of the year, whatever the order
  const was = a.peoples.map(pe => Float32Array.from(pe.u));
  // how the races stand to each other this year (the worst of their realms' dealings), once per pair
  const compete = a.peoples.map(pe => a.peoples.map(o => (o === pe ? 0 : DIPLOMACY.compete[raceState(a, pe.id, o.id)])));
  for (const [pi, pe] of a.peoples.entries()) {
    const {P, K, u, mob} = pe, hold = holdField(a, pe);
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
      for (const [oi, o] of a.peoples.entries()) if (o !== pe && was[oi][j] > 0) push += compete[pi][oi] * was[oi][j];
      u[j] = clamp01(tmp[j] + P.growth * tmp[j] * (1 - tmp[j]) * K[j] + P.spread * flux / 4 - push * tmp[j] - TL.hold.fade * (1 - hold[j]) * tmp[j]);
    }
  }
  // people hunt: beasts thin out where people live, predators and monsters most
  const occ = new Float32Array(N);
  for (const pe of a.peoples) for (let j = 0; j < N; j++) occ[j] += pe.u[j] * pe.K[j];
  for (const s of F.list) if (s.role !== 'spirit') {
    const hit = s.role === 'predator' ? TL.hunt.predator : TL.hunt.other;
    for (let j = 0; j < N; j++) if (occ[j] > 0) s.N[j] *= 1 - hit * Math.min(1, occ[j]);
  }
  // (new towns: a town raises settlers and they found one within its reach — atlas/build.js, foundFrom below)
  // what each town's land and living works feed (people), then the net: the surplus of one town
  // flows to the towns it is linked with that lack (atlas/sites.js)
  fadeScourge(a);
  const feedsOf = new Map();
  for (const t of a.towns) {
    if (!t.alive) continue;
    const pe = a.peoples.find(p => p.id === t.people), j = faunaCell(a, t.i);
    let feed = 0, c = 0;
    for (let y = Math.max(0, ((j / F.W) | 0) - 1); y <= Math.min(F.H - 1, ((j / F.W) | 0) + 1); y++) for (let x = Math.max(0, j % F.W - 1); x <= Math.min(F.W - 1, j % F.W + 1); x++) { feed += pe.K[y * F.W + x]; c++; }
    const fx = townFx(t);
    feedsOf.set(t.id, [TL.feeds * (feed / c) * (TL.fert[0] + TL.fert[1] * a.f.fert[t.i]) * (TL.home[0] + TL.home[1] * realmHome(a, t.realm, biomeAt(a, t.i)?.id)) * (1 + TL.road * Math.max(roadAccess(a, t.i), seaAccess(a, t))) * (t.capital ? TL.capital : 1) * (1 + fx.food - scourgedFood(a, t) + TL.trade * fx.trade), room(fx)]);
  }
  stepNet(a, feedsOf);
  for (const [t, o, by] of fedTowns(a)) say(`${cap1(townLabel(t, 0))} ${t.name} живёт привозным хлебом: ${Math.round(by * 100)}% еды везут из ${townLabel(o, 2)} ${o.name}.`);
  // towns grow towards what they are fed — their land, their works, the supply down the links, less
  // what they send away — within the room their houses give; and build as they grow
  for (const t of a.towns) {
    if (!t.alive) continue;
    const pe = a.peoples.find(p => p.id === t.people);
    const fx = townFx(t);
    const feeds = feedsOf.get(t.id)[0] + t.supply.got - t.supply.gave;
    const target = Math.min(feeds, room(fx));
    growTown(a, t, target);   // born, starved — the people are counted, not made (atlas/demography.js)
    // what the town needs, for its council (atlas/build.js: every season it raises what it needs most)
    t.wants = {feeds, threat: threatAt(a, t)};
    // the step the town has earned by its people and buildings; it falls one when the people are gone
    const tier = tierOf(t), fall = t.tier > 0 && t.pop < TIERS[t.tier].pop * TIER_FALL;
    if (tier > t.tier || (fall && tier < t.tier)) {
      const T = TIERS[tier], was = TIERS[t.tier];
      if (tier > t.tier) say(`${cap1(was.label[t.people][0])} ${t.name} ${GREW[was.gender[t.people]]} ${T.label[t.people][1]}: ${Math.round(t.pop)} жителей.`);
      else say(`${cap1(was.label[t.people][0])} ${t.name} ${SHRANK[was.gender[t.people]]} ${T.label[t.people][2]}: осталось ${Math.round(t.pop)} жителей.`);
      t.tier = tier;
    }
  }
  abandonEmpty(a, rnd, say);   // a town left with too few people is left (atlas/demography.js)
  // (the towns against the lairs that reach them — the realms' deed, atlas/deeds/clearLair.js)
  // first meetings of realms, told once: when their towns first stand within the front of each other
  for (const r of a.realms) for (const q of a.realms) {
    if (r.id >= q.id) continue;
    const key = `${r.id}:${q.id}`; if (a.contacts[key]) continue;
    let where = -1;
    for (const t of a.towns) if (t.alive && t.realm === r.id) for (const o of a.towns) if (o.alive && o.realm === q.id && Math.hypot(t.x - o.x, t.y - o.y) <= DIPLOMACY.front * k) { where = Math.round((t.y + o.y) / 2) * a.w + Math.round((t.x + o.x) / 2); break; }
    if (where < 0) continue;
    const fe = meet(a, r.id, q.id, a.hist.year).att;
    a.contacts[key] = {year: a.hist.year, feeling: fe};
    const how = fe <= -3 ? 'с ненавистью' : fe <= -2 ? 'с давней неприязнью' : fe < 0 ? 'настороженно' : fe === 0 ? 'с любопытством' : r.people === q.people ? 'как родня' : 'как друзья';
    say(`${cap1(realmLabel(a, r.id))} и ${realmLabel(a, q.id)} впервые встретились ${wherePhrase(a, where)} и смотрят друг на друга ${how}.` + (!trades(a, r.id, q.id) ? ' Торговать они не станут.' : ''));
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

// ── settlers (atlas/build.js raises them; data/peoples.js `settlers`): the best free spot within the town's reach — on
// the people's land, at least `spacing` from every town, worth a band's settling (TL.siteBar); nearer is better
export function settleSpot(a, t) {
  const pe = a.peoples?.find(p => p.id === t.people), S = pe?.P.settlers;
  if (!S) return -1;
  const k = scaleOf(a), sp = pe.P.spacing * k, R = S.reach * sp, F = a.fauna;
  const cand = [];
  for (let y = Math.max(0, Math.floor(t.y - R)); y <= Math.min(a.h - 1, Math.ceil(t.y + R)); y++) for (let x = Math.max(0, Math.floor(t.x - R)); x <= Math.min(a.w - 1, Math.ceil(t.x + R)); x++) {
    const d = Math.hypot(x - t.x, y - t.y);
    if (d > R || d < sp) continue;
    const i = y * a.w + x, v = pe.site[i];
    if (!(v > TL.siteBar) || pe.K[faunaCell(a, i)] < TL.foundLand) continue;
    cand.push([i, v - TL.settleNear * d / R]);
  }
  cand.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
  for (const [i] of cand) if (farFromTowns(a, i % a.w, (i / a.w) | 0, sp)) return i;
  return -1;
}
// the settlers of a town found a new one: they and the goods they carried leave it; the new town is of the same realm
export function foundFrom(a, from, rnd, say, goods = {}) {
  const pe = a.peoples.find(p => p.id === from.people), S = pe.P.settlers;
  const i = settleSpot(a, from);
  if (i < 0 || from.pop < S.pop + TL.abandon) return null;
  const t = foundTown(a, pe, i, rnd, S.pop);
  from.pop -= S.pop;
  t.realm = from.realm;
  if (t.realm == null) joinRealm(a, t);
  t.from = from.id;
  t.econ = {ways: {}, stock: Object.fromEntries(Object.entries(goods).filter(([, v]) => v > 0)), rate: {}, short: [], load: 1};
  say(`Поселенцы ${townLabel(from, 2)} ${from.name} основали ${townLabel(t, 1)} ${t.name} ${wherePhrase(a, i)}.`);
  return t;
}

// a building is finished in a town (atlas/build.js): an outlying work takes its own cell (atlas/sites.js) — false when there
// is none left — a bridge or a ferry eases the ford, and the chronicle tells of the notable ones
export function raiseBuilding(a, t, b, rnd, say) {
  const first = !t.built.includes(b.id), where = townLabel(t, 3);   // the word before the throne crowns it
  if (b.site && !placeSite(a, t, b, rnd)) return false;
  t.built.push(b.id);
  if (b.id === 'bridge' || b.id === 'ferry') markCrossing(a, t.i, b.id === 'bridge' ? 1 : 0.5);
  if (first && b.id === 'throne') say(`В ${where} ${t.name} ${APPEARED[b.g]} ${b.name}: отныне это ${townLabel(t, 0)} державы «${realmLabel(a, t.realm)}».`);
  else if (first && (b.notable || b.pop)) say(`В ${where} ${t.name} ${APPEARED[b.g]} ${b.name}.`);
  return true;
}

// a bridge (or a ferry, half as good) at a town takes the ford out of the roads' cost on the river
// cells beside it (atlas/roads.js stepCost reads a.f.bridge)
function markCrossing(a, i, v) {
  a.f.bridge ||= new Float32Array(a.n);
  const x0 = i % a.w, y0 = (i / a.w) | 0;
  const k2 = scaleOf(a) ** 2;
  for (let y = Math.max(0, y0 - 1); y <= Math.min(a.h - 1, y0 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(a.w - 1, x0 + 1); x++) {
    const j = y * a.w + x;   // only the river cells have a ford to take away
    if (!a.f.ocean[j] && a.f.flow[j] >= RIVERS.river * k2) a.f.bridge[j] = Math.max(a.f.bridge[j], v);
  }
}

// how much the living lairs whose territory reaches a town press on it, 0 … ~1.5
function threatAt(a, t) {
  const k = scaleOf(a);
  let v = 0;
  for (const l of a.lairs) if (l.alive && Math.hypot(t.x - l.x, t.y - l.y) <= (LAIRS.get(l.kind).radius + TOWN_WAR.reach) * k) v += TOWN_WAR.threat * l.strength;
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
