// Tasks are what an agent is doing right now: {id, ...state}. Brains choose them, TASKS run them. `quiet`: a task that
// winds down when something else is chosen (a meal giving way to sleep) — closed as done, not as dropped (agents/brains/tabled.js).
// Shared by every brain, so a new creature can reuse 'fight', 'flee' or 'idle' as they are.
// The tasks live here and in agents/tasks/*.js (the colony's tasks for one another, the raiders', the camp's); they are
// registered in one fixed order.
import {isSummoner, trySummon} from './summon.js';
import {skipped} from './lifecycle.js';
import {Registry} from '../core/registry.js';
import {JOBS} from '../data/jobs.js';
import {FOODS} from '../data/foods.js';
import {cellOf} from '../world/grid.js';
import {nightness, scaleOf} from '../core/time.js';
import {follow, moveToward, escapeHeat, nearFire, approach} from './movement.js';
import {attack, shoot, canSee, reachOf, behindRock, hurl} from './combat.js';
import {COMBAT} from '../data/balance/combat.js';
import {RUNNERS, carriedFood, eatCarried} from './jobRunners.js';
import {eatMeal, campFuel} from '../settlement/stock.js';
import {councilDue} from '../settlement/council.js';
import {think} from './mind.js';
import {has, colonists, raidAlarm} from '../settlement/query.js';
import {homeComfort, prayed} from '../settlement/life.js';
import {bond, TOGETHER} from '../settlement/together.js';
import {coolTo, tempAt} from '../world/heat.js';
import {WARM_AT} from '../data/navmaps.js';
import {PRAYER} from '../data/colony.js';
import {liveById, onMap} from './lookup.js';
import {flagLead} from '../settlement/board.js';
import {wake} from './attention.js';
import {ESCAPE} from '../data/captives.js';
import {catchRunaway} from '../settlement/escape.js';
import {REST, KINDLE, TASK} from '../data/behaviour.js';
import {BEHAVIOURS} from '../data/behaviours.js';
import {ACTS} from './behaviours/index.js';
import {done, fail, forage, mill, campMill} from './tasks/common.js';
import {socialTasks} from './tasks/social.js';
import {raidTasks} from './tasks/raid.js';
import {campTasks} from './tasks/camp.js';

export const TASKS = new Registry('task');

TASKS.registerAll([
  {id: 'eat', quiet: true, label: () => 'ест', step(w, a) {
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
    // empty stock: eat what food is in the hands, otherwise straight from the bushes — unless the bushes
    // are bare too (winter: gathering just came back blocked): then there is nothing to eat, and the
    // meal waits so that the hunt or the rod gets its turn instead of eat → gather → eat on the spot
    else if (carriedFood(a) >= 1) { eatCarried(a); done(w, a); }
    else if (!forage() || skipped(w, a, {id: 'job', job: forage()})) fail(w, a, 'есть нечего: склад пуст, ягод нет');
    else a.task = {id: 'job', job: forage(), eatNow: true};
  }},

  {id: 'sleep', quiet: true, label: () => 'спит', step(w, a, task) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    // beds make sleep faster; how warm a night is depends on what the beds are in: a drafty hut
    // (bedWarmth 1.2 per 4 beds) or a log house (4 per 4 beds), and on whether the fire burns
    const pop = Math.max(1, colonists(w).length);
    const beds = Math.min(1, w.mods.add.beds / pop), warm = Math.min(1, (w.mods.add.bedWarmth || 0) / pop);
    a.sleeping = true;
    const k = 1 / scaleOf(w);   // (the body lives by the sun: core/time.js dayScale)
    a.needs.rest = Math.min(1, a.needs.rest + REST.rate * (1 + REST.beds * beds) * k);
    if (warm > 0 && a.needs.warmth != null) a.needs.warmth = Math.min(1, a.needs.warmth + REST.warm * warm * (w.campLit ? 1 : REST.unlit) * k);
    mill(w, a, task, TASK.mill.sleep);
    // rested before dawn: sleep on till first light rather than stand about in the dark (nobody goes to the
    // woods by night); a tired body or an alarm still wakes anyone
    if (a.needs.rest >= 1 && nightness(w) > REST.nightFrom && !raidAlarm(w)) return;
    if (a.needs.rest >= 1) {
      if (warm > REST.houseWarm) { const c = homeComfort(w); think(w, a, 'sleptHouse', {mood: REST.houseMood + c * REST.houseComfort, fine: c > REST.houseFine}); }
      else think(w, a, beds > 0 ? 'sleptHut' : 'sleptOutside');
      done(w, a);
    }
  }},

  {id: 'warm', quiet: true, label: () => 'греется', step(w, a, task) {
    // no fuel: there is no fire to warm at, neither at the camp nor in a hut — rather than stand freezing by
    // the cold ashes, go for logs (the chop job wants them most when the stock is empty)
    if (!campFuel(w)) { fail(w, a, 'костёр погас: топлива нет'); return; }
    const i = cellOf(w, a);
    // the hearth here has gone cold (a hut in a hard frost): the field is stale, the fire is the place
    if (!task.toFire && !w.camp.set.has(i) && w.nav.get('warm')[i] === 0 && tempAt(w, i) <= WARM_AT) { w.nav.dirty('warm'); task.toFire = true; }
    if (follow(w, a, task.toFire ? 'camp' : 'warm') !== 'arrived') return;
    if (w.camp.set.has(i)) mill(w, a, task, TASK.mill.sleep);
    if (a.needs.warmth > REST.warmEnough) done(w, a);
  }},

  {id: 'council', quiet: true, label: () => 'на совете у костра', step(w, a, task) {
    if (!councilDue(w)) { done(w, a); return; }
    if (follow(w, a, 'camp') !== 'arrived') return;
    task.seated = true;
    if (!task.spot) { const ang = w.rngs.colony() * Math.PI * 2; task.spot = [w.camp.x + 0.5 + Math.cos(ang) * TASK.council.ring, w.camp.y + 0.5 + Math.sin(ang) * TASK.council.ring]; }
    moveToward(w, a, task.spot[0], task.spot[1], TASK.mill.pace);
  }},

  {id: 'flee', label: () => 'бежит от огня', step(w, a) {
    escapeHeat(w, a);
    if (w.grid.heat[cellOf(w, a)] < TASK.flee.cool && !nearFire(w, a, TASK.flee.fire)) done(w, a);
  }},

  // fight: archers and slingers keep their distance and shoot, everyone else closes in
  {id: 'fight', label: t => (t.shooting ? 'стреляет' : 'дерётся'), step(w, a, task) {
    const t = task.target;
    if (!t || t.dead || t.downed || !onMap(w, t)) { done(w, a); return; }   // the fallen are left alone
    // the foe slipped out of sight (dived, melted into the thicket): go to where it was seen last,
    // look about for a little, then give up
    if (!canSee(w, a, t)) {
      task.lost ??= {x: t.x, y: t.y, until: w.tick + TASK.fight.lost};
      if (w.tick > task.lost.until || approach(w, a, task.lost.x, task.lost.y, TASK.fight.lostPace) !== false) fail(w, a, 'враг скрылся из виду');
      return;
    }
    task.lost = null;
    // an elf who calls the forest beasts does it once a fight (agents/summon.js)
    if (isSummoner(w, a)) trySummon(w, a, t);
    // a runaway caught by someone else is one of ours again: the chase is over, nobody hits it (settlement/escape.js)
    if (t.captive && !t.fugitive && t.faction === a.faction && !task.reflex) { done(w, a); return; }
    // a runaway captive (settlement/escape.js) is not fought: whoever gets within reach grabs it
    if (t.fugitive) { if (Math.hypot(t.x - a.x, t.y - a.y) <= ESCAPE.catch.reach) { catchRunaway(w, a, t); done(w, a); } else if (approach(w, a, t.x, t.y, TASK.fight.catchPace) === null) fail(w, a, 'беглеца не догнать', 'impossible'); return; }
    if (a.faction === 'colony') {
      a.lastFight = w.tick;
      // standing up for someone the foe is on: they remember it (settlement/together.js)
      const v = t.task?.target;
      if (v && v !== a && v.faction === 'colony' && task.stoodFor !== v.id && (t.task.id === 'maul' || t.task.id === 'fight')) { task.stoodFor = v.id; bond(w, v, a, TOGETHER.bondDefend * 0.6); }
    }
    const d = Math.hypot(t.x - a.x, t.y - a.y), g = a.gear;
    if (a.belt?.length && hurl(w, a, t, d)) return;   // a fire flask first, while the foe is still off (agents/combat.js)
    const F = TASK.fight;
    if (g?.rangedReady && d > F.shootFrom) {
      const range = g.ranged.range + (a.faction === 'colony' ? w.mods.add.huntRange : 0);
      task.shooting = true;
      // close in when too far, or when a rock blocks the shot
      if (d > range * F.shootRange || (shoot(w, a, t) === null && a.cd <= 0)) { if (approach(w, a, t.x, t.y, F.shootPace) === null) fail(w, a, 'к врагу не подойти', 'impossible'); }
      return;
    }
    task.shooting = false;
    // a long weapon (quality `reach`) strikes from where it reaches and lets the foe come on; anyone else closes in
    const R = reachOf(a), stand = R > COMBAT.reach ? R - COMBAT.reachStand : Math.min(F.stand, R);
    if (d > stand || behindRock(w, a, t)) { if (approach(w, a, t.x, t.y, F.closePace) === null) fail(w, a, 'к врагу не подойти', 'impossible'); }   // unreachable: pick something else
    else attack(w, a, t);
  }},

  // answering a cry (settlement/board.js): run to where the threat was seen; once a foe of it is in
  // sight, fight it. Gone from the board — done; nobody there — the cry was in vain
  {id: 'answer', label: () => 'спешит на крик', step(w, a, task) {
    const lead = flagLead(w, a, task.flag);
    if (!lead) { done(w, a); return; }
    if (lead.target) { a.task = {id: 'fight', target: lead.target, flag: task.flag}; return; }
    const r = approach(w, a, lead.at.x, lead.at.y, 1.1);
    if (r === null) fail(w, a, 'к месту тревоги не пройти', 'impossible');
    else if (r === true) fail(w, a, 'на месте никого');
  }},

  ...socialTasks(),

  {id: 'douse', label: () => 'тушит пожар', step(w, a) {
    if (w.stats.fireNearCamp === 0) { done(w, a); return; }
    const D = TASK.douse;
    if (!nearFire(w, a, D.near)) { if (follow(w, a, 'fire') !== 'moving') { done(w, a); a.think = D.think; } return; }
    const g = w.grid, cx = a.x | 0, cy = a.y | 0, power = KINDLE.douse * w.mods.mul.douse;
    for (let y = cy - D.reach; y <= cy + D.reach; y++) for (let x = cx - D.reach; x <= cx + D.reach; x++) {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h || (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2 > D.r2) continue;
      const j = y * w.w + x;
      if (g.fire[j] > 0) { g.fire[j] = Math.max(0, g.fire[j] - power); g.heat[j] -= D.cool; if (g.fire[j] === 0) coolTo(w, j, D.coolTo); }
    }
  }},

  {id: 'job', label: t => JOBS.get(t.job).verb, runnerOf: t => JOBS.get(t.job).runner, step(w, a, task) { RUNNERS[JOBS.get(task.job).runner](w, a, task); }},

  // a moment's thought between two jobs: stands, then takes up what it had settled on
  {id: 'ponder', quiet: true, label: () => 'прикидывает, за что взяться', step(w, a, task) {
    if (w.tick >= task.until) { a.task = task.next; wake(a, 'обдумал, за что взяться', 'обдумал'); }
  }},
  {id: 'idle', quiet: true, label: () => 'отдыхает', step(w, a, task) {
    campMill(w, a, task, ...TASK.mill.idle);
  }},

  // a gloomy spell: drifts about the camp instead of working (settlement/life.js)
  {id: 'sulk', quiet: true, label: () => 'хандрит', step(w, a, task) {
    if (w.tick >= task.until) { done(w, a); return; }
    campMill(w, a, task, ...TASK.mill.sulk);
  }},

  // a prayer at the shrine, once a day for someone in low spirits
  // (the building prayed at: data/colony.js PRAYER)
  {id: 'pray', label: t => (t.at ? 'молится у святилища' : 'идёт к святилищу'), get map() { return 'station:' + PRAYER.at; }, step(w, a, task) {
    const map = 'station:' + PRAYER.at;
    if (!has(w, PRAYER.at)) { fail(w, a, 'святилища нет'); return; }
    if (!task.at) {
      const r = follow(w, a, map);
      if (r === 'arrived') task.at = w.tick;
      else if (r === 'none' && !w.nav.dirtySet.has(map)) { w.nav.dirty(map); fail(w, a, 'к святилищу нет пути', 'impossible'); a.think = TASK.think.pray; }
      return;
    }
    if (w.tick - task.at > PRAYER.ticks) { prayed(w, a); done(w, a); }
  }},

  ...raidTasks(),

  ...campTasks(),

  // the beasts' and the nechist's own states (graze, bolt, roam, chase, maul, feed, hide, lurk, sing, penned…) come
  // with their behaviours (data/behaviours.js), registered below

  // spells of the nechist (agents/behaviours/astray.js, lure.js) on a colonist: they last until `until`
  // the leshy's spores: the colonist wanders in circles, then comes to
  {id: 'astray', label: () => 'плутает в лесу', step(w, a, task) {
    if (w.tick >= task.until) { think(w, a, 'foundWay'); done(w, a); return; }
    if (!task.spot || moveToward(w, a, task.spot[0], task.spot[1], TASK.astray.pace) !== false) {
      const ang = w.rngs.colony() * Math.PI * 2;
      task.spot = [a.x + Math.cos(ang) * TASK.astray.step, a.y + Math.sin(ang) * TASK.astray.step];
    }
  }},
  // the rusalka's song: the colonist walks to the water; someone close by breaks the spell (agents/behaviours/lure.js)
  {id: 'lured', label: () => 'идёт на голос у воды', step(w, a, task) {
    const s = liveById(w, task.by);
    if (!s || w.tick >= task.until) { done(w, a); return; }
    if (Math.hypot(s.x - a.x, s.y - a.y) > 0.8) approach(w, a, s.x, s.y, 0.7);
  }},

  // the behaviours' own tasks (data/behaviours.js; the code in agents/behaviours/, reached when the task
  // runs): run by the tabled brain, named for every brain
  ...BEHAVIOURS.filter(d => d.task !== false).map(d => ({id: typeof d.task === 'string' ? d.task : d.id, label: d.label,
    step: (w, a, t) => ACTS[d.id].step(w, a, t), enter: (w, a, t) => ACTS[d.id].enter?.(w, a, t), exit: (w, a, t, o) => ACTS[d.id].exit?.(w, a, t, o)})),
]);

export const taskLabel = a => (a.task ? TASKS.get(a.task.id).label(a.task) : 'думает');
