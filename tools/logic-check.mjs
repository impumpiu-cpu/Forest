// Logic check: the rules every creature must keep, in small staged scenes (T01–T11 of the outside
// review of the races branch). Each scene builds a flat, empty map, places a few agents by hand and
// runs one brain or task, then checks what must hold: no blow from afar, no wood eaten, no fight with
// what cannot be seen, no step through a rock corner… Part of `npm test`.
// Usage: node tools/logic-check.mjs
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent} from '../src/agents/agent.js';
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
const fixedRng = w => { w.rng = Object.assign(() => 0.5, {state: w.rng.state}); };

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

let bad = 0;
for (const [id, what, err] of results) { console.log(`${err ? 'FAIL' : 'ok  '} ${id} ${what}${err ? ' — ' + err : ''}`); if (err) bad++; }
if (bad) process.exit(1);
