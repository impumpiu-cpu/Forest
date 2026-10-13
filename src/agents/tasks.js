// Tasks are what an agent is doing right now: {id, ...state}. Brains choose them, TASKS run them.
// Shared by every brain, so a new creature can reuse 'fight', 'flee' or 'idle' as they are.
import {Registry} from '../core/registry.js';
import {JOBS} from '../data/jobs.js';
import {NEEDS} from '../data/needs.js';
import {FOODS} from '../data/foods.js';
import {ambientTemp} from '../core/time.js';
import {cellOf} from '../world/grid.js';
import {follow, moveToward, escapeHeat, nearFire, approach} from './movement.js';
import {attack, shoot} from './combat.js';
import {RUNNERS} from './jobRunners.js';
import {eatMeal, plunder} from '../settlement/stock.js';
import {councilDue} from '../settlement/council.js';
import {log} from '../core/log.js';
import {think} from './mind.js';
import {tradeOpen, attendTrade} from '../settlement/trade.js';
import {HEAL} from '../settlement/healing.js';
import {has, colonists} from '../settlement/query.js';
import {SPECIES} from '../data/species.js';
import {homeComfort, prayed} from '../settlement/life.js';

export const TASKS = new Registry('task');
const done = a => { a.task = null; a.think = 0; };

// wander a little inside the camp so people don't stand in one spot
function mill(w, a, task, radius = 1.2) {
  if (!task.spot || w.rng() < 0.02) {
    const ang = w.rng() * Math.PI * 2, r = w.rng() * radius;
    task.spot = [w.camp.x + 0.5 + Math.cos(ang) * r, w.camp.y + 0.5 + Math.sin(ang) * r];
  }
  moveToward(w, a, task.spot[0], task.spot[1], 0.5);
}

TASKS.registerAll([
  {id: 'eat', label: () => 'ест', step(w, a) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    const {fed, res, mood} = eatMeal(w, a);
    if (fed) {
      const f = FOODS.get(res.id);
      if (f.eat === 'ateHot') think(w, a, 'ateHot', {food: f.label});
      else if (mood === 'liked') think(w, a, 'ateLiked', {food: f.label});
      else if (mood === 'disliked') think(w, a, 'ateDisliked', {food: f.label});
      else if (f.eat) think(w, a, f.eat);
      else if (a.needs.food < 0.35) think(w, a, 'ateHungry', {food: f.label});
      a.needs.food = Math.min(1, a.needs.food + fed); done(a);
    }
    else a.task = {id: 'job', job: 'gather', eatNow: true};   // empty stock: eat straight from the bushes
  }},

  {id: 'sleep', label: () => 'спит', step(w, a, task) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    // beds make sleep faster; how warm a night is depends on what the beds are in: a drafty hut
    // (bedWarmth 1.2 per 4 beds) or a log house (4 per 4 beds), and on whether the fire burns
    const pop = Math.max(1, colonists(w).length);
    const beds = Math.min(1, w.mods.add.beds / pop), warm = Math.min(1, (w.mods.add.bedWarmth || 0) / pop);
    a.sleeping = true;
    a.needs.rest = Math.min(1, a.needs.rest + 0.004 * (1 + 0.6 * beds));
    if (warm > 0 && a.needs.warmth != null) a.needs.warmth = Math.min(1, a.needs.warmth + 0.0028 * warm * (w.campLit ? 1 : 0.5));
    mill(w, a, task, 1.2);
    if (a.needs.rest >= 1) {
      if (warm > 0.6) { const c = homeComfort(w); think(w, a, 'sleptHouse', {mood: 0.22 + c * 1.2, fine: c > 0.1}); }
      else think(w, a, beds > 0 ? 'sleptHut' : 'sleptOutside');
      done(a);
    }
  }},

  {id: 'warm', label: () => 'греется', step(w, a, task) {
    if (follow(w, a, 'warm') !== 'arrived') return;
    if (w.camp.set.has(cellOf(w, a))) mill(w, a, task, 1.2);
    if (a.needs.warmth > 0.92) done(a);
  }},

  {id: 'council', label: () => 'на совете у костра', step(w, a, task) {
    if (!councilDue(w)) { done(a); return; }
    if (follow(w, a, 'camp') !== 'arrived') return;
    task.seated = true;
    if (!task.spot) { const ang = w.rng() * Math.PI * 2; task.spot = [w.camp.x + 0.5 + Math.cos(ang) * 1.6, w.camp.y + 0.5 + Math.sin(ang) * 1.6]; }
    moveToward(w, a, task.spot[0], task.spot[1], 0.5);
  }},

  {id: 'flee', label: () => 'бежит от огня', step(w, a) {
    escapeHeat(w, a);
    if (w.grid.temp[cellOf(w, a)] < ambientTemp(w) + 16 && !nearFire(w, a, 3)) done(a);
  }},

  // fight: archers and slingers keep their distance and shoot, everyone else closes in
  {id: 'fight', label: t => (t.shooting ? 'стреляет' : 'дерётся'), step(w, a, task) {
    const t = task.target;
    if (!t || t.dead || !w.agents.includes(t)) { done(a); return; }
    const d = Math.hypot(t.x - a.x, t.y - a.y), g = a.gear;
    if (g?.rangedReady && d > 1.4) {
      const range = g.ranged.range + (a.faction === 'colony' ? w.mods.add.huntRange : 0);
      task.shooting = true;
      if (d > range * 0.9) { if (approach(w, a, t.x, t.y, 1.0) === null) done(a); }
      else shoot(w, a, t, 'hunt');
      return;
    }
    task.shooting = false;
    if (d > 0.9) { if (approach(w, a, t.x, t.y, 1.1) === null) done(a); }   // unreachable: pick something else
    else attack(w, a, t);
  }},

  {id: 'douse', label: () => 'тушит пожар', step(w, a) {
    if (w.stats.fireNearCamp === 0) { done(a); return; }
    if (!nearFire(w, a, 1.7)) { if (follow(w, a, 'fire') !== 'moving') { done(a); a.think = 10; } return; }
    const g = w.grid, cx = a.x | 0, cy = a.y | 0, power = 0.05 * w.mods.mul.douse;
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h || (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2 > 2.9) continue;
      const j = y * w.w + x;
      if (g.fire[j] > 0) { g.fire[j] = Math.max(0, g.fire[j] - power); g.temp[j] -= 6; if (g.fire[j] === 0) g.temp[j] = Math.min(g.temp[j], 60); }
    }
  }},

  {id: 'job', label: t => JOBS.get(t.job).verb, step(w, a, task) { RUNNERS[JOBS.get(task.job).runner](w, a, task); }},

  {id: 'idle', label: () => 'отдыхает', step(w, a, task) {
    if (follow(w, a, 'camp') === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < 4) mill(w, a, task, 2.5);
  }},

  // a gloomy spell: drifts about the camp instead of working (settlement/life.js)
  {id: 'sulk', label: () => 'хандрит', step(w, a, task) {
    if (w.tick >= task.until) { done(a); return; }
    if (follow(w, a, 'camp') === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < 5) mill(w, a, task, 4);
  }},

  // a prayer at the shrine, once a day for someone in low spirits
  {id: 'pray', label: t => (t.at ? 'молится у святилища' : 'идёт к святилищу'), map: 'station:shrine', step(w, a, task) {
    if (!has(w, 'shrine')) { done(a); return; }
    if (!task.at) {
      const r = follow(w, a, 'station:shrine');
      if (r === 'arrived') task.at = w.tick;
      else if (r === 'none' && !w.nav.dirtySet.has('station:shrine')) { w.nav.dirty('station:shrine'); done(a); a.think = 30; }
      return;
    }
    if (w.tick - task.at > 60) { prayed(w, a); done(a); }
  }},

  // raiders
  {id: 'assault', label: () => 'идёт к складу', step(w, a) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    const took = plunder(w);
    if (took > 0.5 && w.tick - w.stats.lastSteal > 40) log(w, 'Налётчики грабят склад.', 'danger');
    w.stats.lastSteal = w.tick; a.looted = true; a.task = {id: 'leave'};
  }},
  {id: 'leave', label: () => 'уходит', step(w, a) { if (follow(w, a, 'edge') === 'arrived') a.gone = true; }},

  // gather by the fire when raiders come; done as soon as the alarm is over
  {id: 'muster', label: () => 'собирается по тревоге', step(w, a, task) {
    if (!w.agents.some(o => o.faction === 'raiders' && !o.dead)) { done(a); return; }
    think(w, a, 'raidAlarm');
    if (follow(w, a, 'camp', 1.2) === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < 3) mill(w, a, task, 2.2);
  }},

  // run for the settlement zone when something is hunting you
  {id: 'runHome', label: () => 'бежит к поселению', step(w, a) {
    if (follow(w, a, 'zone', 1.3) === 'arrived') done(a);
  }},

  // a wounded colonist lies in the healer's hut until mostly healed (settlement/healing.js)
  {id: 'treat', label: t => (t.lying ? (t.healer != null ? 'лечится у лекаря' : 'лежит в хижине лекаря') : 'идёт к лекарю'), step(w, a, task) {
    if (!has(w, 'healerhut')) { done(a); return; }
    const max = SPECIES.get(a.species).hp;
    if (a.hp >= max * HEAL.until) {
      const healer = task.healer != null ? w.agents.find(o => o.id === task.healer && !o.dead) : null;
      if (healer) { think(w, a, 'treated', {name: healer.name}); think(w, healer, 'healedSomeone', {name: a.name}); }
      done(a); return;
    }
    if (!task.lying) {
      const r = follow(w, a, 'healer');
      if (r === 'arrived') task.lying = true;
      else if (r === 'none' && !w.nav.dirtySet.has('healer')) { w.nav.dirty('healer'); done(a); a.think = 30; }
      return;
    }
    a.sleeping = true;   // lies still: drawn dimmed, does not tire
  }},

  // the evening trade with a caravan: gather round the trader's goods, a few steps from the fire
  {id: 'trade', label: () => 'торгуется с купцом', step(w, a, task) {
    if (!tradeOpen(w)) { done(a); return; }
    const spot = w.caravan.spot;
    if (!spot) { follow(w, a, 'camp'); return; }
    if (!task.at) {
      if (Math.hypot(spot[0] - a.x, spot[1] - a.y) < 2.4) { task.at = true; if (!task.met) { task.met = true; attendTrade(w, a); } }
      else if (approach(w, a, spot[0], spot[1]) === null) follow(w, a, 'camp');
      return;
    }
    if (!task.spot || w.rng() < 0.02) { const ang = w.rng() * Math.PI * 2, r = 1.2 + w.rng() * 1.2; task.spot = [spot[0] + Math.cos(ang) * r, spot[1] + Math.sin(ang) * r]; }
    moveToward(w, a, task.spot[0], task.spot[1], 0.5);
  }},

  // caravan states: the caravan brain moves them itself
  {id: 'travel', label: () => 'идёт с караваном', step() {}},
  {id: 'camped', label: () => 'стоит лагерем у костра', step() {}},
  {id: 'stall', label: () => 'торгует', step() {}},
  {id: 'night', label: () => 'ночует у костра', step() {}},
  {id: 'escort', label: () => 'охраняет караван', step() {}},
  {id: 'pack', label: () => 'везёт поклажу', step() {}},
  // the pen: tame animals' states (agents/brains/livestock.js)
  {id: 'penned', label: () => 'в загоне', step() {}},
  {id: 'toPen', label: () => 'идёт в загон', step() {}},

  // animal states: the animal's brain moves it itself, these entries only name the state
  {id: 'graze', label: () => 'пасётся', step() {}},
  {id: 'nibble', label: () => 'грызёт припасы', step() {}},
  {id: 'rest', label: () => 'дремлет', step() {}},
  {id: 'bolt', label: () => 'убегает', step() {}},
  {id: 'roam', label: () => 'рыщет', step() {}},
  {id: 'chase', label: () => 'гонит добычу', step() {}},
  {id: 'maul', label: t => (t.mule ? (t.charging ? 'несётся на обидчика' : 'лягается') : 'нападает'), step() {}},
  {id: 'feed', label: () => 'ест добычу', step() {}},
]);

export const taskLabel = a => (a.task ? TASKS.get(a.task.id).label(a.task) : 'думает');
export const needTask = id => NEEDS.get(id).task;
