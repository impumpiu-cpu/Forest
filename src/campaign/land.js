// The land as the caravan sees it: how much food a cell gives to those who hunt and gather there, and
// what may find their camp at night. Both are read from the world's fields and things — the beasts
// (atlas/fauna.js), the soils and biomes, the lairs and tribes, armies' foragers, the rot, the roads.
import {cellRegion} from '../seam/cell.js';
import {faunaLevel} from '../world/region.js';
import {lairAt} from '../atlas/lairs.js';
import {faunaCell} from '../atlas/fauna.js';
import {roadAccess} from '../atlas/roads.js';
import {BIOMES} from '../data/biomes.js';
import {LAIRS} from '../data/lairs.js';
import {SPECIES} from '../data/species.js';
import {GAME, CAMPAIGN} from '../data/campaign.js';
import {clamp} from '../core/util.js';

// how many people a day of hunting and gathering in a cell feeds, per person, before the season: 0 … ~1.5.
// Game by the beasts that live there (as the local map would have them), plants by the soil and biomes
export function richness(a, i) {
  if (!a.f.land || a.f.ocean[i]) return 0;
  const reg = cellRegion(a, i), w = {region: reg};
  let game = 0;
  for (const [id, k] of Object.entries(GAME)) if (SPECIES.has(id)) game += faunaLevel(w, id) * k;
  const plants = Object.entries(reg.biomes).reduce((s, [b, v]) => s + v * (BIOMES.has(b) ? BIOMES.get(b).fert : 0.5), 0) * (0.5 + 0.5 * (a.f.fert?.[i] ?? 0.6));
  const water = a.f.flow && a.f.lake ? (a.f.lake[i] >= 0 || reg.river > 0 ? 0.25 : 0) : 0;   // fish
  return clamp(0.45 * Math.min(2, game) + 0.55 * plants + water, 0, 1.6);
}

// the season's × on food: the calendar's, less in frost (the winter half of the year below zero)
export function seasonFood(a, i, seasonId) {
  const k = CAMPAIGN.seasonFood[seasonId] ?? 1;
  const cold = a.f.temp[i] - (seasonId === 'winter' ? a.f.trange[i] / 2 : 0);
  return cold < -5 ? k * CAMPAIGN.seasonFood.frost : k;
}

// what may come at night, each with how likely it makes a fight: [{kind, p, might, label}]
export const nightRisk = (a, i) => dangers(a, i).reduce((s, d) => s + d.p, 0);
export function dangers(a, i) {
  const out = [];
  const lair = lairAt(a, i);
  if (lair) {
    const L = LAIRS.get(lair.kind), kind = L.undead ? 'undead' : L.tribe ? 'tribe' : 'lair';
    out.push({kind, p: 0.05 + 0.05 * Math.min(1.5, lair.strength), strength: 0.6 + 0.6 * Math.min(2, lair.strength), label: `${L.label} «${lair.name}»`});
  }
  const wolves = faunaLevel({region: cellRegion(a, i)}, 'wolf');
  if (wolves > 0) out.push({kind: 'wolves', p: 0.025 * Math.min(2, wolves), strength: 0.7 + 0.3 * Math.min(2, wolves)});
  if (a.f.scourge && a.f.scourge[i] > 0.3) out.push({kind: 'army', p: 0.2 * a.f.scourge[i], strength: 1});
  if (a.rot && a.fauna && a.rot[faunaCell(a, i)] > 0.2) out.push({kind: 'undead', p: 0.06 * a.rot[faunaCell(a, i)], strength: 0.8 + a.rot[faunaCell(a, i)]});
  const road = roadAccess(a, i);
  if (road > 0.1) out.push({kind: 'bandits', p: 0.02 * road, strength: 1});
  return out;
}
