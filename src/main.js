// Entry point: wires the menu, the simulation loop, the renderer and the panels together.
import {newGame, step} from './sim.js';
import {Renderer} from './render/renderer.js';
import {Menu} from './ui/menu.js';
import {Panel} from './ui/panel.js';
import {TOOLS} from './ui/tools.js';
import {$, segmented, press} from './ui/dom.js';
import {setWind} from './world/weather.js';
import {spawnGroup} from './settlement/migration.js';
import {SIZES, CLIMATES, RAIDS, WILDLIFE} from './data/presets.js';
import {TICK_MS} from './core/time.js';
import {esc} from './core/util.js';

const renderer = new Renderer($('map'));
const panel = new Panel();
const view = {layer: 'world', selected: null, speed: 1, tool: 'inspect', hover: -1, renderMs: 0};
let world = null, running = false;

const menu = new Menu({onStart: start, onResume: showGame});

function start(cfg) {
  world = newGame(cfg);
  renderer.setup(world);
  view.selected = null;
  showGame();
}

function showMenu() {
  running = false;
  $('menu').hidden = false; $('game').hidden = true; $('explain').hidden = true;
  $('backToGame').hidden = !world;
  $('colonyName').textContent = 'Тёплый Брод';
  $('worldInfo').textContent = 'Выберите размер мира, сид и условия жизни. На превью — карта, которая получится.';
  menu.sync();
}

function showGame() {
  const c = world.cfg, sz = SIZES[c.size];
  $('menu').hidden = true; $('game').hidden = false; $('explain').hidden = false;
  $('colonyName').textContent = c.name;
  $('worldInfo').innerHTML = esc(`Мир ${sz.w} × ${sz.h}, сид «${c.seed}», климат ${CLIMATES[c.climate].label.toLowerCase()}, набеги: ${RAIDS[c.raids].label.toLowerCase()}, зайцев: ${WILDLIFE[c.wildlife].label.toLowerCase()}${c.lightning ? ', молнии' : ''}.`);
  $('windDir').value = world.wind.dir; $('windStr').value = Math.round(world.wind.str * 100);
  $('windArrow').style.transform = `rotate(${world.wind.dir}deg)`;
  running = true; last = performance.now(); acc = 0;
  panel.render(world, view);
}

// ── input
function eventCell(e) {
  const r = $('map').getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / r.width * world.w), Math.floor((e.clientY - r.top) / r.height * world.h)];
}
$('map').addEventListener('pointermove', e => { if (!world) return; const [x, y] = eventCell(e); view.hover = x >= 0 && y >= 0 && x < world.w && y < world.h ? y * world.w + x : -1; });
$('map').addEventListener('pointerleave', () => { view.hover = -1; });
$('map').addEventListener('pointerdown', e => { if (!world) return; const [x, y] = eventCell(e); if (x >= 0 && y >= 0 && x < world.w && y < world.h) TOOLS[view.tool].apply(world, x, y, view); });
segmented($('tools'), 'tool', v => { view.tool = v; if (v !== 'inspect') view.selected = null; });
segmented($('layers'), 'layer', v => { view.layer = v; });
segmented($('speeds'), 'speed', v => { view.speed = +v; });
$('people').addEventListener('click', e => {
  const p = e.target.closest('.person'); if (!p) return;
  const a = world.agents.find(x => x.id === +p.dataset.id); view.selected = view.selected === a ? null : a;
});
$('windDir').addEventListener('input', e => { world.wind.dir = +e.target.value; setWind(world); $('windArrow').style.transform = `rotate(${world.wind.dir}deg)`; });
$('windStr').addEventListener('input', e => { world.wind.str = +e.target.value / 100; setWind(world); });
$('raid').addEventListener('click', () => spawnGroup(world, 'raiders'));
$('openMenu').addEventListener('click', showMenu);
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || !running || e.target !== document.body) return;
  e.preventDefault(); view.speed = view.speed ? 0 : 1; press($('speeds'), view.speed, 'speed');
});

// ── main loop: fixed ticks, render every frame, with a time budget for the biggest maps at 10×
let acc = 0, last = performance.now(), panelT = 0;
function frame(now) {
  if (running) {
    const dt = Math.min(250, now - last); last = now;
    acc += dt * view.speed;
    const budget = now + 22; let n = 0;
    while (acc >= TICK_MS && n < 40 && performance.now() < budget) { step(world); acc -= TICK_MS; n++; }
    if (acc > 500) acc = 0;
    if (view.selected && (view.selected.dead || !world.agents.includes(view.selected))) view.selected = null;
    renderer.draw(world, view);
    view.renderMs = renderer.ms;
    panel.readout(world, view.selected, view.hover);
    if (now - panelT > 300) { panelT = now; panel.render(world, view); }
  }
  requestAnimationFrame(frame);
}

showMenu();
requestAnimationFrame(frame);

// handle for headless tests and the browser console
window.forest = {get world() { return world; }, step: () => step(world), start, view};
