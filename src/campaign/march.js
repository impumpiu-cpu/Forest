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
import {gearDef} from '../agents/equipment.js';
import {townAt} from '../atlas/peoples.js';
import {trades, atWar} from '../atlas/diplomacy.js';
import {realmLabel} from '../atlas/realms.js';
import {biomeAt} from '../atlas/biomes.js';
import {townLabel} from '../atlas/towns.js';
import {faunaLevel} from '../world/region.js';
import {SEASONS, SEASON_DAYS} from '../data/seasons.js';
import {BUILDINGS} from '../data/buildings.js';
import {NORM} from '../data/special.js';
import {CAMPAIGN, FOES, RETINUE, MINE} from '../data/campaign.js';
import {ORES} from '../data/ores.js';
import {BEASTS, VEHICLES, GETTING, FODDER, ROUTE} from '../data/transport.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {plural} from '../core/util.js';
import {richness, seasonFood, dangers, nightRisk, pasture, cellRegion, withCompany} from './land.js';
import {route, stepCost} from './path.js';
import {assign, capacity, cargoLoad, load, overflow, slowest, wheeled, campFx, toolTier, metalTier, fieldBuildings, buildDays, handler, campOf, hasBuilding} from './baggage.js';
import {draw} from './start.js';
import {fight, playStop} from './fight.js';
import {brewDay, mendDay, brewTheDay, wearOff} from './potions.js';
import {PACE_RULES} from '../data/road.js';
import {questArrive, questTarget, questSight, pursuit, crownHands, rumour, askable} from './quest.js';
import {epicDay} from './epic.js';
import {CAMP} from '../data/camp.js';
import {stepBubble, huntersNear, sighted, settle, removeThing, pursuers, lose, hunting} from './bubble.js';
import {BUBBLE, THINGS, TRAIN, HERD} from '../data/bubble.js';
import {RESOURCES} from '../data/resources.js';
import {QUEST} from '../data/quest.js';
import {standing, townName, townLine, trade, labour, healHere, hire, companion, rationPrice} from './town.js';
import {HIRES, ROLES, LOYALTY, SMITH, VISIT, EARN, WANTS, MARKET, CONTRACT} from '../data/market.js';
import {room} from './company.js';
import {SPECIES} from '../data/species.js';
import {free, unbind, mouths, captivesEvening, freedomEvening} from './captives.js';
import {nameCaravanMasters} from './masters.js';
import {morningFind} from './finds.js';
import {leaderSlain, livingLeaders} from '../atlas/leaders.js';
import {wherePhrase, lairAt, revealLair, felt, R as lairR} from '../atlas/lairs.js';
import {LEADER, TRIBE_RAID, LAIRS, WILD} from '../data/lairs.js';
import {termsOf, choosePace, paceOf} from './road.js';
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
// the years a campaign has: an epic one its own (data/calamities.js EPIC.years), any other CAMPAIGN.maxYears
export const yearsOf = K => K.years ?? CAMPAIGN.maxYears;
export const ended = K => ['won', 'lost', 'timeout'].includes(K.phase);
// ended, and its epilogue told (campaign/ending.js)
export const finished = K => ended(K) && (!K.epilogue || K.epilogue.done);
export const rank = (K, m) => (m.captive ? (m.gender === 'f' ? 'пленная' : 'пленный') : m.former ? (m.gender === 'f' ? 'бывшая рабыня' : 'бывший раб') : RETINUE[K.people][m.role]?.[0] || HIRES[m.role]?.label || ROLES[m.role] || 'спутник');
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
const itemDef = id => gearDef(id);
export function memberMight(m) {
  if (m.captive) return 0;   // a captive fights for nobody but itself (campaign/captives.js)
  const M = CAMPAIGN.might, s = m.special || {};
  const dmg = Math.max(0, ...m.gear.hand.map(id => itemDef(id)?.melee?.dmg ?? 0), itemDef(m.gear.hand.find(id => itemDef(id)?.ranged))?.ranged?.dmg ?? 0);
  const armor = itemDef(m.gear.body)?.armor ?? 0;
  return M[m.role] * (1 + M.perDmg * Math.max(0, dmg - 1)) * (1 + M.perArmor * armor) * (1 + M.perStr * ((s.S ?? NORM) - NORM)) * (0.3 + 0.7 * m.hp);
}
export const caravanMight = K => alive(K).reduce((s, m) => s + memberMight(m), 0);

export const frosty = (a, K, seasonId) => seasonId === 'winter' && a.f.temp[K.i] - a.f.trange[K.i] / 2 < 0;
// cells a day: as the slowest who walks (campaign/baggage.js), slower hungry and in frost
export function pace(a, K, seasonId) {
  let v = CAMPAIGN.speed * scaleOf(a) * slowest(K) * (guided(K) ? HIRES.guide.pace : 1);
  if (K.hungry > 0) v *= CAMPAIGN.hunger.slow;
  if (frosty(a, K, seasonId) && K.warm !== K.day) v *= CAMPAIGN.frost;   // (a warming brew for everyone: no slower — caravanDay)
  return v * paceOf(K).speed;   // the pace the council keeps (data/road.js PACES; normal — × 1)
}

export function die(a, K, m, why) {
  if (m.gender === 'f') why = why.replace(/^(умер|пал|погиб)(?=\s)/, w => ({умер: 'умерла', пал: 'пала', погиб: 'погибла'})[w]);
  m.alive = false; m.hp = 0; m.ride = null; m.died = {day: K.day, year: a.hist.year, why, ...(K.fightSrc ? {src: K.fightSrc} : {})};
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
  for (const v of K.vehicles) parts.push(VEHICLES[v.kind].label);
  const out = parts.join(', ') || 'только то, что на спинах', camp = campOf(K);
  return camp.length ? `${out}; лагерь: ${camp.map(id => BUILDINGS.get(id).name).join(', ')}` : out;
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
const WHICH = {m: 'котором', n: 'котором', f: 'которой', pl: 'которых'};   // «о котором / которой / которых» by the lair's noun
function entered(a, K, before) {
  const b = biomeAt(a, K.i), t = townAt(a, K.i);
  // a hidden lair of the wild (atlas/lairs.js): the caravan walks into its land and the world learns of it
  // (or comes near where its folk live thick: their trail leads to it)
  const hid = lairAt(a, K.i);
  if (hid?.hidden) { const L = LAIRS.get(hid.kind); revealLair(a, hid, 'караван'); say(a, K, `Караван набрёл на ${L.labelAcc || L.label} «${hid.name}» ${wherePhrase(a, hid.i)}, о ${WHICH[L.g]} не знала ни одна держава.`, 'sight', true); }
  for (const l of a.lairs || []) {
    if (!l.alive || !l.hidden) continue;
    const L = LAIRS.get(l.kind);
    if (Math.hypot(l.x - K.x, l.y - K.y) > 2 * lairR(a, L) || felt(a, l) < WILD.trail) continue;
    revealLair(a, l, 'караван');
    say(a, K, `Караван шёл по следам — ${SPECIES.get(L.species).plural} — и вышел на ${L.labelAcc || L.label} «${l.name}» ${wherePhrase(a, l.i)}, о ${WHICH[L.g]} не знала ни одна держава.`, 'sight', true);
  }
  if (t && t.id !== before.town) say(a, K, `Караван пришёл в ${townLabel(t, 1)} ${t.name}${t.realm && t.realm !== K.realm ? ` (${realmLabel(a, t.realm)})` : ''}.`);
  else if (b && b.id !== before.biome && !t) say(a, K, `Караван идёт ${b.where}.`, 'land');
}

// a day in camp: beasts tamed where they live, baskets woven, the building goes on, potions brewed in the healer's hut
function campWork(a, K, r) {
  const b = biomeAt(a, K.i), reg = cellRegion(a, K.i), wooded = (b?.trees ?? 0) >= 0.3;
  const brewed = brewDay(K, r, wooded);
  if (brewed) { K.stats.brewed = (K.stats.brewed || 0) + brewed; if (!K.brewTold || K.day - K.brewTold > 60) { K.brewTold = K.day; say(a, K, `В хижине лекаря сварили зелье лечения${brewed > 1 ? ` (${brewed})` : ''}: зелий в поясах ${alive(K).reduce((s, m) => s + (m.potions || 0), 0)}.`, 'build'); } }
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
        if (!hasBuilding(K, B.id)) { campOf(K).push(B.id); { const d = BUILDINGS.get(B.id), it = d.gender === 'f' ? 'она' : d.gender === 'n' ? 'оно' : 'он'; say(a, K, `Срубили «${d.name}»: теперь ${it} с караваном и встаёт на каждой стоянке.`, 'build'); } }
      } else {
        K.vehicles.push({kind: B.kind, pulled: false});
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

// ── a stop to dig (data/campaign.js MINE): the best ore worth stopping for on the cell the caravan stands on.
// An ore of a metal only above the caravan's own; silver, gems, gold sand (with a pan) — while it is short of gold.
// → {ore, level} or null
// the room left to dig into: what food for MINE.food days would take is kept for it
const digRoom = K => Math.max(0, capacity(K) - load(K) - Math.max(0, alive(K).length * CAMPAIGN.ration * MINE.food - K.food));
export function wantMine(a, K) {
  if (K.food < alive(K).length * CAMPAIGN.ration * MINE.food || digRoom(K) < MINE.room || (K.mined || []).includes(K.i)) return null;   // not while the food runs low
  const tier = metalTier(K), poor = K.gold < MINE.rich, reg = cellRegion(a, K.i);
  let best = null, bv = 0;
  for (const id of MINE.ores) {
    const O = ORES.get(id), lvl = reg.ores?.[id] ?? 0;
    if (lvl <= 0 || (O.tier ? O.tier <= tier : !poor)) continue;
    const v = lvl * (O.tier ? 1 + O.tier : 1);
    if (v > bv) { bv = v; best = {ore: id, level: lvl}; }
  }
  if (poor && reg.placer > bv && free(K).some(m => m.gear.hand.includes('pan'))) best = {ore: 'placer', level: reg.placer};
  return best;
}
const mineRes = ore => (ore === 'placer' ? 'goldDust' : ORES.get(ore).resource);
const mineLabel = ore => (ore === 'placer' ? 'золотой песок' : ORES.get(ore).label);
// a day of digging in the quick mode: the diggers (Strength enough; gold sand — the one with the pan) bring the
// face's units, as far as the face and the room go
function autoMine(a, K, r) {
  const ore = K.why.slice(5), reg = cellRegion(a, K.i), lvl = ore === 'placer' ? reg.placer : reg.ores?.[ore] ?? 0, res = mineRes(ore);
  const diggers = ore === 'placer' ? (free(K).some(m => m.gear.hand.includes('pan')) ? 1 : 0) : free(K).filter(m => (m.special?.S ?? NORM) >= MINE.strength && m.hp >= 0.5).length;
  const room = Math.floor(digRoom(K) / (RESOURCES.get(res).bulk || 1));
  const n = Math.min(room, Math.round(MINE.auto[ore] * lvl * diggers * (0.6 + 0.8 * r())));
  if (n > 0) K.cargo[res] = (K.cargo[res] || 0) + n;
  return n;
}

// the way to the goal: with the wheels along the roads, or straight on foot; the wheels are kept when
// the road is not too much longer (data/transport.js ROUTE), otherwise left behind
function plan(a, K) {
  const foot = route(a, K.i, K.goal, K.people, false);
  let way = foot;
  if (wheeled(K)) {
    const road = route(a, K.i, K.goal, K.people, true), keep = ROUTE.keep;
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
  // the wheels first, when they can be had (room for the goods), then the camp: a building it lacks (it needs no wagon)
  const draft = K.beasts.some(b => BEASTS[b.kind].pulls >= 1) || K.beasts.filter(b => BEASTS[b.kind].pulls > 0).length >= 2;
  if (!has('wagon') && tier >= VEHICLES.wagon.tool && draft && fit()) return {kind: 'wagon', days: days(VEHICLES.wagon.days)};
  if (!has('wagon') && !has('cart') && tier >= VEHICLES.cart.tool && fit()) return {kind: 'cart', days: days(VEHICLES.cart.days)};
  const b = fieldBuildings().find(x => !hasBuilding(K, x.id));
  return b ? {kind: 'building', id: b.id, days: days(buildDays(b))} : null;
}

// ── towns on the way (campaign/town.js): why the council would turn to one, and which one
const freezing = (a, i) => a.f.temp[i] - a.f.trange[i] / 2 < VISIT.winterBelow;
function wantVisit(a, K, seasonId) {
  const ms = alive(K), need = ms.length * CAMPAIGN.ration, C = CAMPAIGN.camp;
  if ((seasonId === 'winter' || (seasonId === 'autumn' && a.hist && K.day % 30 >= 20)) && freezing(a, K.i) && K.winterYear !== a.hist.year) return 'winter';
  if (K.day < (K.nextVisit ?? 0)) return '';   // just out of a town: on to the goal first
  if (K.food < need * Math.max(C.foodDays, VISIT.foodAt)) return 'food';   // (looked for while there is food to reach it)
  if (free(K).some(m => m.hp < C.badly)) return 'heal';   // a captive's wounds turn no caravan aside (campaign/captives.js)
  // ore for the smith (data/market.js SMITH): enough for a piece; a town with a smith is looked for further than a shop
  if (smithOre(K) >= VISIT.smithOre && K.gold >= VISIT.smithGold && !(K.smithTried > K.day)) return 'smith';
  if (K.gold >= VISIT.money && K.day - (K.lastVisit ?? -999) >= VISIT.every) return 'shop';
  return '';
}
// a friendly town that can be reached: one on the way to the goal — ahead of the caravan (nearer the goal
// than it is) and not much of a detour; when `urgent` (the winter, the badly wounded) and there is none
// ahead, the nearest one whichever way
// units of ore of a metal above the caravan's own (the smith makes it into a piece of that metal)
const smithOre = K => { const tier = metalTier(K); return ORES.all().filter(o => o.tier > tier).reduce((n, o) => n + (K.cargo[o.resource] || 0), 0); };
const smithAt = t => SMITH.at.some(id => t.built.includes(id));
function findTown(a, K, urgent, detour = VISIT.detour, days = VISIT.reach, only = null) {
  const v = Math.max(0.05, pace(a, K, SEASON_LIST[a.hist.season].id)), R = days * v, x0 = K.i % a.w, y0 = (K.i / a.w) | 0, wh = wheeled(K);
  const near = (a.towns || []).filter(t => t.alive && standing(a, K, t) && (!only || only(t)) && Math.hypot(t.x - x0, t.y - y0) <= R).sort((p, q) => Math.hypot(p.x - x0, p.y - y0) - Math.hypot(q.x - x0, q.y - y0)).slice(0, 4);
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
const VISIT_WHY = {smith: 'отдать руду кузнецу', winter: 'перезимовать', food: 'купить еды', heal: 'подлечить раненых', shop: 'потратить казну', rumour: 'расспросить о следах'};

// the caravan comes into a town: trade, hire, meet who would go along
function enterTown(a, K, t) {
  const st = standing(a, K, t), why = K.viaWhy;
  K.via = null; K.viaWhy = null; K.path = null; K.camp = 0; K.why = '';
  if (!st) { say(a, K, `${townName(t)} закрыл ворота перед караваном.`, 'town'); return; }
  const {r, done} = draw(K, 'town');
  const parts = [...trade(a, K, t, st), ...hire(a, K, t, st, r)], c = companion(a, K, t, st, r), heard = rumour(a, K, t, r);
  if (c) parts.push(c);
  if (heard) parts.push(heard);
  // rumours of a leader of an old lair near (atlas/leaders.js): the nearest not yet told, within its raids' reach
  const ofLeader = leaderRumour(a, K, t);
  if (ofLeader) parts.push(ofLeader);
  done();
  K.inTown = {id: t.id, since: K.day, why}; K.lastVisit = K.day; K.stats.towns = (K.stats.towns || 0) + 1;
  if (why === 'winter') K.winterYear = a.hist.year;
  say(a, K, `Караван вошёл в ${townLine(a, t, st)}${why === 'winter' ? ' на зимовку' : ''}${parts.length ? ': ' + parts.join('; ') : ''}. Казна: ${K.gold} зол.`, 'town');
}

// an evening in town: stay (the winter through, or till healed and stocked), or go on, spending the earnings
function townEvening(a, K, seasonId) {
  const t = a.towns.find(x => x.id === K.inTown.id), st = standing(a, K, t), ms = alive(K);
  const stocked = K.food >= 0.9 * Math.min(capacity(K) - cargoLoad(K), ms.length * CAMPAIGN.ration * WANTS.foodDays);
  const healed = free(K).every(m => m.hp >= CAMPAIGN.camp.healed);   // (nobody waits in town for a captive to heal)
  const wintering = K.inTown.why === 'winter' && (seasonId === 'winter' || seasonId === 'autumn');
  if (st && (wintering || (K.day - K.inTown.since < VISIT.stay && !(stocked && healed)))) return;
  // too poor to stock up for the way: they hire out for board and pay (the town feeds them, the pay is kept) a while
  const short = Math.max(0, Math.min(capacity(K) - cargoLoad(K), ms.length * CAMPAIGN.ration * WANTS.foodDays) - K.food) * (st ? rationPrice(t, st, termsOf(a, K, t).buy) : Infinity);
  if (st && !stocked && K.gold < short && K.day - K.inTown.since < VISIT.work) {
    if (!K.inTown.work) { K.inTown.work = true; K.stats.worked = (K.stats.worked || 0) + 1; say(a, K, `Денег на припасы нет: караван нанялся в ${townLabel(t, 3)} ${t.name} в работу за харчи и плату.`, 'town'); }
    return;
  }
  const parts = st ? trade(a, K, t, st) : [];
  say(a, K, `Караван выходит из ${townLabel(t, 2)} ${t.name}${parts.length ? ': ' + parts.join('; ') : ''}. Казна: ${K.gold} зол.`, 'town');
  K.inTown = null; K.path = null; K.nextVisit = K.day + VISIT.every;
}

// those who are not the core: the hired go when their term is up, the joined may go any day
function people(a, K, r) {
  captivesEvening(a, K, r, (text, kind, who) => say(a, K, text, kind, false, who));   // the captives' evening (campaign/captives.js)
  nameCaravanMasters(K, (text, kind, who) => say(a, K, text, kind, false, who));   // the caravan's masters (campaign/masters.js)
  freedomEvening(a, K, (text, kind, who) => say(a, K, text, kind, false, who));   // captives freed, former slaves taken in (campaign/captives.js)
  // the best talker of those who lead keeps the joined: charm × (Charisma − 5)
  const charm = LOYALTY.charm * (Math.max(NORM, ...core(K).map(m => m.special?.C ?? NORM)) - NORM);
  for (const m of alive(K)) {
    if (isCore(m)) continue;
    if (m.contract) { contractDay(a, K, m, r); continue; }
    if (m.loyalty == null || m.loyalty >= 1) continue;
    // a day with the caravan: hunger, a bad wound, the sight of captives on a cut ration — and the leader's word
    const d = LOYALTY.daily + (K.hungry ? LOYALTY.hungry : 0) + (m.hp < 0.5 ? LOYALTY.hurt : 0) + (K.captiveCut ? LOYALTY.cruel : 0) + charm;
    m.loyalty = Math.max(0, Math.min(1, m.loyalty + d));
    if (r() < LOYALTY.leave * (1 - m.loyalty) ** 2) leave(a, K, m, `${m.name}, ${rank(K, m)}, ${K.hungry ? `не вынес${m.gender === 'f' ? 'ла' : ''} голода и` : 'однажды утром'} ${m.gender === 'f' ? 'ушла' : 'ушёл'} своей дорогой`);
    else if (m.loyalty >= 1) say(a, K, `${m.name} теперь свой${m.gender === 'f' ? '' : ''}: идёт с караваном до конца.`, 'people');
  }
}
// a hireling's day (data/market.js CONTRACT): the opinion of the service moves; a bad one may desert; at the end
// of the term it stays for good, asks for another term, or goes
function contractDay(a, K, m, r) {
  const C = CONTRACT, c = m.contract, f = m.gender === 'f';
  c.opinion = Math.max(0, Math.min(1, (c.opinion ?? C.start) + C.daily + (K.hungry ? C.hungry : 0) + (m.hp < 0.5 ? C.hurt : 0)));
  if (K.day < c.until) {
    if (c.opinion < C.desert && r() < C.deserts) { K.stats.deserted = (K.stats.deserted || 0) + 1; leave(a, K, m, `${m.name}, ${rank(K, m)}, не дождал${f ? 'ась' : 'ся'} конца срока и сбежал${f ? 'а' : ''}: служба ${f ? 'ей' : 'ему'} опостылела`); }
    return;
  }
  if (c.opinion >= C.stay && !room(K, 'stay')) {   // it would stay, but the joined are full: it goes with thanks
    K.stats.stayFull = (K.stats.stayFull || 0) + 1;
    leave(a, K, m, `${m.name}, ${rank(K, m)}, отслужил${f ? 'а' : ''} срок и остал${f ? 'ась' : 'ся'} бы с караваном, но места в отряде нет: ${f ? 'ушла' : 'ушёл'} с благодарностью`);
    return;
  }
  if (c.opinion >= C.stay) {
    m.contract = null; m.loyalty = 1; K.stats.stayed = (K.stats.stayed || 0) + 1;
    say(a, K, `${m.name}, ${rank(K, m)}, отслужил${f ? 'а' : ''} срок и остал${f ? 'ась' : 'ся'} с караваном без платы: теперь ${f ? 'своя' : 'свой'}.`, 'people', false, [m.id]);
    return;
  }
  const cost = Math.round(c.wage * C.days * 10) / 10, keep = alive(K).length * CAMPAIGN.ration * MARKET.ration * C.reserve;
  if (c.opinion >= C.extend && K.gold - cost >= keep) {
    K.gold = Math.round((K.gold - cost) * 10) / 10; c.until = K.day + C.days; K.stats.extended = (K.stats.extended || 0) + 1;
    say(a, K, `${m.name}, ${rank(K, m)}, попросил${f ? 'а' : ''} продлить службу: ещё ${C.days} дней за ${cost} зол.`, 'people', false, [m.id]);
    return;
  }
  leave(a, K, m, `${m.name}, ${rank(K, m)}, отслужил${f ? 'а' : ''} срок и ${f ? 'ушла' : 'ушёл'}${c.opinion >= C.extend ? ': продлить было нечем' : ''}`);
}
function leave(a, K, m, text) {
  m.alive = false; m.ride = null; m.left = {day: K.day, year: a.hist.year};
  say(a, K, text + '.', 'leave'); assign(K);
}
export const shake = (K, d) => {
  for (const m of alive(K)) if (m.loyalty != null && m.loyalty < 1) m.loyalty = Math.max(0, Math.min(1, m.loyalty + d));
  // hirelings: a won fight speaks for the service, a lost one against it (data/market.js CONTRACT)
  for (const m of alive(K)) if (m.contract) m.contract.opinion = Math.max(0, Math.min(1, (m.contract.opinion ?? CONTRACT.start) + (d > 0 ? CONTRACT.won : CONTRACT.lost)));
};

function homecoming(a, K, ms) {
  const t = a.towns.find(x => x.id === K.capital), Q = K.quest;
  say(a, K, `Караван вернулся в ${t ? `${townLabel(t, 1)} ${t.name}` : 'родные края'}${Q ? (Q.epic ? ` — ${Q.name} отныне в столице, и сила бедствия сломлена` : ` с короной — ${Q.name} снова дома`) : ''}: ${ms.length} из ${K.members.length}, ${Math.round(K.day / 120 * 10) / 10} лет в пути; в обозе ${baggageText(K)}.`, 'home', true);
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
    const busy = !K.inTown && K.via == null && questArrive(a, K, r, d => fight(a, K, d, r, 'guard'), tell, caravanMight(K));
    const any = K.members.some(m => m.alive && isCore(m));
    if (any && K.phase === 'back' && K.i === K.home && K.quest.crown.state === 'carried') { done(); homecoming(a, K, ms); return; }
    const g = any ? questTarget(a, K, r, tell) : null;
    if (g !== K.goal) { K.goal = g; K.path = null; }
    // nothing known of where to look: the council goes to a town to ask
    if (g == null && K.via == null && !K.inTown && askable(K)) {
      const found = findTown(a, K, true, VISIT.detour, VISIT.winterReach);
      K.quest.askAt = K.day + QUEST.rumour.again;
      if (found) { K.via = found.t.id; K.viaWhy = 'rumour'; K.path = found.way.path; K.k = 0; say(a, K, `Совет: где искать дальше, не знает никто — свернуть в ${townLabel(found.t, 1)} ${found.t.name} расспросить старожилов.`, 'town'); if (!K.path.length) enterTown(a, K, found.t); }
    }
    done();
    if (busy || !K.members.some(m => m.alive && isCore(m))) return;
  } else if (K.goal != null && K.i === K.goal && K.phase === 'out') {   // a campaign from before the quest: there and back
    say(a, K, `Караван дошёл до цели — ${biomeAt(a, K.i)?.where || 'на край света'}. Поручение исполнено, пора домой.`, 'goal', true);
    K.phase = 'back'; K.goal = K.home; K.path = null;
  } else if (K.phase === 'back' && K.i === K.home) { homecoming(a, K, ms); return; }
  // a town on the way: to buy food, to heal, to spend the treasury, to winter
  // a long hunger where the land does not feed them, or that wears them down: back to a town, however far, a camp to
  // forage broken for it
  const worn = () => { const fs = free(K); return fs.reduce((s, m) => s + m.hp, 0) / Math.max(1, fs.length) < CAMPAIGN.camp.hp; };
  const barren = K.hungry >= VISIT.retreat && (richness(a, K.i) * seasonFood(a, K.i, seasonId) < CAMPAIGN.camp.foodLand || worn());
  if (K.via == null && (K.camp === 0 || (barren && K.why === 'food'))) {
    const why = wantVisit(a, K, seasonId);
    // urgent — any way to the nearest: the winter, the badly wounded, hunger with the gold to end it
    const urgent = why === 'winter' || (why === 'heal' && free(K).some(m => m.hp < CAMPAIGN.camp.badly)) || (why === 'food' && K.hungry > 0);   // (starving, any way: a friendly town feeds them even without gold — campaign/town.js)
    // (starving, the food left gives no measure: a town within winterReach; on barren land after `retreat` days of it, within retreatReach)
    const days = why === 'winter' || why === 'smith' ? VISIT.winterReach : why === 'food' ? (barren ? VISIT.retreatReach : K.hungry ? VISIT.winterReach : Math.min(VISIT.reach, K.food / need + VISIT.foodSpare)) : VISIT.reach;
    const found = why && findTown(a, K, urgent, K.hungry ? VISIT.hungryDetour : why === 'smith' ? VISIT.smithDetour : VISIT.detour, days, why === 'smith' ? smithAt : null);
    if (why === 'smith' && !found) K.smithTried = K.day + VISIT.smithRetry;   // no smith near: look again later (a shop may do now)
    if (found) {
      K.via = found.t.id; K.viaWhy = why; K.path = found.way.path; K.k = 0; K.camp = 0; K.why = '';
      say(a, K, `Совет: свернуть в ${townLabel(found.t, 1)} ${found.t.name} — ${VISIT_WHY[why]}.`, 'town');
      if (!K.path.length) enterTown(a, K, found.t);
      return;
    }
  }
  // on the way to a town: the camp breaks up (else it would stand here for good — the camp's days run below); a starving
  // caravan on rich land still stops to hunt on the way
  if (K.via != null && !(K.hungry && richness(a, K.i) >= CAMPAIGN.camp.foodLand)) { if (K.camp > 0) { K.camp = 0; K.why = ''; } return; }
  // a camp: for food when it runs short and the land can feed them, for the wounded, to tame or to build
  const fs = free(K).length ? free(K) : ms;   // the camp for the wounded is for the free, not for the captives
  const rich = richness(a, K.i), core = fs.reduce((s, m) => s + m.hp, 0) / fs.length, C = CAMPAIGN.camp;
  const stock = Math.min(capacity(K) - cargoLoad(K), need * C.stock);
  if (K.camp > 0 && ((K.why === 'food' && K.food >= C.full * stock) || (K.why === 'heal' && core >= C.healed))) K.camp = 0;
  // a stop to dig ends when the face is worked out (a poor day) or the packs are full
  if (K.camp > 0 && K.why.startsWith('mine:') && ((K.mineDay ?? 1) < MINE.quit || capacity(K) - load(K) < 1)) {
    K.camp = 0; const ore = K.why.slice(5), got = K.mineGot || 0;
    say(a, K, `Стоянка у выработки окончена: ${got ? `добыли ${mineLabel(ore)} — ${got}` : 'жила почти ничего не дала'}${capacity(K) - load(K) < 1 ? ', класть больше некуда' : ''}.`, 'camp');
  }
  if (K.camp > 0) K.camp--;
  else {
    // a quiet place: the land's dangers low; to build or to tame they also wait till nothing hunts them near
    const badly = fs.some(m => m.hp < C.badly), quiet = nightRisk(a, K.i, K) <= C.danger, calm = quiet && !huntersNear(a, K);
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
    // fed, whole and in a quiet place: an ore worth stopping for here (data/campaign.js MINE)
    if (!why && !K.hungry && calm && K.food >= need * C.foodDays && K.day >= (K.nextMine ?? 0)) {
      const m = wantMine(a, K);
      if (m) why = 'mine:' + m.ore;
    }
    if (why && K.why !== why) {
      if (why.startsWith('mine:')) { (K.mined ||= []).push(K.i); K.nextMine = K.day + MINE.maxDays + MINE.every; K.mineGot = 0; K.mineDay = MINE.quit; }
      K.camp = why === 'build' ? K.build.days + 1 : why.startsWith('mine:') ? MINE.maxDays : C.maxDays; K.why = why; K.stats.camps++; K.stopPlayed = 0;
      const left = Math.floor(K.food / need);
      const text = why === 'food' ? `${left > 0 ? `Еды осталось на ${pieces(left, 'день', 'дня', 'дней')}` : 'Еды не осталось'}: совет решил встать лагерем, охотиться и собирать.`
        : why === 'heal' ? 'Раненые еле идут: совет решил встать лагерем и отлежаться.'
          : why === 'build' ? `Совет решил встать в лесу и ${K.build.kind === 'building' ? `срубить «${BUILDINGS.get(K.build.id).name}» для лагеря` : K.build.kind === 'cart' ? 'сколотить тележку' : 'сколотить повозку'}: ${pieces(K.build.days, 'день', 'дня', 'дней')} работы.`
            : why.startsWith('mine:') ? `Здесь ${why.slice(5) === 'placer' ? 'в речном песке блестит золото' : `выходит на поверхность ${mineLabel(why.slice(5))}`}: совет решил встать и добывать.`
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
    settle(K, t, win); K.stats.met = (K.stats.met || 0) + 1; leaderBeaten(a, K, t, win);
  } else if (r() < BUBBLE.stray * (friendly ? CAMPAIGN.night.friendly : 1)) {
    const ds = dangers(a, K.i, K), d = ds.length ? withCompany(ds[(r() * ds.length) | 0], ds, r) : {...CAMPAIGN.stray};
    const won = fight(a, K, d, r, 'night'); K.stats.strays = (K.stats.strays || 0) + 1; leaderBeaten(a, K, d, won);
  } else {
    // a quiet night: a little found in the morning while they packed
    const M = CAMPAIGN.morning;
    if (r() < M.food * Math.min(1.2, richness(a, K.i) + 0.2)) { const n = Math.round(between(r, M.foodN)); K.food += n; K.stats.finds++; if (r() < 0.25) say(a, K, `Утром подстрелили дичь: +${pieces(n, 'паёк', 'пайка', 'пайков')}.`, 'find'); }
    const {r: rf, done: df} = draw(K, 'finds'), found = morningFind(a, K, rf); df();   // only where it has a reason to lie
    if (found) say(a, K, `Утром: ${found[0].toLowerCase()}${found.slice(1)}`, 'treasure');
  }
  done();
}

// what a thing of the bubble brings to a fight: its foe, its strength, and who it is on the local map
// (all a thing carries into the fight: its second kind, a cult's pool, the lair whose captives a win frees, a leader)
export const foeOf = t => ({kind: THINGS[t.kind].foe, strength: t.strength, label: t.label, band: t.band || null, beast: t.beast || null, ...(t.pursuit ? {pursuit: t.src || 'hunt'} : {}), ...(t.boss ? {boss: t.boss} : {}),
  ...(t.with ? {with: t.with} : {}), ...(t.pool ? {pool: t.pool} : {}), ...(t.leaderLair != null ? {leaderLair: t.leaderLair} : {}), ...(t.lair != null ? {lair: t.lair} : {}), ...(t.species ? {species: t.species} : {})});
// what a town tells of the leaders near it: the nearest living one within a leader's reach, once per leader
function leaderRumour(a, K, t) {
  const reach = TRIBE_RAID.reach * LEADER.reach * scaleOf(a), told = (K.leadersTold ||= []);
  const near = livingLeaders(a).filter(l => !told.includes(l.id) && Math.hypot(l.x - t.x, l.y - t.y) <= reach).sort((p, q) => Math.hypot(p.x - t.x, p.y - t.y) - Math.hypot(q.x - t.x, q.y - t.y))[0];
  if (!near) return null;
  told.push(near.id);
  return `говорят, ${wherePhrase(a, near.i)} хозяйничает ${near.leader.title[0].toLowerCase()} ${near.leader.name} из «${near.name}»`;
}

// a leader of an old lair beaten with its own: it lies dead, the world learns of it (atlas/leaders.js)
function leaderBeaten(a, K, t, win) {
  if (!win || t.leaderLair == null) return;
  leaderSlain(a, t.leaderLair);
  K.stats.leaders = (K.stats.leaders || 0) + 1;
  say(a, K, `${t.boss.name} пал от рук каравана: его логово осталось без главаря.`, 'fight', true);
}

// ── meeting the bubble by day: an ambush on the march, a merchant's train on the road, a herd to hunt
function dayMeetings(a, K, r, marched) {
  const met = stepBubble(a, K, 'day', r, guided(K));
  for (const t of met) {
    const T = THINGS[t.kind];
    if (T.mood === 'hostile' && T.ambush && marched && core(K).length && hunting(t)) {   // only one that saw them coming lies in wait
      const win = fight(a, K, foeOf(t), r, 'ambush');
      settle(K, t, win); leaderBeaten(a, K, t, win);
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
  wearOff(K);
  const ms = alive(K), {r, done} = draw(K, 'day');
  // the day: a camp or the march; food from the land either way
  const rich = richness(a, K.i) * seasonFood(a, K.i, seasonId), Fo = CAMPAIGN.forage;
  const town = K.inTown ? a.towns.find(x => x.id === K.inTown.id) : null;
  const camping = !town && (K.camp > 0 || !K.path || K.k >= K.path.length);
  if (town) {   // a day in town: work for hire, buy the day's food at the market (hired out for board: the town feeds them)
    labour(K);
    if (K.inTown.work) K.food += mouths(K) * CAMPAIGN.ration;
    const st = standing(a, K, town), price = st ? rationPrice(town, st, termsOf(a, K, town).buy) : Infinity, want = Math.max(0, ms.length * CAMPAIGN.ration * 2 - K.food);
    const n = Math.min(want, Math.floor(K.gold / price)); if (n > 0) { K.food += n; K.gold = Math.round((K.gold - n * price) * 10) / 10; }
  } else if (!camping) {
    const p = choosePace(a, K); if ((K.pace || 'normal') !== p) K.pace = p;
    // the brews of the day (campaign/potions.js): in frost everyone drinks a warming one — then the frost does not slow
    // them; with danger about the fighters drink an invigorating one — then an ambush does not catch them napping
    if (frosty(a, K, seasonId)) { K.stats.frostDays = (K.stats.frostDays || 0) + 1; if (brewTheDay(K, 'cold', ms)) K.warm = K.day; }
    if (dangers(a, K.i, K).some(d => (d.strength ?? 0) > PACE_RULES.dangerAt) && brewTheDay(K, 'tired', ms.filter(m => !m.captive && !m.former))) K.alert = K.day;
    march(a, K, pace(a, K, seasonId));
  }
  else campWork(a, K, r);
  // the first days of a stop to hunt and gather are played on the local map (campaign/fight.js playStop):
  // what the land gave there is the day's forage
  // every stop for a purpose (food, the wounded, building, taming, digging) is played on the local map, at most
  // CAMP.stop.maxDays of it (campaign/fight.js playStop): what the land gave there is the day's forage
  const onMap = camping && K.why && K.mode !== 'auto' && (K.stopPlayed ?? 0) < CAMP.stop.maxDays && core(K).length;
  if (onMap) { K.stopPlayed = (K.stopPlayed ?? 0) + 1; const got = playStop(a, K); if (K.why.startsWith('mine:')) { K.mineDay = got[mineRes(K.why.slice(5))] || 0; K.mineGot = (K.mineGot || 0) + K.mineDay; } }
  else if (camping && K.why.startsWith('mine:')) { K.mineDay = autoMine(a, K, r); K.mineGot = (K.mineGot || 0) + K.mineDay; }
  if (!town && core(K).length) { const rb = draw(K, 'bubble'); dayMeetings(a, K, rb.r, !camping); rb.done(); }
  const forage = ms.length * (camping ? Fo.camp * campFx(K, 'forage') : Fo.march * paceOf(K).forage) * rich * (1 - Fo.spread / 2 + Fo.spread * r());
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
  if (!K.hungry) { const n = mendDay(K); if (n) K.stats.mendBrews = (K.stats.mendBrews || 0) + n; }   // the badly hurt drink a strengthening brew (campaign/potions.js)
  people(a, K, r);
  crownHands(K, (text, kind) => say(a, K, text, kind));
  // the beasts graze where grass grows and starve where it does not
  const grass = pasture(a, K.i, seasonId);
  for (const b of [...K.beasts]) {
    b.hp = grass ? Math.min(1, b.hp + FODDER.regain) : b.hp - FODDER.starve * (0.5 + r());
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
  if (!ended(K) && K.day >= yearsOf(K) * 30 * SEASONS_PER_YEAR) { K.phase = 'timeout'; say(a, K, `Прошло ${yearsOf(K)} лет: караван так и не вернулся.`, 'end', true); }
  // what they can carry, again: the night's loot, the morning's finds, the town's buys, someone gone
  assign(K); overflow(K);
  reveal(a, K, K.i, CAMPAIGN.fog.sight * scaleOf(a) + (guided(K) ? HIRES.guide.sight * scaleOf(a) : 0));
  // the quest: what the scouts see of the places sought; with the crown, the world's pursuit
  if (K.quest && !ended(K)) {
    const tell = (text, kind, world, who) => say(a, K, text, kind, world, who), {r: rq, done: dq} = draw(K, 'pursuit');
    questSight(a, K, tell); pursuit(a, K, rq, tell); epicDay(a, K, rq, tell); dq();
  }
  K.track.push([Math.round(K.x * 100) / 100, Math.round(K.y * 100) / 100]);
  const p = (a.parties || []).find(x => x.id === K.party);
  if (p) { p.x = K.x; p.y = K.y; p.i = K.i; p.men = alive(K).length; p.goal = K.goal; if (ended(K)) p.state = 'gone'; }
  K.day++;
}

