// Tasks are what an agent is doing right now: {id, ...state}. Brains choose them, TASKS run them.
// Shared by every brain, so a new creature can reuse 'fight', 'flee' or 'idle' as they are.
import {Registry} from '../core/registry.js';
import {JOBS} from '../data/jobs.js';
import {NEEDS} from '../data/needs.js';
import {ambientTemp} from '../core/time.js';
import {cellOf} from '../world/grid.js';
import {follow, moveToward, escapeHeat, nearFire} from './movement.js';
import {attack, shoot} from './combat.js';
import {RUNNERS} from './jobRunners.js';
import {eatMeal, plunder} from '../settlement/stock.js';
import {councilDue} from '../settlement/council.js';
import {log} from '../core/log.js';

export const TASKS = new Registry('task');
const done = a => { a.task = null; a.think = 0; };

// wander a little inside the camp so people don't stand in one spot
function mill(w, a, task, radius = 1.2) {
  if (!task.spot || Math.random() < 0.02) {
    const ang = Math.random() * Math.PI * 2, r = Math.random() * radius;
    task.spot = [w.camp.x + 0.5 + Math.cos(ang) * r, w.camp.y + 0.5 + Math.sin(ang) * r];
  }
  moveToward(w, a, task.spot[0], task.spot[1], 0.5);
}

TASKS.registerAll([
  {id: 'eat', label: () => 'ест', step(w, a) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    const fed = eatMeal(w);
    if (fed) { a.needs.food = Math.min(1, a.needs.food + fed); done(a); }
    else a.task = {id: 'job', job: 'gather', eatNow: true};   // empty stock: eat straight from the bushes
  }},

  {id: 'sleep', label: () => 'спит', step(w, a, task) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    // huts make sleep faster and warm, while there are enough beds for everyone
    const beds = Math.min(1, w.mods.add.beds / Math.max(1, w.agents.filter(o => o.faction === 'colony').length));
    a.sleeping = true;
    a.needs.rest = Math.min(1, a.needs.rest + 0.004 * (1 + 0.6 * beds));
    if (beds > 0 && a.needs.warmth != null) a.needs.warmth = Math.min(1, a.needs.warmth + 0.002 * beds);
    mill(w, a, task, 1.2);
    if (a.needs.rest >= 1) done(a);
  }},

  {id: 'warm', label: () => 'греется у костра', step(w, a, task) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    mill(w, a, task, 1.2);
    if (a.needs.warmth > 0.92) done(a);
  }},

  {id: 'council', label: () => 'на совете у костра', step(w, a, task) {
    if (!councilDue(w)) { done(a); return; }
    if (follow(w, a, 'camp') !== 'arrived') return;
    task.seated = true;
    if (!task.spot) { const ang = Math.random() * Math.PI * 2; task.spot = [w.camp.x + 0.5 + Math.cos(ang) * 1.6, w.camp.y + 0.5 + Math.sin(ang) * 1.6]; }
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
      if (d > range * 0.9) { if (moveToward(w, a, t.x, t.y, 1.0) === null) follow(w, a, 'camp'); }
      else shoot(w, a, t, 'hunt');
      return;
    }
    task.shooting = false;
    if (d > 0.9) { if (moveToward(w, a, t.x, t.y, 1.1) === null) follow(w, a, 'camp'); }
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
    if (follow(w, a, 'camp', 1.2) === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < 3) mill(w, a, task, 2.2);
  }},

  // run for the settlement zone when something is hunting you
  {id: 'runHome', label: () => 'бежит к поселению', step(w, a) {
    if (follow(w, a, 'zone', 1.3) === 'arrived') done(a);
  }},

  // animal states: the animal's brain moves it itself, these entries only name the state
  {id: 'graze', label: () => 'пасётся', step() {}},
  {id: 'rest', label: () => 'дремлет', step() {}},
  {id: 'bolt', label: () => 'убегает', step() {}},
  {id: 'roam', label: () => 'рыщет', step() {}},
  {id: 'chase', label: () => 'гонит добычу', step() {}},
  {id: 'maul', label: () => 'нападает', step() {}},
  {id: 'feed', label: () => 'ест добычу', step() {}},
]);

export const taskLabel = a => (a.task ? TASKS.get(a.task.id).label(a.task) : 'думает');
export const needTask = id => NEEDS.get(id).task;
