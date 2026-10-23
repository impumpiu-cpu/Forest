// Realms: the states of the world map. A people (data/peoples.js) is a race — a field of density
// with towns; a realm is a seat and the towns that hold to it. Every founding band starts a realm,
// so a race comes into the world as two; a new town joins the realm of the nearest town of its
// people. All dealings — attitudes, trade, wars, raids (atlas/diplomacy.js) — are between realms;
// two realms of one race start from their race's memory of itself. The seat is the capital
// (data/peoples.js CAPITAL): only it builds the throne hall, the palace and the mint.
//
// a.realms = [{id, people, name, capital: townId, founded, color, align: {order, mercy}, seatSince}]
// align — the realm's world view (data/values.js), moved by its wars, peace and fallen seats (atlas/diplomacy.js)
import {WORLD_PEOPLES, EPITHETS, SCHISM, TIERS} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {DIPLOMACY} from '../data/diplomacy.js';
import {townFx, townLabel, townGender} from './towns.js';
import {meet, relation} from './diplomacy.js';
import {ORE_GENESIS} from '../data/geology.js';
import {RIVERS} from '../data/hydrology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {DIRS8} from './heap.js';
import {ALIGN, ALIGN_DRIFT, alignNear, shiftAlign} from '../data/values.js';
import {mulberry, seedNumber} from '../core/rng.js';

const lv = id => ORE_GENESIS.get(id).levels;
const near = (a, i, test) => {
  const x = i % a.w, y = (i / a.w) | 0;
  for (const [dx, dy] of DIRS8) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && test(ny * a.w + nx)) return true; }
  return false;
};

// the names the land of a cell offers, best first
function epithets(a, i, P) {
  const f = a.f, out = [], k2 = scaleOf(a) ** 2;
  // a people that lives off the rock is named by it; the others by water and land
  if (P.ores) for (const id of ['gold', 'silver', 'gems', 'bronze', 'iron', 'coal']) if (f[`ore_${id}`][i] >= lv(id)[2]) out.push(...EPITHETS.ores[id]);
  if (near(a, i, j => f.ocean[j])) out.push(...EPITHETS.water.coast);
  if (f.flow[i] >= RIVERS.great * k2 || near(a, i, j => f.flow[j] >= RIVERS.great * k2)) out.push(...EPITHETS.water.great);
  else if (f.flow[i] >= RIVERS.river * k2 || near(a, i, j => f.flow[j] >= RIVERS.river * k2)) out.push(...EPITHETS.water.river);
  let lake = -1; near(a, i, j => { if (f.lake[j] >= 0) lake = f.lake[j]; return false; });
  if (lake >= 0) out.push(...(a.lakes[lake].salt ? EPITHETS.water.salt : EPITHETS.water.lake));
  const b = biomeAt(a, i); if (b && EPITHETS.biomes[b.id]) out.push(...EPITHETS.biomes[b.id]);
  out.push(...EPITHETS.else);
  return out;
}

// the sub-race of a race that fits the land of a cell best (data/races.js peoples), or none
export function subFor(race, biome) {
  const subs = (SPECIES.get(race).peoples || []).filter(p => p.world !== false);
  if (!subs.length) return null;
  const R = SPECIES.get(race);
  return subs.map(p => [p, (p.home || R.home)[biome] || 0]).sort((x, y) => y[1] - x[1] || (y[0].weight ?? 1) - (x[0].weight ?? 1))[0][0];
}
export const subOf = (a, id) => { const r = realmOf(a, id); return r.sub ? SPECIES.get(WORLD_PEOPLES.get(r.people).race).peoples.find(p => p.id === r.sub) : null; };
// how well the realm's own folk take to a cell: the sub-race's home there, or the race's
export const realmHome = (a, id, biome) => { const r = realmOf(a, id), sub = subOf(a, id); return (sub?.home || SPECIES.get(WORLD_PEOPLES.get(r.people).race).home)[biome] || 0; };
export const realmTaste = (a, id) => { const r = realmOf(a, id), sub = subOf(a, id); return sub?.taste ? {...WORLD_PEOPLES.get(r.people).taste, ...sub.taste} : WORLD_PEOPLES.get(r.people).taste; };

// the sub-races of a race that found realms, and the home of one over a coarse cell (for the arrival)
export const worldSubs = race => (SPECIES.get(race).peoples || []).filter(p => p.world !== false);
export function subHomeField(a, race, sub) {
  const F = a.fauna, N = F.W * F.H, out = new Float32Array(N), cnt = new Float32Array(N), home = sub.home || SPECIES.get(race).home;
  for (let i = 0; i < a.n; i++) { if (a.f.ocean[i]) continue; const j = (((i / a.w) | 0) / F.c | 0) * F.W + ((i % a.w) / F.c | 0); out[j] += home[biomeAt(a, i).id] || 0; cnt[j]++; }
  for (let j = 0; j < N; j++) out[j] = cnt[j] ? out[j] / cnt[j] : 0;
  return out;
}

// a new realm: at the arrival each band brings its own sub-race (`subId`); a realm born of a schism
// takes the sub-race that fits the land of its seat. Its world view (data/values.js ALIGN): within ±ALIGN.realm of its
// race's point — or, born of a schism, of the realm it broke from (`from`). Drawn from a stream of its own, so the
// history's random numbers are not touched
export function foundRealm(a, t, subId = null, from = null) {
  a.realms ||= [];
  const P = WORLD_PEOPLES.get(t.people), used = new Set(a.realms.filter(r => r.people === t.people).map(r => r.name));
  const sub = subId ? worldSubs(P.race).find(p => p.id === subId) : subFor(P.race, biomeAt(a, t.i)?.id);
  const name = epithets(a, t.i, P).find(n => !used.has(n)) || `${EPITHETS.else[0]} ${used.size}`;
  const nth = a.realms.filter(r => r.people === t.people).length;
  // each realm of a race its own shade of the race's colour
  const shade = [1, 0.72, 1.25, 0.55, 1.45][nth % 5], color = P.color.map(v => Math.max(0, Math.min(255, Math.round(v * shade))));
  const id = `r${a.realms.length + 1}`;
  const align = alignNear(from?.align || SPECIES.get(P.race).align, ALIGN.realm, mulberry(seedNumber(`${a.cfg.seed}:align:${id}`)));
  const r = {id, people: t.people, sub: sub?.id || null, name, capital: t.id, founded: a.hist.year, color, align, root: {...align}, seatSince: a.hist.year};
  a.realms.push(r);
  t.realm = r.id; t.capital = true;
  return r;
}

export const realmOf = (a, id) => a.realms.find(r => r.id === id);
export const realmLabel = (a, id) => { const r = realmOf(a, id), sub = subOf(a, id); return `${sub?.plural || WORLD_PEOPLES.get(r.people).label} ${r.name}`; };
export const realmLabelGen = (a, id) => { const r = realmOf(a, id), sub = subOf(a, id); return `${sub?.gen || WORLD_PEOPLES.get(r.people).labelGen} ${r.name}`; };
export const realmPeople = (a, id) => realmOf(a, id).people;
export const capitalOf = (a, id) => a.towns.find(t => t.id === realmOf(a, id).capital) || null;
export const realmTowns = (a, id) => a.towns.filter(t => t.alive && t.realm === id);

// a new town holds to the realm of the nearest town of its people
export function joinRealm(a, t) {
  let best = null, bd = Infinity;
  for (const o of a.towns) if (o !== t && o.alive && o.people === t.people && o.realm) { const d = Math.hypot(o.x - t.x, o.y - t.y); if (d < bd) { bd = d; best = o; } }
  if (best) t.realm = best.realm; else foundRealm(a, t);
  return t.realm;
}

// ── schisms
const cap1 = s => s[0].toUpperCase() + s.slice(1);
const glory = t => t.pop * (1 + townFx(t).prestige);

// the towns of two seats are divided by which seat is nearer
function divide(a, oldId, newId, seatOld, seatNew) {
  let went = 0;
  for (const t of a.towns) if (t.alive && t.realm === oldId && t !== seatOld && t !== seatNew) {
    if (Math.hypot(t.x - seatNew.x, t.y - seatNew.y) < Math.hypot(t.x - seatOld.x, t.y - seatOld.y)) { t.realm = newId; went++; }
  }
  return went;
}

// a town breaks away with the towns nearer to it: a new realm, wary of the old one, sometimes at war
function breakAway(a, r, seat, rnd, say, why) {
  const old = capitalOf(a, r.id), nr = foundRealm(a, seat, null, r), went = old ? divide(a, r.id, nr.id, old, seat) : 0;
  a.contacts[r.id < nr.id ? `${r.id}:${nr.id}` : `${nr.id}:${r.id}`] = {year: a.hist.year, feeling: SCHISM.attitude};
  const rel = meet(a, r.id, nr.id, a.hist.year);
  rel.att = SCHISM.attitude;
  say(`${why} ${townLabel(seat, 0)} ${seat.name} объявил${TIERS[seat.tier].gender[seat.people] === 'f' ? 'а' : TIERS[seat.tier].gender[seat.people] === 'n' ? 'о' : ''} себя столицей новой державы «${realmLabel(a, nr.id)}»` +
    (went ? `; с ${went === 1 ? 'ней ушёл 1 город' : `ней ушли ${went} ${went < 5 ? 'города' : 'городов'}`}.` : '.'));
  if (old && rnd() < SCHISM.war) { rel.war = {since: a.hist.year, battles: 0, razed: 0}; rel.wars++; say(`${cap1(realmLabel(a, r.id))} и ${realmLabel(a, nr.id)} не поделили власть: началась война.`); }
  return nr;
}

// a year of the realms: contenders rise where a town outgrows its seat
export function stepRealms(a, rnd, say) {
  const H = a.hist, k = scaleOf(a);
  for (const r of a.realms) {
    const seat = capitalOf(a, r.id);
    if (!seat || !seat.alive) continue;
    const atWar = Object.entries(a.rel || {}).some(([kk, x]) => x.war && kk.split(':').includes(r.id));
    for (const t of a.towns) {
      if (!t.alive || t.realm !== r.id || t === seat || t.tier < 2) continue;
      // a harbour town has the sea's trade of its own, and stands further from the seat than its road
      const far = Math.hypot(t.x - seat.x, t.y - seat.y) / (DIPLOMACY.front * k) + (t.built.includes('harbor') && !seat.built.includes('harbor') ? SCHISM.harbor : 0);
      if (t.pop >= SCHISM.edge * seat.pop && far >= SCHISM.far) {
        t.contender = (t.contender || 0) + 1;
        if (t.contender === SCHISM.years) say(`${cap1(townLabel(t, 0))} ${t.name} не меньше ${townLabel(seat, 2)} ${seat.name} и стоит далеко от ${townGender(seat) === 'f' ? 'неё' : 'него'}: в державе «${realmLabel(a, r.id)}» зреет раскол.`);
        if (t.contender < SCHISM.years) continue;
        const shaken = atWar || (seat.raided != null && H.year - seat.raided < 6);
        if (rnd() < SCHISM.chance * far * (shaken ? SCHISM.shaken : 1)) {
          t.contender = 0;
          breakAway(a, r, t, rnd, say, `Раскол:`);
          break;
        }
      } else t.contender = 0;
    }
  }
}

// the seat of a realm is burnt: the most glorious town takes the throne, or the realm breaks in two
export function seatFallen(a, t, rnd, say) {
  const r = realmOf(a, t.realm);
  if (!r || r.capital !== t.id) return;
  t.capital = false;
  const left = a.towns.filter(o => o.alive && o.realm === r.id).sort((p, q) => glory(q) - glory(p));
  if (!left.length) { r.fallen = a.hist.year; say(`Держава «${realmLabel(a, r.id)}» сгинула вместе со своей столицей.`); return; }
  const [first, second] = left;
  r.capital = first.id; first.capital = true; r.seatSince = a.hist.year;
  shiftAlign(r, 'order', ALIGN_DRIFT.realm.seatLost);   // a burnt seat shakes the law
  say(`Столица державы «${realmLabel(a, r.id)}» перенесена в ${townLabel(first, 1)} ${first.name}.`);
  if (second && glory(second) >= SCHISM.rival * glory(first)) breakAway(a, r, second, rnd, say, `Власть не удержали:`);
}
