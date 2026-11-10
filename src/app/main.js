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
import {QuickShell} from '../ui/shell/landShell.js';
import {MARCH_EVENT} from './campView.js';
import {mountTabs} from '../ui/tabs.js';
import {skin, SKINS, SKIN_EVENT} from '../render/skin.js';
import {minds} from '../render/minds.js';
import {introWanted, playIntro, introEnabled, setIntroEnabled} from './intro.js';

import {$, seg, press} from '../ui/dom.js';
const SCREENS = ['home', 'quick', 'land', 'settle', 'campaign', 'settings', 'bestiary'];
const OBSERVER = new Set(['settle', 'campaign']);   // the screens laid out as the observer's: no page scroll, the map fills the window
const STORE = 'forest.app.quick';
const randomSeed = () => String(100000 + Math.floor(Math.random() * 899999));

let screen = 'home', land = null, settle = null, campaign = null, beasts = null, quickShell = null;
function show(id) {
  // the screen left halts its clock between frames (it goes on when the screen is back)
  if (screen !== id) { if (screen === 'land') { land?.stop(); land?.hide(); } if (screen === 'settle') { settle?.stop(); settle?.hide(); } if (screen === 'campaign') campaign?.halt(); if (screen === 'quick') quickShell?.leave(); }
  screen = id;
  for (const s of SCREENS) $(s).hidden = s !== id;
  document.body.classList.toggle('observer', OBSERVER.has(id));
  if (id === 'settings') tables.show();
  if (id === 'bestiary') (beasts ||= new BeastView()).show();
  if (id === 'land') (land ||= new LandView()).show();
  if (id === 'quick') (quickShell ||= new QuickShell({})).enter();   // (the form in the shell's frame: ui/shell/landShell.js)
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
  if (screen === 'settle') { settle?.stop(); settle?.hide(); } if (screen === 'quick') quickShell?.leave(); if (screen === 'land') { land?.stop(); land?.hide(); }
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
  seg('setSkinSeg', SKINS, skin.mode, v => skin.set(v), {toggle: true});   // (pressed by the switch itself: SKIN_EVENT)
  document.addEventListener(SKIN_EVENT, () => press('setSkinSeg', skin.mode));
}
// G (П in the Russian layout): the look of the maps, pictures or the plain scheme (render/skin.js), on any screen
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select')) return;
  if (e.code === 'KeyG' || e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') skin.toggle();
  if (e.code === 'KeyF' || e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') minds.toggle();   // the overmind's marks (render/minds.js)
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
// the years of the eras (data/history.js EPIC_YEARS: a world of the campaign screen draws them 75–150 by its seed; the quick
// start sets them by hand — a short elder era leaves the young peoples room)
const ERA_SLIDERS = [['wild', 'quickWild', 100], ['elder', 'quickElder', 60], ['young', 'quickYoung', 120]];
quick.years = Object.fromEntries(ERA_SLIDERS.map(([id, , d]) => [id, Math.max(10, Math.min(150, Math.round((quick.years?.[id] ?? d) / 5) * 5))]));
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

seg('quickSize', EPIC_SIZES, quick.size, v => { quick.size = v; keep(); });
for (const [id, el] of ERA_SLIDERS) {
  const r = $(el), out = $(`${el}V`);
  r.value = quick.years[id]; out.textContent = `${quick.years[id]} лет`;
  r.addEventListener('input', () => { quick.years[id] = +r.value; out.textContent = `${r.value} лет`; keep(); });
}

// the epic campaign: a new world with a long history on the campaign screen, then the capital and the walk
$('quickGo').addEventListener('click', () => {
  if (!seedBox.value.trim()) { quick.seed = seedBox.value = randomSeed(); }
  keep();
  openCampaign(v => { v.show('epic'); v.startEpic({seed: seedBox.value.trim(), size: quick.size, years: {...quick.years}}); });
});

// ── settings: the tables of src/data/schema/
const tables = new TablesView();
// the settled world's dock (the tabs under the map) is wired once the screen exists
mountTabs($('setDock'));

$('buildTag').textContent = `версия ${VERSION}${editCount() ? ` · правки таблиц: ${editCount()}` : ''}${BOOT_PROBLEMS.length ? ' · ⚠' : ''}`;
// forest.html#settings and the like open that screen
show(SCREENS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
// the launch screen over the menu (app/intro.js): «Далее ›», «Пропустить всё», press and hold to skip; the tick in settings
const intro = () => playIntro({title: $('appTitle').textContent});
$('setIntro').checked = introEnabled();
$('setIntro').addEventListener('change', e => setIntroEnabled(e.target.checked));
$('setIntroPlay').addEventListener('click', e => intro().then(() => e.target.focus({preventScroll: true})));
if (introWanted()) intro().then(() => document.querySelector('#home .launch-card')?.focus({preventScroll: true}));
