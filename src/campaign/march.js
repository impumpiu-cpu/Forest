// A day of the caravan, inside the world's day (atlas/history.js stepHistory → stepParties → onDay).
//   morning — after a quiet night: what was found while they packed up;
//   day     — the march along the way (as fast as the slowest who walks), or a camp: hunting, gathering,
//             healing, taming beasts, weaving baskets, building a cart, a wagon, a building for it;
//   meal    — they eat a ration each, as far as the food goes; hungry days slow them and wear them down;
//             the beasts graze, or starve where nothing grows;
//   evening — the council: the goal reached? camp — for food, for the wounded, to tame, to build? the way:
//             along the roads with the wheels, or straight on foot, leaving them;
//   night   — something may find the camp: the fight is played on the local map (campaign/fight.js, camp.js).
// The campaign ends when the goal is reached and the caravan is home, or when all eight are dead.
import {scaleOf} from '../atlas/tectonics.js';
import {townAt} from '../atlas/peoples.js';
import {trades, atWar} from '../atlas/diplomacy.js';
import {realmLabel} from '../atlas/realms.js';
import {biomeAt} from '../atlas/biomes.js';
import {townLabel} from '../atlas/towns.js';
import {faunaLevel} from '../world/region.js';
import {SEASONS, SEASON_DAYS} from '../data/seasons.js';
import {ITEMS} from '../data/items.js';
import {BUILDINGS} from '../data/buildings.js';
import {NORM} from '../data/special.js';
import {CAMPAIGN, FOES, RETINUE} from '../data/campaign.js';
import {BEASTS, VEHICLES, GETTING, FODDER, ROUTE} from '../data/transport.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {plural} from '../core/util.js';
import {richness, seasonFood, dangers, nightRisk, pasture, cellRegion} from './land.js';
import {route, stepCost} from './path.js';
import {assign, capacity, cargoLoad, load, overflow, slowest, wheeled, campFx, toolTier, fieldBuildings, buildDays, handler} from './baggage.js';
import {draw, makeMember} from './start.js';
import {fight, playStop} from './fight.js';
import {questArrive, questTarget, questSight, pursuit, crownHands, rumour} from './quest.js';
import {CAMP} from '../data/camp.js';
import {stepBubble, huntersNear, sighted, settle, removeThing, pursuers, lose} from './bubble.js';
import {BUBBLE, THINGS, AMBUSH, TRAIN, HERD} from '../data/bubble.js';
import {RESOURCES} from '../data/resources.js';
import {standing, townName, townLine, trade, labour, healHere, hire, companion, rationPrice} from './town.js';
import {HIRES, ROLES, LOYALTY, FREED, COMPANIONS, COMPANY_MAX, JOINED_MAX, VISIT, EARN, WANTS, MARKET} from '../data/market.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {free, unbind, mouths, captivesEvening} from './captives.js';
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
// ended, and its epilogue told (campaign/ending.js)
export const finished = K => ended(K) && (!K.epilogue || K.epilogue.done);
export const rank = (K, m) => (m.captive ? (m.gender === 'f' ? 'пленная' : 'пленный') : RETINUE[K.people][m.role]?.[0] || HIRES[m.role]?.label || ROLES[m.role] || 'спутник');
export {free};

// a line of the campaign's log; `world` — also into the world's chronicle
// who — the members the line is about (ids): the chronicle can be read for one of them
export function say(a, K, text, kind = 'march', world = false, who = null) {
  const H = a.hist, line = {day: K.day, year: H.year, season: H.season, i: K.i, text, kind};
  if (who?.length) line.who = who;
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
  if (m.captive) return 0;   // a captive fights for nobody but itself (campaign/captives.js)
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

export function die(a, K, m, why) {
  if (m.gender === 'f') why = why.replace(/^(умер|пал|погиб)(?=\s)/, w => ({умер: 'умерла', пал: 'пала', погиб: 'погибла'})[w]);
  m.alive = false; m.hp = 0; m.ride = null; m.died = {day: K.day, year: a.hist.year, why};
  if (m.captive) unbind(K, m);   // shackles back to the baggage
  const left = core(K).length, n = K.members.filter(isCore).length;
  say(a, K, `${m.name}, ${rank(K, m)}, ${why}.${isCore(m) && left ? ` Из вышедших из столицы осталось ${left} из ${n}.` : ''}`, 'death', isCore(m) && !left, [m.id]);
}

// ── the baggage changes: a beast, a vehicle; the way is planned afresh
const beastWord = (kind, cs = 'label') => BEASTS[kind][cs];
export function gainBeast(a, K, kind, how) {
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
  if (B.use === 'ride') return K.beasts.filter(b => BEASTS[b.kind].use === 'ride' && b.hp > 0).length < free(K).length;   // captives walk
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
const VISIT_WHY = {winter: 'перезимовать', food: 'купить еды', heal: 'подлечить раненых', shop: 'потратить казну', rumour: 'расспросить о следах'};

// the caravan comes into a town: trade, hire, meet who would go along
function enterTown(a, K, t) {
  const st = standing(a, K, t), why = K.viaWhy;
  K.via = null; K.viaWhy = null; K.path = null; K.camp = 0; K.why = '';
  if (!st) { say(a, K, `${townName(t)} закрыл ворота перед караваном.`, 'town'); return; }
  const {r, done} = draw(K, 'town');
  const parts = [...trade(a, K, t, st), ...hire(a, K, t, st, r)], c = companion(a, K, t, st, r), heard = rumour(a, K, t, r);
  if (c) parts.push(c);
  if (heard) parts.push(heard);
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
  captivesEvening(a, K, r, (text, kind, who) => say(a, K, text, kind, false, who));   // the captives' evening (campaign/captives.js)
  for (const m of alive(K)) {
    if (isCore(m)) continue;
    if (m.contract && K.day >= m.contract.until) { leave(a, K, m, `${m.name}, ${rank(K, m)}, отслужил${m.gender === 'f' ? 'а' : ''} срок и ушёл${m.gender === 'f' ? 'а' : ''}`); continue; }
    if (m.loyalty == null || m.loyalty >= 1) continue;
    m.loyalty = Math.max(0, Math.min(1, m.loyalty + LOYALTY.daily + (K.hungry ? LOYALTY.hungry : 0)));
    if (r() < LOYALTY.leave * (1 - m.loyalty) ** 2) leave(a, K, m, `${m.name}, ${rank(K, m)}, ${K.hungry ? `не вынес${m.gender === 'f' ? 'ла' : ''} голода и` : 'однажды утром'} ушёл${m.gender === 'f' ? 'а' : ''} своей дорогой`);
    else if (m.loyalty >= 1) say(a, K, `${m.name} теперь свой${m.gender === 'f' ? '' : ''}: идёт с караваном до конца.`, 'people');
  }
}
function leave(a, K, m, text) {
  m.alive = false; m.ride = null; m.left = {day: K.day, year: a.hist.year};
  say(a, K, text + '.', 'leave'); assign(K);
}
export const shake = (K, d) => { for (const m of alive(K)) if (m.loyalty != null && m.loyalty < 1) m.loyalty = Math.max(0, Math.min(1, m.loyalty + d)); };

function homecoming(a, K, ms) {
  const t = a.towns.find(x => x.id === K.capital), Q = K.quest;
  say(a, K, `Караван вернулся в ${t ? `${townLabel(t, 1)} ${t.name}` : 'родные края'}${Q ? ` с короной — ${Q.name} снова дома` : ''}: ${ms.length} из ${K.members.length}, ${Math.round(K.day / 120 * 10) / 10} лет в пути; в обозе ${baggageText(K)}.`, 'home', true);
  K.phase = 'won';
}

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
  // the quest (campaign/quest.js): at a place it seeks — a clue taken, the crown, a storm of the guards
  if (K.quest) {
    const {r, done} = draw(K, 'quest'), tell = (text, kind, world, who) => say(a, K, text, kind, world, who);
    const busy = !K.inTown && K.via == null && questArrive(a, K, r, d => fight(a, K, d, r, 'guard'), tell);
    const any = K.members.some(m => m.alive && isCore(m));
    if (any && K.phase === 'back' && K.i === K.home && K.quest.crown.state === 'carried') { done(); homecoming(a, K, ms); return; }
    const g = any ? questTarget(a, K, r) : null;
    if (g !== K.goal) { K.goal = g; K.path = null; }
    // nothing known of where to look: the council goes to a town to ask
    if (g == null && K.via == null && !K.inTown) {
      const found = findTown(a, K, true, VISIT.detour, VISIT.winterReach);
      if (found) { K.via = found.t.id; K.viaWhy = 'rumour'; K.path = found.way.path; K.k = 0; say(a, K, `Совет: где искать дальше, не знает никто — свернуть в ${townLabel(found.t, 1)} ${found.t.name} расспросить старожилов.`, 'town'); if (!K.path.length) enterTown(a, K, found.t); }
    }
    done();
    if (busy || !K.members.some(m => m.alive && isCore(m))) return;
  } else if (K.goal != null && K.i === K.goal && K.phase === 'out') {   // a campaign from before the quest: there and back
    say(a, K, `Караван дошёл до цели — ${biomeAt(a, K.i)?.where || 'на край света'}. Поручение исполнено, пора домой.`, 'goal', true);
    K.phase = 'back'; K.goal = K.home; K.path = null;
  } else if (K.phase === 'back' && K.i === K.home) { homecoming(a, K, ms); return; }
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
    // a quiet place: the land's dangers low; to build or to tame they also wait till nothing hunts them near
    const badly = ms.some(m => m.hp < C.badly), quiet = nightRisk(a, K.i) <= C.danger, calm = quiet && !huntersNear(a, K);
    let why = K.food < need * C.foodDays && rich >= C.foodLand ? 'food' : core < C.hp || badly ? 'heal' : '';
    // a long camp where something hunts at night is death: they look for a quieter place, unless they already starve
    if (why && !K.hungry && !quiet && K.path && K.k < K.path.length) why = '';
    // fed, whole and in a quiet place: to build, or to tame the beasts that graze here
    if (!why && !K.hungry && calm && K.food >= need * C.foodDays && K.day >= (K.nextThink ?? 0)) {
      K.nextThink = K.day + C.think;
      const B = wantBuild(a, K), reg = cellRegion(a, K.i);
      const tame = K.day - (K.tamedAt ?? -999) >= GETTING.tameEvery && Object.keys(BEASTS).find(kind => lacking(K, kind) && faunaLevel({region: reg}, kind) >= GETTING.tameLand);
      if (B) { K.build = B; why = 'build'; }
      else if (tame) { why = 'tame:' + tame; K.tamedAt = K.day; }
    }
    if (why && K.why !== why) {
      K.camp = why === 'build' ? K.build.days + 1 : C.maxDays; K.why = why; K.stats.camps++; K.stopPlayed = 0;
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

// the night: the hunters of the bubble that reach the camp (campaign/bubble.js) — the first to come, the
// nearest, attacks; now and then a stray nobody saw coming
function night(a, K) {
  if (K.inTown) return;   // behind a town's walls nothing finds the camp
  const {r, done} = draw(K, 'night');
  const near = townAt(a, K.i), friendly = near && near.realm && (near.realm === K.realm || (trades(a, K.realm, near.realm) && !atWar(a, K.realm, near.realm)));
  const foes = stepBubble(a, K, 'night', r, guided(K)).filter(t => THINGS[t.kind].mood === 'hostile').sort((p, q) => Math.hypot(p.x - K.x, p.y - K.y) - Math.hypot(q.x - K.x, q.y - K.y));
  if (foes.length) {
    const t = foes[0], win = fight(a, K, foeOf(t), r, 'night');
    settle(K, t, win); K.stats.met = (K.stats.met || 0) + 1;
  } else if (r() < BUBBLE.stray * (friendly ? CAMPAIGN.night.friendly : 1)) {
    const ds = dangers(a, K.i), d = ds.length ? ds[(r() * ds.length) | 0] : {kind: 'wolves', strength: 0.7};
    fight(a, K, d, r, 'night'); K.stats.strays = (K.stats.strays || 0) + 1;
  } else {
    // a quiet night: a little found in the morning while they packed
    const M = CAMPAIGN.morning;
    if (r() < M.food * Math.min(1.2, richness(a, K.i) + 0.2)) { const n = Math.round(between(r, M.foodN)); K.food += n; K.stats.finds++; if (r() < 0.25) say(a, K, `Утром подстрелили дичь: +${pieces(n, 'паёк', 'пайка', 'пайков')}.`, 'find'); }
    if (r() < M.treasure) { const g = Math.round(between(r, M.gold)); K.gold += g; K.stats.finds++; say(a, K, `Утром у ручья нашли оброненный кошель: ${pieces(g, 'золотой', 'золотых', 'золотых')}.`, 'find'); }
  }
  done();
}

// what a thing of the bubble brings to a fight: its foe, its strength, and who it is on the local map
const foeOf = t => ({kind: THINGS[t.kind].foe, strength: t.strength, label: t.label, band: t.band || null, beast: t.beast || null});

// ── meeting the bubble by day: an ambush on the march, a merchant's train on the road, a herd to hunt
function dayMeetings(a, K, r, marched) {
  const met = stepBubble(a, K, 'day', r, guided(K));
  for (const t of met) {
    const T = THINGS[t.kind];
    if (T.mood === 'hostile' && T.ambush && marched && core(K).length) {
      const win = fight(a, K, foeOf(t), r, 'ambush');
      settle(K, t, win);
      break;   // one ambush a day is enough
    }
    if (T.mood === 'trade' && !t.met) { t.met = true; roadTrade(a, K, t); }
    if (T.mood === 'game') {
      const n = Math.round(between(r, HERD.food) * Math.min(1.5, alive(K).length / 6));
      K.food += n; K.cargo.hide = (K.cargo.hide || 0) + 1; K.stats.herds = (K.stats.herds || 0) + 1;
      say(a, K, `Нагнали ${t.label.replace('стадо: ', 'стадо — ')}: добыли ${pieces(n, 'паёк', 'пайка', 'пайков')} мяса и шкуру.`, 'find');
      removeThing(K, t);
    }
  }
  // what the scouts see: the first sight of a strong thing near
  // a pursuer stronger than they are: they muddle the trail and try to slip away
  const sight = (CAMPAIGN.fog.sight + (guided(K) ? HIRES.guide.sight : 0)) * scaleOf(a), P = caravanMight(K);
  for (const t of pursuers(a, K, sight)) {
    if (FOES[THINGS[t.kind].foe].might * t.strength <= P * BUBBLE.evadeAt) continue;
    if (r() < BUBBLE.evade + (guided(K) ? BUBBLE.guideEvade : 0)) {
      lose(K, t, BUBBLE.lost); K.stats.evaded = (K.stats.evaded || 0) + 1;
      if (r() < 0.5) say(a, K, `За караваном шли ${t.label}: путали следы${guided(K) ? ' по тропам проводника' : ''} и ушли от погони.`, 'sight');
    }
  }
  // (only what matters: a world's party, or a thing as strong as the caravan)
  for (const t of sighted(a, K, sight)) {
    const strong = FOES[THINGS[t.kind].foe].might * t.strength > caravanMight(K) * BUBBLE.strong;
    if (t.party || strong) say(a, K, `Разведчики заметили неподалёку: ${t.label}${strong ? ' — сила за ними большая' : ''}.`, 'sight');
  }
}

// a merchants' train met on the road: it sells food dearer than a town and buys hides cheaper
function roadTrade(a, K, t) {
  const parts = [];
  if (K.cargo.hide) { const g = Math.round(K.cargo.hide * (RESOURCES.get('hide').value ?? 0.5) * TRAIN.sell * 10) / 10; parts.push(`продали шкуры (${K.cargo.hide}) за ${g} зол.`); K.gold = Math.round((K.gold + g) * 10) / 10; delete K.cargo.hide; }
  const price = MARKET.ration * TRAIN.buy, need = alive(K).length * CAMPAIGN.ration;
  const room = Math.max(0, capacity(K) - load(K)), n = Math.floor(Math.min(t.goods || 0, room, need * 10 - K.food, K.gold / price));
  if (n > 0) { K.food += n; K.gold = Math.round((K.gold - n * price) * 10) / 10; t.goods -= n; parts.push(`купили ${pieces(n, 'паёк', 'пайка', 'пайков')} по ${Math.round(price * 100) / 100}`); }
  K.stats.trains = (K.stats.trains || 0) + 1;
  if (parts.length) say(a, K, `На дороге встретили торговый обоз: ${parts.join('; ')}.`, 'town');
}

// one day of the campaign (the world's day `day` of the current season)
export function caravanDay(a, K, day) {
  if (ended(K)) return;
  const seasonId = SEASON_LIST[a.hist.season].id, before = {town: townAt(a, K.i)?.id, biome: biomeAt(a, K.i)?.id};
  assign(K);
  K.dayIn = day % SEASON_DAYS;   // the day of the season: a camp on the local map begins on it (campaign/camp.js)
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
  // the first days of a stop to hunt and gather are played on the local map (campaign/fight.js playStop):
  // what the land gave there is the day's forage
  const onMap = camping && K.why === 'food' && K.mode !== 'auto' && (K.stopPlayed ?? 0) < CAMP.stop.maxDays && core(K).length;
  if (onMap) { K.stopPlayed = (K.stopPlayed ?? 0) + 1; playStop(a, K); }
  if (!town && core(K).length) { const rb = draw(K, 'bubble'); dayMeetings(a, K, rb.r, !camping); rb.done(); }
  const forage = ms.length * (camping ? Fo.camp * campFx(K, 'forage') : Fo.march) * rich * (1 - Fo.spread / 2 + Fo.spread * r());
  if (!town && !onMap) K.food += forage;
  // the meal
  const need = mouths(K) * CAMPAIGN.ration, eat = Math.min(K.food, need), fed = eat / need;   // a captive on a cut ration eats less (campaign/captives.js)
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
  crownHands(K, (text, kind) => say(a, K, text, kind));
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
    K.lostWith = alive(K).map(m => m.id);   // their fates are told in the epilogue (campaign/ending.js)
    for (const m of alive(K)) { m.alive = false; m.left = {day: K.day, year: a.hist.year}; }
    K.phase = 'lost';
    say(a, K, 'Никого из тех, кто вышел из столицы, не осталось в живых. Караван не дойдёт.', 'end', true);
  }
  if (!ended(K) && K.day >= CAMPAIGN.maxYears * 30 * SEASONS_PER_YEAR) { K.phase = 'timeout'; say(a, K, `Прошло ${CAMPAIGN.maxYears} лет: караван так и не вернулся.`, 'end', true); }
  // what they can carry, again: the night's loot, the morning's finds, the town's buys, someone gone
  assign(K); overflow(K);
  reveal(a, K, K.i, CAMPAIGN.fog.sight * scaleOf(a) + (guided(K) ? HIRES.guide.sight * scaleOf(a) : 0));
  // the quest: what the scouts see of the places sought; with the crown, the world's pursuit
  if (K.quest && !ended(K)) {
    const tell = (text, kind, world, who) => say(a, K, text, kind, world, who), {r: rq, done: dq} = draw(K, 'pursuit');
    questSight(a, K, tell); pursuit(a, K, rq, tell); dq();
  }
  K.track.push([Math.round(K.x * 100) / 100, Math.round(K.y * 100) / 100]);
  const p = (a.parties || []).find(x => x.id === K.party);
  if (p) { p.x = K.x; p.y = K.y; p.i = K.i; p.men = alive(K).length; p.goal = K.goal; if (ended(K)) p.state = 'gone'; }
  K.day++;
}

