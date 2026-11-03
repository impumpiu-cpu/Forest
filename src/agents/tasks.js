// Tasks are what an agent is doing right now: {id, ...state}. Brains choose them, TASKS run them. `quiet`: a task that
// winds down when something else is chosen (a meal giving way to sleep) — closed as done, not as dropped (agents/brains/tabled.js).
// Shared by every brain, so a new creature can reuse 'fight', 'flee' or 'idle' as they are.
import {isSummoner, trySummon} from './summon.js';
import {endTask, skipped} from './lifecycle.js';
import {maxHp} from './agent.js';
import {Registry} from '../core/registry.js';
import {JOBS} from '../data/jobs.js';
import {BUILDINGS} from '../data/buildings.js';
import {FOODS} from '../data/foods.js';
import {cellOf, distToCell} from '../world/grid.js';
import {nightness} from '../core/time.js';
import {follow, moveToward, escapeHeat, nearFire, approach, recover} from './movement.js';
import {attack, shoot, canSee, reachOf, behindRock, hurl, kindle} from './combat.js';
import {throwTorch, spendThrow} from './equipment.js';
import {COMBAT} from '../data/balance/combat.js';
import {RUNNERS, carriedFood, eatCarried} from './jobRunners.js';
import {eatMeal, plunder, lootTotal, campFuel} from '../settlement/stock.js';
import {councilDue} from '../settlement/council.js';
import {log} from '../core/log.js';
import {think} from './mind.js';
import {tradeOpen, attendTrade} from '../settlement/trade.js';
import {HEAL, freeBed, hasHut} from '../settlement/healing.js';
import {reserve} from '../settlement/reserve.js';
import {has, colonists, raidAlarm} from '../settlement/query.js';
import {homeComfort, prayed} from '../settlement/life.js';
import {squadOf, noteHome, SQUAD} from './squad.js';
import {enterEscort, escortGoing, guardStep, giveAid, askForBed, bond, TOGETHER} from '../settlement/together.js';
import {agentInZone} from '../settlement/zone.js';
import {heatTo, coolTo, tempAt} from '../world/heat.js';
import {WARM_AT} from '../data/navmaps.js';
import {PRAYER} from '../data/colony.js';
import {liveById, onMap} from './lookup.js';
import {flagLead, raidOnBoard} from '../settlement/board.js';
import {wake} from './attention.js';
import {bindStillOn, bindCaptive} from '../settlement/captives.js';
import {CAPTIVE, ESCAPE} from '../data/captives.js';
import {catchRunaway} from '../settlement/escape.js';
import {assistStillOn} from '../settlement/masters.js';
import {REST, KINDLE, TACTICS} from '../data/behaviour.js';
import {dress as dressWound, stabilize} from './wounds.js';
import {CONDITIONS} from '../data/conditions.js';
import {BEHAVIOURS} from '../data/behaviours.js';
import {ACTS} from './behaviours/index.js';

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
// to the camp, and once there (or within `near` of it) wander about it within `radius`
function campMill(w, a, task, near, radius, pace = 1) {
  if (follow(w, a, 'camp', pace) === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < near) mill(w, a, task, radius);
}

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
    else if (skipped(w, a, {id: 'job', job: 'gather'})) fail(w, a, 'есть нечего: склад пуст, ягод нет');
    else a.task = {id: 'job', job: 'gather', eatNow: true};
  }},

  {id: 'sleep', quiet: true, label: () => 'спит', step(w, a, task) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    // beds make sleep faster; how warm a night is depends on what the beds are in: a drafty hut
    // (bedWarmth 1.2 per 4 beds) or a log house (4 per 4 beds), and on whether the fire burns
    const pop = Math.max(1, colonists(w).length);
    const beds = Math.min(1, w.mods.add.beds / pop), warm = Math.min(1, (w.mods.add.bedWarmth || 0) / pop);
    a.sleeping = true;
    a.needs.rest = Math.min(1, a.needs.rest + REST.rate * (1 + REST.beds * beds));
    if (warm > 0 && a.needs.warmth != null) a.needs.warmth = Math.min(1, a.needs.warmth + REST.warm * warm * (w.campLit ? 1 : REST.unlit));
    mill(w, a, task, 1.2);
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
    if (w.camp.set.has(i)) mill(w, a, task, 1.2);
    if (a.needs.warmth > REST.warmEnough) done(w, a);
  }},

  {id: 'council', quiet: true, label: () => 'на совете у костра', step(w, a, task) {
    if (!councilDue(w)) { done(w, a); return; }
    if (follow(w, a, 'camp') !== 'arrived') return;
    task.seated = true;
    if (!task.spot) { const ang = w.rngs.colony() * Math.PI * 2; task.spot = [w.camp.x + 0.5 + Math.cos(ang) * 1.6, w.camp.y + 0.5 + Math.sin(ang) * 1.6]; }
    moveToward(w, a, task.spot[0], task.spot[1], 0.5);
  }},

  {id: 'flee', label: () => 'бежит от огня', step(w, a) {
    escapeHeat(w, a);
    if (w.grid.heat[cellOf(w, a)] < 16 && !nearFire(w, a, 3)) done(w, a);
  }},

  // fight: archers and slingers keep their distance and shoot, everyone else closes in
  {id: 'fight', label: t => (t.shooting ? 'стреляет' : 'дерётся'), step(w, a, task) {
    const t = task.target;
    if (!t || t.dead || t.downed || !onMap(w, t)) { done(w, a); return; }   // the fallen are left alone
    // the foe slipped out of sight (dived, melted into the thicket): go to where it was seen last,
    // look about for a little, then give up
    if (!canSee(w, a, t)) {
      task.lost ??= {x: t.x, y: t.y, until: w.tick + 60};
      if (w.tick > task.lost.until || approach(w, a, task.lost.x, task.lost.y, 0.9) !== false) fail(w, a, 'враг скрылся из виду');
      return;
    }
    task.lost = null;
    // an elf who calls the forest beasts does it once a fight (agents/summon.js)
    if (isSummoner(w, a)) trySummon(w, a, t);
    // a runaway caught by someone else is one of ours again: the chase is over, nobody hits it (settlement/escape.js)
    if (t.captive && !t.fugitive && t.faction === a.faction && !task.reflex) { done(w, a); return; }
    // a runaway captive (settlement/escape.js) is not fought: whoever gets within reach grabs it
    if (t.fugitive) { if (Math.hypot(t.x - a.x, t.y - a.y) <= ESCAPE.catch.reach) { catchRunaway(w, a, t); done(w, a); } else if (approach(w, a, t.x, t.y, 1.2) === null) fail(w, a, 'беглеца не догнать', 'impossible'); return; }
    if (a.faction === 'colony') {
      a.lastFight = w.tick;
      // standing up for someone the foe is on: they remember it (settlement/together.js)
      const v = t.task?.target;
      if (v && v !== a && v.faction === 'colony' && task.stoodFor !== v.id && (t.task.id === 'maul' || t.task.id === 'fight')) { task.stoodFor = v.id; bond(w, v, a, TOGETHER.bondDefend * 0.6); }
    }
    const d = Math.hypot(t.x - a.x, t.y - a.y), g = a.gear;
    if (a.belt?.length && hurl(w, a, t, d)) return;   // a fire flask first, while the foe is still off (agents/combat.js)
    if (g?.rangedReady && d > 1.4) {
      const range = g.ranged.range + (a.faction === 'colony' ? w.mods.add.huntRange : 0);
      task.shooting = true;
      // close in when too far, or when a rock blocks the shot
      if (d > range * 0.9 || (shoot(w, a, t) === null && a.cd <= 0)) { if (approach(w, a, t.x, t.y, 1.0) === null) fail(w, a, 'к врагу не подойти', 'impossible'); }
      return;
    }
    task.shooting = false;
    // a long weapon (quality `reach`) strikes from where it reaches and lets the foe come on; anyone else closes in
    const R = reachOf(a), stand = R > COMBAT.reach ? R - COMBAT.reachStand : Math.min(0.9, R);
    if (d > stand || behindRock(w, a, t)) { if (approach(w, a, t.x, t.y, 1.1) === null) fail(w, a, 'к врагу не подойти', 'impossible'); }   // unreachable: pick something else
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

  // going along with someone in the woods (settlement/together.js): keep close, take on what comes
  {id: 'company', label: t => (t.captive ? 'ведёт пленного в лагерь' : t.home ? 'ведёт раненого к своим' : 'сопровождает в лесу'), enter: enterEscort, step(w, a, task) {
    const b = escortGoing(w, a, task);
    if (!b) { done(w, a); return; }
    guardStep(w, a, b, task);
  }},
  // a wounded colonist out in the woods: go, dress the wounds, see them home. One who fell senseless
  // (agents/wounds.js) is helped anywhere, inside the camp too: dressing the wound in time saves a life
  {id: 'aid', label: t => (t.fallen ? 'спешит к упавшему' : 'спешит на помощь раненому'), step(w, a, task) {
    const b = liveById(w, task.who);
    if (!b || (agentInZone(w, b) && !b.downed)) { done(w, a); return; }
    if (guardStep(w, a, b, task) === 'fight') return;
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1.4) { if (approach(w, a, b.x, b.y, 1.2) === null) fail(w, a, 'к раненому не подойти', 'impossible'); return; }
    const fallen = !!b.downed;
    giveAid(w, a, b);
    if (fallen || agentInZone(w, b)) done(w, a); else a.task = {id: 'company', who: b.id, home: true};
  }},

  // a foe lying senseless after the fight (settlement/captives.js): go, dress the wound, tie it up, see it
  // into the camp. Gone (bled out, bound by another), no bonds left, a foe close by again — the task is over
  {id: 'bind', label: () => 'вяжет упавшего врага', step(w, a, task) {
    const f = bindStillOn(w, a, task);
    if (!f) { done(w, a); return; }
    if (Math.hypot(f.x - a.x, f.y - a.y) > 1.3) { task.work = 0; if (approach(w, a, f.x, f.y, 1.2) === null) fail(w, a, 'к упавшему не подойти', 'impossible'); return; }
    if ((task.work = (task.work || 0) + 1) < CAPTIVE.bindTicks) return;
    if (!bindCaptive(w, a, f)) { fail(w, a, 'нечем связать'); return; }
    if (agentInZone(w, f)) done(w, a); else a.task = {id: 'company', who: f.id, home: true, captive: true};
  }},

  // a learner beside a master (settlement/masters.js): keep close while the master works; the learning and the
  // master's speed are the master's work itself (agents/jobRunners.js workRate, settlement/masters.js stepMasters)
  {id: 'assist', quiet: true, label: () => 'учится у мастера', step(w, a, task) {
    const m = assistStillOn(w, a, task);
    if (!m) { done(w, a); return; }
    if (Math.hypot(m.x - a.x, m.y - a.y) > 1.6) { if (approach(w, a, m.x, m.y, 1.1) === null) fail(w, a, 'к мастеру не подойти', 'impossible'); }
  }},



  {id: 'douse', label: () => 'тушит пожар', step(w, a) {
    if (w.stats.fireNearCamp === 0) { done(w, a); return; }
    if (!nearFire(w, a, 1.7)) { if (follow(w, a, 'fire') !== 'moving') { done(w, a); a.think = 10; } return; }
    const g = w.grid, cx = a.x | 0, cy = a.y | 0, power = KINDLE.douse * w.mods.mul.douse;
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h || (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2 > 2.9) continue;
      const j = y * w.w + x;
      if (g.fire[j] > 0) { g.fire[j] = Math.max(0, g.fire[j] - power); g.heat[j] -= 6; if (g.fire[j] === 0) coolTo(w, j, 60); }
    }
  }},

  {id: 'job', label: t => JOBS.get(t.job).verb, runnerOf: t => JOBS.get(t.job).runner, step(w, a, task) { RUNNERS[JOBS.get(task.job).runner](w, a, task); }},

  // a moment's thought between two jobs: stands, then takes up what it had settled on
  {id: 'ponder', quiet: true, label: () => 'прикидывает, за что взяться', step(w, a, task) {
    if (w.tick >= task.until) { a.task = task.next; wake(a, 'обдумал, за что взяться', 'обдумал'); }
  }},
  {id: 'idle', quiet: true, label: () => 'отдыхает', step(w, a, task) {
    campMill(w, a, task, 4, 2.5);
  }},

  // a gloomy spell: drifts about the camp instead of working (settlement/life.js)
  {id: 'sulk', quiet: true, label: () => 'хандрит', step(w, a, task) {
    if (w.tick >= task.until) { done(w, a); return; }
    campMill(w, a, task, 5, 4);
  }},

  // a prayer at the shrine, once a day for someone in low spirits
  // (the building prayed at: data/colony.js PRAYER)
  {id: 'pray', label: t => (t.at ? 'молится у святилища' : 'идёт к святилищу'), get map() { return 'station:' + PRAYER.at; }, step(w, a, task) {
    const map = 'station:' + PRAYER.at;
    if (!has(w, PRAYER.at)) { fail(w, a, 'святилища нет'); return; }
    if (!task.at) {
      const r = follow(w, a, map);
      if (r === 'arrived') task.at = w.tick;
      else if (r === 'none' && !w.nav.dirtySet.has(map)) { w.nav.dirty(map); fail(w, a, 'к святилищу нет пути', 'impossible'); a.think = 30; }
      return;
    }
    if (w.tick - task.at > PRAYER.ticks) { prayed(w, a); done(w, a); }
  }},

  // raiders
  {id: 'assault', label: () => 'идёт к складу', step(w, a) {
    if (follow(w, a, 'camp') !== 'arrived') return;
    const got = plunder(w), took = lootTotal(got);
    if (took > 0.5 && w.tick - w.stats.lastSteal > 40) log(w, 'Налётчики грабят склад.', 'danger');
    if (took > 0) a.loot = got;   // carried off on its back: whoever brings it down takes it back
    w.stats.lastSteal = w.tick; a.looted = true; a.task = {id: 'leave'};
  }},
  // leaving the map for good: raiders with their loot, and any beast that wanders off (agents/behaviours/leave.js)
  {id: 'leave', label: () => 'уходит', step(w, a, t) {
    recover(a);
    if (follow(w, a, 'edge', t.pace ?? 1) !== 'arrived') return;
    a.gone = true; noteHome(w, a);
    if (a.leads != null) { const l = liveById(w, a.leads); if (l?.ledBy === a.id) l.ledGone = true; }   // the one it leads (agents/behaviours/led.js) is gone with it, whatever the order of their steps
    if (a.loot) { const b = w.behave?.board; if (b) b.lootLost = (b.lootLost || 0) + lootTotal(a.loot); a.loot = null; }   // gone for good
  }},
  // a torch-bearer of a band that came to burn (agents/squad.js): to the camp, then to the building, and
  // a fire under its wall
  {id: 'torch', label: () => 'несёт факел', step(w, a, task) {
    const b = w.buildings.find(x => x.id === task.b && x.done), sq = squadOf(w, a);
    if (!b || !sq || sq.lit != null) { done(w, a); return; }
    if (w.nav.get('camp')[cellOf(w, a)] > 14) { follow(w, a, 'camp'); return; }
    let best = null, bd = Infinity;
    for (const c of b.cells) { const d = Math.hypot((c % w.w) + 0.5 - a.x, ((c / w.w) | 0) + 0.5 - a.y); if (d < bd) { bd = d; best = c; } }
    if (best == null) { done(w, a); return; }
    // a torch in hand flies from as far as it is thrown (quality `thrown`); without one the fire is put to the wall
    const T = throwTorch(a), far = T ? T.range : SQUAD.burnNear;
    if (bd > far) { if (approach(w, a, (best % w.w) + 0.5, ((best / w.w) | 0) + 0.5) === null) fail(w, a, 'к постройке не подойти', 'impossible'); return; }
    if (T) spendThrow(a, T);
    kindle(w, best);
    sq.lit = w.tick;
    log(w, `${a.name} ${T ? (a.gender === 'f' ? 'метнула факел и подожгла' : 'метнул факел и поджёг') : a.gender === 'f' ? 'подожгла' : 'поджёг'} ${BUILDINGS.get(b.key).name.toLowerCase()}! Тушите!`, 'danger', 'notice');
    a.task = {id: 'leave'};
  }},
  // a torch thrown on the way (agents/behaviours/raid.js): at the wall of a wooden building close by, then the band's plan again
  {id: 'hurlTorch', label: () => 'бросает факел', step(w, a, task) {
    const T = throwTorch(a), i = task.cell;
    if (!T || i == null || !w.buildings.some(b => b.done && b.cells.includes(i))) { done(w, a); return; }
    if (distToCell(w, a, i) > T.range) { done(w, a); return; }
    spendThrow(a, T); kindle(w, i);
    const b = w.buildings.find(x => x.cells.includes(i));
    log(w, `${a.name} ${a.gender === 'f' ? 'метнула' : 'метнул'} факел в ${BUILDINGS.get(b.key).name.toLowerCase()}! Тушите!`, 'danger', 'notice');
    done(w, a);
  }},
  // a shooter or a healer of a band steps back from a blade coming at it (agents/tactics.js); a short while, then the
  // band's plan says again
  {id: 'kite', label: () => 'отходит, держит дистанцию', step(w, a, task) {
    const f = liveById(w, task.from);
    task.since ??= w.tick;
    if (!f || f.downed || w.tick - task.since > TACTICS.kiteFor || Math.hypot(f.x - a.x, f.y - a.y) > TACTICS.kite * TACTICS.kiteOut) { a.kitedAt = w.tick; done(w, a); return; }
    const dx = a.x - f.x, dy = a.y - f.y, L = Math.hypot(dx, dy) || 1;
    if (moveToward(w, a, a.x + dx / L * TACTICS.kiteStep, a.y + dy / L * TACTICS.kiteStep) === null) { a.kitedAt = w.tick; done(w, a); }   // a wall at its back: stand and fight (TACTICS.kiteRest)
  }},
  // a band's healer (agents/tactics.js): to the fallen one, dress the wound (agents/wounds.js) — or a potion for one
  // badly hurt
  {id: 'mend', label: t => (t.potion ? 'несёт зелье раненому' : 'перевязывает своего'), step(w, a, task) {
    const b = liveById(w, task.who);
    task.since ??= w.tick;
    // gone, up again, already going home, or too long after it: the healer gives it up
    if (!b || b.gone || b.task?.id === 'leave' || w.tick - task.since > TACTICS.mend.chase || (task.potion ? !(a.potions > 0) || b.downed : !b.downed)) { done(w, a); return; }
    if (Math.hypot(b.x - a.x, b.y - a.y) > TACTICS.mendReach) { task.work = 0; if (approach(w, a, b.x, b.y) === null) fail(w, a, 'к своему не подойти', 'impossible'); return; }
    if ((task.work = (task.work || 0) + 1) < (task.potion ? TACTICS.mend.potionTicks : TACTICS.mend.ticks)) return;
    if (task.potion) { a.potions--; b.hp = Math.min(maxHp(b), b.hp + CONDITIONS.get('potHeal').heal); b.flash = 4; }   // the healing potion of its slot
    else {
      if (b.faction === 'colony') { stabilize(w, a, b); done(w, a); return; }   // one of ours: the colony's own dressing (thoughts, the chronicle)
      dressWound(w, b, a.skill?.medicine || 0); b.task = null;
      b.hp = Math.max(b.hp, TACTICS.mend.standUp * maxHp(b));   // on its feet enough to fight on, not to be sent home at once
      const sq = squadOf(w, b); if (sq && b.fellNoted) { b.fellNoted = false; sq.fallen = Math.max(0, sq.fallen - 1); }   // not a loss of the band any more
      log(w, `${a.name} ${a.gender === 'f' ? 'перевязала' : 'перевязал'} упавшего: ${b.name} снова на ногах.`, 'danger');
    }
    done(w, a);
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
    if (!w.agents.some(o => o.faction === 'colony' && !o.dead)) { a.task = {id: 'leave'}; return; }   // scan: leavers only: the colony has fallen
    campMill(w, a, task, 4, 3);
  }},

  // gather by the fire when raiders come; done as soon as the alarm is over
  {id: 'muster', quiet: true, label: () => 'собирается по тревоге', step(w, a, task) {
    if (!raidAlarm(w) && !raidOnBoard(w)) { done(w, a); return; }
    think(w, a, 'raidAlarm');
    campMill(w, a, task, 3, 2.2, 1.2);
  }},

  // a red alarm in sight that one does not go to fight (settlement/board.js): stand at the fire with the
  // others, out of harm's way, while the raid lasts. Not held on to (colonist.js gives it no keep), so
  // at every think it is weighed afresh against going to the fight
  {id: 'reserve', quiet: true, label: () => 'держится у огня', step(w, a, task) {
    if (!raidAlarm(w) && !raidOnBoard(w)) { done(w, a); return; }
    campMill(w, a, task, 3, 2.2, 1.2);
  }},

  // the night watch (settlement/board.js): by the fire all night, looking round for everyone; done at dawn
  {id: 'watch', quiet: true, label: () => 'дежурит у огня', step(w, a, task) {
    if (task.over) { done(w, a); return; }
    campMill(w, a, task, 3, 2.2);
  }},

  // run for the settlement zone when something is hunting you
  {id: 'runHome', label: () => 'бежит к поселению', step(w, a) {
    if (follow(w, a, 'zone', 1.3) === 'arrived') done(w, a);
  }},

  // a wounded colonist lies in the healer's hut until mostly healed (settlement/healing.js)
  {id: 'treat', label: t => (t.lying ? (t.healer != null ? 'лечится у лекаря' : 'лежит в хижине лекаря') : 'идёт к лекарю'), step(w, a, task) {
    if (!hasHut(w)) { fail(w, a, 'хижины лекаря нет'); return; }
    const max = maxHp(a);
    if (a.hp >= max * HEAL.until) {
      const healer = liveById(w, task.healer);
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
  {id: 'trade', quiet: true, label: () => 'торгуется с купцом', step(w, a, task) {
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

  // the beasts' and the nechist's own states (graze, bolt, roam, chase, maul, feed, hide, lurk, sing, penned…) come
  // with their behaviours (data/behaviours.js), registered below

  // spells of the nechist (agents/behaviours/astray.js, lure.js) on a colonist: they last until `until`
  // the leshy's spores: the colonist wanders in circles, then comes to
  {id: 'astray', label: () => 'плутает в лесу', step(w, a, task) {
    if (w.tick >= task.until) { think(w, a, 'foundWay'); done(w, a); return; }
    if (!task.spot || moveToward(w, a, task.spot[0], task.spot[1], 0.6) !== false) {
      const ang = w.rngs.colony() * Math.PI * 2;
      task.spot = [a.x + Math.cos(ang) * 3, a.y + Math.sin(ang) * 3];
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
