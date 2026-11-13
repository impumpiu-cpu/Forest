// The caravan's baggage: what it can carry, on whom and on what (data/transport.js). Room is counted
// in units of goods: a member's back (one cell, a basket adds two), the beasts (a riding beast carries
// its rider and four cells, a pack beast two boxes), the vehicles (a cart and a wagon, four boxes each).
// Beasts are put to work every day: the wagon's draft first, then a cart's, then riders (the wounded
// first, then the knights), the rest carry packs. How fast the caravan goes is the slowest of those who
// walk — members on foot, beasts under packs or in harness, the riders' mounts.
//
// K.beasts = [{id, kind, hp, job: 'ride' | 'pack' | 'draft', rider}];  K.vehicles = [{kind, pulled}];  K.buildings = [key] — the camp
// K.cargo = {resource id → units} besides the food;  member.back — cells on the member's back
import {inLine, CAMPAIGN} from '../data/campaign.js';
import {SPECIES} from '../data/species.js';
import {gearDef} from '../local/index.js';
import {BONDS} from '../data/captives.js';
import {ORES} from '../data/ores.js';
import {RESOURCES} from '../data/resources.js';
import {BUILDINGS} from '../data/buildings.js';
import {EFFECTS, NORM} from '../data/special.js';
import {CELL, BOX, BEASTS, VEHICLES, CAMP_FX, CAMP_KIT, FIELD_BUILD, kitOf} from '../data/transport.js';
import {clamp} from '../core/util.js';
import {potionKeep} from '../data/potions.js';
import {perkVal} from './perks.js';
import {WOUNDS} from '../data/wounds.js';

const alive = K => K.members.filter(m => m.alive);
const bulk = id => (RESOURCES.has(id) ? RESOURCES.get(id).bulk ?? 1 : 1);
const humanSpeed = () => SPECIES.get('human').speed;

// ── metal: the best metal of the free members' gear — tools, arms and armour (data/items.js `tier`: 1 bronze,
// 2 iron, 4 mithril; 0 — wood, bone, hide). A caravan in bronze wants no copper, but iron it does (data/campaign.js MINE)
export function metalTier(K) {
  let best = 0;
  for (const m of alive(K)) {
    if (m.captive) continue;
    for (const id of [...m.gear.hand, m.gear.body]) { const d = gearDef(id); if (d && d.material !== 'silver') best = Math.max(best, d.tier || 0); }
  }
  return best;
}

// ── metal: the best tool among the members' gear (1 — bronze, 2 — iron; 0 — none that can build)
export function toolTier(K) {
  let best = 0;
  for (const m of alive(K)) for (const id of m.gear.hand) {
    const d = gearDef(id);
    if (d?.tool && (d.tool.chop || d.tool.build)) best = Math.max(best, d.iron ? 2 : d.bronze ? 1 : 0);
  }
  return best;
}

// ── putting the beasts to work: draft for the wagon (and a cart, if beasts are left), riders, packs
export function assign(K) {
  const ms = alive(K), beasts = K.beasts.filter(b => b.hp > 0);
  for (const b of beasts) { b.job = null; b.rider = null; }
  for (const m of ms) m.ride = null;
  const free = () => beasts.filter(b => !b.job);
  const harness = () => {   // a pulling power of 1: one mule, or two riding beasts
    const mule = free().find(b => BEASTS[b.kind].pulls >= 1);
    if (mule) { mule.job = 'draft'; return true; }
    const two = free().filter(b => BEASTS[b.kind].pulls > 0).slice(0, 2);
    if (two.length === 2) { for (const b of two) b.job = 'draft'; return true; }
    return false;
  };
  for (const v of [...K.vehicles].sort((p, q) => (VEHICLES[q.kind].pull === 'draft') - (VEHICLES[p.kind].pull === 'draft'))) v.pulled = VEHICLES[v.kind].pull === 'draft' ? harness() : harness() ? 'beasts' : ms.length >= 2 ? 'people' : false;
  // riders: the wounded first, then the knights, then the rest; a captive only on a beast nobody free needs
  const order = ms.filter(m => !m.captive).sort((p, q) => (p.hp < 0.5) - (q.hp < 0.5) || inLine(p) - inLine(q) || p.id - q.id).reverse();
  order.push(...ms.filter(m => m.captive));
  for (const m of order) {
    const b = free().find(x => BEASTS[x.kind].use === 'ride'); if (!b) break;
    b.job = 'ride'; b.rider = m.id; m.ride = b.id;
  }
  for (const b of free()) b.job = 'pack';   // a riding beast nobody rides carries its four cells all the same
}

// ── room
export function capacity(K) {
  let u = 0;
  for (const m of alive(K)) u += (m.back ?? 1) * CELL * (1 + perkVal(m, 'carry')) +   // (a strong back carries more: «Крепкая спина», campaign/perks.js)
     (m.captive ? (kitOf(K).bearers || 0) * BOX : 0);   // (the greenskins' captives carry a box besides)
  for (const b of K.beasts) if (b.hp > 0) { const B = BEASTS[b.kind]; u += (B.cells || 0) * CELL + (B.boxes || 0) * BOX; }
  for (const v of K.vehicles) if (v.pulled) u += VEHICLES[v.kind].boxes * BOX;
  return u;
}
export const cargoLoad = K => Object.entries(K.cargo).reduce((s, [id, n]) => s + n * bulk(id), 0);
export const load = K => K.food + cargoLoad(K);
// what does not fit is left behind: goods first, then food; returns what was left
export function overflow(K) {
  let over = load(K) - capacity(K), left = 0;
  // the goods first, then food, then the ore kept for the smith; bonds for captives last: they weigh little and nothing else binds (data/captives.js)
  const bonds = id => BONDS.all().some(b => b.resource === id);
  const drop = (id, keepN = 0) => {
    const n = Math.min(K.cargo[id] - keepN, Math.ceil(over / bulk(id))); if (n <= 0) return;
    K.cargo[id] -= n; over -= n * bulk(id); left += n * bulk(id);
    if (K.cargo[id] <= 0) delete K.cargo[id];
  };
  // the cheapest for the room it takes first: gems and gold stay, ore and hides go
  // (ore of a metal above the caravan's own is kept for the smith: data/market.js SMITH)
  // (and the potions, with a few of each of their makings: data/potions.js potionKeep — the kept ones after any other
  // goods and the food; what is beyond them goes with the goods)
  const tier = metalTier(K), smithOre = id => ORES.all().some(o => o.resource === id && o.tier > tier);
  const kept = id => (smithOre(id) ? K.cargo[id] : potionKeep(id, K.cargo[id]));
  const worth = id => (RESOURCES.has(id) ? RESOURCES.get(id).value ?? 0 : 0) / bulk(id);
  const byWorth = ids => ids.sort((p, q) => worth(p) - worth(q) || (p < q ? -1 : 1));
  for (const id of byWorth(Object.keys(K.cargo).filter(id => !bonds(id) && kept(id) < K.cargo[id]))) { if (over <= 0) break; drop(id, kept(id)); }
  if (over > 0) { const f = Math.min(K.food, over); K.food -= f; over -= f; left += f; }   // what more was picked is left
  for (const id of Object.keys(K.cargo).filter(id => !bonds(id) && K.cargo[id] > 0).sort()) { if (over <= 0) break; drop(id); }   // (the kept ones: as they come, none cheaper than another — a pot is worth the potion it makes)
  for (const id of Object.keys(K.cargo).filter(bonds).sort()) { if (over <= 0) break; drop(id); }
  return left;
}

// ── pace: × on a walking human of average Agility, as slow as the slowest who walks
// the pace kept by health (data/campaign.js CAMPAIGN.hurtPace)
const hurtPace = (P, hp) => P.base + P.hurt * clamp(hp / P.at, 0, 1);
const beastPace = b => (SPECIES.get(b.species || b.kind).speed / humanSpeed()) * hurtPace(CAMPAIGN.hurtPace.beast, b.hp);
// (a maim that slows it — a shattered leg — slows it on the road too: data/conditions.js `speed`; a trauma's limp, as before, not)
const lame = m => (m.wounds || []).reduce((v, x) => v * (WOUNDS.has(x.id) && WOUNDS.get(x.id).maim ? WOUNDS.get(x.id).mods?.speed ?? 1 : 1), 1);
const footPace = m => (SPECIES.get(m.race).speed / humanSpeed()) * EFFECTS.speed(m.special || {A: NORM}) * hurtPace(CAMPAIGN.hurtPace.foot, m.hp) * lame(m);
export function slowest(K) {
  const ms = alive(K); if (!ms.length) return 0;
  const byId = new Map(K.beasts.map(b => [b.id, b]));
  const paces = ms.map(m => (m.ride && byId.get(m.ride) ? beastPace(byId.get(m.ride)) : footPace(m)));
  for (const b of K.beasts) if (b.hp > 0 && b.job && b.job !== 'ride') paces.push(beastPace(b));
  let v = Math.min(...paces);
  if (K.vehicles.some(x => x.pulled === 'people')) v *= VEHICLES.cart.haul;
  return v;
}
export const wheeled = K => K.vehicles.some(v => v.pulled);

// ── the caravan's camp: its buildings, one of each kind it may have (data/buildings.js `portable`). A campaign saved
// when a building rode packed in a wagon (v.building) has it moved into the camp
export function campOf(K) {
  if (!K.buildings) { K.buildings = []; for (const v of K.vehicles) if (v.building) { if (!K.buildings.includes(v.building)) K.buildings.push(v.building); delete v.building; } }
  // (a camp from before the soldiers' camp: what it may no longer carry is left behind — data/transport.js CAMP_KIT)
  if (K.buildings.some(id => !BUILDINGS.has(id) || !BUILDINGS.get(id).portable)) K.buildings = K.buildings.filter(id => BUILDINGS.has(id) && BUILDINGS.get(id).portable);
  return K.buildings;
}
export const hasBuilding = (K, id) => campOf(K).includes(id);
export const hutsOf = K => campOf(K).filter(id => id === 'hut').length;
// the camp's help: its shelters by how many (data/transport.js CAMP_KIT.huts), its healer's hut (CAMP_FX), the people's dish
// in the cauldron (CAMP_KIT.dish)
export function campFx(K, key) {
  const H = CAMP_KIT.huts;
  let k = H.by[Math.min(hutsOf(K), H.max)][key] ?? 1;
  for (const id of new Set(campOf(K))) if (CAMP_FX[id]?.[key]) k *= CAMP_FX[id][key];
  return k * (CAMP_KIT.dish[K.people]?.[key] ?? 1);
}
// the buildings of the camp that can be made in the field: portable, of wood alone, while there is room for one more (the
// shelters up to CAMP_KIT.huts.max, the rest one of each)
export const fieldBuildings = K => BUILDINGS.filter(b => b.portable && Object.keys(b.cost).every(r => r === 'wood') && (b.id === 'hut' ? hutsOf(K) < CAMP_KIT.huts.max : !hasBuilding(K, b.id)));
export const buildDays = b => Math.ceil(b.cost.wood / FIELD_BUILD.woodPerDay);

// the best handler's way with beasts: 1 + Charisma's charm (data/special.js)
export const handler = K => 1 + Math.max(0, ...alive(K).filter(m => !m.captive).map(m => EFFECTS.charm(m.special || {C: NORM})));
