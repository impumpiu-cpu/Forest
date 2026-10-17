// Tasks are what an agent is doing right now: {id, ...state}. Brains choose them, TASKS run them.
// Shared by every brain, so a new creature can reuse 'fight', 'flee' or 'idle' as they are.
import {endTask} from './lifecycle.js';
import {maxHp} from './agent.js';
import {Registry} from '../core/registry.js';
import {JOBS} from '../data/jobs.js';
import {BUILDINGS} from '../data/buildings.js';
import {NEEDS} from '../data/needs.js';
import {FOODS} from '../data/foods.js';
import {ambientTemp} from '../core/time.js';
import {cellOf} from '../world/grid.js';
import {follow, moveToward, escapeHeat, nearFire, approach} from './movement.js';
import {attack, shoot, canSee, reachOf, behindRock} from './combat.js';
import {RUNNERS, carriedFood, eatCarried} from './jobRunners.js';
import {eatMeal, plunder} from '../settlement/stock.js';
import {councilDue} from '../settlement/council.js';
import {log} from '../core/log.js';
import {think} from './mind.js';
import {tradeOpen, attendTrade} from '../settlement/trade.js';
import {HEAL, freeBed} from '../settlement/healing.js';
import {reserve} from '../settlement/reserve.js';
import {has, colonists, raidAlarm} from '../settlement/query.js';
import {homeComfort, prayed} from '../settlement/life.js';
import {squadOf, noteHome, SQUAD} from './squad.js';
import {enterEscort, escortGoing, guardStep, giveAid, askForBed, bond, TOGETHER} from '../settlement/together.js';
import {agentInZone} from '../settlement/zone.js';

export const TASKS = new Registry('task');
// every task ends through the lifecycle (agents/lifecycle.js): done, or given up with a reason
const done = (w, a) => endTask(w, a, 'done');
const fail = (w, a, why, outcome = 'blocked') => endTask(w, a, outcome, why);

// wander a little inside the camp so people don't stand in one spot
function mill(w, a, task, radius = 1.2) {
  if (!task.spot || w.rngs.colony() < 0.02) {
    const ang = w.rngs.colony() * Math.PI * 2, r = w.rngs.colony() * radius;
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
      a.needs.food = Math.min(1, a.needs.food + fed); done(w, a);
    }
    // empty stock: eat what food is in the hands, otherwise straight from the bushes
    else if (carriedFood(a) >= 1) { eatCarried(a); done(w, a); }
    else a.task = {id: 'job', job: 'gather', eatNow: true};
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
      done(w, a);
    }
  }},

  {id: 'warm', label: () => 'греется', step(w, a, task) {
    if (follow(w, a, 'warm') !== 'arrived') return;
    if (w.camp.set.has(cellOf(w, a))) mill(w, a, task, 1.2);
    if (a.needs.warmth > 0.92) done(w, a);
  }},

  {id: 'council', label: () => 'на совете у костра', step(w, a, task) {
    if (!councilDue(w)) { done(w, a); return; }
    if (follow(w, a, 'camp') !== 'arrived') return;
    task.seated = true;
    if (!task.spot) { const ang = w.rngs.colony() * Math.PI * 2; task.spot = [w.camp.x + 0.5 + Math.cos(ang) * 1.6, w.camp.y + 0.5 + Math.sin(ang) * 1.6]; }
    moveToward(w, a, task.spot[0], task.spot[1], 0.5);
  }},

  {id: 'flee', label: () => 'бежит от огня', step(w, a) {
    escapeHeat(w, a);
    if (w.grid.temp[cellOf(w, a)] < ambientTemp(w) + 16 && !nearFire(w, a, 3)) done(w, a);
  }},

  // fight: archers and slingers keep their distance and shoot, everyone else closes in
  {id: 'fight', label: t => (t.shooting ? 'стреляет' : 'дерётся'), step(w, a, task) {
    const t = task.target;
    if (!t || t.dead || t.downed || !w.agents.includes(t)) { done(w, a); return; }   // the fallen are left alone
    // the foe slipped out of sight (dived, melted into the thicket): go to where it was seen last,
    // look about for a little, then give up
    if (!canSee(w, a, t)) {
      task.lost ??= {x: t.x, y: t.y, until: w.tick + 60};
      if (w.tick > task.lost.until || approach(w, a, task.lost.x, task.lost.y, 0.9) !== false) fail(w, a, 'враг скрылся из виду');
      return;
    }
    task.lost = null;
    if (a.faction === 'colony') {
      a.lastFight = w.tick;
      // standing up for someone the foe is on: they remember it (settlement/together.js)
      const v = t.task?.target;
      if (v && v !== a && v.faction === 'colony' && task.stoodFor !== v.id && (t.task.id === 'maul' || t.task.id === 'fight')) { task.stoodFor = v.id; bond(w, v, a, TOGETHER.bondDefend * 0.6); }
    }
    const d = Math.hypot(t.x - a.x, t.y - a.y), g = a.gear;
    if (g?.rangedReady && d > 1.4) {
      const range = g.ranged.range + (a.faction === 'colony' ? w.mods.add.huntRange : 0);
      task.shooting = true;
      // close in when too far, or when a rock blocks the shot
      if (d > range * 0.9 || (shoot(w, a, t) === null && a.cd <= 0)) { if (approach(w, a, t.x, t.y, 1.0) === null) fail(w, a, 'к врагу не подойти', 'impossible'); }
      return;
    }
    task.shooting = false;
    if (d > Math.min(0.9, reachOf(a)) || behindRock(w, a, t)) { if (approach(w, a, t.x, t.y, 1.1) === null) fail(w, a, 'к врагу не подойти', 'impossible'); }   // unreachable: pick something else
    else attack(w, a, t);
  }},

  // going along with someone in the woods (settlement/together.js): keep close, take on what comes
  {id: 'company', label: t => (t.home ? 'ведёт раненого к своим' : 'сопровождает в лесу'), enter: enterEscort, step(w, a, task) {
    const b = escortGoing(w, a, task);
    if (!b) { done(w, a); return; }
    guardStep(w, a, b, task);
  }},
  // a wounded colonist out in the woods: go, dress the wounds, see them home. One who fell senseless
  // (agents/wounds.js) is helped anywhere, inside the camp too: dressing the wound in time saves a life
  {id: 'aid', label: t => (t.fallen ? 'спешит к упавшему' : 'спешит на помощь раненому'), step(w, a, task) {
    const b = w.agents.find(o => o.id === task.who && !o.dead);
    if (!b || (agentInZone(w, b) && !b.downed)) { done(w, a); return; }
    if (guardStep(w, a, b, task) === 'fight') return;
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1.4) { if (approach(w, a, b.x, b.y, 1.2) === null) fail(w, a, 'к раненому не подойти', 'impossible'); return; }
    const fallen = !!b.downed;
    giveAid(w, a, b);
    if (fallen || agentInZone(w, b)) done(w, a); else a.task = {id: 'company', who: b.id, home: true};
  }},

  // senseless on the ground after a deadly blow: nothing to do but bleed and wait for help (agents/wounds.js)
  {id: 'downed', label: () => 'лежит без сознания', step() {}},

  {id: 'douse', label: () => 'тушит пожар', step(w, a) {
    if (w.stats.fireNearCamp === 0) { done(w, a); return; }
    if (!nearFire(w, a, 1.7)) { if (follow(w, a, 'fire') !== 'moving') { done(w, a); a.think = 10; } return; }
    const g = w.grid, cx = a.x | 0, cy = a.y | 0, power = 0.05 * w.mods.mul.douse;
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h || (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2 > 2.9) continue;
      const j = y * w.w + x;
      if (g.fire[j] > 0) { g.fire[j] = Math.max(0, g.fire[j] - power); g.temp[j] -= 6; if (g.fire[j] === 0) g.temp[j] = Math.min(g.temp[j], 60); }
    }
  }},

  {id: 'job', label: t => JOBS.get(t.job).verb, runnerOf: t => JOBS.get(t.job).runner, step(w, a, task) { RUNNERS[JOBS.get(task.job).runner](w, a, task); }},

  {id: 'idle', label: () => 'отдыхает', step(w, a, task) {
    if (follow(w, a, 'camp') === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < 4) mill(w, a, task, 2.5);
  }},

  // a gloomy spell: drifts about the camp instead of working (settlement/life.js)
  {id: 'sulk', label: () => 'хандрит', step(w, a, task) {
    if (w.tick >= task.until) { done(w, a); return; }
    if (follow(w, a, 'camp') === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < 5) mill(w, a, task, 4);
  }},

  // a prayer at the shrine, once a day for someone in low spirits
  {id: 'pray', label: t => (t.at ? 'молится у святилища' : 'идёт к святилищу'), map: 'station:shrine', step(w, a, task) {
    if (!has(w, 'shrine')) { fail(w, a, 'святилища нет'); return; }
    if (!task.at) {
      const r = follow(w, a, 'station:shrine');
      if (r === 'arrived') task.at = w.tick;
      else if (r === 'none' && !w.nav.dirtySet.has('station:shrine')) { w.nav.dirty('station:shrine'); fail(w, a, 'к святилищу нет пути', 'impossible'); a.think = 30; }
      return;
    }
    if (w.tick - task.at > 60) { prayed(w, a); done(w, a); }
  }},

  // raiders
  {id: 'assault', label: () => 'идёт к складу', step(w, a) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    const took = plunder(w);
    if (took > 0.5 && w.tick - w.stats.lastSteal > 40) log(w, 'Налётчики грабят склад.', 'danger');
    w.stats.lastSteal = w.tick; a.looted = true; a.task = {id: 'leave'};
  }},
  {id: 'leave', label: () => 'уходит', step(w, a) { if (follow(w, a, 'edge') === 'arrived') { a.gone = true; noteHome(w, a); } }},
  // a torch-bearer of a band that came to burn (agents/squad.js): to the camp, then to the building, and
  // a fire under its wall
  {id: 'torch', label: () => 'несёт факел', step(w, a, task) {
    const b = w.buildings.find(x => x.id === task.b && x.done), sq = squadOf(w, a);
    if (!b || !sq || sq.lit != null) { done(w, a); return; }
    if (w.nav.get('camp')[cellOf(w, a)] > 14) { follow(w, a, 'camp'); return; }
    let best = null, bd = Infinity;
    for (const c of b.cells) { const d = Math.hypot((c % w.w) + 0.5 - a.x, ((c / w.w) | 0) + 0.5 - a.y); if (d < bd) { bd = d; best = c; } }
    if (best == null) { done(w, a); return; }
    if (bd > SQUAD.burnNear) { if (approach(w, a, (best % w.w) + 0.5, ((best / w.w) | 0) + 0.5) === null) fail(w, a, 'к постройке не подойти', 'impossible'); return; }
    w.grid.fire[best] = Math.max(w.grid.fire[best], 0.6); w.grid.temp[best] = Math.max(w.grid.temp[best], 300); w.grid.fuel[best] = Math.max(w.grid.fuel[best], 0.9);
    w.nav.dirty('fire');
    sq.lit = w.tick;
    log(w, `${a.name} ${a.gender === 'f' ? 'подожгла' : 'поджёг'} ${BUILDINGS.get(b.key).name.toLowerCase()}! Тушите!`, 'danger', 'notice');
    a.task = {id: 'leave'};
  }},
  // scouts: come within sight of the camp, look it over, and take the news home
  {id: 'scout', label: () => 'высматривает лагерь', step(w, a, task) {
    const sq = squadOf(w, a);
    if (!sq) { done(w, a); return; }
    if (w.nav.get('camp')[cellOf(w, a)] > SQUAD.scoutNear) { follow(w, a, 'camp', 0.8); return; }
    sq.watched ??= w.tick;
    mill(w, a, task, 1.5);
  }},
  // the mindless dead: shamble to the camp and wander there until something living comes close
  {id: 'haunt', label: () => 'бредёт к лагерю', step(w, a, task) {
    if (!w.agents.some(o => o.faction === 'colony' && !o.dead)) { a.task = {id: 'leave'}; return; }
    if (follow(w, a, 'camp') === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < 4) mill(w, a, task, 3);
  }},

  // gather by the fire when raiders come; done as soon as the alarm is over
  {id: 'muster', label: () => 'собирается по тревоге', step(w, a, task) {
    if (!raidAlarm(w)) { done(w, a); return; }
    think(w, a, 'raidAlarm');
    if (follow(w, a, 'camp', 1.2) === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < 3) mill(w, a, task, 2.2);
  }},

  // run for the settlement zone when something is hunting you
  {id: 'runHome', label: () => 'бежит к поселению', step(w, a) {
    if (follow(w, a, 'zone', 1.3) === 'arrived') done(w, a);
  }},

  // a wounded colonist lies in the healer's hut until mostly healed (settlement/healing.js)
  {id: 'treat', label: t => (t.lying ? (t.healer != null ? 'лечится у лекаря' : 'лежит в хижине лекаря') : 'идёт к лекарю'), step(w, a, task) {
    if (!has(w, 'healerhut')) { fail(w, a, 'хижины лекаря нет'); return; }
    const max = maxHp(a);
    if (a.hp >= max * HEAL.until) {
      const healer = task.healer != null ? w.agents.find(o => o.id === task.healer && !o.dead) : null;
      if (healer) { think(w, a, 'treated', {name: healer.name}); think(w, healer, 'healedSomeone', {name: a.name}); }
      done(w, a); return;
    }
    // a bed of one's own, held on the way and while lying there
    // a bed of one's own; when all are taken, someone on the mend may give theirs up (settlement/together.js)
    const bed = freeBed(w, a) || (!task.bed && askForBed(w, a, endTask));
    if (!bed || !reserve(w, bed, a)) { fail(w, a, 'в хижине лекаря нет места'); a.think = 30; return; }
    task.bed = bed;
    if (!task.lying) {
      const r = follow(w, a, 'healer');
      if (r === 'arrived') task.lying = true;
      else if (r === 'none' && !w.nav.dirtySet.has('healer')) { w.nav.dirty('healer'); fail(w, a, 'к лекарю нет пути', 'impossible'); a.think = 30; }
      return;
    }
    a.sleeping = true;   // lies still: drawn dimmed, does not tire
  }},

  // the evening trade with a caravan: gather round the trader's goods, a few steps from the fire
  {id: 'trade', label: () => 'торгуется с купцом', step(w, a, task) {
    if (!tradeOpen(w)) { done(w, a); return; }
    const spot = w.caravan.spot;
    if (!spot) { follow(w, a, 'camp'); return; }
    if (!task.at) {
      if (Math.hypot(spot[0] - a.x, spot[1] - a.y) < 2.4) { task.at = true; if (!task.met) { task.met = true; attendTrade(w, a); } }
      else if (approach(w, a, spot[0], spot[1]) === null) follow(w, a, 'camp');
      return;
    }
    if (!task.spot || w.rngs.colony() < 0.02) { const ang = w.rngs.colony() * Math.PI * 2, r = 1.2 + w.rngs.colony() * 1.2; task.spot = [spot[0] + Math.cos(ang) * r, spot[1] + Math.sin(ang) * r]; }
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
  {id: 'hide', label: () => 'прячется', step() {}},
  {id: 'lurk', label: () => 'таится', step() {}},
  {id: 'sing', label: () => 'поёт у воды', step() {}},

  // spells of the nechist (agents/brains/spirit.js) on a colonist: they last until `until`
  // the leshy's spores: the colonist wanders in circles, then comes to
  {id: 'astray', label: () => 'плутает в лесу', step(w, a, task) {
    if (w.tick >= task.until) { think(w, a, 'foundWay'); done(w, a); return; }
    if (!task.spot || moveToward(w, a, task.spot[0], task.spot[1], 0.6) !== false) {
      const ang = w.rngs.colony() * Math.PI * 2;
      task.spot = [a.x + Math.cos(ang) * 3, a.y + Math.sin(ang) * 3];
    }
  }},
  // the rusalka's song: the colonist walks to the water; someone close by breaks the spell (spirit.js)
  {id: 'lured', label: () => 'идёт на голос у воды', step(w, a, task) {
    const s = w.agents.find(o => o.id === task.by && !o.dead);
    if (!s || w.tick >= task.until) { done(w, a); return; }
    if (Math.hypot(s.x - a.x, s.y - a.y) > 0.8) approach(w, a, s.x, s.y, 0.7);
  }},
]);

export const taskLabel = a => (a.task ? TASKS.get(a.task.id).label(a.task) : 'думает');
export const needTask = id => NEEDS.get(id).task;
