// «Заселение мира» (forest.html #settle; docs/WORLD.md): history on a land of «Создать землю», led by hand.
// No eras: the hand lands peoples (a founding town and realm where it points), sets lairs (or the wild's lairs as the
// land gives them), up to three calamities (kind, place, in how many years), and runs the clock +5…+100 years; looks,
// steps in again, runs on. The world is saved with its inhabitants and chronicle into the library of worlds.
//
// The core is atlas/settle.js; the map, its layers, the camera and the readout are the «Мир» polygon's (ui/atlasView.js).
import {MapView, ATLAS_OPTS, loadDetail, saveDetail, segOf} from '../ui/atlasView.js';
import {DEFAULT_ATLAS_CFG} from '../data/atlas.js';
import {FREE} from '../data/history.js';
import {atlasDone} from '../view/world.js';
import {seasonLabel, endYear} from '../view/world.js';
import {startFree, isFree, PLACEABLE, landPeople, addLair, wildByLand, wildDone, setCalamity, runYears, stepRun, canMarch} from '../view/world.js';
import {lineLevel, keeps, DETAILS} from '../view/world.js';
import {realmLabel} from '../view/world.js';
import {relationsHtml} from '../ui/inspect.js';
import {saveWorldToLibrary, listWorlds, openWorld, deleteWorld, downloadWorld, importWorld} from '../ui/worlds.js';
import {warnEdits} from '../ui/tableEdits.js';
import {Camera} from '../render/camera.js';
import {esc, plural} from '../core/util.js';
import {$, seg as segRow, press} from '../ui/dom.js';
import {dateText} from '../core/clock.js';
import {mountPace} from '../ui/pace.js';
import {march, questText} from './campView.js';
import {questHint} from '../view/world.js';
import {CAL_PHASES, FELL_BY, ARTIFACT_AT} from '../data/labels.js';

const TOOLS = [['look', 'Смотреть'], ['people', 'Народ'], ['lair', 'Логово'], ['calamity', 'Бедствие']];
const NOTES = {
  look: 'Наведите на карту, чтобы увидеть клетку.',
  people: 'Щелчок по суше — высадить народ: город встанет на лучшем месте рядом, с ним начнётся держава.',
  lair: 'Щелчок по суше — поставить логово. Мёртвым рука насыплет курганы, чтобы было чем кормиться.',
  calamity: 'Щелчок по суше — где поднимется бедствие (вампир — в ближайшем городе), или «на волю мира». Не больше трёх, что ещё не прошли.',
};

export class SettleView extends MapView {
  setup() { this.cfg = {...DEFAULT_ATLAS_CFG}; this.seq = 0; }

  build() {
    this.tool = 'look'; this.people = PLACEABLE.peoples()[0]?.id; this.calIn = FREE.calIn[1]; this.layer = 'peoples';
    this.detail = loadDetail();
    document.querySelectorAll('#settle .seg[data-skey]').forEach(box => {
      const key = box.dataset.skey;
      box.innerHTML = ATLAS_OPTS[key].map(([v, l]) => `<button type="button" data-val="${esc(String(v))}" aria-pressed="false">${esc(l)}</button>`).join('');
      box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this[key] = b.dataset.val; this.sync(); this.draw(); });
    });
    const seg = (id, items, on) => segRow(id, items.map(([v, l]) => [v, esc(l)]), null, v => { on(v); this.sync(); }, {toggle: true});
    seg('setTool', TOOLS, v => { this.tool = v; this.note(NOTES[v]); });
    const peoples = PLACEABLE.peoples();
    seg('setPeople', peoples.map(P => [P.id, P.label]), v => { this.people = v; });
    this.peoples = peoples;
    const groups = {};
    for (const L of PLACEABLE.lairs()) (groups[L.kind] ||= []).push(L);
    $('setLairKind').innerHTML = Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(L => `<option value="${L.id}">${esc(L.label)}</option>`).join('')}</optgroup>`).join('');
    $('setCalKind').innerHTML = '<option value="">любое — решит мир</option>' + PLACEABLE.calamities().map(C => `<option value="${C.id}">${esc(C.label)}${C.town ? ' (в городе)' : ''}</option>`).join('');
    seg('setCalIn', FREE.calIn.map(y => [y, `${y} ${plural(y, 'год', 'года', 'лет')}`]), v => { this.calIn = +v; });
    $('setCalAny').addEventListener('click', () => this.calamityAt(-1));
    $('setWild').addEventListener('click', () => { const a = this.atlas; if (!a) return; const r = wildByLand(a); this.after(r.error ? r : {ok: `Легло логов: ${r.n}.`}); });
    seg('setRun', FREE.runs.map(y => [y, `+${y}`]), v => this.runFor(+v));
    // the walk: the world is saved (over its own record) and opens on the campaign screen at its capitals (app/campView.js)
    $('setMarch').addEventListener('click', async () => {
      const a = this.atlas; if (!a || !atlasDone(a)) return;
      const why = canMarch(a); if (why) { this.note(`Нельзя: ${why}.`, 'bad'); return; }
      this.note('Сохраняю мир и открываю поход…', 'good');
      try { const rec = await saveWorldToLibrary(a, this.worldName || `Мир ${a.cfg.seed}`, this.worldId); this.bind(rec.id, rec.name); march(rec.id, rec.name); }
      catch (e) { this.note('Не удалось сохранить: ' + e.message, 'bad'); }
    });
    // the observer's clock (core/clock.js): a season a step at the pace; the stretch («+N лет») is what it has to run
    this.syncPaceBox = mountPace($('setPace'), this.clock, {pauseId: 'setPause', active: () => !$('settle').hidden,
      onPace: id => { this.clock.setPace(id); if (this.clock.paused) { this.clock.resume(); this.animate?.(); } this.syncRun(); },
      onPause: () => { const a = this.atlas; if (!a || atlasDone(a)) return; this.clock.toggle(); if (!this.clock.paused) this.animate?.(); this.syncRun(); }});
    segOf($('setDetail'), DETAILS, this.detail, v => { this.detail = v; saveDetail(v); this.chronOf = null; if (this.atlas) this.renderSide(); });
    this.buildLibrary2();
    this.wireCamera({map: 'setMap', readout: 'setReadout', inspect: 'setInspect', dock: 'setDock', zoomIn: 'setZoomIn', zoomOut: 'setZoomOut', zoomFit: 'setZoomFit', skin: 'setSkin', screen: 'settle', legend: 'setLegend', hint: NOTES.look});
  }

  show() { this.sync(); this.refresh(); if (this.atlas) this.draw(); }

  note(text, kind = '') { const n = $('setNote'); n.textContent = text; n.className = `hand-note${kind ? ' ' + kind : ''}`; }


  sync() {
    const val = {layer: this.layer, ore: this.ore, fauna: this.fauna};
    document.querySelectorAll('#settle .seg[data-skey]').forEach(box => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === String(val[box.dataset.skey])))));
    $('setOre').hidden = this.layer !== 'ores'; $('setFauna').hidden = this.layer !== 'fauna';
    press('setTool', this.tool); press('setPeople', this.people); press('setCalIn', this.calIn);
    $('setPeopleRow').hidden = this.tool !== 'people'; $('setLairRow').hidden = this.tool !== 'lair'; $('setCalRow').hidden = this.tool !== 'calamity';
    $('setMap').classList.toggle('hand', this.tool !== 'look');
    const a = this.atlas, running = !!a && !atlasDone(a);
    $('setWild').disabled = !a || running || wildDone(a);
    $('setRun').querySelectorAll('button').forEach(b => { b.disabled = !a || running; });
    $('setSave').disabled = !a || running; $('setFile').disabled = !a || running; $('setMarch').disabled = !a || running;
    $('setMarch').title = a ? `Сохранить мир и выбрать столицу для похода; ${questText({quest: questHint(a)})}` : 'Сначала заселите землю';
    this.legend();
    this.syncRun();
  }
  syncRun() {
    const a = this.atlas, running = !!a && !atlasDone(a);
    $('setPause').hidden = !running; $('setPace').hidden = !a;
    this.syncPaceBox?.();
    $('setYear').textContent = !a ? '' : `${dateText(a, this.clock, seasonLabel)}${running ? ` → ${endYear(a)}` : ''}`;
  }

  // ── a world on the screen: a land made into a world with a clock, or a world of this screen saved before
  showWorld(a, id, name) {
    this.clock.stop(); this.clock.paused = false;
    this.atlas = a; this.chronOf = null;
    this.cam = new Camera(a.w, a.h); this.bitmap = null; this.bitmapKey = '';
    this.bind(id, name); this.sync(); this.select(null); this.renderSide();
    if (!atlasDone(a)) this.clock.start();
  }
  settle(land, name) {
    startFree(land);
    this.showWorld(land, null, `${name} — заселение`);
    this.note('Земля готова к заселению. Выберите руку: народ, логово или бедствие — или «Логова по земле».', 'good');
  }
  bind(id, name) {
    this.worldId = id; this.worldName = name;
    $('setName').value = name; $('setName2').textContent = name || '';
  }

  // ── the hand on the map
  clickAt(e) {
    const a = this.atlas; if (!a || !this.cam) return;
    if (this.tool === 'look') { this.selectAt(e); return; }   // the eye: the card of what is here (ui/inspect.js)
    const i = this.cellAt(e); if (i < 0) return;
    if (this.tool === 'people') { const res = landPeople(a, this.people, i); this.after(res.error ? res : {ok: `${res.town.name} заложен — держава «${realmLabel(a, res.realm.id)}».`}); }
    else if (this.tool === 'lair') { const res = addLair(a, $('setLairKind').value, i); this.after(res.error ? res : {ok: `«${res.name}» стоит.`}); }
    else if (this.tool === 'calamity') this.calamityAt(i);
  }
  calamityAt(i) {
    const a = this.atlas; if (!a) return;
    const res = setCalamity(a, {kind: $('setCalKind').value || null, at: i, years: this.calIn});
    this.after(res.error ? res : {ok: `Бедствие — ${res.label} — поднимется в ${res.riseAt}-м году.`});
  }
  after(res) {
    if (res.error) this.note(`Нельзя: ${res.error}.`, 'bad'); else this.note(res.ok, 'good');
    this.bitmapKey = ''; this.draw(); this.renderSide(); this.sync();
  }

  // ── the clock: a stretch of years, a season a step at the observer's pace (core/clock.js)
  runFor(years) {
    const a = this.atlas; if (!a || !atlasDone(a)) return;
    runYears(a, years); this.sync(); this.clock.start(); this.syncRun();
  }
  stepSeason() {
    const a = this.atlas; if (!a) return false;
    let once = false;
    return !stepRun(a, () => !once && (once = true));   // one season; the line at the stretch's end is told by stepRun
  }
  afterSeason() { this.draw(); this.renderSide(); this.renderInspect(); this.animate(); this.syncRun(); }
  frame() { const a = this.atlas; if (a && !atlasDone(a)) $('setYear').textContent = `${dateText(a, this.clock, seasonLabel)} → ${endYear(a)}`; }
  afterRun() { this.sync(); }
  stop() { if (this.atlas && !atlasDone(this.atlas)) this.clock.pause(); else this.clock.stop(); this.syncRun(); }

  // over the map: where the calamities set by hand will rise
  overlay(a, px, cam) {
    const k = Math.min(a.w, a.h) / 192;
    for (const c of a.calamities || []) {
      if (c.at == null || c.at < 0 || (c.phase !== 'waiting' && c.phase !== 'omens')) continue;
      const x = c.at % a.w + 0.5, y = ((c.at / a.w) | 0) + 0.5;
      px.setLineDash([1.2 * k, 1 * k]); px.strokeStyle = 'rgba(230,60,40,0.95)'; px.lineWidth = Math.max(this.minW * 1.5, 0.5 * k);
      px.beginPath(); px.arc(x, y, 5 * k, 0, Math.PI * 2); px.stroke(); px.setLineDash([]);
      px.fillStyle = 'rgba(230,60,40,0.95)'; px.font = `bold ${4 * k}px sans-serif`; px.textAlign = 'center'; px.textBaseline = 'middle'; px.fillText('!', x, y);
    }
  }

  renderSide() {
    const a = this.atlas; if (!a) return;
    const towns = (a.towns || []).filter(t => t.alive), lairs = (a.lairs || []).filter(l => l.alive);
    $('setStats').innerHTML = `<dt>Год</dt><dd>${a.hist.year}, ${seasonLabel(a.hist.season)}</dd>` +
      `<dt>Города</dt><dd>${towns.length}, жителей ${Math.round(towns.reduce((s, t) => s + t.pop, 0)).toLocaleString('ru-RU')}</dd>` +
      (a.realms || []).map(r => { const m = towns.filter(t => t.realm === r.id); return m.length ? `<dt>${esc(realmLabel(a, r.id))}</dt><dd>${m.length} ${plural(m.length, 'город', 'города', 'городов')}</dd>` : ''; }).join('') +
      `<dt>Логова</dt><dd>${lairs.length}${lairs.some(l => l.leader) ? `, главарей ${lairs.filter(l => l.leader).length}` : ''}</dd>` +
      ((a.ruins || []).length ? `<dt>Пепелища</dt><dd>${a.ruins.length}</dd>` : '');
    const cals = a.calamities || [];
    $('setCals').innerHTML = cals.length ? `<span class="lbl">Бедствия</span><div class="cal-list">${cals.map(c => `<div><b>${esc(c.label)}</b> — ${CAL_PHASES[c.phase] || c.phase}` +
      (c.phase === 'waiting' || c.phase === 'omens' ? `, поднимется в ${c.riseAt}-м году` : c.phase === 'rise' && c.boss ? `: ${esc(c.boss.title[0])} ${esc(c.boss.name)}, герои — к ${c.heroesAt}-му` : c.fell ? ` в ${c.fell.year}-м (${FELL_BY[c.fell.by] || c.fell.by})` : '') + '</div>').join('')}</div>` +
      (a.artifact ? `<small class="muted">${esc(a.artifact.name)}: ${ARTIFACT_AT[a.artifact.holder.kind] || '—'}</small>` : '') : '';
    $('setRels').innerHTML = relationsHtml(a);
    // the chronicle only grows: new lines are appended
    const box = $('setChron'), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 12;
    if (this.chronOf !== a) { this.chronOf = a; this.chronShown = 0; box.innerHTML = ''; }
    if (a.chronicle.length > this.chronShown) {
      const shown = a.chronicle.slice(this.chronShown).filter(c => c.season != null && keeps(this.detail, lineLevel(c)));
      box.insertAdjacentHTML('beforeend', shown.map(c => `<div class="lv-${c.hand ? 'notice' : lineLevel(c) === 'major' ? 'notice' : 'info'}${c.topic === 'calamity' ? ' lv-alert' : ''}"><small>год ${c.year}, ${seasonLabel(c.season)}</small> ${c.topic === 'calamity' || c.hand ? `<b>${esc(c.text)}</b>` : esc(c.text)}</div>`).join(''));
      this.chronShown = a.chronicle.length;
    }
    if (atEnd) box.scrollTop = box.scrollHeight;
  }

  // ── the library: lands to settle, worlds of this screen to go on with
  buildLibrary2() {
    const say = t => { $('setStatus').textContent = t; };
    $('setName').addEventListener('input', e => { this.worldName = e.target.value.trim(); $('setName2').textContent = this.worldName; });
    $('setSave').addEventListener('click', async () => {
      const a = this.atlas; if (!a || !atlasDone(a)) return;
      say('Сохраняю…');
      try {
        const rec = await saveWorldToLibrary(a, this.worldName || `Мир ${a.cfg.seed}`, this.worldId);
        say(`${this.worldId ? 'Сохранено поверх' : 'Сохранено'}: «${rec.name}», ${rec.lived} лет истории, ${(rec.bytes / 1e6).toFixed(1)} МБ.`);
        this.bind(rec.id, rec.name); this.refresh();
      } catch (e) { say('Не удалось сохранить: ' + e.message); }
    });
    $('setFile').addEventListener('click', async () => {
      const a = this.atlas; if (!a) return;
      try { const r = await downloadWorld(a, this.worldName || `Мир ${a.cfg.seed}`); say(r === 'declined' ? 'Файл не сохранён.' : 'Файл мира готов.'); }
      catch (e) { say('Не удалось: ' + e.message); }
    });
    const open = async (id, name, type) => {
      say('Открываю…');
      const seq = ++this.seq;   // the last world asked for is the one shown, whichever loads first
      try {
        const a = await openWorld(id); if (seq !== this.seq) return;
        warnEdits(a.tables);
        if (type === 'land') { this.settle(a, name); say(`Земля «${name}» открыта для заселения. Сохранение ляжет новым миром, земля останется как была.`); }
        else { this.showWorld(a, id, name); say(`Открыт мир «${name}».`); }
      } catch (err) { say('Не удалось открыть: ' + err.message); }
    };
    for (const box of ['setLands', 'setWorlds']) $(box).addEventListener('click', async e => {
      const b = e.target.closest('button'), row = e.target.closest('.sv'); if (!b || !row) return;
      if (b.dataset.act === 'del') {
        if (!confirm(`Удалить мир «${row.dataset.name}» из библиотеки? Это не отменить.`)) return;
        await deleteWorld(row.dataset.id); if (this.worldId === row.dataset.id) this.bind(null, this.worldName);
        this.refresh(); return;
      }
      if (this.atlas && !atlasDone(this.atlas)) this.stop();
      open(row.dataset.id, row.dataset.name, row.dataset.type);
    });
    $('setLoadFile').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      say('Открываю файл…');
      try {
        const seq = ++this.seq;
        const {a, rec} = await importWorld(f); this.refresh(); if (seq !== this.seq) return;
        warnEdits(a.tables);
        if (rec.type === 'land') { this.settle(a, rec.name); say(`Земля «${rec.name}» добавлена в библиотеку и открыта для заселения.`); }
        else if (isFree(a)) { this.showWorld(a, rec.id, rec.name); say(`Мир «${rec.name}» открыт.`); }
        else say(`«${rec.name}» — мир с эпохами, он лёг в библиотеку миров (полигон «Мир», «Кампания»). Здесь заселяют землю.`);
      } catch (err) { say('Не удалось открыть: ' + err.message); }
    });
  }

  async refresh() {
    let list;
    try { list = await listWorlds(); } catch (e) { $('setLands').innerHTML = '<small>Библиотека в этом браузере недоступна. Землю можно открыть файлом.</small>'; return; }
    const row = (r, act, sub) => `<div class="sv${r.id === this.worldId ? ' cur' : ''}" data-id="${esc(r.id)}" data-name="${esc(r.name)}" data-type="${r.type || 'world'}"><span class="t"><b>${esc(r.name)}</b> · сид ${esc(r.seed)} · ${esc(r.sizeLabel)}${r.tables ? ` · с правками таблиц (${r.tables})` : ''}<br><small>${sub}</small></span>` +
      `<button type="button" data-act="load">${act}</button><button type="button" data-act="del" class="quiet" aria-label="Удалить">Удалить</button></div>`;
    const when = r => new Date(r.savedAt).toLocaleString('ru-RU', {dateStyle: 'short', timeStyle: 'short'});
    const lands = list.filter(r => r.type === 'land'), worlds = list.filter(r => r.type !== 'land' && r.free);
    $('setLands').innerHTML = lands.length ? lands.map(r => row(r, 'Заселить', `${r.shape ? `правок руки: ${r.shape}` : 'как дал сид'} · ${when(r)}`)).join('') : '<small>Пока нет сохранённых земель: сотворите её на экране «Создать землю».</small>';
    $('setWorlds').innerHTML = worlds.length ? worlds.map(r => row(r, 'Открыть', `${r.lived ?? Math.max(0, r.year - 1)} лет · городов ${r.towns} · держав ${r.realms} · ${when(r)}`)).join('') : '<small>Пока нет заселённых миров.</small>';
  }
}
