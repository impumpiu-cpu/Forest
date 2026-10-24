// Logic check: the rules every creature must keep, in small staged scenes (T01–T11 of the outside
// review of the races branch; T12–T17 reservations and the task lifecycle; T18–T22 raider squads;
// T23–T26 joint actions of colonists;
// T27–T31 carcasses and pack hunts; T32–T39 SPECIAL stage 1: skills, practice, the body;
// T40–T46 SPECIAL stage 2: tiers at the forge and the worker in choosing an order;
// T47–T48 quality from the master; T49–T57 critical blows and the deadly wound;
// T58–T62 tiers of the other jobs and the AI; T63–T65 trade through the negotiator; T66–T70 trophies;
// T71–T73 fixes from the review; T74–T80 fixes from the code review of 16.10: F01–F06; T85–T92 the colony's
// board: lookouts, the cry, red and yellow alarms, soft places, docs/MIND.md stage 1; T93–T97 the loot taken
// back, the chase, the night watch, stage 2; T98–T100 thinking on events, stage 4;
// T101–T104 wild herds, stage 5; T105–T107 fixes from the code review of 21.10;
// T108 the groups' common skeleton, stage 6; T109–T115 captives, docs/CAPTIVES.md stage 1; T116–T123 escape, resignation, the informer, stage 2; T124–T129 masters and their learners, stage 3; T130–T133 former slaves, stage 4; T134–T137 the trade in captives, stage 5; T138–T140 fixes from the code review of 21.10, captives; T141–T143 the smith's mark, docs/TABLE.md stage 5). Each scene builds a flat, empty map, places a few agents by hand and
// runs one brain or task, then checks what must hold: no blow from afar, no wood eaten, no fight with
// what cannot be seen, no step through a rock corner… Part of `npm test`.
// Usage: node tools/logic-check.mjs
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent, maxHp} from '../src/agents/agent.js';
import {BRAINS} from '../src/agents/brains/index.js';
import {TASKS} from '../src/agents/tasks.js';
import {T} from '../src/data/terrain.js';
import {FAR} from '../src/nav/navigation.js';
import {clearLine, lineOfFire} from '../src/nav/astar.js';
import {follow, moveToward, approach} from '../src/agents/movement.js';
import {cellOf, walkable} from '../src/world/grid.js';
import {step} from '../src/sim.js';
import {eligible} from '../src/settlement/council.js';
import {arrive} from '../src/outside/index.js';
import {RESOURCES} from '../src/data/resources.js';
import {SPECIES} from '../src/data/species.js';
import {syncTask, skipped} from '../src/agents/lifecycle.js';
import {stationHasWork, pickRecipe, workAt, stepCrafting} from '../src/settlement/crafting.js';
import {freeBed, bedsOf} from '../src/settlement/healing.js';
import {freeCorpse, stepLife, LIFE} from '../src/settlement/life.js';
import {moodOf} from '../src/agents/mind.js';
import {createSquad, stepSquads, planFor, ROLES} from '../src/agents/squad.js';
import {kill} from '../src/agents/agent.js';
import {outsideRisk, escortOption, aidOption, TOGETHER} from '../src/settlement/together.js';
import {stepRelations, REL} from '../src/settlement/relations.js';
import {startHunt, stepHunts, huntAim, dropCarcass, stepCarcasses, CARCASS, PACK} from '../src/agents/carcass.js';
import {DAY, HOUR, nightness} from '../src/core/time.js';
import {think} from '../src/agents/mind.js';
import {newItem, outfit, recalcGear, allItems, itemPrice} from '../src/agents/equipment.js';
import {strengthOf} from '../src/agents/strength.js';
import {refreshBody, adoptBody} from '../src/agents/special.js';
import {craftChance, qualityRoll} from '../src/data/quality.js';
import {critChance, lethal, stabilize, stepDowned, healWounds} from '../src/agents/wounds.js';
import {CRIT} from '../src/data/wounds.js';
import {decideTrophies, luckBoost, TROPHY} from '../src/agents/trophies.js';
import {damage, attack, nearestHostile} from '../src/agents/combat.js';
import {giveAid} from '../src/settlement/together.js';
import {saveWorld, loadWorld, worldHash, SAVE_FORMAT} from '../src/world/save.js';
import {practice, practiceGain, softCap, skillTier, migrateSkills, recipeAccess, canMake, jobAccess, canDoAction} from '../src/agents/skills.js';
import {workRate} from '../src/agents/jobRunners.js';
import {shoot} from '../src/agents/combat.js';
import {recipeSkill, isActive} from '../src/data/skills.js';
import {RECIPES} from '../src/data/recipes.js';
import {ITEMS} from '../src/data/items.js';
import {TRADE} from '../src/data/trade.js';
import {negotiator, termsOf, holdTrade, askPrice, bidPrice, unitPrice} from '../src/settlement/trade.js';
import {JOBS, huntable} from '../src/data/jobs.js';
import {canTame} from '../src/settlement/herd.js';
import {heatTo} from '../src/world/heat.js';
import {makePlan, vacancyPull, signUp, PLAN} from '../src/settlement/plan.js';
import {stepAttention, HEART} from '../src/agents/attention.js';
import {stepHerds, herdOf, herdAlarm, HERD} from '../src/agents/wildHerd.js';
import {preyValue} from '../src/agents/brains/predator.js';
import {prune, nextLookouts, inTurn, see, fade, seenMiddle} from '../src/agents/group.js';
import {stepBoard, flagOptions, watchOption, BOARD, WATCH} from '../src/settlement/board.js';
import {raidAlarm} from '../src/settlement/query.js';
import {dropLoad} from '../src/agents/jobRunners.js';
import {bindOption, captiveAllows, captives, canBind} from '../src/settlement/captives.js';
import {CAPTIVE} from '../src/data/captives.js';
import {councilDue} from '../src/settlement/council.js';
import {agentInZone} from '../src/settlement/zone.js';
import {stepEscape, startEscape, toolsAway} from '../src/settlement/escape.js';
import {ESCAPE, BONDS, bestBonds} from '../src/data/captives.js';
import {stepMasters, assistOption, apprenticeBonus, placeOf, masterOf} from '../src/settlement/masters.js';
import {MASTER} from '../src/data/masters.js';
import {stepFreedom, formerAllows, freeCaptive} from '../src/settlement/freedom.js';
import {FREEDOM} from '../src/data/captives.js';
import {captivePrice, lawOf, SLAVE} from '../src/data/slavery.js';
import {sellCaptives, buyCaptive, forSale} from '../src/settlement/slavery.js';
import {tradeCaptives} from '../src/campaign/slavery.js';

// a flat grass map with nobody on it; the camp stays where it was generated
function scene(seed = 'logic') {
  const w = newGame({...DEFAULT_CFG, seed, size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  w.agents = [];
  const g = w.grid;
  for (let i = 0; i < w.w * w.h; i++) { g.terr[i] = T.GRASS; g.heat[i] = 0; g.fire[i] = 0; g.smoke[i] = 0; g.wood[i] = 0; g.lake && (g.lake[i] = -1); }
  w.lakes = [];
  w.nav.buildAll();
  return w;
}
const put = (w, sp, fac, x, y) => { const a = createAgent(w, sp, fac, x, y); a.mods.dodge = 0; return a; };
const brain = (w, a) => BRAINS.get(a.brain).step(w, a);
// every random stream answers the same (core/rng.js)
const fixedRng = (w, v = 0.5) => { w.rng = Object.assign(() => v, {state: 0}); for (const k of Object.keys(w.rngs)) w.rngs[k] = Object.assign(() => v, {state: 0}); };

const results = [];
function check(id, what, fn) {
  try { const r = fn(); results.push([id, what, r === true ? null : r || 'не выполнено']); }
  catch (e) { results.push([id, what, 'исключение: ' + e.message]); }
}

check('T01', 'хищник не бьёт цель вне досягаемости', () => {
  const w = scene(); fixedRng(w);
  const wolf = put(w, 'wolf', 'predators', 20.5, 20.5), man = put(w, 'human', 'colony', 30.5, 20.5);
  wolf.pack = wolf.id; wolf.needs.food = 0.05; wolf.task = {id: 'maul', target: man};
  const hp = man.hp;
  brain(w, wolf);
  return man.hp === hp || `урон ${(hp - man.hp).toFixed(3)} с ${Math.hypot(wolf.x - man.x, wolf.y - man.y).toFixed(2)} клеток`;
});

check('T02', 'несъедобный груз не становится сытостью и не пропадает', () => {
  const w = scene();
  const a = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);
  for (const r of RESOURCES.filter(r => r.tags.includes('food'))) w.stock[r.id] = 0;
  a.carry = {res: {wood: 2}, n: 2}; a.needs.food = 0.1; a.task = {id: 'eat'};
  TASKS.get('eat').step(w, a, a.task);
  if (a.task) TASKS.get(a.task.id).step(w, a, a.task);
  if (a.needs.food > 0.2) return `сытость ${a.needs.food.toFixed(2)}`;
  if ((a.carry?.res.wood || 0) + (w.stock.wood || 0) < 2) return 'древесина пропала';
  return !a.carry || a.carry.n === Object.values(a.carry.res).reduce((s, v) => s + v, 0) || 'carry.n не равно сумме груза';
});

check('T03', 'груз не мешает ответить на нападение', () => {
  const w = scene();
  const a = put(w, 'human', 'colony', 30.5, 30.5), wolf = put(w, 'wolf', 'predators', 32.5, 30.5);
  wolf.pack = wolf.id; wolf.task = {id: 'maul', target: a};
  a.carry = {res: {wood: 2}, n: 2}; a.task = {id: 'job', job: 'chop'}; a.think = 0; a.needs.food = 0.3;
  brain(w, a);
  return ['fight', 'runHome'].includes(a.task?.id) || `задача ${a.task?.id}:${a.task?.job}`;
});

check('T04', 'скрывшаяся русалка не получает удара', () => {
  const w = scene(); fixedRng(w);
  const a = put(w, 'human', 'colony', 30.5, 30.5), r = put(w, 'rusalka', 'nechist', 31, 30.5);
  r.veil = 0; r.hiddenUntil = w.tick + 100;
  a.task = {id: 'fight', target: r};
  const hp = r.hp;
  for (let k = 0; k < 20; k++) { if (!a.task) break; TASKS.get(a.task.id).step(w, a, a.task); a.cd = 0; }
  return r.hp === hp || `здоровье ${hp.toFixed(3)} → ${r.hp.toFixed(3)}`;
});

check('T05', 'никто не срезает угол между скалами и не встаёт в скалу', () => {
  const w = scene(), g = w.grid;
  g.terr[10 * w.w + 11] = T.ROCK; g.terr[11 * w.w + 10] = T.ROCK;
  if (clearLine(w, 10.5, 10.5, 11.5, 11.5)) return 'прямая видимость сквозь угол';
  // a flow field to (11,11)
  const map = w.nav.get('camp'); map.fill(FAR);
  const bfs = [11 * w.w + 11]; map[bfs[0]] = 0;
  for (let q = 0; q < bfs.length; q++) {
    const i = bfs[q], x = i % w.w, y = (i / w.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (y + dy) * w.w + x + dx;
      if (x + dx < 0 || y + dy < 0 || x + dx >= w.w || y + dy >= w.h || !walkable(w, j) || map[j] < FAR) continue;
      map[j] = map[i] + 1; bfs.push(j);
    }
  }
  map[10 * w.w + 10] = 1.5;   // a stale field that still points across the corner
  const a = put(w, 'human', 'colony', 10.5, 10.5);
  for (let k = 0; k < 200; k++) {
    const before = cellOf(w, a);
    if (follow(w, a, 'camp') === 'arrived') break;
    const now = cellOf(w, a);
    if (!walkable(w, now)) return 'шаг в скалу по полю';
    if (before === 10 * w.w + 10 && now === 11 * w.w + 11) return 'срезал угол по полю';
  }
  const b = put(w, 'human', 'colony', 10.9, 10.5);
  moveToward(w, b, 11.01, 10.5);
  return walkable(w, cellOf(w, b)) || 'короткий последний шаг завёл в скалу';
});

check('T06', 'яд действует на любое живое существо', () => {
  const w = scene();
  const r = put(w, 'human', 'raiders', 30.5, 30.5);
  r.hp = 0.5; r.poison = {dmg: 0.1, until: w.tick + 100}; r.task = {id: 'assault'};
  step(w);
  return r.hp < 0.45 || r.dead || `здоровье ${r.hp}`;
});

check('T07', 'жаростойкий зверь не бежит от тёплой земли', () => {
  const w = scene();
  const s = put(w, 'salamander', 'wild', 30.5, 30.5);
  heatTo(w, cellOf(w, s), 100);
  brain(w, s);
  return s.task?.id !== 'bolt' || 'убегает';
});

check('T08', 'караван без пути к лагерю не считает себя пришедшим', () => {
  const w = scene();
  put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);   // a caravan comes only to a living colony
  const group = arrive(w, 'caravan', 1);
  if (!group.length) return 'караван не пришёл';
  w.nav.get('camp').fill(FAR);
  const trader = group.find(a => a.role === 'trader');
  for (const o of group) { o.x = trader.x; o.y = trader.y; }
  brain(w, trader);
  return w.caravan.arrived == null || 'arrived выставлен';
});

check('T09', 'старая отметка застревания не мешает новой цели', () => {
  const w = scene();
  const a = put(w, 'human', 'colony', 30.5, 30.5);
  a.approachGuard = {x: a.x, y: a.y, t: w.tick - 50};
  const r = approach(w, a, 35.5, 30.5);
  return (r !== null && a.x > 30.5) || 'отказ на свободном пути';
});

check('T10', 'голодный волк не идёт к чужой добыче', () => {
  const w = scene();
  const wolf = put(w, 'wolf', 'predators', 20.5, 30.5);
  put(w, 'goat', 'wild', 15.5, 30.5); put(w, 'hare', 'wild', 60.5, 30.5);
  wolf.pack = wolf.id; wolf.needs.food = 0.4; wolf.task = null;
  w.nav.build('prey');
  const x0 = wolf.x;
  brain(w, wolf);
  // the goat is not its prey: it takes the scent of the hare, far to the right
  return wolf.x > x0 || `x ${x0} → ${wolf.x.toFixed(3)}: не к зайцу`;
});

check('T11', 'совет видит кости от охоты', () => {
  const w = scene();
  w.buildings.push({id: 999, key: 'crafthut', done: true, x: 0, y: 0, cells: [], progress: 1});
  w.stock.wood = 100; w.stock.bone = 0;
  put(w, 'hare', 'wild', 40.5, 40.5);
  return eligible(w, 'armory') || 'оружейный навес недоступен без костей';
});

// ── reservations and the task lifecycle (settlement/reserve.js, agents/lifecycle.js)
const building = (w, key, id) => { const b = {id, key, done: true, x: 40, y: 30, cells: [30 * w.w + 40], progress: 1}; w.buildings.push(b); return b; };

check('T12', 'верстак держит один работник, второй не идёт к занятому', () => {
  const w = scene(), b = building(w, 'crafthut', 900);
  b.order = {recipe: 'rope', progress: 0};
  const p = put(w, 'human', 'colony', 30.5, 30.5), q = put(w, 'human', 'colony', 31.5, 30.5);
  p.task = {id: 'job', job: 'craft'}; syncTask(w, p); w.nav.build('station:crafthut'); TASKS.get('job').step(w, p, p.task);
  if (!p.task?.bench) return 'первый не занял верстак: ' + JSON.stringify(p.lastStop || p.task);
  return !stationHasWork(w, 'crafthut', q) || 'второму кажется, что верстак свободен';
});

check('T13', 'у лекаря коек столько, сколько есть; лишний раненый не идёт', () => {
  const w = scene(); building(w, 'healerhut', 901);
  const beds = bedsOf();
  const hurt = Array.from({length: beds + 1}, (_, k) => { const a = put(w, 'human', 'colony', 30.5 + k, 30.5); a.hp = maxHp(a) * 0.3; return a; });
  for (const a of hurt.slice(0, beds)) { a.task = {id: 'treat'}; syncTask(w, a); w.nav.build('healer'); TASKS.get('treat').step(w, a, a.task); }
  if (hurt.slice(0, beds).some(a => !a.task?.bed)) return 'не всем хватило коек: ' + JSON.stringify(hurt.map(a => a.lastStop || a.task?.bed));
  return !freeBed(w, hurt[beds]) || 'лишнему досталась свободная койка';
});

check('T14', 'тело несёт один, второй его не ищет', () => {
  const w = scene();
  const dead = put(w, 'human', 'colony', 40.5, 40.5); w.corpses = [{id: dead.id, name: 'X', x: 40.5, y: 40.5, tick: w.tick}]; w.agents = w.agents.filter(o => o !== dead);
  const p = put(w, 'human', 'colony', 30.5, 30.5), q = put(w, 'human', 'colony', 31.5, 30.5);
  p.task = {id: 'job', job: 'bury'}; syncTask(w, p); TASKS.get('job').step(w, p, p.task);
  return !freeCorpse(w, q) || 'второй видит то же тело свободным';
});

check('T15', 'прерванная задача отдаёт свои резервы', () => {
  const w = scene(), b = building(w, 'crafthut', 902);
  b.order = {recipe: 'rope', progress: 0};
  const p = put(w, 'human', 'colony', 30.5, 30.5), q = put(w, 'human', 'colony', 31.5, 30.5);
  p.task = {id: 'job', job: 'craft'}; syncTask(w, p); w.nav.build('station:crafthut'); TASKS.get('job').step(w, p, p.task);
  if (!p.task?.bench) return 'не занял верстак: ' + JSON.stringify(p.lastStop);
  p.task = {id: 'flee'}; syncTask(w, p);   // a reflex took over
  if (p.lastTask?.id !== 'flee') return 'новая задача не принята';
  return stationHasWork(w, 'crafthut', q) || 'верстак так и остался занят';
});

check('T16', 'прерванный сбор продолжается с того же места', () => {
  const w = scene(), i = 30 * w.w + 30;
  w.grid.terr[i] = T.FOREST; w.grid.wood[i] = 1; w.nav.build('trees');
  const p = put(w, 'human', 'colony', 30.5, 30.5);
  p.task = {id: 'job', job: 'chop'}; syncTask(w, p);
  for (let k = 0; k < 8; k++) TASKS.get('job').step(w, p, p.task);
  const got = p.task.work;
  p.task = {id: 'warm'}; syncTask(w, p);
  p.task = {id: 'job', job: 'chop'}; syncTask(w, p); TASKS.get('job').step(w, p, p.task);
  return p.task.work > got || `работа ${got.toFixed(1)} → ${p.task.work.toFixed(1)}: начал заново`;
});

check('T17', 'заблокированное дело не берут снова сразу же', () => {
  const w = scene();
  const p = put(w, 'human', 'colony', 30.5, 30.5);
  p.task = {id: 'job', job: 'craft'}; syncTask(w, p); TASKS.get('job').step(w, p, p.task);   // no workshop: blocked
  if (p.task) return 'не сдался без мастерской';
  return skipped(w, p, {id: 'job', job: 'craft'}) || 'нет паузы после отказа';
});

// ── raider squads (agents/squad.js) and doing things together (settlement/together.js)
const band = (w, n, x, y) => {
  w.stats.raids = 9;   // not the first raid: no scouting party, so the band has a front and a leader whatever the dice say
  const g = [];
  for (let k = 0; k < n; k++) { const a = put(w, 'human', 'raiders', x + k, y); a.band = 'bandits'; a.name = 'Налётчик'; a.brain = 'raider'; g.push(a); }
  return [g, createSquad(w, g)];
};
const ticks = (w, n, f) => { for (let k = 0; k < n; k++) { f(); w.tick++; } };

check('T18', 'у отряда один план: цель, вожак, роли', () => {
  const w = scene();
  const [g, sq] = band(w, 5, 10.5, 10.5);
  if (sq.goal !== 'loot') return `цель ${sq.goal}, ждали грабёж (нет построек, нет кровников)`;
  if (!g.some(a => a.id === sq.leader && a.name === 'Атаман')) return 'нет вожака';
  if (g.some(a => !ROLES[a.sqRole])) return 'не у всех есть роль: ' + g.map(a => a.sqRole).join(',');
  if (!g.some(a => a.sqRole === 'looter')) return 'нет грабителей';
  return g.some(a => a.sqRole === 'rear') || 'некому прикрыть отход';
});

check('T19', 'отряд отступает, когда потери велики и вожак пал', () => {
  const w = scene();
  const [g, sq] = band(w, 5, 30.5, 30.5);
  for (const k of [0, 1, 2]) put(w, 'human', 'colony', 33.5 + k, 32.5);
  for (const a of g.filter(a => a.id === sq.leader).concat(g.filter(a => a.id !== sq.leader).slice(0, 2))) kill(w, a, 'ран');
  w.agents = w.agents.filter(a => !a.dead);
  ticks(w, 12, () => stepSquads(w));
  if (sq.state !== 'retreat') return `состояние ${sq.state}, дух ${sq.morale}`;
  const rest = g.filter(a => !a.dead), plans = rest.map(a => planFor(w, a, sq, 10)?.id);
  return plans.includes('leave') || 'никто не уходит: ' + plans.join(',');
});

check('T20', 'налётчик держит своего противника и не мечется', () => {
  const w = scene();
  const [g, sq] = band(w, 3, 10.5, 40.5);
  const r = g.find(a => a.sqRole === 'front' || a.sqRole === 'leader' || a.sqRole === 'rear');
  r.x = 30.5; r.y = 30.5;
  const A = put(w, 'human', 'colony', 33.5, 30.5), B = put(w, 'human', 'colony', 30.5, 33.2);
  r.task = {id: 'fight', target: A, since: w.tick};
  const t1 = planFor(w, r, sq, 10);
  if (t1?.target !== A) return 'бросил противника ради почти такого же близкого';
  B.y = 31.3;   // much closer now
  const t2 = planFor(w, r, sq, 10);
  return t2?.target === B || 'не переключился на того, кто вплотную';
});

check('T21', 'грабитель идёт к складу, пока другие держат защитников', () => {
  const w = scene();
  const [g, sq] = band(w, 5, 30.5, 30.5);
  const l = g.find(a => a.sqRole === 'looter');
  put(w, 'human', 'colony', l.x + 6, l.y);
  return planFor(w, l, sq, 10)?.id === 'assault' || `задача ${planFor(w, l, sq, 10)?.id}`;
});

check('T22', 'кто пришёл за одним, идёт за ним мимо других', () => {
  const w = scene();
  const [g, sq] = band(w, 3, 30.5, 30.5);
  const r = g.find(a => a.sqRole !== 'looter');
  const near = put(w, 'human', 'colony', r.x + 5, r.y), target = put(w, 'human', 'colony', r.x + 18, r.y);
  sq.goal = 'kill'; sq.target = target.id;
  const t = planFor(w, r, sq, 10);
  if (t?.target !== target) return `цель ${t?.target?.id}, ждали ${target.id} (рядом ${near.id})`;
  kill(w, target, 'ран'); w.agents = w.agents.filter(a => !a.dead);
  ticks(w, 12, () => stepSquads(w));
  return sq.state === 'withdraw' || `после расправы: ${sq.state}`;
});

check('T23', 'когда в лесу звери, одиночку сопровождают', () => {
  const w = scene();
  for (let k = 0; k < 8; k++) { const o = put(w, 'wolf', 'predators', 85.5, 10.5 + k); o.pack = 1; }
  const A = put(w, 'human', 'colony', w.camp.x + 25.5, w.camp.y + 0.5), B = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);
  A.task = {id: 'job', job: 'chop'};
  if (outsideRisk(w) < TOGETHER.riskFrom) return `риск ${outsideRisk(w).toFixed(2)} ниже порога`;
  const o = escortOption(w, B);
  if (!o || o[0].who !== A.id) return 'сопровождать некого';
  B.task = o[0];
  const d0 = Math.hypot(A.x - B.x, A.y - B.y);
  for (let k = 0; k < 150 && B.task; k++) TASKS.get('company').step(w, B, B.task);
  return Math.hypot(A.x - B.x, A.y - B.y) < d0 - 3 || 'не идёт к тому, кого сопровождает';
});

check('T24', 'раненого в лесу перевязывают, и он это помнит', () => {
  const w = scene();
  const W = put(w, 'human', 'colony', w.camp.x + 25.5, w.camp.y + 0.5), H = put(w, 'human', 'colony', w.camp.x + 24.5, w.camp.y + 0.5);
  W.hp = maxHp(W) * 0.25;
  const o = aidOption(w, H);
  if (!o || o[0].who !== W.id) return 'помочь некому';
  const hp = W.hp, before = W.grudge?.[H.id] || 0;
  H.task = o[0]; TASKS.get('aid').step(w, H, H.task);
  if (!(W.hp > hp)) return 'раны не перевязаны';
  if (!((W.grudge?.[H.id] || 0) > before)) return 'раненый не запомнил помощь';
  return H.task?.id === 'company' && H.task.home || 'не повёл к своим';
});

check('T25', 'выздоравливающий уступает койку тому, кому хуже', () => {
  const w = scene(); building(w, 'healerhut', 903); w.nav.build('healer');
  const beds = bedsOf(), lying = [];
  for (let k = 0; k < beds; k++) {
    const p = put(w, 'human', 'colony', 40.5, 30.5 + k * 0.3); p.hp = maxHp(p) * 0.85;
    p.task = {id: 'treat'}; syncTask(w, p); TASKS.get('treat').step(w, p, p.task); lying.push(p);
  }
  if (lying.some(p => !p.task?.bed)) return 'койки не заняты';
  const a = put(w, 'human', 'colony', 39.5, 30.5); a.hp = maxHp(a) * 0.2;
  a.task = {id: 'treat'}; syncTask(w, a); TASKS.get('treat').step(w, a, a.task);
  if (!a.task?.bed) return 'тяжелораненому койки не нашлось';
  return lying.filter(p => p.task?.bed).length === beds - 1 || 'никто не уступил';
});

check('T26', 'при опасности ссору откладывают', () => {
  const w = scene(); fixedRng(w, 0);
  const a = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5), b = put(w, 'human', 'colony', w.camp.x + 1.5, w.camp.y + 0.5);
  a.grudge = {[b.id]: -4}; b.grudge = {[a.id]: -4};
  // far apart on the compass, so the two would surely quarrel but for the wolf (not left to their rolled points)
  a.align = {order: 0, mercy: 3}; b.align = {order: 0, mercy: -3};
  put(w, 'wolf', 'predators', w.camp.x + 6.5, w.camp.y + 0.5).pack = 1;
  w.tick = Math.ceil(w.tick / REL.quarrelEvery) * REL.quarrelEvery + 37;
  const q = w.chronicle.quarrels || 0;
  stepRelations(w);
  if ((w.chronicle.quarrels || 0) !== q) return 'поссорились при волке у костра';
  return w.behave.social.calm > 0 || 'отложенная ссора не учтена';
});

// ── carcasses and pack hunts (agents/carcass.js)
const wolves = (w, n, x, y) => Array.from({length: n}, (_, k) => { const o = put(w, 'wolf', 'predators', x + k * 0.8, y); o.pack = 7; o.stamina = 1; o.needs.food = 0.4; return o; });

check('T27', 'добыча хищника остаётся на земле тушей, стая ест из неё', () => {
  const w = scene(); fixedRng(w);
  const [a, b] = wolves(w, 2, 20.5, 20.5), hare = put(w, 'hare', 'wild', 21.0, 20.5);
  a.task = {id: 'chase', target: hare}; b.task = {id: 'chase', target: hare};
  startHunt(w, [a, b], hare, 'game'); a.hunt = b.hunt = w.nextHunt;
  for (let k = 0; k < 5 && !hare.dead; k++) brain(w, a);
  if (!hare.dead) return 'заяц не пойман';
  const c = w.carcasses?.[0];
  if (!c || !(c.food > 0)) return 'туши нет';
  if (a.task?.id !== 'feed' || a.task.c !== c.id) return `задача ${a.task?.id}`;
  const f0 = c.food; for (let k = 0; k < 10; k++) brain(w, a);
  return (c.food < f0 && w.behave.hunts.kill === 1) || `еда в туше ${f0} → ${c.food}, итог охоты ${JSON.stringify(w.behave.hunts)}`;
});

check('T28', 'прерванное кормление: голодный зверь возвращается к туше', () => {
  const w = scene(); fixedRng(w);
  const [a] = wolves(w, 1, 30.5, 30.5);
  const c = dropCarcass(w, {species: 'deer', x: 36.5, y: 30.5}, 1.6, a);
  a.task = {id: 'roam'}; a.needs.food = 0.3;
  brain(w, a);
  return (a.task?.id === 'feed' && a.task.c === c.id) || `задача ${a.task?.id}`;
});

check('T29', 'охотник отбивает тушу у сытых зверей и несёт мясо', () => {
  const w = scene(); fixedRng(w);
  const [a, b] = wolves(w, 2, 40.5, 30.5);
  const c = dropCarcass(w, {species: 'deer', x: 40.5, y: 31.0}, 1.6, a);
  for (const o of [a, b]) { o.task = {id: 'feed', c: c.id}; o.needs.food = 0.8; }
  const h = put(w, 'human', 'colony', 37.5, 31.0);
  w.armory.push(newItem('bow'), newItem('quiver')); outfit(w, h);
  h.task = {id: 'job', job: 'hunt'};
  for (let k = 0; k < 80 && !h.carry && h.task; k++) TASKS.get('job').step(w, h, h.task);
  if (!h.carry && !h.task) return 'охотник бросил: ' + JSON.stringify(h.lastStop);
  if (a.task?.id === 'feed' || b.task?.id === 'feed') return 'звери продолжают есть';
  return (h.carry?.res.meat > 0 && !w.carcasses.includes(c)) || `груз ${JSON.stringify(h.carry)}`;
});

check('T30', 'стая охотится вместе: ведущий, загонщики сбоку, один итог', () => {
  const w = scene(); fixedRng(w);
  const ws = wolves(w, 3, 20.5, 20.5), deer = put(w, 'deer', 'wild', 30.5, 20.5);
  const h = startHunt(w, ws, deer, 'game');
  const roles = ws.map(m => h.roles[m.id]);
  if (roles.filter(r => r === 'lead').length !== 1 || !roles.some(r => r?.startsWith('flank'))) return 'роли: ' + roles.join(',');
  const f = ws.find(m => h.roles[m.id].startsWith('flank')), [tx, ty] = huntAim(w, f, h, deer);
  if (Math.hypot(tx - deer.x, ty - deer.y) < 2) return 'загонщик бежит прямо на добычу';
  kill(w, deer, 'ран'); w.agents = w.agents.filter(o => !o.dead);
  stepHunts(w);
  return (!w.hunts[h.id] && ws.every(m => m.hunt == null) && w.behave.hunts.taken === 1) || 'охота не закрылась одним итогом: ' + JSON.stringify({open: !!w.hunts[h.id], m: ws.map(m => m.hunt), b: w.behave.hunts});
});

check('T31', 'неубранная туша в темноте поднимает упыря', () => {
  const w = scene(); fixedRng(w, 0);
  const c = dropCarcass(w, {species: 'deer', x: 50.5, y: 30.5}, 1.6, null);
  c.t = w.tick - CARCASS.rotFrom - 10;
  while (!(nightness(w) > 0.7 && w.tick % 60 === 0)) w.tick++;   // deep night, on a carcass check
  stepCarcasses(w);
  return w.agents.some(o => o.species === 'upyr') || 'упырь не поднялся';
});

// ── SPECIAL stage 1: skills apart from jobs, practice from real work, a body rebuilt from its sources
const human = (w, special = {}) => { const a = put(w, 'human', 'colony', 30.5, 30.5); Object.assign(a.special, special); refreshBody(a); a.hp = maxHp(a); a.own = {...a.own, set: {dodge: 0}}; refreshBody(a); return a; };
const armed = (w, a) => { w.armory.push(newItem('bow'), newItem('quiver')); outfit(w, a); a.equip.back.ammo = 20; recalcGear(a); };
const sameMods = (x, y) => Object.keys({...x, ...y}).every(k => x[k] === y[k]);

check('T32', 'пересчёт тела можно повторять: не усиливает и не лечит', () => {
  const w = scene(), a = human(w, {S: 10, E: 9, L: 8});
  const str = a.mods.str, full = maxHp(a);
  a.hp = full * 0.2;
  const before = {...a.mods};
  refreshBody(a); refreshBody(a);
  if (!sameMods(before, a.mods)) return 'mods изменились: ' + JSON.stringify({before, after: a.mods});
  if (Math.abs(a.hp - full * 0.2) > 1e-9) return `здоровье ${a.hp} вместо ${full * 0.2}`;
  // SPECIAL grew: the body follows, the wound keeps its share
  a.special.E = 10; refreshBody(a);
  return (a.mods.str === str && maxHp(a) > full && Math.abs(a.hp / maxHp(a) - 0.2) < 1e-9) || 'рост E пересчитан неверно';
});

check('T33', 'оценка скорости работы не учит', () => {
  const w = scene(), a = human(w);
  const was = {...a.skill};
  for (let k = 0; k < 50; k++) workRate(w, a, 'smith', 'smithing');
  return sameMods(was, a.skill) || 'навык вырос от чтения скорости';
});

check('T34', 'стрельбе учит только сделанный выстрел, в бою и на охоте одинаково', () => {
  const w = scene(); fixedRng(w);
  const a = human(w), hare = put(w, 'hare', 'wild', 34.5, 30.5);
  armed(w, a);
  const r0 = a.skill.ranged, h0 = a.skill.hunting;
  // the old fault: in range, the bow still reloading — the hunt went on teaching
  a.cd = 999; a.task = {id: 'job', job: 'hunt', prey: hare};
  for (let k = 0; k < 30; k++) TASKS.get('job').step(w, a, a.task || (a.task = {id: 'job', job: 'hunt', prey: hare}));
  if (a.skill.ranged !== r0 || a.skill.hunting !== h0) return 'без выстрела навык вырос: ' + JSON.stringify({r0, r: a.skill.ranged, h0, h: a.skill.hunting});
  a.cd = 0;
  const res = shoot(w, a, hare);
  if (res == null) return 'выстрела не было';
  const g = a.skill.ranged - r0;
  if (!(g > 0)) return 'выстрел не научил стрельбе';
  // a shot in a fight is the same shot
  const b = human(w); armed(w, b);
  b.skill.ranged = r0; b.cd = 0; b.x = a.x; b.y = a.y;
  shoot(w, b, hare);
  return Math.abs((b.skill.ranged - r0) - g) < 1e-12 || `в бою ${b.skill.ranged - r0}, на охоте ${g}`;
});

check('T35', 'буква SPECIAL задаёт скорость обучения и мягкий потолок', () => {
  const w = scene(), weak = human(w, {S: 3}), strong = human(w, {S: 10});
  weak.skill.smithing = 0.1; strong.skill.smithing = 0.1;
  const gw = practiceGain(weak, 'smithing'), gs = practiceGain(strong, 'smithing');
  if (!(gs > gw * 1.5)) return `сильный учится не быстрее: ${gs} против ${gw}`;
  if (softCap(weak, 'smithing') !== 0.3 || softCap(strong, 'smithing') !== 1) return 'потолок не 10 × буква';
  const below = practiceGain(weak, 'smithing');
  weak.skill.smithing = 0.35;
  const above = practiceGain(weak, 'smithing');
  if (!(above > 0 && above < below * 0.2)) return `выше потолка учится как прежде: ${above} против ${below}`;
  // the scale is absolute: a dwarf's 12 is past every human ceiling
  const dwarf = human(w, {S: 12});
  return (softCap(dwarf, 'smithing') === 1 && skillTier(dwarf, 'smithing') === 4 && skillTier(weak, 'smithing') === 1) || 'тиры по абсолютной шкале неверны';
});

check('T36', 'мастерская учит навыку рецепта и только за сделанную работу', () => {
  const w = scene(), b = building(w, 'crafthut', 901);
  b.order = {recipe: 'rope', progress: 0}; w.grid.bld[b.cells[0]] = b.id;
  const a = human(w);
  const t0 = a.skill.tailoring, c0 = a.skill.carpentry;
  a.task = {id: 'job', job: 'craft'}; syncTask(w, a); w.nav.build('station:crafthut');
  for (let k = 0; k < 400 && b.order?.progress === 0; k++) TASKS.get('job').step(w, a, a.task || (a.task = {id: 'job', job: 'craft'}));
  if (!(b.order?.progress > 0 || w.stock.rope > 0)) return 'работа не пошла: ' + JSON.stringify(a.lastStop || a.task);
  if (!(a.skill.tailoring > t0)) return 'верёвка не научила шитью';
  if (a.skill.carpentry !== c0) return 'работа над верёвкой научила дереву';
  // nothing to make (no order, no materials): no work, no practice
  const w2 = scene(), b2 = building(w2, 'crafthut', 902), p = human(w2); w2.grid.bld[b2.cells[0]] = b2.id;
  for (const r of Object.keys(w2.stock)) w2.stock[r] = 0;
  const was = {...p.skill};
  p.task = {id: 'job', job: 'craft'}; syncTask(w2, p); w2.nav.build('station:crafthut');
  for (let k = 0; k < 200 && p.task; k++) TASKS.get('job').step(w2, p, p.task);
  return (!b2.order && sameMods(was, p.skill)) || 'без заказа навык вырос';
});

check('T37', 'один горн: плавка учит металлургии, литьё ножа — ковке', () => {
  return (recipeSkill(RECIPES.get('smelt')) === 'metallurgy' && recipeSkill(RECIPES.get('silverknife')) === 'smithing'
    && recipeSkill(RECIPES.get('sword')) === 'smithing' && JOBS.get('heal').gatherSkill === 'gathering' && JOBS.get('heal').skill === 'medicine') || 'навыки рецептов перепутаны';
});

check('T38', 'старое сохранение: навыки работ переходят без потерь, тело не меняется', () => {
  const w = scene(), a = human(w, {S: 8, I: 3});
  a.traits = ['brave', 'hardy']; a.own = {mul: {bravery: 1.07}}; refreshBody(a);
  const body = {...a.mods}, hp = a.hp;
  // what a save of the old version kept: skills under job ids, no own extras, no versions
  a.skill = {smith: 0.42, hunt: 0.3, heal: 0.2, craft: 0.15, saw: 0.25};
  delete a.own; delete a.bodyVer; delete a.skillVer;
  adoptBody(a); migrateSkills(a);
  const k = Object.keys(body).filter(x => x !== 'learn');
  if (!k.every(x => Math.abs(a.mods[x] - body[x]) < 1e-9)) return 'тело изменилось: ' + JSON.stringify({body, now: a.mods});
  if (a.hp !== hp) return 'здоровье изменилось';
  const s = a.skill;
  if (s.smithing !== 0.42 || s.metallurgy !== 0.42 || s.ranged !== 0.3 || s.hunting !== 0.3 || s.medicine !== 0.2 || s.carpentry !== 0.25 || s.tailoring !== 0.15) return 'навыки перенесены неверно: ' + JSON.stringify(s);
  if ('smith' in s || 'hunt' in s) return 'остались старые ключи';
  return (s.alchemy === undefined && s.gathering === 0) || 'резервный навык попал в персонажа или нет нового';
});

check('T39', 'резервный навык не растёт и не бывает любимым', () => {
  const w = scene(), a = human(w);
  practice(a, 'alchemy', 1000); practice(a, 'stealth', 1000);
  if (a.skill.alchemy || a.skill.stealth) return 'резервный навык вырос';
  return JOBS.filter(j => j.preferable).every(j => isActive(j.skill)) || 'работа ведёт к резервному навыку';
});

// ── SPECIAL stage 2: the forge as the first tiered station; the worker matters in choosing an order
// a forge with what a sword and an axe need, and a colony that wants both
const forge = (w, id = 950) => {
  const b = building(w, 'forge', id); w.grid.bld[b.cells[0]] = b.id;
  Object.assign(w.stock, {iron: 20, leather: 5, wood: 10, coal: 20, planks: 0, silverBar: 0});
  return b;
};
const wantOnly = (ids) => { const keep = {}; for (const r of RECIPES.all()) { keep[r.id] = r.want; r.want = ids.includes(r.id) ? (() => (ids.length - ids.indexOf(r.id))) : (() => 0); } return () => { for (const r of RECIPES.all()) r.want = keep[r.id]; }; };

check('T40', 'слабый не начинает меч, но куёт топор; сильному доступен меч', () => {
  const back = wantOnly(['sword', 'ironaxe']);
  try {
    const w = scene(); forge(w);
    const weak = human(w, {S: 4}), strong = human(w, {S: 7});
    const pw = pickRecipe(w, 'forge', undefined, weak), ps = pickRecipe(w, 'forge', undefined, strong);
    if (pw?.id !== 'ironaxe') return 'слабому выпало ' + pw?.id;
    if (ps?.id !== 'sword') return 'сильному выпало ' + ps?.id;
    const r = recipeAccess(weak, RECIPES.get('sword'));
    return (!r.ok && r.reasons[0].stat === 'S' && r.reasons[0].need === 6 && r.reasons[0].have === 4) || 'причина отказа неверна: ' + JSON.stringify(r);
  } finally { back(); }
});

check('T41', 'ответ станции не переходит от сильного к слабому', () => {
  const back = wantOnly(['sword']);
  try {
    const w = scene(); forge(w);
    const strong = human(w, {S: 8}), weak = human(w, {S: 3});
    if (!stationHasWork(w, 'forge', strong)) return 'сильный не видит работы';
    if (stationHasWork(w, 'forge', weak)) return 'слабому досталась работа сильного из кеша';
    return true;
  } finally { back(); }
});

check('T42', 'чужой меч слабый не продолжает, даже стоя у горна', () => {
  const w = scene(), b = forge(w);
  b.order = {recipe: 'sword', progress: 100};
  const weak = human(w, {S: 3});
  if (stationHasWork(w, 'forge', weak)) return 'станция предлагает слабому чужой меч';
  const skill = weak.skill.smithing;
  const r = workAt(w, b, 50, weak);
  return (!r && b.order.progress === 100 && weak.skill.smithing === skill) || 'слабый поработал над мечом';
});

check('T43', 'заказ без мастера снимается, материалы и уголь возвращаются', () => {
  const w = scene(), b = forge(w);
  human(w, {S: 3});
  const iron = w.stock.iron, coal = w.stock.coal, leather = w.stock.leather;
  b.order = {recipe: 'sword', progress: 300, fuel: ['coal', 1]};
  w.tick = HOUR * 10 + 7; stepCrafting(w);
  if (b.order) return 'заказ остался';
  if (w.stock.iron !== iron + 3 || w.stock.leather !== leather + 1 || w.stock.coal !== coal + 1) return 'вернулось не всё: ' + JSON.stringify({iron: w.stock.iron, leather: w.stock.leather, coal: w.stock.coal});
  // with a smith alive the order waits for him
  const w2 = scene(), b2 = forge(w2); human(w2, {S: 3}); human(w2, {S: 6});
  b2.order = {recipe: 'sword', progress: 300};
  w2.tick = HOUR * 10 + 7; stepCrafting(w2);
  return !!b2.order || 'заказ сняли при живом кузнеце';
});

check('T44', 'плавка серебра из руды ждёт интеллекта, простая плавка открыта всем', () => {
  const w = scene(), dull = human(w, {I: 3}), wise = human(w, {I: 6});
  return (canMake(dull, RECIPES.get('smelt')) && !canMake(dull, RECIPES.get('silverOreBar')) && canMake(wise, RECIPES.get('silverOreBar'))
    && recipeAccess(dull, RECIPES.get('silverOreBar')).reasons[0].stat === 'I') || 'тиры горна считаются не по интеллекту';
});

check('T45', 'гном по абсолютной шкале куёт то, что недоступно человеку', () => {
  const w = scene();
  const dwarf = put(w, 'dwarf', 'colony', 31.5, 30.5), man = human(w, {S: 7});
  dwarf.special.S = 9; refreshBody(dwarf);
  return (canMake(dwarf, RECIPES.get('swordSilver')) && !canMake(man, RECIPES.get('swordSilver'))) || 'тир T4 считается не по абсолютной силе';
});

check('T46', 'кузнец, которому досталась работа, тренирует ковку на мече', () => {
  const back = wantOnly(['sword']);
  try {
    const w = scene(), b = forge(w), smith = human(w, {S: 7});
    const s0 = smith.skill.smithing;
    smith.task = {id: 'job', job: 'smith'}; syncTask(w, smith); w.nav.build('station:forge');
    for (let k = 0; k < 400 && !(b.order?.progress > 0); k++) TASKS.get('job').step(w, smith, smith.task || (smith.task = {id: 'job', job: 'smith'}));
    return (b.order?.recipe === 'sword' && smith.skill.smithing > s0) || 'меч не пошёл: ' + JSON.stringify({order: b.order, stop: smith.lastStop});
  } finally { back(); }
});

// ── SPECIAL stage 2b: quality from the master's skill
check('T47', 'качество: один бросок, шанс растёт с навыком, +4 реже тысячной процента', () => {
  for (const sk of [0, 0.5, 1]) {
    const c = [1, 2, 3, 4].map(q => craftChance(q, sk));
    if (!c.every((v, k) => !k || v < c[k - 1])) return 'шансы уровней не вложены друг в друга';
    if (!(c[3] < 0.00001)) return `+4 при навыке ${sk}: ${c[3]}`;
  }
  if (!(craftChance(1, 1) > craftChance(1, 0) * 3 && craftChance(1, 1) < 0.25)) return 'навык даёт либо мало, либо явное преимущество';
  return (qualityRoll(0, 0) === 4 && qualityRoll(craftChance(4, 0), 0) === 3 && qualityRoll(0.5, 1) === 0 && qualityRoll(craftChance(1, 0) + 0.01, 0, 0.05) === 1) || 'бросок раскладывается по уровням неверно';
});

check('T48', 'качество задаёт мастер с наибольшим вкладом, вещь помнит мастера', () => {
  const w = scene(), b = forge(w);
  const pro = human(w, {S: 8}), boy = human(w, {S: 8});
  pro.skill.smithing = 1; boy.skill.smithing = 0;
  pro.name = 'Мастер'; boy.name = 'Подмастерье';
  b.order = {recipe: 'ironaxe', progress: 0};
  workAt(w, b, 500, pro);
  // the last stroke is the apprentice's, the master did most of the work; u lands where only skill 1 gives +1
  const u = (craftChance(1, 0) + craftChance(1, 1)) / 2;
  w.rngs.colony = Object.assign(() => u, {state: 0});
  workAt(w, b, 300, boy);
  const it = w.armory.at(-1);
  return (it?.type === 'ironaxe' && it.q === 1 && it.maker === 'Мастер') || 'вещь: ' + JSON.stringify(it);
});

// ── SPECIAL stage 3: critical blows on Luck, the deadly wound
const seq = (w, xs) => { let k = 0; w.rngs.combat = Object.assign(() => xs[Math.min(k++, xs.length - 1)], {state: 0}); };
const raider = (w, x = 31.5) => { const r = put(w, 'human', 'raiders', x, 30.5); r.mods.dodge = 0; return r; };

check('T49', 'крит только у попавшего удара и только от удачи нападающего', () => {
  if (![0, 1, 5, 10, 50, 1000].every(L => { const p = critChance({special: {L}}); return p >= 0 && p <= CRIT.cap; })) return 'шанс крита вне границ';
  if (!(critChance({special: {L: 10}}) > critChance({special: {L: 1}}))) return 'удача не повышает крит';
  const w = scene(), a = human(w, {L: 10}), t = raider(w);
  t.mods.dodge = 0;
  const hp0 = t.hp;
  seq(w, [0]);   // the crit check: crit
  damage(w, a, t, 0.1);
  const critHit = hp0 - t.hp;
  t.hp = hp0;
  seq(w, [0.99]);
  damage(w, a, t, 0.1);
  const plain = hp0 - t.hp;
  if (Math.abs(critHit / plain - CRIT.mul) > 1e-9) return `крит ×${critHit / plain}`;
  // a dodged blow is no hit: no crit check is spent
  t.hp = hp0; t.mods.dodge = 1;
  let calls = 0; w.rngs.combat = Object.assign(() => { calls++; return 0; }, {state: 0});
  const r = damage(w, a, t, 0.1);
  return (r === 'dodged' && calls === 1 && t.hp === hp0) || `увернулся, но бросков ${calls}`;
});

check('T50', 'удачная проверка: колонист падает без сознания, враги его не трогают', () => {
  const w = scene(), a = human(w, {L: 5, E: 5}), r = raider(w);
  seq(w, [0]);   // crit, survive: yes, clean: yes
  a.hp = 0.01;
  damage(w, r, a, 0.5);
  if (a.dead || !a.downed) return 'не упал: ' + JSON.stringify({dead: a.dead, downed: a.downed});
  if (a.downed.trauma) return 'травма при удачной второй проверке';
  if (!(a.hp > 0) || a.task?.id !== 'downed') return 'лежащий в неверном состоянии';
  if (nearestHostile(w, r, 10) === a) return 'налётчик видит лежащего целью';
  r.cd = 0;
  if (attack(w, r, a)) return 'по лежащему ударили';
  return damage(w, r, a, 5) === 'downed' && !a.dead || 'урон по лежащему прошёл';
});

check('T51', 'одна проверка на эпизод: второй смертельный удар убивает', () => {
  const w = scene(), a = human(w), r = raider(w);
  seq(w, [0]);
  a.hp = 0.01; damage(w, r, a, 0.5);
  if (!a.downed) return 'не упал';
  a.hp = -0.01; lethal(w, a, 'ран', r);
  if (!a.dead) return 'лежащий получил вторую проверку';
  // saved, still healing the grave wound: no luck left either
  const w2 = scene(), b = human(w2), r2 = raider(w2), h = human(w2);
  seq(w2, [0]);
  b.hp = 0.01; damage(w2, r2, b, 0.5); stabilize(w2, h, b);
  b.hp = 0.01; damage(w2, r2, b, 5);
  return b.dead || 'пока рана не зажила, удача спасла снова';
});

check('T52', 'без помощи упавший истекает кровью к сроку, не раньше', () => {
  const w = scene(), a = human(w, {E: 10}), r = raider(w);
  seq(w, [0]); a.hp = 0.01; damage(w, r, a, 0.5);
  const until = a.downed.until;
  if (until - w.tick !== Math.round(4 * HOUR)) return `срок ${until - w.tick} тиков при E 10`;
  w.tick = until - 1; stepDowned(w, a);
  if (a.dead) return 'умер раньше срока';
  w.tick = until; stepDowned(w, a);
  return a.dead || 'не умер к сроку';
});

check('T53', 'перевязка спасает: тяжёлая рана тянет тело и заживает, травма остаётся', () => {
  const w = scene(), a = human(w), r = raider(w), h = human(w);
  const speed = a.mods.speed, work = a.mods.work;
  seq(w, [0, 0, 0.99, 0]);   // crit; survive: yes; clean: no; the trauma drawn: the first one
  a.hp = 0.01; damage(w, r, a, 0.5);
  if (!a.downed?.trauma) return 'травма не выпала: ' + JSON.stringify(a.downed);
  const trauma = a.downed.trauma;
  giveAid(w, h, a);
  if (a.downed) return 'перевязка не подняла';
  if (!(a.hp >= 0.2 * maxHp(a) - 1e-9)) return 'после перевязки слишком мало здоровья';
  if (!a.wounds.some(x => x.id === 'grave') || !a.wounds.some(x => x.id === trauma)) return 'раны не записаны: ' + JSON.stringify(a.wounds);
  if (!(a.mods.work < work)) return 'тяжёлая рана не мешает работать';
  w.tick = a.wounds.find(x => x.id === 'grave').until + 50 - ((a.wounds.find(x => x.id === 'grave').until + a.id) % 50);
  healWounds(w, a);
  if (a.wounds.some(x => x.id === 'grave')) return 'рана не зажила в срок';
  return a.wounds.some(x => x.id === trauma) || 'неизлечимая травма прошла';
});

check('T54', 'удар далеко за край, нежить и яд — без проверки удачи', () => {
  const w = scene(), a = human(w), r = raider(w);
  seq(w, [0]);
  a.hp = -2 * maxHp(a); lethal(w, a, 'ран', r);
  if (!a.dead) return 'оверкилл дал проверку';
  // (a thinking raider may fall now, to be taken captive: docs/CAPTIVES.md; the undead never fall)
  const w2 = scene(), bad = put(w2, 'zombie', 'raiders', 31.5, 30.5), c = human(w2);
  seq(w2, [0]); bad.hp = 0.01; damage(w2, c, bad, 0.5);
  if (!bad.dead || bad.downed) return 'мертвяк упал вместо смерти';
  const w3 = scene(), p = human(w3);
  seq(w3, [0]); p.hp = -0.01; lethal(w3, p, 'яда');
  return p.dead || 'яд дал проверку удачи';
});

check('T55', 'сохранение не перебрасывает удачу: лежащий остаётся лежать', () => {
  const w = scene(), a = human(w), r = raider(w);
  seq(w, [0]); a.hp = 0.01; damage(w, r, a, 0.5);
  const d = JSON.stringify(a.downed);
  const w2 = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
  const b = w2.agents.find(o => o.id === a.id);
  if (JSON.stringify(b.downed) !== d) return 'состояние изменилось при загрузке';
  for (let k = 0; k < 20; k++) BRAINS.get(b.brain).step(w2, b);
  return (b.downed && b.task?.id === 'downed' && b.hp <= a.hp) || 'после загрузки лежащий встал или вылечился: ' + JSON.stringify({d: b.downed, t: b.task, hp: [a.hp, b.hp]});
});

check('T56', 'уклонение от ловкости, меткость без удачи', () => {
  const w = scene();
  const bare = sp => { const a = createAgent(w, 'human', 'colony', 30.5, 30.5); a.traits = []; Object.assign(a.special, sp); refreshBody(a); return a; };
  const lucky = bare({L: 10, A: 5, P: 5}), unlucky = bare({L: 1, A: 5, P: 5}), nimble = bare({L: 1, A: 10, P: 5});
  return (lucky.mods.dodge === unlucky.mods.dodge && nimble.mods.dodge > lucky.mods.dodge && lucky.mods.aim === 0 && lucky.mods.aim === unlucky.mods.aim) || JSON.stringify({l: lucky.mods, u: unlucky.mods, n: nimble.mods});
});

check('T57', 'ближнему бою учит нанесённый удар, умение добавляет урон', () => {
  const w = scene(); fixedRng(w, 0.99);
  const a = human(w), t = raider(w, 31.0);
  const m0 = a.skill.melee, hp0 = t.hp;
  a.cd = 0; if (!attack(w, a, t)) return 'удара не было';
  if (!(a.skill.melee > m0)) return 'удар не научил';
  const d0 = hp0 - t.hp;
  t.hp = hp0; a.cd = 0; a.skill.melee = 1; attack(w, a, t);
  const d1 = hp0 - t.hp;
  a.cd = 5; const m1 = a.skill.melee; attack(w, a, t);
  return (Math.abs(d1 / d0 - (1 + 0.4) / (1 + 0.4 * m0)) < 1e-9 && a.skill.melee === m1) || `урон ${d0} → ${d1}, навык без удара ${m1} → ${a.skill.melee}`;
});

// ── SPECIAL stage 4: the other jobs and the AI by what one can do
check('T58', 'работа с тиром закрыта слабому: руда при силе 3, золото при восприятии 3', () => {
  const w = scene(), weak = human(w, {S: 3, P: 3}), ok = human(w, {S: 4, P: 4});
  const dig = JOBS.get('dig'), pan = JOBS.get('pan');
  if (jobAccess(weak, dig).ok || jobAccess(weak, pan).ok) return 'слабому открыты руда или золото';
  if (!jobAccess(ok, dig).ok || !jobAccess(ok, pan).ok) return 'сильному закрыты руда или золото';
  return JOBS.filter(j => !j.tier || j.tier <= 1).every(j => jobAccess(weak, j).ok) || 'работа T1 закрыта слабому';
});

check('T59', 'лечить в хижине зовут только того, кто умеет; травы может собирать любой', () => {
  const w = scene(), dull = human(w, {I: 3}), wise = human(w, {I: 5}), heal = JOBS.get('heal');
  w.stock.herbs = 0;
  const ctx = a => ({patients: 2, can: (sk, t) => canDoAction(a, sk, t), agent: a});
  const d1 = heal.desire(w, ctx(dull), heal), d2 = heal.desire(w, ctx(wise), heal);
  return (d2 >= 0.9 && d1 > 0 && d1 < 0.5) || `желание лечить: не умеет ${d1}, умеет ${d2}`;
});

check('T60', 'мула приручает только спокойный скотник, козу любой', () => {
  const w = scene(), rough = human(w, {C: 4}), calm = human(w, {C: 6});
  const mule = put(w, 'mule', 'wild', 40.5, 30.5), goat = put(w, 'goat', 'wild', 41.5, 30.5);
  return (!canTame(rough, mule) && canTame(calm, mule) && canTame(rough, goat)) || 'тир приручения считается неверно';
});

check('T61', 'крупного зверя ищет только охотник с тиром', () => {
  const w = scene(), novice = human(w, {P: 3}), hunter = human(w, {P: 4});
  put(w, 'boar', 'wild', 45.5, 30.5);
  const job = JOBS.get('hunt');
  return (huntable(w, job, novice).length === 0 && huntable(w, job, hunter).length === 1 && huntable(w, job).length === 1) || 'кабан достаётся новичку или не достаётся никому';
});

check('T62', 'инструмент для закрытой работы не берут', () => {
  const w = scene(), blind = human(w, {P: 2}), sharp = human(w, {P: 6});
  for (const a of [blind, sharp]) { a.likes = 'pan'; a.prefs.pan = 1.6; }
  w.armory.push(newItem('pan')); outfit(w, blind);
  const took = allItems(blind).some(it => it.type === 'pan');
  outfit(w, sharp);
  return (!took && allItems(sharp).some(it => it.type === 'pan')) || `лоток: слабый ${took}, зоркий ${allItems(sharp).some(it => it.type === 'pan')}`;
});

// ── SPECIAL stage 5: trade through the colony's negotiator
const caravanFor = (w, goods = []) => (w.caravan = {id: 1, name: 'Луций', gender: 'm', goods, purse: 200, capacity: 100, traderId: null, phase: 'trading'});

check('T63', 'переговорщик — лучший по харизме и торговле, условия фиксируются на визит', () => {
  const w = scene(), shy = human(w, {C: 3}), smooth = human(w, {C: 9}), fallen = human(w, {C: 10});
  smooth.skill.barter = 0.5; fallen.downed = {until: 1e9};
  if (negotiator(w) !== smooth) return 'выбран ' + negotiator(w)?.name;
  const c = caravanFor(w), t1 = termsOf(w, c);
  smooth.special.C = 1; smooth.skill.barter = 0;
  const t2 = termsOf(w, c);
  return (t1 === t2 && t1.by === smooth.id && t1.b > 0) || 'условия пересчитались или неверны: ' + JSON.stringify([t1, t2]);
});

check('T64', 'поправка в пределах ±10%, перепродажа никогда не выгодна', () => {
  const w = scene();
  const terms = C => { const x = scene(), a = human(x, {C}); a.skill.barter = C > 5 ? 1 : 0; return termsOf(x, caravanFor(x)).b; };
  const lo = terms(1), hi = terms(1000);
  if (!(lo < 0 && hi > 0 && lo >= -TRADE.haggle && hi <= TRADE.haggle)) return `поправка ${lo} … ${hi}`;
  const goods = [...RESOURCES.filter(r => r.value > 0).map(r => ({kind: 'res', id: r.id, n: 1})), ...ITEMS.filter(d => !d.tradeOnly).map(d => ({kind: 'item', type: d.id, q: 0}))];
  const bad = goods.filter(g => askPrice(g, TRADE.haggle) < bidPrice(g, TRADE.haggle) || (unitPrice(g) >= 1 && askPrice(g, TRADE.haggle) <= bidPrice(g, TRADE.haggle)));
  return !bad.length || 'выгодно перепродать: ' + bad.map(g => g.id || g.type).join(', ');
});

check('T65', 'торговле учит только настоящая сделка и только переговорщика', () => {
  const w = scene(), neg = human(w, {C: 9}), other = human(w, {C: 2});
  w.stock.gold = 50; for (const r of Object.keys(w.stock)) if (r !== 'gold') w.stock[r] = 0;
  caravanFor(w, [{kind: 'res', id: 'salt', n: 6}]);
  const b0 = neg.skill.barter, o0 = other.skill.barter;
  holdTrade(w);
  if (!(neg.skill.barter > b0) || other.skill.barter !== o0) return `навык: переговорщик ${b0} → ${neg.skill.barter}, другой ${o0} → ${other.skill.barter}`;
  if (!w.caravan.deal.bought.length) return 'сделки не было';
  // nothing to trade: nothing learnt
  const w2 = scene(), n2 = human(w2, {C: 9});
  for (const r of Object.keys(w2.stock)) w2.stock[r] = 0;
  caravanFor(w2, []);
  const s2 = n2.skill.barter; holdTrade(w2);
  return n2.skill.barter === s2 || 'пустой торг научил';
});

// ── SPECIAL stage 6: rare trophies
const beast = (w, sp, x = 34.5) => put(w, sp, 'wild', x, 30.5);
const countRolls = w => { let n = 0; const f = w.rngs.combat; w.rngs.combat = Object.assign(() => { n++; return f(); }, {state: 0}); return () => n; };

check('T66', 'удача поднимает вес редкого, но не создаёт того, чего нет в таблице', () => {
  const w = scene(); seq(w, [0]);
  const hare = beast(w, 'hare'); hare.hitters = {1: 1000};
  const t = decideTrophies(w, hare);
  if (Object.keys(t.got).length) return 'у зайца появился трофей: ' + JSON.stringify(t);
  return (luckBoost(10) > luckBoost(5) && luckBoost(5) > luckBoost(0) && Math.abs(luckBoost(5) - 1.25) < 1e-12 && luckBoost(1e9) <= 1 + TROPHY.lucky) || 'множитель удачи неверен';
});

check('T67', 'трофей решается один раз: повтор и загрузка ничего не перебрасывают', () => {
  const w = scene(), a = human(w), wolf = beast(w, 'wolf');
  seq(w, [0]); wolf.hitters = {[a.id]: 5};
  const t1 = decideTrophies(w, wolf);
  const rolls = countRolls(w);
  const t2 = decideTrophies(w, wolf);
  if (t1 !== t2 || rolls() !== 0) return 'второй вызов бросал снова';
  const w2 = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
  const again = w2.agents.find(o => o.id === wolf.id);
  const r2 = countRolls(w2);
  return (JSON.stringify(decideTrophies(w2, again)) === JSON.stringify(t1) && r2() === 0) || 'после загрузки трофей другой';
});

check('T68', 'удача считается по всем бившим, а не по последнему удару', () => {
  const chance = 0.15, lo = chance * luckBoost(1), mid = chance * luckBoost(5.5);
  const u = (lo + mid) / 2;   // only an average Luck of 5.5 gets it, Luck 1 alone does not
  const run = lastHit => {
    const w = scene(), lucky = human(w, {L: 10}), unlucky = human(w, {L: 1}), wolf = beast(w, 'wolf');
    w.rngs.combat = Object.assign(() => u, {state: 0});
    wolf.hitters = {[lucky.id]: 10, [unlucky.id]: 1};
    return Object.keys(decideTrophies(w, wolf, lastHit === 'lucky' ? lucky : unlucky).got).length;
  };
  return (run('lucky') === 1 && run('unlucky') === 1) || 'исход зависит от того, кто добил';
});

check('T69', 'нежный орган цел только у умелой руки, иначе испорчен', () => {
  const run = A => {
    const w = scene(), a = human(w, {A}), bear = beast(w, 'bear');
    seq(w, [0]); bear.hitters = {[a.id]: 5};
    const s0 = a.skill.trophyExtraction, t = decideTrophies(w, bear);
    return {t, learnt: a.skill.trophyExtraction > s0};
  };
  const clumsy = run(3), deft = run(4);
  return (!clumsy.t.got.bile && clumsy.t.spoiled.includes('bile') && !clumsy.learnt && deft.t.got.bile === 1 && deft.learnt) || JSON.stringify({clumsy: clumsy.t, deft: deft.t});
});

check('T70', 'зверь, убитый в бою, отдаёт в лагерь и обычную добычу, и трофей', () => {
  const w = scene(), a = human(w), wolf = beast(w, 'wolf');
  for (const r of Object.keys(w.stock)) w.stock[r] = 0;
  seq(w, [0]); a.task = {id: 'fight', target: wolf};
  wolf.hp = 0.001; damage(w, a, wolf, 1);
  return (wolf.dead && w.stock.meat === 1 && w.stock.hide === 2 && w.stock.furs === 1) || 'склад: ' + JSON.stringify({dead: wolf.dead, meat: w.stock.meat, hide: w.stock.hide, furs: w.stock.furs});
});

// ── review fixes
check('T71', 'смерть от потери крови пишется в журнал один раз', () => {
  const w = scene(), a = human(w), r = raider(w);
  seq(w, [0]); a.hp = 0.01; damage(w, r, a, 0.5);
  const before = w.logLines.filter(l => l.topic === 'death').length;
  w.tick = a.downed.until; stepDowned(w, a);
  const lines = w.logLines.filter(l => l.topic === 'death').length - before;
  return (a.dead && lines === 1) || `записей о смерти: ${lines}`;
});

check('T72', 'трофей решается, только если зверя добила колония', () => {
  const w = scene(), a = human(w), bear = beast(w, 'bear'), wolf = beast(w, 'wolf', 36.5);
  seq(w, [0]); bear.hitters = {[a.id]: 5};
  bear.hp = 0.001; damage(w, wolf, bear, 1);
  return (bear.dead && !bear.trophy && !(w.chronicle.trophies?.got)) || 'трофей решён без победы колонии: ' + JSON.stringify(bear.trophy);
});

check('T73', 'лежащий без сознания не уходит из поселения и не хандрит', () => {
  const w = scene(), a = human(w), r = raider(w);
  seq(w, [0]); a.hp = 0.01; damage(w, r, a, 0.5);
  while (w.tick % DAY !== 5 * HOUR) w.tick++;
  a.downed.until = w.tick + DAY;
  a.gloom = 99; fixedRng(w, 0);
  for (const id of ['starving', 'freezing', 'exhausted', 'quarrel', 'trauma', 'grief']) think(w, a, id, {name: 'кто-то', what: 'рана', f: false});
  if (!(moodOf(w, a) < LIFE.leaveBelow)) return 'сцена: настроение недостаточно мрачное ' + moodOf(w, a);
  stepLife(w);
  return (a.faction === 'colony' && a.downed && a.task?.id === 'downed') || `ушёл или встал: ${a.faction}, ${a.task?.id}`;
});

// ── code review of 16.10 (F01–F06)
check('T74', 'F01: мир без SPECIAL загружается, делает шаг и загружается одинаково', () => {
  const w = newGame({...DEFAULT_CFG, seed: 'old', size: 'small'});
  for (const a of w.agents) { delete a.special; a.bodyVer = 0; }
  const sv = JSON.parse(JSON.stringify(saveWorld(w)));
  const w1 = loadWorld(JSON.parse(JSON.stringify(sv))), w2 = loadWorld(JSON.parse(JSON.stringify(sv)));
  if (!w1.agents.every(a => !SPECIES.get(a.species).special || a.special)) return 'SPECIAL не выдан';
  if (!w1.agents.every(a => a.hp > 0 && a.hp <= maxHp(a) + 1e-9)) return 'здоровье вне границ после пересчёта тела';
  if (worldHash(w1) !== worldHash(w2)) return 'две загрузки одного файла разошлись';
  step(w1);
  return w1.tick === w.tick + 1 || 'шаг не сделан';
});

check('T75', 'F02: сохранение с незнакомой задачей отклоняется до загрузки, формат новый', () => {
  if (SAVE_FORMAT < 3) return 'формат сохранения не поднят: старая сборка примет его';
  const w = newGame({...DEFAULT_CFG, seed: 'fmt', size: 'small'});
  const c = w.agents.find(a => a.brain === 'colonist'); c.task = {id: 'из-будущей-версии'};
  const sv = JSON.parse(JSON.stringify(saveWorld(w)));
  try { loadWorld(sv); return 'загрузка приняла мир с незнакомой задачей'; } catch (e) { if (!/другой версией/.test(e.message)) return 'непонятная ошибка: ' + e.message; }
  c.task = {id: 'job', job: 'из-будущей-версии'};
  const sv2 = JSON.parse(JSON.stringify(saveWorld(w)));
  try { loadWorld(sv2); } catch (e) { return /другой версией/.test(e.message) || 'непонятная ошибка: ' + e.message; }
  return 'загрузка приняла мир с незнакомой работой';
});

check('T76', 'F03: охотник обходит скалу на линии выстрела и стреляет, навык без выстрела не растёт', () => {
  const w = scene(); fixedRng(w);
  const h = human(w); h.x = 20.5; h.y = 20.5; armed(w, h);
  const hare = put(w, 'hare', 'wild', 22.5, 20.5);
  w.grid.terr[20 * w.w + 21] = T.ROCK; w.nav.buildAll();
  if (lineOfFire(w, h.x, h.y, hare.x, hare.y)) return 'сцена: линия огня открыта';
  const x0 = h.x, y0 = h.y, sk0 = h.skill.ranged;
  h.task = {id: 'job', job: 'hunt', prey: hare};
  let shots = 0;
  for (let k = 0; k < 60 && h.task && !shots; k++) {
    hare.x = 22.5; hare.y = 20.5; hare.task = null; h.cd = 0;
    const fx = w.fx.length; TASKS.get('job').step(w, h, h.task); if (w.fx.length > fx) shots++;
    if (!shots && h.skill.ranged !== sk0) return 'навык вырос без выстрела';
  }
  if (Math.hypot(h.x - x0, h.y - y0) < 0.3) return 'охотник стоит на месте';
  return shots > 0 || 'обошёл, но не выстрелил: ' + (h.task?.id ?? JSON.stringify(h.lastStop));
});

check('T77', 'F04: скрытая русалка не мешает перевязать раненого, видимый враг — мешает', () => {
  const run = hidden => {
    const w = scene(); fixedRng(w);
    const x = w.camp.x + 25.5, y = w.camp.y + 0.5;
    const H = put(w, 'human', 'colony', x, y), W = put(w, 'human', 'colony', x + 0.5, y);
    W.hp = maxHp(W) * 0.2;
    const foe = hidden ? put(w, 'rusalka', 'nechist', x + 0.1, y) : put(w, 'wolf', 'predators', x + 1.5, y);
    if (hidden) { foe.hiddenUntil = w.tick + 1000; foe.task = {id: 'lurk'}; }
    H.task = {id: 'aid', who: W.id};
    const hp0 = W.hp;
    for (let k = 0; k < 30 && H.task?.id === 'aid'; k++) { TASKS.get('aid').step(w, H, H.task); w.tick++; }
    return {healed: W.hp > hp0, fought: H.lastFight != null};
  };
  const a = run(true), b = run(false);
  if (!a.healed) return 'скрытая русалка блокирует помощь';
  return (b.fought) || 'видимого врага помощник не замечает';
});

check('T78', 'F05: удар не проходит сквозь угол двух скал; без скал — проходит', () => {
  const run = rocks => {
    const w = scene();
    if (rocks) { w.grid.terr[20 * w.w + 21] = T.ROCK; w.grid.terr[21 * w.w + 20] = T.ROCK; }
    const a = human(w); a.x = 20.9; a.y = 20.9;
    const r = raider(w); r.x = 21.1; r.y = 21.1;
    seq(w, [0.5]); a.cd = 0;
    const hp = r.hp, hit = attack(w, a, r);
    return {hit, lost: hp - r.hp};
  };
  const blocked = run(true), open = run(false);
  if (blocked.hit || blocked.lost > 0) return `удар сквозь скалы: урон ${blocked.lost.toFixed(3)}`;
  return (open.hit && open.lost > 0) || 'обычный удар соседу не проходит';
});

check('T79', 'F05: бойцу за углом скалы не стоится — он обходит, чтобы ударить', () => {
  const w = scene();
  w.grid.terr[20 * w.w + 21] = T.ROCK; w.grid.terr[21 * w.w + 20] = T.ROCK; w.nav.buildAll();
  const a = human(w); a.x = 20.9; a.y = 20.9;
  const r = raider(w); r.x = 21.1; r.y = 21.1; r.task = null;
  a.task = {id: 'fight', target: r};
  seq(w, [0.5]);
  const hp = r.hp;
  for (let k = 0; k < 40 && r.hp === hp && a.task; k++) { r.x = 21.1; r.y = 21.1; TASKS.get('fight').step(w, a, a.task); if (a.cd > 0) a.cd--; }
  return r.hp < hp || 'застрял за углом: ' + (a.task?.id ?? JSON.stringify(a.lastStop));
});

check('T80', 'F06: отставший волк отдыхает, держит роль wait до порога и возвращается после', () => {
  const w = scene(); fixedRng(w);
  const [a, b] = wolves(w, 2, 20.5, 20.5), hare = put(w, 'hare', 'wild', 27.5, 20.5);
  a.stamina = 0.2;
  const h = startHunt(w, [a, b], hare, 'game');
  a.task = {id: 'chase', target: hare}; b.task = {id: 'chase', target: hare};
  if (h.roles[a.id] !== 'wait') return 'сцена: роль ' + h.roles[a.id];
  const s0 = a.stamina; brain(w, a);
  if (!(a.stamina > s0)) return `в ожидании не отдыхает: ${s0} → ${a.stamina}`;
  a.stamina = 0.3; w.tick += PACK.roles; stepHunts(w);
  if (h.roles[a.id] !== 'wait') return 'при 0.3 вернулся в охоту: ' + h.roles[a.id];
  a.stamina = PACK.rested + 0.01; w.tick += PACK.roles; stepHunts(w);
  return (h.roles[a.id] !== 'wait') || 'отдохнув, не вернулся';
});

// ── the vacancies (settlement/plan.js, docs/MIND.md stage 3): the council posts places, nobody is named;
// the colonists take them by themselves — the best at a skill is drawn to it, a taken place pulls less,
// one's own place holds, yesterday's job sticks
check('T81', 'вакансии: мест столько, сколько рук, лекарь один, никто не назван; лучший дровосек сам берёт рубку, занятое место тянет слабее, своё держит, вчерашнее дело тянет', () => {
  const w = scene('roster'); fixedRng(w);
  const people = ['a', 'b', 'c', 'd', 'e', 'f'].map((n, k) => put(w, 'human', 'colony', w.camp.x + 0.5 + k, w.camp.y + 0.5));
  w.stock.wood = 2; w.stock.berries = 4;   // short of both: wood and food are wanted
  for (const a of people) { a.skill = {}; a.prefs = {}; a.likes = a.dislikes = null; }
  const best = people[2]; best.skill.woodcutting = 9;   // the colony's best woodcutter
  const p1 = makePlan(w, 'test');
  if (p1.assign) return 'в плане остались назначения по именам';
  const places = Object.values(p1.vac).reduce((s, v) => s + v.places, 0);
  if (places !== people.length) return `мест ${places} на ${people.length} человек`;
  if ((p1.vac.heal?.places || 0) > 1) return 'мест лекаря ' + p1.vac.heal.places;
  if (!p1.vac.chop) return 'лесу не дано мест при пустом дровнике';
  const p2 = makePlan(w, 'test');
  if (JSON.stringify(p1.vac) !== JSON.stringify(p2.vac)) return 'тот же мир даёт другие вакансии';
  const chop = JOBS.get('chop');
  // the best woodcutter is drawn to the woods more than anyone
  const pullOf = a => { const [m, add] = vacancyPull(w, a, chop); return m + add; };
  if (!people.filter(a => a !== best).every(a => pullOf(best) > pullOf(a))) return 'лучшего дровосека рубка тянет не сильнее других';
  const other = people[0], before = pullOf(other);
  best.think = 0; brain(w, best);   // (the flat scene has no trees: the job itself ends blocked at once)
  if (best.shift?.job !== 'chop') return `лучший дровосек записался на «${best.shift?.job}»: ${best.why?.why}`;
  // a taken place pulls the others less (here the only one: the best woodcutter took it); one's own holds
  for (const a of people.slice(3, 2 + p1.vac.chop.places)) signUp(w, a, 'chop');   // any further places
  const after = pullOf(other);
  if (!(after < before)) return `занятые места тянут не слабее: ${before.toFixed(2)} → ${after.toFixed(2)}`;
  const [mm, ma] = vacancyPull(w, best, chop);
  if (!(mm + ma > after)) return 'своё место тянет не сильнее чужого занятого';
  // the next day: of two alike, the one who was at the woods yesterday is drawn there a little more
  const fresh = people[1], twin = people[0];
  w.tick += DAY; makePlan(w, 'test');
  fresh.shift = {day: Math.floor(w.tick / DAY) - 1, job: 'chop'}; signUp(w, fresh, null);   // yesterday at the woods
  twin.shift = {day: Math.floor(w.tick / DAY) - 1, job: 'clay'}; signUp(w, twin, null);     // yesterday at the clay pit
  w.tick++;
  const [f1, fa1] = vacancyPull(w, fresh, chop), [t1, ta1] = vacancyPull(w, twin, chop);
  return fresh.shiftPrev === 'chop' && (f1 + fa1 > t1 + ta1) || `вчерашнее дело не тянет: вчера в лесу ${(f1 + fa1).toFixed(2)}, вчера на глине ${(t1 + ta1).toFixed(2)}`;
});


// ── the fixes after the World merge: reflexes against skips, the raider's blow, the night's rest, the net
check('T82', 'пауза после «враг скрылся» держит только того врага: на нападение другого отвечают сразу', () => {
  const w = scene(); fixedRng(w);
  const man = put(w, 'human', 'colony', 30.5, 30.5); man.mods.bravery = 1.5;
  const first = put(w, 'wolf', 'predators', 40.5, 30.5), second = put(w, 'wolf', 'predators', 31.5, 30.5);
  first.hiddenUntil = w.tick + 1000;   // out of sight: the fight with it ends blocked
  man.task = {id: 'fight', target: first}; syncTask(w, man);
  TASKS.get('fight').step(w, man, man.task);   // looks about where it was seen last…
  w.tick += 100; TASKS.get('fight').step(w, man, man.task);   // …and gives up
  if (man.task) return 'бой со скрывшимся не кончился';
  if (!skipped(w, man, {id: 'fight', target: first})) return 'нет паузы на скрывшегося врага';
  if (skipped(w, man, {id: 'fight', target: second})) return 'пауза легла на другого врага';
  second.pack = second.id; second.needs.food = 0.05; second.task = {id: 'maul', target: man};
  man.think = 0; brain(w, man);
  return (man.task?.id === 'fight' && man.task.target === second) || `атакованный вторым волком занят «${man.task?.id}»`;
});

check('T83', 'удар налётчика — нападение: бьют в ответ, а не копают глину', () => {
  const w = scene(); fixedRng(w);
  const man = put(w, 'human', 'colony', 30.5, 30.5); man.mods.bravery = 0.5; man.hp = maxHp(man) * 0.5;
  const raider = put(w, 'human', 'raiders', 31.5, 30.5); raider.brain = 'raider'; raider.task = {id: 'fight', target: man};
  man.task = {id: 'job', job: 'clay'}; syncTask(w, man);
  man.think = 0; brain(w, man);
  return ['fight', 'runHome'].includes(man.task?.id) || `под ударами налётчика занят «${man.task?.id}»`;
});

check('T84', 'выспавшийся до рассвета досыпает, а не идёт в лес', () => {
  const w = scene(); fixedRng(w);
  w.tick = 2 * HOUR;   // deep night
  if (nightness(w) <= 0.75) return 'сцена не ночная: ' + nightness(w).toFixed(2);
  const man = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);
  w.stock.wood = 1;   // logs wanted badly
  man.needs.rest = 1; man.sleeping = true; man.task = {id: 'sleep'}; syncTask(w, man);
  man.think = 0; brain(w, man);
  return man.task?.id === 'sleep' || `ночью встал: «${man.task?.id}/${man.task?.job}»`;
});

// ── the colony's board (settlement/board.js, docs/MIND.md stage 1)
// every colonist looks round once in BOARD.look ticks: run the board that many ticks
const lookRound = w => { for (let k = 0; k < BOARD.look; k++) { w.tick++; stepBoard(w); } };
const flagOf = w => Object.values(w.board?.flags || {})[0];
const wolfOn = (w, x, y, victim) => { const o = put(w, 'wolf', 'predators', x, y); o.pack = o.id; o.task = {id: 'maul', target: victim}; return o; };

check('T85', 'крик: увидевший поднимает тревогу, слышат в радиусе, эстафета несёт дальше, одиночка вдали не знает', () => {
  const w = scene(); fixedRng(w);
  const a = put(w, 'human', 'colony', 20.5, 30.5), b = put(w, 'human', 'colony', 45.5, 30.5), c = put(w, 'human', 'colony', 70.5, 30.5);
  const lone = put(w, 'human', 'colony', 20.5, 70.5);   // 40 from a, 46 from b: out of every cry
  wolfOn(w, 21.5, 30.5, a);
  lookRound(w);
  const f = flagOf(w);
  if (!f) return 'флага нет';
  if (!f.known[a.id]) return 'увидевший не знает';
  if (!f.known[b.id]) return 'в радиусе крика не услышали';
  if (!f.known[c.id]) return 'эстафета не донесла';
  if (f.known[lone.id]) return 'одиночка вдали узнал';
  return true;
});

check('T86', 'спящий слышит крик с шансом по Восприятию', () => {
  const res = [];
  for (const P of [7, 3]) {
    const w = scene(); fixedRng(w, 0.5);   // the roll: 0.5 — hears when 0.1 × P > 0.5
    const a = put(w, 'human', 'colony', 20.5, 30.5), s = put(w, 'human', 'colony', 30.5, 30.5);
    s.special = {...s.special, P}; s.sleeping = true; s.task = {id: 'sleep'};
    wolfOn(w, 21.5, 30.5, a);
    // the sleeper does not look round itself: only the cry can reach it
    for (let k = 0; k < BOARD.look; k++) { w.tick++; s.sleeping = true; stepBoard(w); }
    res.push(!!flagOf(w)?.known[s.id]);
  }
  return (res[0] && !res[1]) || `P 7: ${res[0] ? 'услышал' : 'не услышал'}, P 3: ${res[1] ? 'услышал' : 'не услышал'}`;
});

check('T87', 'жёлтая тревога (волк рядом, ни на кого не нападает): занявший флаг облегчает его для остальных, второй волк делает тяжелее', () => {
  const w = scene(); fixedRng(w);
  const x = put(w, 'human', 'colony', 30.5, 30.5), y = put(w, 'human', 'colony', 30.5, 32.5);
  for (const c of [x, y]) { c.mods.bravery = 1; outfit(w, c); }
  const wolf = put(w, 'wolf', 'predators', 38.5, 30.5); wolf.pack = wolf.id;
  lookRound(w);
  const f = flagOf(w);
  if (!f || f.red) return f ? 'флаг красный, а волк ни на кого не нападает' : 'флага нет';
  const score = c => flagOptions(w, c)[0]?.[1] ?? 0;
  const before = score(y);
  x.task = {id: 'fight', target: wolf}; w.tick++;   // a new tick: the answerers are counted again
  const after = score(y);
  if (!(after < before)) return `второй видит флаг не легче: ${before.toFixed(2)} → ${after.toFixed(2)}`;
  const second = put(w, 'wolf', 'predators', 39.5, 31.5); second.pack = wolf.pack;
  lookRound(w);
  const more = score(y);
  return more > after || `второй волк не сделал флаг тяжелее: ${after.toFixed(2)} → ${more.toFixed(2)}`;
});

check('T88', 'флаг снимается, когда угрозы нет; в журнале — кто её одолел', () => {
  const w = scene(); fixedRng(w);
  const v = put(w, 'human', 'colony', 30.5, 30.5), x = put(w, 'human', 'colony', 33.5, 30.5);
  const wolf = wolfOn(w, 31.5, 30.5, v);
  lookRound(w);
  if (!flagOf(w)) return 'флага нет';
  x.task = {id: 'fight', target: wolf}; lookRound(w);
  kill(w, wolf, 'убит', x);
  lookRound(w);
  if (flagOf(w)) return 'флаг висит после гибели волка';
  const line = w.logLines.find(l => /одолел/.test(l.html));
  return (line && line.html.includes(x.name)) || 'в журнале нет, кто одолел волка';
});

check('T89', 'кто услышал издалека, бежит на крик и вступает в бой, когда видит врага', () => {
  const w = scene(); fixedRng(w);
  const v = put(w, 'human', 'colony', 20.5, 30.5), far = put(w, 'human', 'colony', 45.5, 30.5);
  far.mods.bravery = 1.5;
  const wolf = wolfOn(w, 21.5, 30.5, v); wolf.speed = 0;
  lookRound(w);
  far.think = 0; brain(w, far);
  if (far.task?.id !== 'answer') return `услышавший издалека занят «${far.task?.id}»`;
  for (let k = 0; k < 400 && far.task?.id === 'answer'; k++) { w.tick++; TASKS.get('answer').step(w, far, far.task); wolf.x = 21.5; wolf.y = 30.5; }
  return (far.task?.id === 'fight' && far.task.target === wolf) || `на месте занят «${far.task?.id}»`;
});

check('T90', 'робкий слышит тревогу, но не идёт, и пишет в дневник почему', () => {
  const w = scene(); fixedRng(w);
  const v = put(w, 'human', 'colony', 30.5, 30.5), t = put(w, 'human', 'colony', 34.5, 30.5);
  t.mods.bravery = 0.3;
  wolfOn(w, 31.5, 30.5, v);
  lookRound(w);
  t.think = 0; brain(w, t);
  if (['fight', 'answer'].includes(t.task?.id)) return 'робкий пошёл драться';
  return t.diary.some(e => e.id === 'ignoredAlarm') || 'в дневнике нет, почему не пошёл';
});

check('T91', 'доска сохраняется и продолжается тик в тик', () => {
  const w = scene(); fixedRng(w);
  const v = put(w, 'human', 'colony', 30.5, 30.5); put(w, 'human', 'colony', 34.5, 30.5);
  wolfOn(w, 31.5, 30.5, v);
  lookRound(w);
  const c = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
  if (!c.board || Object.keys(c.board.flags).length !== Object.keys(w.board.flags).length) return 'доска не сохранилась';
  return worldHash(c) === worldHash(w) || 'отпечаток после загрузки другой';
});

check('T92', 'красная тревога: не легчает от откликнувшихся, робкий в виду налёта уходит к огню, а не работает; отступил отряд — флаг снят', () => {
  const w = scene(); fixedRng(w);
  const brave = put(w, 'human', 'colony', w.camp.x + 4.5, w.camp.y + 0.5), timid = put(w, 'human', 'colony', w.camp.x + 4.5, w.camp.y + 2.5);
  brave.mods.bravery = 1.5; timid.mods.bravery = 0.3;
  const [g, sq] = band(w, 3, w.camp.x + 12.5, w.camp.y + 0.5);
  lookRound(w);
  const f = flagOf(w);
  if (!f?.red) return f ? 'флаг налёта не красный' : 'флага налёта нет';
  const before = flagOptions(w, timid)[0]?.[1] ?? 0;
  brave.task = {id: 'fight', target: g[0]}; w.tick++;
  const after = flagOptions(w, timid)[0]?.[1] ?? 0;
  if (after < before) return `красный флаг полегчал: ${before.toFixed(2)} → ${after.toFixed(2)}`;
  timid.task = {id: 'job', job: 'clay'}; syncTask(w, timid);
  timid.think = 0; brain(w, timid);
  if (!['reserve', 'muster', 'runHome', 'fight'].includes(timid.task?.id)) return `робкий в виду налёта занят «${timid.task?.id}/${timid.task?.job}»`;
  sq.state = 'retreat';
  lookRound(w);
  return !flagOf(w) || 'флаг висит после отступления отряда';
});

check('T93', 'налётчик уносит добычу на себе; кто его убил, забирает её и несёт на склад', () => {
  const w = scene(); fixedRng(w);
  w.stock.berries = 40; w.stock.wood = 30;
  const [g] = band(w, 1, w.camp.x + 0.5, w.camp.y + 0.5);
  const r = g[0]; r.task = {id: 'assault'};
  const before = w.stock.berries + w.stock.wood;
  TASKS.get('assault').step(w, r, r.task);
  const taken = Object.values(r.loot || {}).reduce((s, v) => s + v, 0);
  if (!(taken > 0)) return 'налётчик ничего не унёс на себе';
  const man = put(w, 'human', 'colony', r.x + 1, r.y);
  kill(w, r, 'убит', man);
  if (r.loot) return 'добыча осталась на убитом';
  if (!(man.carry?.n >= taken - 1e-6)) return `у победителя в руках ${man.carry?.n ?? 0} из ${taken.toFixed(1)}`;
  dropLoad(w, man);
  const after = w.stock.berries + w.stock.wood;
  return Math.abs(after - before) < 0.6 || `склад до ${before.toFixed(1)}, после ${after.toFixed(1)}`;
});

check('T94', 'погоня: отступивший отряд с добычей — жёлтый флаг, тревога у огня снята, за ним бегут и издалека', () => {
  const w = scene(); fixedRng(w);
  const brave = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5); brave.mods.bravery = 1.5;
  const [g, sq] = band(w, 2, w.camp.x + 10.5, w.camp.y + 0.5);
  g[0].loot = {berries: 5}; g[0].looted = true; g[0].task = {id: 'leave'};
  sq.state = 'retreat';
  lookRound(w);
  const f = flagOf(w);
  if (!f) return 'флага погони нет';
  if (f.red) return 'погоня — красный флаг';
  if (f.members.includes(g[1].id)) return 'налётчик без добычи на флаге погони';
  if (raidAlarm(w)) return 'тревога налёта держится при отступившем отряде';
  // the looter runs off out of sight: the brave one runs after it
  g[0].x = w.camp.x + 26.5; brave.think = 0; brain(w, brave);
  return ['answer', 'fight'].includes(brave.task?.id) || `смелый занят «${brave.task?.id}» — за добычей не побежал`;
});

check('T95', 'ночной дозор: одно место, его берёт бодрый и смелый, второй не берёт; дежуривший не берёт следующей ночью', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 22 * HOUR;   // after the evening council (19:00–21:30), which comes first
  const fresh = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5), worn = put(w, 'human', 'colony', w.camp.x + 1.5, w.camp.y + 0.5);
  fresh.needs.rest = 0.95; fresh.mods.bravery = 1.4; worn.needs.rest = 0.25; worn.mods.bravery = 0.7;
  stepBoard(w);
  const sf = watchOption(w, fresh)?.[1] ?? 0, sw = watchOption(w, worn)?.[1] ?? 0;
  if (!(sf > sw)) return `бодрый и смелый хочет дежурить не больше уставшего: ${sf.toFixed(2)} против ${sw.toFixed(2)}`;
  fresh.think = 0; brain(w, fresh);
  if (fresh.task?.id !== 'watch') return `бодрый занят «${fresh.task?.id}», а не дозором`;
  if (watchOption(w, worn)?.[0].id === 'watch') return 'второму предлагают занятое место';
  // the morning: the watch is over, the watchman sleeps it off
  w.tick = 4 * DAY + (WATCH.till + 0.5) * HOUR; fresh.needs.rest = 0.4; stepBoard(w);
  if (fresh.lastWatch !== 3) return 'ночь дозора не записана';
  const off = watchOption(w, fresh);
  if (off?.[0].id !== 'sleep') return 'утром дозорный не отсыпается';
  // the next evening: someone else's turn
  w.tick = 4 * DAY + WATCH.from * HOUR + 10; fresh.needs.rest = 1; fresh.offDuty = 0; stepBoard(w);
  return !watchOption(w, fresh) || 'дежуривший прошлой ночью снова берёт дозор';
});

check('T96', 'ночью взгляд вдвое короче, у костра полный; дозорный видит за всех и поднимает тревогу, пока все спят', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 2 * HOUR;
  if (nightness(w) < 0.9) return 'сцена не ночная';
  const far = put(w, 'human', 'colony', w.camp.x + 20.5, w.camp.y + 0.5);   // far from the fire
  const wolf = put(w, 'wolf', 'predators', w.camp.x + 32.5, w.camp.y + 0.5); wolf.pack = wolf.id;   // 12 from `far`
  lookRound(w);
  if (flagOf(w)) return 'в темноте вдали от огня увидели за 12 клеток';
  // a watchman by the fire, the others asleep
  const sleeper = put(w, 'human', 'colony', w.camp.x + 1.5, w.camp.y + 0.5); sleeper.sleeping = true; sleeper.task = {id: 'sleep'};
  const watchman = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);
  w.board.watch = {night: 2, by: watchman.id, name: watchman.name, done: false}; watchman.task = {id: 'watch'};
  far.x = 2.5; far.y = 2.5; sleeper.x = w.camp.x + 1.5;   // nobody else is awake near the wolf
  wolf.x = w.camp.x + 12.5;
  w.tick++; while ((w.tick + watchman.id) % BOARD.look === 0) w.tick++;   // not its turn by the roster
  stepBoard(w);   // the watchman looks every tick
  const f = flagOf(w);
  return (f && f.known[watchman.id]) || 'дозорный не увидел волка у лагеря';
});

check('T97', 'дозорный, которого сморил сон, засыпает на посту — это в журнале', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 3 * HOUR;
  const a = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);
  w.board ??= {flags: {}, seq: 0};
  w.board.watch = {night: 2, by: a.id, name: a.name, done: false}; a.task = {id: 'watch'}; syncTask(w, a);
  a.needs.rest = 0.02;
  a.think = 0; brain(w, a);
  if (a.task?.id !== 'sleep') return `выбившийся из сил дозорный занят «${a.task?.id}»`;
  return w.logLines.some(l => /уснул[а]? на посту/.test(l.html)) || 'в журнале нет, что дозорный уснул';
});

check('T98', 'думает по событию: без событий не пересматривает решение, нужда за порогом будит сразу', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 10 * HOUR;   // day: no nightfall in the window
  const a = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);
  a.needs.food = 0.9; a.needs.rest = 0.95; a.needs.warmth = 1;
  // every job out of reach for a while (on the flat scene each would end blocked at once — an event):
  // nothing to do but idle
  a.skips = {}; for (const j of JOBS.all()) a.skips['job:' + j.id] = w.tick + 10 * DAY;
  a.task = {id: 'idle'}; a.think = 0; brain(w, a);   // one think now
  if (a.task?.id !== 'idle') return `вместо безделья «${a.task?.id}»`;
  const t0 = a.why?.t;
  // 40 ticks of nothing happening: the old timer (every 15) would have made it think again twice
  for (let k = 0; k < 40; k++) { w.tick++; a.needs.food = 0.9; a.needs.rest = 0.95; a.needs.warmth = 1; brain(w, a); }
  if (a.why?.t !== t0) return `думал без повода: ${a.why?.woke}`;
  a.needs.food = 0.35;   // hungry past the 0.4 band
  w.tick++; brain(w, a);
  if (a.why?.t === t0) return 'проголодавшись, не задумался';
  return /сытость/.test(a.why.woke) || `задумался по другой причине: ${a.why.woke}`;
});

check('T99', 'события поселения: стемнело и время совета будят всех, кто не спит', () => {
  const w = scene(); fixedRng(w);
  const a = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5), b = put(w, 'human', 'colony', w.camp.x + 1.5, w.camp.y + 0.5);
  w.tick = 3 * DAY + 12 * HOUR; stepAttention(w);
  for (const c of [a, b]) { c.think = 99; c.wakeWhy = null; }
  // to the evening: the council
  for (let h = 12; h < 19.5; h += 0.05) { w.tick = 3 * DAY + Math.round(h * HOUR); stepAttention(w); if (a.think === 0) break; }
  if (a.think !== 0 || b.think !== 0) return 'вечером никто не проснулся к совету или к темноте';
  const first = a.wakeWhy;
  for (const c of [a, b]) { c.think = 99; c.wakeWhy = null; }
  for (let h = 19.5; h < 24; h += 0.05) { w.tick = 3 * DAY + Math.round(h * HOUR); stepAttention(w); if (b.wakeWhy === 'стемнело' || b.wakeWhy === 'время совета') break; }
  return ['стемнело', 'время совета'].includes(first) && ['стемнело', 'время совета'].includes(b.wakeWhy) || `причины: «${first}», «${b.wakeWhy}»`;
});

check('T100', 'свой в беде: упавший без сознания будит остальных, и они идут на помощь', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 10 * HOUR;
  const v = put(w, 'human', 'colony', w.camp.x + 20.5, w.camp.y + 0.5), h = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);
  h.task = {id: 'idle'}; h.think = 0; brain(w, h);
  stepAttention(w);
  h.think = 999;
  v.downed = {since: w.tick, by: null}; v.task = {id: 'downed'};
  stepAttention(w);
  if (h.think !== 0) return 'упавший никого не разбудил';
  w.tick++; brain(w, h);
  return h.task?.id === 'aid' || `разбуженный занят «${h.task?.id}»: ${h.why?.why}`;
});

// ── wild herds (agents/wildHerd.js, docs/MIND.md stage 5)
const deerAt = (w, x, y, nerve) => { const d = put(w, 'deer', 'wild', x, y); d.nerve = nerve; return d; };
check('T101', 'стадо: олени рядом — одно стадо; оглядываются по очереди; пугливый срывается первым, спокойный — позже', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 10 * HOUR;
  const jumpy = deerAt(w, 40.5, 30.5, 0.6), calm = deerAt(w, 42.5, 30.5, 1.4);
  for (let k = 0; k < 4; k++) deerAt(w, 41.5 + k * 0.5, 32.5, 1);
  stepHerds(w);
  const H = herdOf(w, jumpy);
  if (!H || herdOf(w, calm) !== H || H.n !== 6) return `стадо не собралось: ${H?.n}`;
  const wolf = put(w, 'wolf', 'predators', 31.5, 30.5); wolf.pack = wolf.id;   // 9 from the jumpy one, 11 from the calm
  let jumpyAt = null, calmAt = null;
  for (let t = 0; t < 30; t++) {
    stepHerds(w);
    for (const d of w.agents) if (d.species === 'deer') brain(w, d);
    wolf.x = 31.5; wolf.y = 30.5;
    if (jumpyAt == null && jumpy.task?.id === 'bolt') jumpyAt = t;
    if (calmAt == null && calm.task?.id === 'bolt') calmAt = t;
    w.tick++;
  }
  if (!herdAlarm(w, H) && jumpyAt == null) return 'стадо не заметило волка';
  if (jumpyAt == null) return 'пугливый не сорвался';
  if (calmAt != null && calmAt <= jumpyAt) return `спокойный сорвался не позже пугливого: ${calmAt} и ${jumpyAt}`;
  return calmAt != null || 'спокойный так и не побежал за стадом';
});

check('T102', 'раненый в стаде бежит медленнее и отстаёт', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 10 * HOUR;
  const fine = deerAt(w, 40.5, 30.5, 0.6), hurt = deerAt(w, 40.5, 33.5, 0.6);
  hurt.hp = maxHp(hurt) * 0.3;
  const wolf = put(w, 'wolf', 'predators', 34.5, 31.5); wolf.pack = wolf.id;
  const x0 = [fine.x, hurt.x];
  for (let t = 0; t < 25; t++) { stepHerds(w); brain(w, fine); brain(w, hurt); wolf.x = 34.5; wolf.y = 31.5; w.tick++; }
  const run = [Math.hypot(fine.x - x0[0], 0), Math.hypot(hurt.x - x0[1], 0)];
  return run[1] < run[0] * 0.85 || `раненый пробежал ${run[1].toFixed(1)} против ${run[0].toFixed(1)}`;
});

check('T103', 'волк ценит отставшего от стада выше, чем оленя в середине', () => {
  const w = scene(); fixedRng(w);
  const inside = deerAt(w, 40.5, 30.5, 1);
  for (let k = 0; k < 5; k++) deerAt(w, 40 + (k % 3), 29.5 + (k % 2) * 2, 1);
  const out = deerAt(w, 49.5, 30.5, 1);   // in the herd, but far from its middle
  stepHerds(w);
  if (herdOf(w, out) !== herdOf(w, inside)) return 'отставший не в том же стаде';
  const wolf = put(w, 'wolf', 'predators', 45, 25); wolf.pack = wolf.id;
  const P = SPECIES.get('wolf').predator;
  const vIn = preyValue(w, wolf, P, inside, 1), vOut = preyValue(w, wolf, P, out, 1);
  return vOut > vIn || `отставший ${vOut.toFixed(3)}, в середине ${vIn.toFixed(3)}`;
});

check('T104', 'лоси: смелый бык идёт на волка, напавшего на лосиху; робкая отходит', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 10 * HOUR;
  const cow = put(w, 'elk', 'wild', 40.5, 30.5), bull = put(w, 'elk', 'wild', 43.5, 30.5), shy = put(w, 'elk', 'wild', 41.5, 32.5);
  cow.nerve = 1; bull.nerve = 1.35; shy.nerve = 0.65;
  stepHerds(w);
  if (herdOf(w, bull) !== herdOf(w, cow)) return 'лоси не в одном стаде';
  const wolf = put(w, 'wolf', 'predators', 39.5, 30.5); wolf.pack = wolf.id; wolf.task = {id: 'maul', target: cow};
  stepHerds(w); brain(w, bull); brain(w, shy);
  if (!(bull.task?.id === 'maul' && bull.task.target === wolf)) return `бык занят «${bull.task?.id}»`;
  return ['drawOff', 'alert', 'graze', 'maul'].includes(shy.task?.id) && !(shy.task?.id === 'maul') || `робкая лосиха занята «${shy.task?.id}»`;
});

// ── fixes from the code review of 21.10
check('T105', 'бег на зов различает тревоги: со зова на жёлтую переключаются на более тяжёлую', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 10 * HOUR;
  const a = put(w, 'human', 'colony', 30.5, 30.5), v = put(w, 'human', 'colony', 30.5, 48.5);
  a.mods.bravery = 1.5; outfit(w, a);
  a.skips = {}; for (const j of JOBS.all()) a.skips['job:' + j.id] = w.tick + 10 * DAY;   // nothing else to do
  const y = put(w, 'wolf', 'predators', 30.5, 12.5); y.pack = y.id;   // a yellow flag, 18 away
  const r = put(w, 'wolf', 'predators', 31.5, 48.5); r.pack = r.id;   // will be red: on v
  lookRound(w);
  a.task = {id: 'answer', flag: 'pack:' + y.pack}; syncTask(w, a);
  r.task = {id: 'maul', target: v};
  lookRound(w);
  const red = w.board.flags['pack:' + r.pack];
  if (!red?.red || !red.known[a.id]) return 'красная тревога не дошла';
  a.think = 0; brain(w, a);
  return (a.task?.flag === 'pack:' + r.pack || a.task?.target === r) || `остался на «${a.task?.id} ${a.task?.flag}»`;
});

check('T106', 'раздумье между работами длится, сколько задумано', () => {
  const w = scene(); fixedRng(w);
  w.tick = 3 * DAY + 10 * HOUR;
  const a = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);
  w.stock.wood = 0; w.stock.clay = 50;   // the woods are wanted, the clay pit not
  a.prefs = {chop: 1.6, clay: 0.5}; a.likes = 'chop'; a.dislikes = 'clay'; a.skips = {};
  a.task = {id: 'job', job: 'clay'}; syncTask(w, a);
  a.think = 0; brain(w, a);   // decides to go to the woods: a moment's thought first
  if (a.task?.id !== 'ponder') return `вместо раздумья «${a.task?.id}/${a.task?.job}»`;
  const left = a.task.until - w.tick;
  for (let k = 0; k < left - 1; k++) { w.tick++; brain(w, a); if (a.task?.id !== 'ponder') return `раздумье оборвалось через ${k + 1} из ${left} тиков: «${a.task?.id}»`; }
  return true;
});

check('T107', 'потяжелевшая тревога будит всех, кто о ней знает', () => {
  const w = scene(); fixedRng(w);
  const x = put(w, 'human', 'colony', 30.5, 30.5), y = put(w, 'human', 'colony', 31.5, 30.5);
  const wolf = put(w, 'wolf', 'predators', 43.5, 30.5); wolf.pack = wolf.id;   // in sight, not close (> BOARD.near)
  outfit(w, x); x.task = {id: 'fight', target: wolf};
  lookRound(w);
  y.think = 999; y.wakeWhy = null;
  for (let k = 0; k < 3; k++) { const o = put(w, 'wolf', 'predators', 44.5 + k, 31.5); o.pack = wolf.pack; }   // the pack comes up
  x.task = null;   // and the defender walks off
  lookRound(w);
  return (y.think === 0 && /тяжелее/.test(y.wakeWhy || '')) || `знавший о тревоге не проснулся, когда она потяжелела (${y.think}, ${y.wakeWhy})`;
});

check('T108', 'каркас групп: ушедшие выбывают, дозорные обходят всех по очереди, забытое — забыто', () => {
  const w = scene(); fixedRng(w);
  const ms = [0, 1, 2, 3, 4].map(k => put(w, 'deer', 'wild', 30.5 + k, 30.5));
  const g = {members: ms.map(a => a.id), look: 0};
  kill(w, ms[1], 'тест'); ms[3].gone = true;
  const dropped = [];
  const live = prune(w, g, a => !a.gone, a => dropped.push(a.id));
  if (g.n !== 3 || live.includes(ms[1]) || live.includes(ms[3])) return `осталось ${g.n}: ${g.members}`;
  if (dropped.length !== 1 || dropped[0] !== ms[3].id) return 'не сказано о живом, но ушедшем';
  const seen = new Set();
  for (let t = 0; t < 2; t++) for (const L of nextLookouts(g, live, 2)) seen.add(L.id);
  if (seen.size !== 3) return `за два тика по двое оглянулись не все: ${seen.size}`;
  const turns = new Set(); for (let t = 0; t < 5; t++) { w.tick = 100 + t; if (inTurn(w, live[0], 5)) turns.add(t); }
  if (turns.size !== 1) return 'в очереди раз в 5 тиков — не ровно один раз';
  const f = {}; see(f, live[0], 10); see(f, live[2], 50);
  const gone = fade(f, 120, 100);
  if (gone.length !== 1 || gone[0] !== live[0].id || !f.seen[live[2].id]) return 'забыто не то';
  return seenMiddle(f).x === live[2].x || 'середина виденного не там';
});


// ── captives (docs/CAPTIVES.md, stage 1)
// a raider brought down and left lying: the luck checks all come out «survive, clean»
const fell = (w, r, by) => { const keep = w.rngs.combat; w.rngs.combat = Object.assign(() => 0, {state: 0}); r.hp = -0.01; lethal(w, r, 'ран', by); w.rngs.combat = keep; return r; };
// a raider in sword and lamellar, fallen near a colonist
function fallenRaider(w, x = 40.5, y = 30.5) {
  const [g, sq] = band(w, 1, x, y), r = g[0];
  r.equip.right = newItem('sword'); r.equip.body = newItem('lamellar'); recalcGear(r);
  return [fell(w, r, null), sq];
}
const bindAll = (w, a) => { for (let k = 0; k < 400 && a.task?.id === 'bind'; k++) { syncTask(w, a); TASKS.get(a.task.id).step(w, a, a.task); syncTask(w, a); w.tick++; } };

check('T109', 'разумный налётчик падает без сознания, нежить и зверь — нет; упавший выбывает из банды один раз', () => {
  const w = scene(); fixedRng(w);
  const c = put(w, 'human', 'colony', 30.5, 30.5);
  const [r, sq] = fallenRaider(w);
  if (!r.downed || r.dead) return 'разумный налётчик не упал';
  if (sq.fallen !== 1) return `банда насчитала павших: ${sq.fallen}`;
  const z = fell(w, put(w, 'zombie', 'raiders', 35.5, 30.5), c), wolf = fell(w, put(w, 'wolf', 'predators', 36.5, 30.5), c);
  if (!z.dead || !wolf.dead) return 'мертвяк или волк упал вместо смерти';
  for (let k = 0; k < 3; k++) BRAINS.get(r.brain).step(w, r);
  if (r.task?.id !== 'downed' || r.x !== 40.5) return `упавший налётчик ходит: ${r.task?.id}`;
  kill(w, r, 'ран', c);
  return sq.fallen === 1 || `павший и добитый посчитан дважды: ${sq.fallen}`;
});

check('T110', 'есть путы — поселенец идёт вязать упавшего; без пут или при враге на ногах рядом — нет', () => {
  const w = scene(); fixedRng(w);
  const c = put(w, 'human', 'colony', 30.5, 30.5);
  const [r] = fallenRaider(w);
  w.stock.rope = 0; w.stock.shacklesIron = 0; w.stock.shacklesBronze = 0;
  if (bindOption(w, c)) return 'вяжет без пут';
  w.stock.rope = 2;
  const o = bindOption(w, c);
  if (o?.[0].id !== 'bind' || o[0].who !== r.id) return 'с верёвкой на складе не идёт вязать';
  const foe = put(w, 'human', 'raiders', r.x + 3, r.y); w.tick++;   // (who is near is laid out once a tick)
  if (bindOption(w, c)) return 'идёт вязать, когда рядом враг на ногах';
  kill(w, foe, 'ран'); w.tick++;
  c.think = 0; brain(w, c);
  return c.task?.id === 'bind' || `после боя выбрал «${c.task?.id}» (${c.why?.task}: ${c.why?.why}; ${c.lastStop ? JSON.stringify(c.lastStop) : ''}), а не связать`;
});

check('T111', 'связанный жив и перевязан, пленный поселения, оружие и доспех на складе, путы списаны — лучшие первыми', () => {
  const w = scene(); fixedRng(w);
  const c = put(w, 'human', 'colony', 39.5, 30.5);
  const [r] = fallenRaider(w);
  w.stock.rope = 4; w.stock.shacklesIron = 1; w.stock.shacklesBronze = 0;
  c.task = {id: 'bind', who: r.id};
  bindAll(w, c);
  if (!r.captive || r.faction !== 'colony' || r.downed || r.dead) return `не пленный: ${r.faction}, упал ${!!r.downed}`;
  if (r.captive.bonds !== 'iron' || w.stock.shacklesIron !== 0 || w.stock.rope !== 4) return `путы: ${r.captive.bonds}, кандалов ${w.stock.shacklesIron}, верёвки ${w.stock.rope}`;
  if (allItems(r).length) return `при пленном осталось: ${allItems(r).map(it => it.type)}`;
  if (!w.armory.some(it => it.type === 'sword') || !w.armory.some(it => it.type === 'lamellar')) return 'меч и ламеляр не на складе';
  if (r.brain !== 'colonist' || r.squad != null || !r.prefs) return 'пленный не думает как поселенец';
  // the second one is bound with rope
  const [r2] = fallenRaider(w, 41.5, 30.5);
  c.task = {id: 'bind', who: r2.id}; bindAll(w, c);
  if (r2.captive?.bonds !== 'rope' || w.stock.rope !== 2) return `второй связан ${r2.captive?.bonds}, верёвки ${w.stock.rope}`;
  return captives(w).length === 2 || `пленных ${captives(w).length}`;
});

// a captive by the fire: a raider taken the way the game takes it
function captive(w, healed = false) {
  const c = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 1.5);
  const [r] = fallenRaider(w, w.camp.x + 1.5, w.camp.y + 1.5);
  w.stock.rope = 2; c.task = {id: 'bind', who: r.id}; bindAll(w, c);
  c.task = null;
  if (healed) r.hp = maxHp(r);   // the wound of the fall healed: fit to work
  return [r, c];
}

check('T112', 'пленный не идёт на совет, на флаги и в дозор, не берёт работу за периметром и оружие, но берёт инструмент', () => {
  const w = scene(); fixedRng(w);
  const [p] = captive(w);
  for (const t of [{id: 'council'}, {id: 'trade'}, {id: 'watch'}, {id: 'answer', flag: 'x'}, {id: 'fight', target: null}, {id: 'aid', who: 1}, {id: 'company', who: 1}, {id: 'bind', who: 1}, {id: 'job', job: 'chop'}, {id: 'job', job: 'hunt'}, {id: 'job', job: 'gather'}])
    if (captiveAllows(t)) return `пленному можно «${t.id}${t.job ? ':' + t.job : ''}»`;
  for (const t of [{id: 'eat'}, {id: 'sleep'}, {id: 'job', job: 'build'}, {id: 'job', job: 'craft'}, {id: 'fight', reflex: true}, {id: 'reserve'}])
    if (!captiveAllows(t)) return `пленному нельзя «${t.id}${t.job ? ':' + t.job : ''}»`;
  // the council hour: the free colonist goes, the captive does not
  w.tick = Math.floor(w.tick / DAY) * DAY + 20 * HOUR;
  if (!councilDue(w)) return 'совет не идёт';
  for (const n of Object.keys(p.needs)) p.needs[n] = 1;
  p.think = 0; brain(w, p);
  if (p.task?.id === 'council') return 'пленный сел на совет';
  // the gear store: a sword, lamellar and an axe — the captive takes the axe only
  w.armory = [newItem('sword'), newItem('lamellar'), newItem('ironaxe'), newItem('shield')];
  outfit(w, p);
  const has = allItems(p).map(it => it.type);
  return (has.includes('ironaxe') && !has.some(t => ['sword', 'lamellar', 'shield'].includes(t))) || `пленный взял: ${has.join(', ') || 'ничего'}`;
});

check('T113', 'пленный за периметром возвращается к огню; на него напали — отвечает', () => {
  const w = scene(); fixedRng(w);
  const [p] = captive(w);
  p.x = w.camp.x + 30.5; p.y = w.camp.y + 0.5; p.task = {id: 'idle'}; p.think = 50;
  if (agentInZone(w, p)) return 'точка в периметре';
  brain(w, p);
  if (p.task?.id !== 'runHome') return `за периметром занят «${p.task?.id}»`;
  const wolf = wolfOn(w, p.x + 1, p.y, p);
  p.think = 0; brain(w, p);
  return ['fight', 'runHome'].includes(p.task?.id) || `на него напали, а он «${p.task?.id}»`;
});

check('T114', 'пленный видит волка и поднимает тревогу', () => {
  const w = scene(); fixedRng(w);
  const [p, c] = captive(w);
  c.x = w.camp.x + 40.5; c.y = w.camp.y + 30.5;   // the free one is far off
  const wolf = put(w, 'wolf', 'predators', p.x + 6, p.y); wolf.pack = wolf.id;
  lookRound(w);
  const f = flagOf(w);
  return (f && f.known?.[p.id] != null) || 'флага нет или пленный о нём не знает';
});

check('T115', 'пленный сохраняется и после загрузки живёт пленным', () => {
  const w = scene();   // (real streams: a fixed one is not what a save keeps)
  const [p] = captive(w);
  const c = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
  if (worldHash(c) !== worldHash(w)) return 'отпечаток после загрузки другой';
  const q = c.agents.find(o => o.id === p.id);
  if (!q?.captive || q.faction !== 'colony' || q.captive.bonds !== p.captive.bonds) return 'статус пленного не сохранился';
  for (let k = 0; k < 120; k++) step(c);
  return (!q.dead && q.captive && agentInZone(c, q)) || `после загрузки пленный ${q.dead ? 'умер' : agentInZone(c, q) ? '?' : 'ушёл за периметр'}`;
});


// ── stage 2: the will to run (settlement/escape.js)
// the evening council of a given day is over: the escape rolls are due
const councilOver = w => { w.tick = Math.floor(w.tick / DAY) * DAY + 21 * HOUR + 20; w.council.lastDay = Math.floor(w.tick / DAY); };
const rngAt = (w, v) => { w.rngs.colony = Object.assign(() => v, {state: 0}); };

check('T116', 'путы держат по материалу: мифрил лучше стали, сталь — железа, железо — бронзы, бронза — верёвки; вяжут лучшими', () => {
  const order = ['mithril', 'steel', 'iron', 'bronze', 'rope'].map(id => BONDS.get(id).hold);
  if (order.some((v, k) => k && v <= order[k - 1])) return `держат: ${order}`;
  if (bestBonds({rope: 4, shacklesSteel: 1})?.id !== 'steel') return 'со сталью и верёвкой вяжут не сталью';
  return bestBonds({rope: 1}) === null || 'одной верёвки хватило на пленного';
});

check('T117', 'совет: захотевший бежать начинает сговор, ночью бегут все несмирившиеся; смирившийся не бежит', () => {
  const w = scene(); fixedRng(w);
  const [p1, c] = captive(w);
  const [r2] = fallenRaider(w, w.camp.x + 2.5, w.camp.y + 2.5); w.stock.rope = 2; c.task = {id: 'bind', who: r2.id}; bindAll(w, c);
  const [r3] = fallenRaider(w, w.camp.x - 1.5, w.camp.y + 2.5); w.stock.rope = 2; c.task = {id: 'bind', who: r3.id}; bindAll(w, c);
  r3.captive.resigned = w.tick;
  p1.captive.will = 1; r2.captive.will = 0.3;
  w.stock.berries = 200;   // plenty of food: no cut ration
  councilOver(w); rngAt(w, 0.1); r3.captive.service = 0;
  // the resigned one does not tell (a roll above the informer's chance)
  const keep = w.rngs.colony; let k = 0; w.rngs.colony = Object.assign(() => (k++ < 2 ? 0.05 : 0.99), {state: 0});
  stepEscape(w);
  const plot = w.escape?.plot;
  if (!plot) return 'сговора нет';
  if (!plot.ids.includes(p1.id) || !plot.ids.includes(r2.id) || plot.ids.includes(r3.id)) return `в сговоре ${plot.ids}`;
  // the night after: they run
  w.tick = (Math.floor(w.tick / DAY) + 1) * DAY + 1.2 * HOUR; w.rngs.colony = keep;
  stepEscape(w);
  if (p1.faction !== 'fugitives' || r2.faction !== 'fugitives') return `бегут не все: ${p1.faction}, ${r2.faction}`;
  return r3.faction === 'colony' && !r3.fugitive || 'смирившийся бежит';
});

check('T118', 'донос: смирившийся выдаёт сговор — побега нет, зачинщику воля, доносчику очки службы', () => {
  const w = scene(); fixedRng(w);
  const [p1, c] = captive(w);
  const [r2] = fallenRaider(w, w.camp.x + 2.5, w.camp.y + 2.5); w.stock.rope = 2; c.task = {id: 'bind', who: r2.id}; bindAll(w, c);
  r2.captive.resigned = w.tick; p1.captive.will = 0.7; w.stock.berries = 200;
  councilOver(w); rngAt(w, 0.01);
  stepEscape(w);
  if (w.escape.plot) return 'сговор состоялся при доносе';
  if (!(p1.captive.will > 0.7)) return `воля зачинщика ${p1.captive.will}`;
  return (r2.captive.service || 0) > 0 || 'доносчику не засчитано';
});

check('T119', 'беглец бежит к краю медленнее в кандалах, чем в верёвке; добежал — ушёл', () => {
  const pace = bonds => {
    const w = scene(); fixedRng(w);
    const [p] = captive(w); p.captive.bonds = bonds;
    startEscape(w, p, 'plot');
    const x0 = p.x, y0 = p.y;
    for (let k = 0; k < 40; k++) { w.tick++; BRAINS.get(p.brain).step(w, p); }
    return Math.hypot(p.x - x0, p.y - y0);
  };
  const rope = pace('rope'), iron = pace('iron');
  if (!(rope > iron * 1.1)) return `в верёвке ${rope.toFixed(1)}, в кандалах ${iron.toFixed(1)} клеток`;
  const w = scene(); fixedRng(w);
  const [p] = captive(w);
  startEscape(w, p, 'plot');
  for (let k = 0; k < 4000 && !p.gone; k++) { w.tick++; BRAINS.get(p.brain).step(w, p); }
  return (p.gone && (w.chronicle.captives.escaped || 0) === 1) || 'беглец не ушёл за край';
});

check('T120', 'беглеца видят, на доске жёлтый флаг; кто догнал — хватает, и он снова в путах и злее', () => {
  const w = scene(); fixedRng(w);
  const [p, c] = captive(w);
  p.captive.will = 0.5;
  startEscape(w, p, 'plot');
  c.x = p.x + 3; c.y = p.y; c.mods.bravery = 1.5;
  lookRound(w);
  const f = flagOf(w);
  if (!f || f.kind !== 'escape' || f.red) return `флаг: ${f?.kind}, красный ${f?.red}`;
  c.think = 0; brain(w, c);
  if (!['answer', 'fight'].includes(c.task?.id)) return `за беглецом не пошли: ${c.task?.id}`;
  for (let k = 0; k < 200 && p.faction === 'fugitives'; k++) { w.tick++; brain(w, c); if (p.faction === 'fugitives') BRAINS.get(p.brain).step(w, p); }
  if (p.faction !== 'colony' || !p.captive || p.fugitive) return `беглец не пойман: ${p.faction}`;
  return p.captive.will > 0.5 || `воля пойманного ${p.captive.will}`;
});

check('T121', 'красная тревога: пленный бросает на побег один раз за тревогу, свои в налёте — охотнее', () => {
  const runs = kin => {
    let n = 0;
    for (let s = 0; s < 40; s++) {
      const w = scene('kin' + s);
      const [p] = captive(w); p.captive.will = 1;
      const [g] = band(w, 3, w.camp.x + 12.5, w.camp.y + 0.5);
      if (!kin) for (const o of g) o.species = 'orc';
      for (let k = 0; k < 3; k++) { w.tick++; stepEscape(w); }
      if (p.faction === 'fugitives') n++;
    }
    return n;
  };
  const kin = runs(true), other = runs(false);
  return kin > other || `бежали при своих ${kin}, при чужих ${other} из 40`;
});

check('T122', 'на ночь пленный сдаёт инструмент на склад и до рассвета его не берёт; утром берёт снова', () => {
  const w = scene(); fixedRng(w);
  const [p] = captive(w);
  w.armory = [newItem('ironaxe')]; w.tick = Math.floor(w.tick / DAY) * DAY + 12 * HOUR;
  outfit(w, p);
  if (!allItems(p).some(it => it.type === 'ironaxe')) return 'днём не взял топор';
  w.tick = Math.floor(w.tick / DAY) * DAY + 22 * HOUR;
  if (!toolsAway(w)) return 'ночь не ночь';
  stepEscape(w);
  if (allItems(p).some(it => it.type === 'ironaxe') || !w.armory.some(it => it.type === 'ironaxe')) return 'топор не сдан';
  outfit(w, p);
  if (allItems(p).some(it => it.type === 'ironaxe')) return 'ночью снова взял топор';
  w.tick = (Math.floor(w.tick / DAY) + 1) * DAY + 7 * HOUR;
  outfit(w, p);
  return allItems(p).some(it => it.type === 'ironaxe') || 'утром топор не взял';
});

check('T123', 'паёк: мало еды — совет урезает паёк пленным; едят меньше, работают медленнее, воля растёт к утру', () => {
  const w = scene(); fixedRng(w);
  const [p] = captive(w);
  for (const r of RESOURCES.filter(r => r.tags.includes('food'))) w.stock[r.id] = 0;
  const hunger = p.mods.hunger, work = p.mods.work, will = p.captive.will ?? ESCAPE.will.start;
  councilOver(w); rngAt(w, 0.99);
  stepEscape(w);
  if (!w.escape.cut || !p.captive.cut) return 'паёк не урезан';
  if (!(p.mods.hunger < hunger) || !(p.mods.work < work)) return `голод ${hunger}→${p.mods.hunger}, работа ${work}→${p.mods.work}`;
  w.tick = (Math.floor(w.tick / DAY) + 1) * DAY + 6.5 * HOUR; p.needs.food = 0.7;
  stepEscape(w);
  if (!(p.captive.will > will)) return `воля ${will} → ${p.captive.will}`;
  w.stock.berries = 200; councilOver(w); stepEscape(w);
  return (!p.captive.cut && Math.abs(p.mods.hunger - hunger) < 1e-9) || 'полный паёк не вернули';
});


// ── stage 3: masters and their learners (settlement/masters.js)
const crafter = (w, x, y, skill, v) => { const a = put(w, 'human', 'colony', x, y); a.skill[skill] = v; return a; };
// a master at the forge: on its job, with the work just read
const atForge = (w, m) => { m.task = {id: 'job', job: 'smith'}; m.master.workedAt = w.tick; };

check('T124', 'совет нарекает мастера: лучший свободный с навыком от порога, по одному на ремесло; пленного и слабого — нет', () => {
  const w = scene(); fixedRng(w);
  const [p] = captive(w); p.skill.smithing = 0.9;
  const a = crafter(w, 30.5, 30.5, 'smithing', 0.6), b = crafter(w, 31.5, 30.5, 'smithing', 0.5), c = crafter(w, 32.5, 30.5, 'fishing', MASTER.min - 0.05);
  councilOver(w); stepMasters(w);
  if (p.master) return 'пленный назван мастером';
  if (a.master?.skill !== 'smithing' || b.master) return `мастер-кузнец: ${a.master?.skill}, второй ${b.master?.skill}`;
  if (c.master) return 'назван мастером ниже порога';
  councilOver(w); w.tick += DAY; w.council.lastDay = Math.floor(w.tick / DAY); stepMasters(w);
  return (!b.master && masterOf(w, 'smithing') === a) || 'второй кузнец при живом мастере';
});

check('T125', 'ученик мастера: свободный идёт к мастеру за работой, мест два, третьему нет', () => {
  const w = scene(); fixedRng(w);
  const m = crafter(w, 30.5, 30.5, 'smithing', 0.7); m.master = {skill: 'smithing', since: 0}; atForge(w, m);
  const ls = [0, 1, 2].map(k => crafter(w, 33.5 + k, 30.5, 'smithing', 0.1));
  if (assistOption(w, m)) return 'мастер — ученик самому себе';
  const o = assistOption(w, ls[0]);
  if (o?.[0].id !== 'assist' || o[0].master !== m.id) return 'к мастеру за работой не идут';
  ls[0].task = o[0]; ls[1].task = {...assistOption(w, ls[1])[0]}; w.tick++;
  if (assistOption(w, ls[2])) return 'третий взял место при двух занятых';
  m.task = {id: 'idle'}; w.tick++;
  return !assistOption(w, crafter(w, 40.5, 30.5, 'smithing', 0.1)) || 'идут к мастеру, который не работает';
});

check('T126', 'свои ученики прежде пленных: свободный занимает место пленного, тот остаётся без места', () => {
  const w = scene(); fixedRng(w);
  const m = crafter(w, w.camp.x + 0.5, w.camp.y + 0.5, 'smithing', 0.7); m.master = {skill: 'smithing', since: 0}; atForge(w, m);
  const [p1, c] = captive(w, true);
  const [r2] = fallenRaider(w, w.camp.x + 2.5, w.camp.y + 2.5); w.stock.rope = 2; c.task = {id: 'bind', who: r2.id}; bindAll(w, c); r2.hp = maxHp(r2);
  atForge(w, m);
  p1.task = assistOption(w, p1)?.[0]; w.tick++; atForge(w, m);
  r2.task = assistOption(w, r2)?.[0]; w.tick++; atForge(w, m);
  if (p1.task?.id !== 'assist' || r2.task?.id !== 'assist') return `пленные не взяли места: ${p1.task?.id}, ${r2.task?.id}`;
  const f = crafter(w, w.camp.x + 1.5, w.camp.y + 0.5, 'smithing', 0.1);
  const o = assistOption(w, f);
  if (!o) return 'свободному не нашлось места при двух пленных';
  f.task = o[0]; w.tick++;
  if (placeOf(w, f) !== 0) return `свободный не первый: место ${placeOf(w, f)}`;
  return [p1, r2].some(x => placeOf(w, x) === -1) || 'оба пленных при местах сверх мест';
});

check('T127', 'при учениках мастер работает быстрее; ученик учится, только пока мастер работает рядом', () => {
  const w = scene(); fixedRng(w);
  const m = crafter(w, 30.5, 30.5, 'smithing', 0.7); m.master = {skill: 'smithing', since: 0}; atForge(w, m);
  const solo = workRate(w, m, 'smith');
  const l1 = crafter(w, 31.5, 30.5, 'smithing', 0.1), l2 = crafter(w, 30.5, 31.5, 'smithing', 0.1);
  l1.task = assistOption(w, l1)[0]; w.tick++; l2.task = assistOption(w, l2)[0]; w.tick++;
  const both = workRate(w, m, 'smith'), k = both / solo;
  if (Math.abs(k - (1 + MASTER.bonus[0] + MASTER.bonus[1])) > 1e-6) return `с двумя учениками ×${k.toFixed(3)}`;
  if (apprenticeBonus(w, m, 'chop')) return 'ученики ускоряют чужое ремесло';
  const s0 = l1.skill.smithing;
  m.master.workedAt = w.tick; stepMasters(w);
  if (!(l1.skill.smithing > s0)) return 'ученик не учится, пока мастер работает';
  const s1 = l1.skill.smithing; w.tick += 5; stepMasters(w);
  if (l1.skill.smithing !== s1) return 'ученик учится, пока мастер не работает';
  l2.x = 40.5; m.master.workedAt = w.tick; const s2 = l2.skill.smithing; stepMasters(w);
  return l2.skill.smithing === s2 || 'ученик учится вдали от мастера';
});

check('T128', 'пленный учится только при мастере, что работает в лагере, и только когда своя вакансия не тянет сильнее', () => {
  const w = scene(); fixedRng(w);
  const [p] = captive(w, true);
  const wood = crafter(w, w.camp.x + 1.5, w.camp.y + 0.5, 'woodcutting', 0.7); wood.master = {skill: 'woodcutting', since: 0}; wood.task = {id: 'job', job: 'chop'};
  if (assistOption(w, p)) return 'пленный идёт за лесорубом в лес';
  const sm = crafter(w, w.camp.x + 0.5, w.camp.y + 1.5, 'smithing', 0.7); sm.master = {skill: 'smithing', since: 0}; atForge(w, sm); w.tick++; atForge(w, sm);
  const o = assistOption(w, p);
  if (o?.[0].master !== sm.id) return 'пленный не идёт к кузнецу в лагере';
  const free = assistOption(w, crafter(w, w.camp.x + 2.5, w.camp.y + 1.5, 'smithing', 0.1));
  return (o[1] < free[1] && o[1] < PLAN.open[0] + PLAN.open[1]) || `вес пленного ${o[1].toFixed(2)}, свободного ${free[1].toFixed(2)}`;
});

check('T129', 'пленный при мастере за работой копит очки службы', () => {
  const w = scene(); fixedRng(w);
  const [p] = captive(w, true); p.captive.service = 0;
  const sm = crafter(w, p.x + 0.5, p.y, 'smithing', 0.7); sm.master = {skill: 'smithing', since: 0}; atForge(w, sm);
  p.task = assistOption(w, p)[0]; w.tick++;
  for (let k = 0; k < 600; k++) { sm.master.workedAt = w.tick; stepMasters(w); w.tick++; }
  return p.captive.service > 0.5 || `очков службы за день работы: ${p.captive.service.toFixed(2)}`;
});


// ── stage 4: former slaves (settlement/freedom.js)
// a resigned captive who served a master, the master at hand
function served(w, service = FREEDOM.free) {
  const [p] = captive(w, true);
  const m = crafter(w, p.x + 1, p.y, 'smithing', 0.7); m.master = {skill: 'smithing', since: 0};
  p.captive.resigned = w.tick; p.captive.service = service; p.captive.teacher = m.id;
  return [p, m];
}

check('T130', 'совет снимает путы со смирившегося, отслужившего при мастере, когда мастер ручается; кандалы — на склад', () => {
  const w = scene(); fixedRng(w);
  const [p, m] = served(w, FREEDOM.free - 0.5); p.captive.bonds = 'iron';
  councilOver(w); stepFreedom(w);
  if (!p.captive || p.former) return 'освобождён, не отслужив';
  p.captive.service = FREEDOM.free; m.master = null;
  councilOver(w); w.tick += DAY; w.council.lastDay = Math.floor(w.tick / DAY); stepFreedom(w);
  if (!p.captive) return 'освобождён без мастера, который поручится';
  m.master = {skill: 'smithing', since: 0}; w.stock.shacklesIron = 0;
  w.tick += DAY; w.council.lastDay = Math.floor(w.tick / DAY); stepFreedom(w);
  if (p.captive || !p.former) return 'не освобождён: отслужил, мастер есть';
  return w.stock.shacklesIron === 1 || `кандалы на складе: ${w.stock.shacklesIron}`;
});

check('T131', 'бывший раб ходит на работы за периметром, но без оружия и доспеха, без флагов, дозора и совета', () => {
  const w = scene(); fixedRng(w);
  const [p] = served(w); freeCaptive(w, p, null);
  if (!formerAllows({id: 'job', job: 'chop'}) || !formerAllows({id: 'fight', reflex: true})) return 'бывшему рабу нельзя за лес или отбиться';
  for (const t of [{id: 'council'}, {id: 'watch'}, {id: 'answer', flag: 'x'}, {id: 'fight', target: null}, {id: 'trade'}]) if (formerAllows(t)) return `бывшему рабу можно «${t.id}»`;
  w.armory = [newItem('sword'), newItem('lamellar'), newItem('ironaxe')]; w.tick = Math.floor(w.tick / DAY) * DAY + 12 * HOUR;
  outfit(w, p);
  const has = allItems(p).map(it => it.type);
  if (has.includes('sword') || has.includes('lamellar') || !has.includes('ironaxe')) return `бывший раб взял: ${has}`;
  p.x = w.camp.x + 30.5; p.task = {id: 'job', job: 'chop'}; p.think = 50; brain(w, p);
  return p.task?.id !== 'runHome' || 'бывшего раба гонят назад за периметр';
});

check('T132', 'связь бывшего раба: голод её точит, слабая — уходит на совете', () => {
  const w = scene(); fixedRng(w);
  const [p] = served(w); freeCaptive(w, p, null);
  const b0 = p.former.bond;
  p.needs.food = 0.1; w.tick = (Math.floor(w.tick / DAY) + 1) * DAY + 6.5 * HOUR; stepFreedom(w);
  if (!(p.former.bond < b0)) return `связь голодного ${b0} → ${p.former.bond}`;
  p.former.bond = 0.05; rngAt(w, 0.01);
  councilOver(w); stepFreedom(w);
  return p.faction === 'leavers' || `со слабой связью не ушёл: ${p.faction}`;
});

check('T133', 'бывший раб, бившийся в налёте, — на совете полноправный член', () => {
  const w = scene(); fixedRng(w);
  const [p] = served(w); freeCaptive(w, p, null);
  const [g] = band(w, 2, p.x + 3, p.y);
  p.task = {id: 'fight', target: g[0], reflex: true};
  w.tick++; stepFreedom(w);
  if (!p.former.fought) return 'бой в налёте не замечен';
  for (const o of g) kill(w, o, 'ран'); w.agents = w.agents.filter(o => !o.dead);
  councilOver(w); stepFreedom(w);
  return (!p.former && !p.captive && p.faction === 'colony') || 'не принят в члены';
});


// ── stage 5: the trade in captives (data/slavery.js, settlement/slavery.js, campaign/slavery.js)
check('T134', 'цена пленного: смирившийся дороже, буйный дешевле; здоровье, Сила и ремесло — дороже', () => {
  const p = o => captivePrice({hp: 1, S: 5, will: 0.4, ...o});
  if (!(p({resigned: true}) > p({}) && p({}) > p({will: 0.8}))) return `смирившийся ${p({resigned: true})}, обычный ${p({})}, буйный ${p({will: 0.8})}`;
  if (!(p({hp: 1}) > p({hp: 0.3}))) return 'раненый не дешевле';
  if (!(p({S: 8}) > p({S: 3}))) return 'сильный не дороже';
  return p({skill: {smithing: 0.6}}) > p({}) || 'умелый не дороже';
});

check('T135', 'закон: у эльфов не торгуют, у гномов терпят — продажа портит отношения державы, у людей — свободно', () => {
  if (lawOf('elves').law !== 'banned' || lawOf('dwarves').law !== 'frowned' || lawOf('humans').law !== 'legal') return 'законы не те';
  const make = () => {
    const m = {id: 1, name: 'Гнырк', gender: 'm', race: 'goblin', role: 'captive', alive: true, hp: 1, special: {S: 5}, gear: {hand: [], body: 'clothes'},
      captive: {since: 0, bonds: 'rope', will: 0.9}};
    const f = {id: 2, name: 'Любава', gender: 'f', race: 'human', role: 'former', alive: true, hp: 1, loyalty: 0.7, former: {since: 0}, gear: {hand: [], body: 'clothes'}};
    const K = {members: [m, f], cargo: {}, food: 100, gold: 0, stats: {}, rng: {}, seed: 't', day: 10, realm: 1, beasts: [], vehicles: []};
    const a = {hist: {year: 1}, rel: {'1:2': {att: 1}}};
    return {K, a, m, f};
  };
  const e = make(); tradeCaptives(e.a, e.K, {people: 'elves', realm: 2}, 'friend');
  if (!e.m.alive || e.K.gold) return 'у эльфов продали пленного';
  const d = make(); tradeCaptives(d.a, d.K, {people: 'dwarves', realm: 2}, 'friend');
  if (d.m.alive || !(d.K.gold > 0)) return 'у гномов буйного не продали';
  if (!(d.a.rel['1:2'].att < 1)) return 'продажа у гномов не задела отношения державы';
  if (!(d.f.loyalty < 0.7)) return 'бывший раб не огорчён продажей';
  const h = make(); tradeCaptives(h.a, h.K, {people: 'humans', realm: 2}, 'friend');
  return (!h.m.alive && h.a.rel['1:2'].att === 1) || 'у людей продажа задела отношения или не случилась';
});

check('T136', 'поселение продаёт торговцу буйного пленного, смирившегося — только в голод, отслужившего — никогда; остальным пленным страшнее', () => {
  const w = scene(); fixedRng(w);
  const [p1, c] = captive(w, true);
  const [r2] = fallenRaider(w, w.camp.x + 2.5, w.camp.y + 2.5); w.stock.rope = 2; c.task = {id: 'bind', who: r2.id}; bindAll(w, c);
  const [r3] = fallenRaider(w, w.camp.x - 1.5, w.camp.y + 2.5); w.stock.rope = 2; c.task = {id: 'bind', who: r3.id}; bindAll(w, c);
  p1.captive.will = 0.9; r2.captive.will = 0.3; r2.captive.resigned = w.tick; r3.captive.will = 0.9; r3.captive.service = SLAVE.sell.service;
  w.stock.berries = 300;
  const sale = forSale(w);
  if (!sale.includes(p1) || sale.includes(r2) || sale.includes(r3)) return `на продажу: ${sale.map(a => a.name)}`;
  const car = {name: 'Гай', purse: 100}, deal = {sold: [], bought: [], earned: 0, spent: 0};
  const will3 = r3.captive.will; r3.captive.will = 0.5;
  sellCaptives(w, car, deal, (list, label, n, gold) => list.push([label, n, gold]));
  if (!p1.gone || !p1.sold || !(w.stock.gold > 0) || !(car.purse < 100)) return 'буйного не продали';
  if (!(r3.captive.will > 0.5)) return 'оставшимся пленным не страшнее';
  for (const f of RESOURCES.filter(r => r.tags.includes('food'))) w.stock[f.id] = 0;
  return (forSale(w).includes(r2) && !forSale(w).includes(r3)) || 'в голод смирившегося не продают или продают отслужившего';
});

check('T137', 'поселение покупает у торговца пленного, когда есть путы и золото; без пут — нет', () => {
  const w = scene(); fixedRng(w);
  put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5);
  const deal = () => ({sold: [], bought: [], earned: 0, spent: 0}), note = (list, label, n, gold) => list.push([label, n, gold]);
  let gold = 200; const cash = () => gold, spend = p => { if (gold < p) return false; gold -= p; return true; };
  w.stock.rope = 0; w.stock.shacklesIron = 0; w.stock.shacklesBronze = 0;
  const car = {name: 'Гай', purse: 50, captive: {race: 'orc'}};
  buyCaptive(w, car, deal(), note, cash, spend, null);
  if (captives(w).length || gold !== 200) return 'купили без пут';
  w.stock.shacklesIron = 1;
  buyCaptive(w, car, deal(), note, cash, spend, null);
  const got = captives(w);
  if (got.length !== 1 || got[0].species !== 'orc' || got[0].captive.bonds !== 'iron' || w.stock.shacklesIron !== 0) return `куплено: ${got.length}, путы ${got[0]?.captive?.bonds}`;
  return (gold < 200 && !car.captive) || 'не заплатили или торговец не отдал';
});


// ── fixes from the code review of 21.10 (captives)
check('T138', 'беглеца поймал один — второй преследователь бросает погоню и не бьёт пойманного', () => {
  const w = scene(); fixedRng(w);
  const [p, c] = captive(w, true);
  startEscape(w, p, 'plot');
  const b = put(w, 'human', 'colony', p.x + 0.8, p.y); outfit(w, b);
  c.x = p.x - 0.8; c.y = p.y;
  b.task = {id: 'fight', target: p}; c.task = {id: 'fight', target: p};
  syncTask(w, c); TASKS.get('fight').step(w, c, c.task); syncTask(w, c);
  if (p.faction !== 'colony') return 'первый не поймал';
  const hp = p.hp;
  for (let k = 0; k < 30; k++) { if (!b.task) break; syncTask(w, b); TASKS.get(b.task.id).step(w, b, b.task); syncTask(w, b); b.cd = 0; w.tick++; }
  if (p.hp < hp) return `пойманного били: ${hp.toFixed(2)} → ${p.hp.toFixed(2)}`;
  return b.task?.id !== 'fight' || 'второй всё ещё дерётся с пойманным';
});

check('T139', 'ученик уходит от мастера, бросившего ремесло, и не учится, пока мастер занят другим', () => {
  const w = scene(); fixedRng(w);
  const m = crafter(w, 30.5, 30.5, 'smithing', 0.7); m.master = {skill: 'smithing', since: 0}; atForge(w, m);
  const l = crafter(w, 31.5, 30.5, 'smithing', 0.1);
  l.task = assistOption(w, l)[0]; w.tick++;
  m.task = {id: 'job', job: 'chop'}; m.master.workedAt = w.tick;   // working, but not at the forge
  const s0 = l.skill.smithing; stepMasters(w);
  if (l.skill.smithing !== s0) return 'ученик кузнеца учится, пока мастер рубит лес';
  syncTask(w, l); TASKS.get('assist').step(w, l, l.task); syncTask(w, l);
  return l.task?.id !== 'assist' || 'ученик ходит за мастером, бросившим ремесло';
});

check('T140', 'беглец погиб в бегах: путы пропали с ним, в летописи — причина', () => {
  const w = scene(); fixedRng(w);
  const [p] = captive(w, true); p.captive.bonds = 'iron'; w.stock.shacklesIron = 0;
  startEscape(w, p, 'plot');
  kill(w, p, 'ран');
  if (w.stock.shacklesIron !== 0) return 'кандалы беглеца вернулись на склад';
  const r = w.chronicle.people.find(x => x.id === p.id);
  return (r?.cause && /в бегах/.test(r.cause)) || `в летописи: ${r?.cause}`;
});

let bad = 0;
// ── the smith's mark (data/balance/marks.js, docs/TABLE.md этап 5)
const hitWith = (w, a, t, kit) => {
  a.equip.right = kit.right ? newItem(kit.right.type, kit.right) : null; a.equip.body = null; recalcGear(a);
  t.equip && (t.equip.body = kit.body ? newItem(kit.body.type, kit.body) : null); t.equip && recalcGear(t);
  t.hp = 50; damage(w, a, t, 1, {type: a.gear.melee.type, mix: a.gear.melee.mix || null}); return 50 - t.hp;
};
check('T141', 'гномий меч рубит и дробит: скелету он страшнее простого меча; эльфийское копьё колет сильнее простого', () => {
  const w = scene(); fixedRng(w, 0.99);
  const a = put(w, 'human', 'colony', 30.5, 30.5), s = put(w, 'skeleton', 'raiders', 31.5, 30.5), h = put(w, 'human', 'raiders', 31.5, 31.5);
  const plain = hitWith(w, a, s, {right: {type: 'sword'}}), dwarf = hitWith(w, a, s, {right: {type: 'sword', mark: 'dwarf'}});
  if (!(dwarf > plain * 1.2)) return `скелету: простой меч ${plain.toFixed(3)}, гномий ${dwarf.toFixed(3)}`;
  if (!a.gear.melee.mix || a.gear.melee.mix[0][0] !== 'slash') return 'гномий меч перестал быть рубящим';
  // its own kind: the blow itself is stronger (the damage of a blow is weapon × the rest: combat.js attack)
  a.equip.right = newItem('ironspear'); recalcGear(a); const sp = a.gear.melee.dmg;
  a.equip.right = newItem('ironspear', {mark: 'elf'}); recalcGear(a); const el = a.gear.melee.dmg;
  if (a.gear.melee.mix) return 'эльфийское копьё смешивает удар, хотя колет своим';
  return Math.abs(el / sp - 1.25) < 1e-6 || `копьё: простое ${sp.toFixed(3)}, эльфийское ${el.toFixed(3)} (нужно ×1,25)`;
});
check('T142', 'орочья кольчуга держит рубящий удар лучше простой, против дробящего — как простая', () => {
  const w = scene(); fixedRng(w, 0.99);
  const a = put(w, 'human', 'raiders', 30.5, 30.5), t = put(w, 'human', 'colony', 31.5, 30.5);
  const cut = hitWith(w, a, t, {right: {type: 'sword'}, body: {type: 'chainmail'}}), cutOrc = hitWith(w, a, t, {right: {type: 'sword'}, body: {type: 'chainmail', mark: 'orc'}});
  const bash = hitWith(w, a, t, {right: {type: 'ironmace'}, body: {type: 'chainmail'}}), bashOrc = hitWith(w, a, t, {right: {type: 'ironmace'}, body: {type: 'chainmail', mark: 'orc'}});
  if (!(cutOrc < cut)) return `рубящий: простая ${cut.toFixed(3)}, орочья ${cutOrc.toFixed(3)}`;
  return Math.abs(bash - bashOrc) < 1e-9 || `дробящий: простая ${bash.toFixed(3)}, орочья ${bashOrc.toFixed(3)}`;
});
check('T143', 'клеймо входит в цену и в коэффициент силы', () => {
  const w = scene(); fixedRng(w);
  const a = put(w, 'human', 'colony', 30.5, 30.5);
  a.equip.right = newItem('sword'); recalcGear(a); const s0 = strengthOf(a);
  a.equip.right = newItem('sword', {mark: 'dwarf'}); recalcGear(a); const s1 = strengthOf(a);
  if (!(s1 > s0)) return `КС: простой меч ${s0.toFixed(1)}, гномий ${s1.toFixed(1)}`;
  return itemPrice('sword', 0, false, 'dwarf') > itemPrice('sword') || 'клеймо не дороже простого';
});

for (const [id, what, err] of results) { console.log(`${err ? 'FAIL' : 'ok  '} ${id} ${what}${err ? ' — ' + err : ''}`); if (err) bad++; }
if (bad) process.exit(1);
