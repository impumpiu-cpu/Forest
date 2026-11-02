// The menu (forest.html, Forest.bat): Создать землю · Заселение мира · Кампания · Быстрый старт · Конструктор существ · Настройки.
// A shell over the core: every screen is a module of src/app/ or src/ui/, shown in turn; the screens with a running
// clock (the world settled, the campaign) share the observer's layout (docs/GAME.md «Наблюдатель»). docs/GAME.md.
// first: the table edits of this browser go into the tables before anything reads them
import {BOOT_PROBLEMS} from '../ui/tableEdits.js';
import {editCount} from '../data/schema/edits.js';
import {EPIC_SIZES} from '../data/campaign.js';
import {VERSION} from '../version.js';
import {TablesView} from './tablesView.js';
import {BeastView} from './beastView.js';
import {LandView} from './landView.js';
import {SettleView} from './settleView.js';
import {CampaignView} from '../ui/campaignView.js';
import {MARCH_EVENT} from './campView.js';
import {mountTabs} from '../ui/tabs.js';
import {skin, SKINS, SKIN_EVENT} from '../render/skin.js';

const $ = id => document.getElementById(id);
const SCREENS = ['home', 'quick', 'land', 'settle', 'campaign', 'settings', 'bestiary'];
const OBSERVER = new Set(['settle', 'campaign']);   // the screens laid out as the observer's: no page scroll, the map fills the window
const STORE = 'forest.app.quick';
const randomSeed = () => String(100000 + Math.floor(Math.random() * 899999));

let screen = 'home', land = null, settle = null, campaign = null, beasts = null;
function show(id) {
  // the screen left halts its clock between frames (it goes on when the screen is back)
  if (screen !== id) { if (screen === 'land') land?.stop(); if (screen === 'settle') settle?.stop(); if (screen === 'campaign') campaign?.halt(); }
  screen = id;
  for (const s of SCREENS) $(s).hidden = s !== id;
  document.body.classList.toggle('observer', OBSERVER.has(id));
  if (id === 'settings') tables.show();
  if (id === 'bestiary') (beasts ||= new BeastView()).show();
  if (id === 'land') (land ||= new LandView()).show();
  if (id === 'settle') (settle ||= new SettleView()).show();
  if (id === 'campaign') theCampaign().show('library');
  window.scrollTo(0, 0);
  // the maps size themselves to the window: a screen just shown draws once its box is laid out
  requestAnimationFrame(() => { if (id === 'settle') settle?.draw(); if (id === 'campaign') campaign?.draw(); });
}
// the campaign screen (ui/campaignView.js), made when first needed; «← Главное меню» there comes back here
function theCampaign() {
  if (!campaign) { campaign = new CampaignView({onBack: () => show('home')}); mountTabs($('campDock')); }
  return campaign;
}
// the campaign screen shown for a world or a new epic one (the quick start): shown without `show`, which would halt it
function openCampaign(fn) {
  const v = theCampaign();
  if (screen === 'settle') settle?.stop();
  screen = 'campaign'; for (const s of SCREENS) $(s).hidden = s !== 'campaign'; document.body.classList.add('observer');
  fn(v);
  requestAnimationFrame(() => v.draw());
}
// «В поход →» of the world settled (app/campView.js march): that world from the library, on the campaign screen
document.addEventListener(MARCH_EVENT, e => openCampaign(v => { v.show('library'); v.openFromLibrary(e.detail.id, e.detail.name); }));

document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  show(b.dataset.go);
});
// the look of the maps on the settings screen: a row of two buttons that follows the switch
{
  const box = $('setSkinSeg');
  const sync = () => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === skin.mode)));
  box.innerHTML = SKINS.map(s => `<button type="button" data-val="${s.id}">${s.label}</button>`).join('');
  box.addEventListener('click', e => { const b = e.target.closest('button'); if (b) skin.set(b.dataset.val); });
  document.addEventListener(SKIN_EVENT, sync); sync();
}
// G (П in the Russian layout): the look of the maps, pictures or the plain scheme (render/skin.js), on any screen
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select')) return;
  if (e.code === 'KeyG' || e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') skin.toggle();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || screen === 'home' || e.target.closest('input, textarea, select')) return;
  e.preventDefault(); show('home');
});
window.addEventListener('resize', () => { if (screen === 'settle') settle?.draw(); if (screen === 'campaign') campaign?.draw(); });

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

// the epic campaign: a new world with a long history on the campaign screen, then the capital and the walk
$('quickGo').addEventListener('click', () => {
  if (!seedBox.value.trim()) { quick.seed = seedBox.value = randomSeed(); }
  keep();
  openCampaign(v => { v.show('epic'); v.startEpic({seed: seedBox.value.trim(), size: quick.size}); });
});

// ── settings: the tables of src/data/schema/
const tables = new TablesView();
// the settled world's dock (the tabs under the map) is wired once the screen exists
mountTabs($('setDock'));

$('buildTag').textContent = `версия ${VERSION}${editCount() ? ` · правки таблиц: ${editCount()}` : ''}${BOOT_PROBLEMS.length ? ' · ⚠' : ''}`;
// forest.html#settings and the like open that screen
show(SCREENS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
