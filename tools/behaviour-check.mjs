// The behaviour range (docs/BEHAVIOUR.md): scenes on a small flat map where one behaviour at a time is put to the
// test — a hare and a man, a herd and a wolf, a hungry pack and game, a starving pack and a lone colonist at dusk.
// Each scene runs the whole simulation (sim.js step) for a while and asserts what came of it, so a behaviour
// reworked on its own can be tried in seconds. Usage: node tools/behaviour-check.mjs [scene id]
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent} from '../src/agents/agent.js';
import {T} from '../src/data/terrain.js';
import {DAY, HOUR} from '../src/core/time.js';
import {herdOf} from '../src/agents/wildHerd.js';
import {huntOf} from '../src/agents/carcass.js';
import {heatTo} from '../src/world/heat.js';
import {agentInZone} from '../src/settlement/zone.js';
import {BEHAVIOURS} from '../src/data/behaviours.js';
import {ACTS} from '../src/agents/behaviours/index.js';
import {SPECIES} from '../src/data/species.js';
import {season} from '../src/data/seasons.js';

// a flat meadow with the camp in the middle, no colonists, nothing arriving from outside; `hour` sets the clock
const put = (w, sp, fac, x, y) => createAgent(w, sp, fac, x, y);
function scene(seed = 'range', hour = 10) {
  const w = newGame({...DEFAULT_CFG, seed, size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off', spirits: false});
  w.agents = [];
  const g = w.grid;
  for (let i = 0; i < w.w * w.h; i++) { g.terr[i] = T.GRASS; g.heat[i] = 0; g.fire[i] = 0; g.smoke[i] = 0; g.wood[i] = 0; g.food[i] = 0.5; g.fert[i] = 0.5; g.lake && (g.lake[i] = -1); }
  w.lakes = [];
  w.tick = 3 * DAY + hour * HOUR;
  w.nav.buildAll();
  for (const k of Object.keys(w.outside.next)) w.outside.next[k] = Infinity;   // nobody comes from beyond the edge during a scene
  w.outside.soon = Infinity;
  // one settler by the fire who never moves, so that the settlement stands (settlement/ending.js) and the zone is a zone
  still(put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5));
  return w;
}
// a creature that only stands where it is: a prop of the scene
const still = a => { a.brain = 'caravan'; a.task = {id: 'camped'}; return a; };
const pack = (w, n, x, y, food) => Array.from({length: n}, (_, k) => { const o = put(w, 'wolf', 'predators', x + k * 0.8, y); o.pack = o.id - k; o.stamina = 1; o.needs.food = food; return o; });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const run = (w, n, until) => { for (let k = 0; k < n; k++) { step(w); if (until?.()) return k + 1; } return until ? false : n; };
const alive = o => !o.dead && !o.gone;

const scenes = [];
const scene_ = (id, what, fn) => scenes.push([id, what, fn]);

scene_('B01', 'заяц бежит от человека и возвращается к траве, когда тот ушёл', () => {
  const w = scene();
  const hare = put(w, 'hare', 'wild', 30.5, 30.5), man = still(put(w, 'human', 'colony', 33.5, 30.5));
  const d0 = dist(hare, man);
  const t = run(w, 40, () => hare.task?.id === 'bolt');
  if (!t) return `за 40 тиков не побежал: «${hare.task?.id}»`;
  run(w, 30);
  if (!(dist(hare, man) > d0 + 2)) return `убегая, не отдалился: ${d0.toFixed(1)} → ${dist(hare, man).toFixed(1)}`;
  man.dead = true;
  const back = run(w, 60, () => hare.task?.id === 'graze');
  return back || `человек исчез, а заяц через 60 тиков всё ещё «${hare.task?.id}»`;
});

scene_('B02', 'стадо оленей: волк рядом — тревога стада, часть бежит, часть насторожилась; никто не пасётся рядом с волком', () => {
  const w = scene();
  const deer = Array.from({length: 6}, (_, k) => put(w, 'deer', 'wild', 40 + (k % 3) * 1.5, 30 + (k / 3 | 0) * 1.5));
  run(w, 5);
  if (!deer.every(d => herdOf(w, d) && herdOf(w, d) === herdOf(w, deer[0]))) return 'олени не собрались в одно стадо';
  const wolf = still(put(w, 'wolf', 'predators', 44.5, 31.5)); wolf.pack = wolf.id; wolf.needs.food = 1;   // a wolf that only stands there
  const t = run(w, 60, () => deer.some(d => d.task?.id === 'bolt'));
  if (!t) return 'за 60 тиков ни один олень не побежал';
  const near = deer.filter(d => dist(d, wolf) < 3 && d.task?.id === 'graze');
  return !near.length || `пасутся в 3 клетках от волка: ${near.length}`;
});

scene_('B03', 'голодная стая и зайцы: охота стаей начинается, добыча взята, стая ест тушу', () => {
  const w = scene();
  const wolves = pack(w, 3, 20.5, 20.5, 0.4);
  for (let k = 0; k < 6; k++) put(w, 'hare', 'wild', 34 + k * 1.3, 18 + (k % 2) * 3);
  const started = run(w, 300, () => wolves.some(o => o.task?.id === 'chase' && huntOf(w, o)));
  if (!started) return `за 300 тиков охота не началась: ${wolves.map(o => o.task?.id).join(', ')}`;
  const fed = run(w, 900, () => wolves.some(o => o.task?.id === 'feed'));
  if (!fed) return `за 900 тиков никто не сел есть; охот ${w.behave.hunts.started}, добыто ${w.stats.wolfKills}`;
  if (!(w.stats.wolfKills >= 1)) return 'сели есть без добычи';
  return w.behave.hunts.kill >= 1 || `исходы охот: ${JSON.stringify(w.behave.hunts)}`;
});

scene_('B04', 'сытая стая не гонит зайца вдали, но берёт того, что под носом', () => {
  const w = scene();
  const wolves = pack(w, 2, 20.5, 20.5, 0.95);
  put(w, 'hare', 'wild', 40.5, 20.5);   // 20 cells off: beyond `obvious`
  if (run(w, 150, () => wolves.some(o => o.task?.id === 'chase'))) return 'сытый волк погнался за зайцем в 20 клетках';
  const near = put(w, 'hare', 'wild', wolves[0].x + 3, wolves[0].y);
  const t = run(w, 60, () => wolves.some(o => o.task?.id === 'chase' && o.task.target === near));
  return t || 'заяц в 3 клетках остался без внимания';
});

scene_('B05', 'голодная стая в сумерках бросается на одинокого поселенца вдали от лагеря; подошли трое — отступает', () => {
  const w = scene('range', 20);   // dusk
  const wolves = pack(w, 3, 70.5, 50.5, 0.3);   // hungry, not desperate: desperate wolves take on a pair and back off from four
  const lone = still(put(w, 'human', 'colony', 76.5, 52.5));
  if (agentInZone(w, lone)) return 'сцена: поселенец оказался в зоне поселения';
  const t = run(w, 200, () => wolves.some(o => o.task?.id === 'maul' && o.task.target === lone));
  if (!t) return `за 200 тиков не напали: ${wolves.map(o => `${o.task?.id}${o.why ? ' (' + o.why.why + ')' : ''}`).join(', ')}`;
  if (!w.stats.wolfAttacks) return 'задача maul есть, а нападение не сосчитано';
  // help arrives: three more colonists at the victim's side
  for (const dx of [0.8, -0.8, 0]) still(put(w, 'human', 'colony', lone.x + dx, lone.y + 0.8));
  const off = run(w, 30, () => wolves.every(o => o.task?.id !== 'maul'));
  if (!off) return 'при троих подошедших волки не отступили за 30 тиков';
  return (w.behave.hunts.help || 0) >= 1 || `исходы: ${JSON.stringify(w.behave.hunts)}`;
});

scene_('B06', 'огонь под ногами гонит волка; зона поселения держит его на расстоянии', () => {
  const w = scene();
  const [wolf] = pack(w, 1, 30.5, 30.5, 0.9);
  const i = (30 * w.w) + 31; w.grid.fire[i] = 0.8; heatTo(w, i, 300); w.nav.dirty('fire'); w.nav.dirty('safe');
  const t = run(w, 10, () => wolf.task?.id === 'bolt' && wolf.task.mode === 'fire');
  if (!t) return `не бежит от огня: «${wolf.task?.id}»`;
  w.grid.fire[i] = 0; w.grid.heat[i] = 0;
  // the settlement zone: a wolf dropped at the camp's edge walks out of it
  wolf.x = w.camp.x + 2.5; wolf.y = w.camp.y + 0.5;
  const z0 = w.nav.get('zone')[(wolf.y | 0) * w.w + (wolf.x | 0)];
  run(w, 60);
  const z1 = w.nav.get('zone')[(wolf.y | 0) * w.w + (wolf.x | 0)];
  return z1 > z0 || `от зоны не отошёл: ${z0} → ${z1}, «${wolf.task?.id}»`;
});

scene_('B07', 'тяжело раненый волк уходит с карты', () => {
  const w = scene();
  const [wolf] = pack(w, 1, 30.5, 30.5, 0.9);
  wolf.hp *= 0.2;
  const t = run(w, 5, () => wolf.task?.id === 'leave');
  if (!t) return `ранен, а не уходит: «${wolf.task?.id}»`;
  return run(w, 2000, () => !alive(wolf)) || 'за 2000 тиков не дошёл до края';
});

scene_('B09', 'мул не бежит: лягает того, кто на него напал; стрелявшего издали — догоняет с разбега', () => {
  const w = scene();
  const mule = put(w, 'mule', 'wild', 40.5, 30.5), man = still(put(w, 'human', 'colony', 41.3, 30.5));
  man.task = {id: 'fight', target: mule};   // stands and strikes (the caravan brain moves nobody)
  const hp = man.hp;
  const t = run(w, 30, () => mule.task?.id === 'maul' && mule.task.mode === 'kick' && man.hp < hp);
  if (!t) return `за 30 тиков не лягнул: «${mule.task?.id}», здоровье ${man.hp.toFixed(2)} из ${hp.toFixed(2)}`;
  // a shot from afar: the archer is 5 cells off, the mule charges
  man.task = {id: 'camped'}; man.x = 46.5; mule.hurtBy = {id: man.id, tick: w.tick, far: true};
  const c = run(w, 40, () => mule.task?.id === 'maul' && mule.task.charging);
  if (!c) return `не несётся на стрелявшего: «${mule.task?.id}»${mule.task?.mode ? ':' + mule.task.mode : ''}`;
  return w.logLines.some(l => /несётся на/.test(l.html)) || 'в журнале нет строки о разбеге';
});

scene_('B10', 'лоси: смелый бык идёт на волка, напавшего на лосиху; робкая отходит или настороже', () => {
  const w = scene();
  const cow = put(w, 'elk', 'wild', 40.5, 30.5), bull = put(w, 'elk', 'wild', 43.5, 30.5), shy = put(w, 'elk', 'wild', 41.5, 32.5);
  cow.nerve = 1; bull.nerve = 1.35; shy.nerve = 0.65;
  run(w, 3);
  if (herdOf(w, bull) !== herdOf(w, cow)) return 'лоси не в одном стаде';
  const wolf = still(put(w, 'wolf', 'predators', 39.5, 30.5)); wolf.pack = wolf.id; wolf.task = {id: 'maul', target: cow};
  const t = run(w, 10, () => bull.task?.id === 'maul' && bull.task.target === wolf);
  if (!t) return `бык занят «${bull.task?.id}»`;
  return ['drawOff', 'alert'].includes(shy.task?.id) || `робкая лосиха занята «${shy.task?.id}»`;
});

scene_('B11', 'медведь зимой уходит в берлогу', () => {
  const w = scene();
  while (season(w).id !== 'winter') w.tick += DAY;
  w.nav.buildAll();
  const bear = put(w, 'bear', 'wild', 30.5, 30.5);
  return run(w, 5, () => bear.task?.id === 'leave') || `зима, а медведь «${bear.task?.id}»`;
});

scene_('B08', 'каталог: у каждого поведения есть код, у каждого вида с умом tabled — список, и он читает то, что есть у вида', () => {
  for (const d of BEHAVIOURS.all()) if (!ACTS[d.id]?.want) return `нет кода у «${d.id}»`;
  for (const sp of SPECIES.all()) {
    if (sp.brain !== 'tabled') continue;
    if (!sp.behaviours?.length) return `${sp.id}: ум tabled без поведений`;
    for (const id of sp.behaviours) for (const f of BEHAVIOURS.get(id).requires) if (sp[f] == null) return `${sp.id}: ${id} читает «${f}», а его нет`;
  }
  return true;
});

const only = process.argv[2];
let bad = 0;
for (const [id, what, fn] of scenes) {
  if (only && id !== only) continue;
  let err;
  try { const r = fn(); err = r && typeof r !== 'string' ? null : r || 'не выполнено'; } catch (e) { err = 'исключение: ' + e.stack.split('\n').slice(0, 2).join(' '); }
  console.log(`${err ? 'FAIL' : 'ok  '} ${id} ${what}${err ? ' — ' + err : ''}`);
  if (err) bad++;
}
if (bad) process.exit(1);
