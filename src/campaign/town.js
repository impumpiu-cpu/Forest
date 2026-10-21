// Towns on the caravan's way (data/market.js): a friendly town is a standing trader — it buys the
// caravan's goods and sells food, beasts, vehicles, iron, arms and armour, packed buildings, as far as
// what it has built allows; there the caravan works for gold when it has none, heals faster, hires a
// guide or a sellsword, and meets those who would go along. In winter it may stay till spring.
import {townFx, townLabel} from '../atlas/towns.js';
import {trades, atWar} from '../atlas/diplomacy.js';
import {realmLabel} from '../atlas/realms.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {ITEMS} from '../data/items.js';
import {RESOURCES} from '../data/resources.js';
import {BUILDINGS} from '../data/buildings.js';
import {NORM} from '../data/special.js';
import {BEASTS, VEHICLES} from '../data/transport.js';
import {STANDING, MARKET, OFFERS, WANTS, HIRES, COMPANIONS, COMPANY_MAX, JOINED_MAX} from '../data/market.js';
import {CAMPAIGN} from '../data/campaign.js';
import {plural} from '../core/util.js';
import {capacity, load, assign, toolTier} from './baggage.js';
import {route} from './path.js';
import {ROUTE} from '../data/transport.js';
import {makeMember} from './start.js';
import {free, bondsSets, isBonds} from './captives.js';
import {tradeCaptives} from './slavery.js';
import {CAPTIVE} from '../data/captives.js';

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
export function rationPrice(t, st) {
  const F = MARKET.food, fx = townFx(t);
  return MARKET.ration * Math.max(F.floor, F.base - F.feeds * (fx.food || 0)) * STANDING[st].buy;
}
const sellPrice = (t, st, id) => {
  const v = RESOURCES.has(id) ? RESOURCES.get(id).value ?? 0 : 0;
  let k = STANDING[st].sell;
  for (const [b, bonus] of Object.entries(MARKET.sellBonus)) if (t.built.includes(b)) k *= bonus[id] ?? bonus.all ?? 1;
  return v * k;
};
const offerPrice = (o, st) => (o.price ?? (o.kind === 'goods' ? RESOURCES.get(o.id).value * o.n : ITEMS.has(o.id) ? ITEMS.get(o.id).value : 10)) * STANDING[st].buy;
export const offers = t => OFFERS.filter(o => (o.any || has(t, o.at)) && (!o.also || has(t, o.also)));

// the gold kept for food: `days` of rations for everyone, at this town's price
const reserveFor = (K, t, st, days) => days * alive(K).length * CAMPAIGN.ration * rationPrice(t, st);

// ── buying: what the caravan wants, in order, while the gold lasts beyond the food reserve
function wants(a, K, t, st) {
  const out = [], ms = alive(K), tier = toolTier(K);
  // wheels are worth their price only when they can go the way to the goal (as the council asks, campaign/march.js)
  let fits = null;
  const wheelsFit = () => { if (fits == null) { const foot = route(a, K.i, K.goal, K.people, false), road = route(a, K.i, K.goal, K.people, true); fits = !!(road && foot && road.cost <= ROUTE.keep * foot.cost); } return fits; };
  const count = kind => K.beasts.filter(b => b.kind === kind && b.hp > 0).length;
  const riders = K.beasts.filter(b => BEASTS[b.kind].use === 'ride' && b.hp > 0).length;
  for (const o of offers(t)) {
    if (o.kind === 'beast' && BEASTS[o.id].use === 'pack' && count(o.id) < 2) out.push([3, o]);
    if (o.kind === 'beast' && BEASTS[o.id].use === 'ride' && riders < free(K).length) out.push([5, o]);
    if (o.kind === 'goods' && bondsSets(K) < CAPTIVE.campaign.keep) out.push([9, o]);   // bonds for captives, last
    if (o.kind === 'vehicle' && o.id === 'cart' && !K.vehicles.length && K.goal != null && wheelsFit()) out.push([4, o]);
    if (o.kind === 'vehicle' && o.id === 'wagon' && !K.vehicles.some(v => v.kind === 'wagon') && K.beasts.some(b => BEASTS[b.kind].pulls >= 1) && K.goal != null && wheelsFit()) out.push([6, o]);
    if (o.kind === 'item' && ITEMS.get(o.id).tool && tier < 2 && ITEMS.get(o.id).iron) out.push([2, o]);
    if (o.kind === 'item' && ITEMS.get(o.id).slot === 'body' && ms.some(m => m.role === 'knight' && (ITEMS.get(m.gear.body)?.armor ?? 0) < ITEMS.get(o.id).armor)) out.push([7, o]);
    if (o.kind === 'item' && ITEMS.get(o.id).melee && !ITEMS.get(o.id).tool && ms.some(m => m.role === 'knight' && bestDmg(m) < ITEMS.get(o.id).melee.dmg)) out.push([8, o]);
    if (o.kind === 'building' && K.vehicles.some(v => v.kind === 'wagon' && !v.building)) out.push([6.5, o]);
  }
  return out.sort((p, q) => p[0] - q[0]).map(e => e[1]);
}
const bestDmg = m => Math.max(0, ...m.gear.hand.map(id => ITEMS.get(id)?.melee?.dmg ?? 0));

// a bought item goes to who gains most by it: armour and arms to the knights, a tool to a squire
function equip(K, id) {
  const d = ITEMS.get(id), ms = free(K).filter(m => !m.former);   // no arms for a former slave
  if (d.slot === 'body') {
    const m = ms.filter(x => x.role === 'knight' || x.role === 'sellsword').sort((p, q) => (ITEMS.get(p.gear.body)?.armor ?? 0) - (ITEMS.get(q.gear.body)?.armor ?? 0))[0] || ms[0];
    m.gear.body = id; return m;
  }
  if (d.tool) { const m = ms.find(x => x.role === 'squire') || ms[0]; m.gear.hand[0] = id; return m; }
  const m = ms.filter(x => x.role === 'knight').sort((p, q) => bestDmg(p) - bestDmg(q))[0] || ms[0];
  const k = m.gear.hand.findIndex(x => ITEMS.get(x)?.melee && !ITEMS.get(x)?.ranged && x !== 'shield');
  if (k >= 0) m.gear.hand[k] = id; else m.gear.hand[0] = id;
  return m;
}

// a visit's trade: sell the goods, buy food up to the stock wanted, then what is wanted while the gold lasts
export function trade(a, K, t, st) {
  const done = [];
  let got = 0;
  for (const [id, n] of Object.entries(K.cargo)) { if (isBonds(id)) continue;   // bonds are kept for captives
    const p = sellPrice(t, st, id) * n; if (p > 0) { got += p; delete K.cargo[id]; done.push(`продали ${RESOURCES.get(id).label} (${n}) за ${gold(p)} зол.`); } }
  // the spoils of the fights (campaign/fight.js): sold at their worth, as a town buys
  if (K.spoils?.length) { const p = K.spoils.reduce((v, id) => v + (ITEMS.get(id)?.value ?? 0), 0) * STANDING[st].sell * MARKET.spoils; got += p; done.push(`продали трофеи (${K.spoils.length}) за ${gold(p)} зол.`); K.spoils = []; }
  K.gold = gold(K.gold + got);
  done.push(...tradeCaptives(a, K, t, st));   // captives sold and bought, by the town's law (campaign/slavery.js)
  // food: up to `foodDays` days, as far as the room and the gold go
  const need = alive(K).length * CAMPAIGN.ration, price = rationPrice(t, st);
  const room = Math.max(0, capacity(K) - load(K)), want = Math.max(0, Math.min(room, need * WANTS.foodDays - K.food));
  const n = Math.floor(Math.min(want, K.gold / price));
  if (n > 0) { K.food += n; K.gold = gold(K.gold - n * price); done.push(`купили ${pieces(n, 'паёк', 'пайка', 'пайков')} по ${gold(price)}`); }
  // the rest, in order of need
  for (const o of wants(a, K, t, st)) {
    const p = offerPrice(o, st);
    if (K.gold - p < reserveFor(K, t, st, WANTS.reserve)) continue;
    // still wanted after what was bought before it in this visit
    if (o.kind === 'building' && !K.vehicles.some(x => x.kind === 'wagon' && !x.building)) continue;
    if (o.kind === 'vehicle' && (o.id === 'cart' ? K.vehicles.length : K.vehicles.some(x => x.kind === 'wagon'))) continue;
    if (o.kind === 'beast' && BEASTS[o.id].use === 'pack' && K.beasts.filter(b => b.kind === o.id && b.hp > 0).length >= 2) continue;
    if (o.kind === 'beast' && BEASTS[o.id].use === 'ride' && K.beasts.filter(b => BEASTS[b.kind].use === 'ride' && b.hp > 0).length >= free(K).length) continue;
    if (o.kind === 'goods' && bondsSets(K) >= CAPTIVE.campaign.keep) continue;
    K.gold = gold(K.gold - p);
    if (o.kind === 'beast') { K.beasts.push({id: K.nextBeast++, kind: o.id, hp: 1, job: null, rider: null}); done.push(`${BEASTS[o.id].acc} за ${gold(p)}`); }
    else if (o.kind === 'vehicle') { K.vehicles.push({kind: o.id, building: null, pulled: false}); done.push(`${o.id === 'cart' ? 'тележку' : 'повозку'} за ${gold(p)}`); }
    else if (o.kind === 'goods') { K.cargo[o.id] = (K.cargo[o.id] || 0) + o.n; done.push(`${RESOURCES.get(o.id).label} (${o.n}) за ${gold(p)}`); }
    else if (o.kind === 'building') { const v = K.vehicles.find(x => x.kind === 'wagon' && !x.building); v.building = o.id; done.push(`разобранную «${BUILDINGS.get(o.id).name}» в повозку за ${gold(p)}`); }
    else { const m = equip(K, o.id); done.push(`${ITEMS.get(o.id).label.toLowerCase()} для ${m.name} за ${gold(p)}`); }
    assign(K); K.path = null;
  }
  return done;
}

// a day of work in town: those with a tool work for hire, the knights guard
export function labour(K) {
  const L = MARKET.labour, tier = toolTier(K);
  let g = 0;
  for (const m of alive(K)) {
    if (m.role === 'squire' && m.gear.hand.some(id => ITEMS.get(id)?.tool)) g += L.squire * (1 + L.perTier * tier);
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
  const said = [], ms = free(K);   // captives take no place in the company (campaign/captives.js)
  for (const [id, H] of Object.entries(HIRES)) {
    if (typeof H !== 'object' || !H.wage) continue;
    if (ms.length >= COMPANY_MAX || K.members.filter(m => m.alive && m.role === id).length >= HIRES.max || !hireAt(t, H)) continue;
    const days = Math.round(H.days[0] + r() * (H.days[1] - H.days[0])), cost = gold(H.wage * days * STANDING[st].buy);
    if (K.gold - cost < reserveFor(K, t, st, HIRES.reserve)) continue;
    K.gold = gold(K.gold - cost);
    const m = makeMember(K, r, {race: WORLD_PEOPLES.get(t.people).race, role: id, gear: H.gear, contract: {until: K.day + days, wage: H.wage}});
    K.members.push(m);
    said.push(`наняли ${H.label}а ${m.name} на ${pieces(days, 'день', 'дня', 'дней')} за ${cost} зол.`);
  }
  return said;
}

// who wants to go along from here: one at most a visit; for a fee, or for nothing to a good talker
export function companion(a, K, t, st, r) {
  const C = COMPANIONS;
  if (free(K).length >= COMPANY_MAX || free(K).filter(m => m.loyalty != null).length >= JOINED_MAX || r() >= C.chance[st] * (t.built.includes('inn') ? C.inn : 1)) return null;
  const charm = Math.max(...free(K).map(m => m.special?.C ?? NORM)), gratis = charm >= C.freeAt;
  if (!gratis && K.gold - C.fee < reserveFor(K, t, st, WANTS.reserve)) return null;
  // of the town's people, or of a minor people living near (as their homes favour the land)
  const minor = r() < C.minor ? C.minorRaces[(r() * C.minorRaces.length) | 0] : null;
  const race = minor || WORLD_PEOPLES.get(t.people).race;
  if (!gratis) K.gold = gold(K.gold - C.fee);
  const m = makeMember(K, r, {race, role: 'companion', gear: C.gear, loyalty: C.loyalty});
  K.members.push(m);
  const sp = SPECIES.get(race);
  return `к каравану ${gratis ? 'по доброй воле' : `за ${C.fee} зол.`} пристал${m.gender === 'f' ? 'а' : ''} ${m.name}${minor ? ` из народа ${sp.gen || sp.plural}` : ''}`;
}

// in the accusative: «вошёл в деревню X (свои, …)»
export const townLine = (a, t, st) => `${townLabel(t, 1)} ${t.name} (${STANDING[st].label}${t.realm ? `, ${realmLabel(a, t.realm)}` : ''})`;
