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
import {TICK_MS} from './core/time.js';
import {esc} from './core/util.js';
import {RESOURCES} from './data/resources.js';
import {VERSION, BUILD} from './version.js';

const renderer = new Renderer($('map'));
const panel = new Panel();
const view = {cam: {zoom: 1, cx: 0, cy: 0}, layer: 'world', selected: null, selBld: null, selCell: null, speed: 1, tool: 'inspect', hover: -1, renderMs: 0, resHidden: loadResHidden(), tab: loadTab()};
const clearSelection = () => { view.selected = null; view.selBld = null; view.selCell = null; };

// the open tab on the right of the map, remembered in this browser
function loadTab() { try { return localStorage.getItem('forest.tab') || 'stock'; } catch (e) { return 'stock'; } }
function showTab(id) {
  view.tab = id;
  document.querySelectorAll('#tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  document.querySelectorAll('.tabpanel').forEach(p => { p.hidden = p.dataset.panel !== id; });
  try { localStorage.setItem('forest.tab', id); } catch (e) { /* storage unavailable */ }
  if (world) panel.render(world, view);
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });

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
  clearSelection(); fitCam();
  autoDay = dayOf(world.tick);
  showGame();
}

// a loaded world replaces the running one
function resume(w) {
  world = w;
  renderer.setup(world);
  clearSelection(); fitCam();
  autoDay = dayOf(world.tick);
  showGame();
}

function showMenu() {
  running = false;
  hideEnd();
  $('menu').hidden = false; $('game').hidden = true; $('explain').hidden = false;
  document.body.classList.remove('ingame'); $('worldInfo').hidden = false;
  $('backToGame').hidden = !world;
  refreshSaves();
  $('colonyName').textContent = 'Тёплый Брод';
  $('worldInfo').textContent = 'Выберите размер мира, сид и условия жизни. На превью — карта, которая получится.';
  menu.sync();
}

function showGame() {
  const c = world.cfg;
  // the explanation cards belong to the start menu; in the game the screen is for the map and the panels
  $('menu').hidden = true; $('game').hidden = false; $('explain').hidden = true;
  document.body.classList.add('ingame'); $('worldInfo').hidden = true;
  $('colonyName').textContent = c.name;
  showTab(view.tab);
  $('windDir').value = world.wind.dir; $('windStr').value = Math.round(world.wind.str * 100);
  $('windArrow').style.transform = `rotate(${world.wind.dir}deg)`;
  running = true; last = performance.now(); acc = 0;
  panel.render(world, view); panel.renderSelection(world, view);
}

// ── input: the map camera (wheel zooms at the cursor, dragging pans) and clicks with the current tool
const mapEl = $('map');
const local = e => { const r = mapEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function eventCell(e) { const [px, py] = local(e), [x, y] = renderer.toCell(px, py); return [Math.floor(x), Math.floor(y)]; }
const onMap = (x, y) => x >= 0 && y >= 0 && x < world.w && y < world.h;
const fitCam = () => { if (world) view.cam = {zoom: 1, cx: world.w / 2, cy: world.h / 2}; };

// a press that moves less than this many pixels is a click; further, it drags the map
const DRAG_PX = 5;
let grab = null;
mapEl.addEventListener('pointerdown', e => {
  if (!world) return;
  grab = {id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: e.button !== 0};
  mapEl.setPointerCapture(e.pointerId);
  if (e.button !== 0) e.preventDefault();
});
mapEl.addEventListener('pointermove', e => {
  if (!world) return;
  if (grab && grab.id === e.pointerId) {
    if (!grab.drag && Math.hypot(e.clientX - grab.x, e.clientY - grab.y) > DRAG_PX) grab.drag = true;
    if (grab.drag) { renderer.pan(world, view.cam, e.clientX - grab.lx, e.clientY - grab.ly); mapEl.classList.add('dragging'); }
    grab.lx = e.clientX; grab.ly = e.clientY;
  }
  const [x, y] = eventCell(e);
  view.hover = onMap(x, y) ? y * world.w + x : -1;
});
mapEl.addEventListener('pointerup', e => {
  if (!world || !grab || grab.id !== e.pointerId) return;
  const click = !grab.drag;
  grab = null; mapEl.classList.remove('dragging');
  if (!click) return;
  const [x, y] = eventCell(e);
  if (onMap(x, y)) { TOOLS[view.tool].apply(world, x, y, view); panel.renderSelection(world, view); }
});
mapEl.addEventListener('pointercancel', () => { grab = null; mapEl.classList.remove('dragging'); });
mapEl.addEventListener('pointerleave', () => { view.hover = -1; });
mapEl.addEventListener('contextmenu', e => e.preventDefault());
mapEl.addEventListener('wheel', e => {
  if (!world) return;
  e.preventDefault();
  const [px, py] = local(e);
  renderer.zoomAt(world, view.cam, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), px, py);
}, {passive: false});
// buttons zoom at the middle of the view
const zoomCentre = f => { if (!world) return; const [cw, ch] = renderer.size(); renderer.zoomAt(world, view.cam, f, cw / 2, ch / 2); };
$('zoomIn').addEventListener('click', () => zoomCentre(1.6));
$('zoomOut').addEventListener('click', () => zoomCentre(1 / 1.6));
$('zoomFit').addEventListener('click', fitCam);
document.addEventListener('keydown', e => {
  if (!running || e.target !== document.body || e.ctrlKey || e.metaKey) return;
  if (e.key === '+' || e.key === '=') zoomCentre(1.6);
  else if (e.key === '-' || e.key === '_') zoomCentre(1 / 1.6);
  else if (e.key === '0' || e.key === 'Home') fitCam();
});
segmented($('tools'), 'tool', v => { view.tool = v; if (v !== 'inspect') clearSelection(); });
segmented($('layers'), 'layer', v => { view.layer = v; $('resFilter').hidden = v !== 'res'; });
segmented($('speeds'), 'speed', v => { view.speed = +v; });
$('people').addEventListener('click', e => {
  const p = e.target.closest('.person'); if (!p) return;
  const a = world.agents.find(x => x.id === +p.dataset.id), again = view.selected === a;
  clearSelection(); view.selected = again ? null : a;
  panel.renderSelection(world, view);
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
$('selCard').addEventListener('click', e => { if (e.target.closest('[data-close]')) { clearSelection(); panel.renderSelection(world, view); } });
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || !running || e.target !== document.body) return;
  e.preventDefault(); view.speed = view.speed ? 0 : 1; press($('speeds'), view.speed, 'speed');
});

// ── main loop: fixed ticks, render every frame, with a time budget for the biggest maps at 10×
let acc = 0, last = performance.now(), panelT = 0;
function frame(now) {
  if (running) {
    try { runFrame(now); }
    catch (err) {
      // the world is in an unknown state now: stop it, say why, and do not let it be resumed or autosaved
      console.error(err);
      const tick = world?.tick;
      running = false; acc = 0; world = null;
      showMenu();
      $('loadStatus').textContent = `Игра остановлена из-за ошибки${tick != null ? ` на тике ${tick}` : ''}: ${err.message}. Последнее сохранение цело.`;
    }
  }
  requestAnimationFrame(frame);
}

function runFrame(now) {
  const dt = Math.min(250, now - last); last = now;
  acc += dt * view.speed;
  const budget = now + 22; let n = 0;
  while (acc >= TICK_MS && n < 40 && performance.now() < budget) { step(world); acc -= TICK_MS; n++; }
  if (acc > 500) acc = 0;
  if (view.selected && (view.selected.dead || !world.agents.includes(view.selected))) view.selected = null;
  if (view.selBld != null && !world.buildings.some(b => b.id === view.selBld)) view.selBld = null;
  // the settlement has fallen: stop, draw the last frame and show the chronicle
  if (world.over) {
    running = false;
    renderer.draw(world, view); panel.render(world, view);
    $('game').hidden = true; $('explain').hidden = true;
    document.body.classList.remove('ingame');
    showEnd(world, () => { world = null; showMenu(); });
    return;
  }
  // autosave once a game day, at the first frame of the new day
  if (dayOf(world.tick) !== autoDay) { autoDay = dayOf(world.tick); save(true); }
  renderer.draw(world, view);
  view.renderMs = renderer.ms;
  panel.readout(world, view.hover);
  if (now - panelT > 300) { panelT = now; panel.render(world, view); panel.renderSelection(world, view); }
}

$('buildTag').textContent = `версия ${VERSION} · ${BUILD}`;
showMenu();
requestAnimationFrame(frame);

// handle for headless tests and the browser console
window.forest = {get world() { return world; }, step: () => step(world), start, view};
