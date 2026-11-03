// «Создать землю» (forest.html #land; docs/WORLD.md): only the land and its climate — plates, relief, sea,
// temperature, winds, rain, erosion, rivers, rocks, ores, biomes, soils, forests — with no peoples and no history.
// The hand edits the base the generator works from, not its result (atlas/shape.js): a plate's motion and height,
// the ground under a brush, the climate of the equator and the poles and the rain. Each edit enters the chain at its
// own stage, and the land is worked out again from a copy taken before that stage (the copies are this screen's, in
// memory; a land opened from the library is made whole again on its first edit). A land is saved as a land
// (atlas/save.js LAND_KIND) into the same library as the worlds, and «Заселение мира» will take it from there.
//
// The model — the land being made, its edits, the copies — is the core's (atlas/landMaker.js): this screen only shows it
// and passes the hand on. The map, its layers, the camera and the readout are ui/atlasView.js MapView.
import {MapView, ATLAS_OPTS} from '../ui/atlasView.js';
import {ATLAS_SIZES, DEFAULT_ATLAS_CFG, SHAPE} from '../data/atlas.js';
import {HEMISPHERES} from '../data/geology.js';
import {ATLAS_STAGES} from '../atlas/stages.js';
import {landDone} from '../atlas/generate.js';
import {shapeCount} from '../atlas/shape.js';
import {LandMaker} from '../atlas/landMaker.js';
import {scaleOf} from '../atlas/tectonics.js';
import {LAND_KIND} from '../atlas/save.js';
import {saveWorldToLibrary, listWorlds, openWorld, deleteWorld, downloadLand, importWorld} from '../ui/worlds.js';
import {warnEdits} from '../ui/tableEdits.js';
import {Camera} from '../render/camera.js';
import {seedNumber} from '../core/rng.js';
import {esc, plural} from '../core/util.js';
import {$} from '../ui/dom.js';

const STORE = 'forest.land';
const LAYERS = ATLAS_OPTS.layer.filter(([id]) => !['fauna', 'wild', 'rot', 'peoples', 'realms'].includes(id));
const TOOLS = [['look', 'Смотреть'], ['plate', 'Плиты'], ['raise', 'Поднять'], ['lower', 'Опустить']];
const ERA = {geology: 'Геология', climate: 'Климат', water: 'Вода', life: 'Жизнь'};
// the compass of the plate card: screen directions (y grows down the map)
const DIRS = [['↖', -1, -1], ['↑', 0, -1], ['↗', 1, -1], ['←', -1, 0], ['·', 0, 0], ['→', 1, 0], ['↙', -1, 1], ['↓', 0, 1], ['↘', 1, 1]];
const WORDS = ['на восток', 'на юго-восток', 'на юг', 'на юго-запад', 'на запад', 'на северо-запад', 'на север', 'на северо-восток'];
const wayOf = (vx, vy) => WORDS[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];
const randomSeed = () => String(100000 + Math.floor(Math.random() * 899999));
const signed = v => (v > 0 ? `+${v}` : `${v}`);

export class LandView extends MapView {
  setup() { this.cfg = this.load(); this.maker = null; }

  load() {
    try { const raw = localStorage.getItem(STORE); if (raw) { const c = {...DEFAULT_ATLAS_CFG, ...JSON.parse(raw)}; delete c.shape; return c; } } catch (e) { /* storage unavailable */ }
    return {...DEFAULT_ATLAS_CFG, seed: randomSeed()};
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.cfg)); } catch (e) { /* storage unavailable */ } }

  build() {
    this.tool = 'look'; this.radius = SHAPE.brush.radii[1][0]; this.plateSel = -1;
    const opts = {...ATLAS_OPTS, layer: LAYERS};
    document.querySelectorAll('#land .seg[data-lkey]').forEach(box => {
      const key = box.dataset.lkey;
      box.innerHTML = opts[key].map(([v, l]) => `<button type="button" data-val="${esc(String(v))}" aria-pressed="false">${esc(l)}</button>`).join('');
      box.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (key === 'layer' || key === 'ore') { this[key] = b.dataset.val; this.sync(); this.draw(); return; }
        this.cfg[key] = typeof DEFAULT_ATLAS_CFG[key] === 'number' ? +b.dataset.val : b.dataset.val;
        this.save(); this.sync();
      });
    });
    $('landSeed').addEventListener('input', e => { this.cfg.seed = e.target.value.trim() || '1'; this.save(); });
    $('landDice').addEventListener('click', () => { this.cfg.seed = randomSeed(); this.save(); this.sync(); });
    $('landGo').addEventListener('click', () => this.generate());

    // the hand: look, pick a plate, raise or lower with the brush
    $('landTool').innerHTML = TOOLS.map(([v, l]) => `<button type="button" data-val="${v}">${l}</button>`).join('');
    $('landTool').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      this.tool = b.dataset.val;
      if (this.tool === 'plate' && this.layer !== 'plates') this.layer = 'plates';
      if ((this.tool === 'raise' || this.tool === 'lower') && this.layer === 'plates') this.layer = 'relief';
      if (this.tool !== 'plate') this.selectPlate(-1);
      this.sync(); this.draw();
    });
    $('landRadius').innerHTML = SHAPE.brush.radii.map(([r, l]) => `<button type="button" data-val="${r}">${l}</button>`).join('');
    $('landRadius').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this.radius = +b.dataset.val; this.sync(); });

    // the plate card
    $('landDir').innerHTML = DIRS.map(([l, x, y]) => `<button type="button" data-x="${x}" data-y="${y}" title="${x || y ? wayOf(x, y) : 'остановить'}">${l}</button>`).join('');
    $('landDir').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (this.plate()) this.edited(this.maker.setDirection(this.plateSel, +b.dataset.x, +b.dataset.y));
    });
    $('landSpeed').innerHTML = SHAPE.speed.steps.map(([v, l]) => `<button type="button" data-val="${v}">${l}</button>`).join('');
    $('landSpeed').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !this.plate()) return;
      this.edited(this.maker.setSpeed(this.plateSel, +b.dataset.val));
    });
    $('landUp').addEventListener('click', () => { if (this.plate()) this.edited(this.maker.lift(this.plateSel, +1)); });
    $('landDown').addEventListener('click', () => { if (this.plate()) this.edited(this.maker.lift(this.plateSel, -1)); });
    $('landPlateReset').addEventListener('click', () => { if (this.plate()) this.edited(this.maker.resetPlate(this.plateSel)); });
    $('landPlateClose').addEventListener('click', () => this.selectPlate(-1));

    // the climate
    const C = SHAPE.climate, range = (id, [lo, hi], step) => Object.assign($(id), {min: lo, max: hi, step});
    range('landEq', C.equator, 1); range('landPole', C.pole, 1); range('landWet', C.wet, 0.05);
    const show = () => {
      $('landEqV').textContent = `${signed(+$('landEq').value)}°`;
      $('landPoleV').textContent = `${signed(+$('landPole').value)}°`;
      $('landWetV').textContent = `×${(+$('landWet').value).toFixed(2)}`;
    };
    for (const id of ['landEq', 'landPole', 'landWet']) {
      $(id).addEventListener('input', show);
      $(id).addEventListener('change', () => { if (!this.maker) return; this.maker.setClimate({equator: +$('landEq').value, pole: +$('landPole').value, wet: +$('landWet').value}); this.edited(true); });
    }
    this.showClimate = show;
    $('landReset').addEventListener('click', () => { if (!this.maker) return; this.maker.reset(); this.edited(true); });
    // a stroke whose pointer is lost (a dialog, the window left) is still ended — and the land made again
    $('landMap').addEventListener('lostpointercapture', () => { if (this.painting != null) { this.painting = null; this.paintEnd(); } });

    this.buildLandLibrary();
    this.wireCamera({map: 'landMap', readout: 'landReadout', zoomIn: 'landZoomIn', zoomOut: 'landZoomOut', zoomFit: 'landZoomFit', skin: 'landSkin', screen: 'land', legend: 'landLegend',
      hint: 'Наведите на карту, чтобы увидеть клетку. «Плиты» — щелчок выбирает плиту; «Поднять», «Опустить» — ведите кистью (сдвиг карты — правой кнопкой).'});
  }

  // the screen is opened (app/main.js)
  show() {
    this.sync(); this.refreshLands();
    if (!this.atlas) this.generate();
    else { this.draw(); if (!landDone(this.atlas)) this.run(); }
  }
  // leaving the screen (app/main.js): the making halts between frames and goes on when the screen is back
  stop() { clearTimeout(this.timer); this.timer = 0; }

  sync() {
    $('landSeed').value = this.cfg.seed;
    const val = {...this.cfg, layer: this.layer, ore: this.ore};
    document.querySelectorAll('#land .seg[data-lkey]').forEach(box => {
      box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === String(val[box.dataset.lkey]))));
    });
    $('landSizeNote').textContent = ATLAS_SIZES[this.cfg.size].note;
    $('landHemiNote').textContent = HEMISPHERES[this.cfg.hemisphere].note;
    $('landOre').hidden = this.layer !== 'ores';
    $('landTool').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === this.tool)));
    const brush = this.tool === 'raise' || this.tool === 'lower';
    $('landRadius').hidden = !brush;
    $('landRadius').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.val === this.radius)));
    $('landMap').classList.toggle('brush', brush);
    const shape = this.maker?.shape || {climate: {equator: 0, pole: 0, wet: 1}, strokes: []}, c = shape.climate;
    $('landEq').value = c.equator; $('landPole').value = c.pole; $('landWet').value = c.wet; this.showClimate();
    const n = shapeCount(shape);
    $('landEdits').textContent = n ? `Правок: ${n}${shape.strokes.length ? ` (мазков кисти ${shape.strokes.length})` : ''}` : 'Правок нет';
    $('landReset').disabled = !n;
    this.legend();
    this.syncPlate();
  }

  // ── making the land: a stage a frame; the copies before the stages the edits enter at are kept
  generate() {
    clearTimeout(this.timer); this.seq = (this.seq || 0) + 1;
    this.maker = new LandMaker(this.cfg); this.atlas = this.maker.atlas;
    this.cam = new Camera(this.atlas.w, this.atlas.h); this.bitmap = null; this.bitmapKey = '';
    this.bind(null, ''); this.selectPlate(-1); this.sync();
    this.renderSide(); this.run();
  }

  run() {
    const m = this.maker, a = m.atlas;
    clearTimeout(this.timer);
    const next = () => {
      if (a !== this.atlas) return;
      // as many stages as fit in a frame's budget, so a small land is worked out again at once and a large one is seen growing
      const t0 = performance.now();
      while (performance.now() - t0 < 45 && m.stepOne());
      this.bitmapKey = ''; this.draw(); this.renderSide();
      if (!landDone(a)) this.timer = setTimeout(next, 16);
      else { this.timer = 0; this.syncSave(); this.syncPlate(); }
    };
    this.timer = setTimeout(next, 16);
  }

  // the maker worked the land out again (atlas/landMaker.js): show the new one as it is made
  edited(changed) {
    if (!changed) return;
    this.atlas = this.maker.atlas;
    if (!this.cam || this.cam.w !== this.atlas.w || this.cam.h !== this.atlas.h) this.cam = new Camera(this.atlas.w, this.atlas.h);
    this.bitmapKey = '';
    this.sync(); this.syncSave(); this.renderSide(); this.run();
  }

  // ── plates
  plate() { return this.plateSel >= 0 ? this.atlas?.plates?.[this.plateSel] : null; }
  selectPlate(id) { this.plateSel = id; this.syncPlate(); this.draw(); }
  syncPlate() {
    const p = this.plate(), box = $('landPlate');
    box.hidden = !p;
    if (!p) return;
    const a = this.atlas, e = this.maker.shape.plates[p.id] || {}, sp = Math.hypot(p.vx, p.vy);
    $('landPlateTitle').textContent = `Плита ${p.id + 1}`;
    $('landPlateInfo').innerHTML = `<dt>Кора</dt><dd>${p.cont ? 'материковая' : 'океаническая'}</dd><dt>Площадь</dt><dd>${Math.round(p.area / a.n * 100)}% мира</dd>` +
      `<dt>Движение</dt><dd>${sp < 0.02 ? 'стоит' : `${wayOf(p.vx, p.vy)}, ${sp.toFixed(2)}`}${e.vx != null ? ' (правка)' : ''}</dd>` +
      `<dt>Высота</dt><dd>${e.lift ? signed(e.lift) : 'как дал сид'}</dd>`;
    $('landLift').textContent = e.lift ? signed(e.lift) : '0';
    const ux = sp > 1e-6 ? Math.sign(Math.round(p.vx / sp * 2.4 / 2)) : 0, uy = sp > 1e-6 ? Math.sign(Math.round(p.vy / sp * 2.4 / 2)) : 0;
    $('landDir').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(sp < 0.02 ? b.dataset.x === '0' && b.dataset.y === '0' : +b.dataset.x === ux && +b.dataset.y === uy)));
    const near = SHAPE.speed.steps.reduce((m, s) => (Math.abs(s[0] - sp) < Math.abs(m[0] - sp) ? s : m));
    $('landSpeed').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.val === near[0])));
    const busy = !landDone(a);
    for (const id of ['landUp', 'landDown', 'landPlateReset']) $(id).disabled = busy;
    $('landPlateReset').disabled = busy || !this.maker.shape.plates[p.id];
  }

  // the point under the cursor in cells, [x, y] (floats), or null off the map (MapView.cellAt is the cell's index)
  cellXY(e) {
    const a = this.atlas, cv = $(this.ids.map), r = cv.getBoundingClientRect();
    const [fx, fy] = this.cam.toCell(e.clientX - r.left, e.clientY - r.top);
    return fx < 0 || fy < 0 || fx >= a.w || fy >= a.h ? null : [fx, fy];
  }
  clickAt(e) {
    const a = this.atlas; if (!a || !a.f.plate || !this.cam || this.tool !== 'plate') return;
    const c = this.cellXY(e); if (!c) return;
    this.selectPlate(a.f.plate[Math.floor(c[1]) * a.w + Math.floor(c[0])]);
  }
  // ── the brush: the maker shows a stroke at once on the relief and works the chain out again when it ends
  paintStart(e) {
    if (this.tool !== 'raise' && this.tool !== 'lower') return false;
    const a = this.atlas; if (!a || !landDone(a)) return false;
    if (this.maker.strokesLeft <= 0) { $('landSaveStatus').textContent = `Мазков уже ${SHAPE.brush.max} — больше кисть не берёт. «Сбросить правки» или новая земля.`; return true; }
    this.stroking = true; this.paintMove(e);
    return true;
  }
  paintMove(e) {
    if (!this.stroking) return;
    const c = this.cellXY(e); if (!c) return;
    const st = this.maker.stroke(c[0], c[1], this.radius, this.tool === 'raise'); if (!st) return;
    // only the dab's box is painted again
    const R = Math.ceil(st.r * 2.2);
    this.paintBox(this.atlas, st.x - R, st.y - R, st.x + R, st.y + R); this.draw();
  }
  paintEnd() {
    if (!this.stroking) return;
    this.stroking = false;
    this.edited(this.maker.endStroke());
  }

  // over the map: the plates' motion as arrows (the picked plate in gold), the brush's rim under the cursor
  overlay(a, px, cam) {
    if (a.plates && a.f.plate && (this.layer === 'plates' || this.tool === 'plate')) {
      const k = scaleOf(a);
      for (const p of a.plates) {
        const sp = Math.hypot(p.vx, p.vy), sel = p.id === this.plateSel;
        px.strokeStyle = sel ? '#ffd36a' : 'rgba(255,255,255,0.85)'; px.fillStyle = px.strokeStyle;
        px.lineWidth = Math.max(this.minW * (sel ? 3 : 1.6), (sel ? 1.4 : 0.8) * k);
        px.beginPath(); px.arc(p.cx, p.cy, (sel ? 2.4 : 1.4) * k, 0, Math.PI * 2); px.fill();
        if (sp < 0.02) continue;
        const L = 16 * k * sp, ux = p.vx / sp, uy = p.vy / sp, x1 = p.cx + ux * L, y1 = p.cy + uy * L, hh = 4 * k;
        px.beginPath(); px.moveTo(p.cx, p.cy); px.lineTo(x1, y1);
        px.moveTo(x1, y1); px.lineTo(x1 - ux * hh - uy * hh * 0.6, y1 - uy * hh + ux * hh * 0.6);
        px.moveTo(x1, y1); px.lineTo(x1 - ux * hh + uy * hh * 0.6, y1 - uy * hh - ux * hh * 0.6);
        px.stroke();
      }
    }
    if (this.hoverAt && (this.tool === 'raise' || this.tool === 'lower')) {
      const r = this.radius * scaleOf(a);
      px.strokeStyle = this.tool === 'raise' ? 'rgba(255,211,106,0.9)' : 'rgba(140,190,255,0.9)'; px.lineWidth = Math.max(this.minW * 1.5, 0.3);
      px.beginPath(); px.arc(this.hoverAt[0], this.hoverAt[1], r, 0, Math.PI * 2); px.stroke();
    }
  }
  hover(e) {
    super.hover(e);
    if (this.tool === 'raise' || this.tool === 'lower') { this.hoverAt = this.atlas && this.cam ? this.cellXY(e) : null; if (!this.stroking) this.draw(); }
  }

  renderSide() {
    const a = this.atlas, all = ATLAS_STAGES.all();
    $('landStages').innerHTML = all.map((s, k) => {
      const st = k < a.stage ? 'done' : k === a.stage ? 'now' : '';
      const ms = a.ms[s.id] != null ? `${a.ms[s.id]} мс` : k < a.stage ? 'из копии' : k === a.stage ? '…' : '';
      return `<li class="${st}" title="${esc(s.note)}"><span>${esc(s.label)}</span><small>${ms}</small></li>`;
    }).join('');
    let land = 0; if (a.f.land) for (let i = 0; i < a.n; i++) land += a.f.land[i];
    const n = shapeCount(a.cfg.shape);
    $('landStats').innerHTML = `<dt>Клеток</dt><dd>${a.n.toLocaleString('ru-RU')}</dd><dt>Числовой сид</dt><dd>${seedNumber(a.cfg.seed)}</dd>` +
      `<dt>Этап</dt><dd>${Math.min(a.stage, all.length)} из ${all.length}</dd>` +
      (a.plates ? `<dt>Плиты</dt><dd>${a.plates.length}, материковых ${a.plates.filter(p => p.cont).length}</dd>` : '') +
      (a.f.land ? `<dt>Суша</dt><dd>${Math.round(land / a.n * 100)}%</dd>` : '') +
      (a.lakes ? `<dt>Озёра</dt><dd>${a.lakes.length}</dd>` : '') +
      `<dt>Правки</dt><dd>${n ? `${n} ${plural(n, 'правка', 'правки', 'правок')}` : 'нет'}</dd>`;
    $('landChron').innerHTML = a.chronicle.length ? a.chronicle.map(c => `<div class="lv-info"><small>${esc(ERA[c.era] || c.era)}</small> ${esc(c.text)}</div>`).join('') : '<small class="muted">Летопись начнётся с первым этапом.</small>';
  }

  // ── the library: only lands here (the worlds are the polygon's and the campaign's)
  buildLandLibrary() {
    const say = t => { $('landSaveStatus').textContent = t; };
    $('landName').addEventListener('input', e => { this.worldName = e.target.value.trim(); $('landName2').textContent = this.worldName; });
    $('landSave').addEventListener('click', async () => {
      const a = this.atlas; if (!a || !landDone(a)) return;
      say('Сохраняю…');
      try {
        const rec = await saveWorldToLibrary(a, this.worldName || `Земля ${a.cfg.seed}`, this.worldId, LAND_KIND);
        say(`${this.worldId ? 'Сохранено поверх' : 'Сохранено'}: «${rec.name}»${rec.shape ? `, правок ${rec.shape}` : ''}, ${(rec.bytes / 1e6).toFixed(1)} МБ.`);
        this.bind(rec.id, rec.name); this.refreshLands();
      } catch (e) { say('Не удалось сохранить: ' + e.message); }
    });
    $('landFile').addEventListener('click', async () => {
      const a = this.atlas; if (!a || !landDone(a)) return;
      try { const r = await downloadLand(a, this.worldName || `Земля ${a.cfg.seed}`); say(r === 'declined' ? 'Файл не сохранён.' : 'Файл земли готов.'); }
      catch (e) { say('Не удалось: ' + e.message); }
    });
    $('landList').addEventListener('click', async e => {
      const b = e.target.closest('button'), row = e.target.closest('.sv'); if (!b || !row) return;
      const id = row.dataset.id;
      if (b.dataset.act === 'del') {
        if (!confirm(`Удалить землю «${row.dataset.name}» из библиотеки? Это не отменить.`)) return;
        await deleteWorld(id); if (this.worldId === id) this.bind(null, this.worldName);
        this.refreshLands(); return;
      }
      say('Открываю…');
      const seq = this.seq = (this.seq || 0) + 1;   // the last land asked for is the one shown
      try { const a = await openWorld(id); if (seq !== this.seq) return; this.showLand(a, id, row.dataset.name); say(`Открыта земля «${row.dataset.name}».`); warnEdits(a.tables); }
      catch (err) { say('Не удалось открыть: ' + err.message); }
    });
    $('landLoadFile').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      say('Открываю файл…');
      try {
        const {a, rec} = await importWorld(f);
        if (rec.type !== 'land') { say(`«${rec.name}» — мир с историей, он лёг в библиотеку миров (полигон «Мир», «Кампания»). Здесь открываются земли.`); return; }
        this.showLand(a, rec.id, rec.name); this.refreshLands(); say(`Земля «${rec.name}» открыта и добавлена в библиотеку.`); warnEdits(a.tables);
      } catch (err) { say('Не удалось открыть: ' + err.message); }
    });
  }

  bind(id, name) {
    this.worldId = id; this.worldName = name;
    $('landName').value = name; $('landName2').textContent = name || '';
    this.syncSave();
  }
  syncSave() {
    const ready = !!this.atlas && landDone(this.atlas);
    $('landSave').disabled = !ready; $('landFile').disabled = !ready;
    $('landSave').textContent = this.worldId ? 'Сохранить поверх' : 'Сохранить';
  }

  async refreshLands() {
    const box = $('landList');
    let list;
    try { list = (await listWorlds()).filter(r => r.type === 'land'); } catch (e) { box.innerHTML = '<small>Библиотека в этом браузере недоступна. Землю можно сохранить файлом.</small>'; return; }
    if (!list.length) { box.innerHTML = '<small>Пока нет сохранённых земель.</small>'; return; }
    box.innerHTML = list.map(r => `<div class="sv${r.id === this.worldId ? ' cur' : ''}" data-id="${esc(r.id)}" data-name="${esc(r.name)}"><span class="t"><b>${esc(r.name)}</b> · сид ${esc(r.seed)} · ${esc(r.sizeLabel)}${r.tables ? ` · с правками таблиц (${r.tables})` : ''}` +
      `<br><small>${r.shape ? `правок руки: ${r.shape}` : 'как дал сид'} · ${new Date(r.savedAt).toLocaleString('ru-RU', {dateStyle: 'short', timeStyle: 'short'})}</small></span>` +
      `<button type="button" data-act="load">Открыть</button><button type="button" data-act="del" class="quiet" aria-label="Удалить землю">Удалить</button></div>`).join('');
  }

  // a saved land on the screen: its settings and its edits; the copies are made again on the first edit
  showLand(a, id, name) {
    clearTimeout(this.timer); this.timer = 0;
    this.maker = LandMaker.open(a); this.atlas = a;
    this.cfg = {...DEFAULT_ATLAS_CFG, ...a.cfg}; delete this.cfg.shape; this.save();
    this.cam = new Camera(a.w, a.h); this.bitmap = null; this.bitmapKey = '';
    this.bind(id, name); this.selectPlate(-1); this.sync();
    this.draw(); this.renderSide();
    if (!landDone(a)) this.run();
  }
}

