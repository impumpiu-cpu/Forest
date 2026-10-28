// The land as the caravan sees it: how much food a cell gives to those who hunt and gather there, and
// what may find their camp at night. Both are read from the world's fields and things — the beasts
// (atlas/fauna.js), the soils and biomes, the lairs and tribes, armies' foragers, the rot, the roads.
import {realmBand} from '../atlas/towns.js';
import {cellRegion as regionOf} from '../seam/cell.js';

// a cell's region (seam/cell.js) is asked several times a day; the beasts in it change once a season, so it
// is kept per cell until the world's season moves on (beside the world, never saved)
const CACHE = new WeakMap();
export function cellRegion(a, i) {
  const step = a.hist ? a.hist.step : -1;
  let c = CACHE.get(a);
  if (!c || c.step !== step) CACHE.set(a, c = {step, map: new Map()});
  let r = c.map.get(i);
  if (!r) c.map.set(i, r = regionOf(a, i));
  return r;
}
import {faunaLevel} from '../world/region.js';
import {lairAt} from '../atlas/lairs.js';
import {faunaCell} from '../atlas/fauna.js';
import {roadAccess} from '../atlas/roads.js';
import {BIOMES} from '../data/biomes.js';
import {LAIRS, LEADER} from '../data/lairs.js';
import {LAIR_BANDS, REALM_BANDS, WAR_ONLY_BANDS, HOST_BANDS} from '../data/seam.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {RELATIONS} from '../data/relations.js';
import {atWar} from '../atlas/diplomacy.js';
import {cultPool, towerAt, necroLabel} from '../atlas/necro.js';
import {NECRO} from '../data/lairs.js';
import {SPECIES, onSpeciesChange} from '../data/species.js';
import {GAME, CAMPAIGN} from '../data/campaign.js';
import {FODDER} from '../data/transport.js';
import {clamp} from '../core/util.js';
import {NIGHT, WILD_FOES} from '../data/campaign.js';
import {MIGRATIONS} from '../data/migrations.js';

// how many people a day of hunting and gathering in a cell feeds, per person, before the season: 0 … ~1.5.
// Game by the beasts that live there (as the local map would have them), plants by the soil and biomes
export function richness(a, i) {
  if (!a.f.land?.[i] || a.f.ocean[i]) return 0;
  const reg = cellRegion(a, i), w = {region: reg};
  let game = 0;
  for (const [id, k] of Object.entries(GAME)) if (SPECIES.has(id)) game += faunaLevel(w, id) * k;
  const plants = Object.entries(reg.biomes).reduce((s, [b, v]) => s + v * (BIOMES.has(b) ? BIOMES.get(b).fert : 0.5), 0) * (0.5 + 0.5 * (a.f.fert?.[i] ?? 0.6));
  const water = a.f.flow && a.f.lake ? (a.f.lake[i] >= 0 || reg.river > 0 ? 0.25 : 0) : 0;   // fish
  return clamp(0.45 * Math.min(2, game) + 0.55 * plants + water, 0, 1.6);
}

// whether beasts find grass in a cell: plants enough (soil and biomes) and no hard frost
export function pasture(a, i, seasonId) {
  if (!a.f.land?.[i] || a.f.ocean[i]) return false;
  const reg = cellRegion(a, i);
  const plants = Object.entries(reg.biomes).reduce((s, [b, v]) => s + v * (BIOMES.has(b) ? BIOMES.get(b).fert : 0.5), 0);
  const frost = seasonId === 'winter' && a.f.temp[i] - a.f.trange[i] / 2 < -5;
  return plants >= FODDER.graze && !frost;
}

// the season's × on food: the calendar's, less in frost (the winter half of the year below zero)
export function seasonFood(a, i, seasonId) {
  const k = CAMPAIGN.seasonFood[seasonId] ?? 1;
  const cold = a.f.temp[i] - (seasonId === 'winter' ? a.f.trange[i] / 2 : 0);
  return cold < -5 ? k * CAMPAIGN.seasonFood.frost : k;
}

// who a lair sends on the local map (campaign/camp.js): its band (data/seam.js LAIR_BANDS) or its beast
// ── the wild as foes (data/campaign.js WILD_FOES): who lives in a cell by the world's fields — every beast of prey that
// hunts people, every lair's monster, every tribe's folk, by its density there. The lair whose land it is counts its own
// kind itself (above)
const FOLK_BAND = Object.fromEntries(LAIRS.filter(L => L.tribe && LAIR_BANDS[L.id]).map(L => [L.species, LAIR_BANDS[L.id]]));
const MIG = new Map();
onSpeciesChange(() => MIG.clear());   // (a species made or removed in the constructor: data/species.js)
// the beasts' arrival on the local map that brings a species as a hunter of people (data/migrations.js), or null
const hunterOf = id => { if (!MIG.has(id)) MIG.set(id, MIGRATIONS.all().find(m => m.species === id && m.faction === 'predators')?.id || null); return MIG.get(id); };
export function wildFoes(a, i, lair = lairAt(a, i)) {
  const F = a.fauna, W = WILD_FOES, out = []; if (!F || a.f.ocean[i]) return out;
  const j = faunaCell(a, i), own = lair ? LAIRS.get(lair.kind).species : null;
  for (const s of F.list) {
    if (s.role === 'spirit' || s.id === own) continue;
    const v = s.N[j]; if (!(v >= W.at)) continue;
    let kind, who;
    if (s.role === 'dead') { kind = 'undead'; who = {band: 'undead'}; }   // the risen of a necromancer (atlas/necro.js)
    else if (s.role === 'folk') { if (!FOLK_BAND[s.id]) continue; kind = 'tribe'; who = {band: FOLK_BAND[s.id]}; }
    else { const m = hunterOf(s.id); if (!m) continue; kind = s.lair ? 'lair' : 'beasts'; who = {beast: m}; }
    const P = W[kind === 'undead' ? 'dead' : kind], x = Math.min(P.cap, v);
    out.push({kind, p: P.p * x, strength: P.s[0] + P.s[1] * x, label: s.sp.plural, species: s.id, ...who});
  }
  return out;
}
// the peoples that raid (REALM_BANDS), by their fields, where they are the caravan's foe (WILD_FOES.raiders)
const relOf = people => SPECIES.get(WORLD_PEOPLES.get(people).race).rel;
export function peopleFoes(a, i, K) {
  const out = [], W = WILD_FOES.raiders; if (!K || !a.peoples || !a.fauna || a.f.ocean[i]) return out;
  const j = faunaCell(a, i);
  for (const pe of a.peoples) {
    const band = REALM_BANDS[pe.id] || HOST_BANDS[pe.id]?.base; if (!band || pe.id === K.people) continue;
    const v = pe.u[j] * pe.K[j]; if (!(v >= WILD_FOES.at)) continue;
    const dislike = (RELATIONS[relOf(K.people)]?.[relOf(pe.id)] ?? 0) < 0;
    const war = !!K.realm && (a.realms || []).some(r => r.people === pe.id && atWar(a, K.realm, r.id));
    if (!war && (!dislike || WAR_ONLY_BANDS.includes(pe.id))) continue;
    const x = Math.min(W.cap, v);
    const host = (a.realms || []).find(r => r.people === pe.id && (war ? atWar(a, K.realm, r.id) : true));   // (the humans' host by what that realm has built)
    out.push({kind: 'raiders', p: W.p * x, strength: W.s[0] + W.s[1] * x, label: `${WORLD_PEOPLES.get(pe.id).label}-налётчики`, band: host ? realmBand(a, host.id, pe.id) || band : band, people: pe.id});
  }
  return out;
}
// a necromancer's cultists about (data/lairs.js NECRO.cult): within his seat, and roaming out to `roam` × it
export function cultFoes(a, i) {
  const x = i % a.w, y = (i / a.w) | 0, C = NECRO.cult, t = towerAt(a, x, y, C.roam); if (!t) return [];
  const inside = towerAt(a, x, y) === t;
  return [{kind: 'cultists', p: C.p * t.strength * (inside ? 1 : C.out), strength: C.s[0] + C.s[1] * t.strength, label: `${necroLabel(t.race)} «${t.name}»`, band: 'cultists', pool: cultPool(a, i), tower: t.id}];
}
// a foe that comes may bring a second kind of the same cell along (WILD_FOES.mix): beasts with beasts, a band with a band
// or with beasts (its war beasts then) —
// the pick weighed by how likely each comes. → the foe, with `with: {beast | band, label, share}` when it brings one
const sideOf = d => (d.beast ? 'beast' : d.band && d.kind !== 'army' && d.band !== 'cultists' ? 'band' : null);   // (a cult is its own mix)
export function withCompany(d, ds, r) {
  const side = sideOf(d), M = WILD_FOES.mix; if (!side || d.boss) return d;
  // (beasts join a band as its war beasts: one side on the local map; a band does not join beasts)
  const others = ds.filter(o => o !== d && (sideOf(o) === side || (side === 'band' && sideOf(o) === 'beast')) && (o.beast || o.band) !== (d.beast || d.band));
  if (!others.length) return d;
  const tot = others.reduce((v, o) => v + o.p, 0);
  if (!(r() < M.chance * tot / (tot + d.p))) return d;
  let t = r() * tot, o = others[others.length - 1];
  for (const x of others) if ((t -= x.p) <= 0) { o = x; break; }
  const lab = o.label && !/«/.test(o.label) ? o.label : (o.species && SPECIES.has(o.species) ? SPECIES.get(o.species).plural : o.label);
  return {...d, with: {...(o.beast ? {beast: o.beast} : {band: o.band}), label: lab, share: M.share[0] + r() * (M.share[1] - M.share[0])}, label: `${d.label} и ${lab}`};
}

export function lairFoe(kind) {
  const L = LAIRS.get(kind);
  if (LAIR_BANDS[kind]) return {band: LAIR_BANDS[kind]};
  return L?.species && !L.dragon ? {beast: L.species} : {};
}

// what may come at night, each with how likely it makes a fight: [{kind, p, strength, label, beast | band, species?}]
// (`K` — the caravan: who is its foe among the peoples; without it the peoples are left out)
export const nightRisk = (a, i, K = null) => dangers(a, i, K).reduce((s, d) => s + d.p, 0);
export function dangers(a, i, K = null) {
  const out = [], N = NIGHT;
  const lair = lairAt(a, i);
  if (lair) {
    const L = LAIRS.get(lair.kind), kind = L.domain ? 'cultists' : L.undead ? 'undead' : L.tribe ? 'tribe' : 'lair';
    // a lair with a leader (atlas/leaders.js) keeps its land better and comes harder, the leader at the head (LEADER.camp)
    const ld = lair.leader, M = ld ? LEADER.camp : null;
    out.push({kind, p: (N.lair.p[0] + N.lair.p[1] * Math.min(N.lair.pCap, lair.strength)) * (M ? M.p : 1), strength: (N.lair.s[0] + N.lair.s[1] * Math.min(N.lair.sCap, lair.strength)) * (M ? M.strength : 1), label: `${L.label} «${lair.name}»`, ...lairFoe(lair.kind),
      lair: lair.id, species: L.species,   // (its captives, if it keeps any: a fight won frees them — campaign/fight.js)
      ...(ld ? {boss: {name: `${ld.title[0]} ${ld.name}`, g: 'm', species: ld.species, add: ld.add}, leaderLair: lair.id} : {})});
  }
  out.push(...wildFoes(a, i, lair), ...peopleFoes(a, i, K), ...cultFoes(a, i).filter(c => c.tower !== lair?.id));   // (in a tower's own land its cult is the lair's, above)
  // a necromancer's band is his cult: who it is, by the cell (atlas/necro.js cultPool)
  for (const d of out) if (d.band === 'cultists' && !d.pool) d.pool = cultPool(a, i);
  if (a.f.scourge && a.f.scourge[i] > N.army.at) out.push({kind: 'army', p: N.army.p * a.f.scourge[i], strength: N.army.s});
  if (a.rot && a.fauna && a.rot[faunaCell(a, i)] > N.undead.at) out.push({kind: 'undead', p: N.undead.p * a.rot[faunaCell(a, i)], strength: N.undead.s + a.rot[faunaCell(a, i)]});
  const road = roadAccess(a, i);
  if (road > N.bandits.at) out.push({kind: 'bandits', p: N.bandits.p * road, strength: N.bandits.s});
  return out;
}
