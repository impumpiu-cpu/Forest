// Towns on the caravan's way (data/market.js): a friendly town is a standing trader — it buys the
// caravan's goods and sells food, beasts, vehicles, iron, arms and armour, packed buildings, as far as
// what it has built allows; there the caravan works for gold when it has none, heals faster, hires a
// guide or a sellsword, and meets those who would go along. In winter it may stay till spring.
import {isFighter, inLine, toolOf} from '../data/campaign.js';
import {townFx, townLabel, realmWorks} from '../atlas/towns.js';
import {gearDef, gearType, gearValue, gearToken, mayTake} from '../agents/equipment.js';
import {MARK, markOfPeople, markable} from '../data/balance/marks.js';
import {trades, atWar, realmAlign} from '../atlas/diplomacy.js';
import {realmLabel} from '../atlas/realms.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {RESOURCES} from '../data/resources.js';
import {BUILDINGS} from '../data/buildings.js';
import {NORM} from '../data/special.js';
import {BEASTS, CARAVAN_GOLEMS, CAMP_KIT, kitOf} from '../data/transport.js';
import {golemMetal} from '../atlas/golems.js';
import {golemOf, GOLEM_METALS} from '../data/constructs.js';
import {CAMPAIGN as PRICES} from '../data/balance/prices.js';
import {STANDING, MARKET, OFFERS, WARES, WARE_IDS, WANTS, HIRES, COMPANIONS, SMITH, ALCHEMY, BUY_ORDER} from '../data/market.js';
import {marketTierOf} from '../data/kingdom.js';
import {TOWN_MONEY, TOWN_BUILDINGS, lineHas, recipesOf, reqLit} from '../data/townBuildings.js';
import {townUnfold, townLights} from '../atlas/economy.js';
import {goodOfRes, marketK, toTown, fromTown, intoStore, outOfStore, townPurse} from '../atlas/treasury.js';
import {termsOf} from './road.js';
import {RECIPES} from '../data/recipes.js';
import {room} from './company.js';
import {CAMPAIGN} from '../data/campaign.js';
import {plural} from '../core/util.js';
import {capacity, load, assign, toolTier, metalTier, campOf, hasBuilding} from './baggage.js';
import {topUp, potionRoom, homeRoom, roomFor, kindRoom, potionKeep} from './potions.js';
import {POTION, POTIONS, potionOf, isPotion} from '../data/potions.js';
import {ORES} from '../data/ores.js';
import {route} from './path.js';
import {ROUTE} from '../data/transport.js';
import {makeMember} from './start.js';
import {welcome} from './social.js';
import {free, bondsSets, isBonds} from './captives.js';
import {tradeCaptives} from './slavery.js';
import {CAPTIVE} from '../data/captives.js';
import {KIND_GROVES, WOODS, useOf, mayWield} from '../data/kinds.js';
import {MATERIALS} from '../data/balance/materials.js';
import {allowed} from '../data/commands.js';

const alive = K => K.members.filter(m => m.alive);
const has = (t, ids) => ids.some(id => lineHas(t.built, id));   // (a tier stands for its base: a town of deep mines has a mine)
const gold = v => Math.round(v * 10) / 10;
const pieces = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;

// how the town stands to the caravan: 'own', 'friend' or null (closed to it)
export function standing(a, K, t) {
  if (!t || !t.alive) return null;
  if (t.realm && t.realm === K.realm) return 'own';
  if (!t.realm || !K.realm) return null;
  return trades(a, K.realm, t.realm) && !atWar(a, K.realm, t.realm) ? 'friend' : null;
}
export const townName = t => `${townLabel(t, 0)} ${t.name}`;

// the price of a ration here: cheaper where the town feeds itself well
// (and by its surplus of food: what it is fed with over its people, atlas/sites.js t.supply — TOWN_MONEY.price.food)
export function rationPrice(t, st, terms = 1) {
  const F = MARKET.food, fx = townFx(t), s = t.supply ? (t.supply.own + t.supply.got - t.supply.gave) / Math.max(1, t.pop) : 1;
  const plenty = 1 - TOWN_MONEY.price.food * Math.max(0, Math.min(1, s - 1));
  return MARKET.ration * Math.max(F.floor, F.base - F.feeds * (fx.food || 0)) * plenty * STANDING[st].buy * terms;
}
// the town good of a stock resource (an ore by its kind: atlas ore goods) and of an offer
const goodOf = id => goodOfRes(id)?.[0] || null;   // (ore is no good of the towns: their mines give metal — the caravan's ore goes to the smith, SMITH)
const offerGood = o => (o.kind === 'goods' ? goodOf(o.id) : o.kind === 'beast' ? 'beasts' : o.kind === 'item' ? (gearDef(o.id)?.tool ? 'tools' : gearDef(o.id)?.slot === 'body' || gearType(o.id) === 'shield' ? 'armor' : 'arms') : null);
const sellPrice = (t, st, id) => {
  const v = RESOURCES.has(id) ? RESOURCES.get(id).value ?? 0 : 0;
  let k = STANDING[st].sell * marketK(t, goodOf(id));   // the town's market this season (atlas/treasury.js)
  for (const [b, bonus] of Object.entries(MARKET.sellBonus)) if (t.built.includes(b)) k *= bonus[id] ?? bonus.all ?? 1;
  return v * k;
};
const offerPrice = (o, st, t = null) => (o.price ?? (o.kind === 'goods' ? RESOURCES.get(o.id).value * o.n : gearDef(o.id) ? gearValue(o.id) : 10)) * STANDING[st].buy * (t ? marketK(t, offerGood(o)) : 1);
// what a town sells; its arms and armour are its smiths' work: they bear the mark of its people (data/balance/marks.js)
// (with the world `a`: only the metals its realm works — a building that opens them stands in one of its towns,
// data/townBuildings.js `metals`)
// (nor a form its people will not touch: no crossbow in an elven town — data/kinds.js RACE_FORMS)
// the golem a town with a golem forge sells: the best of its guard golems (one of them goes), else one of its realm's best
// metal (atlas/golems.js); null — none
export const townGolem = (a, t) => {
  const guard = t.golems?.guard || [];
  const m = guard.length ? guard.reduce((b, x) => (GOLEM_METALS.indexOf(x) > GOLEM_METALS.indexOf(b) ? x : b)) : a ? golemMetal(a, t) : null;
  return m && BEASTS[golemOf(m)] ? m : null;
};
const golemOffer = (o, t, a) => { if (!o.golem) return o; if (!has(t, o.at)) return null; const m = townGolem(a, t); return m ? {...o, id: golemOf(m), metal: m, price: PRICES.beasts[golemOf(m)]} : null; };
// the town's wares (data/market.js WARES): the items of the recipes that run and the works that stand in it — the town unfolded
// for the visit (atlas/economy.js townUnfold) — as offers; a thing of a metal where that metal's recipe runs, or where the store
// holds its kind and a forge of the realm ran the metal last season (the store's wares came from there, atlas/treasury.js
// realmPool); the smith's anvil (smithy below) carries every ware: he forges from the caravan's ore whatever the realm works
let UNFOLD = new WeakMap();   // (a town's unfold, kept while its buildings and store are as they were)
const unfoldOf = (a, t) => { const key = `${t.built.length}:${Object.keys(t.stock || {}).length}`, u = UNFOLD.get(t); if (u && u.key === key) return u.v; const v = townUnfold(a, t); UNFOLD.set(t, {key, v}); return v; };
const FORGE_METALS = new Set(['bronze', 'iron', 'steel', 'mithril']);
const realmForges = (a, t) => { const out = new Set(); for (const o of a.towns) if (o.alive && o.realm === t.realm) for (const [id, v] of Object.entries(o.work || {})) { const m = id.split(':')[1]; if (v > 0 && m && FORGE_METALS.has(m)) out.add(m); } return out; };
function wareOffers(t, a) {
  if (t.anvil) return WARE_IDS.map(id => ({kind: 'item', id}));
  const u = a ? unfoldOf(a, t) : null, ids = new Set();
  // the recipes that run and the works that stand; and the recipes of a standing work that do not run here (a forge without
  // ingots) — their wares while the store holds the kind and a forge of the realm ran the metal
  // (no world — a town alone, as the checks ask: its works, and the recipes they run by its people and kinds, the store unasked)
  const bare = () => { const L = townLights(null, t), out = []; for (const id of new Set(t.built)) { out.push(id); for (const q of recipesOf(TOWN_BUILDINGS.get(id))) if (reqLit(q.req, L)) out.push(`${id}:${q.id}`); } return out; };
  const runs = u ? [...u.recipes, ...u.works] : bare(), forged = a ? realmForges(a, t) : null;
  const shelf = []; if (u) for (const b of u.works) for (const q of recipesOf(TOWN_BUILDINGS.get(b))) { const id = `${b}:${q.id}`; if (!u.recipes.includes(id) && forged.has(q.id)) shelf.push(id); }
  for (const id of runs) for (const w of WARES[id] || []) ids.add(w);
  for (const id of shelf) for (const w of WARES[id] || []) if ((t.stock?.[offerGood({kind: 'item', id: w})] || 0) > 0) ids.add(w);
  return [...ids].map(id => ({kind: 'item', id}));
}
export const offers = (t, a = null) => [...OFFERS.map(o => golemOffer(o, t, a)).filter(o => o).filter(o => (o.any || has(t, o.at)) && (!o.also || has(t, o.also)) && (!o.peoples || o.peoples.includes(t.people))), ...wareOffers(t, a)]
  .filter(o => (!a || o.kind !== 'item' || realmWorks(a, t, gearDef(o.id)?.material)) && (o.kind !== 'item' || mayWield(WORLD_PEOPLES.has(t.people) ? WORLD_PEOPLES.get(t.people).race : null, gearDef(o.id)?.form))).map(o => townMade(o, t));
const townMade = (o, t, q = 0) => {
  if (o.kind !== 'item') return o;
  const mark = markOfPeople(t.people), d = gearDef(o.id);
  // a wooden piece of a town by a grove of the tree its people master (data/kinds.js 'master'): of that wood, by a master
  // — the elves' bows and staves of the sacred tree
  const tree = MATERIALS[d?.material]?.class.includes('wood') ? masterWoodOf(t) : null;
  if (!d || !markable(d) || (!mark && !q && !tree)) return o;
  return {...o, id: gearToken({type: gearType(o.id), q, mark: mark && markable(d) ? mark : null, ...(tree ? {of: tree, master: true} : {})})};
};
// the special wood a town's people master and grow near it (the elves' sacred tree by a sacred grove), or null
function masterWoodOf(t) {
  const race = WORLD_PEOPLES.get(t.people)?.race;
  for (const T of WOODS.all()) if (T.special && useOf(race, T.id) === 'master' && t.built.some(b => KIND_GROVES[T.id]?.includes(b))) return T.id;
  return null;
}
// the town buildings that grow a special tree (data/kinds.js WOODS)
// the quality a town's forge works at (data/balance/marks.js MARK.forge): no worse than +1, a city's better
const forgeQ = t => (t.tier >= MARK.forge.cityTier ? MARK.forge.cityQ : MARK.forge.q);

// the gold kept for food: `days` of rations for everyone, at this town's price
// (the reserve is counted at the town's terms for this caravan — its tongue and fame, campaign/road.js: 1 by default)
export const reserveFor = (K, t, st, days, a) => days * alive(K).length * CAMPAIGN.ration * rationPrice(t, st, a ? termsOf(a, K, t).buy : 1);

const golems = K => K.beasts.filter(b => BEASTS[b.kind]?.golem && b.hp > 0).length;
const herdOf = K => K.beasts.filter(b => BEASTS[b.kind]?.use === 'food' && b.hp > 0).length;
export const herdMax = K => Math.round(CAMP_KIT.herd.max * (kitOf(K).herd ?? 1));   // (the greenskins keep twice the herd, the elves none)

// the wheels' answer during one trade() (wants() is asked again and again by the smith): {i, goal, vehicles, fits}; never saved
const FITS = new WeakMap();
// ── buying: what the caravan wants, in order, while the gold lasts beyond the food reserve — the decision point
// `caravan.buy` (data/commands.js): a rule, each kind of thing the command `caravan.buy.<kind>` with its place in the order
// (data/market.js BUY_ORDER: the lower first); a kind the run's profile switches off is not bought
function wants(a, K, t, st) {
  const out = [], ms = alive(K), tier = toolTier(K);
  const want = (kind, o) => { if (allowed(a?.cfg, 'caravan.buy.' + kind)) out.push([BUY_ORDER[kind], o]); };
  // wheels are worth their price only when they can go the way to the goal (as the council asks, campaign/march.js)
  // (asked once a visit's trade: the way does not change while the caravan trades — trade() keeps the answer, K.wheelsFit)
  const wheelsFit = () => {
    const F = FITS.get(K);
    if (F && F.i === K.i && F.goal === K.goal && F.vehicles === K.vehicles.length) return F.fits;
    const foot = route(a, K.i, K.goal, K.people, false), road = route(a, K.i, K.goal, K.people, true), fits = !!(road && foot && road.cost <= ROUTE.keep * foot.cost);
    if (F) Object.assign(F, {i: K.i, goal: K.goal, vehicles: K.vehicles.length, fits});
    return fits;
  };
  const count = kind => K.beasts.filter(b => b.kind === kind && b.hp > 0).length;
  const riders = K.beasts.filter(b => BEASTS[b.kind].use === 'ride' && b.hp > 0).length;
  for (const o of offers(t, a)) {
    if (o.kind === 'item' && !free(K).some(m => !m.former && mayTake(m.race, o.id))) continue;   // nobody free of the caravan would carry it (the elves and iron): the same as equip() gives to
    if (o.kind === 'beast' && BEASTS[o.id].golem) { if (golems(K) < CARAVAN_GOLEMS.max) want('golem', o); continue; }
    if (o.kind === 'beast' && BEASTS[o.id].use === 'food') { if (herdOf(K) < herdMax(K)) want('herd', o); continue; }   // the herd: milk and meat on the way   // a golem: one guard of the caravan, after the arms
    if (o.kind === 'beast' && BEASTS[o.id].use === 'pack' && count(o.id) < 2) want('pack', o);
    if (o.kind === 'beast' && BEASTS[o.id].use === 'ride' && riders < free(K).length) want('mount', o);
    if (o.kind === 'goods' && o.need === 'bonds' && bondsSets(K) < CAPTIVE.campaign.keep) want('bonds', o);   // bonds for captives, last
    if (o.kind === 'goods' && o.need === 'pots' && (K.cargo.pots || 0) < ALCHEMY.pots && hasBuilding(K, 'healerhut')) want('pots', o);   // pots for the camp's healer's hut: cheap, and every potion takes one
    if (o.kind === 'goods' && o.need === 'belt') for (let k = 0; k < kindRoom(K, potionOf(o.id).potion, o.id); k++) want('potion', o);   // as many as would be worn of its kind   // potions for the belts (data/market.js: the strong first)
    if (o.kind === 'goods' && o.need === 'home') for (let k = 0; k < homeRoom(K, potionOf(o.id).potion); k++) want('potion', o);   // the brews of the cargo (after the belts: the market lists them later)
    if (o.kind === 'vehicle' && o.id === 'cart' && !K.vehicles.length && K.goal != null && wheelsFit()) want('cart', o);
    if (o.kind === 'vehicle' && o.id === 'wagon' && !K.vehicles.some(v => v.kind === 'wagon') && K.beasts.some(b => BEASTS[b.kind].pulls >= 1) && K.goal != null && wheelsFit()) want('wagon', o);
    if (o.kind === 'item' && gearDef(o.id).tool && tier < 2 && gearDef(o.id).iron) want('tool', o);
    if (o.kind === 'item' && gearDef(o.id).slot === 'body' && ms.some(m => inLine(m) && (gearDef(m.gear.body)?.armor ?? 0) < gearDef(o.id).armor)) want('armor', o);
    if (o.kind === 'item' && gearDef(o.id).melee && !gearDef(o.id).tool && ms.some(m => isFighter(m) && bestDmg(m) < gearDef(o.id).melee.dmg)) want('weapon', o);
    if (o.kind === 'building' && !hasBuilding(K, o.id)) want('building', o);
    // healing potions for the empty slots, after the arms and armour (campaign/potions.js)
    if (o.kind === 'goods' && o.need === 'heal') for (let k = 0; k < Math.min(POTION.slot, potionRoom(K)); k++) want('potion', o);
  }
  return out.sort((p, q) => p[0] - q[0]).map(e => e[1]);
}
const bestDmg = m => Math.max(0, ...m.gear.hand.map(id => gearDef(id)?.melee?.dmg ?? 0));

// a bought item goes to who gains most by it: armour to the first rank, arms to the fighter with the weakest, a tool in place of a
// tool (on whoever carries one)
function equip(K, id) {
  const d = gearDef(id), ms = free(K).filter(m => !m.former && mayTake(m.race, id));   // no arms for a former slave, nor for one whose race will not touch it
  if (d.slot === 'body') {
    const m = ms.filter(x => inLine(x) || x.role === 'sellsword').sort((p, q) => (gearDef(p.gear.body)?.armor ?? 0) - (gearDef(q.gear.body)?.armor ?? 0))[0] || ms[0];
    if (m.gear.body && gearDef(m.gear.body)) K.spoils = [...(K.spoils || []), m.gear.body];   // the old armour goes with the spoils
    m.gear.body = id; return m;
  }
  if (d.tool) { const m = ms.find(x => toolOf(x, gearDef)) || ms[0], k = m.gear.hand.indexOf(toolOf(m, gearDef)); if (k >= 0) m.gear.hand[k] = id; else m.gear.hand.push(id); return m; }
  const m = ms.filter(x => isFighter(x) && !gearDef(x.gear.hand[0])?.ranged).sort((p, q) => bestDmg(p) - bestDmg(q))[0] || ms[0];
  const k = m.gear.hand.findIndex(x => gearDef(x)?.melee && !gearDef(x)?.ranged && gearType(x) !== 'shield');
  if (k >= 0) { K.spoils = [...(K.spoils || []), m.gear.hand[k]]; m.gear.hand[k] = id; }   // the old blade goes with the spoils
  else {   // no blade in hand: the new one takes the first hand, what was there (a tool, a shield) goes with the spoils
    const old = m.gear.hand[0];
    if (old && gearDef(old)) K.spoils = [...(K.spoils || []), old];
    m.gear.hand[0] = id;
  }
  return m;
}

// a town's laboratory brews the strong potions from the caravan's makings (data/market.js ALCHEMY): the price of its work
// is the potion's × ALCHEMY.fee, the makings and a pot go into it, while there is room for it (the belts, the brews' own). → the lines
function alchemy(a, K, t, st) {
  const done = [];
  for (const p of POTIONS.all()) for (const g of p.grades.filter(x => x.at === 'alchemist')) {   // the strong grades, and what only an alchemist brews
    while (roomFor(K, p, g.res) > 0 && Object.entries(g.cost).every(([r, n]) => (K.cargo[r] || 0) >= n)) {
      const price = gold(RESOURCES.get(g.res).value * ALCHEMY.fee * STANDING[st].buy);
      if (K.gold - price < reserveFor(K, t, st, ALCHEMY.reserve, a)) break;
      for (const [r, n] of Object.entries(g.cost)) { K.cargo[r] -= n; if (K.cargo[r] <= 0) delete K.cargo[r]; }
      K.cargo[g.res] = (K.cargo[g.res] || 0) + 1; K.gold = gold(K.gold - toTown(t, price)); K.stats.alchemy = (K.stats.alchemy || 0) + 1;
      done.push(`алхимик сварил из запасов каравана ${RESOURCES.get(g.res).label} — за работу ${price} зол.`);
    }
  }
  if (done.length) topUp(K);
  return done;
}

// the smith forges from the caravan's ore (data/market.js SMITH): what is wanted of a metal the caravan carries the
// ore for is made from it at × discount; the ore goes into it. → the lines
function smithy(a, K, t, st) {
  const done = [];
  if (!has(t, SMITH.at)) return done;
  // the smith makes any item of the metal, whether the town sells it or not: what the caravan would buy anywhere
  const anvil = {...t, anvil: true};
  for (const o of wants(a, K, anvil, st)) {
    if (o.kind !== 'item') continue;
    const type = gearType(o.id), d = gearDef(o.id), B = SMITH.bar[d.material], R = RECIPES.all().find(r => r.makes?.item === type && !r.makes.silver);
    if (!B || !R?.cost?.[d.material] || !realmWorks(a, t, d.material)) continue;   // a smith works only the metals his realm works
    const need = R.cost[d.material] * B.n;
    if ((K.cargo[B.ore] || 0) < need) continue;
    // forged here: the town's quality and its people's mark (a human town: quality alone)
    const made = townMade({kind: 'item', id: type}, t, forgeQ(t)).id;
    // the price is that of the town's plain piece: the better work of its forge is what draws the caravan to it
    const p = gold(offerPrice(o, st, t) * SMITH.discount);
    if (K.gold - p < reserveFor(K, t, st, SMITH.reserve, a)) continue;
    // still wanted after what the smith made before it
    if (!wants(a, K, anvil, st).some(x => x.kind === 'item' && x.id === o.id)) continue;
    K.cargo[B.ore] -= need; if (K.cargo[B.ore] <= 0) delete K.cargo[B.ore];
    K.gold = gold(K.gold - toTown(t, p)); K.stats.forged = (K.stats.forged || 0) + 1;
    const m = equip(K, made);
    done.push(`кузнец перековал руду каравана (${RESOURCES.get(B.ore).label}, ${need}) в ${gearDef(made).label.toLowerCase()} для ${m.name} — всего за ${p} зол.`);
    assign(K);
  }
  return done;
}

// a visit's trade: the smith forges from the ore, sell the goods, buy food up to the stock wanted, then what is
// wanted while the gold lasts
export function trade(a, K, t, st) {
  FITS.set(K, {i: null});   // the wheels are asked afresh once a trade (wants)
  try { return tradeNow(a, K, t, st); } finally { FITS.delete(K); }
}
function tradeNow(a, K, t, st) {
  const done = [];
  // ore of a metal above the caravan's own goes to the smith first (what the smith leaves is sold after); in a town
  // without one it is kept for the next
  const tier = metalTier(K), ore = new Set(ORES.all().filter(o => o.tier > tier).map(o => o.resource)), smith = has(t, SMITH.at);
  // the town's market by its step (data/kingdom.js MARKET_TIERS): the gold it pays in a visit, the dearest it sells
  const M = marketTierOf(t), T = termsOf(a, K, t);   // the town's market by its step; its tongue and the caravan's name (campaign/road.js)
  // the town's purse lasts the whole visit (trade on entering and on leaving): kept on the caravan only while a purse is set
  if (M.purse != null && (!K.inTown || K.townPurse?.id !== t.id)) K.townPurse = {id: t.id, left: M.purse};
  const P = M.purse != null ? K.townPurse : {left: Infinity}, unsold = [];
  const sell = keep => {
    let got = 0;
    for (const [id, all] of Object.entries(K.cargo)) { if (isBonds(id) || keep(id)) continue;   // bonds are kept for captives
      const kept = potionKeep(id, all), n = all - kept; if (n <= 0) continue;   // the potions, a few of each of their makings
      const p = sellPrice(t, st, id) * n * T.sell, can = Math.min(P.left, townPurse(t));   // the town pays from its treasury
      if (p > 0 && p <= can) { got += fromTown(t, p); P.left -= p; intoStore(t, goodOf(id), n * (goodOfRes(id)?.[1] ?? 1)); if (kept) K.cargo[id] = kept; else delete K.cargo[id]; done.push(`продали ${RESOURCES.get(id).label} (${n}) за ${gold(p)} зол.`); }
      else if (p > can && !unsold.includes(id)) unsold.push(id);
    }
    K.gold = gold(K.gold + got);
  };
  sell(id => ore.has(id));   // the ore for the smith kept (and the potions with a few of their makings: potionKeep)
  // the spoils of the fights (campaign/fight.js): sold at their worth, as a town buys
  if (K.spoils?.length && K.spoils.reduce((v, id) => v + gearValue(id), 0) * STANDING[st].sell * MARKET.spoils * T.sell > Math.min(P.left, townPurse(t))) unsold.push('spoils');
  else if (K.spoils?.length) { const p = fromTown(t, K.spoils.reduce((v, id) => v + gearValue(id), 0) * STANDING[st].sell * MARKET.spoils * T.sell); K.gold = gold(K.gold + p); P.left -= p; done.push(`продали трофеи (${K.spoils.length}) за ${gold(p)} зол.`); K.spoils = []; }
  if (smith) { done.push(...smithy(a, K, t, st)); sell(() => false); }
  if (has(t, ALCHEMY.at)) done.push(...alchemy(a, K, t, st));
  if (unsold.length) done.push(`город не потянул: ${unsold.map(id => (id === 'spoils' ? 'трофеи' : RESOURCES.get(id).label)).join(', ')} — нет денег`);
  if (!K.inTown) done.push(...tradeCaptives(a, K, t, st));   // captives sold and bought, by the town's law, once a visit: on entering (campaign/slavery.js)
  // food: up to `foodDays` days, as far as the room and the gold go
  const need = alive(K).length * CAMPAIGN.ration, price = rationPrice(t, st, T.buy);
  const room = Math.max(0, capacity(K) - load(K)), want = Math.max(0, Math.min(room, need * WANTS.foodDays - K.food));
  const n = Math.floor(Math.min(want, K.gold / price));
  if (n > 0) { K.food += n; K.gold = gold(K.gold - toTown(t, n * price)); done.push(`купили ${pieces(n, 'паёк', 'пайка', 'пайков')} по ${gold(price)}`); }
  const alms = Math.floor(Math.min(Math.max(0, capacity(K) - load(K)), need * WANTS.alms - K.food));
  if (K.hungry > 0 && alms > 0) { K.food += alms; K.stats.alms = (K.stats.alms || 0) + 1; done.push(`голодных накормили даром — ${pieces(alms, 'паёк', 'пайка', 'пайков')} на дорогу`); }
  // the rest, in order of need
  for (const o of wants(a, K, t, st)) {
    const p = offerPrice(o, st, t) * T.buy;
    if (M.maxPrice != null && p > M.maxPrice) continue;   // too dear for a market of this step
    if (o.kind === 'beast' && !BEASTS[o.id].golem && t.stock && (t.stock.beasts || 0) < 1) continue;   // the town's pens and stables have none to sell (atlas/treasury.js)
    if (K.gold - p < reserveFor(K, t, st, WANTS.reserve, a)) continue;
    // still wanted after what was bought before it in this visit
    if (o.kind === 'building' && hasBuilding(K, o.id)) continue;
    if (o.kind === 'vehicle' && (o.id === 'cart' ? K.vehicles.length : K.vehicles.some(x => x.kind === 'wagon'))) continue;
    if (o.kind === 'beast' && BEASTS[o.id].golem && golems(K) >= CARAVAN_GOLEMS.max) continue;
    if (o.kind === 'beast' && BEASTS[o.id].use === 'food' && herdOf(K) >= herdMax(K)) continue;
    if (o.kind === 'beast' && BEASTS[o.id].use === 'pack' && K.beasts.filter(b => b.kind === o.id && b.hp > 0).length >= 2) continue;
    if (o.kind === 'beast' && BEASTS[o.id].use === 'ride' && K.beasts.filter(b => BEASTS[b.kind].use === 'ride' && b.hp > 0).length >= free(K).length) continue;
    if (o.kind === 'goods' && o.need === 'bonds' && bondsSets(K) >= CAPTIVE.campaign.keep) continue;
    if (o.kind === 'goods' && o.need === 'heal' && potionRoom(K) <= 0) continue;
    if (o.kind === 'goods' && o.need === 'belt' && kindRoom(K, potionOf(o.id).potion, o.id) <= 0) continue;
    if (o.kind === 'goods' && o.need === 'home' && homeRoom(K, potionOf(o.id).potion) <= 0) continue;
    if (o.kind === 'goods' && o.need === 'pots' && (K.cargo.pots || 0) >= ALCHEMY.pots) continue;
    K.gold = gold(K.gold - toTown(t, p)); outOfStore(t, offerGood(o), o.kind === 'goods' ? o.n * (goodOfRes(o.id)?.[1] ?? 1) : 1);   // into the town's treasury, out of its store
    if (o.kind === 'beast') {
      K.beasts.push({id: K.nextBeast++, kind: o.id, hp: 1, job: null, rider: null}); done.push(`${BEASTS[o.id].acc} за ${gold(p)}`);
      // the town spends what it chose: one of its guard golems goes with the caravan (atlas/golems.js)
      if (o.metal && t.golems?.guard?.includes(o.metal)) t.golems.guard.splice(t.golems.guard.indexOf(o.metal), 1);
    }
    else if (o.kind === 'vehicle') { K.vehicles.push({kind: o.id, pulled: false}); done.push(`${o.id === 'cart' ? 'тележку' : 'повозку'} за ${gold(p)}`); }
    else if (o.kind === 'goods') { K.cargo[o.id] = (K.cargo[o.id] || 0) + o.n; if (isPotion(o.id)) topUp(K); done.push(`${isPotion(o.id) ? RESOURCES.get(o.id).label : `${RESOURCES.get(o.id).label} (${o.n})`} за ${gold(p)}`); }
    else if (o.kind === 'building') { campOf(K).push(o.id); done.push(`«${BUILDINGS.get(o.id).name}» для лагеря за ${gold(p)}`); }
    else { const m = equip(K, o.id); done.push(`${gearDef(o.id).label.toLowerCase()} для ${m.name} за ${gold(p)}`); }
    assign(K); K.path = null;
  }
  return done;
}

// a day of work in town: those with a tool work for hire, the other fighters guard
export function labour(K, t = null) {
  const L = MARKET.labour, tier = toolTier(K);
  let g = 0;
  for (const m of alive(K)) {
    if (!m.captive && toolOf(m, gearDef)) g += L.squire * (1 + L.perTier * tier);
    else if (isFighter(m)) g += L.knight;
    else g += L.other;
  }
  if (t) g = fromTown(t, g);   // the town pays the wages from its treasury: a poor town has little work
  K.gold = gold(K.gold + g);
  return g;
}
export const healHere = t => (has(t, MARKET.healers) ? MARKET.heal.healer : MARKET.heal.base);

// ── people: hirelings for a term, companions who want to go along
const hireAt = (t, H) => has(t, H.at) || t.tier >= H.tier;
export function hire(a, K, t, st, r) {
  const said = [];   // captives take no place in the company (campaign/company.js)
  for (const [id, H] of Object.entries(HIRES)) {
    if (typeof H !== 'object' || !H.wage) continue;
    if (!room(K, `hire:${id}`) || !hireAt(t, H)) continue;
    const days = Math.round(H.days[0] + r() * (H.days[1] - H.days[0])), cost = gold(H.wage * days * STANDING[st].buy);
    if (K.gold - cost < reserveFor(K, t, st, HIRES.reserve, a)) continue;
    K.gold = gold(K.gold - toTown(t, cost));
    const m = makeMember(K, r, {race: WORLD_PEOPLES.get(t.people).race, role: id, gear: H.gear, contract: {until: K.day + days, wage: H.wage}, align: t.realm ? realmAlign(a, t.realm) : null});
    K.members.push(m); welcome(K, m);   // (one of the company takes the newcomer in: campaign/social.js)
    said.push(`наняли ${H.label}а ${m.name} на ${pieces(days, 'день', 'дня', 'дней')} за ${cost} зол.`);
  }
  return said;
}

// who wants to go along from here: one at most a visit; for a fee, or for nothing to a good talker
export function companion(a, K, t, st, r) {
  const C = COMPANIONS;
  if (!room(K, 'joined') || r() >= C.chance[st] * (t.built.includes('inn') ? C.inn : 1)) return null;
  const charm = Math.max(...free(K).map(m => m.special?.C ?? NORM)), gratis = charm >= C.freeAt;
  if (!gratis && K.gold - C.fee < reserveFor(K, t, st, WANTS.reserve, a)) return null;
  // of the town's people, or of a minor people living near (as their homes favour the land)
  const minor = r() < C.minor ? C.minorRaces[(r() * C.minorRaces.length) | 0] : null;
  const race = minor || WORLD_PEOPLES.get(t.people).race;
  if (!gratis) K.gold = gold(K.gold - toTown(t, C.fee));
  const m = makeMember(K, r, {race, role: 'companion', gear: C.gear, loyalty: C.loyalty, align: !minor && t.realm ? realmAlign(a, t.realm) : null});
  K.members.push(m); welcome(K, m);
  const sp = SPECIES.get(race);
  return `к каравану ${gratis ? 'по доброй воле' : `за ${C.fee} зол.`} пристал${m.gender === 'f' ? 'а' : ''} ${m.name}${minor ? ` из народа ${sp.gen || sp.plural}` : ''}`;
}

// in the accusative: «вошёл в деревню X (свои, …)»
export const townLine = (a, t, st) => `${townLabel(t, 1)} ${t.name} (${STANDING[st].label}${t.realm ? `, ${realmLabel(a, t.realm)}` : ''})`;
