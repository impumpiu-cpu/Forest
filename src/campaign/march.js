// A day of the caravan, inside the world's day (atlas/history.js stepHistory → stepParties → onDay).
//   morning — after a quiet night: what was found while they packed up;
//   day     — the march along the way (as fast as the slowest who walks), or a camp: hunting, gathering,
//             healing, taming beasts, weaving baskets, building a cart, a wagon, a building for it;
//   meal    — they eat a ration each, as far as the food goes; hungry days slow them and wear them down;
//             the beasts graze, or starve where nothing grows;
//   evening — the council: the goal reached? camp — for food, for the wounded, to tame, to build? the way:
//             along the roads with the wheels, or straight on foot, leaving them;
//   night   — something may find the camp: the fight is settled at once (this stage: no local map).
// The campaign ends when the goal is reached and the caravan is home, or when all eight are dead.
import {scaleOf} from '../atlas/tectonics.js';
import {townAt} from '../atlas/peoples.js';
import {trades, atWar} from '../atlas/diplomacy.js';
import {realmLabel} from '../atlas/realms.js';
import {biomeAt} from '../atlas/biomes.js';
import {townLabel} from '../atlas/towns.js';
import {faunaLevel} from '../world/region.js';
import {SEASONS} from '../data/seasons.js';
import {ITEMS} from '../data/items.js';
import {BUILDINGS} from '../data/buildings.js';
import {NORM} from '../data/special.js';
import {CAMPAIGN, FOES, RETINUE} from '../data/campaign.js';
import {BEASTS, VEHICLES, GETTING, FODDER, ROUTE} from '../data/transport.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {plural} from '../core/util.js';
import {richness, seasonFood, dangers, nightRisk, pasture, cellRegion} from './land.js';
import {route, stepCost} from './path.js';
import {assign, capacity, cargoLoad, overflow, slowest, wheeled, campFx, toolTier, fieldBuildings, buildDays, handler} from './baggage.js';
import {draw, makeMember} from './start.js';
import {standing, townName, townLine, trade, labour, healHere, hire, companion, rationPrice} from './town.js';
import {HIRES, ROLES, LOYALTY, FREED, COMPANIONS, COMPANY_MAX, JOINED_MAX, VISIT, EARN, WANTS, MARKET} from '../data/market.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
const SPECIES_LABEL = race => SPECIES.get(race).label;

const SEASON_LIST = SEASONS.all();
const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const xyOf = (a, i) => [i % a.w, (i / a.w) | 0];
const pieces = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;

// the A* buffers for the world's own path search (atlas/roads.js findPath), kept beside the world, never saved
const SCRATCH = new WeakMap();
export const scratch = a => { let s = SCRATCH.get(a); if (!s) SCRATCH.set(a, s = {g: new Float64Array(a.n).fill(Infinity), came: new Int32Array(a.n), touched: []}); return s; };

export const alive = K => K.members.filter(m => m.alive);
// the eight who set out from the capital (saves from before the joiners: the knights and squires)
export const isCore = m => m.core ?? ['knight', 'squire'].includes(m.role);
export const core = K => K.members.filter(m => m.alive && isCore(m));
const guided = K => alive(K).some(m => m.role === 'guide');
export const ended = K => ['won', 'lost', 'timeout'].includes(K.phase);
export const rank = (K, m) => RETINUE[K.people][m.role]?.[0] || HIRES[m.role]?.label || ROLES[m.role] || 'спутник';

// a line of the campaign's log; `world` — also into the world's chronicle
export function say(a, K, text, kind = 'march', world = false) {
  const H = a.hist, line = {day: K.day, year: H.year, season: H.season, i: K.i, text, kind};
  K.log.push(line);
  if (world) a.chronicle.push({era: H.era, year: H.year, season: H.season, text, campaign: true});
}

// the fog lifts in a circle around a cell
export function reveal(a, K, i, r) {
  const [x0, y0] = xyOf(a, i), rr = Math.ceil(r);
  for (let y = Math.max(0, y0 - rr); y <= Math.min(a.h - 1, y0 + rr); y++) for (let x = Math.max(0, x0 - rr); x <= Math.min(a.w - 1, x0 + rr); x++)
    if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r) K.seen[y * a.w + x] = 1;
}

// ── the members
const itemDef = id => (ITEMS.has(id) ? ITEMS.get(id) : null);
export function memberMight(m) {
  const M = CAMPAIGN.might, s = m.special || {};
  const dmg = Math.max(0, ...m.gear.hand.map(id => itemDef(id)?.melee?.dmg ?? 0), itemDef(m.gear.hand.find(id => itemDef(id)?.ranged))?.ranged?.dmg ?? 0);
  const armor = itemDef(m.gear.body)?.armor ?? 0;
  return M[m.role] * (1 + M.perDmg * Math.max(0, dmg - 1)) * (1 + M.perArmor * armor) * (1 + M.perStr * ((s.S ?? NORM) - NORM)) * (0.3 + 0.7 * m.hp);
}
export const caravanMight = K => alive(K).reduce((s, m) => s + memberMight(m), 0);

// cells a day: as the slowest who walks (campaign/baggage.js), slower hungry and in frost
export function pace(a, K, seasonId) {
  let v = CAMPAIGN.speed * scaleOf(a) * slowest(K) * (guided(K) ? HIRES.guide.pace : 1);
  if (K.hungry > 0) v *= CAMPAIGN.hunger.slow;
  if (seasonId === 'winter' && a.f.temp[K.i] - a.f.trange[K.i] / 2 < 0) v *= CAMPAIGN.frost;
  return v;
}

function die(a, K, m, why) {
  m.alive = false; m.hp = 0; m.ride = null; m.died = {day: K.day, year: a.hist.year, why};
  const left = core(K).length, n = K.members.filter(isCore).length;
  say(a, K, `${m.name}, ${rank(K, m)}, ${why}.${isCore(m) && left ? ` Из вышедших из столицы осталось ${left} из ${n}.` : ''}`, 'death', isCore(m) && !left);
}

// ── the baggage changes: a beast, a vehicle; the way is planned afresh
const beastWord = (kind, cs = 'label') => BEASTS[kind][cs];
function gainBeast(a, K, kind, how) {
  K.beasts.push({id: K.nextBeast++, kind, hp: 0.8, job: null, rider: null}); K.stats.tamed++;
  say(a, K, `${how} ${beastWord(kind, 'acc')}. Теперь в обозе: ${baggageText(K)}.`, 'beast');
  assign(K); K.path = null;
}
function loseBeast(a, K, b, why) {
  K.beasts = K.beasts.filter(x => x !== b);
  say(a, K, `${why}: ${beastWord(b.kind)}.`, 'beast');
  assign(K); K.path = null;
}
export function baggageText(K) {
  const parts = [];
  for (const kind of Object.keys(BEASTS)) { const n = K.beasts.filter(b => b.kind === kind && b.hp > 0).length; if (n) parts.push(n === 1 ? BEASTS[kind].label : `${BEASTS[kind].plural} (${n})`); }
  for (const v of K.vehicles) parts.push(VEHICLES[v.kind].label + (v.building ? ` с разобранным строением «${BUILDINGS.get(v.building).name}»` : ''));
  return parts.join(', ') || 'только то, что на спинах';
}

// ── the day
function march(a, K, v) {
  let budget = 1, moved = 0;
  const wheels = wheeled(K);
  while (budget > 0 && K.path && K.k < K.path.length) {
    const next = K.path[K.k], nx = next % a.w + 0.5, ny = ((next / a.w) | 0) + 0.5;
    const d = Math.hypot(nx - K.x, ny - K.y), c = stepCost(a, next, K.people, wheels);
    if (c === Infinity) { K.path = null; break; }
    const sp = v / Math.max(0.3, c), can = sp * budget;
    if (can >= d) { K.x = nx; K.y = ny; K.i = next; K.k++; budget -= d / sp; moved += d; }
    else { K.x += (nx - K.x) / d * can; K.y += (ny - K.y) / d * can; moved += can; budget = 0; }
  }
  K.stats.walked += moved;
  return moved;
}

// where the caravan is now, in words: for the log when it enters a realm or a land
function entered(a, K, before) {
  const b = biomeAt(a, K.i), t = townAt(a, K.i);
  if (t && t.id !== before.town) say(a, K, `Караван пришёл в ${townLabel(t, 1)} ${t.name}${t.realm && t.realm !== K.realm ? ` (${realmLabel(a, t.realm)})` : ''}.`);
  else if (b && b.id !== before.biome && !t) say(a, K, `Караван идёт ${b.where}.`, 'land');
}

// a day in camp: beasts tamed where they live, baskets woven, the building goes on
function campWork(a, K, r) {
  const b = biomeAt(a, K.i), reg = cellRegion(a, K.i), wooded = (b?.trees ?? 0) >= 0.3;
  for (const kind of Object.keys(BEASTS)) {
    const lvl = faunaLevel({region: reg}, kind);
    if (lvl > 0 && lacking(K, kind) && r() < GETTING.tame * Math.min(1.6, lvl) * handler(K)) gainBeast(a, K, kind, 'Приручили');
  }
  if ((wooded || (b?.trees ?? 0) >= 0.1) && r() < 0.5) {
    const m = alive(K).filter(x => (x.back ?? 1) === 1).sort((p, q) => (p.role === 'squire') - (q.role === 'squire')).pop();
    if (m) {
      m.back = 1 + GETTING.basket.cells;
      const done = alive(K).every(x => (x.back ?? 1) > 1), first = alive(K).filter(x => (x.back ?? 1) > 1).length === 1;
      if (first) say(a, K, `${m.name} сплёл${m.gender === 'f' ? 'а' : ''} из лыка и лозы заплечный короб: на спину ложится втрое больше. Остальные взялись за свои.`, 'build');
      else if (done) say(a, K, 'Теперь у каждого за спиной короб.', 'build');
    }
  }
  // earnings: hides from the hunt, gold panned from the river's sand by the one with a pan
  const game = ['deer', 'boar', 'elk', 'aurochs', 'saiga', 'goat'].reduce((s, id) => s + faunaLevel({region: reg}, id), 0);
  if (r() < EARN.hide * Math.min(1.5, game)) K.cargo.hide = (K.cargo.hide || 0) + 1;
  if (reg.placer > 0 && alive(K).some(m => m.gear.hand.includes('pan'))) {
    const g = Math.round(EARN.pan * reg.placer * (0.5 + r()) * 10) / 10;
    K.gold = Math.round((K.gold + g) * 10) / 10; K.stats.panned = (K.stats.panned || 0) + g;
    if (!K.pannedTold || K.day - K.pannedTold > 60) { K.pannedTold = K.day; say(a, K, 'В речном песке блестит золото: лоток не пустует, казна понемногу растёт.', 'find'); }
  }
  if (K.build && wooded) {
    K.build.days--;
    if (K.build.days <= 0) {
      const B = K.build; K.build = null; K.stats.built++;
      if (B.kind === 'building') {
        const v = K.vehicles.find(x => x.kind === 'wagon' && !x.building);
        if (v) { v.building = B.id; say(a, K, `Срубили и разобрали «${BUILDINGS.get(B.id).name}»: оно едет в повозке и встанет на любой стоянке.`, 'build'); }
      } else {
        K.vehicles.push({kind: B.kind, building: null, pulled: false});
        say(a, K, `Сколотили ${VEHICLES[B.kind].label === 'тележка' ? 'тележку' : 'повозку'}: ${VEHICLES[B.kind].boxes} ящика груза. Теперь в обозе: ${baggageText(K)}.`, 'build');
        assign(K); K.path = null;
      }
      K.camp = 0;
    }
  }
}

// how many of a kind of beast the caravan would still take
function lacking(K, kind) {
  const have = K.beasts.filter(b => b.kind === kind && b.hp > 0).length, B = BEASTS[kind];
  if (B.use === 'ride') return K.beasts.filter(b => BEASTS[b.kind].use === 'ride' && b.hp > 0).length < alive(K).length;
  const wagon = K.vehicles.some(v => v.kind === 'wagon') ? 1 : 0;
  return have < 2 + wagon;
}

// the way to the goal: with the wheels along the roads, or straight on foot; the wheels are kept when
// the road is not too much longer (data/transport.js ROUTE), otherwise left behind
function plan(a, K) {
  const foot = route(a, K.i, K.goal, K.people, false);
  let way = foot;
  if (wheeled(K)) {
    const road = route(a, K.i, K.goal, K.people, true), keep = K.vehicles.some(v => v.building) ? ROUTE.keepBuilding : ROUTE.keep;
    if (road && (!foot || road.cost <= keep * foot.cost)) {
      way = road;
      if (K.route !== 'road') say(a, K, `Совет: идти с обозом по дорогам${foot && road.cost > foot.cost * 1.05 ? ` — дольше на ${Math.round((road.cost / foot.cost - 1) * 100)}%, зато всё с собой` : ''}.`, 'route');
      K.route = 'road';
    } else {
      const names = K.vehicles.map(v => VEHICLES[v.kind].label).join(' и ');
      K.vehicles = []; K.stats.left++; assign(K);
      const lost = overflow(K);
      say(a, K, `Совет: ${road ? `по дорогам к цели в ${(road.cost / foot.cost).toFixed(1)} раза дольше` : 'колёсам туда не пройти'} — бросили ${names} и пошли напрямик${lost ? `, оставив ${Math.round(lost)} единиц груза` : ''}.`, 'route');
      K.route = 'straight';
    }
  } else K.route = null;
  if (way) { K.path = way.path; K.k = 0; }
  else { K.path = null; say(a, K, 'Дороги к цели нет: караван топчется на месте.', 'lost'); }
}

// what the council would build now, if anything: a cart (bronze), a wagon (iron and a draft beast),
// a building for the wagon; only where the wheels could then be used on the way to the goal
function wantBuild(a, K) {
  if (!((biomeAt(a, K.i)?.trees ?? 0) >= 0.3)) return null;
  const tier = toolTier(K), has = kind => K.vehicles.some(v => v.kind === kind);
  const fit = () => {   // would the wheels go the way? asked rarely: only when there is something to build
    const foot = route(a, K.i, K.goal, K.people, false), road = route(a, K.i, K.goal, K.people, true);
    return road && foot && road.cost <= ROUTE.keep * foot.cost;
  };
  const days = d => Math.max(1, Math.round(d * campFx(K, 'build')));
  if (has('wagon')) {
    const w = K.vehicles.find(v => v.kind === 'wagon' && !v.building);
    const b = w && fieldBuildings().find(x => !K.vehicles.some(v => v.building === x.id));
    return b ? {kind: 'building', id: b.id, days: days(buildDays(b))} : null;
  }
  const draft = K.beasts.some(b => BEASTS[b.kind].pulls >= 1) || K.beasts.filter(b => BEASTS[b.kind].pulls > 0).length >= 2;
  if (tier >= VEHICLES.wagon.tool && draft && fit()) return {kind: 'wagon', days: days(VEHICLES.wagon.days)};
  if (!has('cart') && tier >= VEHICLES.cart.tool && fit()) return {kind: 'cart', days: days(VEHICLES.cart.days)};
  return null;
}

// ── towns on the way (campaign/town.js): why the council would turn to one, and which one
const freezing = (a, i) => a.f.temp[i] - a.f.trange[i] / 2 < VISIT.winterBelow;
function wantVisit(a, K, seasonId) {
  const ms = alive(K), need = ms.length * CAMPAIGN.ration, C = CAMPAIGN.camp;
  if ((seasonId === 'winter' || (seasonId === 'autumn' && a.hist && K.day % 30 >= 20)) && freezing(a, K.i) && K.winterYear !== a.hist.year) return 'winter';
  if (K.day < (K.nextVisit ?? 0)) return '';   // just out of a town: on to the goal first
  if (K.food < need * C.foodDays) return 'food';
  if (ms.some(m => m.hp < C.badly)) return 'heal';
  if (K.gold >= VISIT.money && K.day - (K.lastVisit ?? -999) >= VISIT.every) return 'shop';
  return '';
}
// a friendly town that can be reached: one on the way to the goal — ahead of the caravan (nearer the goal
// than it is) and not much of a detour; when `urgent` (the winter, the badly wounded) and there is none
// ahead, the nearest one whichever way
function findTown(a, K, urgent, detour = VISIT.detour, days = VISIT.reach) {
  const v = Math.max(0.05, pace(a, K, SEASON_LIST[a.hist.season].id)), R = days * v, x0 = K.i % a.w, y0 = (K.i / a.w) | 0, wh = wheeled(K);
  const near = (a.towns || []).filter(t => t.alive && standing(a, K, t) && Math.hypot(t.x - x0, t.y - y0) <= R).sort((p, q) => Math.hypot(p.x - x0, p.y - y0) - Math.hypot(q.x - x0, q.y - y0)).slice(0, 4);
  const direct = K.goal == null ? null : route(a, K.i, K.goal, K.people, wh);
  let fallback = null;
  for (const t of near) {
    const way = route(a, K.i, t.i, K.people, wh); if (!way) continue;
    fallback ||= {t, way};
    if (!direct) return {t, way};
    const on = route(a, t.i, K.goal, K.people, wh);
    if (way.cost > R * 1.6) continue;   // the cells' price: roads cheaper, mountains dearer than the straight line
    if (on && on.cost < direct.cost && way.cost + on.cost <= direct.cost * (1 + detour) + VISIT.slack) return {t, way};
  }
  return urgent ? fallback : null;
}
const VISIT_WHY = {winter: 'перезимовать', food: 'купить еды', heal: 'подлечить раненых', shop: 'потратить казну'};

// the caravan comes into a town: trade, hire, meet who would go along
function enterTown(a, K, t) {
  const st = standing(a, K, t), why = K.viaWhy;
  K.via = null; K.viaWhy = null; K.path = null; K.camp = 0; K.why = '';
  if (!st) { say(a, K, `${townName(t)} закрыл ворота перед караваном.`, 'town'); return; }
  const {r, done} = draw(K, 'town');
  const parts = [...trade(a, K, t, st), ...hire(a, K, t, st, r)], c = companion(a, K, t, st, r);
  if (c) parts.push(c);
  done();
  K.inTown = {id: t.id, since: K.day, why}; K.lastVisit = K.day; K.stats.towns = (K.stats.towns || 0) + 1;
  if (why === 'winter') K.winterYear = a.hist.year;
  say(a, K, `Караван вошёл в ${townLine(a, t, st)}${why === 'winter' ? ' на зимовку' : ''}${parts.length ? ': ' + parts.join('; ') : ''}. Казна: ${K.gold} зол.`, 'town');
}

// an evening in town: stay (the winter through, or till healed and stocked), or go on, spending the earnings
function townEvening(a, K, seasonId) {
  const t = a.towns.find(x => x.id === K.inTown.id), st = standing(a, K, t), ms = alive(K);
  const stocked = K.food >= 0.9 * Math.min(capacity(K) - cargoLoad(K), ms.length * CAMPAIGN.ration * WANTS.foodDays);
  const healed = ms.every(m => m.hp >= CAMPAIGN.camp.healed);
  const wintering = K.inTown.why === 'winter' && (seasonId === 'winter' || seasonId === 'autumn');
  if (st && (wintering || (K.day - K.inTown.since < VISIT.stay && !(stocked && healed)))) return;
  const parts = st ? trade(a, K, t, st) : [];
  say(a, K, `Караван выходит из ${townLabel(t, 2)} ${t.name}${parts.length ? ': ' + parts.join('; ') : ''}. Казна: ${K.gold} зол.`, 'town');
  K.inTown = null; K.path = null; K.nextVisit = K.day + VISIT.every;
}

// those who are not the core: the hired go when their term is up, the joined may go any day
function people(a, K, r) {
  for (const m of alive(K)) {
    if (isCore(m)) continue;
    if (m.contract && K.day >= m.contract.until) { leave(a, K, m, `${m.name}, ${rank(K, m)}, отслужил${m.gender === 'f' ? 'а' : ''} срок и ушёл${m.gender === 'f' ? 'а' : ''}`); continue; }
    if (m.loyalty == null || m.loyalty >= 1) continue;
    m.loyalty = Math.max(0, Math.min(1, m.loyalty + LOYALTY.daily + (K.hungry ? LOYALTY.hungry : 0)));
    if (r() < LOYALTY.leave * (1 - m.loyalty) ** 2) leave(a, K, m, `${m.name}, ${rank(K, m)}, ${K.hungry ? 'не вынес голода и' : 'однажды утром'} ушёл${m.gender === 'f' ? 'а' : ''} своей дорогой`);
    else if (m.loyalty >= 1) say(a, K, `${m.name} теперь свой${m.gender === 'f' ? '' : ''}: идёт с караваном до конца.`, 'people');
  }
}
function leave(a, K, m, text) {
  m.alive = false; m.ride = null; m.left = {day: K.day, year: a.hist.year};
  say(a, K, text + '.', 'leave'); assign(K);
}
const shake = (K, d) => { for (const m of alive(K)) if (m.loyalty != null && m.loyalty < 1) m.loyalty = Math.max(0, Math.min(1, m.loyalty + d)); };

function evening(a, K) {
  const ms = alive(K), need = ms.length * CAMPAIGN.ration, seasonId = SEASON_LIST[a.hist.season].id;
  if (K.inTown) { townEvening(a, K, seasonId); if (K.inTown) return; }
  if (K.via != null && !K.inTown) {
    const t = a.towns.find(x => x.id === K.via);
    if (!t || !t.alive) { K.via = null; K.path = null; }
    else if (K.i === t.i) { enterTown(a, K, t); return; }
    else if (!K.path || K.k >= K.path.length) {   // the way was lost (a beast gone, a vehicle broken): find it again, or give the town up
      const way = route(a, K.i, t.i, K.people, wheeled(K));
      if (way) { K.path = way.path; K.k = 0; } else { K.via = null; K.viaWhy = null; K.path = null; }
    }
  }
  // the goal: there and back
  if (K.goal != null && K.i === K.goal && K.phase === 'out') {
    say(a, K, `Караван дошёл до цели — ${biomeAt(a, K.i)?.where || 'на край света'}. Поручение исполнено, пора домой.`, 'goal', true);
    K.phase = 'back'; K.goal = K.home; K.path = null;
  } else if (K.phase === 'back' && K.i === K.home) {
    const t = a.towns.find(x => x.id === K.capital);
    say(a, K, `Караван вернулся в ${t ? `${townLabel(t, 1)} ${t.name}` : 'родные края'}: ${ms.length} из ${K.members.length}, ${Math.round(K.day / 120 * 10) / 10} лет в пути; в обозе ${baggageText(K)}.`, 'home', true);
    K.phase = 'won'; return;
  }
  // a town on the way: to buy food, to heal, to spend the treasury, to winter
  if (K.via == null && K.camp === 0) {
    const why = wantVisit(a, K, seasonId);
    // urgent — any way to the nearest: the winter, the badly wounded, hunger with the gold to end it
    const rich = K.gold >= VISIT.hungryGold * need * MARKET.ration;
    const urgent = why === 'winter' || (why === 'heal' && ms.some(m => m.hp < CAMPAIGN.camp.badly)) || (why === 'food' && K.hungry > 0 && rich);
    const days = why === 'winter' ? VISIT.winterReach : why === 'food' ? Math.min(VISIT.reach, K.food / need + VISIT.foodSpare) : VISIT.reach;
    const found = why && findTown(a, K, urgent, K.hungry ? VISIT.hungryDetour : VISIT.detour, days);
    if (found) {
      K.via = found.t.id; K.viaWhy = why; K.path = found.way.path; K.k = 0;
      say(a, K, `Совет: свернуть в ${townLabel(found.t, 1)} ${found.t.name} — ${VISIT_WHY[why]}.`, 'town');
      if (!K.path.length) enterTown(a, K, found.t);
      return;
    }
  }
  if (K.via != null && !(K.hungry && richness(a, K.i) >= CAMPAIGN.camp.foodLand)) return;
  // a camp: for food when it runs short and the land can feed them, for the wounded, to tame or to build
  const rich = richness(a, K.i), core = ms.reduce((s, m) => s + m.hp, 0) / ms.length, C = CAMPAIGN.camp;
  const stock = Math.min(capacity(K) - cargoLoad(K), need * C.stock);
  if (K.camp > 0 && ((K.why === 'food' && K.food >= C.full * stock) || (K.why === 'heal' && core >= C.healed))) K.camp = 0;
  if (K.camp > 0) K.camp--;
  else {
    const badly = ms.some(m => m.hp < C.badly), quiet = nightRisk(a, K.i) <= C.danger;
    let why = K.food < need * C.foodDays && rich >= C.foodLand ? 'food' : core < C.hp || badly ? 'heal' : '';
    // a long camp where something hunts at night is death: they look for a quieter place, unless they already starve
    if (why && !K.hungry && !quiet && K.path && K.k < K.path.length) why = '';
    // fed, whole and in a quiet place: to build, or to tame the beasts that graze here
    if (!why && !K.hungry && quiet && K.food >= need * C.foodDays && K.day >= (K.nextThink ?? 0)) {
      K.nextThink = K.day + C.think;
      const B = wantBuild(a, K), reg = cellRegion(a, K.i);
      const tame = K.day - (K.tamedAt ?? -999) >= GETTING.tameEvery && Object.keys(BEASTS).find(kind => lacking(K, kind) && faunaLevel({region: reg}, kind) >= GETTING.tameLand);
      if (B) { K.build = B; why = 'build'; }
      else if (tame) { why = 'tame:' + tame; K.tamedAt = K.day; }
    }
    if (why && K.why !== why) {
      K.camp = why === 'build' ? K.build.days + 1 : C.maxDays; K.why = why; K.stats.camps++;
      const left = Math.floor(K.food / need);
      const text = why === 'food' ? `${left > 0 ? `Еды осталось на ${pieces(left, 'день', 'дня', 'дней')}` : 'Еды не осталось'}: совет решил встать лагерем, охотиться и собирать.`
        : why === 'heal' ? 'Раненые еле идут: совет решил встать лагерем и отлежаться.'
          : why === 'build' ? `Совет решил встать в лесу и ${K.build.kind === 'building' ? `срубить «${BUILDINGS.get(K.build.id).name}» для повозки` : K.build.kind === 'cart' ? 'сколотить тележку' : 'сколотить повозку'}: ${pieces(K.build.days, 'день', 'дня', 'дней')} работы.`
            : `Здесь пасутся дикие ${BEASTS[why.slice(5)].plural}: совет решил встать и приручить.`;
      say(a, K, text, 'camp');
    } else if (!why) K.why = '';
  }
  // the way to the goal
  if ((!K.path || K.k >= K.path.length) && K.goal != null && K.i !== K.goal) plan(a, K);
}

function night(a, K) {
  if (K.inTown) return;   // behind a town's walls nothing finds the camp
  const {r, done} = draw(K, 'night');
  const near = townAt(a, K.i), friendly = near && near.realm && (near.realm === K.realm || (trades(a, K.realm, near.realm) && !atWar(a, K.realm, near.realm)));
  const ds = dangers(a, K.i);
  let p = CAMPAIGN.night.base + ds.reduce((s, d) => s + d.p, 0);
  if (friendly) p *= CAMPAIGN.night.friendly;
  if (guided(K)) p *= HIRES.guide.night;
  p = Math.min(CAMPAIGN.night.max, p);
  if (r() < p) {
    // which danger it was
    let x = r() * (ds.reduce((s, d) => s + d.p, 0) || 1), d = ds[0] || {kind: 'wolves', strength: 0.7};
    for (const o of ds) { x -= o.p; if (x <= 0) { d = o; break; } }
    fight(a, K, d, r);
  } else {
    // a quiet night: a little found in the morning while they packed
    const M = CAMPAIGN.morning;
    if (r() < M.food * Math.min(1.2, richness(a, K.i) + 0.2)) { const n = Math.round(between(r, M.foodN)); K.food += n; K.stats.finds++; if (r() < 0.25) say(a, K, `Утром подстрелили дичь: +${pieces(n, 'паёк', 'пайка', 'пайков')}.`, 'find'); }
    if (r() < M.treasure) { const g = Math.round(between(r, M.gold)); K.gold += g; K.stats.finds++; say(a, K, `Утром у ручья нашли оброненный кошель: ${pieces(g, 'золотой', 'золотых', 'золотых')}.`, 'find'); }
  }
  done();
}

// a fight at the camp, settled at once: the foe's might against the caravan's
function fight(a, K, d, r) {
  const F = CAMPAIGN.fight, foe = FOES[d.kind], E = foe.might * (d.strength ?? 1) * between(r, [0.6, 1.4]), P = caravanMight(K);
  const share = P / (P + E), win = r() < share;
  K.stats.fights++;
  // the blows: more when they lose, mostly on the knights, who shield the squires
  let hurt = E * (F.hurt[0] + (F.hurt[1] - F.hurt[0]) * (1 - share)) * (win ? 1 : F.lostHurt);
  const hit = [];
  while (hurt > 0 && alive(K).length) {
    const ms = alive(K), wts = ms.map(m => (m.role === 'knight' ? F.shield : 1));
    let x = r() * wts.reduce((s, v) => s + v, 0), m = ms[0];
    for (let q = 0; q < ms.length; q++) { x -= wts[q]; if (x <= 0) { m = ms[q]; break; } }
    const b = between(r, F.blow); m.hp -= b; hurt -= b * 2;
    if (!hit.includes(m)) hit.push(m);
    if (m.hp <= 0) { if (win) m.hp = F.saved; else die(a, K, m, `пал в ночном бою (${foe.label})`); }
  }
  const where = d.label ? ` — ${d.label}` : '';
  if (!alive(K).length) return;
  if (win) {
    K.stats.won++; shake(K, LOYALTY.won);
    // captives set free: they may go along
    const joined = () => alive(K).filter(m => m.loyalty != null).length;
    if (FREED.chance[d.kind] && alive(K).length < COMPANY_MAX && joined() < JOINED_MAX && r() < FREED.chance[d.kind]) {
      const n = 1 + (r() < 0.35 ? 1 : 0), names = [];
      for (let q = 0; q < n && alive(K).length < COMPANY_MAX && joined() < JOINED_MAX; q++) {
        const minor = r() < COMPANIONS.minor, peoples = WORLD_PEOPLES.all();
        const race = minor ? COMPANIONS.minorRaces[(r() * COMPANIONS.minorRaces.length) | 0] : peoples[(r() * peoples.length) | 0].race;
        const m = makeMember(K, r, {race, role: 'freed', gear: FREED.gear, loyalty: FREED.loyalty});
        K.members.push(m); names.push(`${m.name} (${SPECIES_LABEL(race)})`);
      }
      say(a, K, `В лагере врагов нашли пленников и освободили: ${names.join(', ')}. ${n > 1 ? 'Пока идут с караваном' : 'Пока идёт с караваном'} — надолго ли, неизвестно.`, 'people');
    }
    const loot = Math.round(between(r, F.loot)); K.food += loot;
    say(a, K, `Ночью на лагерь напали ${foe.label}${where}. Отбились${hit.length ? `, ранены: ${hit.filter(m => m.alive).map(m => m.name).join(', ') || 'никто'}` : ' без ран'}; с убитых взяли еды на ${pieces(loot, 'паёк', 'пайка', 'пайков')}.`, 'fight');
    // those who keep beasts leave some behind
    for (const [kind, p] of Object.entries(GETTING.spoil[d.kind] || {})) if (r() < p) { gainBeast(a, K, kind, 'У врагов отбили'); break; }
    const T = GETTING.spoilTool;
    if (T[d.kind] && toolTier(K) < 2 && r() < T[d.kind]) {
      const m = alive(K).find(x => x.role === 'squire') || alive(K)[0], old = m.gear.hand[0];
      m.gear.hand[0] = T.item;
      say(a, K, `Среди брошенного врагами нашёлся ${ITEMS.get(T.item).label.toLowerCase()}: ${m.name} сменил${m.gender === 'f' ? 'а' : ''} на него ${ITEMS.has(old) ? ITEMS.get(old).short : 'свой инструмент'}. С железом можно сколотить повозку.`, 'build');
    }
  } else {
    K.stats.fled++; shake(K, LOYALTY.lost);
    const lost = Math.round(K.food * F.lost); K.food -= lost;
    say(a, K, `Ночью на лагерь напали ${foe.label}${where}. Не устояли и бежали в темноте${lost ? `, бросив ${pieces(lost, 'паёк', 'пайка', 'пайков')}` : ''}${hit.length ? `; ранены: ${hit.filter(m => m.alive).map(m => m.name).join(', ') || '—'}` : ''}.`, 'fight');
    const gone = K.beasts.filter(() => r() < GETTING.lose.beast);
    if (gone.length) {
      K.beasts = K.beasts.filter(b => !gone.includes(b)); assign(K); K.path = null;
      const names = Object.keys(BEASTS).map(kind => { const n = gone.filter(b => b.kind === kind).length; return n ? (n === 1 ? BEASTS[kind].acc : `${BEASTS[kind].plural} (${n})`) : null; }).filter(Boolean);
      say(a, K, `В темноте увели или убили ${names.join(', ')}.`, 'beast');
    }
    for (const v of [...K.vehicles]) if (r() < GETTING.lose.vehicle) {
      K.vehicles = K.vehicles.filter(x => x !== v); assign(K); K.path = null;
      say(a, K, `Враги разбили ${VEHICLES[v.kind].label === 'тележка' ? 'тележку' : 'повозку'}${v.building ? ` вместе с «${BUILDINGS.get(v.building).name}»` : ''}.`, 'beast');
    }
    K.camp = 0; K.why = ''; K.build = null;
  }
}

// one day of the campaign (the world's day `day` of the current season)
export function caravanDay(a, K, day) {
  if (ended(K)) return;
  const seasonId = SEASON_LIST[a.hist.season].id, before = {town: townAt(a, K.i)?.id, biome: biomeAt(a, K.i)?.id};
  assign(K);
  const ms = alive(K), {r, done} = draw(K, 'day');
  // the day: a camp or the march; food from the land either way
  const rich = richness(a, K.i) * seasonFood(a, K.i, seasonId), Fo = CAMPAIGN.forage;
  const town = K.inTown ? a.towns.find(x => x.id === K.inTown.id) : null;
  const camping = !town && (K.camp > 0 || !K.path || K.k >= K.path.length);
  if (town) {   // a day in town: work for hire, buy the day's food at the market
    labour(K);
    const st = standing(a, K, town), price = st ? rationPrice(town, st) : Infinity, want = Math.max(0, ms.length * CAMPAIGN.ration * 2 - K.food);
    const n = Math.min(want, Math.floor(K.gold / price)); if (n > 0) { K.food += n; K.gold = Math.round((K.gold - n * price) * 10) / 10; }
  } else if (!camping) march(a, K, pace(a, K, seasonId));
  else campWork(a, K, r);
  if (!town) K.food += ms.length * (camping ? Fo.camp * campFx(K, 'forage') : Fo.march) * rich * (1 - Fo.spread / 2 + Fo.spread * r());
  // the meal
  const need = ms.length * CAMPAIGN.ration, eat = Math.min(K.food, need), fed = eat / need;
  K.food = Math.max(0, K.food - eat);
  // the chronicle tells of a hunger that matters: a new one after a while, its end after a few days of it
  const HT = CAMPAIGN.hunger.tell;
  if (fed < CAMPAIGN.hunger.starveAt) {
    if (!K.hungry && K.day - (K.hungerTold ?? -999) > HT.again) { say(a, K, 'Еда кончилась: едят то, что поймают по дороге. Идут вдвое медленнее, раны не заживают.', 'hunger'); K.hungerTold = K.day; }
    K.hungry++; K.stats.hungryDays++;
  } else if (K.hungry) { if (K.hungry >= HT.over) say(a, K, `Голод отступил после ${pieces(K.hungry, 'дня', 'дней', 'дней')}.`, 'hunger'); K.hungry = 0; }
  for (const m of ms) {
    if (K.hungry > CAMPAIGN.hunger.wasteAfter) { m.hp -= CAMPAIGN.hunger.waste * (0.5 + r()) * (camping ? campFx(K, 'shelter') : 1); if (m.hp <= 0) { die(a, K, m, 'умер от голода'); continue; } }
    else if (!K.hungry) m.hp = Math.min(1, m.hp + (town ? CAMPAIGN.heal.camp * healHere(town) : camping ? CAMPAIGN.heal.camp * campFx(K, 'heal') : CAMPAIGN.heal.march * (m.ride ? 1.5 : 1)));
  }
  people(a, K, r);
  // the beasts graze where grass grows and starve where it does not
  const grass = pasture(a, K.i, seasonId);
  for (const b of [...K.beasts]) {
    b.hp = grass ? Math.min(1, b.hp + 0.03) : b.hp - FODDER.starve * (0.5 + r());
    if (b.hp <= 0) loseBeast(a, K, b, 'Бескормица: пал');
  }
  done();
  // what they can carry
  assign(K); overflow(K);
  if (core(K).length) { entered(a, K, before); evening(a, K); }
  if (core(K).length && !ended(K)) night(a, K);
  // the end: when none of the eight is left, those who joined go their own ways
  if (!core(K).length && !ended(K)) {
    for (const m of alive(K)) { m.alive = false; m.left = {day: K.day, year: a.hist.year}; }
    K.phase = 'lost';
    say(a, K, 'Никого из тех, кто вышел из столицы, не осталось в живых. Караван не дойдёт.', 'end', true);
  }
  if (!ended(K) && K.day >= CAMPAIGN.maxYears * 30 * SEASONS_PER_YEAR) { K.phase = 'timeout'; say(a, K, `Прошло ${CAMPAIGN.maxYears} лет: караван так и не вернулся.`, 'end', true); }
  // what they can carry, again: the night's loot, the morning's finds, the town's buys, someone gone
  assign(K); overflow(K);
  reveal(a, K, K.i, CAMPAIGN.fog.sight * scaleOf(a) + (guided(K) ? HIRES.guide.sight * scaleOf(a) : 0));
  K.track.push([Math.round(K.x * 100) / 100, Math.round(K.y * 100) / 100]);
  const p = (a.parties || []).find(x => x.id === K.party);
  if (p) { p.x = K.x; p.y = K.y; p.i = K.i; p.men = alive(K).length; p.goal = K.goal; if (ended(K)) p.state = 'gone'; }
  K.day++;
}

