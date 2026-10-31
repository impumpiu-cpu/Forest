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
import {townFx, room, might, townLabel, upgradeOf} from './towns.js';
import {keepWork} from './economy.js';
import {seasonMoney} from './treasury.js';
import {stepGolems} from './golems.js';
import {stepWarBeasts} from './beasts.js';
import {SPECIES} from '../data/species.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {TOWN_FLOW, TOWN_BUILDINGS, TOWN_MONEY, goodPrice} from '../data/townBuildings.js';
import {LAIRS} from '../data/lairs.js';
import {ORE_GENESIS} from '../data/geology.js';
import {RIVERS} from '../data/hydrology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {faunaCell} from './fauna.js';
import {wherePhrase} from './lairs.js';
import {roadAccess} from './roads.js';
import {seaAccess, seaFeed} from './sea.js';
import {meet, raceState, stepDiplomacy, trades} from './diplomacy.js';
import {foundRealm, joinRealm, realmLabel, realmHome, worldSubs, subHomeField} from './realms.js';
import {DIPLOMACY} from '../data/diplomacy.js';
import {DIRS8} from './heap.js';
import {abandonEmpty} from './demography.js';
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

// (a people that settles among others — data/peoples.js folk.near, the humans — sits closer to another people's town than to its own)
const farFromTowns = (a, x, y, d, pe = null) => !a.towns.some(t => t.alive && Math.hypot(t.x - x, t.y - y) < d * (pe && t.people !== pe.id ? pe.P.folk?.near ?? 1 : 1));

// whether a coarse cell and its ring (3c × 3c around its middle) have any room for a town at all:
// a town closer to the middle than `spacing` minus the window's half-diagonal covers every cell in it
function roomAround(a, P, j) {
  const F = a.fauna, c = F.c, mx = (j % F.W + 0.5) * c, my = (((j / F.W) | 0) + 0.5) * c;
  return farFromTowns(a, mx, my, P.spacing * scaleOf(a) - 1.5 * Math.SQRT2 * c, {P, id: P.id});
}

// the best spot in a coarse cell and its ring
function bestSite(a, pe, j, rnd) {
  const F = a.fauna, P = pe.P, cx = (j % F.W) * F.c, cy = ((j / F.W) | 0) * F.c, k = scaleOf(a);
  if (!roomAround(a, P, j)) return -1;
  let best = -1, bv = -Infinity;
  for (let y = Math.max(0, cy - F.c); y < Math.min(a.h, cy + 2 * F.c); y++) for (let x = Math.max(0, cx - F.c); x < Math.min(a.w, cx + 2 * F.c); x++) {
    const i = y * a.w + x, v = pe.site[i] + 0.05 * rnd();
    if (v > bv && farFromTowns(a, x, y, P.spacing * k, pe)) { bv = v; best = i; }
  }
  return bv > TL.siteBar ? best : -1;
}

export {townLabel} from './towns.js';

function foundTown(a, pe, i, rnd, pop, say) {
  const P = pe.P, H = a.hist;
  const t = {id: (H.nextTown = (H.nextTown || 0) + 1), people: P.id, name: townName(P, rnd, H.names), i, x: i % a.w, y: (i / a.w) | 0,
    founded: H.year, pop, tier: 0, built: [], alive: true};
  a.towns.push(t);
  return t;
}

// ── settlers (data/peoples.js `settlers`; docs/WORLD.md «Демография»): the only way a people founds a town after its
// arrival. The best free spot within a town's reach — on the people's land, at least `spacing` from every town, worth a
// band's settling (TL.siteBar); nearer is better
export function settleSpot(a, t) {
  const pe = a.peoples?.find(p => p.id === t.people), S = pe?.P.settlers;
  if (!S) return -1;
  const k = scaleOf(a), sp = pe.P.spacing * k, R = S.reach * sp;
  const cand = [];
  for (let y = Math.max(0, Math.floor(t.y - R)); y <= Math.min(a.h - 1, Math.ceil(t.y + R)); y++) for (let x = Math.max(0, Math.floor(t.x - R)); x <= Math.min(a.w - 1, Math.ceil(t.x + R)); x++) {
    const d = Math.hypot(x - t.x, y - t.y);
    if (d > R || d < sp) continue;
    const i = y * a.w + x, v = pe.site[i];
    if (!(v > TL.siteBar) || pe.K[faunaCell(a, i)] < TL.foundLand) continue;
    cand.push([i, v - TL.settle.near * d / R]);
  }
  cand.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
  for (const [i] of cand) if (farFromTowns(a, i % a.w, (i / a.w) | 0, sp, pe)) return i;
  return -1;
}
// a year's growth of a town towards its target (what feeds and houses it): born of its people at its people's `breed`
// (the elder peoples slower), by fame, its realm's economy and its people's needs; over the target it shrinks the same way
export const bornOf = (t, P, fx, target) => TL.growth * (P.breed ?? 1) * (1 + TL.prestige * fx.prestige) * (t.realmFx?.grow ?? 1) * needsGrow(t) * t.pop * (1 - t.pop / Math.max(TL.minTarget, target));
// the settlers of a town found a new one: `settlers.pop` of its people leave it with what its store can spare of
// `settlers.goods`; the new town is of the same realm → the town, or null (no spot, or too few to leave)
export function foundFrom(a, from, rnd, say) {
  const pe = a.peoples.find(p => p.id === from.people), S = pe?.P.settlers;
  if (!S || from.pop - S.pop < S.keep) return null;
  const i = settleSpot(a, from);
  if (i < 0) return null;
  const t = foundTown(a, pe, i, rnd, S.pop);
  from.pop -= S.pop;
  t.realm = from.realm;
  if (t.realm == null) joinRealm(a, t);
  t.from = from.id;
  const carry = {};
  for (const [g, v] of Object.entries(S.goods || {})) {
    const n = Math.min(v, from.stock?.[g] || 0);
    if (n <= 0) continue;
    from.stock[g] -= n; if (from.stock[g] < TOWN_MONEY.dust) delete from.stock[g];
    carry[g] = n;
  }
  if (Object.keys(carry).length) t.stock = carry;
  say(`Поселенцы ${townLabel(from, 2)} ${from.name} основали ${townLabel(t, 1)} ${t.name} ${wherePhrase(a, i)}.`);
  return t;
}
// a year of settling: each people's fullest towns (people against what feeds and houses them, from TL.settle.full, all
// the way at full + span — or simply big: all the way at (1 + TL.settle.big) × its `from`) send settlers, each with
// TL.settle.chance × that, a town no oftener than every
// TL.settle.every years; at most TL.settle.max new towns a year a people
function sendSettlers(a, rnd, say) {
  const Z = TL.settle;
  for (const pe of a.peoples) {
    const S = pe.P.settlers;
    if (!S) continue;
    const fill = t => Math.max(0, Math.min(1, Math.max((t.pop / Math.max(1, t.target || t.pop) - Z.full) / Z.span, (t.pop - S.from) / (S.from * Z.big))));
    const towns = a.towns.filter(t => t.alive && t.people === pe.id && t.pop >= S.from && fill(t) > 0 && !(a.hist.year - (t.settled ?? -Infinity) < Z.every))
      .sort((p, q) => fill(q) - fill(p) || p.id - q.id);
    let made = 0;
    for (const t of towns) {
      if (made >= Z.max) break;
      if (rnd() > Z.chance * fill(t)) continue;
      if (foundFrom(a, t, rnd, say)) { made++; t.settled = a.hist.year; }
    }
  }
}

const APPEARED = {m: 'появился', f: 'появилась', n: 'появилось', pl: 'появились'};

// a building is raised in a town (atlas/build.js): an outlying work takes its cell (atlas/sites.js) — false when there is none
// left — housing goes up in place of an older one, a bridge or a ferry eases the ford, the chronicle tells of the notable ones
export function placeWork(a, t, b, rnd) {
  const sited = (t.sites || []).some(id => a.sites[id - 1]?.alive && a.sites[id - 1].kind === b.id);
  return !b.site || sited || placeSite(a, t, b, rnd);   // more of it widen its cell (a tier on the map takes a cell of its own: its place differs)
}
export function raiseBuilding(a, t, b, say) {
  const first = !t.built.includes(b.id), where = townLabel(t, 3);   // the word before the throne crowns it
  const old = upgradeOf(t, b);   // housing and a tier built in place of an older one
  if (old) t.built.splice(t.built.indexOf(old), 1);
  t.built.push(b.id);
  // a tier of a work on the map: the last unit that gave way leaves its cell free (atlas/sites.js)
  if (old && TOWN_BUILDINGS.get(old).site && !t.built.includes(old)) {
    const s = (t.sites || []).map(id => a.sites?.[id - 1]).find(x => x?.alive && x.kind === old);
    if (s) { s.alive = false; s.died = a.hist?.year ?? 0; if (a.siteAt) a.siteAt[s.i] = 0; t.sites = t.sites.filter(id => id !== s.id); }
  }
  if (b.id === 'bridge' || b.id === 'ferry') markCrossing(a, t.i, b.id === 'bridge' ? 1 : 0.5);
  if (first && b.id === 'throne') say(`В ${where} ${t.name} ${APPEARED[b.g]} ${b.name}: отныне это ${townLabel(t, 0)} державы «${realmLabel(a, t.realm)}».`);
  else if (first && (b.notable || b.pop)) say(`В ${where} ${t.name} ${APPEARED[b.g]} ${b.name}.`);
}
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
      // (`free`: a people that will not land in another's crowded land — the humans look for an empty shore, not the elves' coast)
      const empty = j => Math.max(0, 1 - a.peoples.filter(o => o !== pe).reduce((s, o) => s + o.u[j], 0));
      const score = j => fit[j] * (mode === 'far' ? 0.3 + far(j) : 1) * (P.arrive.free ? 1 - P.arrive.free + P.arrive.free * empty(j) : 1) * (0.8 + 0.2 * ((j * 7919) % 13) / 13);
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
        const t = foundTown(a, pe, i, rnd, TL.bandPop[0] + TL.bandPop[1] * rnd()), r = foundRealm(a, t, sub?.id);
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
  const t = foundTown(a, pe, best, rnd, TL.bandPop[0] + TL.bandPop[1] * rnd()), sub = subId ? worldSubs(P.race).find(s => s.id === subId) : null, r = foundRealm(a, t, sub?.id);
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

// A season of the towns' goods, purses and living works. Growth, founding and building stay yearly.
export function seasonTowns(a, say) {
  // the towns' economies first (atlas/economy.js, atlas/treasury.js): their stores, what they buy of each other, their gold
  for (const t of a.towns) {
    if (!t.alive) continue;
    // the town's economy by its buildings' flows (atlas/economy.js): its hands, its goods, the food its works give;
    // its slaves wear away (the orcs' raids keep them coming)
    if (t.slaves) t.slaves = Math.max(0, t.slaves * (1 - TOWN_FLOW.slaves.waste / SEASONS_PER_YEAR));
    if (t.slavesOf) for (const p of Object.keys(t.slavesOf)) t.slavesOf[p] = Math.min(t.slaves || 0, t.slavesOf[p] * (1 - TOWN_FLOW.slaves.waste / SEASONS_PER_YEAR));
    { const gm = stepGolems(a, t); if (gm) golemLine(a, t, gm, say); }   // a season of the dwarves' golem forge (atlas/golems.js)
    { const wb = stepWarBeasts(a, t); if (wb && t.warBeasts.list[wb] === 1) say(`В бойцовских ямах ${townLabel(t, 2)} ${t.name} теперь свои боевые звери: ${SPECIES.get(wb).plural}.`); }   // the greenskins' pits (atlas/beasts.js)
  }
  seasonMoney(a, a.towns.filter(t => t.alive));   // the economies with the stores, the buying between towns, the upkeep (atlas/treasury.js)
  for (const t of a.towns) if (t.alive) tradeUp(t);   // the nomads sell their finery for arms
  for (const t of a.towns) if (t.alive) keepWork(t);
}

// a people that sells some goods as soon as it has them (data/peoples.js tradeUp: the greenskins) sells what its town's store
// holds of them to the passing traders, for `buys` at `rate` of their worth → the worth sold
export function tradeUp(t) {
  const TU = WORLD_PEOPLES.get(t.people)?.tradeUp;
  if (!TU || !t.stock) return 0;
  let worth = 0;
  for (const g of TU.sells) { const n = t.stock[g] || 0; if (n <= 0) continue; worth += n * goodPrice(g); delete t.stock[g]; }
  if (worth > 0) t.stock[TU.buys] = (t.stock[TU.buys] || 0) + worth * TU.rate / goodPrice(TU.buys);
  return worth;
}

// A year of the peoples: fields, founding, growth, construction and meetings.
export function stepPeoples(a, rnd, say) {
  const F = a.fauna, N = F.W * F.H, tmp = new Float32Array(N), k = scaleOf(a);
  // towns are the hearths the fields grow from
  for (const pe of a.peoples) for (const t of a.towns) if (t.alive && t.people === pe.id) { const j = faunaCell(a, t.i); pe.u[j] = Math.max(pe.u[j], Math.min(1, TL.hearth[0] + TL.hearth[1] * t.tier + TL.hearth[2] * townFx(t).prestige)); }
  // every people sees the others as they were at the start of the year, whatever the order
  const was = a.peoples.map(pe => Float32Array.from(pe.u));
  // how the races stand to each other this year (the worst of their realms' dealings), once per pair
  const compete = a.peoples.map(pe => a.peoples.map(o => (o === pe ? 0 : DIPLOMACY.compete[raceState(a, pe.id, o.id)] * (WORLD_PEOPLES.get(o.id).folk?.push ?? 1) * (1 - (pe.P.folk?.mix ?? 0)))));   // (the dwarves press strangers off their land harder: data/peoples.js folk.push; the humans live among others: folk.mix)
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
  // (new towns: a full town sends settlers, after the growth below — sendSettlers; people come of people, atlas/demography.js)
  // what each town's land and living works feed (people), then the net: the surplus of one town
  // flows to the towns it is linked with that lack (atlas/sites.js)
  fadeScourge(a);
  const feedsOf = new Map();
  seasonTowns(a, say);
  for (const t of a.towns) {
    if (!t.alive) continue;
    const pe = a.peoples.find(p => p.id === t.people), j = faunaCell(a, t.i);
    let feed = 0, c = 0;
    for (let y = Math.max(0, ((j / F.W) | 0) - 1); y <= Math.min(F.H - 1, ((j / F.W) | 0) + 1); y++) for (let x = Math.max(0, j % F.W - 1); x <= Math.min(F.W - 1, j % F.W + 1); x++) { feed += pe.K[y * F.W + x]; c++; }
    feed += seaFeed(a, t) * c;   // the sea around feeds as land does, where the town has fishers (and the more with boats)
    const fx = townFx(t);
    feedsOf.set(t.id, [TL.feeds * (feed / c) * (TL.fert[0] + TL.fert[1] * a.f.fert[t.i]) * (TL.home[0] + TL.home[1] * realmHome(a, t.realm, biomeAt(a, t.i)?.id)) * (1 + TL.road * Math.max(roadAccess(a, t.i), seaAccess(a, t))) * (t.capital ? TL.capital : 1) * (1 - scourgedFood(a, t) + TL.trade * fx.trade) + t.econ.feeds - (t.slaves || 0), room(fx)]);   // the land feeds, and the town's works (flows) feed more; its slaves eat too
  }
  stepNet(a, feedsOf);
  for (const [t, o, by] of fedTowns(a)) say(`${cap1(townLabel(t, 0))} ${t.name} живёт привозным хлебом: ${Math.round(by * 100)}% еды везут из ${townLabel(o, 2)} ${o.name}.`);
  // towns grow towards what they are fed — their land, their works, the supply down the links, less
  // what they send away — within the room their houses give; and build as they grow
  for (const t of a.towns) {
    if (!t.alive) continue;
    const pe = a.peoples.find(p => p.id === t.people);
    const fx = townFx(t);
    let feeds = feedsOf.get(t.id)[0] + t.supply.got - t.supply.gave;
    // a hungry year: what the land, the works and the net do not feed, the store's stores do (a store a man a year)
    const hungry = Math.min(t.stock?.stores || 0, Math.max(0, t.pop - feeds));
    if (hungry > 0) { t.stock.stores = Math.round((t.stock.stores - hungry) * 100) / 100; if (t.stock.stores < TOWN_MONEY.dust) delete t.stock.stores; feeds += hungry; t.ateStores = Math.round(hungry); } else delete t.ateStores;
    const target = Math.min(feeds, room(fx));
    // born of its people towards what feeds and houses them; over it they die off the same way (no roll, no floor:
    // a town too few to hold is left — atlas/demography.js abandonEmpty)
    t.pop = Math.max(0, t.pop + bornOf(t, pe.P, fx, target));
    t.target = Math.round(target);   // what feeds and houses it: its settlers go when it is full (sendSettlers)
    t.peak = Math.max(t.peak || 0, t.pop);   // the most it ever had: the units of work it built then stay (atlas/towns.js unitsMax)
    // what the town needs most gets built; a big town builds faster
    const threat = threatAt(a, t);
    t.wants = {feeds, threat};   // what the town needs, for its realm's council (atlas/mind.js)
    // (what it builds: one project at a time, raised by its builders season by season — atlas/build.js)
    // the step the town has earned by its people and buildings; it falls one when the people are gone
    const tier = tierOf(t), fall = t.tier > 0 && t.pop < TIERS[t.tier].pop * TIER_FALL;
    if (tier > t.tier || (fall && tier < t.tier)) {
      const T = TIERS[tier], was = TIERS[t.tier];
      if (tier > t.tier) say(`${cap1(was.label[t.people][0])} ${t.name} ${GREW[was.gender[t.people]]} ${T.label[t.people][1]}: ${Math.round(t.pop)} жителей.`);
      else say(`${cap1(was.label[t.people][0])} ${t.name} ${SHRANK[was.gender[t.people]]} ${T.label[t.people][2]}: осталось ${Math.round(t.pop)} жителей.`);
      t.tier = tier;
    }
  }
  sendSettlers(a, rnd, say);   // the full towns found new ones
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

// × a town's growth by how its people's needs were met (atlas/treasury.js t.needs; TOWN_MONEY.needs)
const needsGrow = t => { const N = TOWN_MONEY.needs; return t.needs ? (N.grow[0] + N.grow[1] * t.needs.basic) * (1 + N.comfortGrow * t.needs.comfort) : 1; };

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

// a golem made, remade or set on guard: told when it is the first of its kind in the town
const GOLEM_WORDS = {bronze: 'бронзовый', iron: 'железный', steel: 'стальной', mithril: 'мифриловый'};
function golemLine(a, t, g, say) {
  const w = GOLEM_WORDS[g.metal], where = `${townLabel(t, 3)} ${t.name}`;
  if (g.kind === 'auto' && (t.golems.auto[g.id] || []).length === 1) say(`В ${where} ${w} голем встал к работе: ${TOWN_BUILDINGS.get(g.id).name}.`);
  else if (g.kind === 'guard' && t.golems.guard.length === 1) say(`В ${where} ${w} голем встал на стражу.`);
}
