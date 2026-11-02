// The «Кампания» screen: a world from the library, a capital, and then the caravan walks the world
// like a screensaver. The core runs a season at a time (campaign/index.js stepCampaign: the world's
// season with the caravan's thirty days in it); the screen then plays the season back day by day —
// the caravan slides along the day's positions (K.track), the world's parties slide as on the «Мир»
// screen. The map is the «Мир» screen's own drawing (ui/atlasView.js), with the fog, the caravan, its
// way, its goal and its home on top. A fight or a stop the core played on the local map (campaign/camp.js)
// is played again over the map when the playback reaches its day: the same setup gives the same camp.
import {skin} from '../render/skin.js';
import {ART} from '../render/art/index.js';
import {segOf, loadDetail, saveDetail, exportChronicle, MapView} from './atlasView.js';
import {DETAILS} from '../atlas/chronicle.js';
import {listWorlds, openWorld, saveWorldToLibrary} from './worlds.js';
import {capitals, newCampaign, stepCampaign, ended, finished, alive, pace, chronicleText} from '../campaign/index.js';
import {readLines, lineLevel, dateOf} from '../campaign/chronicle.js';
import {CHRONICLE} from '../data/campaign.js';
import {offerText, latinTitle} from './store.js';
import {CAMPAIGN, RETINUE, EPIC_SIZES} from '../data/campaign.js';
import {EPIC} from '../data/calamities.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {SEASONS} from '../data/seasons.js';
import {raceLabel} from '../agents/special.js';
import {atlasDone, newAtlas, runNextStage, landDone} from '../atlas/generate.js';
import {eraPlan, historyLength} from '../atlas/history.js';
import {ERAS} from '../data/history.js';
import {plural, esc} from '../core/util.js';
import {$} from './dom.js';
import {TickClock, dateText} from '../core/clock.js';
import {mountPace} from './pace.js';
import {openTab} from './tabs.js';
import {personHtml, creatureHtml, buildingHtml, cellHtml} from './cards.js';
import {fightStats, fightReportText, groupText, FATES, HOWS, walkStats, walkReportText} from '../campaign/stats.js';
import {gearDef} from '../agents/equipment.js';
import {alignLabel, axisWord} from '../data/values.js';
import {warnEdits} from './tableEdits.js';
import {Camera} from '../render/camera.js';
import {BUILDINGS} from '../data/buildings.js';
import {BEASTS} from '../data/transport.js';
import {BUBBLE, THINGS} from '../data/bubble.js';
import {scaleOf} from '../atlas/tectonics.js';
import {townLabel} from '../atlas/towns.js';
import {capacity, load, wheeled} from '../campaign/baggage.js';
import {baggageText, rank, isCore} from '../campaign/march.js';
import {openCamp, stepCamp, campDone} from '../campaign/camp.js';
import {Renderer} from '../render/renderer.js';
import {questHint} from '../atlas/calamity.js';
import {RESOURCES} from '../data/resources.js';
const itemShort = id => gearDef(id)?.short ?? id;

const SEASON_LIST = SEASONS.all();
// the pace: ms a season is played back over (a day is a thirtieth of it); «сразу» — as many seasons as fit a frame
// the camps watched on the local map by the pace (core/clock.js PACE): at the observer's pace the day stops too, at
// `max` none (a camp runs at `local` × the base pace: an hour in 2,5 s when watching)
const WATCH = {watch: {stops: true}, x4: {}, x16: {}};
const LOCAL_KIND = {night: 'Ночь', ambush: 'Засада на марше', stop: 'Стоянка', guard: 'Штурм'};
const LAYERS = [['relief', 'Рельеф'], ['biomes', 'Биомы'], ['peoples', 'Народы'], ['realms', 'Державы'], ['fauna', 'Звери'], ['wild', 'Живность'], ['rot', 'Гниль']];
const PHASE = {out: 'ищут корону', back: 'несут корону домой', won: 'вернулись с короной', lost: 'погибли', timeout: 'не вернулись'};
const seasonWord = s => SEASON_LIST[s % SEASON_LIST.length].label.toLowerCase();
// a world whose quest is the epic one (campaign/quest.js makeQuest)
const epicQuest = a => questHint(a);
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

export class CampaignView extends MapView {
  setup({onBack} = {}) { this.onBack = onBack; }   // («← Главное меню»: app/main.js)
  // the «Мир» screen's controls are not built here: only the campaign's
  build() {
    this.layer = 'peoples'; this.capPick = null; this.logShown = 0; this.fog = null; this.fogKey = '';
    this.wireCamera({map: 'campMap', readout: 'campReadout', inspect: 'campInspect', dock: 'campDock', zoomIn: 'campZoomIn', zoomOut: 'campZoomOut', zoomFit: 'campZoomFit', skin: 'campSkin', screen: 'campaign',
      hint: 'Наведите на карту, чтобы увидеть клетку.'});
    const lay = $('campLayer');
    lay.innerHTML = LAYERS.map(([id, l]) => `<button type="button" data-val="${id}" aria-pressed="${id === this.layer}">${l}</button>`).join('');
    lay.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this.layer = b.dataset.val; lay.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); this.draw(); });
    this.ticks = new TickClock();   // the local map's clock while a camp is watched
    this.syncPaceBox = mountPace($('campSpeed'), this.clock, {pauseId: 'campPause', active: () => !$('campaign').hidden,
      onPace: id => {
        this.clock.setPace(id); this.ticks.pace = this.localPace(id);
        if (this.local && !WATCH[id] && !this.local.c.boss) this.endLocal();   // «Сразу»: the camps are not watched — the one on the map is left (a named fight is)
        if (this.clock.paused && !this.local) this.clock.resume();
        this.syncRun();
      },
      onPause: () => { const K = this.atlas?.campaign; if (!K || finished(K)) return; if (this.local) this.ticks.paused = !this.ticks.paused; else this.clock.toggle(); this.syncRun(); }});
    $('campWorlds').addEventListener('click', e => { const row = e.target.closest('.sv'); if (row) this.openFromLibrary(row.dataset.id, row.dataset.name); });
    // a capital: a click on its card marks it on the map, its button sets the caravan out from it at once
    $('campCaps').addEventListener('click', e => {
      const row = e.target.closest('.sv'); if (!row) return;
      this.capPick = +row.dataset.town;
      if (e.target.closest('button')) { this.begin(); return; }
      this.renderCaps(); this.draw();
    });
    $('campGo').addEventListener('click', () => this.begin());
    // the world's chronicle into a file: by its eras at the detail chosen, or the calamities only (atlas/chronicle.js)
    this.detail = loadDetail();
    segOf($('campDetail'), DETAILS, this.detail, v => { this.detail = v; saveDetail(v); });
    const file = what => { const a = this.atlas; if (a) exportChronicle(a, this.worldName, what); };
    $('campWorldFile').addEventListener('click', () => file(this.detail));
    $('campCalFile').addEventListener('click', () => file('calamity'));
    $('campWorldFile2').addEventListener('click', () => file(this.detail));
    // a new epic world (cfg.epic: three eras of 75–150 years), made here and put into the library
    this.epicSize = 'medium';
    const es = $('campEpicSize');
    es.innerHTML = EPIC_SIZES.map(([id, l]) => `<button type="button" data-val="${id}" aria-pressed="${id === this.epicSize}">${l}</button>`).join('');
    es.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this.epicSize = b.dataset.val; es.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
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
    this.localR = new Renderer($('campLocal'));
    // a click on the camp's map: the card of the creature there, else the building, else the cell (ui/cards.js)
    $('campLocal').addEventListener('click', e => this.pickLocal(e));
    // the chronicle: themes to hide (remembered in this browser), one member's lines, the text into a file
    this.hidden = loadHidden(); this.who = null; this.logKey = '';
    const tp = $('campTopics');
    tp.innerHTML = CHRONICLE.topics.map(t => `<button type="button" data-val="${t.id}" aria-pressed="${!this.hidden.has(t.id)}">${t.label}</button>`).join('');
    tp.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const id = b.dataset.val; if (this.hidden.has(id)) this.hidden.delete(id); else this.hidden.add(id); b.setAttribute('aria-pressed', String(!this.hidden.has(id))); saveHidden(this.hidden); this.renderLog(); });
    $('campRoster').addEventListener('click', e => { const row = e.target.closest('.rm'); if (!row) return; const id = +row.dataset.id; this.who = this.who === id ? null : id; this.renderSide(); });
    $('campWho').addEventListener('click', e => { if (e.target.closest('button')) { this.who = null; this.renderSide(); } });
    $('campExport').addEventListener('click', () => { const K = this.atlas?.campaign; if (K) offerText(latinTitle(`letopis-${K.capitalName}-${K.started?.year ?? ''}`), chronicleText(this.atlas, K)); });
    $('campPast').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const P = this.atlas?.campaignsDone?.[+b.dataset.k]; if (P) offerText(latinTitle(`letopis-${P.from}-${P.started?.year ?? ''}`), chronicleText(this.atlas, P)); });
    $('campAgain').addEventListener('click', () => { this.halt(); this.capPick = null; this.setupMode(); this.draw(); });
  }

  // ── a new epic world: the land stage by stage, then the long history, as many steps as fit a frame; the map is
  // drawn now and then. When it is done it goes into the library and the capitals can be chosen
  makeEpic() {
    this.halt(); this.seq = (this.seq || 0) + 1;   // a library world still loading is not shown over this one
    const seed = $('campEpicSeed').value.trim() || String(Math.floor(Math.random() * 1e6));
    const a = newAtlas({seed, size: this.epicSize, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true});
    this.atlas = a; this.worldId = null; this.worldName = `Эпический мир ${seed}`; this.saveId = null; this.capPick = null;
    this.cam = new Camera(a.w, a.h); this.bitmap = null; this.bitmapKey = ''; this.fogKey = ''; this.logShown = 0;
    this.making = true; $('campEpicGo').textContent = 'Остановить';
    $('campCapsField').hidden = true; $('campTitle').textContent = this.worldName;
    const t0 = performance.now();
    let drawn = 0;
    const loop = () => {
      if (!this.making || a !== this.atlas) return;
      const f0 = performance.now();
      while (!atlasDone(a) && performance.now() - f0 < 30) runNextStage(a);
      if (performance.now() - drawn > 600) { drawn = performance.now(); this.bitmapKey = ''; this.draw(); $('campEpicNote').textContent = epicProgress(a, (performance.now() - t0) / 1000); }
      if (atlasDone(a)) { this.doneEpic((performance.now() - t0) / 1000, a); return; }
      this.genRaf = requestAnimationFrame(loop);
    };
    this.genRaf = requestAnimationFrame(loop);
  }
  stopEpic() {
    this.making = false; cancelAnimationFrame(this.genRaf); $('campEpicGo').textContent = 'Сотворить';
    this.atlas = null; $('campEpicNote').textContent = 'Остановлено: мир не сохранён.'; this.setupMode(); this.draw();
  }
  async doneEpic(sec, a = this.atlas) {
    this.making = false; $('campEpicGo').textContent = 'Сотворить';
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
  startEpic({seed, size} = {}) {
    if (seed) $('campEpicSeed').value = String(seed).slice(0, 24);
    if (size && EPIC_SIZES.some(([id]) => id === size)) {
      this.epicSize = size;
      $('campEpicSize').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === size)));
    }
    this.makeEpic();
  }
  // leaving the screen: the walk halts between seasons and waits
  // (a world left half-made is not walked: it is let go)
  halt() { if (this.making) { this.making = false; cancelAnimationFrame(this.genRaf); $('campEpicGo').textContent = 'Сотворить'; this.atlas = null; $('campEpicNote').textContent = 'Остановлено: мир не сохранён.'; } this.endLocal(); this.queue = []; if (this.atlas?.campaign && !finished(this.atlas.campaign)) this.clock.pause(); else this.clock.stop(); this.syncRun(); }

  // ── setup: a world, a capital
  async refresh() {
    const box = $('campWorlds');
    let list;
    try { list = (await listWorlds()).filter(r => r.type !== 'land'); } catch (e) { box.innerHTML = '<small>Библиотека в этом браузере недоступна.</small>'; return; }   // a land has no peoples to march from
    if (!list.length) { box.innerHTML = '<small>Пока нет сохранённых миров: сотворите эпический мир ниже или мир на экране «Мир».</small>'; return; }
    box.innerHTML = list.map(r => `<div class="sv${r.id === this.worldId ? ' cur' : ''}" data-id="${esc(r.id)}" data-name="${esc(r.name)}"><span class="t"><b>${esc(r.name)}</b> · ${esc(r.sizeLabel)}${r.epic ? ' · эпический' : r.free ? ' · заселённый' : ''}${r.tables ? ` · с правками таблиц (${r.tables})` : ''} · ${r.year} лет` +
      (r.campaign ? `<br><small>поход из ${esc(r.campaign.from)}: ${PHASE[r.campaign.phase] || r.campaign.phase}, ${Math.round(r.campaign.day / 12) / 10} лет в пути${r.campaigns ? ` · окончено походов: ${r.campaigns}` : ''}</small>` : `<br><small>городов ${r.towns} · держав ${r.realms}${r.done ? '' : ' · история не дожита'}</small>`) +
      `</span><button type="button">${r.campaign && !['won', 'lost', 'timeout'].includes(r.campaign.phase) ? 'Продолжить' : 'Открыть'}</button></div>`).join('');
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
      this.cam = null; this.bitmap = null; this.bitmapKey = ''; this.fogKey = ''; this.logShown = 0; this.capPick = null;
      this.cam = new Camera(a.w, a.h);
      $('campWorldNote').textContent = warnEdits(a.tables) || '';
      if (a.campaign) { this.clock.paused = true; this.runMode(); if (this.follow) this.closeUp(); }
      else this.setupMode();
      this.refresh(); this.draw();
    } catch (e) { $('campWorldNote').textContent = 'Не удалось открыть: ' + e.message; }
  }

  setupMode() {
    this.choosing = true;
    const epic = this.mode === 'epic';
    $('campSetup').hidden = false; $('campRun').hidden = true; $('campRunSide').hidden = true;
    $('campLibField').hidden = epic; $('campEpicField').hidden = !epic;
    $('campName2').textContent = '';
    $('campTitle').textContent = this.atlas ? this.worldName : epic ? 'Эпическая кампания' : 'Кампания';
    $('campCapsField').hidden = !this.atlas;
    $('campWorldChron').hidden = !this.atlas || !this.atlas.hist;
    const past = this.atlas?.campaignsDone || [];
    $('campPastField').hidden = !past.length;
    $('campPast').innerHTML = past.map((P, k) => `<div class="sv"><span class="t"><b>Поход из ${esc(P.from)}</b> · ${PHASE[P.phase] || P.phase}<br><small>${P.started?.year ?? '?'}–${P.ended?.year ?? '?'} год · ${P.crown ? esc(P.crown) : ''} · вернулись ${P.members.filter(m => m.core && !m.died).length} из ${P.members.filter(m => m.core).length}</small></span><button type="button" data-k="${k}">В файл</button></div>`).join('');
    this.renderCaps(); this.renderLog();
  }
  renderCaps() {
    const a = this.atlas; if (!a) { $('campGo').disabled = true; return; }
    // which quest this world gives (campaign/quest.js makeQuest): its own story in an epic world, else the crown and three clues
    const hint = epicQuest(a);
    $('campQuestNote').textContent = hint?.kind === 'hand'
      ? `Квест заселённого мира: ${a.artifact.name} — у бедствия «${hint.label}»${hint.boss ? `: ${hint.boss}${hint.phase === 'rise' ? ', оно уже идёт' : ''}` : `, оно поднимется в ${hint.riseAt}-м году — с выходом каравана его логово встанет сразу`}. Логово — цель похода, босс должен пасть${hint.graves ? `; следы — могилы ${hint.graves} прежних боссов` : ''}.`
      : hint
      ? `Квест эпического мира: ${a.artifact.name} уйдёт к четвёртому боссу в дальнее логово; следы — могилы ${a.graves.length} боссов прошлых эпох. Через ${EPIC.doom} ${plural(EPIC.doom, 'год', 'года', 'лет')} начнётся новое бедствие${EPIC.years > EPIC.doom ? `; на поход — ${EPIC.years} ${plural(EPIC.years, 'год', 'года', 'лет')}` : ''}.`
      : 'Квест: корона там, где её потеряла история этого мира; три подсказки в его курганах, логовах, развалинах и городах.';
    const caps = capitals(a);
    $('campCaps').innerHTML = caps.length ? caps.map(c => `<div class="sv cap${c.town === this.capPick ? ' cur' : ''}" data-town="${c.town}"><span class="t"><i style="background:rgb(${WORLD_PEOPLES.get(c.people).color.join(',')})"></i><b>${esc(c.label)}</b> · ${esc(c.peopleLabel)}` +
      `<br><small>${esc(c.realmLabel)}${c.ruler ? ` · ${esc(c.ruler)}` : ' · трон пуст'}${c.align ? ` · <span title="${esc(`${axisWord('order', c.align.order)} · ${axisWord('mercy', c.align.mercy)}`)}">${esc(alignLabel(c.align, 'pl'))}</span>` : ''} · ${c.towns} ${plural(c.towns, 'город', 'города', 'городов')} · ${c.pop} жителей · ${RETINUE[c.people].knight[1]} и ${RETINUE[c.people].squire[1]}</small></span><button type="button" class="primary" title="Караван выходит из этой столицы">Выступить</button></div>`).join('')
      : '<small>В этом мире нет столиц людей, эльфов, дварфов или зеленокожих.</small>';
    $('campGo').disabled = this.capPick == null;
  }

  begin() {
    const a = this.atlas; if (!a || this.capPick == null) return;
    newCampaign(a, this.capPick);
    if (this.follow) this.closeUp();
    this.saveId = null; this.logShown = 0; this.logKey = ''; this.who = null;
    this.runMode(); this.run();
  }

  // ── the walk
  runMode() {
    this.choosing = false;
    $('campSetup').hidden = true; $('campRun').hidden = false; $('campRunSide').hidden = false;
    const K = this.atlas.campaign;
    $('campTitle').textContent = `Поход из ${K.capitalFrom || K.capitalName}`; $('campName2').textContent = this.worldName || '';
    this.syncRun(); this.renderSide();
    const sw = (c, l) => `<span><i style="background:${c}"></i>${l}</span>`;
    $('campLegend').innerHTML = sw(`rgb(${WORLD_PEOPLES.get(K.people).color.join(',')})`, 'караван (флажок)') + sw('rgba(255,215,110,0.8)', 'путь пешком (пунктир), дом (кольцо)') + sw('rgba(255,211,106,0.75)', 'где искать след (круг), найденный след (ромб: жёлтый — к нему идут, серый — взят)') + sw('rgba(240,110,80,0.8)', 'где-то здесь корона (круг), корона (зубцы; красная — у врагов)') + sw('rgba(240,160,90,0.9)', 'путь с колёсами — по дорогам (длинный штрих)') +
      sw('rgb(40,42,36)', 'туман: чего караван не знает') + '<b>карта</b> — как на экране «Мир»: города, дороги, логова, отряды и войска' +
      sw('rgb(230,80,60)', 'угроза рядом (треугольник; темнее — сыта или не заметила)') + sw('rgb(235,200,90)', 'торговый обоз') + sw('rgb(140,200,110)', 'стадо') + sw('rgba(255,240,200,0.3)', 'кольцо пузыря');
  }
  syncRun() {
    const K = this.atlas?.campaign, done = !K || finished(K);
    $('campAgain').hidden = !done || !K;
    $('campPause').hidden = done; $('campSpeed').hidden = done;
    this.syncPaceBox?.();
    if (this.local) $('campPause').textContent = this.ticks.paused ? 'Дальше' : 'Пауза';
  }

  clickAt(e) { this.selectAt(e); }   // a click on the world map: the card of what is here (ui/inspect.js)
  // the date in the head, with the day of the season the playback is at
  frame() { const a = this.atlas; if (a?.hist) $('campDay').textContent = dateText(a, this.clock, seasonWord); }

  // the walk runs on the observer's clock (core/clock.js): a season a step; a camp watched on the local map holds the
  // season's playback until it is over
  run() { if (this.atlas?.campaign && !finished(this.atlas.campaign)) this.clock.start(); this.syncRun(); }
  stepSeason() {
    const a = this.atlas; if (!a?.campaign || finished(a.campaign)) return false;
    const d0 = a.campaign.day;
    const was = ended(a.campaign);
    stepCampaign(a);
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
      if (!this.atlas?.campaign || !this.clock.running || this.slide() >= 1) { this.draw(); return; }
      this.draw(); this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ── a camp on the local map: played again from its setup over the world map, then the season goes on
  startLocal(c) {
    let w;
    try { w = openCamp(c.setup); } catch (e) { console.warn('стоянка не открылась', e); return; }
    this.clock.hold(c.at);   // the season waits while the camp is watched, at the camp's own day
    this.ticks.last = 0; this.ticks.acc = 0; this.ticks.paused = false; this.ticks.pace = this.localPace(this.clock.pace, c);
    this.local = {w, c, view: {cam: {zoom: 1.6, cx: w.camp.x + 0.5, cy: w.camp.y + 0.5}, layer: 'world', resHidden: new Set(), selected: null, selBld: null, selCell: null}, done: 0};
    $('campLocal').hidden = false; $('campLocalBar').hidden = false;
    this.localR.setup(w);
    this.localText();
  }
  // the local map's pace: the clock's — but a named fight shown at «Сразу» is played at ×4, to be seen
  localPace(id, c = this.local?.c) { return !WATCH[id] && c?.boss ? 'x4' : id; }
  localText() {
    const L = this.local, c = L.c, w = L.w, last = w.logLines[0];
    $('campLocalText').innerHTML = `<b>${LOCAL_KIND[c.kind] || 'Стоянка'}</b>${c.kind !== 'stop' ? ` — ${esc(c.label)}` : ''}, день похода ${c.day + 1}${last ? ` · <small>${esc(last.when.replace(/^День \d+, /, ''))} ${last.html.replace(/<[^>]+>/g, '')}</small>` : ''}`;
  }
  stepLocal() {
    const L = this.local, w = L.w, per = this.ticks.ticks(performance.now());
    if (!this.ticks.paused) {
      if (!campDone(w)) { for (let k = 0; k < per && !campDone(w); k++) stepCamp(w); }
      else if (!L.done) L.done = performance.now();
      else if (performance.now() - L.done > 1500) { this.endLocal(); return; }
    }
    this.localR.draw(w, L.view);
    if (w.logVersion !== L.logV) { L.logV = w.logVersion; this.localText(); }
    if (L.view.selected && (L.frames = (L.frames || 0) + 1) % 15 === 0) this.localCard();   // the creature's card follows it
  }
  // the camp's map: what is under the click, shown in the dock («Объект») and followed while the camp runs
  pickLocal(e) {
    const L = this.local; if (!L) return;
    const r = $('campLocal').getBoundingClientRect(), [fx, fy] = this.localR.toCell(e.clientX - r.left, e.clientY - r.top), w = L.w;
    let best = null, bd = 0.9;
    for (const a of w.agents) { if (a.dead) continue; const d = Math.hypot(a.x - fx, a.y - fy); if (d < bd) { bd = d; best = a; } }
    const i = (fy | 0) * w.w + (fx | 0);
    L.view.selected = best; L.view.selBld = null; L.view.selCell = null;
    if (!best) { const b = w.buildings.find(b => b.cells?.includes(i)); if (b) L.view.selBld = b.id; else if (i >= 0 && i < w.w * w.h) L.view.selCell = i; }
    this.localCard(true);
    if (this.ids?.dock) openTab($(this.ids.dock), 'object');
  }
  localCard(force = false) {
    const L = this.local, w = L?.w, box = $('campInspect');
    if (!L) return;
    const a = L.view.selected;
    if (a && (a.dead || !w.agents.includes(a))) { L.view.selected = null; box.innerHTML = '<p class="muted">Его больше нет на карте.</p>'; return; }
    if (!force && !a) return;   // a building or a cell does not change by the tick
    if (a) box.innerHTML = `<div class="pc">${a.diary && a.likes ? personHtml(w, a) : creatureHtml(w, a)}</div>`;
    else if (L.view.selBld != null) { const b = w.buildings.find(b => b.id === L.view.selBld); box.innerHTML = b ? `<div class="pc">${buildingHtml(w, b)}</div>` : ''; }
    else if (L.view.selCell != null) box.innerHTML = `<div class="pc">${cellHtml(w, L.view.selCell)}</div>`;
  }
  endLocal() {
    const L = this.local; if (!L) return;
    this.local = null;
    if (L.view.selected || L.view.selBld != null || L.view.selCell != null) this.renderInspect();   // the world's card again
    $('campLocal').hidden = true; $('campLocalBar').hidden = true;
    // the season's playback goes on from where it stopped
    this.clock.release(); this.syncRun();
    this.animate();
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

  // the fights of the walk (campaign/stats.js) in the dock: the totals, the years as bars, the named fights, the people
  renderFights() {
    const K = this.atlas?.campaign, box = $('campFights'); if (!box) return;
    if (!K?.fights?.length) { box.innerHTML = '<p class="muted">Боёв ещё не было.</p>'; return; }
    const S = fightStats(K), T = S.total, n = x => (x == null ? '—' : x), sp = id => (SPECIES.has(id) ? SPECIES.get(id).label : id);
    const maxF = Math.max(1, ...S.byYear.map(y => y.fights));
    const bars = S.byYear.map(y => `<div class="yb" title="год ${y.year}: боёв ${y.fights}, выиграно ${y.won}, врагов ${y.foes}, убито ${y.killed}, бежали ${y.fled}, наша/их сила ${y.ratio || '—'}, пали наши ${y.fell}, именных ${y.named}"><i style="height:${Math.round(y.fights / maxF * 56)}px"></i><i class="k" style="height:${Math.round(y.killed / Math.max(1, Math.max(...S.byYear.map(z => z.foes))) * 56)}px"></i><small>${y.year}</small></div>`).join('');
    const named = S.named.length ? `<table><tr><th>День</th><th class="t">Кто</th><th>Свита</th><th class="t">Босс</th><th>Убито</th><th>Бежали</th><th>Сила</th><th class="t">Исход</th></tr>${S.named.map(f =>
      `<tr><td>${f.day}</td><td class="t boss">${esc(f.boss.name)} (${esc(sp(f.boss.species))}${f.boss.mustDie ? ', четвёртый' : ''}) — ${HOWS[f.how] || f.how}</td><td>${n(f.guards)}<br><small>${esc(groupText(f.species))}</small></td><td class="t">${FATES[f.boss.fate]}${f.boss.hp != null && f.boss.fate !== 'dead' ? `, ${Math.round(f.boss.hp * 100)}%` : ''}</td><td>${n(f.killed)}</td><td>${n(f.fled)}</td><td>${f.ratio ? f.ratio.toFixed(1) : '—'}</td><td class="t ${f.won ? 'won' : 'lost'}">${f.won ? 'победа' : 'отбиты'}${f.fell.length ? `; пали ${esc(f.fell.join(', '))}` : ''}${f.hurt.length ? `; ранены ${esc(f.hurt.join(', '))}` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Именных боёв ещё не было: стражи могил, главари логов и четвёртый — впереди.</p>';
    box.innerHTML = `<div><h4>Поход</h4><p>Боёв ${T.fights}, выиграно ${T.won}, засад ${T.ambushes}, штурмов ${T.storms}, именных ${T.named}. Врагов пришло ${T.foes} — в среднем ${T.foesAvg} на бой против ${T.fighters} наших; убито ${T.killed}, бежали ${T.fled}, в плен ${T.taken}. Наша сила к их силе — в среднем ${T.ratio}. Пали наши ${T.fell}, ранены ${T.hurt} раз.</p>
      <h4>По родам врага</h4><table><tr><th class="t">Враг</th><th>Боёв</th><th>Выиграно</th><th>Их в бою</th><th>Убито</th><th>Бежали</th><th>Сила</th></tr>${S.byKind.map(k => `<tr><td class="t">${esc(k.label)}</td><td>${k.fights}</td><td>${k.won}</td><td>${k.foes}</td><td>${k.killed}</td><td>${k.fled}</td><td>${k.ratio || '—'}</td></tr>`).join('')}</table></div>
      <div><h4>По годам похода</h4><div class="ybars">${bars}</div><small class="muted">оранжевое — боёв в год, зелёное — убито врагов; наведите на год</small>
      <h4>По людям</h4><table><tr><th class="t">Кто</th><th>Боёв</th><th>Убил</th><th>Ранен</th></tr>${S.byMember.slice(0, 16).map(m => `<tr><td class="t">${esc(m.name)}${m.alive === false ? ' †' : ''}</td><td>${m.fights}</td><td>${m.kills}</td><td>${m.hurt}</td></tr>`).join('')}</table></div>
      <div class="wide"><h4>Именные бои</h4>${named}<div class="row actions"><button type="button" class="quiet mini" id="campFightsFile">Бои в файл</button></div></div>`;
    $('campFightsFile').addEventListener('click', () => offerText(latinTitle(`boi-${K.capitalName}-${K.started?.year ?? ''}`), fightReportText(this.atlas, K)));
  }

  // the walk summed up (campaign/stats.js walkStats) in the dock's «Итоги»: live while it goes, the whole of it at the end
  renderSummary() {
    const K = this.atlas?.campaign, box = $('campSummary'); if (!box) return;
    if (!K) { box.innerHTML = '<p class="muted">Итоги начнут собираться, когда караван выступит.</p>'; return; }
    box.innerHTML = walkStats(this.atlas, K).map(S => `<div><h4>${esc(S.title)}</h4><dl class="sum">${S.rows.map(([l, x]) => `<dt>${esc(l)}</dt><dd>${esc(String(x))}</dd>`).join('')}</dl></div>`).join('') +
      `<div class="wide"><div class="row actions"><button type="button" class="quiet mini" id="campSummaryFile">Итоги в файл</button></div></div>`;
    $('campSummaryFile').addEventListener('click', () => offerText(latinTitle(`itogi-${K.capitalName}-${K.started?.year ?? ''}`), walkReportText(this.atlas, K)));
  }

  renderSide() {
    this.renderFights(); this.renderSummary();
    const a = this.atlas, K = a.campaign; if (!K) return;
    const ms = alive(K), need = ms.length * CAMPAIGN.ration, H = a.hist;
    const doing = {heal: 'лагерь: раненые отлёживаются', food: 'лагерь: охотятся и собирают', build: K.build ? `лагерь: ${K.build.kind === 'building' ? `рубят «${BUILDINGS.get(K.build.id).name}»` : K.build.kind === 'cart' ? 'сколачивают тележку' : 'сколачивают повозку'}, ещё ${K.build.days} дн.` : 'лагерь: строят'};
    const tameKind = K.why?.startsWith('tame:') ? BEASTS[K.why.slice(5)] : null;
    const townOf = id => a.towns.find(t => t.id === id), inTown = K.inTown && townOf(K.inTown.id), via = K.via != null && townOf(K.via);
    const plan = ended(K) ? PHASE[K.phase] : inTown ? `в ${townLabel(inTown, 3)} ${inTown.name}: ${K.inTown.why === 'winter' ? 'зимуют' : 'торгуют, работают, лечатся'}` : K.hungry ? `голодают ${K.hungry} ${plural(K.hungry, 'день', 'дня', 'дней')}` : via ? `идут в ${townLabel(via, 1)} ${via.name}` : K.camp > 0 ? (tameKind ? `лагерь: приручают — ${tameKind.plural}` : doing[K.why] || 'лагерь') : PHASE[K.phase];
    this.frame();
    $('campStatus').innerHTML = `<dt>В пути</dt><dd>${K.day} ${plural(K.day, 'день', 'дня', 'дней')} (${(K.day / 120).toFixed(1)} г.)</dd>` +
      `<dt>Что делают</dt><dd>${plan}</dd>` +
      (K.quest ? (() => { const Q = K.quest, C = Q.crown, st = C.state === 'carried' ? `несёт ${esc(K.members.find(m => m.id === C.carrier)?.name || '—')}` : C.state === 'taken' ? 'у врагов: отбить' : C.exact || C.seen ? `известно где: ${esc(C.label)}` : C.area ? `где-то в круге ${Math.round(C.area.r)} кл.` : 'где — неизвестно';
        return `<dt>Корона</dt><dd class="nb">${esc(Q.name)}: ${st}</dd><dt>Следы</dt><dd>найдено ${Q.found} из ${Q.clues.length}${K.stats.storms ? ` · штурмов ${K.stats.storms}` : ''}</dd>`; })() : '') +
      `<dt>Еда</dt><dd>${Math.floor(K.food)} ${plural(Math.floor(K.food), 'паёк', 'пайка', 'пайков')} · на ${need ? (K.food / need).toFixed(1) : 0} дн.</dd>` +
      `<dt>Груз</dt><dd>${Math.round(load(K))} из ${capacity(K)} мест</dd>` +
      `<dt>Обоз</dt><dd class="nb">${esc(baggageText(K))}</dd>` +
      (K.route ? `<dt>Путь</dt><dd>${K.route === 'road' ? 'с обозом по дорогам' : 'напрямик, налегке'}</dd>` : '') +
      `<dt>Казна</dt><dd>${K.gold} зол.</dd>` +
      `<dt>В городах</dt><dd>${K.stats.towns || 0} раз</dd>` +
      `<dt>Скорость</dt><dd>${pace(a, K, SEASON_LIST[H.season].id).toFixed(2)} кл./день</dd>` +
      `<dt>Пройдено</dt><dd>${Math.round(K.stats.walked)} клеток</dd>` +
      `<dt>Боёв</dt><dd>${K.stats.fights} · отбились ${K.stats.won} · засад ${K.stats.ambushes || 0}</dd>` +
      (() => { const T = K.bubble?.things || [], n = m => T.filter(t => THINGS[t.kind].mood === m).length; return `<dt>Рядом</dt><dd>${[n('hostile') ? `угроз ${n('hostile')}` : '', n('trade') ? `обозов ${n('trade')}` : '', n('game') ? `стад ${n('game')}` : ''].filter(Boolean).join(' · ') || 'тихо'}</dd>`; })();
    $('campRoster').innerHTML = [...K.members].sort((p, q) => (q.alive - p.alive) || (isCore(q) - isCore(p))).map(m => {
      const sp = SPECIES.get(m.race), rk = rank(K, m);
      const mount = m.ride ? K.beasts.find(b => b.id === m.ride) : null, extra = [mount ? `верхом: ${BEASTS[mount.kind].label}` : '', (m.back ?? 1) > 1 ? 'с коробом' : '', m.potions ? `зелий ${m.potions}` : '', m.belt?.length ? `в поясе: ${m.belt.map(r => RESOURCES.get(r).short).join(', ')}` : ''].filter(Boolean).join(', ');
      return `<div class="rm${m.alive ? '' : ' dead'}${this.who === m.id ? ' pick' : ''}" data-id="${m.id}" title="Строки летописи о ${esc(m.name)}"><span><b>${esc(m.name)}</b> · ${rk}${m.alive && extra ? ` <small style="display:inline;color:var(--muted)">(${extra})</small>` : ''}</span><span class="hp"><i class="${m.hp < 0.4 ? 'low' : ''}" style="width:${Math.round(Math.max(0, m.hp) * 100)}%"></i></span>` +
        `<small>${esc(raceLabel(sp, m))} · ${m.gear.hand.map(itemShort).join(', ')} · ${itemShort(m.gear.body)}${m.fate ? ` · ${esc(m.fate)}` : m.alive ? (m.contract ? ` · по найму до ${m.contract.until + 1}-го дня` : m.loyalty != null ? ` · верность ${Math.round(m.loyalty * 100)}%` : '') : m.died ? ` · ${esc(m.died.why)}, ${m.died.year}-й год` : ` · ${m.gender === 'f' ? 'ушла' : 'ушёл'}, ${m.left?.year ?? ''}-й год`}</small></div>`;
    }).join('');
    this.renderLog();
  }

  // the chronicle: hidden themes left out, one member's lines only, a run of repeating lines folded into one
  renderLog() {
    const box = $('campLog'), K = this.atlas?.campaign;
    if (!K) { box.innerHTML = '<small class="muted">Летопись начнётся, когда караван выступит.</small>'; this.logKey = ''; $('campWho').hidden = true; $('campExport').disabled = true; return; }
    $('campExport').disabled = false;
    const m = this.who != null ? K.members.find(x => x.id === this.who) : null;
    $('campWho').hidden = !m;
    if (m) $('campWho').innerHTML = `Только о ${esc(m.name)}<button type="button">все строки</button>`;
    const key = `${K.log.length}:${[...this.hidden].join(',')}:${this.who}`;
    if (key === this.logKey) return;
    this.logKey = key;
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 12;
    box.innerHTML = readLines(K.log, {hidden: this.hidden, member: m}).map(({line: l, n, last}) =>
      `<div class="lv-${lineLevel(l)}"><small>${dateOf(l)}</small> ${esc(l.text)}${n > 1 ? ` <span class="fold">и ещё ${n - 1} ${plural(n - 1, 'такая строка', 'такие строки', 'таких строк')}, до ${last.day + 1}-го дня</span>` : ''}</div>`).join('') || '<small class="muted">Нет строк по выбранным темам.</small>';
    if (atEnd || !this.logShown) box.scrollTop = box.scrollHeight;
    this.logShown = 1;
  }

  async saveRun() {
    const a = this.atlas; if (!a?.campaign) return;
    const say = t => { $('campSaveStatus').textContent = t; };
    say('Сохраняю…');
    try { const rec = await saveWorldToLibrary(a, this.saveId ? this.worldName : `${this.worldName}: поход из ${a.campaign.capitalFrom || a.campaign.capitalName}`, this.saveId); this.saveId = rec.id; this.worldId = rec.id; this.worldName = rec.name; say(`Сохранено: «${rec.name}».`); this.refresh(); }
    catch (e) { say('Не удалось сохранить: ' + e.message); }
  }
}
