// The new menu (forest.html, Forest.bat): Создать землю · Заселение мира · Кампания · Быстрый старт · Настройки.
// It is a shell over the same core as the old one (index.html, start.bat — the technical polygon); screens that are
// not built yet open the old ones: index.html?go=world|campaign|epic&from=forest, and «← Главное меню» there
// comes back here. docs/TABLE.md, «Новое меню».
import {EPIC_SIZES} from '../data/campaign.js';
import {VERSION} from '../version.js';
import {TablesView} from './tablesView.js';

const $ = id => document.getElementById(id);
const SCREENS = ['home', 'quick', 'land', 'settle', 'settings'];
const STORE = 'forest.app.quick';
const randomSeed = () => String(100000 + Math.floor(Math.random() * 899999));

// the old screen this one hands over to, with the way back
const old = (go, extra = {}) => { location.href = `index.html?${new URLSearchParams({go, ...extra, from: 'forest'})}`; };

let screen = 'home';
function show(id) {
  screen = id;
  for (const s of SCREENS) $(s).hidden = s !== id;
  if (id === 'settings') tables.show();
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-go], [data-old]'); if (!b) return;
  if (b.dataset.old) { old(b.dataset.old); return; }
  const go = b.dataset.go;
  if (go === 'campaign') old('campaign');
  else show(go);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || screen === 'home' || e.target.closest('input, textarea, select')) return;
  e.preventDefault(); show('home');
});

// ── quick start: the seed is in sight, can be rolled, copied and typed; it is remembered with the size
const quick = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } })();
quick.seed = quick.seed || randomSeed();
if (!EPIC_SIZES.some(([id]) => id === quick.size)) quick.size = 'medium';
const keep = () => { try { localStorage.setItem(STORE, JSON.stringify(quick)); } catch (e) { /* storage unavailable */ } };

const seedBox = $('quickSeed'), note = $('quickSeedNote'), noteText = note.textContent;
seedBox.value = quick.seed;
seedBox.addEventListener('input', () => { quick.seed = seedBox.value.trim(); keep(); });
$('quickDice').addEventListener('click', () => { quick.seed = seedBox.value = randomSeed(); keep(); });
$('quickCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(seedBox.value); note.textContent = `Сид ${seedBox.value} скопирован.`; }
  catch (e) { seedBox.select(); note.textContent = 'Не удалось скопировать: сид выделен, нажмите Ctrl+C.'; }
  setTimeout(() => { note.textContent = noteText; }, 2500);
});

const sizes = $('quickSize');
const syncSize = () => sizes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === quick.size)));
sizes.innerHTML = EPIC_SIZES.map(([id, l]) => `<button type="button" data-val="${id}">${l}</button>`).join('');
sizes.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; quick.size = b.dataset.val; keep(); syncSize(); });
syncSize();

$('quickGo').addEventListener('click', () => {
  if (!seedBox.value.trim()) { quick.seed = seedBox.value = randomSeed(); }
  keep();
  old('epic', {seed: seedBox.value.trim(), size: quick.size});
});

// ── settings: the tables of src/data/schema/, read only (stage 2)
const tables = new TablesView();

$('buildTag').textContent = `версия ${VERSION}`;
// forest.html#settings and the like open that screen
show(SCREENS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
