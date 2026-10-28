// How a town of the world map lives by what it has built (data/townBuildings.js), and how it chooses
// what to build next.
//
// Evaluation — the sum of the effects of everything built (townFx):
//   room       = 120 + Σ house of its buildings: the town does not grow past it
//   feeds      = what the land around feeds × (1 + food), and a trading town a little more (+0.3 × trade)
//   growth     = 14% a year × (1 + 0.6 × prestige)
//   might      = √people × (1 + defence + 0.3 × prod): against monsters and raids
//   raid loss  = the usual loss × (1 − ½ faith − ½ health), never below 40% of it
//   traffic    = the town's traffic down the roads × (1 + trade)
//   reach      = how dense the people's land is around it: + 0.2 × prestige
// What a town may build: its people among the building's races (`peoples`), what the building asks for standing in
// some town of its realm (`requires`, `requiresAny`), the town's step and size, the place. Each town builds for itself.
// What metals a realm works: those of the buildings that stand in its towns (data/townBuildings.js `metals`).
// Choosing — like the colonists' council: every building the town may build here and now gets a
// score Σ need × taste × effect, where the needs come from the town's state (a full town needs room,
// a hungry one food, one beset by lairs or raided lately defence, one on a road trade; faith, lore and
// fame grow with size) and the taste is its people's (data/peoples.js). The best one is built.
import {TOWN_BUILDINGS, EFFECTS, metalBuildings, gatedMetals, METAL_WORDS, fxOf} from '../data/townBuildings.js';
import {TIERS, CAPITAL, crowned} from '../data/peoples.js';
import {ORE_GENESIS} from '../data/geology.js';
import {RIVERS} from '../data/hydrology.js';
import {ROADS} from '../data/roads.js';
import {ROCK_BY_CODE} from '../data/geology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {DIRS8} from './heap.js';
import {siteCell} from './sites.js';
import {TOWN_FX as TF, PLACE_AT as PA} from '../data/townBuildings.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lv = id => ORE_GENESIS.get(id).levels;
const KEYS = Object.keys(EFFECTS);

// the town's size word in a case: 0 nominative, 1 accusative, 2 genitive, 3 prepositional, 4 instrumental;
// the crowned seat of a people goes by its own word
export const townLabel = (t, cs = 0) => (crowned(t) ? CAPITAL.label[t.people][cs] : TIERS[t.tier].label[t.people][cs]);
export const townGender = t => (crowned(t) ? CAPITAL.gender[t.people] : TIERS[t.tier].gender[t.people]);

export function townFx(t) {
  const out = Object.fromEntries(KEYS.map(k => [k, 0]));
  for (const id of t.built) { const b = TOWN_BUILDINGS.get(id); for (const k of KEYS) out[k] += fxOf(b, k); }
  return out;
}
export const room = fx => TF.room[0] + TF.room[1] * fx.housing;

// ── the realm: what stands in its towns decides what each of them may build and what metals its smiths work.
// A town of no realm (an old save, a hamlet just founded) looks at itself.
export function realmBuilt(a, t) {
  if (t.realm == null || !a?.towns) return new Set(t.built);
  const out = new Set();
  for (const o of a.towns) if (o.alive && o.realm === t.realm) for (const id of o.built) out.add(id);
  for (const id of t.built) out.add(id);
  return out;
}
// the share of a town's room that is rough: the first shelter (TOWN_FX.room[0]) and housing of step 0 — shacks and
// tents; the more of its people live so, the more of what it owes sticks to hands (data/kingdom.js corruption `rough`)
export function roughShare(t) {
  let rough = TF.room[0], all = TF.room[0];
  for (const id of t.built) { const b = TOWN_BUILDINGS.get(id); if (!b.house) continue; all += b.house; if (b.tier === 0) rough += b.house; }
  return rough / all;
}
// housing built in place of an older one (data/townBuildings.js `upgrades`): the id of what gives way, or null
export const upgradeOf = (t, b) => (b.upgrades || []).find(id => t.built.includes(id)) || null;
// the room it adds: its own less what gives way to it
export const houseGain = (t, b) => { const old = upgradeOf(t, b); return (b.house || 0) - (old ? TOWN_BUILDINGS.get(old).house || 0 : 0); };

// whether the realm of a town works this metal (a material id): one of the buildings that open it stands in the realm
export function realmWorks(a, t, material) {
  const by = material ? metalBuildings(material) : [];
  if (!by.length) return true;
  const built = realmBuilt(a, t);
  return by.some(id => built.has(id));
}
// the words of the metals the realm of a town works, of those some building opens (for the cards)
export const realmMetalWords = (a, t) => { const built = realmBuilt(a, t); return gatedMetals().filter(m => metalBuildings(m).some(id => built.has(id))).map(m => METAL_WORDS[m] || m); };
export const might = (t, fx) => Math.sqrt(t.pop) * (1 + fx.defence + TF.mightProd * fx.prod);
export const raidShare = fx => Math.max(TF.raidFloor, 1 - TF.raidFaith * fx.faith - TF.raidHealth * fx.health);

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
    case 'lake': return around(a, i, PA.lake, j => f.lake[j] >= 0);
    case 'water': return placeHas(a, i, 'river') || placeHas(a, i, 'coast') || placeHas(a, i, 'lake');
    case 'ore': return ['iron', 'bronze', 'silver'].some(id => f[`ore_${id}`][i] >= lv(id)[1]);
    case 'gems': return f.ore_gems[i] >= lv('gems')[1];
    case 'coal': return f.ore_coal[i] >= lv('coal')[1];
    case 'magma': return around(a, i, PA.magma, j => f.ore_magma[j] >= lv('magma')[1]);
    case 'precious': return f.ore_gold[i] >= lv('gold')[1] || f.ore_silver[i] >= lv('silver')[1] || f.ore_placer[i] >= lv('placer')[1];
    case 'placer': return around(a, i, PA.placer, j => f.ore_placer[j] >= lv('placer')[1]);
    case 'salt': return around(a, i, PA.salt, j => f.lake[j] >= 0 && a.lakes[f.lake[j]].salt) || (placeHas(a, i, 'coast') && f.temp[i] >= PA.saltSea);
    case 'clay': return f.alluvium[i] >= PA.clay || rock(i) === 'shale' || rock(i) === 'limestone';
    case 'stone': return around(a, i, PA.near, j => !f.ocean[j] && (f.flat[j] < PA.stoneFlat || (f.elev[j] - a.sea) / (1 - a.sea) > PA.stoneHigh));
    case 'fertile': return f.fert[i] >= PA.fertile;
    case 'forest': return around(a, i, PA.near, j => f.trees[j] >= PA.forest);
    case 'pasture': return around(a, i, PA.near, j => ['meadow', 'steppe', 'savanna'].includes(bio(j)));
    case 'steep': return around(a, i, 1, j => f.flat[j] < PA.steep);
    case 'flat': return f.flat[i] > PA.flat;
    case 'caves': return around(a, i, PA.near, j => rock(j) === 'limestone' || rock(j) === 'basalt');
    case 'road': return around(a, i, 1, j => f.road[j] >= ROADS.levels[1].wear);
    case 'graves': return around(a, i, PA.graves, j => (f.barrows?.[j] || 0) >= PA.gravesAt);
    case 'warm': return f.temp[i] >= PA.warm;
    case 'dry': return around(a, i, PA.dry, j => ['steppe', 'desert', 'savanna'].includes(bio(j)));
  }
  throw new Error(`town building: unknown place need «${need}»`);
}

// can this town build this now: its people, what its realm has, its size, how many it has, the place
// (`inRealm` — realmBuilt(a, t), passed in when many buildings are asked about at once)
export function canBuild(a, t, b, inRealm = null) {
  if (b.peoples && !b.peoples.includes(t.people)) return false;
  if (b.requires || b.requiresAny) {
    const has = inRealm || realmBuilt(a, t);
    if (b.requires && !b.requires.every(id => has.has(id))) return false;
    if (b.requiresAny && !b.requiresAny.some(id => has.has(id))) return false;
  }
  if (b.tier > t.tier) return false;
  if (b.pop && t.pop < b.pop) return false;
  if (b.capital && !t.capital) return false;
  if (b.unique && a.towns.some(o => o !== t && o.alive && o.realm === t.realm && o.built.includes(b.id))) return false;
  if (t.built.filter(id => id === b.id).length >= b.max) return false;
  if (b.site) return siteCell(a, t, b) >= 0;   // an outlying work: a free cell that fits it within the town's reach (atlas/sites.js)
  const pk = t.place ||= {};
  const has = need => (need === 'road' || need === 'graves' ? placeHas(a, t.i, need) : (pk[need] ??= placeHas(a, t.i, need)));   // the land does not change; roads and graves do
  if (b.needs && !b.needs.every(has)) return false;
  if (b.needsAny && !b.needsAny.some(has)) return false;
  return true;
}

// what the town needs now, 0 … ~1.5 for each effect
export function townNeeds(a, t, fx, ctx) {
  const N = TF.needs, raided = t.raided != null && a.hist.year - t.raided < N.raided;
  return {
    housing: N.housing[0] * clamp01((t.pop / room(fx) - N.full[0]) / N.full[1]),
    food: N.food[0] * clamp01((t.pop / Math.max(1, ctx.feeds) - N.full[0]) / N.full[1]),
    defence: Math.min(N.defence[0], ctx.threat + (raided ? N.defence[1] : 0)) + N.defence[2],
    trade: N.trade[0] + N.trade[1] * ctx.road + (t.tier >= 2 ? N.trade[2] : 0),
    prod: N.prod[0] + N.prod[1] * t.tier,
    faith: N.faith[0] + N.faith[1] * t.tier,
    lore: t.tier >= 2 ? N.lore[0] + N.lore[1] * t.tier : N.lore[2],
    prestige: N.prestige[0] + N.prestige[1] * t.tier,
    health: N.health[0] + N.health[1] * t.tier + (raided ? N.health[2] : 0),
  };
}

// the building the town wants most, or null
export function chooseBuilding(a, t, P, fx, ctx, rnd) {
  const need = townNeeds(a, t, fx, ctx);
  let best = null, bv = 0.02;
  const inRealm = realmBuilt(a, t);
  for (const b of TOWN_BUILDINGS.all()) {
    if (!canBuild(a, t, b, inRealm)) continue;
    let v = 0;
    for (const k of KEYS) v += (k === 'housing' ? houseGain(t, b) / TF.room[1] : fxOf(b, k)) * need[k] * (P.taste[k] ?? 1);
    v *= 0.85 + 0.3 * rnd();
    if (v > bv) { bv = v; best = b; }
  }
  return best;
}
