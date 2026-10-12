// Entry point: wires the menu, the simulation loop, the renderer and the panels together.
import {newGame, step} from './sim.js';
import {Renderer} from './render/renderer.js';
import {Menu} from './ui/menu.js';
import {Panel} from './ui/panel.js';
import {TOOLS} from './ui/tools.js';
import {showEnd, hideEnd} from './ui/endScreen.js';
import {$, segmented, press} from './ui/dom.js';
import {COMMANDS} from './commands.js';
import {saveToBrowser, listSaves, loadFromBrowser, deleteSave, downloadSave, loadFromFile} from './ui/saves.js';
import {dayOf} from './core/time.js';
import {SIZES, CLIMATES, RAIDS, WILDLIFE, PREDATORS} from './data/presets.js';
import {TICK_MS} from './core/time.js';
import {esc} from './core/util.js';
import {RESOURCES} from './data/resources.js';
import {VERSION, BUILD} from './version.js';

const renderer = new Renderer($('map'));
const panel = new Panel();
const view = {layer: 'world', selected: null, speed: 1, tool: 'inspect', hover: -1, renderMs: 0, resHidden: loadResHidden()};

// resource layer filter: one chip per resource that can be seen on the map, remembered in this browser
function loadResHidden() { try { return new Set(JSON.parse(localStorage.getItem('forest.resHidden') || '[]')); } catch (e) { return new Set(); } }
function buildResFilter() {
  const box = $('resFilter');
  box.innerHTML = RESOURCES.filter(r => r.map).map(r => `<button type="button" data-res="${r.id}" aria-pressed="${!view.resHidden.has(r.id)}"><i style="background:rgb(${r.mapColor.join(',')})"></i>${r.label}</button>`).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.dataset.res;
    if (view.resHidden.has(id)) view.resHidden.delete(id); else view.resHidden.add(id);
    b.setAttribute('aria-pressed', String(!view.resHidden.has(id)));
    try { localStorage.setItem('forest.resHidden', JSON.stringify([...view.resHidden])); } catch (err) { /* storage unavailable */ }
  });
}
buildResFilter();
let world = null, running = false;

const menu = new Menu({onStart: start, onResume: showGame});

function start(cfg) {
  world = newGame(cfg);
  renderer.setup(world);
  view.selected = null;
  autoDay = dayOf(world.tick);
  showGame();
}

// a loaded world replaces the running one
function resume(w) {
  world = w;
  renderer.setup(world);
  view.selected = null;
  autoDay = dayOf(world.tick);
  showGame();
}

function showMenu() {
  running = false;
  hideEnd();
  $('menu').hidden = false; $('game').hidden = true; $('explain').hidden = true;
  $('backToGame').hidden = !world;
  refreshSaves();
  $('colonyName').textContent = 'Тёплый Брод';
  $('worldInfo').textContent = 'Выберите размер мира, сид и условия жизни. На превью — карта, которая получится.';
  menu.sync();
}

function showGame() {
  const c = world.cfg, sz = SIZES[c.size];
  $('menu').hidden = true; $('game').hidden = false; $('explain').hidden = false;
  $('colonyName').textContent = c.name;
  $('worldInfo').innerHTML = esc(`Мир ${sz.w} × ${sz.h}, сид «${c.seed}», климат ${CLIMATES[c.climate].label.toLowerCase()}, набеги: ${RAIDS[c.raids].label.toLowerCase()}, зайцев: ${WILDLIFE[c.wildlife].label.toLowerCase()}, волки: ${PREDATORS[c.predators].label.toLowerCase()}${c.lightning ? ', молнии' : ''}.`);
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
segmented($('layers'), 'layer', v => { view.layer = v; $('resFilter').hidden = v !== 'res'; });
segmented($('speeds'), 'speed', v => { view.speed = +v; });
$('people').addEventListener('click', e => {
  const p = e.target.closest('.person'); if (!p) return;
  const a = world.agents.find(x => x.id === +p.dataset.id); view.selected = view.selected === a ? null : a;
});
$('windDir').addEventListener('input', e => { COMMANDS.setWind(world, +e.target.value, null); $('windArrow').style.transform = `rotate(${world.wind.dir}deg)`; });
$('windStr').addEventListener('input', e => { COMMANDS.setWind(world, null, +e.target.value / 100); });
$('raid').addEventListener('click', () => COMMANDS.raid(world));

// ── saves
let autoDay = 0, statusTimer = 0;
function status(id, text) { $(id).textContent = text; clearTimeout(statusTimer); statusTimer = setTimeout(() => { $(id).textContent = ''; }, 4000); }
async function save(auto) {
  try { const m = await saveToBrowser(world, auto); if (!auto) status('saveStatus', `Сохранено: день ${m.day}, ${m.when.split(', ')[1] || ''}`); }
  catch (e) { status('saveStatus', 'Не удалось сохранить: ' + e.message); }
}
$('saveGame').addEventListener('click', () => save(false));
$('saveFile').addEventListener('click', () => downloadSave(world).catch(e => status('saveStatus', 'Не удалось: ' + e.message)));
async function refreshSaves() {
  const box = $('saveList');
  let saves;
  try { saves = await listSaves(); } catch (e) { box.innerHTML = '<small>Сохранения в этом браузере недоступны. Можно открыть файл.</small>'; return; }
  if (!saves.length) { box.innerHTML = '<small>Пока нет сохранений.</small>'; return; }
  box.innerHTML = saves.map(s => `<div class="sv" data-id="${esc(s.id)}"><span class="t"><b>${esc(s.name)}</b> · день ${s.day} · жителей ${s.pop}${s.auto ? ' · автосохранение' : ''}<br><small>${new Date(s.savedAt).toLocaleString('ru-RU')} · версия ${esc(s.version || '?')}</small></span>` +
    `<button type="button" data-act="load">Загрузить</button><button type="button" data-act="del" class="quiet" aria-label="Удалить сохранение">Удалить</button></div>`).join('');
}
$('saveList').addEventListener('click', async e => {
  const b = e.target.closest('button'), row = e.target.closest('.sv'); if (!b || !row) return;
  if (b.dataset.act === 'del') { await deleteSave(row.dataset.id); refreshSaves(); return; }
  try { resume(await loadFromBrowser(row.dataset.id)); } catch (err) { status('loadStatus', err.message); }
});
$('loadFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { resume(await loadFromFile(f)); } catch (err) { status('loadStatus', 'Не удалось открыть: ' + err.message); }
});
$('openMenu').addEventListener('click', showMenu);
$('personCard').addEventListener('click', e => { if (e.target.closest('[data-close]')) { view.selected = null; panel.renderCard(world, null); } });
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
    // the settlement has fallen: stop, draw the last frame and show the chronicle
    if (world.over) {
      running = false;
      renderer.draw(world, view); panel.render(world, view);
      $('game').hidden = true; $('explain').hidden = true;
      showEnd(world, () => { world = null; showMenu(); });
      requestAnimationFrame(frame);
      return;
    }
    // autosave once a game day, at the first frame of the new day
    if (dayOf(world.tick) !== autoDay) { autoDay = dayOf(world.tick); save(true); }
    renderer.draw(world, view);
    view.renderMs = renderer.ms;
    panel.readout(world, view.hover);
    if (now - panelT > 300) { panelT = now; panel.render(world, view); panel.renderCard(world, view.selected); }
  }
  requestAnimationFrame(frame);
}

$('buildTag').textContent = `версия ${VERSION} · ${BUILD}`;
showMenu();
requestAnimationFrame(frame);

// handle for headless tests and the browser console
window.forest = {get world() { return world; }, step: () => step(world), start, view};
