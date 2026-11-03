// The seam: a cell of the world map becomes the site of a local map. The only module that knows
// both sides: it reads the world (atlas/) and writes what the local map already takes (world/site.js
// makeSite) — a region in the terms of data/regions.js, a climate in numbers, gates where the world's
// roads and rivers cross the cell's edges, and the neighbours whose distances drive raids, caravans
// and settlers (outside/scripted.js). The local map never imports the world (docs/WORLD.md).
//
//   cellPlan(a, i) → {seed, ref, region, extra} — plain data, independent of the local map's size,
//   kept in the game's settings as `cfg.cell` and turned into a site by makeSite.
import {realmBand} from '../atlas/towns.js';
import {cellBiomes, biomeAt} from '../atlas/biomes.js';
import {cellGeology} from '../atlas/geology.js';
import {faunaAt, faunaCell} from '../atlas/fauna.js';
import {lairAt} from '../atlas/lairs.js';
import {roadAccess, roadLevel} from '../atlas/roads.js';
import {riverKind} from '../atlas/hydrology.js';
import {latitude} from '../atlas/latitude.js';
import {scaleOf} from '../atlas/tectonics.js';
import {realmLabel} from '../atlas/realms.js';
import {atWar, trades, realmAlign} from '../atlas/diplomacy.js';
import {townLabel} from '../atlas/towns.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {clamp} from '../core/util.js';
import {LAIRS} from '../data/lairs.js';
import {cultPool} from '../atlas/necro.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {REGIONS, LEVELS} from '../data/regions.js';
import {SPECIES} from '../data/species.js';
import {BIOMES} from '../data/biomes.js';
import {faunaLevel} from '../world/region.js';
import {SEAM, LAIR_BANDS, WAR_ONLY_BANDS, OUTLAWS, FOLK_RAIDS, FLORA, FLORA_STEPS} from '../data/seam.js';
// the raid band of a tribe's folk (by the lair kinds of its species)
const FOLK_BAND = Object.fromEntries(LAIRS.filter(L => L.tribe && LAIR_BANDS[L.id]).map(L => [L.species, LAIR_BANDS[L.id]]));

const ORE_KEYS = Object.keys(REGIONS.all()[0].ores);
const cap1 = s => s[0].toUpperCase() + s.slice(1);
const r2 = v => Math.round(v * 100) / 100;
const xy = (a, i) => [i % a.w, (i / a.w) | 0];
const RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// where a cell can be settled: land, not a lake
export const settleable = (a, i) => !!a.f.land && !a.f.ocean[i] && !(a.f.lake && a.f.lake[i] >= 0);

// the side of the cell's edge that faces a neighbour (diagonals go to the wider axis, east–west on a tie)
function sideTo(a, i, j) {
  const [x0, y0] = xy(a, i), [x, y] = xy(a, j), dx = x - x0, dy = y - y0;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
}
const OPPOSITE = {north: 'south', south: 'north', east: 'west', west: 'east'};
const neighboursOf = (a, i) => { const [x, y] = xy(a, i); return RING.map(([dx, dy]) => [x + dx, y + dy]).filter(([u, v]) => u >= 0 && v >= 0 && u < a.w && v < a.h).map(([u, v]) => v * a.w + u); };

// a level of data/regions.js LEVELS from a sum against steps
const stepLevel = (v, steps) => LEVELS[steps.filter(s => v >= s).length];

// ── the region: what the land holds
export function cellRegion(a, i) {
  const geo = cellGeology(a, i), biomes = {};
  for (const [id, v] of Object.entries(cellBiomes(a, i))) if (BIOMES.has(id)) biomes[id] = v;
  const sum = Object.values(biomes).reduce((s, v) => s + v, 0) || 1;
  for (const id of Object.keys(biomes)) biomes[id] = r2(biomes[id] / sum);
  const ores = {}; for (const k of ORE_KEYS) ores[k] = geo.ores[k] ?? 0;
  const flora = {};
  for (const [id, wts] of Object.entries(FLORA)) flora[id] = stepLevel(Object.entries(biomes).reduce((s, [b, v]) => s + v * (wts[b] || 0), 0), FLORA_STEPS);
  // beasts: as many as the world says live in this cell against what its biomes hold; a lair close by makes its own more common
  const faunaShift = {}, lair = lairAt(a, i), L = lair ? LAIRS.get(lair.kind) : null;
  for (const sp of SPECIES.filter(s => s.habitat)) {
    const known = a.fauna && sp.id in a.fauna.idx;
    let v = known ? clamp(faunaAt(a, i, sp.id), 0, 1.6) : 1;
    if (L?.species === sp.id) v = Math.max(v, 0.5) * SEAM.lairBeast;
    faunaShift[sp.id] = r2(v);
  }
  const acc = Math.max(roadAccess(a, i), ...neighboursOf(a, i).map(j => roadAccess(a, j)));
  const river = riverKind(a, i), b = biomeAt(a, i);
  const reg = {
    id: 'world', label: cap1(b?.label || 'земля') + (river === 'great' ? ' у большой реки' : river === 'river' ? ' у реки' : ''),
    note: `клетка мира ${xy(a, i).join(', ')}`,
    // the rock under it: the stone the colony quarries here (data/kinds.js STONES, settlement/kinds.js)
    rock: geo.rock?.id || null,
    ores, placer: geo.placer ?? 0, goldVein: !!geo.flags.goldVein, magma: !!geo.flags.magma,
    road: r2(SEAM.road.base + SEAM.road.perAccess * acc), river: river === 'great' ? 1 : river === 'river' ? 0.6 : 0,
    biomes, flora, faunaShift, extra: {},
  };
  // as on the polygon (world/region.js rollRegion): everyone needs a way to live — a few deer where there is no game
  if (faunaLevel({region: reg}, 'deer') <= 0 && faunaLevel({region: reg}, 'goat') <= 0) reg.extra.deer = 0.5;
  return reg;
}

// ── the climate in the local map's numbers (data/presets.js CLIMATES)
export function cellClimate(a, i) {
  const f = a.f, C = SEAM.climate, T = f.temp[i], mm = f.rain[i], lat = Math.abs(latitude(a, xy(a, i)[1]));
  const warm = clamp((T + 8) / 15, 0.2, 1.2);
  const ign = Math.round(clamp((7 - T) * C.ignPerDeg + (mm < 400 ? C.ignDry : mm > 1200 ? C.ignWet : 0), -10, 30));
  return {
    id: 'world', label: `${T >= 0 ? '+' : '−'}${Math.abs(Math.round(T))}° в среднем`, note: `размах года ${Math.round(f.trange[i])}°, осадков ${Math.round(mm)} мм в год`,
    meanT: r2(T), trange: r2(f.trange[i]), rain: r2(clamp(C.rainBase + mm * C.rainPerMm, C.rainBase, C.rainMax)),
    regrow: r2(clamp(0.4 + 0.6 * Math.min(1.2, mm / C.regrowMm) * warm, 0.3, 1.3)), ign, daylight: r2(Math.min(C.daylightMax, lat * C.daylightPerDeg)),
  };
}

// ── gates: the world's roads and rivers where they cross the cell's edges
export function cellGates(a, i, seed) {
  const f = a.f, rnd = mulberry(seedNumber(seed + ':gates')), gates = [];
  // roads: the sides where the strongest roads lead out, at most two
  const bySide = {};
  for (const j of neighboursOf(a, i)) if (f.road && roadLevel(f.road[j]) >= 0) { const s = sideTo(a, i, j); bySide[s] = Math.max(bySide[s] || 0, f.road[j]); }
  for (const s of Object.entries(bySide).sort((p, q) => q[1] - p[1]).slice(0, 2).map(e => e[0])) gates.push({kind: 'road', side: s, at: r2(0.25 + rnd() * 0.5)});
  // a river comes in from the side of its largest tributary and leaves towards the cell it drains into
  const kind = riverKind(a, i);
  if ((kind === 'river' || kind === 'great') && f.down && f.down[i] !== i && f.down[i] >= 0) {
    const mouth = sideTo(a, i, f.down[i]);
    let up = -1, best = 0;
    for (const j of neighboursOf(a, i)) if (f.down[j] === i && f.flow[j] > best) { best = f.flow[j]; up = j; }
    let source = up >= 0 ? sideTo(a, i, up) : OPPOSITE[mouth];
    if (source === mouth) source = OPPOSITE[mouth];
    gates.push({kind: 'river', role: 'source', side: source, at: r2(0.3 + rnd() * 0.4), wide: kind === 'great'},
      {kind: 'river', role: 'mouth', side: mouth, at: r2(0.3 + rnd() * 0.4), wide: kind === 'great'});
  }
  return gates;
}

// ── neighbours: kin, trade and the hostile, with days of travel (outside/scripted.js)
const daysFor = d => Math.round(Math.min(SEAM.days.max, SEAM.days.from + d * SEAM.days.perCell) * 10) / 10;
const peopleRace = id => WORLD_PEOPLES.get(id)?.race;
const realmName = (a, id) => (id && (a.realms || []).some(r => r.id === id) ? realmLabel(a, id) : 'вольные земли');

export function cellNeighbours(a, i, race = 'human') {
  const [x0, y0] = xy(a, i), k = scaleOf(a), reach = SEAM.reach * k;
  const dist = (x, y) => Math.hypot(x - x0, y - y0) / k;   // in cells of a 192-high world, like the parties' speeds
  const towns = (a.towns || []).filter(t => t.alive).map(t => ({t, d: dist(t.x, t.y)})).filter(o => o.d * k <= reach).sort((p, q) => p.d - q.d);
  // the colony is a hamlet of the nearest realm of its own race; failing that, of the nearest realm at all
  const kin = towns.find(o => peopleRace(o.t.people) === race) || towns[0] || null;
  const own = kin?.t.realm || null;
  const tLabel = t => `${cap1(townLabel(t, 0))} ${t.name}`;
  const out = {};
  if (kin) out.kin = {label: tLabel(kin.t), town: kin.t.id, note: `${realmName(a, kin.t.realm)}: отсюда приходят переселенцы`, dist: daysFor(kin.d), people: kin.t.people, realm: own,
    // the realm's world view: the settlers of its race stand near it (agents/agent.js createAgent)
    race: peopleRace(kin.t.people), align: own && realmAlign(a, own) ? {...realmAlign(a, own)} : null};
  const market = towns.find(o => !own || !o.t.realm || trades(a, own, o.t.realm));
  if (market) out.empire = {label: `Караваны из ${townLabel(market.t, 2)} ${market.t.name}`, town: market.t.id, note: `${realmName(a, market.t.realm)}: отсюда приходят караваны`, dist: daysFor(market.d), people: market.t.people};

  // who raids: tribes and the dead from their lairs, unfriendly realms, outlaws near towns of men, the rot of the land itself
  const sources = [];
  for (const l of a.lairs || []) {
    const band = LAIR_BANDS[l.kind]; if (!l.alive || !band) continue;
    const d = dist(l.x, l.y); if (d * k > reach) continue;
    sources.push({band, d, wt: Math.max(0.2, l.strength), label: `${LAIRS.get(l.kind).label} «${l.name}»`});
  }
  for (const {t, d} of towns) {
    const band = realmBand(a, t.realm, t.people);
    if (band && (own && t.realm ? (t.realm !== own && (atWar(a, own, t.realm) || !trades(a, own, t.realm) && !WAR_ONLY_BANDS.includes(t.people))) : t.people === 'orcs'))
      sources.push({band, d, wt: Math.sqrt(t.pop) / 10, label: `${tLabel(t)} (${realmName(a, t.realm)})`});
  }
  // the tribes' folk about (atlas/lairs.js lairFolk), a lair of theirs near or not: where they are thickest for the way
  if (a.fauna) {
    const F = a.fauna, R0 = Math.ceil(reach / F.c);
    for (const s of F.list) {
      const band = s.role === 'folk' ? FOLK_BAND[s.id] : null; if (!band) continue;
      const cx = (x0 / F.c) | 0, cy = (y0 / F.c) | 0;
      let best = null;
      for (let y = Math.max(0, cy - R0); y <= Math.min(F.H - 1, cy + R0); y++) for (let x = Math.max(0, cx - R0); x <= Math.min(F.W - 1, cx + R0); x++) {
        const v = s.N[y * F.W + x]; if (!(v >= FOLK_RAIDS.at)) continue;
        const d = dist((x + 1 / 2) * F.c, (y + 1 / 2) * F.c); if (d * k > reach) continue;
        const score = v / (1 + d); if (!best || score > best.score) best = {score, v, d};
      }
      if (best) sources.push({band, d: best.d, wt: FOLK_RAIDS.weight * best.v, label: `${s.sp.plural} в округе`});
    }
  }
  // the risen of a necromancer about (atlas/necro.js): where they are thickest for the way
  if (a.fauna?.idx?.dead != null) {
    const F = a.fauna, s = F.list[F.idx.dead], R0 = Math.ceil(reach / F.c), cx = (x0 / F.c) | 0, cy = (y0 / F.c) | 0;
    let best = null;
    for (let y = Math.max(0, cy - R0); y <= Math.min(F.H - 1, cy + R0); y++) for (let x = Math.max(0, cx - R0); x <= Math.min(F.W - 1, cx + R0); x++) {
      const v = s.N[y * F.W + x]; if (!(v >= FOLK_RAIDS.at)) continue;
      const d = dist((x + 1 / 2) * F.c, (y + 1 / 2) * F.c); if (d * k > reach) continue;
      const score = v / (1 + d); if (!best || score > best.score) best = {score, v, d};
    }
    if (best) sources.push({band: 'undead', d: best.d, wt: FOLK_RAIDS.weight * best.v, label: 'мертвецы некроманта в округе'});
  }
  const men = towns.find(o => o.t.people === 'humans');
  if (men) sources.push({band: OUTLAWS.band, d: men.d, wt: OUTLAWS.weight, label: 'лихие люди на дорогах'});
  if (a.rot && a.rot[faunaCell(a, i)] > SEAM.rotUndead) sources.push({band: 'undead', d: SEAM.rotCells, wt: a.rot[faunaCell(a, i)], label: 'гниль в здешней земле'});
  const near = sources.map(s => ({...s, days: daysFor(s.d)})).filter(s => s.days <= SEAM.raidDays).sort((p, q) => p.days - q.days);
  if (near.length) {
    const bands = {};
    for (const s of near) bands[s.band] = (bands[s.band] || 0) + s.wt / s.days;
    const top = Math.max(...Object.values(bands));
    for (const b of Object.keys(bands)) bands[b] = r2(Math.max(0.05, bands[b] / top));
    out.hostile = {label: near.length === 1 ? cap1(near[0].label) : 'Враждебные соседи', note: near.slice(0, 4).map(s => `${s.label} — ${s.days} дн.`).join('; '),
      dist: near[0].days, chance: SEAM.raidChance, bands, ...(bands.cultists ? {cultPool: cultPool(a, i)} : {})};   // (who a necromancer's cult is here: atlas/necro.js)
  }
  return out;
}

// ── the plan of a settlement on a cell: everything the local map needs, independent of its size
export function cellPlan(a, i, {name = '', id = null, race = 'human'} = {}) {
  const [x, y] = xy(a, i), seed = `${a.cfg.seed}@${x},${y}`;
  const soil = a.f.fert ? a.f.fert[i] : 0.6, F = SEAM.fert;
  return {
    seed,
    ref: {id, name: name || `Мир ${a.cfg.seed}`, seed: a.cfg.seed, x, y, year: a.hist?.year ?? 0},
    region: cellRegion(a, i),
    extra: {climate: cellClimate(a, i), gates: cellGates(a, i, seed), fert: r2(clamp(F.base + F.per * soil, F.min, F.max)), neighbours: cellNeighbours(a, i, race)},
  };
}
