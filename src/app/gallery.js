// The gallery of the pictures (gallery.html, `npm run gallery`; docs/ART.md): a live local map drawn by the game's own
// renderer, and every picture of src/art/ at the sizes the maps draw it, on the ground it will stand on. The page
// to look at the pictures and say what is wrong with them; an edited SVG shows on a reload (tools/serve.mjs).
import {newGame, step} from '../sim.js';
import {DEFAULT_CFG} from '../data/presets.js';
import {DAY} from '../core/time.js';
import {SPECIES} from '../data/species.js';
import {BUILDINGS} from '../data/buildings.js';
import {createAgent} from '../agents/agent.js';
import {newItem} from '../agents/equipment.js';
import {putUp} from '../settlement/buildings.js';
import {Renderer} from '../render/renderer.js';
import {skin, SKINS, SKIN_EVENT} from '../render/skin.js';
import {drawSprite, spriteKeys, spriteBox, MARK, FIGURE, FULL} from '../render/art/sprite.js';
import {drawPawn} from '../render/art/pawn.js';
import {SHOWCASE} from '../render/art/showcase.js';

const $ = id => document.getElementById(id);
const BG = [
  {id: 'grass', label: 'Трава', c: '#6e8b47', d: ['#5f7c3d', '#7d9a52']},
  {id: 'forest', label: 'Лес', c: '#3f5a2e', d: ['#33502a', '#4c6a36']},
  {id: 'stone', label: 'Камень', c: '#8a877e', d: ['#7a776e', '#9a978e']},
  {id: 'snow', label: 'Снег', c: '#e6ecef', d: ['#d4dde2', '#f4f8fa']},
  {id: 'night', label: 'Ночь', c: '#24283a', d: ['#1c2030', '#2c3044']},
];
let bg = BG[0];

function seg(box, items, cur, on) {
  box.innerHTML = items.map(d => `<button type="button" data-val="${d.id}" aria-pressed="${d.id === cur}">${d.label}</button>`).join('');
  box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); on(b.dataset.val); });
}
function ground(g, w, h) {
  g.fillStyle = bg.c; g.fillRect(0, 0, w, h);
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < w * h / 300; i++) { g.fillStyle = bg.d[i % 2]; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 3, 0, 7); g.fill(); }
}
function canvasFor(w, h) {
  const c = document.createElement('canvas'), d = devicePixelRatio || 1;
  c.width = w * d; c.height = h * d; c.style.width = w + 'px'; c.style.height = h + 'px'; c.className = 'g-sheet';
  const g = c.getContext('2d'); g.scale(d, d); return [c, g];
}

// ── the live scene: a colony of the game run headless in the page, drawn by render/renderer.js
const w = newGame({...DEFAULT_CFG, seed: 'gallery', size: 'small', wildlife: 'many', predators: 'few', colonists: 8, stock: 'rich'});
for (let t = 0; t < DAY / 4; t++) step(w);
const view = {cam: {zoom: 4, cx: w.camp.x + 0.5, cy: w.camp.y + 0.5}, layer: 'world', resHidden: new Set(), selected: null, selBld: null, selCell: null};
const R = new Renderer($('gMap'));
R.setup(w);
let playing = false;
function frame() {
  if (playing) for (let k = 0; k < 3; k++) step(w);
  R.draw(w, view);
  $('gInfo').textContent = `${w.agents.length} существ · ${w.buildings.length} построек · кадр ${R.ms.toFixed(1)} мс`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
$('gPlay').addEventListener('click', e => { playing = !playing; e.target.textContent = playing ? 'Пауза' : 'Пуск'; });
$('gDay').addEventListener('click', () => { for (let t = 0; t < DAY; t++) step(w); });
$('gZin').addEventListener('click', () => { view.cam.zoom *= 1.5; });
$('gZout').addEventListener('click', () => { view.cam.zoom /= 1.5; });
$('gMap').addEventListener('wheel', e => { e.preventDefault(); const r = $('gMap').getBoundingClientRect(); R.zoomAt(w, view.cam, Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top); }, {passive: false});
let drag = null;
$('gMap').addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => { if (!drag) return; R.pan(w, view.cam, e.clientX - drag[0], e.clientY - drag[1]); drag = [e.clientX, e.clientY]; });
// a crowd of every race of the game in kits from the showcase, round the fire
$('gCrowd').addEventListener('click', () => {
  const races = SHOWCASE.races.filter(id => SPECIES.has(id));
  races.forEach((id, n) => {
    const kit = SHOWCASE.kits[n % SHOWCASE.kits.length], ang = (n / races.length) * Math.PI * 2;
    const a = createAgent(w, id, n % 2 ? 'colony' : 'raiders', w.camp.x + 0.5 + Math.cos(ang) * 6, w.camp.y + 0.5 + Math.sin(ang) * 6);
    a.equip = kitOf(kit);
  });
});
$('gBuild').addEventListener('click', () => {
  for (const d of BUILDINGS.all()) { try { putUp(w, d.id, 0); } catch (e) { console.warn(d.id, e.message); } }
  try { putUp(w, 'house', 0.6); putUp(w, "forge", 0.3); } catch (e) { /* no room */ }
});
function kitOf(k) {
  const e = {};
  if (k.body) e.body = newItem(k.body);
  if (k.right) e.right = newItem(k.right);
  if (k.two) e.left = e.right; else if (k.left) e.left = newItem(k.left);
  if (k.back) e.back = newItem(k.back);
  return e;
}

// ── the sheets
const SIZES = [12, 18, 26, 40, 96];
function sheet(title, keys, opts = {}) {
  const sizes = opts.sizes || SIZES, maxS = Math.max(...sizes), colW = Math.max(150, sizes.reduce((s, v) => s + v * (opts.wide || 1) + 10, 0) + 10), rowH = maxS + 30;
  const cols = Math.max(1, Math.floor(Math.min(1500, innerWidth - 40) / colW)), rows = Math.ceil(keys.length / cols);
  const box = document.createElement('div');
  box.innerHTML = `<h2 class="g-sec">${title} <small class="g-note">${keys.length}</small></h2>`;
  const [c, g] = canvasFor(cols * colW, rows * rowH);
  ground(g, cols * colW, rows * rowH);
  keys.forEach((k, n) => {
    const x0 = (n % cols) * colW, y0 = Math.floor(n / cols) * rowH;
    g.fillStyle = bg.id === 'snow' ? '#222' : '#fff'; g.font = '12px sans-serif'; g.fillText(k, x0 + 6, y0 + 14);
    let x = x0 + 8;
    const b = spriteBox(k), ar = b ? b[2] / b[3] : 1;
    for (const s of sizes) {
      const step = s < 14 ? MARK : s < 22 ? FIGURE : FULL;
      drawSprite(g, k, x, y0 + 20 + maxS - s, s / b[3], {step, colors: opts.colors?.(k), flags: opts.flags?.(k)});
      x += s * ar + 10;
    }
  });
  box.appendChild(c);
  return box;
}

function pawnSheet() {
  const races = SHOWCASE.races.filter(id => SPECIES.has(id)), kits = SHOWCASE.kits, rs = [3.4, 5, 7, 10, 14];
  const rowH = 74, colW = 660, cols = Math.max(1, Math.floor(Math.min(1500, innerWidth - 40) / colW));
  const box = document.createElement('div');
  box.innerHTML = '<h2 class="g-sec">Существа: пешки и жетоны <small class="g-note">слева — размеры карты (r 3,4 … 14), справа — наборы снаряжения на r 10</small></h2>';
  const [c, g] = canvasFor(cols * colW, Math.ceil(races.length / cols) * rowH);
  ground(g, cols * colW, Math.ceil(races.length / cols) * rowH);
  const cl = ['#3f6fb5', '#b5443a', '#c8a030'];
  races.forEach((id, n) => {
    const sp = SPECIES.get(id), x0 = (n % cols) * colW, y0 = Math.floor(n / cols) * rowH;
    g.fillStyle = bg.id === 'snow' ? '#222' : '#fff'; g.font = '12px sans-serif'; g.fillText(sp.label || id, x0 + 4, y0 + 14);
    let x = x0 + 86;
    for (const r of rs) { drawPawn(g, {id: n, species: id, equip: kitOf(kits[2]), faceX: 1}, sp, x, y0 + 42, r, cl[n % 3]); x += r * 3 + 12; }
    kits.forEach((k, j) => { drawPawn(g, {id: n + j, species: id, equip: kitOf(k), faceX: j % 2 ? -1 : 1, task: j === kits.length - 1 ? {id: 'fight'} : j === 1 ? {id: 'flee'} : null, sleeping: j === 3 && n % 4 === 0}, sp, x + 8, y0 + 42, 10, cl[(n + j) % 3]); x += 44; });
  });
  box.appendChild(c);
  return box;
}

function render() {
  const out = $('gSheets'); out.innerHTML = '';
  out.appendChild(pawnSheet());
  for (const s of SHOWCASE.sheets) {
    const keys = spriteKeys(s.prefix);
    if (keys.length) out.appendChild(sheet(s.title, keys, s));
  }
}
seg($('gSkin'), SKINS, skin.mode, v => skin.set(v));
seg($('gBg'), BG, bg.id, v => { bg = BG.find(b => b.id === v); render(); });
document.addEventListener(SKIN_EVENT, () => $('gSkin').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === skin.mode))));
addEventListener('keydown', e => { if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey) skin.toggle(); });
render();
