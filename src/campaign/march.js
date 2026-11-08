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
import {toTown} from '../atlas/index.js';
import {scaleOf} from '../atlas/index.js';
import {gearDef} from '../local/index.js';
import {townAt} from '../atlas/index.js';
import {trades, atWar} from '../atlas/index.js';
import {realmLabel} from '../atlas/index.js';
import {biomeAt} from '../atlas/index.js';
import {townLabel} from '../atlas/index.js';
import {faunaLevel} from '../local/index.js';
import {SEASONS, SEASON_DAYS} from '../data/seasons.js';
import {BUILDINGS} from '../data/buildings.js';
import {NORM} from '../data/special.js';
import {CAMPAIGN, FOES, RETINUE, MINE, COUNCIL, isFighter, inLine} from '../data/campaign.js';
import {BEASTS, VEHICLES, GETTING, FODDER, ROUTE, CAMP_KIT, kitOf} from '../data/transport.js';
import {YEAR_DAYS} from '../data/atlas.js';
import {plural} from '../core/util.js';
import {personOf, personDies, personCaptured, memberFate} from '../atlas/index.js';
import {sceneLosses} from '../atlas/index.js';
import {goHome} from '../atlas/index.js';
import {richness, seasonFood, dangers, nightRisk, pasture, cellRegion, withCompany} from './land.js';
import {route, stepCost} from './path.js';
import {assign, capacity, cargoLoad, load, overflow, slowest, wheeled, campFx, toolTier, fieldBuildings, buildDays, handler, campOf} from './baggage.js';
import {draw} from './start.js';
import {fight, playStop} from './fight.js';
import {brewDay, mendDay, brewTheDay, wearOff} from './potions.js';
import {PACE_RULES} from '../data/road.js';
import {questArrive, questTarget, questSight, pursuit, crownHands, askable} from './quest.js';
import {epicDay} from './epic.js';
import {CAMP} from '../data/camp.js';
import {stepBubble, huntersNear, sighted, settle, removeThing, pursuers, lose, hunting} from './bubble.js';
import {BUBBLE, THINGS, TRAIN, HERD} from '../data/bubble.js';
import {RESOURCES} from '../data/resources.js';
import {QUEST} from '../data/quest.js';
import {standing, labour, healHere, rationPrice} from './town.js';
import {HIRES, ROLES, VISIT, EARN, MARKET} from '../data/market.js';
import {SPECIES} from '../data/species.js';
import {GOLEM_REPAIR} from '../data/constructs.js';
import {free, unbind, mouths} from './captives.js';
import {morningFind} from './finds.js';
import {wherePhrase, lairAt, revealLair, felt, R as lairR} from '../atlas/index.js';
import {LAIRS, WILD} from '../data/lairs.js';
import {termsOf, choosePace, paceOf} from './road.js';
import {wantVisit, findTown, smithAt, VISIT_WHY, enterTown, townEvening, noteCaravan, councilWeight, readout, isGoOn} from './visit.js';
import {pointCommands, allowed} from '../data/commands.js';
import {pickLanes, tracing} from '../core/decide.js';
import {people} from './people.js';
import {fadeDay, noteFate, tell, reconcile} from './social.js';
import {nightWatch, tiredOf, offDuty, escortAsk} from './duty.js';
import {ferryPlan, sailDay, aboard} from './ferry.js';
import {councilChoose} from './council.js';
import {DUTY} from '../data/social.js';
import {wantMine, mineRes, mineLabel, autoMine} from './mine.js';
import {share, levelEvening, levelsNow, autoWork} from './experience.js';

const SEASON_LIST = SEASONS.all();
const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const xyOf = (a, i) => [i % a.w, (i / a.w) | 0];
const pieces = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;

// the A* buffers for the world's own path search (atlas/roads.js findPath): the caravan's own (campaign/path.js)
export {scratchOf as scratch} from './path.js';

export const alive = K => K.members.filter(m => m.alive);
// the eight who set out from the capital (saves from before the joiners: the knights and squires)
export const isCore = m => m.core ?? isFighter(m);
export const core = K => K.members.filter(m => m.alive && isCore(m));
const guided = K => alive(K).some(m => m.role === 'guide');
// the years a campaign has: an epic one its own (data/calamities.js EPIC.years), any other CAMPAIGN.maxYears
export const yearsOf = K => K.years ?? CAMPAIGN.maxYears;
export const ended = K => ['won', 'lost', 'timeout'].includes(K.phase);
// ended, and its epilogue told (campaign/ending.js)
export const finished = K => ended(K) && (!K.epilogue || K.epilogue.done);
export const rank = (K, m) => (m.captive ? (m.gender === 'f' ? 'пленная' : 'пленный') : m.former ? (m.gender === 'f' ? 'бывшая рабыня' : 'бывший раб') : (isFighter(m) ? RETINUE[K.people].title[0] : null) || HIRES[m.role]?.label || ROLES[m.role] || 'спутник');
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

// a stop's food: × the people's dish in the cauldron (data/transport.js CAMP_KIT.dish), × the people's way with wooded land
// (PEOPLE_KIT forage.wood: the elves)
export const stopFood = (a, K) => campFx(K, 'food') * ((biomeAt(a, K.i)?.trees ?? 0) >= CAMPAIGN.camp.wooded ? kitOf(K).forage?.wood ?? 1 : 1);

// ── the members
const itemDef = id => gearDef(id);
export function memberMight(m) {
  if (m.captive) return 0;   // a captive fights for nobody but itself (campaign/captives.js)
  const M = CAMPAIGN.might, s = m.special || {};
  const dmg = Math.max(0, ...m.gear.hand.map(id => itemDef(id)?.melee?.dmg ?? 0), itemDef(m.gear.hand.find(id => itemDef(id)?.ranged))?.ranged?.dmg ?? 0);
  const armor = itemDef(m.gear.body)?.armor ?? 0;
  return (M[m.role] ?? M.fighter) * (1 + M.perDmg * Math.max(0, dmg - 1)) * (1 + M.perArmor * armor) * (1 + M.perStr * ((s.S ?? NORM) - NORM)) * hurtMight(m.hp);
}
// the share of its might a fighter keeps with this much health
const hurtMight = hp => CAMPAIGN.might.hurt[0] + CAMPAIGN.might.hurt[1] * hp;
export const caravanMight = K => alive(K).reduce((s, m) => s + memberMight(m), 0)
  + K.beasts.reduce((s, b) => s + (BEASTS[b.kind]?.golem && b.hp > 0 ? (CAMPAIGN.might.golem[SPECIES.get(b.kind).metal] || 0) * hurtMight(b.hp) : 0), 0);   // its golems stand in a fight too

export const frosty = (a, K, seasonId) => !!SEASONS.get(seasonId).lean && a.f.temp[K.i] - a.f.trange[K.i] / 2 < 0;
// cells a day: as the slowest who walks (campaign/baggage.js), slower hungry and in frost
export function pace(a, K, seasonId) {
  let v = CAMPAIGN.speed * scaleOf(a) * slowest(K) * (guided(K) ? HIRES.guide.pace : 1);
  if (K.hungry > 0) v *= CAMPAIGN.hunger.slow;
  if (frosty(a, K, seasonId) && K.warm !== K.day) v *= CAMPAIGN.frost;   // (a warming brew for everyone: no slower — caravanDay)
  return v * paceOf(K).speed;   // the pace the council keeps (data/road.js PACES; normal — × 1)
}

export function die(a, K, m, why, {heard = false, seen = null} = {}) {
  if (m.gender === 'f') why = why.replace(/^(умер|пал|погиб)(?=\s)/, w => ({умер: 'умерла', пал: 'пала', погиб: 'погибла'})[w]);
  m.alive = false; m.hp = 0; m.ride = null; m.died = {day: K.day, year: a.hist.year, why, ...(K.fightSrc ? {src: K.fightSrc} : {})};
  memberFate(a, m, 'dead');   // (a person of the world dies with it — atlas/persons.js)
  noteFate(K, m, 'died', {heard, seen, params: {why}});   // the company's loss, as they came to know it (campaign/social.js)
  if (m.captive) unbind(K, m);   // shackles back to the baggage
  const left = core(K).length, n = K.members.filter(isCore).length;
  say(a, K, `${m.name}, ${rank(K, m)}, ${why}.${isCore(m) && left ? ` Из вышедших из столицы осталось ${left} из ${n}.` : ''}`, 'death', isCore(m) && !left, [m.id]);
}

// ── the baggage changes: a beast, a vehicle; the way is planned afresh
const beastWord = (kind, cs = 'label') => BEASTS[kind][cs];
export function gainBeast(a, K, kind, how) {
  K.beasts.push({id: K.nextBeast++, kind, hp: GETTING.hp, job: null, rider: null}); K.stats.tamed++;
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
  const b = biomeAt(a, K.i), reg = cellRegion(a, K.i), wooded = (b?.trees ?? 0) >= CAMPAIGN.camp.wooded;
  const brewed = brewDay(K, r, wooded);
  if (brewed) { K.stats.brewed = (K.stats.brewed || 0) + brewed; if (!K.brewTold || K.day - K.brewTold > CAMPAIGN.told.again) { K.brewTold = K.day; say(a, K, `В хижине лекаря сварили зелье лечения${brewed > 1 ? ` (${brewed})` : ''}: зелий в поясах ${alive(K).reduce((s, m) => s + (m.potions || 0), 0)}.`, 'build'); } }
  for (const kind of Object.keys(BEASTS)) {
    if (BEASTS[kind].golem) continue;   // a golem is bought, never tamed
    const lvl = faunaLevel({region: reg}, kind), hitch = BEASTS[kind].use === 'ride' ? kitOf(K).tame ?? 1 : 1;   // (the humans' hitching post)
    if (lvl > 0 && lacking(K, kind) && r() < GETTING.tame * Math.min(GETTING.tameCap, lvl) * handler(K) * hitch) gainBeast(a, K, kind, 'Приручили');
  }
  if ((wooded || (b?.trees ?? 0) >= CAMPAIGN.camp.basketTrees) && r() < CAMPAIGN.camp.basket) {
    const m = alive(K).filter(x => (x.back ?? 1) === 1).sort((p, q) => !inLine(p) - !inLine(q)).pop();
    if (m) {
      m.back = 1 + GETTING.basket.cells;
      const done = alive(K).every(x => (x.back ?? 1) > 1), first = alive(K).filter(x => (x.back ?? 1) > 1).length === 1;
      if (first) say(a, K, `${m.name} сплёл${m.gender === 'f' ? 'а' : ''} из лыка и лозы заплечный короб: на спину ложится втрое больше. Остальные взялись за свои.`, 'build');
      else if (done) say(a, K, 'Теперь у каждого за спиной короб.', 'build');
    }
  }
  // earnings: hides from the hunt, gold panned from the river's sand by the one with a pan
  const game = EARN.hideGame.reduce((s, id) => s + faunaLevel({region: reg}, id), 0);
  if (r() < EARN.hide * Math.min(EARN.hideCap, game)) K.cargo.hide = (K.cargo.hide || 0) + 1;
  if (reg.placer > 0 && alive(K).some(m => m.gear.hand.includes(EARN.panTool))) {
    const g = Math.round(EARN.pan * reg.placer * (EARN.panRoll + r()) * 10) / 10;
    K.gold = Math.round((K.gold + g) * 10) / 10; K.stats.panned = (K.stats.panned || 0) + g;
    if (!K.pannedTold || K.day - K.pannedTold > CAMPAIGN.told.again) { K.pannedTold = K.day; say(a, K, 'В речном песке блестит золото: лоток не пустует, казна понемногу растёт.', 'find'); }
  }
  if (K.build && wooded) {
    K.build.days--;
    if (K.build.days <= 0) {
      const B = K.build; K.build = null; K.stats.built++;
      if (B.kind === 'building') {
        if (fieldBuildings(K).some(x => x.id === B.id)) { campOf(K).push(B.id); { const d = BUILDINGS.get(B.id), it = d.gender === 'f' ? 'она' : d.gender === 'n' ? 'оно' : 'он'; say(a, K, `Срубили «${d.name}»: теперь ${it} с караваном и встаёт на каждой стоянке.`, 'build'); } }
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
  if (B.use === 'food') return K.beasts.filter(b => BEASTS[b.kind].use === 'food' && b.hp > 0).length < Math.round(CAMP_KIT.herd.max * (kitOf(K).herd ?? 1));   // the herd (the elves keep none)
  const wagon = K.vehicles.some(v => v.kind === 'wagon') ? 1 : 0;
  return have < 2 + wagon;
}

// the way to the goal: with the wheels along the roads, or straight on foot; the wheels are kept when
// the road is not too much longer (data/transport.js ROUTE), otherwise left behind
function plan(a, K) {
  // no way by land (a goal over the water, home from there): the ferry (campaign/ferry.js) — to the port, aboard, ashore;
  // a deal under way is asked first (the way to the port, the landing), else only when the land has no way
  const ferry = () => {
    const to = ferryPlan(a, K, (text, kind) => say(a, K, text, kind));
    if (to === -1) { K.path = null; return true; }
    return to != null && planTo(a, K, to);
  };
  if (K.ferry && ferry()) return;
  if (planTo(a, K, K.goal) || (!K.ferry && ferry())) return;
  K.path = null; say(a, K, 'Дороги к цели нет: караван топчется на месте.', 'lost');
}
// the way to a cell → true when there is one (K.path set)
function planTo(a, K, goal) {
  const foot = route(a, K.i, goal, K.people, false);
  let way = foot;
  if (wheeled(K)) {
    const road = route(a, K.i, goal, K.people, true), keep = ROUTE.keep;
    if (road && (!foot || road.cost <= keep * foot.cost)) {
      way = road;
      if (K.route !== 'road') say(a, K, `Совет: идти с обозом по дорогам${foot && road.cost > foot.cost * 1.05 ? ` — дольше на ${Math.round((road.cost / foot.cost - 1) * 100)}%, зато всё с собой` : ''}.`, 'route');
      K.route = 'road';
    } else if (foot) {   // (no way at all, on wheels or on foot: nothing is left behind — the ferry is asked: plan)
      const names = K.vehicles.map(v => VEHICLES[v.kind].label).join(' и ');
      K.vehicles = []; K.stats.left++; assign(K);
      const lost = overflow(K);
      say(a, K, `Совет: ${road ? `по дорогам к цели в ${(road.cost / foot.cost).toFixed(1)} раза дольше` : 'колёсам туда не пройти'} — бросили ${names} и пошли напрямик${lost ? `, оставив ${Math.round(lost)} единиц груза` : ''}.`, 'route');
      K.route = 'straight';
    }
  } else K.route = null;
  if (way) { K.path = way.path; K.k = 0; }
  return !!way;
}

// what the council would build now, if anything: a cart (bronze), a wagon (iron and a draft beast),
// a building for the wagon; only where the wheels could then be used on the way to the goal
function wantBuild(a, K) {
  if (!((biomeAt(a, K.i)?.trees ?? 0) >= CAMPAIGN.camp.wooded)) return null;
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
  const b = fieldBuildings(K)[0];
  return b ? {kind: 'building', id: b.id, days: days(buildDays(b))} : null;
}


// the asks of the camp's commands (`caravan.camp.<id>`, data/commands.js) → {cmd, why, …} or null.
// `x` — what the evening knows: the food a day takes, the land's richness, the free's mean health, the badly wounded,
// a quiet place (the land's dangers low), a calm one (also nothing hunting them near); `x.ask` — what the asks share
const CAMP_CMD = 'caravan.camp.';
// a long camp where something hunts at night is death: they look for a quieter place, unless they already starve
const restless = (K, x) => !K.hungry && !x.quiet && K.path && K.k < K.path.length;
// fed, whole and in a quiet place, and the time to think of it has come (once an evening: the day of the next thought is set)
const thinks = (K, x) => (x.ask.thinks ??= !K.hungry && x.calm && K.food >= x.need * x.C.foodDays && K.day >= (K.nextThink ?? 0) && ((K.nextThink = K.day + x.C.think), true));
const CAMP_ASK = {
  food: (a, K, x) => (K.food < x.need * x.C.foodDays && x.rich >= x.C.foodLand && (x.voices || !restless(K, x)) ? {cmd: 'food', why: 'food'} : null),   // (with voices the danger is each one's to weigh: campaign/council.js)
  heal: (a, K, x) => ((x.core < x.C.hp || x.badly) && (x.voices || !restless(K, x)) ? {cmd: 'heal', why: 'heal'} : null),
  // to build: the wheels, when they would go the way, else a building the camp lacks
  build: (a, K, x) => { if (!thinks(K, x)) return null; const B = wantBuild(a, K); return B ? {cmd: 'build', why: 'build', build: B} : null; },
  // to tame the beasts that graze here
  tame: (a, K, x) => {
    if (!thinks(K, x) || !(K.day - (K.tamedAt ?? -999) >= GETTING.tameEvery)) return null;
    const reg = cellRegion(a, K.i), kind = Object.keys(BEASTS).find(k => !BEASTS[k].golem && lacking(K, k) && faunaLevel({region: reg}, k) >= GETTING.tameLand);
    return kind ? {cmd: 'tame', why: 'tame:' + kind} : null;
  },
  // fed, whole and in a quiet place: an ore worth stopping for here (data/campaign.js MINE)
  mine: (a, K, x) => {
    if (K.hungry || !x.calm || !(K.food >= x.need * x.C.foodDays) || !(K.day >= (K.nextMine ?? 0))) return null;
    const m = wantMine(a, K);
    return m ? {cmd: 'mine', why: 'mine:' + m.ore} : null;
  },
  goOn: (a, K, x, opts) => (opts.length ? {cmd: 'goOn', why: ''} : null),   // (beside something else only: data/campaign.js COUNCIL)
};

function homecoming(a, K, ms) {
  const t = a.towns.find(x => x.id === K.capital), Q = K.quest;
  say(a, K, `Караван вернулся в ${t ? `${townLabel(t, 1)} ${t.name}` : 'родные края'}${Q ? (Q.epic ? ` — ${Q.name} отныне в столице, и сила бедствия сломлена` : ` с короной — ${Q.name} снова дома`) : ''}: ${ms.length} из ${K.members.length}, ${Math.round(K.day / YEAR_DAYS * 10) / 10} лет в пути; в обозе ${baggageText(K)}.`, 'home', true);
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
    const busy = !K.inTown && K.via == null && questArrive(a, K, r, d => { const won = fight(a, K, d, r, 'guard'); if (d.person != null) worldOutcome(a, K, d, won); return won; }, tell, caravanMight(K));   // (a lair's ruler at the head of its guard: its fate in the storm is its fate — worldOutcome)
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
    // the town a reason would take them to: urgent — any way to the nearest: the winter, the badly wounded, hunger with the
    // gold to end it (starving, any way: a friendly town feeds them even without gold — campaign/town.js); starving, the food
    // left gives no measure: a town within winterReach; on barren land after `retreat` days of it, within retreatReach
    const townFor = why => {
      const urgent = why === 'winter' || (why === 'heal' && free(K).some(m => m.hp < CAMPAIGN.camp.badly)) || (why === 'food' && K.hungry > 0);
      const days = why === 'winter' || why === 'smith' ? VISIT.winterReach : why === 'food' ? (barren ? VISIT.retreatReach : K.hungry ? VISIT.winterReach : Math.min(VISIT.reach, K.food / need + VISIT.foodSpare)) : VISIT.reach;
      return findTown(a, K, urgent, K.hungry ? VISIT.hungryDetour : why === 'smith' ? VISIT.smithDetour : VISIT.detour, days, why === 'smith' ? smithAt : null);
    };
    const towns = {}, can = w2 => (towns[w2] ??= townFor(w2) || null) != null;   // (with voices: only a reason with a town to it is an option)
    const why = wantVisit(a, K, seasonId, can);
    const found = why && (why in towns ? towns[why] : townFor(why));
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
    // the decision point `caravan.camp` (core/decide.js, data/commands.js): the commands that want a camp, lane by lane (the
    // camps of need — food, the wounded — before the ones of choice), drawn from by weight (data/campaign.js COUNCIL)
    const cmds = pointCommands('caravan.camp');
    const x = {need, rich, core, badly, quiet, calm, C, ask: {}, voices: (a?.cfg?.council ?? COUNCIL.policy) === 'voices'};   // (one for the evening: the asks share it)
    const {r, done} = draw(K, 'council');
    const got = councilChoose(a, K, 'caravan.camp', cmds, (c, opts) => { const o = CAMP_ASK[c.id.slice(CAMP_CMD.length)](a, K, x, opts); return o && {...o, id: c.id, score: councilWeight(a, K, c.id)}; }, r, {allowed: c => allowed(a?.cfg, c.id), x});
    done();
    readout(K, got);
    if (tracing()) noteCaravan(a, K, 'caravan.camp', cmds, got);
    const option = got.option && !isGoOn(got.option.id) ? got.option : null;   // (the way on drawn: no camp)
    let why = option ? option.why : '';
    if (option?.build) K.build = option.build;
    if (option?.cmd === 'tame') K.tamedAt = K.day;
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
      if (why === 'food' && !quiet) escortAsk(a, K, (t, who) => say(a, K, t, 'people', false, who));   // the faint-hearted ask for company out there (campaign/duty.js)
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
    if (r() < M.food * Math.min(M.richCap, richness(a, K.i) + M.rich)) { const n = Math.round(between(r, M.foodN)); K.food += n; K.stats.finds++; if (r() < M.tell) say(a, K, `Утром подстрелили дичь: +${pieces(n, 'паёк', 'пайка', 'пайков')}.`, 'find'); }
    const {r: rf, done: df} = draw(K, 'finds'), found = morningFind(a, K, rf); df();   // only where it has a reason to lie
    if (found) say(a, K, `Утром: ${found[0].toLowerCase()}${found.slice(1)}`, 'treasure');
  }
  done();
}

// what a thing of the bubble brings to a fight: its foe, its strength, and who it is on the local map
// (all a thing carries into the fight: its second kind, a cult's pool, the lair whose captives a win frees, a leader)
export const foeOf = t => ({kind: THINGS[t.kind].foe, strength: t.strength, label: t.label, band: t.band || null, beast: t.beast || null, ...(t.pursuit ? {pursuit: t.src || 'hunt'} : {}), ...(t.boss ? {boss: t.boss} : {}),
  ...(t.with ? {with: t.with} : {}), ...(t.pool ? {pool: t.pool} : {}), ...(t.person != null ? {person: t.person} : {}), ...(t.lair != null ? {lair: t.lair} : {}), ...(t.species ? {species: t.species} : {})});

// the fight's outcome for the world (data/campaign.js CAMPAIGN.scene), applied once: the world party the caravan met loses the
// share of its men the scene's foes lost; the person at its head — a leader of an old lair, a chief with its host — goes by its
// own fate in the scene (the fight's record: dead, bound, fled, stood), not by the side that won. The quick mode has no scene:
// its own rule. A party gone or a person dead already is not touched again (atlas/persons.js personDies applies once)
export function worldOutcome(a, K, t, win) {
  const S = CAMPAIGN.scene, rec = K.fights?.at(-1), local = rec && rec.mode === 'local';
  // the party: the scene's dead and those led away by the caravan are that many of its men (the rest did not fight; the bound
  // it had no room for get away, as its chief does); whoever won, they are gone
  if (t.party != null) {
    const p = (a.parties || []).find(x => x.id === t.party && x.state !== 'gone');
    if (p && !(K.partyHit ||= {})[`${p.id}:${K.day}`]) {
      K.partyHit[`${p.id}:${K.day}`] = true;
      const men = p.kind === 'army' ? Math.max(0, p.men) : null;
      // (the person at its head is counted apart — out of its town's count, not among `men`: its death or capture is its own
      // event below, so the scene's one body of it is not a man of the host as well)
      const named = local && t.person != null && rec.boss?.came, bossDead = named && rec.boss.fate === 'dead' ? 1 : 0;
      const bossLed = named && rec.boss.fate === 'bound' && K.members.some(m => m.alive && m.captive && m.person === t.person) ? 1 : 0;
      const dead = local ? Math.max(0, (rec.killed || 0) - bossDead) : (win ? S.auto.won : S.auto.lost) * (men ?? 1), taken = local ? Math.max(0, (rec.led || 0) - bossLed) : 0;
      if (p.kind === 'army') { const gone = sceneLosses(a, p, dead, taken); if (gone > 0) p.result = win ? 'beaten' : 'won'; }
      else if (local) { const n = Math.max(1, rec.foes || 1); p.might = Math.max(0, (p.might || 0) * (1 - Math.min(1, (dead + taken) / n))); }
      else p.might = Math.max(0, (p.might || 0) * (1 - dead));
      if (win) goHome(a, p);   // beaten by the caravan, it turns home
    }
  }
  // the person at its head: by its own fate in the scene
  if (t.person == null) return;
  const p = personOf(a, t.person); if (!p || !p.alive || p.captive) return;
  let fate = local ? rec.boss?.fate || (win ? 'dead' : 'stood') : win ? S.auto.boss : 'stood';
  if (fate === 'bound' && !K.members.some(m => m.alive && m.captive && m.person === p.id)) fate = 'fled';   // bound but left behind (no room): it got away
  const lair = (a.lairs || []).find(l => l.leader?.id === p.id);
  if (fate === 'dead') {
    if (!personDies(a, p, 'caravan', line => say(a, K, line, 'fight', true))) return;
    K.stats.leaders = (K.stats.leaders || 0) + 1;
    say(a, K, `${t.boss.name} пал от рук каравана${lair ? ': его логово осталось без главаря' : ''}.`, 'fight', true);
  } else if (fate === 'bound') {
    if (!personCaptured(a, p, 'caravan', line => say(a, K, line, 'fight', true))) return;
    K.stats.leaders = (K.stats.leaders || 0) + 1;
    say(a, K, `${t.boss.name} в путах каравана${lair ? ': его логово осталось без главаря' : ''}.`, 'fight', true);
  }
}
const leaderBeaten = worldOutcome;

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
      const n = Math.round(between(r, HERD.food) * Math.min(HERD.cap, alive(K).length / HERD.party));
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
      if (r() < BUBBLE.evadeTold) say(a, K, `За караваном шли ${t.label}: путали следы${guided(K) ? ' по тропам проводника' : ''} и ушли от погони.`, 'sight');
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
  const room = Math.max(0, capacity(K) - load(K)), n = Math.floor(Math.min(t.goods || 0, room, need * TRAIN.days - K.food, K.gold / price));
  if (n > 0) { K.food += n; K.gold = Math.round((K.gold - n * price) * 10) / 10; t.goods -= n; parts.push(`купили ${pieces(n, 'паёк', 'пайка', 'пайков')} по ${Math.round(price * 100) / 100}`); }
  K.stats.trains = (K.stats.trains || 0) + 1;
  if (parts.length) say(a, K, `На дороге встретили торговый обоз: ${parts.join('; ')}.`, 'town');
}

// what a day mends of a golem (data/constructs.js GOLEM_REPAIR): a town's forge, the camp's own (the dwarves' field forge),
// else a dwarf of the company able to work (in a town without a forge, too)
export function golemMend(K, town, camping) {
  const G = GOLEM_REPAIR;
  if (town ? G.at.some(id => town.built.includes(id)) : camping && kitOf(K).forge) return G.day;
  return free(K).some(m => G.fieldRaces.includes(m.race) && m.hp >= G.fieldHp) ? G.field : 0;
}

// one day of the campaign (the world's day `day` of the current season)
// what the screen's summary reads of a day: the food, the treasury, the fights, the way walked, the towns, the clues — at its end
// (and what the day's screen tells of them: what they do, the council's pick, the crown's state, each one's bonds and
// tiredness — so a day shown is shown as it stood, not as the season computed ahead stands: ui/campaignView.js, ui/campSocial.js)
export const dayShot = (K, d) => ({d, food: Math.round(K.food * 10) / 10, gold: K.gold, fights: K.stats.fights, won: K.stats.won, ambushes: K.stats.ambushes || 0, walked: Math.round(K.stats.walked), towns: K.stats.towns || 0, storms: K.stats.storms || 0, found: K.quest?.found ?? 0, alive: K.members.filter(m => m.alive).length,
  state: {inTown: K.inTown ? {...K.inTown} : null, via: K.via, camp: K.camp, why: K.why, hungry: K.hungry, phase: K.phase, build: K.build ? {...K.build} : null, route: K.route},
  council: K.council?.day === d ? {pick: K.council.pick, n: K.council.opts.length} : null,
  crown: K.quest ? {state: K.quest.crown.state, carrier: K.quest.crown.carrier, exact: K.quest.crown.exact, seen: K.quest.crown.seen, r: K.quest.crown.area?.r ?? null} : null,
  rel: Object.fromEntries(Object.entries(K.social?.relations || {}).map(([a, row]) => [a, {...row}])),
  tired: Object.fromEntries(K.members.filter(m => m.alive).map(m => [m.id, m.social?.load?.tired || 0])), lv: levelsNow(K)});
export function caravanDay(a, K, day) {
  if (ended(K)) return;
  const seasonId = SEASON_LIST[a.hist.season].id, before = {town: townAt(a, K.i)?.id, biome: biomeAt(a, K.i)?.id};
  assign(K);
  K.dayIn = day % SEASON_DAYS;   // the day of the season: a camp on the local map begins on it (campaign/camp.js)
  wearOff(K);
  const ms = alive(K), {r, done} = draw(K, 'day');
  // the day: a camp or the march; food from the land either way
  const rich = richness(a, K.i) * seasonFood(a, K.i, seasonId), Fo = CAMPAIGN.forage;
  const town = K.inTown ? a.towns.find(x => x.id === K.inTown.id) : null, sailing = aboard(K);   // (aboard a ferry: campaign/ferry.js)
  const camping = !town && !sailing && (K.camp > 0 || !K.path || K.k >= K.path.length);
  let seen = K.i;   // (the cell the scouts see from: on the water, where the boat is)
  if (town) {   // a day in town: work for hire, buy the day's food at the market (hired out for board: the town feeds them)
    labour(K, town);
    if (K.inTown.work) K.food += mouths(K) * CAMPAIGN.ration;
    const st = standing(a, K, town), price = st ? rationPrice(town, st, termsOf(a, K, town).buy) : Infinity, want = Math.max(0, ms.length * CAMPAIGN.ration * VISIT.dayFood - K.food);
    const n = Math.min(want, Math.floor(K.gold / price)); if (n > 0) { K.food += n; K.gold = Math.round((K.gold - toTown(town, n * price)) * 10) / 10; }
  } else if (sailing) seen = sailDay(a, K, (text, kind) => say(a, K, text, kind));   // the days on the water: no march, no forage, no camp
  else if (!camping) {
    const p = choosePace(a, K); if ((K.pace || 'normal') !== p) K.pace = p;
    // the brews of the day (campaign/potions.js): in frost everyone drinks a warming one — then the frost does not slow
    // them; with danger about the fighters drink an invigorating one — then an ambush does not catch them napping
    if (frosty(a, K, seasonId)) { K.stats.frostDays = (K.stats.frostDays || 0) + 1; if (brewTheDay(K, 'cold', ms)) K.warm = K.day; }
    if (dangers(a, K.i, K).some(d => (d.strength ?? 0) > PACE_RULES.dangerAt) && brewTheDay(K, 'tired', ms.filter(m => !m.captive && !m.former))) K.alert = K.day;
    if (march(a, K, pace(a, K, seasonId)) > 0) share(K, alive(K), 'road');   // a day on the road: the ground (campaign/experience.js)
  }
  else campWork(a, K, r);
  // the first days of a stop to hunt and gather are played on the local map (campaign/fight.js playStop):
  // what the land gave there is the day's forage
  // every stop for a purpose (food, the wounded, building, taming, digging) is played on the local map, at most
  // CAMP.stop.maxDays of it (campaign/fight.js playStop): what the land gave there is the day's forage
  const onMap = camping && K.why && K.mode !== 'auto' && (K.stopPlayed ?? 0) < CAMP.stop.maxDays && core(K).length;
  if (onMap) { K.stopPlayed = (K.stopPlayed ?? 0) + 1; const got = playStop(a, K); if (K.why.startsWith('mine:')) { K.mineDay = got[mineRes(K.why.slice(5))] || 0; K.mineGot = (K.mineGot || 0) + K.mineDay; } }
  else if (camping && K.why.startsWith('mine:')) { K.mineDay = autoMine(a, K, r); K.mineGot = (K.mineGot || 0) + K.mineDay; }
  if (camping && K.why && !onMap && K.mode === 'auto' && core(K).length) autoWork(K);   // the stop's work, as a played one gives it (campaign/experience.js)
  if (!town && !sailing && core(K).length) { const rb = draw(K, 'bubble'); dayMeetings(a, K, rb.r, !camping); rb.done(); }
  const forage = ms.length * (camping ? Fo.camp * stopFood(a, K) : Fo.march * paceOf(K).forage) * rich * (1 - Fo.spread / 2 + Fo.spread * r());
  if (!town && !onMap && !sailing) K.food += forage;
  // the herd in hunger: one is slaughtered for its meat (data/transport.js CAMP_KIT.herd)
  if (K.food < mouths(K) * CAMPAIGN.ration) {
    const b = K.beasts.find(x => BEASTS[x.kind].use === 'food' && x.hp > 0);
    if (b) { K.beasts = K.beasts.filter(x => x !== b); K.food += CAMP_KIT.herd.meat * campFx(K, 'food'); say(a, K, `Еды не осталось: зарезали ${BEASTS[b.kind].acc} — мяса на несколько дней.`, 'hunger'); }
  }
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
    else if (!K.hungry) m.hp = Math.min(1, m.hp + (town ? CAMPAIGN.heal.camp * healHere(town) : sailing ? CAMPAIGN.heal.camp : camping ? CAMPAIGN.heal.camp * campFx(K, 'heal') : CAMPAIGN.heal.march * (m.ride ? CAMPAIGN.heal.ride : 1)) * (1 - DUTY.healCut * tiredOf(m)));   // (the tired heal slower: campaign/duty.js)
  }
  if (!K.hungry) { const n = mendDay(K); if (n) K.stats.mendBrews = (K.stats.mendBrews || 0) + n; }   // the badly hurt drink a strengthening brew (campaign/potions.js)
  people(a, K, r);
  levelEvening(a, K, (text, who) => say(a, K, text, 'people', false, who));   // a level for whoever has the experience for it (campaign/experience.js)
  tell(K);   // what one lived through, told at the fire to those who did not see it (campaign/social.js)
  reconcile(K, (text, who) => say(a, K, text, 'people', false, who));   // a quarrel made up after a good turn in need (campaign/social.js)
  fadeDay(K);   // the bonds fade by the campaign's day, once (campaign/social.js)
  crownHands(K, (text, kind) => say(a, K, text, kind));
  // the beasts graze where grass grows and starve where it does not
  const grass = pasture(a, K.i, seasonId), mend = golemMend(K, town, camping);
  for (const b of sailing ? [] : [...K.beasts]) {   // (aboard the beasts are fed with the company: neither graze nor starve)
    // a golem eats nothing and mends only at a forge or by a dwarf's hand (data/constructs.js GOLEM_REPAIR)
    if (BEASTS[b.kind]?.golem) { if (mend) b.hp = Math.min(1, b.hp + mend); continue; }
    b.hp = grass ? Math.min(1, b.hp + FODDER.regain * (BEASTS[b.kind].use === 'ride' ? kitOf(K).regain ?? 1 : 1)) : b.hp - FODDER.starve * (0.5 + r());
    if (grass && BEASTS[b.kind].use === 'food' && b.hp > 0) K.food += CAMP_KIT.herd.milk;   // the herd's milk
    if (b.hp <= 0) loseBeast(a, K, b, 'Бескормица: пал');
  }
  done();
  // what they can carry
  assign(K); overflow(K);
  if (sailing) offDuty(K);   // (aboard the boat's crew keeps the watch: the company rests — campaign/duty.js)
  else {
    if (core(K).length) { entered(a, K, before); evening(a, K); }
    if (core(K).length && !ended(K)) nightWatch(a, K, {camping, say: (text, who) => say(a, K, text, 'people', false, who)});   // who stands watch tonight, the requests and promises (campaign/duty.js)
    if (core(K).length && !ended(K)) night(a, K);
  }
  // the end: when none of the eight is left, those who joined go their own ways
  if (!core(K).length && !ended(K)) {
    K.lostWith = alive(K).map(m => m.id);   // their fates are told in the epilogue (campaign/ending.js)
    for (const m of alive(K)) { m.alive = false; m.left = {day: K.day, year: a.hist.year, disbanded: true}; memberFate(a, m, 'freed'); }   // (alive: not to be mourned as the fallen — social/fate.js)
    K.phase = 'lost';
    say(a, K, 'Никого из тех, кто вышел из столицы, не осталось в живых. Караван не дойдёт.', 'end', true);
  }
  if (!ended(K) && K.day >= yearsOf(K) * YEAR_DAYS) { K.phase = 'timeout'; say(a, K, `Прошло ${yearsOf(K)} лет: караван так и не вернулся.`, 'end', true); }
  // what they can carry, again: the night's loot, the morning's finds, the town's buys, someone gone
  assign(K); overflow(K);
  reveal(a, K, seen, CAMPAIGN.fog.sight * scaleOf(a) + (guided(K) ? HIRES.guide.sight * scaleOf(a) : 0));
  // the quest: what the scouts see of the places sought; with the crown, the world's pursuit (none over the water)
  if (K.quest && !ended(K) && !sailing) {
    const tell = (text, kind, world, who) => say(a, K, text, kind, world, who), {r: rq, done: dq} = draw(K, 'pursuit');
    questSight(a, K, tell); pursuit(a, K, rq, tell); epicDay(a, K, rq, tell); dq();
  }
  K.track.push([Math.round(K.x * 100) / 100, Math.round(K.y * 100) / 100]);
  (K.daily ||= []).push(dayShot(K, K.day));   // (the summary of the day shown: campaign/index.js)
  const p = (a.parties || []).find(x => x.id === K.party);
  if (p) { p.x = K.x; p.y = K.y; p.i = K.i; p.men = alive(K).length; p.goal = K.goal; if (ended(K)) p.state = 'gone'; }
  K.day++;
}

