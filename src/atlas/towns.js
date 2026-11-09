// How a town of the world map lives by what it has built (data/townBuildings.js), and how it chooses
// what to build next.
//
// Evaluation — the sum of the effects of everything built (townFx):
//   room       = 120 + Σ house of its buildings: the town does not grow past it
//   feeds      = what the land around feeds (and the sea, where it has fishers), a trading town a little more, + what its
//                works give of food (atlas/economy.js); `food` of the effects is the stores: a siege, a murrain, the price of bread
//   effects    × how its buildings work (their hands and goods, t.econ), never below TOWN_FX.work
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
import {realmTowns, metalsChanged} from './frame.js';
import {onEdit} from '../data/schema/layer.js';
import {LAND_BIOMES, ORE_KINDS, ROCK_CLAY, ROCK_CAVES} from '../data/worldLand.js';
import {vectorOf, along} from '../data/mind.js';
import {REALM_BANDS, HOST_BANDS} from '../data/seam.js';
import {TOWN_BUILDINGS, TOWN_GOODS, EFFECTS, metalBuildings, gatedMetals, METAL_WORDS, fxOf, GOLEMS, foodNet, POOLS, makesOf, recipesOf, lineHas, TOWN_SLOTS, slotKind} from '../data/townBuildings.js';

// the buildings that make a good (worked out once, again after an edit of the tables: data/schema/layer.js onEdit)
const MAKERS = new Map();
onEdit(() => MAKERS.clear());
const makersOf = g => { if (!MAKERS.has(g)) MAKERS.set(g, TOWN_BUILDINGS.all().filter(b => makesOf(b).includes(g)).map(b => b.id)); return MAKERS.get(g); };
import {TIERS, CAPITAL, crowned, WORLD_PEOPLES, KIN, swapGoods} from '../data/peoples.js';
import {needsOf, tierNeed, workNeeds} from '../data/requirements.js';
import {meets} from '../core/requirements.js';
import {townFacts} from './requirements.js';
import {ORE_GENESIS} from '../data/geology.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {SPECIES} from '../data/species.js';
import {RIVERS} from '../data/hydrology.js';
import {ROADS} from '../data/roads.js';
import {ROCK_BY_CODE} from '../data/geology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {DIRS8} from './heap.js';
import {siteFits} from './sites.js';
import {TOWN_FX as TF, PLACE_AT as PA, TOWN_MONEY} from '../data/townBuildings.js';
import {allowed} from '../data/commands.js';
import {pickMax, tracing, noteDecision, r3} from '../core/decide.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lv = id => ORE_GENESIS.get(id).levels;
const KEYS = Object.keys(EFFECTS);

// the town's size word in a case: 0 nominative, 1 accusative, 2 genitive, 3 prepositional, 4 instrumental;
// the crowned seat of a people goes by its own word
export const townLabel = (t, cs = 0) => (crowned(t) ? CAPITAL.label[t.people][cs] : TIERS[t.tier].label[t.people][cs]);
export const townGender = t => (crowned(t) ? CAPITAL.gender[t.people] : TIERS[t.tier].gender[t.people]);

export function townFx(t) {
  const out = Object.fromEntries(KEYS.map(k => [k, 0]));
  // effects by kind (twelve fields feed more, not twelve times as famously: atlas/economy.js), the room by every house;
  // a building gives its effects as it works (t.work: its hands and goods, atlas/economy.js), never below TOWN_FX.work of them
  for (const id of new Set(t.built)) {
    const b = TOWN_BUILDINGS.get(id), e = t.work?.[id], k0 = (e == null ? 1 : TF.work + (1 - TF.work) * Math.min(1, e)) * (1 - TOWN_MONEY.upkeep.cut * (t.unpaid || 0));   // unpaid upkeep: worse
    for (const k of KEYS) if (k !== 'housing') out[k] += fxOf(b, k, t.people) * k0;   // (fxBy: what it gives its own people more)
  }
  const hk = WORLD_PEOPLES.get(t.people)?.house ?? 1;   // a people that will not crowd (data/peoples.js `house`: the greenskins)
  const BK = WORLD_PEOPLES.get(t.people)?.bunks, bunks = (BK ? [BK].flat()[Math.min(t.tier || 0, [BK].flat().length - 1)] : 0) / TF.room[1];   // a bunk in every work (data/peoples.js `bunks`: the dwarves)
  for (const id of t.built) { const b = TOWN_BUILDINGS.get(id); out.housing += fxOf(b, 'housing') * hk + (b.cat === 'housing' ? 0 : bunks); }
  return out;
}
export const room = fx => TF.room[0] + TF.room[1] * fx.housing;

// ── the realm: what stands in its towns decides what each of them may build and what metals its smiths work.
// A town of no realm (an old save, a hamlet just founded) looks at itself.
// the raid band a realm sends (data/seam.js REALM_BANDS; HOST_BANDS — by what it has built: the humans' host); a realm
// gone or none — its people's band
export function realmBand(a, realmId, people) {
  const H = HOST_BANDS[people]; if (!H) return REALM_BANDS[people] || null;
  const t = a?.towns?.find(o => o.alive && o.realm === realmId); if (!t) return H.base;
  const built = realmBuilt(a, t), s = Object.entries(H.by).filter(([id]) => built.has(id)).map(([, l]) => l).join('');
  return s ? `${H.base}:${s}` : H.base;
}

// (while a pass over the towns runs — the councils' sittings, the builds, the season's money — what a realm has built is asked
// for every candidate of every town: kept once a realm for the pass (a.builtMemo, set by the pass), and made again whenever a
// town's buildings change inside it — builtChanged, at every place t.built is changed; realms and towns do not change in a pass)
export const builtChanged = a => { if (a?.builtMemo) a.builtMemo = new Map(); metalsChanged(a); };
export function realmBuilt(a, t) {
  if (t.realm == null || !a?.towns) return new Set(t.built);
  const M = a.builtMemo;
  if (M) { let v = M.get(t.realm); if (!v) M.set(t.realm, v = walkBuilt(a, t)); return v; }
  return walkBuilt(a, t);
}
function walkBuilt(a, t) {
  const out = new Set();
  for (const o of realmTowns(a, t)) for (const id of o.built) out.add(id);
  for (const id of t.built) out.add(id);
  return out;
}
// the share of a town's room that is rough: the first shelter (TOWN_FX.room[0]) and housing of step 0 — shacks and
// tents; the more of its people live so, the more of what it owes sticks to hands (data/kingdom.js corruption `rough`)
export function roughShare(t) {
  if (WORLD_PEOPLES.get(t.people)?.roughHome) return 0;   // tents are a home to them, not a shame (data/peoples.js roughHome: the greenskins)
  let rough = TF.room[0], all = TF.room[0];
  for (const id of t.built) { const b = TOWN_BUILDINGS.get(id); if (!b.house) continue; all += b.house; if (b.tier === 0) rough += b.house; }
  return rough / all;
}
// how many of a building a town may have: its `max`, or one for every `per` of its people (a unit of work)
export const unitsMax = (t, b) => Math.max(b.max, b.per ? Math.ceil(t.pop / b.per) : 0);
// a people's cap on a line (data/peoples.js lineMax: one kitchen a town of the elves): the line's buildings in the town, its tiers
// together, are at the cap — and this one would add one more (a tier built in place of one of them does not)
export const lineFull = (t, b) => { const n = WORLD_PEOPLES.get(t.people)?.lineMax?.[b.line]; return n != null && t.built.filter(id => TOWN_BUILDINGS.get(id).line === b.line).length >= n && !upgradeOf(t, b); };
// housing built in place of an older one (data/townBuildings.js `upgrades`): the id of what gives way, or null
export const upgradeOf = (t, b) => (b.upgrades || []).find(id => t.built.includes(id)) || null;
// the room it adds: its own less what gives way to it
export const houseGain = (t, b) => { const old = upgradeOf(t, b); return ((b.house || 0) - (old ? TOWN_BUILDINGS.get(old).house || 0 : 0)) * (WORLD_PEOPLES.get(t.people)?.house ?? 1); };

// whether the realm of a town works this metal (a material id): one of the buildings that open it stands in the realm
export function realmWorks(a, t, material) {
  const by = material ? metalBuildings(material) : [];
  if (!by.length) return true;
  const built = realmBuilt(a, t);
  return by.some(id => lineHas(built, id));
}
// the words of the metals the realm of a town works, of those some building opens (for the cards)
export const realmMetalWords = (a, t) => { const built = realmBuilt(a, t); return gatedMetals().filter(m => metalBuildings(m).some(id => lineHas(built, id))).map(m => METAL_WORDS[m] || m); };
// the slots a town fills (data/townBuildings.js TOWN_SLOTS): {town, upgrades} — its works of its own, its upgrades
export function slotsUsed(t) {
  const o = {town: 0, upgrades: 0};
  for (const id of t.built) { const k = slotKind(TOWN_BUILDINGS.get(id)); if (k) o[k]++; }
  return o;
}
export const slotsOf = t => ({town: TOWN_SLOTS.town[Math.min(t.tier || 0, TOWN_SLOTS.town.length - 1)], upgrades: TOWN_SLOTS.upgrades[Math.min(t.tier || 0, TOWN_SLOTS.upgrades.length - 1)]});
// (a dwarven town's guard golems count as people: atlas/golems.js golemMen)
// a town's might: its people (with its guard golems, its trained war beasts
// and the garrison its realm pays: atlas/treasury.js realmSpend — as so many men: atlas/golems.js, atlas/beasts.js) × its
// defence and craft, × a people's own fierceness (data/peoples.js warCult: the greenskins)
export const might = (t, fx) => Math.sqrt(t.pop + (t.golems?.guard || []).reduce((s, m) => s + (GOLEMS.men[m] || 0), 0) + (t.warBeasts?.men || 0) + (t.wardMen || 0) + (t.garrison || 0)) * (1 + fx.defence + TF.mightProd * fx.prod)
  * (WORLD_PEOPLES.get(t.people)?.warCult?.might ?? 1) * (t.realmFx?.might ?? 1);   // and its realm's stability (atlas/kingdom.js)
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

// (the land's kinds — grazing, pasture, dry, the ores, caves, clay: data/worldLand.js)
export function placeHas(a, i, need) {
  const f = a.f, k2 = scaleOf(a) ** 2, rock = j => ROCK_BY_CODE[f.rock[j]]?.id, bio = j => biomeAt(a, j)?.id;
  switch (need) {
    case 'river': return f.flow[i] >= RIVERS.stream * k2 || nextTo(a, i, j => f.flow[j] >= RIVERS.river * k2 && f.lake[j] < 0);
    case 'coast': return nextTo(a, i, j => f.ocean[j]);
    case 'lake': return around(a, i, PA.lake, j => f.lake[j] >= 0);
    case 'water': return placeHas(a, i, 'river') || placeHas(a, i, 'coast') || placeHas(a, i, 'lake');
    case 'ore': return ORE_KINDS.ore.some(id => f[`ore_${id}`][i] >= lv(id)[1]);
    case 'gems': return f.ore_gems[i] >= lv('gems')[1];
    case 'coal': return f.ore_coal[i] >= lv('coal')[1];
    case 'magma': return around(a, i, PA.magma, j => f.ore_magma[j] >= lv('magma')[1]);
    case 'precious': return ORE_KINDS.precious.some(id => f[`ore_${id}`][i] >= lv(id)[1]);
    case 'placer': return around(a, i, PA.placer, j => f.ore_placer[j] >= lv('placer')[1]);
    case 'salt': return around(a, i, PA.salt, j => f.lake[j] >= 0 && a.lakes[f.lake[j]].salt) || (placeHas(a, i, 'coast') && f.temp[i] >= PA.saltSea);
    case 'clay': return f.alluvium[i] >= PA.clay || ROCK_CLAY.includes(rock(i));
    case 'stone': return around(a, i, PA.near, j => !f.ocean[j] && (f.flat[j] < PA.stoneFlat || (f.elev[j] - a.sea) / (1 - a.sea) > PA.stoneHigh));
    case 'fertile': return f.fert[i] >= PA.fertile;
    case 'arable': return f.fert[i] >= PA.arableFert && f.flat[i] > PA.arableFlat;
    case 'forest': return around(a, i, PA.near, j => f.trees[j] >= PA.forest);
    case 'pasture': return around(a, i, PA.near, j => LAND_BIOMES.pasture.includes(bio(j)));
    case 'grazing': return around(a, i, PA.near, j => LAND_BIOMES.grazing.includes(bio(j)));
    case 'steep': return around(a, i, 1, j => f.flat[j] < PA.steep);
    case 'flat': return f.flat[i] > PA.flat;
    case 'caves': return around(a, i, PA.near, j => (ROCK_CAVES[rock(j)] || 0) > 0);
    case 'road': return around(a, i, 1, j => f.road[j] >= ROADS.levels[1].wear);
    case 'graves': return around(a, i, PA.graves, j => (f.barrows?.[j] || 0) >= PA.gravesAt);
    case 'warm': return f.temp[i] >= PA.warm;
    case 'dry': return around(a, i, PA.dry, j => LAND_BIOMES.dry.includes(bio(j)));
  }
  throw new Error(`town building: unknown place need «${need}»`);
}

// can this town build this now: its people, what its realm has, its size, how many it has, the place
// (`inRealm` — realmBuilt(a, t), passed in when many buildings are asked about at once)
// the races a town holds (data/peoples.js `kin`; atlas/population.js): {race: share}, the shares summing to 1 — set by the
// land when the town is founded and kept as its people live and die; a town of no world (no fields) — its people's race
export function townKin(a, t) {
  if (t.kin) return t.kin;
  const K = kinOfLand(a, t); if (!K) return {[WORLD_PEOPLES.get(t.people).race]: 1};
  return (t.kin = K);
}
// the races the land of a town gives its people (each × base × (KIN.any + its race's home of the biome), data/races.js),
// {race: share} — a new town's, and what its wild tribes keep bringing to it (atlas/population.js, KIN.pull)
export function kinOfLand(a, t) {
  const P = WORLD_PEOPLES.has(t.people) ? WORLD_PEOPLES.get(t.people) : null, K = P?.kin; if (!K || !a?.f) return null;
  const b = biomeAt(a, t.i)?.id, w = Object.fromEntries(Object.entries(K).map(([sp, k]) => [sp, k.base * (KIN.any + (SPECIES.get(sp).home?.[b] || 0))])), sum = Object.values(w).reduce((s, v) => s + v, 0);
  if (!(sum > 0)) return {[P.race]: 1};
  return Object.fromEntries(Object.entries(w).map(([sp, v]) => [sp, v / sum]));   // (exact: the shares sum to one, and the land's pull keeps the count — atlas/population.js)
}
// the town's leading race
export const leadKin = (a, t) => Object.entries(townKin(a, t)).sort((p, q) => q[1] - p[1])[0][0];

// what a building asks of the town — its people or its realm's uklad, the races among its people, what stands in the town or
// the realm, its step, its size, the land — is one requirement (data/requirements.js needsOf: the row's short fields and its
// `need`), checked by one checker (core/requirements.js) against the town's facts (atlas/requirements.js townFacts); the
// limits of count, slot, line and site are rules of their own below
// (`sit`: what a council's sitting over many candidates shares — the counts of the town's buildings, its slots used, the
// realm's unique works; made once by chooseBuilding, none for a lone question)
export function canBuild(a, t, b, inRealm = null, facts = null, sit = null) {
  const src = facts || townFacts(a, t, {inRealm});
  if (!meets(tierNeed(b, t.people), src) || !meets(needsOf(b), src)) return false;
  if (b.unique && (sit ? sit.unique.has(b.id) : a.towns.some(o => o !== t && o.alive && o.realm === t.realm && o.built.includes(b.id)))) return false;
  if ((sit ? sit.count.get(b.id) || 0 : t.built.filter(id => id === b.id).length) >= (b.kind === 'upgrade' ? 1 : unitsMax(t, b))) return false;
  if (lineFull(t, b)) return false;
  // its slot (data/townBuildings.js TOWN_SLOTS): a work of its own in the town, an upgrade; a tier takes its base's place
  const sk = slotKind(b);
  if (sk && (sit ? sit.used : slotsUsed(t))[sk] >= (sit ? sit.slots : slotsOf(t))[sk]) return false;
  if (b.site) return siteFits(a, t, b);   // an outlying work: a free cell that fits it within the town's reach (atlas/sites.js; the cell itself is chosen when it is placed)
  return true;
}
// what the realm's towns make this season (their works' `made`; a town of no reckoning yet — its store), and what of it lies
// spare — made and not used, and in the stores — a year's rate: what a new work of the realm could take (once a realm a step)
function realmMakes(a, realm) {
  const key = `${a.hist?.step ?? -1}:${realm}`, R = a.realmMakes ||= new Map();
  if (R.has(key)) return R.get(key);
  if (R.size > 64) R.clear();
  const made = new Set(), spare = new Map();
  for (const o of a.towns) if (o.alive && o.realm === realm) {
    if (o.econ) for (const [g, v] of Object.entries(o.econ.made)) if (v > 0) { made.add(g); spare.set(g, (spare.get(g) || 0) + Math.max(0, v - (o.econ.used[g] || 0))); }
    for (const [g, v] of Object.entries(o.stock || {})) if (v > 0) { if (!o.econ) made.add(g); spare.set(g, (spare.get(g) || 0) + v * SEASONS_PER_YEAR); }
  }
  const out = {made, spare}; R.set(key, out);
  return out;
}
export function sittingOf(a, t) {
  const count = new Map(); for (const id of t.built) count.set(id, (count.get(id) || 0) + 1);
  const unique = new Set(); for (const o of a.towns) if (o !== t && o.alive && o.realm === t.realm) for (const id of o.built) if (TOWN_BUILDINGS.get(id)?.unique) unique.add(id);
  const {made, spare} = realmMakes(a, t.realm);
  return {count, unique, used: slotsUsed(t), slots: slotsOf(t), made, spare};
}

// what the town needs now, 0 … ~1.5 for each effect
export function townNeeds(a, t, fx, ctx) {
  const N = TF.needs, raided = t.raided != null && a.hist.year - t.raided < N.raided;
  return {
    housing: N.housing[0] * clamp01((t.pop / room(fx) - N.full[0]) / N.full[1]),
    food: N.food[0] * clamp01((t.pop / Math.max(1, ctx.feeds) - N.full[0]) / N.full[1]) + N.food[1] * t.tier,   // a bigger town keeps fields of its own
    defence: Math.min(N.defence[0], ctx.threat + (raided ? N.defence[1] : 0)) + N.defence[2],
    trade: N.trade[0] + N.trade[1] * ctx.road + (t.tier >= 2 ? N.trade[2] : 0),
    prod: N.prod[0] + N.prod[1] * t.tier,
    faith: N.faith[0] + N.faith[1] * t.tier,
    lore: t.tier >= 2 ? N.lore[0] + N.lore[1] * t.tier : N.lore[2],
    prestige: N.prestige[0] + N.prestige[1] * t.tier,
    health: N.health[0] + N.health[1] * t.tier + (raided ? N.health[2] : 0),
  };
}

// the building the town wants most, or null — the decision point `town.project` of the contract (core/decide.js,
// data/commands.js): each building it can build is an option of the command `town.project.build`, scored by the town's
// needs × its people's taste and the flows, × the lean of its role, × a noise; the highest above TOWN_FX.floor is taken
export function chooseBuilding(a, t, P, fx, ctx, rnd) {
  if (!allowed(a.cfg, 'town.project.build')) return null;   // (the run's profile: no town builds)
  const need = townNeeds(a, t, fx, ctx);
  const opts = [];
  const inRealm = realmBuilt(a, t), E0 = ctx.econ, facts = townFacts(a, t, {inRealm});
  const sit = ctx.sitting ||= sittingOf(a, t);   // (once a sitting: the council's tries share it — atlas/build.js pickProject)
  for (const b of ctx.candidates ||= candidatesOf(t, P, need, E0)) {
    if (ctx.skip?.has(b.id) || !canBuild(a, t, b, inRealm, facts, sit)) continue;   // (skip: what it could not pay for this time)
    let v = 0;
    const have = t.built.includes(b.id);   // a second field adds its work, not a second fame
    for (const k of KEYS) v += (k === 'housing' ? houseGain(t, b) / TF.room[1] : have ? 0 : fxOf(b, k, t.people)) * need[k] * (P.taste[k] ?? 1);
    // the flows (atlas/economy.js): what the town's buildings lack of a good, a building that gives it fills; food short
    // of the people — a building that gives food; and no hands to work it — little use
    if (ctx.econ) { v = flowScore(t, b, P, need, ctx.econ, inRealm, facts, v, sit); if (v == null) continue; }
    // the realm's council (atlas/mind.js leanOf): × (1 + k × how the building leans along the town's role, or the seat's wind)
    if (ctx.lean) v *= 1 + ctx.lean.k * along(vectorOf(b), ctx.lean.vec);
    v *= TF.noise[0] + TF.noise[1] * rnd();
    opts.push({b, score: v});
  }
  const best = pickMax(opts, TF.floor);
  if (tracing()) noteDecision({point: 'town.project', who: `town:${t.id}`, at: a.hist ? a.hist.year * 4 + a.hist.season : 0, band: 'routine', policy: 'max',
    opts: opts.map(o => ({cmd: 'town.project.build', key: `town.project.build(${o.b.id})`, score: r3(o.score)})), pick: best ? `town.project.build(${best.b.id})` : null,
    skip: ctx.skip?.size ? [...ctx.skip] : undefined});
  return best ? best.b : null;
}

// the buildings the council looks at: those that give what the town needs most — the effects whose need × taste is within
// TOWN_FX.candidates.share of the strongest, and housing while it is wanted at all — and those that give what its works or its
// people lack, or take what lies spare (the makers of a good: makersOf, the pools), and the works that earn its next step. The
// rest it does not weigh this season: a building of a need the town does not feel would not pass TOWN_FX.floor anyway
// (what each building gives and takes, and the effects it has for a people — worked out once, again after an edit of the tables)
const CAND = new Map();
onEdit(() => CAND.clear());
// what a building answers (its card in the council's deck): the effects it gives — and «food» for one that feeds (foodNet > 0:
// fields, groves, kitchens) or makes one that feeds give more (`boost`: the manure of the fields, the traps of the lodge, the
// mills of the kitchens), so a hungry town looks at its farms, not only at its granary (docs/WORLD.md «Выбор стройки»)
const feeds = (b, people) => foodNet(b, null, WORLD_PEOPLES.get(people)?.workFlows?.[b.id]) > 0;
const feedsCard = (b, people) => feeds(b, people) || Object.keys(b.boost || {}).some(id => TOWN_BUILDINGS.has(id) && feeds(TOWN_BUILDINGS.get(id), people));
const candOf = (b, people) => {
  const key = `${b.id}:${people}`;
  if (!CAND.has(key)) CAND.set(key, {makes: makesOf(b), takes: [...Object.keys(b.in || {}), ...Object.keys(b.any || {}).flatMap(id => Object.keys(POOLS[id]))],
    fx: new Set([...KEYS.filter(k => k !== 'housing' && fxOf(b, k, people) > 0), ...(feedsCard(b, people) ? ['food'] : [])]), boostMakes: Object.keys(b.boost || {}).map(id => [id, makesOf(TOWN_BUILDINGS.get(id))])});
  return CAND.get(key);
};
function candidatesOf(t, P, need, E) {
  const C = TF.candidates, w = KEYS.map(k => [k, need[k] * (P.taste[k] ?? 1)]), top = Math.max(...w.map(x => x[1]));
  const keys = new Set(w.filter(([k, v]) => v >= top * C.share || (k === 'housing' && v > 0)).map(([k]) => k));
  const goods = new Set();
  if (E) {
    for (const g of Object.keys(E.short || {})) goods.add(g);
    for (const g of Object.keys(t.needs?.lack || {})) goods.add(g);
    for (const [g, v] of Object.entries(E.spare || {})) if (v > 0 && !TF.flow.spareSkip.includes(g)) goods.add(`spare:${g}`);
  }
  const next = TIERS[(t.tier || 0) + 1];
  const out = [];
  for (const b of TOWN_BUILDINGS.all()) {
    const c = candOf(b, t.people);
    let on = keys.has('housing') && b.house > 0;
    if (!on) for (const k of keys) if (c.fx.has(k)) { on = true; break; }
    if (!on && goods.size) {
      for (const g of c.makes) if (goods.has(g)) { on = true; break; }
      if (!on) for (const g of c.takes) if (goods.has(`spare:${g}`)) { on = true; break; }
      if (!on) for (const [id, M] of c.boostMakes) if (t.built.includes(id) && M.some(g => goods.has(g))) { on = true; break; }
      if (!on && b.recycle) on = true;
    }
    if (!on && next && next.needsAny.includes(b.id)) on = true;
    if (on) out.push(b);
  }
  return out;
}

// the flows of a building (atlas/economy.js) on its score v: what the town's buildings lack of a good, a building that gives it
// fills; food short of the people — a building that gives food; and no hands to work it — little use; E — the town's economy
// (ctx.econ). → the score, or null (nobody to work it: not built)
function flowScore(t, b, P, need, E, inRealm, facts, v, sit = null) {
  // what it takes, as its people takes it (data/peoples.js swaps: the elves' wood for metal); what it does without (soft)
  // (its recipes: those for its people or kinds — E.lit — whose hard goods the town has, makes or its realm makes: it may be bought)
  // (a good the town has none of: not made here, not in its store — and no town of its realm makes it now (sit.made: what their
  // works gave this season), whatever stands there: a forge is not built in a realm that has no metal)
  const lit = new Set(E.lit || []), none = g => !(E.made[g] > 0) && !(t.stock?.[g] > 0) && !(sit ? sit.made.has(g) : makersOf(g).some(id => lineHas(inRealm, id)));
  const hard = q => Object.keys(q.in || {}).filter(g => !TOWN_GOODS.get(g).soft && !(b.soft || []).includes(g));
  const may = (x, recipe) => meets(workNeeds(x, recipe), facts) && (!recipe || hard(x).every(g => !none(g)));
  const R = recipesOf(b).filter(q => may(q, true));
  const bin = {...(b.in || {})}; for (const q of R) for (const [g, n] of Object.entries(q.in || {})) bin[g] = (bin[g] || 0) + n / R.length;
  const bout = {...(b.out || {})}; for (const q of R) for (const [g, n] of Object.entries(q.out || {})) bout[g] = (bout[g] || 0) + n / R.length;
  const ins = Object.keys(swapGoods(t.people, bin)), softIn = g => TOWN_GOODS.get(g).soft || (b.soft || []).some(s => swapGoods(t.people, {[s]: 1})[g]);
  let flow = 0;
  for (const g of [...Object.keys(bout), ...(b.dig ? makesOf(b) : [])]) flow += (E.short[g] || 0) * TF.flow.short + (t.needs?.lack?.[g] || 0) * TF.flow.needs;   // its works lack it, its people do
  for (const g of ins) if (!TF.flow.spareSkip.includes(g)) flow += (E.spare?.[g] || 0) * TF.flow.spare;   // it takes what lies unused: the mill — spare grain (food is not stored: its surplus is no reason)
  // of a pool (a kitchen: any raw food): what lies unused of its goods — raw food nobody cooks
  for (const id of Object.keys(b.any || {})) flow += Object.keys(POOLS[id]).reduce((s, g) => s + (E.spare?.[g] || 0), 0) * TF.flow.spare;
  // the reworking (the dwarves' `recycle`): what lies spare into what is short — worth as much as the less of the two
  if (b.recycle) flow += Math.min(Object.values(E.short).reduce((s, x) => s + x, 0) * TF.flow.short + Object.values(t.needs?.lack || {}).reduce((s, x) => s + x, 0) * TF.flow.needs,
    Object.values(E.spare || {}).reduce((s, x) => s + x, 0) * TF.flow.spare) / b.recycle.k;
  // an upgrade or an annex that boosts its host: what the host makes and the town lacks, × the boost
  for (const [id, k] of Object.entries(b.boost || {})) if (t.built.includes(id)) for (const g of makesOf(TOWN_BUILDINGS.get(id))) flow += (E.short[g] || 0) * TF.flow.short * k * t.built.filter(x => x === id).length;
  v += Math.min(TF.flow.cap, flow);   // a work of many goods is not worth many works
  // a work that earns the town its next step (data/peoples.js TIERS needsAny), once it has nearly the people for it
  const next = TIERS[(t.tier || 0) + 1];
  if (next && t.pop >= next.pop * TF.flow.tierAt && next.needsAny.includes(b.id) && !next.needsAny.some(id => lineHas(t.built, id))) v += TF.flow.tierUp;
  // it gives what fills the store already and nobody buys (the market's price of it down at `glutAt`): worth the less
  const outs = Object.keys(bout).filter(g => g !== 'food' && g !== 'raw' && g !== 'gold');
  if (outs.length && outs.every(g => (t.market?.[g] ?? 1) <= TOWN_MONEY.price.glutAt)) v *= TF.flow.glut;
  // as much as it feeds — and a booster (the compost heap) as much as the more it makes the town's fields give
  const wf = P.workFlows || {}, fed = foodNet(b, lit, wf[b.id]) + Object.entries(b.boost || {}).reduce((s, [id, k]) => s + k * foodNet(TOWN_BUILDINGS.get(id), lit, wf[id]) * t.built.filter(x => x === id).length, 0);
  if (fed > 0 && need.food > 0) v += need.food * TF.flow.food * fed / TF.flow.foodRef * (P.taste.food ?? 1);
  if (b.jobs && E.freeHands < b.jobs * TF.flow.hands) return null;   // nobody to work it: not built
  // a hard good it takes that no building of the realm makes and the town has none of: it would stand (iron for the steelworks);
  // housing is never stopped, so it is never idle
  // (so with a pool none of whose goods the town has or its realm makes: a furnace with no fuel at all; and a work of recipes
  // none of which may run here — a forge with no metal to be had)
  const pools = [...Object.keys(b.any || {}), ...(b.fire || R.some(q => q.fire) ? ['fuel'] : [])];
  const dark = (recipesOf(b).length && !R.length && !Object.keys(b.out || {}).length) || !may(b, false);
  // (and a hard good the realm has too little of to spare for it — less than TF.flow.supply of what it would take a year, beyond
  // what the town makes itself: a sixth smelter on one mine's ore would stand)
  const scarce = g => sit && !(E.made[g] > 0) && (sit.spare.get(g) || 0) < (bin[g] || 0) * TF.flow.supply;
  if (b.cat !== 'housing' && (dark || ins.some(g => !softIn(g) && (none(g) || scarce(g))) || pools.some(id => id !== 'coin' && Object.keys(POOLS[id]).every(none)))) v *= TF.flow.idle;   // (the mint buys what it strikes: not idle for want of it)
  return v;
}
