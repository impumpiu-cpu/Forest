// The «Кампания» screen: a world from the library, a capital, and then the caravan walks the world
// like a screensaver. The core runs a season at a time (campaign/index.js stepCampaign: the world's
// season with the caravan's thirty days in it); the screen then plays the season back day by day —
// the caravan slides along the day's positions (K.track), the world's parties slide as on the «Мир»
// screen. The map is the «Мир» screen's own drawing (ui/atlasView.js), with the fog, the caravan, its
// way, its goal and its home on top. A fight or a stop the core played on the local map (campaign/camp.js)
// is played again over the map when the playback reaches its day: the same setup gives the same camp.
import {wireMindsButton} from '../render/minds.js';
import {skin} from '../render/skin.js';
import {ART} from '../render/art/index.js';
import {segOf, loadDetail, saveDetail, exportChronicle, MapView, ATLAS_OPTS} from './atlasView.js';
import {DETAILS} from '../view/world.js';
import {listWorlds, openWorld, saveWorldToLibrary} from './worlds.js';
import {capitals, newCampaign, stepCampaign, ended, finished, alive, pace, chronicleText} from '../view/campaign.js';
import {boardFor, nextErrand, endCampaign} from '../view/campaign.js';
import {ERRANDS, TIER_LABEL} from '../data/errands.js';
import {readLines, lineLevel, dateOf} from '../view/campaign.js';
import {CHRONICLE} from '../data/campaign.js';
import {offerText, latinTitle} from './store.js';
import {CAMPAIGN, RETINUE, EPIC_SIZES} from '../data/campaign.js';
import {EPIC} from '../data/calamities.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {SEASONS} from '../data/seasons.js';
import {raceLabel} from '../view/local.js';
import {atlasDone, newAtlas, runNextStage, landDone} from '../view/world.js';
import {eraPlan, historyLength, seasonLabel} from '../view/world.js';
import {ERAS} from '../data/history.js';
import {plural, esc} from '../core/util.js';
import {$, seg, press} from './dom.js';
import {CampShell} from './shell/campShell.js';
import {SAY_EVENT} from './shell/shell.js';
import {CampSetupShell} from './shell/landShell.js';
import {WorldChron} from './worldChron.js';
import {TickClock, dateText, paceOf} from '../core/clock.js';
import {mountPace} from './pace.js';
import {openTab} from './tabs.js';
import {gearDef} from '../view/local.js';
import {alignLabel, axisWord} from '../data/values.js';
import {warnEdits} from './tableEdits.js';
import {Camera} from '../render/camera.js';
import {BUILDINGS} from '../data/buildings.js';
import {BEASTS} from '../data/transport.js';
import {BUBBLE, THINGS} from '../data/bubble.js';
import {scaleOf} from '../view/world.js';
import {townLabel} from '../view/world.js';
import {capacity, load, wheeled} from '../view/campaign.js';
import {baggageText, rank, isCore, levelOn, toNext} from '../view/campaign.js';
import {meetingsOf, meetingHtml, memberCardHtml, drawFire, fireWords, fireSteps, fireLines} from './campSocial.js';
const FIRE_STEP_MS = 1400;   // a speaker's turn at the fire on the screen (the meeting is decided; this is only its telling)
import {Renderer} from '../render/renderer.js';
import {questHint} from '../view/world.js';
import {RESOURCES} from '../data/resources.js';
import {stockHtml} from './cards.js';
import {WALK_PHASES} from '../data/labels.js';
import {campLocal, WATCH} from './campLocal.js';
import {campStats} from './campStats.js';
import {PROFILES, commandOf} from '../data/commands.js';
import {loadHeroes, saveHeroes} from './heroes.js';
import {saveDue, rememberRun, forgetRun} from './autosave.js';
import {ASCEND, mayAscend, ascend, summonable, takeHeroes} from '../view/campaign.js';
const phaseWord = p => WALK_PHASES[p]?.label || p;
// the phase in the words of its errand: an errand of a lair is no crown sought (campaign/errands.js)
const walkWord = (K, p) => (p === 'empty' ? phaseWord(p) : K?.quest?.how === 'lair' && p === 'out' ? `идут к логову: ${K.quest.crown.label}` : K?.quest?.how === 'lair' && p === 'back' ? `несут ${K.quest.acc[0].toLowerCase()}${K.quest.acc.slice(1)} в столицу` : phaseWord(p));
// the name of a world in the library without a walk's tail («Мир: поход из …» saved again for a new walk stays «Мир: поход из …»)
export const baseName = n => String(n || 'Мир').replace(/: поход из .*$/, '').replace(/: гильдия .*$/, '');
// a world of the library as a row of a list (here and on «Новый поход», app/main.js): its button «Продолжить» for a walk
// under way, «Открыть» otherwise; `data-live` marks the walk under way
export function worldRow(r, cur = false) {
  const live = (r.campaign && !WALK_PHASES[r.campaign.phase]?.done) || (r.guild && r.guild.phase !== 'over');   // (a walk under way, or a guild: ui/guildView.js)
  return `<div class="sv${cur ? ' cur' : ''}" data-id="${esc(r.id)}" data-name="${esc(r.name)}"${live ? ' data-live="1"' : ''}><span class="t"><b>${esc(r.name)}</b> · ${esc(r.sizeLabel)}${r.epic ? ' · эпический' : r.free ? ' · заселённый' : ''}${r.tables ? ` · с правками таблиц (${r.tables})` : ''} · ${r.year} лет` +
    (r.guild ? `<br><small>гильдия «${esc(r.guild.name)}»: ${r.guild.phase === 'over' ? 'закрыта' : `людей ${r.guild.people}`}, ${Math.round(r.guild.day / 12) / 10} лет с основания</small>` : r.campaign ? `<br><small>поход из ${esc(r.campaign.from)}: ${phaseWord(r.campaign.phase)}, ${Math.round(r.campaign.day / 12) / 10} лет в пути${r.campaigns ? ` · окончено походов: ${r.campaigns}` : ''}</small>` : `<br><small>городов ${r.towns} · держав ${r.realms}${r.done ? '' : ' · история не дожита'}</small>`) +
    `</span><button type="button">${live ? 'Продолжить' : 'Открыть'}</button></div>`;
}
// the board of a capital as cards to pick one of (campaign/errands.js boardFor; the screen's two boards: at the capital, and after
// an errand handed in): a card of a known place for each of its nearest lairs, the guard against the company in words, what the
// world tells of the target; a card is a radio (the keys go over them), the unavailable greyed with why
//   list — boardFor; pick — the card's id picked; name — the radios' group
export function errandCards(list, pick, name) {
  return list.map(e => `<label class="sv${e.ok ? '' : ' off'}${e.id === pick ? ' cur' : ''}" data-card="${esc(e.id)}"><input type="radio" name="${name}" value="${esc(e.id)}"${e.id === pick ? ' checked' : ''}${e.ok ? '' : ' disabled'}>` +
    `<span class="t"><span class="tier">${TIER_LABEL[e.tier]}</span><b>${esc(e.label)}</b>${e.years ? ` · срок ${e.years} ${plural(e.years, 'год', 'года', 'лет')}` : ''} · плата ${e.gold} зол.` +
    `<br><small>${esc(e.ok ? e.goal || e.about : e.why)}</small>` +
    (e.ok && e.guard != null ? `<br><small class="risk r-${RISK_CLASS[e.risk] || 0}">стража ≈ ${String(e.guard).replace('.', ',')} отряда · ${esc(e.risk)}${e.days ? ` · от ${e.days} дн. пути` : ''}${e.known ? '' : ' · где — укажут следы'}</small>` : '') +
    (e.ok && e.facts.length ? e.facts.map(f => `<br><small class="fact">${esc(f)}</small>`).join('') : '') +
    `</span></label>`).join('');
}
const BOARD_ZOOM = 2.5;   // how close the camera comes to a card's target when it is picked (lookAtCard)
const RISK_CLASS = {'по силам': 1, 'тяжело': 2, 'опасно': 3, 'не по силам': 4};
// the card picked by default: the one asked for if the world has it, else the world's own (the calamity, else the crown), else the first it has
export const errandPicked = (list, want) => (list.find(e => e.id === want && e.ok) || list.find(e => e.id === 'calamity' && e.ok) || list.find(e => e.id === 'crown' && e.ok) || list.find(e => e.ok))?.id ?? null;
export const clockTime = t => new Date(t).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
export const itemShort = id => gearDef(id)?.short ?? id;

// the pace: ms a season is played back over (a day is a thirtieth of it); «сразу» — as many seasons as fit a frame
// the layers of the campaign's map: these of the «Мир» map's (ui/atlasView.js ATLAS_OPTS)
const CAMP_LAYERS = ['relief', 'biomes', 'peoples', 'realms', 'fauna', 'wild', 'rot'];
const LAYERS = () => CAMP_LAYERS.map(id => ATLAS_OPTS.layer.find(([k]) => k === id)).filter(Boolean);
// where the making of an epic world is: the land, or the year of history and its era
function epicProgress(a, sec) {
  if (!landDone(a) || !a.hist) return `Складывается земля… ${Math.round(sec)} с`;
  const plan = eraPlan(a), years = plan.map(e => e.seasons / 4), all = historyLength(a);
  const era = ERAS.has(a.hist.era) ? ERAS.get(a.hist.era).label : a.hist.era;
  return `${era}: год ${a.hist.year} из ${years.reduce((s, y) => s + y, 0)} (эпохи ${years.join(' + ')} лет) · ${Math.round(a.hist.step / all * 100)}% · ${Math.round(sec)} с`;
}

// the hidden themes of the chronicle, remembered in this browser
function loadHidden() { try { return new Set(JSON.parse(localStorage.getItem('forest.campTopics') || '[]')); } catch (e) { return new Set(); } }
function saveHidden(set) { try { localStorage.setItem('forest.campTopics', JSON.stringify([...set])); } catch (e) { /* storage unavailable */ } }

export class CampaignView extends campStats(campLocal(MapView)) {
  setup({onBack} = {}) { this.onBack = onBack; }   // («← Главное меню»: app/main.js)
  // the «Мир» screen's controls are not built here: only the campaign's
  build() {
    this.layer = 'peoples'; this.capPick = null; this.logShown = 0; this.fog = null; this.fogKey = '';
    this.wireCamera({map: 'campMap', readout: 'campReadout', inspect: 'campInspect', dock: 'campDock', zoomIn: 'campZoomIn', zoomOut: 'campZoomOut', zoomFit: 'campZoomFit', skin: 'campSkin', screen: 'campaign',
      hint: 'Наведите на карту, чтобы увидеть клетку.'});
    seg('campLayer', LAYERS(), this.layer, v => { this.layer = v; this.draw(); });
    // the dock's «Склад»: the camp's stock by groups while a camp is on the map, the caravan's cargo between camps
    this.stockAll = false;
    seg('campStockSeg', [['have', 'что есть'], ['all', 'всё']], 'have', v => { this.stockAll = v === 'all'; this.renderStock(); });
    this.ticks = new TickClock();   // the local map's clock while a camp is watched
    this.syncPaceBox = mountPace($('campSpeed'), this.clock, {pauseId: 'campPause', active: () => !$('campaign').hidden,
      onPace: id => {
        if (this.making) { this.clock.setPace(id); this.genPaused = false; this.syncRun(); return; }   // (a world being made: its pace — makeEpic)
        this.clock.setPace(id); this.ticks.pace = this.localPace(id);
        if (this.local && !WATCH[id] && !this.local.c.boss) this.endLocal();   // «Сразу»: the camps are not watched — the one on the map is left (a named fight is)
        if (this.clock.paused && !this.local) { this.clock.resume(); this.animate(); }
        this.syncRun();
      },
      onPause: () => { if (this.making) { this.genPaused = !this.genPaused; this.syncRun(); return; } const K = this.atlas?.campaign; if (!K || finished(K) || K.phase === 'home') return; if (this.local) this.ticks.paused = !this.ticks.paused; else { this.clock.toggle(); if (!this.clock.paused) this.animate(); else this.renderSide(); } this.syncRun(); }});   // (going on: the rest of the season plays out)
    $('campWorlds').addEventListener('click', e => { const row = e.target.closest('.sv'); if (row) this.openFromLibrary(row.dataset.id, row.dataset.name); });
    // a capital: a click on its card marks it on the map, its button sets the caravan out from it at once
    $('campCaps').addEventListener('click', e => {
      const row = e.target.closest('.sv'); if (!row) return;
      this.capPick = +row.dataset.town;   // (picked only: the errand and «Выступить» are above the list — renderErrands)
      this.renderCaps(); this.draw();
      $('campErrandsField').scrollIntoView?.({block: 'nearest'});
    });
    $('campGo').addEventListener('click', () => this.begin());
    // the errand of the capital picked (data/errands.js), and the next one after an errand handed in
    $('campErrands').addEventListener('change', e => { const r = e.target.closest('input[name="errand"]'); if (r) { this.errandPick = r.value; this.renderErrands(); this.lookAtCard(r.value); } });
    $('campOfferList').addEventListener('change', e => { const r = e.target.closest('input[name="offer"]'); if (r) { this.offerPick = r.value; $('campOfferList').querySelectorAll('.sv').forEach(x => x.classList.toggle('cur', x.dataset.card === r.value)); this.lookAtCard(r.value); } });
    // a card under the pointer or the keys: its target ringed on the map (the camera stays: a pick moves it — lookAtCard)
    for (const id of ['campErrands', 'campOfferList']) {
      const box = $(id), hover = card => { if ((card ?? null) !== this.boardHover) { this.boardHover = card ?? null; this.draw(); } };
      box.addEventListener('pointerover', e => hover(e.target.closest('[data-card]')?.dataset.card));
      box.addEventListener('pointerleave', () => hover(null));
      box.addEventListener('focusin', e => hover(e.target.closest('[data-card]')?.dataset.card));
      box.addEventListener('focusout', () => hover(null));
    }
    $('campOfferGo').addEventListener('click', () => this.takeOffer());
    $('campOfferEnd').addEventListener('click', () => this.endOffer());
    // the ascended this capital may summon (ui/heroes.js, campaign/ascend.js): ticked up to ASCEND.max
    this.heroPick = new Set();
    $('campHeroes').addEventListener('change', e => {
      const box = e.target.closest('input[data-uid]'); if (!box) return;
      if (box.checked && this.heroPick.size >= ASCEND.max) { box.checked = false; return; }
      box.checked ? this.heroPick.add(box.dataset.uid) : this.heroPick.delete(box.dataset.uid);
    });
    // raise the living of a company home with the crown (once)
    $('campAscend').addEventListener('click', async () => {
      const a = this.atlas, K = a?.campaign; if (!K || !mayAscend(K).length) return;
      try { await saveHeroes(ascend(a, K, await loadHeroes())); $('campSaveStatus').textContent = 'Выжившие вознесены: их можно призвать в новом походе.'; }
      catch (e) { $('campSaveStatus').textContent = 'Не удалось вознести: ' + e.message; }
      this.syncRun(); this.renderSide();
    });
    // the world's chronicle into a file: by its eras at the detail chosen, or the calamities only (atlas/chronicle.js)
    this.detail = loadDetail();
    // one detail for the file and for «Летопись мира» on screen (ui/worldChron.js): two rows of buttons that follow each other
    const detail = v => { this.detail = v; saveDetail(v); press('campDetail', v); press('campWorldDetail', v); this.renderWorldLog(); };
    segOf($('campDetail'), DETAILS, this.detail, detail);
    segOf($('campWorldDetail'), DETAILS, this.detail, detail);
    this.worldChron = new WorldChron($('campWorldLog'), {land: true, empty: 'Летопись мира появится, когда мир начнут творить или откроют из библиотеки.'});
    const file = what => { const a = this.atlas; if (a) exportChronicle(a, this.worldName, what); };
    $('campWorldFile').addEventListener('click', () => file(this.detail));
    $('campWorldFile3').addEventListener('click', () => file(this.detail));
    $('campCalFile').addEventListener('click', () => file('calamity'));
    $('campWorldFile2').addEventListener('click', () => file(this.detail));
    // a new epic world (cfg.epic: three eras of 75–150 years), made here and put into the library
    this.epicSize = 'medium';
    seg('campEpicSize', EPIC_SIZES, this.epicSize, v => { this.epicSize = v; });
    // which commands the world's minds may choose (data/commands.js PROFILES), as in the world's own settings
    this.epicProfile = 'full';
    seg('campEpicProfile', PROFILES.all().map(p => [p.id, p.label]), this.epicProfile, v => { this.epicProfile = v; });
    $('campEpicSeed').value = String(Math.floor(Math.random() * 1e6));
    $('campEpicDice').addEventListener('click', () => { if (!this.making) $('campEpicSeed').value = String(Math.floor(Math.random() * 1e6)); });
    $('campEpicGo').addEventListener('click', () => (this.making ? this.stopEpic() : this.makeEpic()));
    $('campNew').addEventListener('click', () => { this.halt(); this.atlas = null; this.worldId = null; this.setupMode(); this.refresh(); });
    $('campSave').addEventListener('click', () => this.saveRun());
    $('campBack').addEventListener('click', () => { this.halt(); this.onBack(); });
    // following the caravan: it stays in the middle, near enough to see its bubble; a drag stops it
    this.follow = true;
    $('campFollow').addEventListener('click', () => { this.follow = !this.follow; if (this.follow) this.closeUp(); this.syncFollow(); this.draw(); });
    // the camps on the local map: watched as the playback reaches their day, or not at all
    this.watch = true; this.queue = []; this.local = null;
    $('campWatch').addEventListener('click', () => { this.watch = !this.watch; $('campWatch').setAttribute('aria-pressed', String(this.watch)); if (!this.watch) this.endLocal(); });
    $('campLocalSkip').addEventListener('click', () => this.endLocal());
    wireMindsButton($('campMinds'));   // the overmind's marks on the camp's map (render/minds.js)
    this.localR = new Renderer($('campLocal'));
    // a click on the camp's map: the card of the creature there, else the building, else the cell (ui/cards.js)
    this.wireLocalCamera();   // the camp's map zooms and pans on its own camera (ui/campLocal.js)
    $('campLocal').addEventListener('click', e => { if (this.localDragged) { this.localDragged = false; return; } this.pickLocal(e); });
    // the chronicle: themes to hide (remembered in this browser), one member's lines, the text into a file
    this.hidden = loadHidden(); this.who = null; this.logKey = '';
    const tp = $('campTopics');
    tp.innerHTML = CHRONICLE.topics.map(t => `<button type="button" data-val="${t.id}" aria-pressed="${!this.hidden.has(t.id)}">${t.label}</button>`).join('');
    tp.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const id = b.dataset.val; if (this.hidden.has(id)) this.hidden.delete(id); else this.hidden.add(id); b.setAttribute('aria-pressed', String(!this.hidden.has(id))); saveHidden(this.hidden); this.renderLog(); });
    $('campDock')?.addEventListener('tab', e => { if (e.detail?.id === 'fire') this.fire?.show?.(); });   // (the pane shown: the scene drawn at its real size)
    $('campRoster').addEventListener('click', e => { const row = e.target.closest('.rm'); if (!row) return; const id = +row.dataset.id; this.who = this.who === id ? null : id; this.pickMember?.(this.who); this.renderSide(); });
    $('campWho').addEventListener('click', e => { if (e.target.closest('button')) { this.who = null; this.renderSide(); } });
    $('campExport').addEventListener('click', () => { const K = this.atlas?.campaign; if (K) offerText(latinTitle(`letopis-${K.capitalName}-${K.started?.year ?? ''}`), chronicleText(this.atlas, K)); });
    $('campPast').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const P = this.atlas?.campaignsDone?.[+b.dataset.k]; if (P) offerText(latinTitle(`letopis-${P.from}-${P.started?.year ?? ''}`), chronicleText(this.atlas, P)); });
    $('campAgain').addEventListener('click', () => { this.halt(); this.capPick = null; this.setupMode(); this.draw(); });
    // the page hidden (another tab, the window folded, the browser closing): the walk is saved as it stands (ui/autosave.js)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.autosave(true); });
    window.addEventListener('pagehide', () => this.autosave(true));
  }

  // ── a new epic world: the land stage by stage, then the long history, as many steps as fit a frame; the map is
  // drawn now and then. When it is done it goes into the library and the capitals can be chosen
  makeEpic() {
    this.halt(); this.seq = (this.seq || 0) + 1;   // a library world still loading is not shown over this one
    (this.setupShell ||= new CampSetupShell(this)).enter();   // the world grows on the setup's screen: its map in the middle, «Летопись мира» along the bottom
    const seed = $('campEpicSeed').value.trim() || String(Math.floor(Math.random() * 1e6));
    const a = newAtlas({seed, size: this.epicSize, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true, profile: this.epicProfile, ...(this.epicYears ? {epicYears: this.epicYears} : {})});
    this.atlas = a; this.worldId = null; this.worldName = `Эпический мир ${seed}`; this.saveId = null; this.capPick = null;
    this.cam = new Camera(a.w, a.h); this.bitmap = null; this.bitmapKey = ''; this.fogKey = ''; this.logShown = 0;
    this.making = true; this.genPaused = false; $('campEpicGo').textContent = 'Остановить';
    this.paceBefore = this.clock.pace; this.clock.setPace('max');   // (a quick start is made as fast as it goes; the pace buttons slow it to watch it grow; the walk's pace comes back after)
    $('campRun').hidden = false; $('campDay').textContent = ''; this.syncRun();
    $('campCapsField').hidden = true; $('campTitle').textContent = this.worldName;
    const t0 = performance.now();
    let drawn = 0, stepAt = 0;
    // the pace (core/clock.js PACE, the same buttons as the walk's): «Сразу» — as many stages as fit a frame; a slower pace —
    // a season of history at its season's time, so the world can be watched as it grows; the land's stages always at once;
    // the pause holds it
    const loop = () => {
      if (!this.making || a !== this.atlas) return;
      const f0 = performance.now(), P = paceOf(this.clock.pace);
      if (!this.genPaused) {
        if (!P.season || !a.hist) { while (!atlasDone(a) && performance.now() - f0 < 30 && (!P.season || !a.hist)) runNextStage(a); }
        else if (f0 - stepAt >= P.season) { stepAt = f0; runNextStage(a); drawn = 0; }
      }
      if (performance.now() - drawn > 600) { drawn = performance.now(); this.bitmapKey = ''; this.draw(); $('campEpicNote').textContent = epicProgress(a, (performance.now() - t0) / 1000); this.renderWorldLog(); }
      if (atlasDone(a)) { this.doneEpic((performance.now() - t0) / 1000, a); return; }
      this.genRaf = requestAnimationFrame(loop);
    };
    this.genRaf = requestAnimationFrame(loop);
  }
  backPace() { if (this.paceBefore) { this.clock.setPace(this.paceBefore); this.paceBefore = null; } this.syncPaceBox?.(); if (!this.atlas?.campaign) $('campRun').hidden = true; }
  stopEpic() { this.dropEpic(); this.setupMode(); this.draw(); }
  // the world being made is let go, unsaved
  dropEpic() {
    this.making = false; this.genPaused = false; this.backPace(); cancelAnimationFrame(this.genRaf); $('campEpicGo').textContent = 'Сотворить';
    this.atlas = null; $('campEpicNote').textContent = 'Остановлено: мир не сохранён.'; this.renderWorldLog();
  }
  async doneEpic(sec, a = this.atlas) {
    this.making = false; this.genPaused = false; this.backPace(); this.syncRun(); $('campEpicGo').textContent = 'Сотворить';
    this.bitmapKey = ''; this.draw();
    const yrs = a.hist.year - 1;   // (the year after the last season is the one history stands at)
    $('campEpicNote').textContent = `Мир сотворён за ${Math.round(sec)} с: ${yrs} ${plural(yrs, 'год', 'года', 'лет')} истории. Сохраняю в библиотеку…`;
    try {
      const rec = await saveWorldToLibrary(a, this.worldName);
      this.worldId = rec.id; this.worldName = rec.name;
      $('campEpicNote').textContent = `Мир сотворён за ${Math.round(sec)} с: ${yrs} ${plural(yrs, 'год', 'года', 'лет')} истории, ${(rec.bytes / 1e6).toFixed(1)} МБ в библиотеке. Выберите столицу.`;
    } catch (e) { $('campEpicNote').textContent = `Мир сотворён, но не сохранён: ${e.message}. Поход начать можно.`; }
    this.setupMode(); this.refresh();
  }

  dragged() { if (this.follow) { this.follow = false; this.syncFollow(); } }
  syncFollow() { $('campFollow').setAttribute('aria-pressed', String(this.follow)); }
  // a zoom that shows about three bubbles across
  closeUp() {
    const a = this.atlas; if (!a || !this.cam) return;
    this.cam.zoom = Math.max(1, Math.min(a.w, a.h) / (6 * BUBBLE.far * scaleOf(a)));
  }
  draw() {
    const a = this.atlas;
    if (this.follow && a?.campaign && this.cam) { const [x, y] = this.caravanAt(); this.cam.cx = x; this.cam.cy = y; }
    super.draw();
  }

  // mode: 'library' — a world from the library; 'epic' — a new epic world made here, then the walk. Coming in with the
  // other mode, a world not under way is let go (one under way goes on: it is its own world either way)
  show(mode = 'library') {
    if (mode !== this.mode && this.atlas && !(this.atlas.campaign && !finished(this.atlas.campaign))) { this.atlas = null; this.worldId = null; this.capPick = null; }
    this.mode = mode;
    this.refresh(); if (this.atlas?.campaign) { this.runMode(); this.draw(); } else this.setupMode();
  }
  // the quick start (forest.html «Быстрый старт»): this seed and size, made at once
  startEpic({seed, size, years = null} = {}) {
    if (seed) $('campEpicSeed').value = String(seed).slice(0, 24);
    this.epicYears = years;   // (the quick start's years of the eras; none — drawn by the seed, data/history.js EPIC_YEARS)
    if (size && EPIC_SIZES.some(([id]) => id === size)) {
      this.epicSize = size;
      press('campEpicSize', size);
    }
    this.makeEpic();
  }
  // leaving the screen: the walk halts between seasons and waits
  // (a world left half-made is not walked: it is let go)
  halt() { this.hideOffer(); this.autosave(true); this.shell?.leave(); this.setupShell?.leave(); if (this.making) this.dropEpic(); this.endLocal(); this.queue = []; if (this.atlas?.campaign && !finished(this.atlas.campaign)) this.clock.pause(); else this.clock.stop(); this.syncRun(); }

  // ── setup: a world, a capital
  async refresh() {
    const box = $('campWorlds');
    let list;
    try { list = (await listWorlds()).filter(r => r.type !== 'land'); } catch (e) { box.innerHTML = '<small>Библиотека в этом браузере недоступна.</small>'; return; }   // a land has no peoples to march from
    if (!list.length) { box.innerHTML = '<small>Пока нет сохранённых миров: сотворите мир в «Новом походе» главного меню или заселите его в «Заселении мира».</small>'; return; }
    box.innerHTML = list.map(r => worldRow(r, r.id === this.worldId)).join('');
  }

  async openFromLibrary(id, name) {
    this.halt();
    $('campWorldNote').textContent = 'Открываю мир…';
    const seq = this.seq = (this.seq || 0) + 1;   // the last world asked for is the one shown, whichever loads first
    try {
      const a = await openWorld(id);
      if (seq !== this.seq) return;
      if (!atlasDone(a) && !a.campaign) { $('campWorldNote').textContent = 'История этого мира не дожита: доведите её до конца на экране «Мир».'; return; }
      this.atlas = a; this.worldId = id; this.worldName = name; this.saveId = a.campaign ? id : null;
      this.saved = {a, day: a.campaign?.day, mark: a.campaign ? `${a.campaign.day}:${a.campaign.phase}:${finished(a.campaign)}` : '', at: Date.now()};   // (as it lies in the library: nothing to save until the walk goes on)
      if (a.campaign) this.pointAt(a, {id, name});
      this.cam = null; this.bitmap = null; this.bitmapKey = ''; this.fogKey = ''; this.logShown = 0; this.capPick = null;
      this.cam = new Camera(a.w, a.h);
      $('campWorldNote').textContent = warnEdits(a.tables) || '';
      if (a.campaign) { this.clock.paused = true; this.runMode(); if (this.follow) this.closeUp(); if (a.campaign.phase === 'home') this.showOffer(); }
      else this.setupMode();
      this.refresh(); this.draw();
    } catch (e) { $('campWorldNote').textContent = 'Не удалось открыть: ' + e.message; }
  }

  setupMode() {
    this.choosing = true; this.hideOffer();
    this.shell?.leave(); (this.setupShell ||= new CampSetupShell(this)).enter();   // (ui/shell/landShell.js)
    const epic = this.mode === 'epic';
    $('campSetup').hidden = false; $('campRun').hidden = true; $('campRunSide').hidden = true;
    $('campLibField').hidden = epic; $('campEpicField').hidden = !epic;
    $('campName2').textContent = '';
    $('campTitle').textContent = this.atlas ? this.worldName : epic ? 'Эпическая кампания' : 'Кампания';
    $('campCapsField').hidden = !this.atlas;
    $('campWorldChron').hidden = !this.atlas || !this.atlas.hist;
    const past = this.atlas?.campaignsDone || [];
    $('campPastField').hidden = !past.length;
    $('campPast').innerHTML = past.map((P, k) => `<div class="sv"><span class="t"><b>Поход из ${esc(P.from)}</b> · ${phaseWord(P.phase)}<br><small>${P.started?.year ?? '?'}–${P.ended?.year ?? '?'} год · ${P.crown ? esc(P.crown) : ''} · вернулись ${P.members.filter(m => m.core && !m.died).length} из ${P.members.filter(m => m.core).length}</small></span><button type="button" data-k="${k}">В файл</button></div>`).join('');
    this.renderCaps(); this.renderLog(); this.renderWorldLog(true);   // (the world's history up to now: its last lines in sight)
    if (this.atlas && this.setupShell?.open !== 'capital') this.setupShell?.toggle('capital');   // a world chosen: its capitals next
  }
  renderCaps() {
    const a = this.atlas; if (!a) { $('campGo').disabled = true; return; }
    // which quest this world gives (campaign/quest.js makeQuest): its own story in an epic world, else the crown and three clues
    const hint = questHint(a);   // which quest this world gives (campaign/quest.js makeQuest)
    $('campQuestNote').textContent = hint?.kind === 'hand'
      ? `Квест заселённого мира: ${a.artifact.name} — у бедствия «${hint.label}»${hint.boss ? `: ${hint.boss}${hint.phase === 'rise' ? ', оно уже идёт' : ''}` : `, оно поднимется в ${hint.riseAt}-м году — с выходом каравана его логово встанет сразу`}. Логово — цель похода, босс должен пасть${hint.graves ? `; следы — могилы ${hint.graves} прежних боссов` : ''}.`
      : hint
      ? `Квест эпического мира: ${a.artifact.name} уйдёт к четвёртому боссу в дальнее логово; следы — могилы ${a.graves.length} боссов прошлых эпох. Через ${EPIC.doom} ${plural(EPIC.doom, 'год', 'года', 'лет')} начнётся новое бедствие${EPIC.years > EPIC.doom ? `; на поход — ${EPIC.years} ${plural(EPIC.years, 'год', 'года', 'лет')}` : ''}.`
      : 'Квест: корона там, где её потеряла история этого мира; три подсказки в его курганах, логовах, развалинах и городах.';
    const caps = capitals(a);
    $('campCaps').innerHTML = caps.length ? caps.map(c => `<div class="sv cap${c.town === this.capPick ? ' cur' : ''}" data-town="${c.town}"><span class="t"><i style="background:rgb(${WORLD_PEOPLES.get(c.people).color.join(',')})"></i><b>${esc(c.label)}</b> · ${esc(c.peopleLabel)}` +
      `<br><small>${esc(c.realmLabel)}${c.ruler ? ` · ${esc(c.ruler)}` : ' · трон пуст'}${c.align ? ` · <span title="${esc(`${axisWord('order', c.align.order)} · ${axisWord('mercy', c.align.mercy)}`)}">${esc(alignLabel(c.align, 'pl'))}</span>` : ''} · ${c.towns} ${plural(c.towns, 'город', 'города', 'городов')} · ${c.pop} жителей · в свите ${RETINUE[c.people]?.title?.[1] || 'бойцы'}</small></span><button type="button" title="Караван выйдет из этой столицы: поручение и «Выступить» — выше">${c.town === this.capPick ? 'Выбрана' : 'Выбрать'}</button></div>`).join('')
      : '<small>В этом мире нет столиц людей, эльфов, дварфов или зеленокожих.</small>';
    $('campGo').disabled = this.capPick == null;
    this.renderErrands();
    this.renderHeroes();
  }
  // the board of the picked capital (campaign/errands.js boardFor): the unavailable greyed with why
  renderErrands() {
    const a = this.atlas, field = $('campErrandsField');
    if (!a || this.capPick == null) { field.hidden = true; return; }
    const list = this.board = boardFor(a, this.capPick);
    this.errandPick = errandPicked(list, this.errandPick);
    field.hidden = false;
    $('campErrands').innerHTML = errandCards(list, this.errandPick, 'errand');
    const E = ERRANDS.get(this.cardOf(this.errandPick)?.errand);
    if (E && E.how !== 'epic') $('campQuestNote').textContent = E.about;
    $('campGo').disabled = this.errandPick == null;
  }
  async renderHeroes() {
    const a = this.atlas, field = $('campHeroesField');
    if (!a || this.capPick == null) { field.hidden = true; return; }
    const reg = await loadHeroes(), list = summonable(a, this.capPick, reg);
    for (const uid of [...this.heroPick]) if (!list.some(h => h.uid === uid)) this.heroPick.delete(uid);
    field.hidden = !list.length;
    $('campHeroes').innerHTML = list.map(h => `<label class="sv"><span class="t"><input type="checkbox" data-uid="${esc(h.uid)}"${this.heroPick.has(h.uid) ? ' checked' : ''}> <b>${esc(h.name)}</b> · ${esc(SPECIES.get(h.race)?.label || h.race)}, ${h.level}-й уровень${h.maims ? ` · увечий ${h.maims}` : ''}` +
      `<br><small>${esc(h.story.from)}, ${h.story.year ?? '?'}-й год: ${esc(h.story.endedWord)}${h.perks.length ? ` · перков ${h.perks.length}` : ''} · ${esc([...h.gear.hand, h.gear.body].filter(Boolean).map(itemShort).join(', '))}</small></span></label>`).join('');
  }

  async begin() {
    const a = this.atlas; if (!a || this.capPick == null) return;
    // the card's target still there? (the board as it stands now: boardFor) — asked before the ascended leave the registry
    const card = this.cardOf(this.errandPick);
    if (card?.targetId != null && !boardFor(a, this.capPick).some(c => c.id === card.id && c.ok)) { $('campQuestNote').textContent = 'Цель не ждёт: этого логова больше нет на доске.'; this.renderErrands(); return; }
    // the ascended ticked: taken out of the registry at once (no undo), their snapshots into the campaign (K.summoned)
    // (the registry is written only once the campaign is made: a campaign that fails to start loses nobody — Р3)
    let summon = null, rest = null;
    if (this.heroPick?.size) ({reg: rest, snaps: summon} = takeHeroes(await loadHeroes(), [...this.heroPick]));
    newCampaign(a, this.capPick, {summon, errand: card?.errand ?? null, targetId: card?.targetId ?? null, chapters: true});   // (a campaign of chapters: the errand handed in, the next is the player's — offer)
    this.board = null; this.boardHover = null;
    if (rest) { try { await saveHeroes(rest); } catch (e) { $('campSaveStatus').textContent = 'Реестр вознесённых не записан: ' + e.message; } this.heroPick.clear(); }
    if (this.follow) this.closeUp();
    this.saveId = null; this.saved = null; this.logShown = 0; this.logKey = ''; this.who = null;   // (the first season's boundary saves the walk: ui/autosave.js)
    this.runMode(); this.run();
  }

  // ── the walk
  runMode() {
    this.choosing = false;
    $('campSetup').hidden = true; $('campRun').hidden = false; $('campRunSide').hidden = false;
    this.setupShell?.leave(); (this.shell ||= new CampShell(this)).enter();   // the screen laid out as a game (ui/shell/campShell.js)
    const K = this.atlas.campaign;
    $('campTitle').textContent = `Поход из ${K.capitalFrom || K.capitalName}`; $('campName2').textContent = this.worldName || '';
    this.syncRun(); this.renderSide();
    const sw = (c, l) => `<span><i style="background:${c}"></i>${l}</span>`;
    $('campLegend').innerHTML = sw(`rgb(${WORLD_PEOPLES.get(K.people).color.join(',')})`, 'караван (флажок)') + sw('rgba(255,215,110,0.8)', 'путь пешком (пунктир), дом (кольцо)') + sw('rgba(255,211,106,0.75)', 'где искать след (круг), найденный след (ромб: жёлтый — к нему идут, серый — взят)') + sw('rgba(240,110,80,0.8)', 'где-то здесь корона (круг), корона (зубцы; красная — у врагов)') + sw('rgba(240,160,90,0.9)', 'путь с колёсами — по дорогам (длинный штрих)') +
      sw('rgb(40,42,36)', 'туман: чего караван не знает') + '<b>карта</b> — как на экране «Мир»: города, дороги, логова, отряды и войска' +
      sw('rgb(230,80,60)', 'угроза рядом (треугольник; темнее — сыта или не заметила)') + sw('rgb(235,200,90)', 'торговый обоз') + sw('rgb(140,200,110)', 'стадо') + sw('rgba(255,240,200,0.3)', 'кольцо пузыря');
  }
  syncRun() {
    const K = this.atlas?.campaign, done = !this.making && (!K || finished(K));   // (a world being made runs on the same pace buttons)
    $('campAgain').hidden = !done || !K;
    $('campAscend').hidden = !done || !K || !mayAscend(K).length;
    $('campPause').hidden = done; $('campSpeed').hidden = done;
    this.syncPaceBox?.();
    if (this.local) $('campPause').textContent = this.ticks.paused ? 'Дальше' : 'Пауза';
    if (this.making) $('campPause').textContent = this.genPaused ? 'Дальше' : 'Пауза';
  }

  clickAt(e) { if (this.board && this.pickCardAt(e)) return; this.selectAt(e); }   // a click on the world map: a target of the board, else the card of what is here (ui/inspect.js)   // a click on the world map: the card of what is here (ui/inspect.js)
  // the date in the head, with the day of the season the playback is at
  frame() { const a = this.atlas; if (a?.hist) $('campDay').textContent = dateText(a, this.clock, seasonLabel); }

  // the walk runs on the observer's clock (core/clock.js): a season a step; a camp watched on the local map holds the
  // season's playback until it is over
  run() { if (this.atlas?.campaign && !finished(this.atlas.campaign)) this.clock.start(); this.syncRun(); }
  stepSeason() {
    const a = this.atlas; if (!a?.campaign || finished(a.campaign)) return false;
    if (a.campaign.phase === 'home') { this.showOffer(); return false; }   // the errand handed in, its season watched: the player's word (offer)
    const d0 = a.campaign.day;
    const was = ended(a.campaign);
    this.autosave();   // (before the next season is computed: what is saved is what the viewer has just watched — ui/autosave.js)
    stepCampaign(a);
    if (finished(a.campaign)) this.autosave(true);   // the walk is over: kept as it ended, and «Продолжить» lets it go
    if (!was && ended(a.campaign) && this.ids?.dock) openTab($(this.ids.dock), 'summary');   // the walk is over: its sums up front
    // the season's camps to watch, each at its day of the playback
    const W = WATCH[this.clock.pace], K = a.campaign, n = Math.max(1, K.track.length - 1);
    // (a named fight — a boss, a grave's guard, a leader — is shown at any pace, «Сразу» too: the walk is about these)
    this.queue = this.watch ? (K.camps || []).filter(c => c.day >= d0 && (c.boss || (W && (c.kind !== 'stop' || W.stops)))).map(c => ({...c, at: Math.min(1, (c.day - d0) / n)})) : [];
    return !finished(a.campaign);
  }
  afterSeason() { this.renderSide(); this.renderInspect(); this.draw(); this.animate(); }
  afterRun() { this.syncRun(); }
  // the season plays back: a frame loop while the caravan slides along its days, or a camp runs on the local map
  animate() {
    if (this.raf) return;
    const loop = () => {
      this.raf = 0;
      this.frame();
      if (this.local) { this.stepLocal(); this.raf = requestAnimationFrame(loop); return; }
      if (this.queue.length && this.atlas?.campaign && this.clock.running && this.slide() >= this.queue[0].at) { this.startLocal(this.queue.shift()); this.raf = requestAnimationFrame(loop); return; }
      if (this.atlas?.campaign && this.shownDay() !== this.sideDay) this.renderSide();   // the roster and the chronicle follow the playback's day
      if (!this.atlas?.campaign || !this.clock.running || this.slide() >= 1) { this.draw(); return; }
      this.draw(); this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // the campaign's day the screen is at: the season is computed ahead and played back — a camp on the local map is at its
  // own day, the march at the playback's; between seasons, or at the end, the last day computed
  shownDay() {
    const K = this.atlas?.campaign; if (!K) return 0;
    if (this.local) return this.local.c.day - 0.5;   // (a camp being watched: its day is not over — what came of it is not told yet)
    if (ended(K) || K.seasonFrom == null || !(this.clock.running || this.clock.frozen != null)) return K.day;
    const n = Math.max(1, (K.track?.length || 1) - 1);
    return Math.min(K.day, K.seasonFrom + Math.floor(this.slide() * n));
  }
  // as the screen saw it on that day: one who fell or left later is still with them; one who joined later is not yet
  seenAs(m, day) {
    if ((m.joined ?? 0) > day) return null;
    // (one who fell on this day is still on his feet while the day is shown: the camp of that day plays after the day is
    // reached, and the roster must not bury him before it)
    const gone = m.died?.day ?? m.left?.day;
    return gone != null && gone >= day ? {...m, alive: true, died: null, left: null, fate: null, hp: m.died ? 1 : m.hp} : m;
  }
  // where the caravan is at this moment of the playback
  caravanAt() {
    const K = this.atlas.campaign, T = K.track;
    if (!T.length) return [K.x, K.y];
    const t = this.slide(), f = t * (T.length - 1), k = Math.floor(f), u = f - k, p = T[k], q = T[Math.min(T.length - 1, k + 1)];
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  }

  // the fog: what the caravan does not know is dimmed (a bitmap a pixel a cell, rebuilt each season)
  fogBitmap(a, K) {
    const key = `${K.day}:${a.w}`;
    if (this.fog && this.fogKey === key) return this.fog;
    const off = this.fog || document.createElement('canvas'); off.width = a.w; off.height = a.h;
    const px = off.getContext('2d'), img = px.createImageData(a.w, a.h), d = img.data;
    for (let i = 0; i < a.n; i++) if (!K.seen[i]) { d[i * 4] = 10; d[i * 4 + 1] = 12; d[i * 4 + 2] = 9; d[i * 4 + 3] = 190; }
    px.putImageData(img, 0, 0);
    this.fog = off; this.fogKey = key;
    return off;
  }

  overlay(a, px, cam) {
    const K = a.campaign, k = this.unit(a);
    if (!K || this.choosing) {   // choosing: the capitals, the picked one ringed
      for (const c of capitals(a)) {
        const r = (c.town === this.capPick ? 2.4 : 1.4) * Math.max(0.6, k);
        px.strokeStyle = c.town === this.capPick ? '#ffd36a' : 'rgba(255,250,235,0.7)'; px.lineWidth = Math.max(this.minW, 0.25 * k);
        px.beginPath(); px.arc(c.x + 0.5, c.y + 0.5, r, 0, Math.PI * 2); px.stroke();
      }
      this.drawBoard(a, px, k);
      return;
    }
    px.imageSmoothingEnabled = false;
    px.drawImage(this.fogBitmap(a, K), 0, 0, a.w, a.h);
    const [x, y] = this.caravanAt(), col = WORLD_PEOPLES.get(K.people).color, r = Math.max(0.7, 1.1 * k);
    // the way ahead, the goal, home
    if (K.path && K.k < K.path.length && !ended(K)) {
      px.strokeStyle = wheeled(K) ? 'rgba(240,160,90,0.75)' : 'rgba(255,215,110,0.6)'; px.lineWidth = Math.max(this.minW, (wheeled(K) ? 0.26 : 0.18) * k); px.setLineDash(wheeled(K) ? [1.1 * k, 0.4 * k] : [0.5 * k, 0.6 * k]);
      px.beginPath(); px.moveTo(K.x, K.y);
      for (let q = K.k; q < K.path.length; q++) px.lineTo(K.path[q] % a.w + 0.5, ((K.path[q] / a.w) | 0) + 0.5);
      px.stroke(); px.setLineDash([]);
    }
    const mark = (i, color, size) => { const gx = i % a.w + 0.5, gy = ((i / a.w) | 0) + 0.5, s = size * Math.max(0.6, k); px.strokeStyle = color; px.lineWidth = Math.max(this.minW * 1.5, 0.3 * k); px.beginPath(); px.moveTo(gx - s, gy - s); px.lineTo(gx + s, gy + s); px.moveTo(gx + s, gy - s); px.lineTo(gx - s, gy + s); px.stroke(); };
    if (K.goal != null && K.phase === 'out' && !K.quest) mark(K.goal, '#ffd36a', 1.4);
    if (K.quest && !ended(K)) this.drawQuest(a, px, K, k, mark);
    px.strokeStyle = 'rgba(255,215,110,0.9)'; px.lineWidth = Math.max(this.minW, 0.25 * k);
    px.beginPath(); px.arc(K.home % a.w + 0.5, ((K.home / a.w) | 0) + 0.5, 1.8 * Math.max(0.6, k), 0, Math.PI * 2); px.stroke();
    // the bubble (campaign/bubble.js): a faint ring where things are born, the things themselves —
    // the hostile as red triangles, merchants' trains as yellow squares, herds as green dots
    if (!ended(K)) {
      px.strokeStyle = 'rgba(255,240,200,0.12)'; px.lineWidth = Math.max(this.minW, 0.12 * k);
      px.beginPath(); px.arc(x, y, BUBBLE.far * scaleOf(a), 0, Math.PI * 2); px.stroke();
      const s = Math.max(0.35, 0.7 * k);
      for (const t of K.bubble?.things || []) {
        const mood = THINGS[t.kind].mood, hunt = THINGS[t.kind].hunts && t.sated < K.day;
        if (skin.art && ART.thing(px, t, THINGS[t.kind], hunt, s, k, this.cam.S, a)) continue;   // the picture (render/art/)
        px.lineWidth = Math.max(this.minW, 0.12 * k); px.strokeStyle = 'rgba(20,20,16,0.8)';
        px.beginPath();
        if (mood === 'hostile') { px.fillStyle = hunt ? 'rgb(230,80,60)' : 'rgb(160,90,80)'; px.moveTo(t.x, t.y - s); px.lineTo(t.x + s, t.y + s * 0.8); px.lineTo(t.x - s, t.y + s * 0.8); px.closePath(); }
        else if (mood === 'trade') { px.fillStyle = 'rgb(235,200,90)'; px.rect(t.x - s * 0.7, t.y - s * 0.7, s * 1.4, s * 1.4); }
        else { px.fillStyle = 'rgb(140,200,110)'; px.arc(t.x, t.y, s * 0.6, 0, Math.PI * 2); }
        px.fill(); px.stroke();
      }
    }
    if (K.phase === 'home') this.drawBoard(a, px, k);   // (the errand handed in: the next one's targets)
    // the caravan: a banner in the people's colour
    if (skin.art && ART.caravan(px, K, x, y, r, k, this.cam.S, a, col)) return;   // the picture (render/art/)
    px.fillStyle = ended(K) && K.phase !== 'won' ? 'rgb(90,90,90)' : `rgb(${col.join(',')})`; px.strokeStyle = 'rgba(255,250,235,0.95)'; px.lineWidth = Math.max(this.minW, 0.25 * k);
    px.beginPath(); px.arc(x, y, r, 0, Math.PI * 2); px.fill(); px.stroke();
    px.beginPath(); px.moveTo(x, y - r); px.lineTo(x, y - 3 * r); px.lineTo(x + 1.6 * r, y - 2.5 * r); px.lineTo(x, y - 2 * r); px.stroke();
  }

  // the quest (campaign/quest.js): the circles where a clue or the crown is known to lie, the places found
  drawQuest(a, px, K, k, mark) {
    const Q = K.quest, C = Q.crown, at = i => [i % a.w + 0.5, ((i / a.w) | 0) + 0.5];
    const ring = (A, color) => { px.strokeStyle = color; px.lineWidth = Math.max(this.minW, 0.18 * k); px.setLineDash([0.7 * k, 0.5 * k]); px.beginPath(); px.arc(A.x, A.y, A.r, 0, Math.PI * 2); px.stroke(); px.setLineDash([]); };
    const diamond = (i, fill) => { const [x, y] = at(i), s = Math.max(0.5, 0.8 * k); px.fillStyle = fill; px.strokeStyle = 'rgba(20,20,16,0.85)'; px.lineWidth = Math.max(this.minW, 0.12 * k); px.beginPath(); px.moveTo(x, y - s); px.lineTo(x + s, y); px.lineTo(x, y + s); px.lineTo(x - s, y); px.closePath(); px.fill(); px.stroke(); };
    for (const c of Q.clues) {
      if (c.found) diamond(c.at, 'rgb(150,150,130)');
      else if (c.seen) diamond(c.at, '#ffd36a');
      else if (c.area) ring(c.area, 'rgba(255,211,106,0.75)');
    }
    if (C.state === 'carried') return;
    if (C.area && !C.exact && !C.seen) ring(C.area, 'rgba(240,110,80,0.8)');
    if (C.exact || C.seen) {   // the crown: three points on a band
      const [x, y] = at(C.at), s = Math.max(0.7, 1.1 * k);
      px.fillStyle = C.state === 'taken' ? 'rgb(230,80,60)' : '#ffd36a'; px.strokeStyle = 'rgba(20,20,16,0.9)'; px.lineWidth = Math.max(this.minW, 0.14 * k);
      px.beginPath(); px.moveTo(x - s, y + s * 0.6); px.lineTo(x - s, y - s * 0.4); px.lineTo(x - s * 0.5, y + s * 0.05); px.lineTo(x, y - s * 0.7); px.lineTo(x + s * 0.5, y + s * 0.05); px.lineTo(x + s, y - s * 0.4); px.lineTo(x + s, y + s * 0.6); px.closePath(); px.fill(); px.stroke();
    }
  }


  // the dock's «Склад» (ui/cards.js stockHtml): the camp's w.stock, or the caravan's cargo
  renderStock() {
    const box = $('campStock'); if (!box) return;
    const L = this.local, K = this.atlas?.campaign;
    $('campStockWhat').textContent = L ? 'Склад стоянки' : 'Груз каравана';
    if (L) box.innerHTML = stockHtml(L.w.stock, L.w, this.stockAll);
    else if (K) box.innerHTML = stockHtml(Object.fromEntries(Object.entries(K.cargo || {}).filter(([id]) => RESOURCES.has(id))), null, this.stockAll);
    else box.innerHTML = '<p class="muted">Караван ещё не выступил.</p>';
  }

  renderSide() {
    this.renderFights(); this.renderSummary(); if (!this.local) this.renderStock(); this.renderWorldLog();
    const a = this.atlas, K = a.campaign; if (!K) return;
    const ms = alive(K), need = ms.length * CAMPAIGN.ration, H = a.hist;
    this.frame();
    // the day shown, not the season computed ahead (K.daily: what stood at the end of each day — the numbers, what they did,
    // the council, the crown; the live state at the end, between seasons, for a save from before)
    const sd = this.shownDay(), shot = sd < K.day ? (K.daily || []).filter(x => x.d < sd).at(-1) : null;
    const V = shot || {d: K.day, food: K.food, gold: K.gold, fights: K.stats.fights, won: K.stats.won, ambushes: K.stats.ambushes || 0, walked: K.stats.walked, towns: K.stats.towns || 0, storms: K.stats.storms || 0, found: K.quest?.found ?? 0,
      state: K, council: K.council ? {pick: K.council.pick, n: K.council.opts.length, day: K.council.day} : null, crown: K.quest ? {...K.quest.crown, r: K.quest.crown.area?.r ?? null} : null};
    const dayN = shot ? shot.d + 1 : K.day, X = V.state || K;
    const doing = {heal: 'лагерь: раненые отлёживаются', food: 'лагерь: охотятся и собирают', build: X.build ? `лагерь: ${X.build.kind === 'building' ? `рубят «${BUILDINGS.get(X.build.id).name}»` : X.build.kind === 'cart' ? 'сколачивают тележку' : 'сколачивают повозку'}, ещё ${X.build.days} дн.` : 'лагерь: строят'};
    const tameKind = X.why?.startsWith('tame:') ? BEASTS[X.why.slice(5)] : null;
    const townOf = id => a.towns.find(t => t.id === id), inTown = X.inTown && townOf(X.inTown.id), via = X.via != null && townOf(X.via);
    const plan = ended(K) && !shot ? phaseWord(K.phase) : inTown ? `в ${townLabel(inTown, 3)} ${inTown.name}: ${X.inTown.why === 'winter' ? 'зимуют' : 'торгуют, работают, лечатся'}` : X.hungry ? `голодают ${X.hungry} ${plural(X.hungry, 'день', 'дня', 'дней')}` : via ? `идут в ${townLabel(via, 1)} ${via.name}` : X.camp > 0 ? (tameKind ? `лагерь: приручают — ${tameKind.plural}` : doing[X.why] || 'лагерь') : walkWord(K, X.phase);
    $('campStatus').innerHTML = `<dt>В пути</dt><dd>${dayN} ${plural(dayN, 'день', 'дня', 'дней')} (${(dayN / 120).toFixed(1)} г.)</dd>` +
      `<dt>Что делают</dt><dd>${plan}</dd>` +
      (V.council ? `<dt>Совет</dt><dd class="nb"${!shot ? ` title="${esc(K.council.opts.map(o => `${commandOf(o.id)?.label || o.id} ${o.w}`).join(' · '))}"` : ''}>${esc(commandOf(V.council.pick)?.label || V.council.pick)} — жребий из ${V.council.n}, день ${V.council.day ?? V.d}</dd>` : '') +
      (K.quest ? (() => { const Q = K.quest, C = V.crown || Q.crown, st = C.state === 'carried' ? `несёт ${esc(K.members.find(m => m.id === C.carrier)?.name || '—')}` : C.state === 'taken' ? 'у врагов: отбить' : C.exact || C.seen ? `известно где: ${esc(Q.crown.label)}` : C.r != null ? `где-то в круге ${Math.round(C.r)} кл.` : 'где — неизвестно';
        return `<dt>${Q.how === 'lair' ? 'Трофей' : 'Корона'}</dt><dd class="nb">${esc(Q.name)}: ${st}</dd><dt>Следы</dt><dd>найдено ${V.found} из ${Q.clues.length}${V.storms ? ` · штурмов ${V.storms}` : ''}</dd>`; })() : '') +
      `<dt>Еда</dt><dd>${Math.floor(V.food)} ${plural(Math.floor(V.food), 'паёк', 'пайка', 'пайков')} · на ${need ? (V.food / need).toFixed(1) : 0} дн.</dd>` +
      `<dt>Груз</dt><dd>${Math.round(load(K))} из ${capacity(K)} мест</dd>` +
      `<dt>Обоз</dt><dd class="nb">${esc(baggageText(K))}</dd>` +
      (K.route ? `<dt>Путь</dt><dd>${K.route === 'road' ? 'с обозом по дорогам' : 'напрямик, налегке'}</dd>` : '') +
      `<dt>Казна</dt><dd>${V.gold} зол.</dd>` +
      `<dt>В городах</dt><dd>${V.towns} раз</dd>` +
      `<dt>Скорость</dt><dd>${pace(a, K, SEASONS.all()[H.season % SEASONS.all().length].id).toFixed(2)} кл./день</dd>` +
      `<dt>Пройдено</dt><dd>${Math.round(V.walked)} клеток</dd>` +
      `<dt>Боёв</dt><dd>${V.fights} · отбились ${V.won} · засад ${V.ambushes}</dd>` +
      (() => { const T = K.bubble?.things || [], n = m => T.filter(t => THINGS[t.kind].mood === m).length; return `<dt>Рядом</dt><dd>${[n('hostile') ? `угроз ${n('hostile')}` : '', n('trade') ? `обозов ${n('trade')}` : '', n('game') ? `стад ${n('game')}` : ''].filter(Boolean).join(' · ') || 'тихо'}</dd>`; })();
    const day = sd; this.sideDay = day;
    $('campRoster').innerHTML = K.members.map(m => this.seenAs(m, day)).filter(Boolean).sort((p, q) => (q.alive - p.alive) || (isCore(q) - isCore(p))).map(m => {
      const sp = SPECIES.get(m.race), rk = m.captive ? rank(K, m) : `${rank(K, m)}, ур. ${levelOn(K, m, day)}`;   // (the level beside the role: campaign/experience.js)
      const mount = m.ride ? K.beasts.find(b => b.id === m.ride) : null, extra = [mount ? `верхом: ${BEASTS[mount.kind].label}` : '', (m.back ?? 1) > 1 ? 'с коробом' : '', m.potions ? `зелий ${m.potions}` : '', m.belt?.length ? `в поясе: ${m.belt.map(r => RESOURCES.get(r).short).join(', ')}` : ''].filter(Boolean).join(', ');
      return `<div class="rm${m.alive ? '' : ' dead'}${this.who === m.id ? ' pick' : ''}" data-id="${m.id}" title="Строки летописи о ${esc(m.name)}"><span><b>${esc(m.name)}</b> · ${rk}${m.alive && extra ? ` <small style="display:inline;color:var(--muted)">(${extra})</small>` : ''}</span><span class="hp"><i class="${m.hp < 0.4 ? 'low' : ''}" style="width:${Math.round(Math.max(0, m.hp) * 100)}%"></i></span>` +
        (() => { const t = m.captive || !m.alive ? null : toNext(K, m, day); return t == null ? '' : `<span class="xp" title="опыт до ${levelOn(K, m, day) + 1}-го уровня: ${Math.round(t * 100)}%"><i style="width:${Math.round(t * 100)}%"></i></span>`; })() +
        `<small>${esc(raceLabel(sp))} · ${m.gear.hand.map(itemShort).join(', ')} · ${itemShort(m.gear.body)}${m.fate ? ` · ${esc(m.fate)}` : m.alive ? (m.contract ? ` · по найму до ${m.contract.until + 1}-го дня` : m.loyalty != null ? ` · верность ${Math.round(m.loyalty * 100)}%` : '') : m.died ? ` · ${esc(m.died.why)}, ${m.died.year}-й год` : ` · ${m.gender === 'f' ? 'ушла' : 'ушёл'}, ${m.left?.year ?? ''}-й год`}</small></div>`;
    }).join('');
    this.renderLog(); this.renderFire(day);
  }
  // the dock's «Костёр»: the council held on the day shown (who said what, campaign/council.js), and the card of the member
  // picked in the roster (ui/campSocial.js) — read from what was decided, never decided again
  renderFire(day) {
    const box = $('campFire'), K = this.atlas?.campaign; if (!box || !K) return;
    const m = this.who != null ? K.members.find(x => x.id === this.who) : null, meets = meetingsOf(K, day), meet = meets.at(-1);
    const key = meet ? `${meet.day}:${meet.point}:${this.who}` : `none:${this.who}`;
    const cardKey = `${key}:${day}:${K.day}`;   // (the card is of the day shown: it follows the day even while the scene plays on)
    if (key === this.fireKey) {   // the same meeting: the scene plays on, the card follows the day
      if (cardKey !== this.cardKey) { this.cardKey = cardKey; const c = $('campFireCard'); if (c) c.innerHTML = m ? memberCardHtml(K, m, day) : ''; }
      return;
    }
    this.fireKey = key; this.cardKey = cardKey;
    box.innerHTML = `<div id="campFireCard">${m ? memberCardHtml(K, m, day) : ''}</div>` + (meet ? `<div class="fire-scene"><canvas id="campFireCv"></canvas><div class="fire-words" id="campFireWords"></div>
      <div class="row"><button type="button" class="quiet mini" id="campFirePlay">⏸</button><button type="button" class="quiet mini" id="campFireSkip">⏭</button><button type="button" class="quiet mini" id="campFireAgain">↺</button></div></div>` : '') +
      (meets.length ? meets.map(x => meetingHtml(K, x)).join('') : '<p class="muted">Совет ещё не собирался.</p>');
    if (!meet) return;
    // the scene shows the meeting as it was: a speaker at a time, never deciding again (ui/campSocial.js drawFire)
    const last = fireSteps(K, meet), F = this.fire = {meet, step: this.clock.pace === 'max' ? last : 0, playing: this.clock.pace !== 'max', timer: 0};
    const show = () => { const cv = $('campFireCv'); if (!cv || this.fire !== F) return; drawFire(cv, K, meet, F.step); $('campFireWords').textContent = fireWords(K, meet, F.step); $('campFirePlay').textContent = F.playing ? '⏸' : '▶'; this.announce(K, meet, F.step); };
    F.show = show;
    const tick = () => { clearTimeout(F.timer); if (this.fire !== F || !F.playing) return; if (F.step >= last) { F.playing = false; show(); return; } F.timer = setTimeout(() => { F.step++; show(); tick(); }, FIRE_STEP_MS); };
    $('campFirePlay').addEventListener('click', () => { F.playing = !F.playing; if (F.playing && F.step >= last) F.step = 0; show(); tick(); });
    $('campFireSkip').addEventListener('click', () => { F.playing = false; F.step = last; show(); });
    $('campFireAgain').addEventListener('click', () => { F.step = 0; F.playing = true; show(); tick(); });
    show(); tick();
  }

  // a line of the scene, told to the screen (ui/shell/campShell.js: a word over the speaker's portrait): the speakers' ids
  // and what they say; the last line (what was decided) has no speaker
  announce(K, meet, step) {
    const line = fireLines(K, meet)[step]; if (!line || !line.who?.length) return;
    const key = `${meet.day}:${meet.point}:${step}`; if (this.saidKey === key) return; this.saidKey = key;
    document.dispatchEvent(new CustomEvent(SAY_EVENT, {detail: {who: line.who, said: line.said, kind: line.kind}}));
  }
  // the chronicle: hidden themes left out, one member's lines only, a run of repeating lines folded into one
  // «Летопись мира» (ui/worldChron.js): the world's history — the land's stages, then its years — whatever the caravan does;
  // only new lines are added. `end` — scrolled to the last line (the menu just opened)
  renderWorldLog(end = false) {
    const a = this.atlas, box = $('campWorldLog');
    this.worldChron?.render(a, this.detail);
    $('campWorldWhat').textContent = !a ? '' : this.making ? (a.hist ? `пишется: ${a.hist.year}-й год` : 'пишется: земля') : a.hist ? `по ${a.hist.year}-й год` : '';
    if (end && box) box.scrollTop = box.scrollHeight;
  }
  renderLog() {
    const box = $('campLog'), K = this.atlas?.campaign;
    if (!K) { box.innerHTML = '<small class="muted">Летопись похода начнётся, когда караван выступит. История мира — в «Летописи мира».</small>'; this.logKey = ''; $('campWho').hidden = true; $('campExport').disabled = true; return; }
    $('campExport').disabled = false;
    const m = this.who != null ? K.members.find(x => x.id === this.who) : null;
    $('campWho').hidden = !m;
    if (m) $('campWho').innerHTML = `Только о ${esc(m.name)}<button type="button">все строки</button>`;
    const day = this.shownDay(), lines = K.log.filter(l => l.kind === 'epilogue' || l.day == null || l.day <= day);   // (the season computed ahead: only up to the day shown)
    const key = `${lines.length}:${[...this.hidden].join(',')}:${this.who}`;
    if (key === this.logKey) return;
    this.logKey = key;
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 12;
    box.innerHTML = readLines(lines, {hidden: this.hidden, member: m}).map(({line: l, n, last}) =>
      `<div class="lv-${lineLevel(l)}"><small>${dateOf(l)}</small> ${esc(l.text)}${n > 1 ? ` <span class="fold">и ещё ${n - 1} ${plural(n - 1, 'такая строка', 'такие строки', 'таких строк')}, до ${last.day + 1}-го дня</span>` : ''}</div>`).join('') || '<small class="muted">Нет строк по выбранным темам.</small>';
    if (atEnd || !this.logShown) box.scrollTop = box.scrollHeight;
    this.logShown = 1;
  }

  // the world with the walk into the library: over its own record, or a new one the first time (a library world the walk
  // set out from is kept as it was, for other walks). The world is written out at the call, before anything awaits — the
  // state saved is the one at this moment. Returns the index record, or null when nothing was written.
  async persist(a = this.atlas) {
    const K = a?.campaign; if (!K) return null;
    while (this.saving) await this.saving.catch(() => null);
    if (a !== this.atlas) return null;
    const name = this.saveId ? this.worldName : `${baseName(this.worldName)}: поход из ${K.capitalFrom || K.capitalName}`;
    const day = K.day, mark = `${K.day}:${K.phase}:${finished(K)}`, p = saveWorldToLibrary(a, name, this.saveId);
    this.saving = p;
    try {
      const rec = await p;
      if (a === this.atlas) { this.saveId = rec.id; this.worldId = rec.id; this.worldName = rec.name; this.saved = {a, day, mark, at: Date.now()}; }
      this.pointAt(a, rec);
      return rec;
    } finally {
      this.saving = null;
      if (this.again) { this.again = false; this.autosave(true); }   // (asked for while this one was being written)
    }
  }
  // «Продолжить» of the main menu points at this walk, or at nothing once it is over (ui/autosave.js)
  pointAt(a, rec) {
    const K = a.campaign;
    if (finished(K)) { forgetRun(rec.id); return; }
    rememberRun({id: rec.id, name: rec.name, from: K.capitalFrom || K.capitalName, day: K.day, year: a.hist?.year ?? null, phase: K.phase, done: false, savedAt: rec.savedAt || Date.now()});
  }
  // saved by itself (ui/autosave.js): at a season's boundary when the time has come; `now` — at once, if the walk changed
  // since the last save (the screen left, the page hidden, the walk over). A failure is told, the walk goes on.
  autosave(now = false) {
    const a = this.atlas, K = a?.campaign;
    if (!K || this.making) return;
    if (this.saving) { if (now) this.again = true; return; }
    const last = this.saved?.a === a ? this.saved : null;
    const mark = `${K.day}:${K.phase}:${finished(K)}`;   // (the epilogue and a choice at the capital change the walk without a day)
    if (now ? last?.mark === mark : !saveDue(last, Date.now(), K.day)) return;
    if (now && !last && K.day === 0) return;   // (a walk not yet out of the gate: the first season's boundary saves it)
    const say = t => { const el = $('campSaveStatus'); if (el) el.textContent = t; }, day = K.day;
    this.persist(a).then(rec => { if (rec) say(`Автосохранено в ${clockTime(Date.now())}, день похода ${day}.`); },
      e => say('Автосохранение не удалось: ' + e.message));
  }
  // «Продолжить» (app/main.js): the walk in memory goes on where it stood, else it is opened from the library and goes on
  async continueRun(id, name) {
    if (!(this.atlas?.campaign && this.saveId === id)) {
      this.show('library'); await this.openFromLibrary(id, name);
      if (this.saveId !== id) return;   // (it did not open: the note says why)
    } else this.show('library');
    if (finished(this.atlas.campaign)) return;
    if (this.atlas.campaign.phase === 'home') { this.showOffer(); return; }   // (the errand handed in: the choice waits)
    this.clock.resume(); this.animate(); this.syncRun();
  }

  // ── the errand handed in (campaign/ending.js handIn): the caravan waits at its capital — another errand, or the end
  showOffer() {
    const a = this.atlas, K = a?.campaign; if (K?.phase !== 'home') return;
    const last = K.done?.at(-1), list = this.board = boardFor(a, K.capital, {K});
    this.offerPick = errandPicked(list, this.offerPick);
    const alive = K.members.filter(m => m.alive && !m.captive && m.core).length;
    $('campOfferTitle').textContent = `${last?.failed ? 'Поручение провалено' : 'Поручение исполнено'}: ${last?.label || 'поручение'}`;
    $('campOfferText').textContent = `${K.done.length > 1 ? `Это ${K.done.length}-е поручение каравана. ` : ''}${last?.failed ? `Срок вышел: ${last.goal || 'цель'} — так и не взято. Вернулись ни с чем, столица не платит.` : `${last?.goal ? `${last.goal[0].toUpperCase()}${last.goal.slice(1)} — сдано в столице` : 'Сдано в столице'}${last?.gold ? `, плата — ${last.gold} зол.` : '.'}`} В отряде ${alive} из тех, кто вышел; в пути ${Math.round(K.day / 12) / 10} лет.`;
    $('campOfferList').innerHTML = errandCards(list, this.offerPick, 'offer');
    $('campOfferGo').disabled = this.offerPick == null;
    $('campOffer').hidden = false;
    this.clock.pause(); this.syncRun(); this.renderSide();
    this.autosave(true);   // (left now, «Продолжить» comes back to this choice)
  }
  hideOffer() { $('campOffer').hidden = true; this.board = null; this.boardHover = null; }
  // ── the board's cards (boardFor): the card of an id, the camera on its target when picked
  cardOf(id) { return (this.board || []).find(c => c.id === id) || null; }
  lookAtCard(id) {
    const c = this.cardOf(id); if (!c?.at || !this.cam) { this.draw(); return; }
    // (the whole world in view: the side panel may hide its edge — closer in, the target at the middle)
    this.cam.zoom = Math.max(this.cam.zoom, BOARD_ZOOM); this.cam.cx = c.at.x + 0.5; this.cam.cy = c.at.y + 0.5; this.follow = false; this.draw();
  }
  // a lair clicked on the map while the board is up: its card picked (the first of it, if two errands want it)
  pickCardAt(e) {
    const i = this.cellAt(e); if (i < 0 || !this.board) return false;
    const x = i % this.atlas.w, y = (i / this.atlas.w) | 0;
    const c = this.board.find(b => b.ok && b.at && Math.abs(b.at.x - x) <= 1 && Math.abs(b.at.y - y) <= 1); if (!c) return false;
    const offer = !$('campOffer').hidden, box = $(offer ? 'campOfferList' : 'campErrands');
    if (offer) this.offerPick = c.id; else this.errandPick = c.id;
    const r = box.querySelector(`input[value="${CSS.escape(c.id)}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', {bubbles: true})); r.closest('.sv')?.scrollIntoView?.({block: 'nearest'}); }
    return true;
  }
  // the board's targets on the map: the cards' known places faint, the one under the pointer and the one picked ringed, a
  // dashed line from the capital to them (a place the clues must find is not drawn: the board does not tell it)
  drawBoard(a, px, k) {
    const B = this.board; if (!B?.length) return;
    const pick = this.boardPick ? this.boardPick() : !$('campOffer').hidden ? this.offerPick : this.errandPick, home = a.towns.find(t => t.id === (this.boardHome?.() ?? a.campaign?.capital ?? this.capPick));   // (the guild's board: ui/guildView.js)
    for (const c of B) {
      if (!c.ok || !c.at) continue;
      const on = c.id === this.boardHover || c.id === pick, x = c.at.x + 0.5, y = c.at.y + 0.5;
      px.strokeStyle = c.id === pick ? '#ffd36a' : on ? 'rgba(255,240,200,0.95)' : 'rgba(240,110,80,0.6)'; px.lineWidth = Math.max(this.minW, (on ? 0.3 : 0.16) * k);
      px.beginPath(); px.arc(x, y, (on ? 2.2 : 1.3) * Math.max(0.6, k), 0, Math.PI * 2); px.stroke();
      if (on && home) { px.setLineDash([0.6 * k, 0.5 * k]); px.beginPath(); px.moveTo(home.x + 0.5, home.y + 0.5); px.lineTo(x, y); px.stroke(); px.setLineDash([]); }
    }
  }
  takeOffer() {
    const a = this.atlas; if (a?.campaign?.phase !== 'home' || !this.offerPick) return;
    const card = this.cardOf(this.offerPick);
    try { nextErrand(a, card?.errand ?? this.offerPick, {targetId: card?.targetId ?? null}); } catch (e) { $('campOfferNote').textContent = e.message; this.showOffer(); return; }
    this.board = null; this.boardHover = null;
    this.hideOffer(); this.renderSide(); this.draw(); this.run();
  }
  endOffer() {
    const a = this.atlas; if (a?.campaign?.phase !== 'home') return;
    endCampaign(a);
    this.hideOffer(); this.renderSide(); this.draw(); this.run();   // (the epilogue plays out; then the ascension — syncRun)
  }

  async saveRun() {
    const a = this.atlas; if (!a?.campaign) return;
    const say = t => { $('campSaveStatus').textContent = t; };
    say('Сохраняю…');
    try { const rec = await this.persist(a); if (rec) { say(`Сохранено: «${rec.name}».`); this.refresh(); } }
    catch (e) { say('Не удалось сохранить: ' + e.message); }
  }
}
