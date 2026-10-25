// The land as the caravan sees it: how much food a cell gives to those who hunt and gather there, and
// what may find their camp at night. Both are read from the world's fields and things — the beasts
// (atlas/fauna.js), the soils and biomes, the lairs and tribes, armies' foragers, the rot, the roads.
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
import {LAIR_BANDS} from '../data/seam.js';
import {SPECIES} from '../data/species.js';
import {GAME, CAMPAIGN} from '../data/campaign.js';
import {FODDER} from '../data/transport.js';
import {clamp} from '../core/util.js';
import {NIGHT} from '../data/campaign.js';

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
export function lairFoe(kind) {
  const L = LAIRS.get(kind);
  if (LAIR_BANDS[kind]) return {band: LAIR_BANDS[kind]};
  return L?.species && !L.dragon ? {beast: L.species} : {};
}

// what may come at night, each with how likely it makes a fight: [{kind, p, might, label}]
export const nightRisk = (a, i) => dangers(a, i).reduce((s, d) => s + d.p, 0);
export function dangers(a, i) {
  const out = [], N = NIGHT;
  const lair = lairAt(a, i);
  if (lair) {
    const L = LAIRS.get(lair.kind), kind = L.undead ? 'undead' : L.tribe ? 'tribe' : 'lair';
    // a lair with a leader (atlas/leaders.js) keeps its land better and comes harder, the leader at the head (LEADER.camp)
    const ld = lair.leader, M = ld ? LEADER.camp : null;
    out.push({kind, p: (N.lair.p[0] + N.lair.p[1] * Math.min(N.lair.pCap, lair.strength)) * (M ? M.p : 1), strength: (N.lair.s[0] + N.lair.s[1] * Math.min(N.lair.sCap, lair.strength)) * (M ? M.strength : 1), label: `${L.label} «${lair.name}»`, ...lairFoe(lair.kind),
      lair: lair.id,   // (its captives, if it keeps any: a fight won frees them — campaign/fight.js)
      ...(ld ? {boss: {name: `${ld.title[0]} ${ld.name}`, g: 'm', species: ld.species, add: ld.add}, leaderLair: lair.id} : {})});
  }
  const wolves = faunaLevel({region: cellRegion(a, i)}, 'wolf');
  if (wolves > 0) out.push({kind: 'wolves', p: N.wolves.p * Math.min(N.wolves.cap, wolves), strength: N.wolves.s[0] + N.wolves.s[1] * Math.min(N.wolves.cap, wolves)});
  if (a.f.scourge && a.f.scourge[i] > N.army.at) out.push({kind: 'army', p: N.army.p * a.f.scourge[i], strength: N.army.s});
  if (a.rot && a.fauna && a.rot[faunaCell(a, i)] > N.undead.at) out.push({kind: 'undead', p: N.undead.p * a.rot[faunaCell(a, i)], strength: N.undead.s + a.rot[faunaCell(a, i)]});
  const road = roadAccess(a, i);
  if (road > N.bandits.at) out.push({kind: 'bandits', p: N.bandits.p * road, strength: N.bandits.s});
  return out;
}
