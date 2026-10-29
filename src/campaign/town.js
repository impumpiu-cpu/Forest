// Towns on the caravan's way (data/market.js): a friendly town is a standing trader — it buys the
// caravan's goods and sells food, beasts, vehicles, iron, arms and armour, packed buildings, as far as
// what it has built allows; there the caravan works for gold when it has none, heals faster, hires a
// guide or a sellsword, and meets those who would go along. In winter it may stay till spring.
import {townFx, townLabel, realmWorks} from '../atlas/towns.js';
import {gearDef, gearType, gearValue, gearToken} from '../agents/equipment.js';
import {MARK, markOfPeople, markable} from '../data/balance/marks.js';
import {trades, atWar, realmAlign} from '../atlas/diplomacy.js';
import {realmLabel} from '../atlas/realms.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {RESOURCES} from '../data/resources.js';
import {BUILDINGS} from '../data/buildings.js';
import {NORM} from '../data/special.js';
import {BEASTS} from '../data/transport.js';
import {STANDING, MARKET, OFFERS, WANTS, HIRES, COMPANIONS, SMITH, ALCHEMY} from '../data/market.js';
import {marketTierOf} from '../data/kingdom.js';
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
import {free, bondsSets, isBonds} from './captives.js';
import {tradeCaptives} from './slavery.js';
import {CAPTIVE} from '../data/captives.js';
import {KIND_GROVES, WOODS, useOf, mayWield} from '../data/kinds.js';
import {MATERIALS} from '../data/balance/materials.js';
import {takeStock} from '../atlas/economy.js';

// the good of a town's stock a piece of gear is counted in (data/townBuildings.js: tools, arms and armour by worth)
const gearGood = id => { const d = gearDef(id); return !d ? null : d.slot === 'body' ? 'armor' : d.melee || d.ranged || d.block ? 'arms' : 'tools'; };
// whether the town could have made a piece: its metal is made in its realm now or lies in a stock of the realm (a town that
// has gathered the worth of arms on copper does not sell a mithril blade). A town that has not counted its household: yes
const METAL_GOOD = {bronze: 'bronze', iron: 'iron', steel: 'steel', silver: 'silver', mithril: 'mithril'};
function canMake(a, t, id) {
  const g = METAL_GOOD[gearDef(id)?.material];
  if (!g || !t.econ) return true;
  const realm = (a?.towns || [t]).filter(o => o.alive && o.econ && (o === t || (t.realm != null && o.realm === t.realm)));
  return realm.some(o => o.econ.made?.includes(g) || (o.econ.stock[g] || 0) > 0);
}

const alive = K => K.members.filter(m => m.alive);
const has = (t, ids) => ids.some(id => t.built.includes(id));
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
export function rationPrice(t, st, terms = 1) {
  const F = MARKET.food, fx = townFx(t);
  return MARKET.ration * Math.max(F.floor, F.base - F.feeds * (fx.food || 0)) * STANDING[st].buy * terms;
}
const sellPrice = (t, st, id) => {
  const v = RESOURCES.has(id) ? RESOURCES.get(id).value ?? 0 : 0;
  let k = STANDING[st].sell;
  for (const [b, bonus] of Object.entries(MARKET.sellBonus)) if (t.built.includes(b)) k *= bonus[id] ?? bonus.all ?? 1;
  return v * k;
};
const offerPrice = (o, st) => (o.price ?? (o.kind === 'goods' ? RESOURCES.get(o.id).value * o.n : gearDef(o.id) ? gearValue(o.id) : 10)) * STANDING[st].buy;
// what a town sells; its arms and armour are its smiths' work: they bear the mark of its people (data/balance/marks.js)
// (with the world `a`: only the metals its realm works — a building that opens them stands in one of its towns,
// data/townBuildings.js `metals`)
// (nor a form its people will not touch: no crossbow in an elven town — data/kinds.js RACE_FORMS)
export const offers = (t, a = null) => OFFERS.filter(o => (o.any || has(t, o.at)) && (!o.also || has(t, o.also)) && (!a || o.kind !== 'item' || realmWorks(a, t, gearDef(o.id)?.material)) && (o.kind !== 'item' || mayWield(WORLD_PEOPLES.has(t.people) ? WORLD_PEOPLES.get(t.people).race : null, gearDef(o.id)?.form))).map(o => townMade(o, t));
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
const reserveFor = (K, t, st, days, a = null) => days * alive(K).length * CAMPAIGN.ration * rationPrice(t, st, a ? termsOf(a, K, t).buy : 1);

// ── buying: what the caravan wants, in order, while the gold lasts beyond the food reserve
function wants(a, K, t, st) {
  const out = [], ms = alive(K), tier = toolTier(K);
  // wheels are worth their price only when they can go the way to the goal (as the council asks, campaign/march.js)
  let fits = null;
  const wheelsFit = () => { if (fits == null) { const foot = route(a, K.i, K.goal, K.people, false), road = route(a, K.i, K.goal, K.people, true); fits = !!(road && foot && road.cost <= ROUTE.keep * foot.cost); } return fits; };
  const count = kind => K.beasts.filter(b => b.kind === kind && b.hp > 0).length;
  const riders = K.beasts.filter(b => BEASTS[b.kind].use === 'ride' && b.hp > 0).length;
  for (const o of offers(t, a)) {
    if (o.kind === 'beast' && BEASTS[o.id].use === 'pack' && count(o.id) < 2) out.push([3, o]);
    if (o.kind === 'beast' && BEASTS[o.id].use === 'ride' && riders < free(K).length) out.push([5, o]);
    if (o.kind === 'goods' && o.need === 'bonds' && bondsSets(K) < CAPTIVE.campaign.keep) out.push([9, o]);   // bonds for captives, last
    if (o.kind === 'goods' && o.need === 'pots' && (K.cargo.pots || 0) < ALCHEMY.pots && hasBuilding(K, 'healerhut')) out.push([3, o]);   // pots for the camp's healer's hut: cheap, and every potion takes one
    if (o.kind === 'goods' && o.need === 'belt') for (let k = 0; k < kindRoom(K, potionOf(o.id).potion, o.id); k++) out.push([8, o]);   // as many as would be worn of its kind   // potions for the belts (data/market.js: the strong first)
    if (o.kind === 'goods' && o.need === 'home') for (let k = 0; k < homeRoom(K, potionOf(o.id).potion); k++) out.push([8, o]);   // the brews of the cargo (after the belts: the market lists them later)
    if (o.kind === 'vehicle' && o.id === 'cart' && !K.vehicles.length && K.goal != null && wheelsFit()) out.push([4, o]);
    if (o.kind === 'vehicle' && o.id === 'wagon' && !K.vehicles.some(v => v.kind === 'wagon') && K.beasts.some(b => BEASTS[b.kind].pulls >= 1) && K.goal != null && wheelsFit()) out.push([6, o]);
    if (o.kind === 'item' && gearDef(o.id).tool && tier < 2 && gearDef(o.id).iron) out.push([2, o]);
    if (o.kind === 'item' && gearDef(o.id).slot === 'body' && ms.some(m => m.role === 'knight' && (gearDef(m.gear.body)?.armor ?? 0) < gearDef(o.id).armor)) out.push([7, o]);
    if (o.kind === 'item' && gearDef(o.id).melee && !gearDef(o.id).tool && ms.some(m => m.role === 'knight' && bestDmg(m) < gearDef(o.id).melee.dmg)) out.push([8, o]);
    if (o.kind === 'building' && !hasBuilding(K, o.id)) out.push([6.5, o]);
    // healing potions for the empty slots, after the arms and armour (campaign/potions.js)
    if (o.kind === 'goods' && o.need === 'heal') for (let k = 0; k < Math.min(POTION.slot, potionRoom(K)); k++) out.push([8, o]);
  }
  return out.sort((p, q) => p[0] - q[0]).map(e => e[1]);
}
const bestDmg = m => Math.max(0, ...m.gear.hand.map(id => gearDef(id)?.melee?.dmg ?? 0));

// a bought item goes to who gains most by it: armour and arms to the knights, a tool to a squire
function equip(K, id) {
  const d = gearDef(id), ms = free(K).filter(m => !m.former);   // no arms for a former slave
  if (d.slot === 'body') {
    const m = ms.filter(x => x.role === 'knight' || x.role === 'sellsword').sort((p, q) => (gearDef(p.gear.body)?.armor ?? 0) - (gearDef(q.gear.body)?.armor ?? 0))[0] || ms[0];
    m.gear.body = id; return m;
  }
  if (d.tool) { const m = ms.find(x => x.role === 'squire') || ms[0]; m.gear.hand[0] = id; return m; }
  const m = ms.filter(x => x.role === 'knight').sort((p, q) => bestDmg(p) - bestDmg(q))[0] || ms[0];
  const k = m.gear.hand.findIndex(x => gearDef(x)?.melee && !gearDef(x)?.ranged && gearType(x) !== 'shield');
  if (k >= 0) m.gear.hand[k] = id; else m.gear.hand[0] = id;
  return m;
}

// a town's laboratory brews the strong potions from the caravan's makings (data/market.js ALCHEMY): the price of its work
// is the potion's × ALCHEMY.fee, the makings and a pot go into it, while there is room for it (the belts, the brews' own). → the lines
function alchemy(a, K, t, st) {
  const done = [];
  for (const p of POTIONS.all()) for (const g of p.grades.filter(x => x.at === 'alchemist')) {   // the strong grades, and what only an alchemist brews
    while (roomFor(K, p, g.res) > 0 && Object.entries(g.cost).every(([r, n]) => (K.cargo[r] || 0) >= n)) {
      const price = gold(RESOURCES.get(g.res).value * ALCHEMY.fee * STANDING[st].buy);
      if (K.gold - price < reserveFor(K, t, st, ALCHEMY.reserve)) break;
      for (const [r, n] of Object.entries(g.cost)) { K.cargo[r] -= n; if (K.cargo[r] <= 0) delete K.cargo[r]; }
      K.cargo[g.res] = (K.cargo[g.res] || 0) + 1; K.gold = gold(K.gold - price); K.stats.alchemy = (K.stats.alchemy || 0) + 1;
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
  const anvil = {...t, built: [...new Set([...t.built, ...OFFERS.filter(o => o.kind === 'item').flatMap(o => o.at)])]};
  for (const o of wants(a, K, anvil, st)) {
    if (o.kind !== 'item') continue;
    const type = gearType(o.id), d = gearDef(o.id), B = SMITH.bar[d.material], R = RECIPES.all().find(r => r.makes?.item === type && !r.makes.silver);
    if (!B || !R?.cost?.[d.material] || !realmWorks(a, t, d.material)) continue;   // a smith works only the metals his realm works
    const need = R.cost[d.material] * B.n;
    if ((K.cargo[B.ore] || 0) < need) continue;
    // forged here: the town's quality and its people's mark (a human town: quality alone)
    const made = townMade({kind: 'item', id: type}, t, forgeQ(t)).id;
    // the price is that of the town's plain piece: the better work of its forge is what draws the caravan to it
    const p = gold(offerPrice(o, st) * SMITH.discount);
    if (K.gold - p < reserveFor(K, t, st, SMITH.reserve)) continue;
    // still wanted after what the smith made before it
    if (!wants(a, K, anvil, st).some(x => x.kind === 'item' && x.id === o.id)) continue;
    K.cargo[B.ore] -= need; if (K.cargo[B.ore] <= 0) delete K.cargo[B.ore];
    K.gold = gold(K.gold - p); K.stats.forged = (K.stats.forged || 0) + 1;
    const m = equip(K, made);
    done.push(`кузнец перековал руду каравана (${RESOURCES.get(B.ore).label}, ${need}) в ${gearDef(made).label.toLowerCase()} для ${m.name} — всего за ${p} зол.`);
    assign(K);
  }
  return done;
}

// a visit's trade: the smith forges from the ore, sell the goods, buy food up to the stock wanted, then what is
// wanted while the gold lasts
export function trade(a, K, t, st) {
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
      const p = sellPrice(t, st, id) * n * T.sell;
      if (p > 0 && p <= P.left) { got += p; P.left -= p; if (kept) K.cargo[id] = kept; else delete K.cargo[id]; done.push(`продали ${RESOURCES.get(id).label} (${n}) за ${gold(p)} зол.`); }
      else if (p > P.left && !unsold.includes(id)) unsold.push(id);
    }
    K.gold = gold(K.gold + got);
  };
  sell(id => ore.has(id));   // the ore for the smith kept (and the potions with a few of their makings: potionKeep)
  // the spoils of the fights (campaign/fight.js): sold at their worth, as a town buys
  if (K.spoils?.length && K.spoils.reduce((v, id) => v + gearValue(id), 0) * STANDING[st].sell * MARKET.spoils * T.sell > P.left) unsold.push('spoils');
  else if (K.spoils?.length) {
    const p = K.spoils.reduce((v, id) => v + gearValue(id), 0) * STANDING[st].sell * MARKET.spoils * T.sell; K.gold = gold(K.gold + p); P.left -= p; done.push(`продали трофеи (${K.spoils.length}) за ${gold(p)} зол.`);
    // the pieces go into the town's stock of arms, tools and armour by their worth (atlas/economy.js)
    if (t.econ) for (const id of K.spoils) { const g = gearGood(id); if (g) t.econ.stock[g] = (t.econ.stock[g] || 0) + gearValue(id); }
    K.spoils = [];
  }
  if (smith) { done.push(...smithy(a, K, t, st)); sell(() => false); }
  if (has(t, ALCHEMY.at)) done.push(...alchemy(a, K, t, st));
  if (unsold.length) done.push(`город не потянул: ${unsold.map(id => (id === 'spoils' ? 'трофеи' : RESOURCES.get(id).label)).join(', ')} — нет денег`);
  if (!K.inTown) done.push(...tradeCaptives(a, K, t, st));   // captives sold and bought, by the town's law, once a visit: on entering (campaign/slavery.js)
  // food: up to `foodDays` days, as far as the room and the gold go
  const need = alive(K).length * CAMPAIGN.ration, price = rationPrice(t, st, T.buy);
  const room = Math.max(0, capacity(K) - load(K)), want = Math.max(0, Math.min(room, need * WANTS.foodDays - K.food));
  const n = Math.floor(Math.min(want, K.gold / price));
  if (n > 0) { K.food += n; K.gold = gold(K.gold - n * price); done.push(`купили ${pieces(n, 'паёк', 'пайка', 'пайков')} по ${gold(price)}`); }
  const alms = Math.floor(Math.min(Math.max(0, capacity(K) - load(K)), need * WANTS.alms - K.food));
  if (K.hungry > 0 && alms > 0) { K.food += alms; K.stats.alms = (K.stats.alms || 0) + 1; done.push(`голодных накормили даром — ${pieces(alms, 'паёк', 'пайка', 'пайков')} на дорогу`); }
  // the rest, in order of need
  for (const o of wants(a, K, t, st)) {
    const p = offerPrice(o, st) * T.buy;
    if (M.maxPrice != null && p > M.maxPrice) continue;   // too dear for a market of this step
    if (K.gold - p < reserveFor(K, t, st, WANTS.reserve, a)) continue;
    // still wanted after what was bought before it in this visit
    if (o.kind === 'building' && hasBuilding(K, o.id)) continue;
    if (o.kind === 'vehicle' && (o.id === 'cart' ? K.vehicles.length : K.vehicles.some(x => x.kind === 'wagon'))) continue;
    if (o.kind === 'beast' && BEASTS[o.id].use === 'pack' && K.beasts.filter(b => b.kind === o.id && b.hp > 0).length >= 2) continue;
    if (o.kind === 'beast' && BEASTS[o.id].use === 'ride' && K.beasts.filter(b => BEASTS[b.kind].use === 'ride' && b.hp > 0).length >= free(K).length) continue;
    if (o.kind === 'goods' && o.need === 'bonds' && bondsSets(K) >= CAPTIVE.campaign.keep) continue;
    if (o.kind === 'goods' && o.need === 'heal' && potionRoom(K) <= 0) continue;
    if (o.kind === 'goods' && o.need === 'belt' && kindRoom(K, potionOf(o.id).potion, o.id) <= 0) continue;
    if (o.kind === 'goods' && o.need === 'home' && homeRoom(K, potionOf(o.id).potion) <= 0) continue;
    if (o.kind === 'goods' && o.need === 'pots' && (K.cargo.pots || 0) >= ALCHEMY.pots) continue;
    // a piece of gear only if the town could have made it (its metal is made or held in the realm) and its stock holds its
    // worth of arms, tools or armour: the stock pays it out
    if (!['beast', 'vehicle', 'goods', 'building'].includes(o.kind) && gearGood(o.id) && (!canMake(a, t, o.id) || !takeStock(t, gearGood(o.id), gearValue(o.id)))) continue;
    K.gold = gold(K.gold - p);
    if (o.kind === 'beast') { K.beasts.push({id: K.nextBeast++, kind: o.id, hp: 1, job: null, rider: null}); done.push(`${BEASTS[o.id].acc} за ${gold(p)}`); }
    else if (o.kind === 'vehicle') { K.vehicles.push({kind: o.id, pulled: false}); done.push(`${o.id === 'cart' ? 'тележку' : 'повозку'} за ${gold(p)}`); }
    else if (o.kind === 'goods') { K.cargo[o.id] = (K.cargo[o.id] || 0) + o.n; if (isPotion(o.id)) topUp(K); done.push(`${isPotion(o.id) ? RESOURCES.get(o.id).label : `${RESOURCES.get(o.id).label} (${o.n})`} за ${gold(p)}`); }
    else if (o.kind === 'building') { campOf(K).push(o.id); done.push(`«${BUILDINGS.get(o.id).name}» для лагеря за ${gold(p)}`); }
    else { const m = equip(K, o.id); done.push(`${gearDef(o.id).label.toLowerCase()} для ${m.name} за ${gold(p)}`); }
    assign(K); K.path = null;
  }
  return done;
}

// a day of work in town: those with a tool work for hire, the knights guard
export function labour(K) {
  const L = MARKET.labour, tier = toolTier(K);
  let g = 0;
  for (const m of alive(K)) {
    if (m.role === 'squire' && m.gear.hand.some(id => gearDef(id)?.tool)) g += L.squire * (1 + L.perTier * tier);
    else if (m.role === 'knight') g += L.knight;
    else g += L.other;
  }
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
    if (K.gold - cost < reserveFor(K, t, st, HIRES.reserve)) continue;
    K.gold = gold(K.gold - cost);
    const m = makeMember(K, r, {race: WORLD_PEOPLES.get(t.people).race, role: id, gear: H.gear, contract: {until: K.day + days, wage: H.wage}, align: t.realm ? realmAlign(a, t.realm) : null});
    K.members.push(m);
    said.push(`наняли ${H.label}а ${m.name} на ${pieces(days, 'день', 'дня', 'дней')} за ${cost} зол.`);
  }
  return said;
}

// who wants to go along from here: one at most a visit; for a fee, or for nothing to a good talker
export function companion(a, K, t, st, r) {
  const C = COMPANIONS;
  if (!room(K, 'joined') || r() >= C.chance[st] * (t.built.includes('inn') ? C.inn : 1)) return null;
  const charm = Math.max(...free(K).map(m => m.special?.C ?? NORM)), gratis = charm >= C.freeAt;
  if (!gratis && K.gold - C.fee < reserveFor(K, t, st, WANTS.reserve)) return null;
  // of the town's people, or of a minor people living near (as their homes favour the land)
  const minor = r() < C.minor ? C.minorRaces[(r() * C.minorRaces.length) | 0] : null;
  const race = minor || WORLD_PEOPLES.get(t.people).race;
  if (!gratis) K.gold = gold(K.gold - C.fee);
  const m = makeMember(K, r, {race, role: 'companion', gear: C.gear, loyalty: C.loyalty, align: !minor && t.realm ? realmAlign(a, t.realm) : null});
  K.members.push(m);
  const sp = SPECIES.get(race);
  return `к каравану ${gratis ? 'по доброй воле' : `за ${C.fee} зол.`} пристал${m.gender === 'f' ? 'а' : ''} ${m.name}${minor ? ` из народа ${sp.gen || sp.plural}` : ''}`;
}

// in the accusative: «вошёл в деревню X (свои, …)»
export const townLine = (a, t, st) => `${townLabel(t, 1)} ${t.name} (${STANDING[st].label}${t.realm ? `, ${realmLabel(a, t.realm)}` : ''})`;
