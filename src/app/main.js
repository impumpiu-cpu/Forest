// The menu (forest.html, Forest.bat), docs/GAME.md «Главное меню»: Продолжить (the last game, if any: ui/autosave.js) ·
// Новая игра — Гильдия (the game: ui/guildView.js) or Быстрая кампания (the old walk of one caravan, a testing ground);
// Модификации — Создать землю · Заселение мира · Конструктор существ · Таблицы; Настройки; Об игре.
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
import {worldRow} from '../ui/campaignView.js';
import {GuildView} from '../ui/guildView.js';
import {QuickShell} from '../ui/shell/landShell.js';
import {MARCH_EVENT} from './campView.js';
import {mountTabs} from '../ui/tabs.js';
import {skin, SKINS, SKIN_EVENT} from '../render/skin.js';
import {minds, MINDS_EVENT} from '../render/minds.js';
import {introWanted, playIntro, introEnabled, setIntroEnabled} from './intro.js';
import {lastRun, continueOf, forgetRun} from '../ui/autosave.js';
import {listWorlds} from '../ui/worlds.js';
import {plural, esc} from '../core/util.js';

import {$, seg, press} from '../ui/dom.js';
const SCREENS = ['home', 'quick', 'land', 'settle', 'campaign', 'settings', 'prefs', 'bestiary', 'about'];   // (#quick — «Новый поход», #settings — «Таблицы», #prefs — «Настройки»)
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
  if (id === 'home') renderResume();
  if (id === 'quick') renderLibrary();
  if (id === 'settings') tables.show();
  if (id === 'bestiary') (beasts ||= new BeastView()).show();
  if (id === 'land') (land ||= new LandView()).show();
  if (id === 'quick') (quickShell ||= new QuickShell({})).enter();   // (the form in the shell's frame: ui/shell/landShell.js)
  if (id === 'settle') (settle ||= new SettleView()).show();
  if (id === 'campaign') theCampaign().show('library', {guild: quickMode === 'guild'});
  window.scrollTo(0, 0);
  // the maps size themselves to the window: a screen just shown draws once its box is laid out
  requestAnimationFrame(() => { if (id === 'settle') settle?.draw(); if (id === 'campaign') campaign?.draw(); });
}
// the campaign screen (ui/campaignView.js), made when first needed; «← Главное меню» there comes back here
function theCampaign() {
  if (!campaign) { campaign = new GuildView({onBack: () => show('home')}); mountTabs($('campDock')); }   // (the campaign's screen with the guild on it: ui/guildView.js)
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
// «Продолжить»: the last walk saved (ui/autosave.js), shown once its save is written (leaving the walk saves it)
let resumeFor = null;
async function renderResume() {
  const card = $('launchResume');
  await campaign?.saving?.catch(() => null);
  let run = null;
  try { run = continueOf(lastRun(), await listWorlds()); } catch (e) { /* the library unavailable: nothing to continue */ }
  if (!run && lastRun()) forgetRun();   // (its world is gone from the library, or the walk is over)
  resumeFor = run; card.hidden = !run;
  if (!run) return;
  const years = Math.floor(run.day / 120), rest = run.day % 120;
  $('launchResumeText').innerHTML = `${run.guild ? `Гильдия «${esc(run.guild)}» · ${years ? `${years} ${plural(years, 'год', 'года', 'лет')} и ` : ''}${rest} ${plural(rest, 'день', 'дня', 'дней')} с основания` : `Поход из ${esc(run.from)} · ${years ? `${years} ${plural(years, 'год', 'года', 'лет')} и ` : ''}${rest} ${plural(rest, 'день', 'дня', 'дней')} в пути`}` +
    `<br><small>${esc(run.name)}${run.year != null ? ` · ${run.year}-й год мира` : ''} · сохранено ${new Date(run.savedAt).toLocaleString('ru-RU', {day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'})}</small>`;
}
$('launchResume').addEventListener('click', () => { if (resumeFor) { const {id, name} = resumeFor; quickMode = resumeFor.guild ? 'guild' : 'campaign'; openCampaign(v => (v.guildOn = !!resumeFor.guild, v.continueRun(id, name))); } });
// «Новый поход»: the worlds of the library a caravan can set out from (not a bare land); a row opens the world on the
// campaign screen at its capital, a walk under way goes on
async function renderLibrary() {
  const box = $('newWorlds');
  await campaign?.saving?.catch(() => null);
  let list;
  try { list = (await listWorlds()).filter(r => r.type !== 'land'); } catch (e) { box.innerHTML = '<small>Библиотека в этом браузере недоступна.</small>'; return; }
  box.innerHTML = list.length ? list.map(r => worldRow(r)).join('') : '<small>Пока пусто: сотворите мир слева — он ляжет сюда сам.</small>';
}
$('newWorlds').addEventListener('click', e => {
  const row = e.target.closest('.sv'); if (!row) return;
  const {id, name, live} = row.dataset;
  const guild = quickMode === 'guild' || row.textContent.includes('гильдия «');   // (a world with a guild opens as the guild's)
  openCampaign(v => (live ? (v.guildOn = guild, v.continueRun(id, name)) : (v.show('library', {guild}), v.openFromLibrary(id, name))));
});
// «В поход →» of the world settled (app/campView.js march): that world from the library, on the campaign screen
document.addEventListener(MARCH_EVENT, e => openCampaign(v => { v.show('library', {guild: false}); v.openFromLibrary(e.detail.id, e.detail.name); }));

document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  show(b.dataset.go);
});
// the look of the maps on the settings screen («Настройки», #prefs): a row of two buttons that follows the switch
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
// the overmind's marks on the settings screen: a tick that follows the switch (F)
$('setMinds').checked = minds.on;
$('setMinds').addEventListener('change', e => minds.set(e.target.checked));
document.addEventListener(MINDS_EVENT, () => { $('setMinds').checked = minds.on; });
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
const makeEpic = () => openCampaign(v => { v.show('epic', {guild: quickMode === 'guild'}); v.startEpic({seed: quick.seed, size: quick.size, years: {...quick.years}}); });
$('quickGo').addEventListener('click', () => {
  if (!seedBox.value.trim()) { quick.seed = seedBox.value = randomSeed(); }
  keep(); makeEpic();
});
// «Новая игра»: the guild or the quick campaign — the same «Новый мир / Мир из библиотеки» screen (#quick), its title and
// what opens after (the capital to found the guild in, or to send a caravan from) by the mode
let quickMode = 'guild';
function newGame(mode) {
  quickMode = mode;
  $('quickTitle').textContent = mode === 'guild' ? 'Новая гильдия' : 'Быстрая кампания';
  show('quick');
}
$('launchGuild').addEventListener('click', () => newGame('guild'));
$('launchCampaign').addEventListener('click', () => newGame('campaign'));

// ── settings: the tables of src/data/schema/
const tables = new TablesView();
// the settled world's dock (the tabs under the map) is wired once the screen exists
mountTabs($('setDock'));

$('aboutVersion').textContent = `версия ${VERSION}`;
$('buildTag').textContent = `версия ${VERSION}${editCount() ? ` · правки таблиц: ${editCount()}` : ''}${BOOT_PROBLEMS.length ? ' · ⚠' : ''}`;
// forest.html#settings and the like open that screen
show(SCREENS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
// the launch screen over the menu (app/intro.js): «Далее ›», «Пропустить всё», press and hold to skip; the tick in settings
const intro = () => playIntro({title: $('appTitle').textContent});
$('setIntro').checked = introEnabled();
$('setIntro').addEventListener('change', e => setIntroEnabled(e.target.checked));
$('setIntroPlay').addEventListener('click', e => intro().then(() => e.target.focus({preventScroll: true})));
if (introWanted()) intro().then(() => document.querySelector('#home .launch-card:not([hidden])')?.focus({preventScroll: true}));
