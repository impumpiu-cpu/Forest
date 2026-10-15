// Logic check: the rules every creature must keep, in small staged scenes (T01–T11 of the outside
// review of the races branch; T12–T17 reservations and the task lifecycle; T18–T22 raider squads;
// T23–T26 joint actions of colonists;
// T27–T31 carcasses and pack hunts; T32–T39 SPECIAL stage 1: skills, practice, the body;
// T40–T46 SPECIAL stage 2: tiers at the forge and the worker in choosing an order). Each scene builds a flat, empty map, places a few agents by hand and
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
import {clearLine} from '../src/nav/astar.js';
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
import {freeCorpse} from '../src/settlement/life.js';
import {createSquad, stepSquads, planFor, ROLES} from '../src/agents/squad.js';
import {kill} from '../src/agents/agent.js';
import {outsideRisk, escortOption, aidOption, TOGETHER} from '../src/settlement/together.js';
import {stepRelations, REL} from '../src/settlement/relations.js';
import {startHunt, stepHunts, huntAim, dropCarcass, stepCarcasses, CARCASS} from '../src/agents/carcass.js';
import {DAY, HOUR, nightness} from '../src/core/time.js';
import {newItem, outfit, recalcGear} from '../src/agents/equipment.js';
import {refreshBody, adoptBody} from '../src/agents/special.js';
import {practice, practiceGain, softCap, skillTier, migrateSkills, recipeAccess, canMake} from '../src/agents/skills.js';
import {workRate} from '../src/agents/jobRunners.js';
import {shoot} from '../src/agents/combat.js';
import {recipeSkill, isActive} from '../src/data/skills.js';
import {RECIPES} from '../src/data/recipes.js';
import {JOBS} from '../src/data/jobs.js';

// a flat grass map with nobody on it; the camp stays where it was generated
function scene(seed = 'logic') {
  const w = newGame({...DEFAULT_CFG, seed, size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  w.agents = [];
  const g = w.grid;
  for (let i = 0; i < w.w * w.h; i++) { g.terr[i] = T.GRASS; g.temp[i] = 20; g.fire[i] = 0; g.smoke[i] = 0; g.wood[i] = 0; g.lake && (g.lake[i] = -1); }
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
  w.grid.temp[cellOf(w, s)] = 100;
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
  while (!(nightness(w.tick) > 0.7 && w.tick % 60 === 0)) w.tick++;   // deep night, on a carcass check
  stepCarcasses(w);
  return w.agents.some(o => o.species === 'upyr') || 'упырь не поднялся';
});

// ── SPECIAL stage 1: skills apart from jobs, practice from real work, a body rebuilt from its sources
const human = (w, special = {}) => { const a = put(w, 'human', 'colony', 30.5, 30.5); Object.assign(a.special, special); refreshBody(a); a.hp = maxHp(a); return a; };
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
  practice(a, 'alchemy', 1000); practice(a, 'melee', 1000);
  if (a.skill.alchemy || a.skill.melee) return 'резервный навык вырос';
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

let bad = 0;
for (const [id, what, err] of results) { console.log(`${err ? 'FAIL' : 'ok  '} ${id} ${what}${err ? ' — ' + err : ''}`); if (err) bad++; }
if (bad) process.exit(1);
