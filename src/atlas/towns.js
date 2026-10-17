// How a town of the world map lives by what it has built (data/townBuildings.js), and how it chooses
// what to build next.
//
// Evaluation — the sum of the effects of everything built (townFx):
//   room       = 120 + 100 × housing: the town does not grow past it
//   feeds      = what the land around feeds × (1 + food), and a trading town a little more (+0.3 × trade)
//   growth     = 14% a year × (1 + 0.6 × prestige)
//   might      = √people × (1 + defence + 0.3 × prod): against monsters and raids
//   raid loss  = the usual loss × (1 − ½ faith − ½ health), never below 40% of it
//   traffic    = the town's traffic down the roads × (1 + trade)
//   reach      = how dense the people's land is around it: + 0.2 × prestige
// Choosing — like the colonists' council: every building the town may build here and now gets a
// score Σ need × taste × effect, where the needs come from the town's state (a full town needs room,
// a hungry one food, one beset by lairs or raided lately defence, one on a road trade; faith, lore and
// fame grow with size) and the taste is its people's (data/peoples.js). The best one is built.
import {TOWN_BUILDINGS, EFFECTS} from '../data/townBuildings.js';
import {TIERS, CAPITAL, crowned} from '../data/peoples.js';
import {ORE_GENESIS} from '../data/geology.js';
import {RIVERS} from '../data/hydrology.js';
import {ROADS} from '../data/roads.js';
import {ROCK_BY_CODE} from '../data/geology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {DIRS8} from './heap.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lv = id => ORE_GENESIS.get(id).levels;
const KEYS = Object.keys(EFFECTS);

// the town's size word in a case: 0 nominative, 1 accusative, 2 genitive, 3 prepositional, 4 instrumental;
// the crowned seat of a people goes by its own word
export const townLabel = (t, cs = 0) => (crowned(t) ? CAPITAL.label[t.people][cs] : TIERS[t.tier].label[t.people][cs]);
export const townGender = t => (crowned(t) ? CAPITAL.gender[t.people] : TIERS[t.tier].gender[t.people]);

export function townFx(t) {
  const out = Object.fromEntries(KEYS.map(k => [k, 0]));
  for (const id of t.built) { const b = TOWN_BUILDINGS.get(id); for (const k of KEYS) out[k] += b.fx[k] || 0; }
  return out;
}
export const room = fx => 120 + 100 * fx.housing;
export const might = (t, fx) => Math.sqrt(t.pop) * (1 + fx.defence + 0.3 * fx.prod);
export const raidShare = fx => Math.max(0.4, 1 - 0.5 * fx.faith - 0.5 * fx.health);

// ── the place
const around = (a, i, r, test) => {
  const x0 = i % a.w, y0 = (i / a.w) | 0;
  for (let y = Math.max(0, y0 - r); y <= Math.min(a.h - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(a.w - 1, x0 + r); x++) if (test(y * a.w + x)) return true;
  return false;
};
const nextTo = (a, i, test) => {
  const x = i % a.w, y = (i / a.w) | 0;
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && test(ny * a.w + nx)) return true;
  }
  return false;
};

export function placeHas(a, i, need) {
  const f = a.f, k2 = scaleOf(a) ** 2, rock = j => ROCK_BY_CODE[f.rock[j]]?.id, bio = j => biomeAt(a, j)?.id;
  switch (need) {
    case 'river': return f.flow[i] >= RIVERS.stream * k2 || nextTo(a, i, j => f.flow[j] >= RIVERS.river * k2 && f.lake[j] < 0);
    case 'coast': return nextTo(a, i, j => f.ocean[j]);
    case 'lake': return around(a, i, 2, j => f.lake[j] >= 0);
    case 'water': return placeHas(a, i, 'river') || placeHas(a, i, 'coast') || placeHas(a, i, 'lake');
    case 'ore': return ['iron', 'bronze', 'silver'].some(id => f[`ore_${id}`][i] >= lv(id)[1]);
    case 'gems': return f.ore_gems[i] >= lv('gems')[1];
    case 'coal': return f.ore_coal[i] >= lv('coal')[1];
    case 'magma': return around(a, i, 3, j => f.ore_magma[j] >= lv('magma')[1]);
    case 'precious': return f.ore_gold[i] >= lv('gold')[1] || f.ore_silver[i] >= lv('silver')[1] || f.ore_placer[i] >= lv('placer')[1];
    case 'placer': return around(a, i, 1, j => f.ore_placer[j] >= lv('placer')[1]);
    case 'salt': return around(a, i, 4, j => f.lake[j] >= 0 && a.lakes[f.lake[j]].salt) || (placeHas(a, i, 'coast') && f.temp[i] >= 14);
    case 'clay': return f.alluvium[i] >= 0.3 || rock(i) === 'shale' || rock(i) === 'limestone';
    case 'stone': return around(a, i, 2, j => !f.ocean[j] && (f.flat[j] < 0.75 || (f.elev[j] - a.sea) / (1 - a.sea) > 0.2));
    case 'fertile': return f.fert[i] >= 0.5;
    case 'forest': return around(a, i, 2, j => f.trees[j] >= 0.5);
    case 'pasture': return around(a, i, 2, j => ['meadow', 'steppe', 'savanna'].includes(bio(j)));
    case 'steep': return around(a, i, 1, j => f.flat[j] < 0.5);
    case 'flat': return f.flat[i] > 0.85;
    case 'caves': return around(a, i, 2, j => rock(j) === 'limestone' || rock(j) === 'basalt');
    case 'road': return around(a, i, 1, j => f.road[j] >= ROADS.levels[1].wear);
    case 'warm': return f.temp[i] >= 12;
    case 'dry': return around(a, i, 3, j => ['steppe', 'desert', 'savanna'].includes(bio(j)));
  }
  throw new Error(`town building: unknown place need «${need}»`);
}

// can this town build this now: its people, its size, how many it has, the place, what it already has
export function canBuild(a, t, b) {
  if (b.peoples && !b.peoples.includes(t.people)) return false;
  if (b.tier > t.tier) return false;
  if (b.pop && t.pop < b.pop) return false;
  if (b.capital && !t.capital) return false;
  if (b.unique && a.towns.some(o => o !== t && o.alive && o.realm === t.realm && o.built.includes(b.id))) return false;
  if (t.built.filter(id => id === b.id).length >= b.max) return false;
  if (b.requires && !b.requires.every(id => t.built.includes(id))) return false;
  if (b.requiresAny && !b.requiresAny.some(id => t.built.includes(id))) return false;
  const pk = t.place ||= {};
  const has = need => (need === 'road' ? placeHas(a, t.i, need) : (pk[need] ??= placeHas(a, t.i, need)));   // the land does not change, roads do
  if (b.needs && !b.needs.every(has)) return false;
  if (b.needsAny && !b.needsAny.some(has)) return false;
  return true;
}

// what the town needs now, 0 … ~1.5 for each effect
export function townNeeds(a, t, fx, ctx) {
  return {
    housing: 1.5 * clamp01((t.pop / room(fx) - 0.55) / 0.4),
    food: 1.3 * clamp01((t.pop / Math.max(1, ctx.feeds) - 0.55) / 0.4),
    defence: Math.min(1.5, ctx.threat + (t.raided != null && a.hist.year - t.raided < 6 ? 0.8 : 0)) + 0.1,
    trade: 0.15 + 0.6 * ctx.road + (t.tier >= 2 ? 0.3 : 0),
    prod: 0.4 + 0.1 * t.tier,
    faith: 0.25 + 0.15 * t.tier,
    lore: t.tier >= 2 ? 0.25 + 0.1 * t.tier : 0.03,
    prestige: 0.15 + 0.15 * t.tier,
    health: 0.25 + 0.1 * t.tier + (t.raided != null && a.hist.year - t.raided < 6 ? 0.3 : 0),
  };
}

// the building the town wants most, or null
export function chooseBuilding(a, t, P, fx, ctx, rnd) {
  const need = townNeeds(a, t, fx, ctx);
  let best = null, bv = 0.02;
  for (const b of TOWN_BUILDINGS.all()) {
    if (!canBuild(a, t, b)) continue;
    let v = 0;
    for (const k of KEYS) v += (b.fx[k] || 0) * need[k] * (P.taste[k] ?? 1);
    v *= 0.85 + 0.3 * rnd();
    if (v > bv) { bv = v; best = b; }
  }
  return best;
}
