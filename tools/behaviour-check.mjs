// The behaviour range (docs/BEHAVIOUR.md): scenes on a small flat map where one behaviour at a time is put to the
// test — a hare and a man, a herd and a wolf, a hungry pack and game, a starving pack and a lone colonist at dusk.
// Each scene runs the whole simulation (sim.js step) for a while and asserts what came of it, so a behaviour
// reworked on its own can be tried in seconds. Usage: node tools/behaviour-check.mjs [scene id]
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent, maxHp} from '../src/agents/agent.js';
import {BRAINS} from '../src/agents/brains/index.js';
import {TASKS} from '../src/agents/tasks.js';
import {T} from '../src/data/terrain.js';
import {DAY, HOUR} from '../src/core/time.js';
import {herdOf} from '../src/agents/wildHerd.js';
import {huntOf} from '../src/agents/carcass.js';
import {heatTo} from '../src/world/heat.js';
import {agentInZone} from '../src/settlement/zone.js';
import {BEHAVIOURS} from '../src/data/behaviours.js';
import {ACTS} from '../src/agents/behaviours/index.js';
import {SPECIES, brainOf} from '../src/data/species.js';
import {season} from '../src/data/seasons.js';
import {makeTame} from '../src/settlement/herd.js';
import {createSquad} from '../src/agents/squad.js';
import {startCaravan} from '../src/settlement/trade.js';

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
  // two settlers by the fire who never move, so that the settlement stands even with raiders about (settlement/ending.js)
  // and the zone is a zone
  still(put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 0.5)); still(put(w, 'human', 'colony', w.camp.x - 0.5, w.camp.y + 0.5));
  return w;
}
// a creature that only stands where it is: a prop of the scene (a brain of the range alone: it does nothing)
BRAINS.register({id: 'prop', step(w, a) { if (a.task?.spell) TASKS.get(a.task.id).step(w, a, a.task); if (a.cd > 0) a.cd--; }});   // a spell on it still works
const still = a => { a.brain = 'prop'; a.task ??= {id: 'camped'}; return a; };
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

scene_('B12', 'крыса: днём при людях сидит в норе, ночью, когда все спят, грызёт припасы; подошедший гонит её', () => {
  const w = scene();
  w.stock.berries = 40;
  const rat = put(w, 'rat', 'wild', w.camp.x + 4.5, w.camp.y + 0.5);
  const ate0 = w.stats.ratsAte || 0;
  // the settler by the fire is awake: the rat keeps to its hole
  if (!run(w, 60, () => rat.task?.id === 'hide')) return `при бодрствующем у припасов не прячется: «${rat.task?.id}»`;
  run(w, 300);
  if ((w.stats.ratsAte || 0) > ate0) return 'грызёт припасы при бодрствующем рядом';
  // night falls, the settler sleeps: the rat comes for the food
  w.tick = 3 * DAY + 23 * HOUR; w.agents[0].sleeping = w.agents[1].sleeping = true;
  const ate = run(w, 600, () => (w.stats.ratsAte || 0) > ate0);
  if (!ate) return `за 600 ночных тиков ничего не съела: «${rat.task?.id}»`;
  // someone wakes up right next to it
  w.agents[0].sleeping = false; w.agents[0].x = rat.x + 1; w.agents[0].y = rat.y;
  return run(w, 10, () => rat.dead || rat.task?.id === 'bolt') || `рядом проснулись, а крыса «${rat.task?.id}»`;
});

scene_('B13', 'ручная коза идёт в загон и ходит в нём, ночью дремлет; волк рядом — бежит; ручной мул без загона держится у лагеря', () => {
  const w = scene();
  const pen = {id: 900, key: 'pen', done: true, x: w.camp.x + 6, y: w.camp.y - 2, w: 4, h: 4, cells: [], progress: 1}; w.buildings.push(pen);
  const goat = put(w, 'goat', 'wild', w.camp.x - 8.5, w.camp.y + 0.5); makeTame(w, goat, w.agents[0]);
  if (goat.brain !== 'livestock') return 'приручённая коза не стала скотом';
  const inside = a => a.x >= pen.x && a.y >= pen.y && a.x < pen.x + pen.w && a.y < pen.y + pen.h;
  if (!run(w, 400, () => inside(goat))) return `за 400 тиков не дошла до загона: «${goat.task?.id}» (${goat.x.toFixed(1)}, ${goat.y.toFixed(1)})`;
  run(w, 100);
  if (!inside(goat) || goat.task?.id !== 'penned') return `в загоне, а занята «${goat.task?.id}:${goat.task?.mode}»`;
  w.tick = 3 * DAY + 23 * HOUR;
  if (!run(w, 5, () => goat.task?.id === 'rest')) return `ночью не дремлет: «${goat.task?.id}»`;
  const wolf = still(put(w, 'wolf', 'predators', goat.x + 1.5, goat.y)); wolf.pack = wolf.id;
  if (!run(w, 5, () => goat.task?.id === 'bolt')) return `волк рядом, а коза «${goat.task?.id}»`;
  wolf.dead = true;
  w.buildings.length = 0;
  const mule = put(w, 'mule', 'wild', w.camp.x + 12.5, w.camp.y + 0.5); makeTame(w, mule, w.agents[0]);
  const t = run(w, 300, () => mule.task?.id === 'penned' && mule.task.mode === 'camp' && w.nav.get('camp')[(mule.y | 0) * w.w + (mule.x | 0)] <= 5);
  return t || `мул без загона: «${mule.task?.id}:${mule.task?.mode}», до лагеря ${w.nav.get('camp')[(mule.y | 0) * w.w + (mule.x | 0)]}`;
});

scene_('B14', 'леший держится леса и водит поселенца кругами; раненный одним бьёт в ответ, от толпы уходит в чащу', () => {
  const w = scene();
  // a wood for him: a square of forest well away from the camp
  const F = T.FOREST; for (let y = 10; y < 26; y++) for (let x = 10; x < 26; x++) w.grid.terr[y * w.w + x] = F;
  w.nav.buildAll();
  const leshy = put(w, 'leshy', 'nechist', 18.5, 18.5);
  run(w, 200);
  if (w.grid.terr[(leshy.y | 0) * w.w + (leshy.x | 0)] !== F) return `ушёл из леса: (${leshy.x.toFixed(1)}, ${leshy.y.toFixed(1)}) «${leshy.task?.id}»`;
  const man = still(put(w, 'human', 'colony', leshy.x + 2, leshy.y));
  if (!run(w, 200, () => man.task?.id === 'astray')) return `поселенец рядом с лешим не заплутал: «${man.task?.id}»`;
  // one man hurts him: he hits back
  leshy.hurtBy = {id: man.id, tick: w.tick, far: false}; man.task = {id: 'camped'};
  if (!run(w, 10, () => leshy.task?.id === 'maul' && leshy.task.target === man)) return `ранен одним, а «${leshy.task?.id}»`;
  // a crowd closes in: he melts into the thicket
  for (let k = 0; k < 3; k++) still(put(w, 'human', 'colony', leshy.x + 1 + k * 0.5, leshy.y + 1));
  leshy.hurtBy = {id: man.id, tick: w.tick, far: false};
  const hid = run(w, 10, () => leshy.hiddenUntil > w.tick && leshy.task?.id === 'hide');
  return hid || `толпа рядом, а леший «${leshy.task?.id}»`;
});

scene_('B15', 'русалка ночью зовёт одинокого поселенца к воде; подошёл второй — чары спали', () => {
  const w = scene('range', 23);   // night
  // a pond with a shore
  const W = T.WATER; for (let y = 14; y < 20; y++) for (let x = 14; x < 20; x++) w.grid.terr[y * w.w + x] = W;
  w.nav.buildAll();
  const rus = put(w, 'rusalka', 'nechist', 13.5, 17.5);
  rus.special = {...rus.special, C: 15};   // a voice nobody resists
  const man = still(put(w, 'human', 'colony', 13.5, 25.5));
  man.special = {...man.special, P: 0, I: 0};   // no eye and no head: the song always takes
  const sung = run(w, 300, () => man.task?.id === 'lured');
  if (!sung) return `за 300 ночных тиков песни не было: русалка «${rus.task?.id}», поселенец «${man.task?.id}»`;
  const d0 = Math.hypot(man.x - rus.x, man.y - rus.y);
  run(w, 40);
  if (!(Math.hypot(man.x - rus.x, man.y - rus.y) < d0)) return 'зачарованный не идёт к воде';
  still(put(w, 'human', 'colony', man.x + 0.7, man.y));
  return run(w, 10, () => man.task?.id !== 'lured') || 'второй подошёл, а чары держат';
});

scene_('B16', 'налётчики: отряд идёт к лагерю, бьётся с тем, кто стоит на пути, грабит склад и уходит с добычей', () => {
  const w = scene();
  w.stock.berries = 60; w.stock.meat = 30; w.stats.raids = 9;   // not the first raid: no scouting party
  const g = [];
  for (let k = 0; k < 4; k++) { const r = put(w, 'human', 'raiders', 4.5 + k, 4.5); r.band = 'bandits'; r.name = 'Налётчик'; g.push(r); }
  createSquad(w, g);
  if (g.some(r => r.brain !== 'raider')) return 'налётчик не получил роль raider';
  const food0 = w.stock.berries + w.stock.meat;
  const came = run(w, 1500, () => g.some(r => r.task?.id === 'assault' || r.task?.id === 'fight'));
  if (!came) return `за 1500 тиков никто не пошёл на склад: ${g.map(r => r.task?.id).join(', ')}`;
  const looted = run(w, 2500, () => g.some(r => r.looted) || w.stock.berries + w.stock.meat < food0);
  if (!looted) return `склад цел: ${g.map(r => `${r.task?.id}${r.dead ? '†' : ''}`).join(', ')}`;
  return run(w, 3000, () => g.every(r => r.dead || r.gone || r.task?.id === 'leave')) || `не уходят: ${g.map(r => r.task?.id).join(', ')}`;
});

scene_('B17', 'караван: купец приходит и встаёт у костра, охранник бьёт волка, напавшего на мула; гостевание кончилось — все уходят', () => {
  const w = scene();
  const trader = put(w, 'human', 'traders', 3.5, 60.5); trader.role = 'trader';
  const guards = [0, 1].map(k => { const o = put(w, 'human', 'traders', 4.5 + k, 60.5); o.role = 'guard'; o.brain = 'guard'; o.slot = k; return o; });
  const mule = put(w, 'mule', 'traders', 5.5, 61.5);
  startCaravan(w, [trader, ...guards, mule]);
  if (trader.brain !== 'trader' || mule.brain !== 'tabled') return `роли: купец ${trader.brain}, мул ${mule.brain}`;
  const arrived = run(w, 2500, () => w.caravan?.arrived != null);
  if (!arrived) return `купец не дошёл за 2500 тиков: «${trader.task?.id}» (${trader.x.toFixed(1)}, ${trader.y.toFixed(1)}), охрана ${guards.map(o => o.task?.id).join(', ')}`;
  if (!guards.every(o => o.task?.id === 'escort' && Math.hypot(o.x - trader.x, o.y - trader.y) < 4)) return `охрана не при купце: ${guards.map(o => o.task?.id).join(', ')}`;
  const wolf = still(put(w, 'wolf', 'predators', mule.x + 1, mule.y)); wolf.pack = wolf.id; wolf.task = {id: 'maul', target: mule};
  const fought = run(w, 30, () => guards.some(o => o.task?.id === 'fight' && o.task.target === wolf));
  if (!fought) return `охрана не вступилась за мула: ${guards.map(o => o.task?.id).join(', ')}`;
  wolf.dead = true;
  w.caravan.phase = 'leaving';
  return run(w, 3000, () => [trader, ...guards, mule].every(o => o.gone)) || `не ушли: ${[trader, ...guards, mule].map(o => `${o.task?.id}:${o.gone ? 'ушёл' : 'здесь'}`).join(', ')}`;
});

scene_('B18', 'беглый пленный бежит к краю карты и уходит за него', () => {
  const w = scene();
  const p = put(w, 'human', 'colony', w.camp.x + 0.5, w.camp.y + 3.5);
  p.faction = 'fugitives'; p.brain = 'fugitive'; p.fugitive = {since: w.tick, slow: 1}; p.task = {id: 'escape'};
  const t = run(w, 2000, () => p.gone);
  return t || `за 2000 тиков не ушёл: «${p.task?.id}» (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
});

scene_('B19', 'налётчик вяжет упавшего поселенца и уводит его в плен; налётчик пал — пленный свободен', () => {
  const w = scene();
  // a colonist lying senseless far from the camp, a lone raider a few cells off
  const c = put(w, 'human', 'colony', 10.5, 60.5); c.name = 'Упавший';
  c.downed = {since: w.tick, until: w.tick + 1500, cause: 'ран', by: null, trauma: null}; c.hp = 1; c.task = {id: 'downed'};
  const r = put(w, 'human', 'raiders', 16.5, 60.5); r.band = 'bandits'; r.name = 'Налётчик';
  if (r.brain !== 'raider') return `налётчик не получил роль raider: ${r.brain}`;
  const went = run(w, 60, () => r.task?.id === 'capture');
  if (!went) return `не пошёл вязать: «${r.task?.id}» (${r.why?.why})`;
  const bound = run(w, 300, () => c.brain === 'led');
  if (!bound) return `не связал за 300 тиков: «${r.task?.id}» (${r.task?.work}), поселенец ${c.downed ? 'лежит' : 'на ногах'}`;
  if (c.downed || !r.looted || c.ledBy !== r.id) return `связан не так: downed ${!!c.downed}, looted ${r.looted}, ledBy ${c.ledBy}`;
  const away = run(w, 200, () => r.task?.id === 'leave' && dist(c, r) < 3 && Math.hypot(c.x - 10.5, c.y - 60.5) > 2);
  if (!away) return `не уводит: «${r.task?.id}», пленный в ${dist(c, r).toFixed(1)} от него`;
  // the second raider: the first falls on the way — the captive is a colonist again, with the wound to show for it
  r.dead = true;
  run(w, 3);
  if (c.brain !== 'colonist' || c.ledBy != null || c.gone) return `после смерти вора: мозг ${c.brain}, ledBy ${c.ledBy}, gone ${!!c.gone}`;
  if (!c.wounds?.some(x => x.id === 'grave')) return 'после плена нет тяжёлой раны';
  // and one led over the edge is taken: the chronicle knows
  const r2 = put(w, 'human', 'raiders', c.x + 1, c.y); r2.band = 'bandits'; r2.name = 'Второй';
  c.brain = 'led'; c.ledBy = r2.id; c.ledFrom = 'colonist'; c.task = null; r2.looted = true; r2.leads = c.id;
  const gone = run(w, 2500, () => c.gone);
  if (!gone) return `за краем не исчез: «${r2.task?.id}» (${r2.x.toFixed(1)}, ${r2.y.toFixed(1)}), пленный в ${dist(c, r2).toFixed(1)}`;
  return (w.chronicle.taken === 1) || `летопись: taken ${w.chronicle.taken}`;
});

scene_('B20', 'свой упал и истекает кровью: единственный на ногах, сам раненый и далеко, бросает всё и бежит перевязать', () => {
  const w = scene();
  // the fallen one far off; the only one standing is hurt (35%) and 45 cells away — once too hurt and too far to go
  const c = put(w, 'human', 'colony', 10.5, 60.5); c.name = 'Упавший';
  c.downed = {since: w.tick, until: w.tick + 3000, cause: 'ран', by: null, trauma: null}; c.hp = 1; c.task = {id: 'downed'};
  const h = put(w, 'human', 'colony', 55.5, 60.5); h.name = 'Последний'; h.hp = maxHp(h) * 0.35;
  // one who went to help and fell himself on the way holds nobody
  const f = put(w, 'human', 'colony', 30.5, 60.5); f.name = 'Не дошедший';
  f.downed = {since: w.tick, until: w.tick + 3000, cause: 'ран', by: null, trauma: null}; f.hp = 1; f.task = {id: 'downed'};
  const went = run(w, 30, () => h.task?.id === 'aid');
  if (!went) return `не пошёл: «${h.task?.id}» (${h.why?.why ?? ''})`;
  if (!h.task.fallen) return 'пошёл не как к упавшему';
  const saved = run(w, 1500, () => !c.downed && !f.downed);
  if (!saved) return `не успел за 1500 тиков: «${h.task?.id}», упавший ${c.downed ? 'лежит' : 'на ногах'}, второй ${f.downed ? 'лежит' : 'на ногах'}`;
  return true;
});

scene_('B08', 'каталог: у каждого поведения есть код, у каждого вида с умом tabled — список, и он читает то, что есть у вида', () => {
  for (const d of BEHAVIOURS.all()) if (!ACTS[d.id]?.want) return `нет кода у «${d.id}»`;
  for (const sp of SPECIES.all()) {
    if (brainOf(sp) !== 'tabled') continue;   // (a species thinks by the table when it has behaviours: data/species.js brainOf)
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
