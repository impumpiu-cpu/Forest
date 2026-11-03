// Towns on the way: why the council would turn to one, which one, the caravan in town (campaign/town.js trades).
// Out of campaign/march.js.
import {scaleOf} from '../atlas/tectonics.js';
import {townLabel} from '../atlas/towns.js';
import {SEASONS, SEASON_DAYS} from '../data/seasons.js';
import {CAMPAIGN} from '../data/campaign.js';
import {ORES} from '../data/ores.js';
import {VISIT, SMITH, WANTS} from '../data/market.js';
import {LEADER, TRIBE_RAID} from '../data/lairs.js';
import {livingLeaders} from '../atlas/leaders.js';
import {wherePhrase} from '../atlas/lairs.js';
import {route} from './path.js';
import {capacity, cargoLoad, wheeled, metalTier} from './baggage.js';
import {draw} from './start.js';
import {rumour} from './quest.js';
import {standing, townName, townLine, trade, hire, companion, rationPrice} from './town.js';
import {free} from './captives.js';
import {termsOf} from './road.js';
import {alive, say, pace} from './march.js';
import {pointCommands, allowed} from '../data/commands.js';
import {pickFirst, tracing, noteDecision} from '../core/decide.js';

const SEASON_LIST = SEASONS.all();

// ── towns on the way (campaign/town.js): why the council would turn to one, and which one
const freezing = (a, i) => a.f.temp[i] - a.f.trange[i] / 2 < VISIT.winterBelow;
// The decision point `caravan.visit` of the contract (core/decide.js, data/commands.js): the commands `caravan.visit.<why>`
// asked in the old order, the first that wants a town taken (policy `first`). → the reason, or ''
const VISIT_ASK = {
  winter: (a, K, Sn) => (Sn.lean || (Sn.stockUp && a.hist && K.day % SEASON_DAYS >= VISIT.lateIn)) && freezing(a, K.i) && K.winterYear !== a.hist.year,
  // (the rest wait while the caravan is just out of a town: on to the goal first)
  food: (a, K, Sn, need, C) => K.day >= (K.nextVisit ?? 0) && K.food < need * Math.max(C.foodDays, VISIT.foodAt),   // (looked for while there is food to reach it)
  heal: (a, K, Sn, need, C) => K.day >= (K.nextVisit ?? 0) && free(K).some(m => m.hp < C.badly),   // a captive's wounds turn no caravan aside (campaign/captives.js)
  // ore for the smith (data/market.js SMITH): enough for a piece; a town with a smith is looked for further than a shop
  smith: (a, K) => K.day >= (K.nextVisit ?? 0) && smithOre(K) >= VISIT.smithOre && K.gold >= VISIT.smithGold && !(K.smithTried > K.day),
  shop: (a, K) => K.day >= (K.nextVisit ?? 0) && K.gold >= VISIT.money && K.day - (K.lastVisit ?? -999) >= VISIT.every,
};
const VISIT_CMD = 'caravan.visit.';
export function wantVisit(a, K, seasonId) {
  const ms = alive(K), need = ms.length * CAMPAIGN.ration, C = CAMPAIGN.camp;
  const Sn = SEASONS.get(seasonId), cmds = pointCommands('caravan.visit');
  const {option, asked} = pickFirst(cmds, c => (VISIT_ASK[c.id.slice(VISIT_CMD.length)](a, K, Sn, need, C) ? c : null), c => allowed(a.cfg, c.id));
  if (tracing()) noteCaravan(a, K, 'caravan.visit', cmds, asked, option?.id ?? null);
  return option ? option.id.slice(VISIT_CMD.length) : '';
}
// a choice of the caravan, for the trace (core/decide.js): the commands asked in the old order, the one taken, those not asked
export function noteCaravan(a, K, point, cmds, asked, pick) {
  noteDecision({point, who: `caravan:${K.capital}`, at: K.day, band: 'routine', policy: 'first',
    opts: asked.map(c => ({cmd: c.id, key: c.id, score: c.id === pick ? 1 : 0})), pick, unasked: cmds.filter(c => !asked.includes(c)).map(c => c.id)});
}
// a friendly town that can be reached: one on the way to the goal — ahead of the caravan (nearer the goal
// than it is) and not much of a detour; when `urgent` (the winter, the badly wounded) and there is none
// ahead, the nearest one whichever way
// units of ore of a metal above the caravan's own (the smith makes it into a piece of that metal)
const smithOre = K => { const tier = metalTier(K); return ORES.all().filter(o => o.tier > tier).reduce((n, o) => n + (K.cargo[o.resource] || 0), 0); };
export const smithAt = t => SMITH.at.some(id => t.built.includes(id));
export function findTown(a, K, urgent, detour = VISIT.detour, days = VISIT.reach, only = null) {
  const v = Math.max(0.05, pace(a, K, SEASON_LIST[a.hist.season].id)), R = days * v, x0 = K.i % a.w, y0 = (K.i / a.w) | 0, wh = wheeled(K);
  const near = (a.towns || []).filter(t => t.alive && standing(a, K, t) && (!only || only(t)) && Math.hypot(t.x - x0, t.y - y0) <= R).sort((p, q) => Math.hypot(p.x - x0, p.y - y0) - Math.hypot(q.x - x0, q.y - y0)).slice(0, 4);
  const direct = K.goal == null ? null : route(a, K.i, K.goal, K.people, wh);
  let fallback = null;
  for (const t of near) {
    const way = route(a, K.i, t.i, K.people, wh); if (!way) continue;
    fallback ||= {t, way};
    if (!direct) return {t, way};
    const on = route(a, t.i, K.goal, K.people, wh);
    if (way.cost > R * VISIT.wayCost) continue;   // the cells' price: roads cheaper, mountains dearer than the straight line
    if (on && on.cost < direct.cost && way.cost + on.cost <= direct.cost * (1 + detour) + VISIT.slack) return {t, way};
  }
  return urgent ? fallback : null;
}
export const VISIT_WHY = {smith: 'отдать руду кузнецу', winter: 'перезимовать', food: 'купить еды', heal: 'подлечить раненых', shop: 'потратить казну', rumour: 'расспросить о следах'};

// the caravan comes into a town: trade, hire, meet who would go along
export function enterTown(a, K, t) {
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
export function townEvening(a, K, seasonId) {
  const t = a.towns.find(x => x.id === K.inTown.id), st = standing(a, K, t), ms = alive(K);
  const stocked = K.food >= VISIT.stocked * Math.min(capacity(K) - cargoLoad(K), ms.length * CAMPAIGN.ration * WANTS.foodDays);
  const healed = free(K).every(m => m.hp >= CAMPAIGN.camp.healed);   // (nobody waits in town for a captive to heal)
  const wintering = K.inTown.why === 'winter' && (SEASONS.get(seasonId).lean || SEASONS.get(seasonId).stockUp);
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

// what a town tells of the leaders near it: the nearest living one within a leader's reach, once per leader
function leaderRumour(a, K, t) {
  const reach = TRIBE_RAID.reach * LEADER.reach * scaleOf(a), told = (K.leadersTold ||= []);
  const near = livingLeaders(a).filter(l => !told.includes(l.id) && Math.hypot(l.x - t.x, l.y - t.y) <= reach).sort((p, q) => Math.hypot(p.x - t.x, p.y - t.y) - Math.hypot(q.x - t.x, q.y - t.y))[0];
  if (!near) return null;
  told.push(near.id);
  return `говорят, ${wherePhrase(a, near.i)} хозяйничает ${near.leader.title[0].toLowerCase()} ${near.leader.name} из «${near.name}»`;
}
