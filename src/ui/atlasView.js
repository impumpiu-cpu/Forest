// The «Мир» screen: the world-map polygon. Settings on the left, the map in the middle, the
// chronicle on the right. The land runs a stage a frame; history runs at the chosen pace (SPEEDS:
// seasons a frame), so the map is drawn and the chronicle written as the world is made. The map has
// a camera (render/camera.js): the wheel zooms at the cursor, dragging pans, as on the local map.
// The cells are painted once per change into an off-screen bitmap and drawn scaled; everything on
// top (rivers, roads, towns, lairs) is drawn in cell units over it. (Later the generation moves to
// a Web Worker — docs/WORLD.md.)
import {ATLAS_SIZES, ATLAS_LAND, DEFAULT_ATLAS_CFG} from '../data/atlas.js';
import {ATLAS_STAGES} from '../atlas/stages.js';
import {cellGeology} from '../atlas/geology.js';
import {riverKind} from '../atlas/hydrology.js';
import {biomeAt, soilAt, cellBiomes} from '../atlas/biomes.js';
import {heightKm} from '../atlas/climate.js';
import {BIOMES, BIOME_KINDS} from '../data/biomes.js';
import {SOILS} from '../data/soils.js';
import {RIVERS} from '../data/hydrology.js';
import {scaleOf} from '../atlas/tectonics.js';
import {PLATE_COUNTS, HEMISPHERES, BOUNDARIES, BOUNDARY_BY_CODE, ROCKS, ROCK_BY_CODE, ROCK_KINDS, ORE_GENESIS} from '../data/geology.js';
import {LEVEL_WORDS} from '../data/regions.js';
import {RAIN_WORDS} from '../data/climate.js';
import {newAtlas, runNextStage, atlasDone, landDone} from '../atlas/generate.js';
import {historyLength, seasonLabel, eraPlan} from '../atlas/history.js';
import {townAt, landOf, townLabel} from '../atlas/peoples.js';
import {roadLevel} from '../atlas/roads.js';
import {seaLevelOf} from '../atlas/sea.js';
import {SEA} from '../data/roads.js';
import {WORLD_PEOPLES, ELDER_YEARS, YOUNG_YEARS} from '../data/peoples.js';
import {stateOf, stateLabel, attitude, ruinAt, relation} from '../atlas/diplomacy.js';
import {realmOf, realmLabel} from '../atlas/realms.js';
import {ROADS} from '../data/roads.js';
import {faunaAt} from '../atlas/fauna.js';
import {lairAt} from '../atlas/lairs.js';
import {LAIRS} from '../data/lairs.js';
import {WILD_YEARS, ERAS} from '../data/history.js';
import {SPECIES} from '../data/species.js';
import {TOWN_BUILDINGS, EFFECTS} from '../data/townBuildings.js';
import {townFx, room} from '../atlas/towns.js';
import {seedNumber} from '../core/rng.js';
import {esc} from '../core/util.js';
import {$} from './dom.js';
import {Camera} from '../render/camera.js';
import {siteAt, siteRadius} from '../atlas/sites.js';
import {partyAt} from '../atlas/parties.js';
import {CATEGORIES} from '../data/townBuildings.js';

const STORE = 'forest.atlas';
const ERA = {geology: 'Геология', climate: 'Климат', water: 'Вода', life: 'Жизнь'};
const OPTS = {
  size: Object.entries(ATLAS_SIZES).map(([k, v]) => [k, v.label]),
  land: ATLAS_LAND.map((l, i) => [i, l.label]),
  plates: PLATE_COUNTS.map((p, i) => [i, p.label]),
  hemisphere: Object.entries(HEMISPHERES).map(([k, v]) => [k, v.label]),
  wild: WILD_YEARS.map((e, i) => [i, e.label]),
  elder: ELDER_YEARS.map((e, i) => [i, e.label]),
  young: YOUNG_YEARS.map((e, i) => [i, e.label]),
  fauna: SPECIES.filter(sp => sp.habitat).map(sp => [sp.id, sp.plural]),
  layer: [['relief', 'Рельеф'], ['plates', 'Плиты'], ['rocks', 'Породы'], ['ores', 'Руды'], ['temp', 'Температура'], ['wind', 'Ветры'], ['rain', 'Осадки'], ['biomes', 'Биомы'], ['soils', 'Почвы'], ['fauna', 'Звери'], ['peoples', 'Народы']],
  ore: ORE_GENESIS.all().map(o => [o.id, o.label]),
};
const VIEW_KEYS = new Set(['layer', 'ore', 'fauna']);
// the pace of history: seasons a frame and the wait between frames; «сразу» runs as many seasons as
// fit in a frame's budget. ×1 is a season a frame — 100 years in about 40 s, slow enough to read
const SPEEDS = [
  {id: 'x1', label: '×1', steps: 1, wait: 100},
  {id: 'x4', label: '×4', steps: 4, wait: 100},
  {id: 'x16', label: '×16', steps: 16, wait: 60},
  {id: 'max', label: 'Сразу', steps: Infinity, wait: 30, budget: 30},
];
const DRAG_PX = 5;
// the marks of the towns' works, by the building's category (data/townBuildings.js CATEGORIES)
const SITE_COLORS = {food: [196, 182, 72], raw: [168, 150, 128], trade: [220, 190, 120]};   // a press that moves less than this is a click (a hover); further, it drags the map

const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
const hexRgb = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
const faunaCellOf = (a, i) => (((i / a.w) | 0) / a.fauna.c | 0) * a.fauna.W + ((i % a.w) / a.fauna.c | 0);
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t));
  for (let k = 1; k < stops.length; k++) if (t <= stops[k][0]) {
    const [t0, c0] = stops[k - 1], [t1, c1] = stops[k];
    return mix(c0, c1, (t - t0) / (t1 - t0 || 1));
  }
  return stops[stops.length - 1][1];
}
const FRESH = [58, 104, 150], SALT = [150, 176, 168], RIVER = 'rgba(70,130,190,0.95)';
const DEEP = [[0, [12, 24, 52]], [1, [46, 92, 130]]];
const LAND = [[0, [96, 128, 70]], [0.35, [130, 140, 78]], [0.65, [128, 104, 74]], [0.85, [110, 100, 96]], [1, [236, 236, 230]]];
const HEAT = [[0, [70, 110, 200]], [0.4, [190, 220, 230]], [0.6, [236, 214, 120]], [1, [200, 70, 50]]];
// yearly rain, mm: desert sand → steppe → green → deep wet blue-green
const WET = [[0, [214, 184, 120]], [250, [196, 186, 110]], [600, [120, 160, 80]], [1200, [50, 130, 90]], [2500, [30, 90, 120]]];
const rainColor = mm => ramp(WET.map(([v, c]) => [v / 2500, c]), mm / 2500);
const COMPASS = ['восточный', 'юго-восточный', 'южный', 'юго-западный', 'западный', 'северо-западный', 'северный', 'северо-восточный'];
// where the wind blows from, in words (the map's y grows downwards: north is up)
const windWord = (x, y) => COMPASS[(Math.round(Math.atan2(-y, -x) / (Math.PI / 4)) + 8) % 8];

export class AtlasView {
  constructor({onBack}) {
    this.cfg = this.load(); this.atlas = null; this.layer = 'relief'; this.ore = 'iron'; this.fauna = 'wolf'; this.timer = 0; this.paused = false;
    this.speed = 'x1'; this.cam = null; this.bitmap = null; this.bitmapKey = ''; this.grab = null;
    this.onBack = onBack;
    this.build();
  }

  load() {
    try { const raw = localStorage.getItem(STORE); if (raw) return {...DEFAULT_ATLAS_CFG, ...JSON.parse(raw)}; } catch (e) { /* storage unavailable */ }
    return {...DEFAULT_ATLAS_CFG};
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.cfg)); } catch (e) { /* storage unavailable */ } }

  build() {
    document.querySelectorAll('#atlas .seg[data-akey]').forEach(box => {
      const key = box.dataset.akey;
      box.innerHTML = OPTS[key].map(([v, l]) => `<button type="button" data-val="${v}" aria-pressed="false">${l}</button>`).join('');
      box.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (VIEW_KEYS.has(key)) { this[key] = b.dataset.val; this.sync(); this.draw(); return; }
        this.cfg[key] = typeof DEFAULT_ATLAS_CFG[key] === 'number' ? +b.dataset.val : b.dataset.val;
        this.save(); this.sync();
      });
    });
    $('atlasSeed').addEventListener('input', e => { this.cfg.seed = e.target.value.trim() || '1'; this.save(); });
    $('atlasRandom').addEventListener('click', () => { this.cfg.seed = String(100000 + Math.floor(Math.random() * 899999)); this.save(); this.sync(); });
    $('atlasGo').addEventListener('click', () => this.generate());
    $('atlasPause').addEventListener('click', () => { this.paused = !this.paused; this.syncPause(); if (!this.paused) this.run(); });
    const sp = $('atlasSpeed');
    sp.innerHTML = SPEEDS.map(S => `<button type="button" data-val="${S.id}" aria-pressed="false">${S.label}</button>`).join('');
    sp.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      this.speed = b.dataset.val; this.paused = false; this.syncPause(); this.run();
    });
    $('atlasBack').addEventListener('click', () => { this.stop(); this.onBack(); });
    // the camera: the wheel zooms at the cursor, dragging pans, the buttons zoom at the middle
    const cv = $('atlasMap');
    const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      if (!this.cam) return;
      this.grab = {id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: e.button !== 0};
      cv.setPointerCapture(e.pointerId);
      if (e.button !== 0) e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      const g = this.grab;
      if (g && g.id === e.pointerId) {
        if (!g.drag && Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_PX) g.drag = true;
        if (g.drag) { const [cw, ch] = this.box(); this.cam.pan(cw, ch, e.clientX - g.lx, e.clientY - g.ly); cv.classList.add('dragging'); this.draw(); }
        g.lx = e.clientX; g.ly = e.clientY;
      }
      this.hover(e);
    });
    const release = () => { this.grab = null; cv.classList.remove('dragging'); };
    cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
    cv.addEventListener('pointerleave', () => { $('atlasReadout').textContent = 'Наведите на карту, чтобы увидеть клетку.'; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      if (!this.cam) return;
      e.preventDefault();
      const [px, py] = local(e), [cw, ch] = this.box();
      this.cam.zoomAt(cw, ch, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), px, py); this.draw();
    }, {passive: false});
    $('atlasZoomIn').addEventListener('click', () => this.zoomCentre(1.6));
    $('atlasZoomOut').addEventListener('click', () => this.zoomCentre(1 / 1.6));
    $('atlasZoomFit').addEventListener('click', () => { if (this.cam) { this.cam.reset(); this.draw(); } });
    document.addEventListener('keydown', e => {
      if ($('atlas').hidden || e.target !== document.body || e.ctrlKey || e.metaKey) return;
      if (e.key === '+' || e.key === '=') this.zoomCentre(1.6);
      else if (e.key === '-' || e.key === '_') this.zoomCentre(1 / 1.6);
      else if (e.key === '0' || e.key === 'Home') { if (this.cam) { this.cam.reset(); this.draw(); } }
    });
  }

  // the size of the map's box in CSS pixels (the canvas is kept at the box's size, at device resolution)
  box() { const cv = $('atlasMap'); return [cv.clientWidth || 1, cv.clientHeight || 1]; }
  zoomCentre(f) { if (!this.cam) return; const [cw, ch] = this.box(); this.cam.zoomAt(cw, ch, f, cw / 2, ch / 2); this.draw(); }

  show() { this.sync(); if (!this.atlas) this.generate(); }

  // leaving the screen: the generation halts between frames; if it was not finished, it waits as paused and «Дальше» continues it
  stop() {
    clearTimeout(this.timer); this.timer = 0;
    const a = this.atlas;
    if (a && !atlasDone(a)) this.paused = true;
    this.syncPause();
  }

  sync() {
    $('atlasSeed').value = this.cfg.seed;
    const val = {...this.cfg, layer: this.layer, ore: this.ore, fauna: this.fauna};
    document.querySelectorAll('#atlas .seg[data-akey]').forEach(box => {
      box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === String(val[box.dataset.akey]))));
    });
    $('atlasSizeNote').textContent = ATLAS_SIZES[this.cfg.size].note;
    $('atlasHemiNote').textContent = HEMISPHERES[this.cfg.hemisphere].note;
    $('atlasOre').hidden = this.layer !== 'ores';
    $('atlasFauna').hidden = this.layer !== 'fauna';
    $('atlasWildNote').textContent = `${WILD_YEARS[this.cfg.wild].years} лет до прихода народов`;
    $('atlasElderNote').textContent = `${ELDER_YEARS[this.cfg.elder].years} лет эльфов и гномов`;
    $('atlasYoungNote').textContent = `${YOUNG_YEARS[this.cfg.young].years} лет людей и орков до высадки`;
    $('atlasSpeed').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === this.speed)));
    this.legend();
  }

  legend() {
    const sw = (c, l) => `<span><i style="background:rgb(${c.join(',')})"></i>${esc(l)}</span>`;
    let html = '';
    if (this.layer === 'plates') html = sw([200, 190, 150], 'материковая кора') + sw([50, 62, 96], 'океаническая кора') + BOUNDARIES.all().map(b => sw(b.color, b.label)).join('') + sw([255, 60, 30], 'живой вулкан');
    else if (this.layer === 'rocks') html = Object.entries(ROCK_KINDS).map(([k, l]) => `<b>${l}:</b> ` + ROCKS.filter(r => r.kind === k).map(r => sw(r.color, r.label)).join('')).join('');
    else if (this.layer === 'ores') { const o = ORE_GENESIS.get(this.ore); html = sw([70, 72, 66], 'нет') + sw(mix([70, 72, 66], o.color, 0.45), 'бедно') + sw(mix([70, 72, 66], o.color, 0.75), 'есть') + sw(o.color, 'богато'); }
    else if (this.layer === 'biomes') html = Object.entries(BIOME_KINDS).filter(([k]) => k !== 'feature').map(([k, l]) => `<b>${l}:</b> ` + BIOMES.filter(b => b.kind === k).map(b => sw(b.color, b.label)).join('')).join('') + '<b>леса</b> темнее, гари светлее';
    else if (this.layer === 'soils') html = SOILS.filter(s => s.id !== 'none').map(s => sw(s.color, s.label)).join('') + '<b>ярче</b> — плодороднее';
    else if (this.layer === 'fauna') html = sw([70, 70, 64], 'не их края') + sw([120, 116, 100], 'могут жить, но нет') + sw(SPECIES.get(this.fauna).look?.color ? hexRgb(SPECIES.get(this.fauna).look.color) : [220, 120, 60], 'столько, сколько край прокормит') + '<b>логова</b> (ромб): ' + LAIRS.filter(L => !L.tribe && !L.undead).map(L => sw(L.color, L.label)).join('') + '<b>станы племён</b> (шатёр): ' + LAIRS.filter(L => L.tribe).map(L => sw(L.color, L.label)).join('') + '<b>мёртвые</b> (крест): ' + LAIRS.filter(L => L.undead).map(L => sw(L.color, L.label)).join('') + sw([60, 40, 40], '× опустевшее') + sw([110, 60, 130], 'гниль');
    else if (this.layer === 'peoples') html = WORLD_PEOPLES.all().map(P => sw(P.color, `земли: ${P.label}`)).join('') + '<b>города</b> — квадраты в цвете державы (оттенок цвета народа), крупнее с ростом; кольцо — столица державы; ' + ROADS.levels.map(L => L.label).join(', ') + '; пунктир по воде — морские пути гаваней; × в кольце — сожжённый город; ' + sw([120, 90, 90], 'курганы былых битв') + '<b>угодья городов</b>: ' + sw(SITE_COLORS.food, 'пашни, выгоны, рощи (круг)') + sw(SITE_COLORS.raw, 'рудники, каменоломни, лесосеки (квадрат)') + '× пень — сожжено; тонкие тропы к городу; <b>жёлтые связи</b> между городами — по ним идёт хлеб, ярче — больше; <b>отряды</b>: круг с хвостом — набег или выводок, квадрат — войско, крылья — дракон (пунктир — путь вперёд); ' + sw([170, 70, 40], 'фуражиры войска');
    else if (this.layer === 'rain') html = [[100, 'пустыня'], [400, 'сухо'], [800, 'умеренно'], [1500, 'влажно'], [2500, 'очень влажно']].map(([v, l]) => sw(rainColor(v), `${l} (${v} мм)`)).join('');
    else if (this.layer === 'wind') html = sw([240, 240, 230], 'стрелки — куда дует ветер') + sw([90, 110, 150], 'тише') + sw([200, 210, 240], 'сильнее');
    else if (this.layer === 'temp') html = sw(HEAT[0][1], '−30°') + sw(HEAT[1][1], '−4°') + sw(HEAT[2][1], '+9°') + sw(HEAT[3][1], '+35°');
    else html = sw(FRESH, 'пресное озеро') + sw(SALT, 'солёное озеро') + `<span><i style="background:${RIVER};height:3px"></i>реки</span>` + sw(DEEP[0][1], 'глубокое море') + sw(DEEP[1][1], 'мелководье') + sw(LAND[0][1], 'низины') + sw(LAND[2][1], 'нагорья') + sw(LAND[4][1], 'вершины');
    $('atlasLegend').innerHTML = html;
  }

  generate() {
    clearTimeout(this.timer);
    const a = this.atlas = newAtlas(this.cfg);
    this.cam = new Camera(a.w, a.h); this.bitmap = null; this.bitmapKey = '';
    this.paused = false; this.syncPause();
    this.renderSide();
    this.run();
  }

  // the land a stage a frame, then history at the chosen pace (SPEEDS); pausing stops between frames
  run() {
    const a = this.atlas;
    clearTimeout(this.timer);
    const next = () => {
      if (a !== this.atlas || this.paused) return;
      const sp = SPEEDS.find(S => S.id === this.speed) || SPEEDS[0], land = !landDone(a);
      const steps = land ? 1 : sp.steps, t0 = Date.now();
      for (let k = 0; k < steps && !atlasDone(a); k++) { runNextStage(a); if (sp.budget && Date.now() - t0 > sp.budget) break; }
      this.tickAt = performance.now(); this.tickWait = land ? 0 : sp.wait;
      this.draw(); this.renderSide(); this.animate();
      if (land && landDone(a)) this.syncPause();   // the land is made: the pace and the pause appear
      if (!atlasDone(a)) this.timer = setTimeout(next, land ? 30 : sp.wait); else this.syncPause();
    };
    this.timer = setTimeout(next, 30);
  }

  syncPause() {
    const b = $('atlasPause'), a = this.atlas, busy = a && landDone(a) && !atlasDone(a);
    b.hidden = !busy && !(this.paused && a && !atlasDone(a));
    b.textContent = this.paused ? 'Дальше' : 'Пауза';
    $('atlasSpeed').hidden = b.hidden;
    $('atlasSpeed').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.val === this.speed)));
  }

  // the colour of one cell on the chosen layer; a field that is not made yet shows as the dark sea
  color(a, i) {
    const f = a.f;
    if (!f.elev) {
      if (f.plate && this.layer === 'plates') return this.plateColor(a, i);
      return [12, 15, 10];
    }
    let base = f.land ? (f.land[i] ? ramp(LAND, (f.elev[i] - a.sea) / (1 - a.sea)) : ramp(DEEP, f.elev[i] / (a.sea || 1))) : ramp(LAND, f.elev[i]);
    if (f.lake && f.lake[i] >= 0) base = a.lakes[f.lake[i]].salt ? SALT : FRESH;
    switch (this.layer) {
      case 'plates': return this.plateColor(a, i);
      case 'rocks': return f.rock ? (f.land[i] ? ROCK_BY_CODE[f.rock[i]].color : mix(ROCK_BY_CODE[f.rock[i]].color, [14, 26, 50], 0.7)) : base;
      case 'ores': {
        const pot = f[`ore_${this.ore}`]; if (!pot) return base;
        const o = ORE_GENESIS.get(this.ore), lv = o.levels, v = pot[i], grey = [70, 72, 66];
        if (!f.land[i]) return mix(base, [8, 12, 20], 0.5);
        return v < lv[0] ? grey : v < lv[1] ? mix(grey, o.color, 0.45) : v < lv[2] ? mix(grey, o.color, 0.75) : o.color;
      }
      case 'temp': return f.temp ? ramp(HEAT, (f.temp[i] + 30) / 65) : base;
      case 'biomes': {
        const b = biomeAt(a, i); if (!b) return base;
        // the tree cover darkens the zone's colour, burnt ground shows paler
        return f.trees && b.trees > 0.2 ? mix(mix(b.color, [210, 200, 150], 0.35), mix(b.color, [16, 40, 20], 0.35), f.trees[i] / b.trees) : b.color;
      }
      case 'soils': {
        const s = soilAt(a, i); if (!s) return base;
        return mix([60, 60, 56], s.color, 0.6 + 0.4 * f.fert[i]);
      }
      case 'fauna': {
        if (!a.fauna || f.ocean[i]) return mix(base, [8, 12, 20], 0.4);
        const v = faunaAt(a, i, this.fauna), sp = SPECIES.get(this.fauna), K = a.fauna.list[a.fauna.idx[this.fauna]].K[faunaCellOf(a, i)];
        if (K <= 0) return mix(base, [40, 40, 36], 0.75);
        const col = sp.look?.color ? hexRgb(sp.look.color) : [220, 120, 60];
        return this.rotTint(a, i, mix(mix(base, [40, 40, 36], 0.6), col, Math.min(1, v) * 0.9));
      }
      case 'peoples': {
        const g = mix(base, [40, 40, 36], 0.55), land = a.peoples && landOf(a, i);
        let c = land ? mix(g, land.people.color, 0.25 + 0.6 * land.share) : g;
        if (f.barrows && f.barrows[i] > 0) c = mix(c, [120, 90, 90], 0.5 * f.barrows[i]);   // old battlefields
        if (f.scourge && f.scourge[i] > 0.25) c = mix(c, [170, 70, 40], 0.5 * f.scourge[i]);   // an army's foragers
        return this.rotTint(a, i, c);
      }
      case 'rain': return f.rain ? (f.land[i] ? rainColor(f.rain[i]) : mix(base, rainColor(f.rain[i]), 0.25)) : base;
      case 'wind': {
        if (!f.windX) return base;
        const sp = Math.min(1, Math.hypot(f.windX[i], f.windY[i]));
        return mix(mix(base, [40, 44, 40], 0.55), mix([90, 110, 150], [200, 210, 240], sp), 0.35);
      }
      default: return base;
    }
  }

  // the rot of the dead (atlas/lairs.js): a violet stain where it is thick
  rotTint(a, i, c) {
    if (!a.rot || a.f.ocean[i]) return c;
    const v = a.rot[faunaCellOf(a, i)];
    return v > 0.08 ? mix(c, [110, 60, 130], Math.min(0.75, v * 0.8)) : c;
  }

  plateColor(a, i) {
    const f = a.f, p = a.plates[f.plate[i]];
    if (f.bnd && f.bnd[i]) return BOUNDARY_BY_CODE[f.bnd[i]].color;
    if (f.volc && f.volc[i] > 0.6) return [255, 60, 30];
    // each plate its own hue; continental crust lighter, oceanic darker
    const hue = (p.id * 0.618034) % 1, c = [0, 2.1, 4.2].map(o => 115 + Math.cos(hue * 6.283 + o) * 55);
    return f.crust && f.crust[i] > 0.5 ? mix(c, [200, 190, 150], 0.45) : mix(c, [24, 32, 60], 0.55);
  }

  // light from the north-west on the relief, so ranges read at a glance
  shade(a, i) {
    const e = a.f.elev; if (!e || !a.f.land || !a.f.land[i] || this.layer === 'plates') return 1;
    const x = i % a.w, y = (i / a.w) | 0, l = e[y * a.w + Math.max(0, x - 1)], t = e[Math.max(0, y - 1) * a.w + x];
    return Math.max(0.6, Math.min(1.35, 1 + (l + t - 2 * e[i]) * -14 * Math.min(a.w, a.h) / 192));
  }

  // the cells, painted into an off-screen bitmap (one pixel a cell) when the world or the layer changed
  paint(a) {
    const key = `${this.layer}:${this.ore}:${this.fauna}:${a.stage}:${a.hist ? a.hist.step : -1}`;
    if (this.bitmap && this.bitmapKey === key) return this.bitmap;
    const off = this.bitmap || document.createElement('canvas');
    if (off.width !== a.w || off.height !== a.h) { off.width = a.w; off.height = a.h; }
    const px = off.getContext('2d'), img = px.createImageData(a.w, a.h), d = img.data;
    for (let i = 0; i < a.n; i++) {
      const c = this.color(a, i), s = this.shade(a, i), o = i * 4;
      d[o] = c[0] * s; d[o + 1] = c[1] * s; d[o + 2] = c[2] * s; d[o + 3] = 255;
    }
    px.putImageData(img, 0, 0);
    this.bitmap = off; this.bitmapKey = key;
    return off;
  }

  // the size unit of what is drawn over the cells: a 192-cell-high world's cell at zoom 1, growing
  // with the zoom slower than the cells do, so a close-up still shows the ground around a town
  unit(a) { return Math.min(a.w, a.h) / 192 / Math.pow(this.cam.zoom, 0.6); }

  draw() {
    const a = this.atlas; if (!a || !this.cam) return;
    const cv = $('atlasMap'), [cw, ch] = this.box(), dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const cam = this.cam.clamp(cw, ch), px = cv.getContext('2d');
    px.setTransform(dpr, 0, 0, dpr, 0, 0);
    px.fillStyle = '#0d0f0a'; px.fillRect(0, 0, cw, ch);
    px.imageSmoothingEnabled = false;
    px.drawImage(this.paint(a), cam.ox, cam.oy, a.w * cam.S, a.h * cam.S);
    // everything on top is drawn in cell units; a line is never thinner than about a pixel
    px.translate(cam.ox, cam.oy); px.scale(cam.S, cam.S);
    this.minW = 0.7 / cam.S;
    if (this.layer === 'wind' && a.f.windX) this.arrows(a, px);
    if (a.f.road && ['relief', 'biomes', 'peoples', 'fauna'].includes(this.layer)) this.drawRoads(a, px);
    if (a.f.sea && ['relief', 'biomes', 'peoples'].includes(this.layer)) this.drawLanes(a, px);
    if (a.lairs && ['relief', 'biomes', 'fauna', 'peoples'].includes(this.layer)) this.drawLairs(a, px);
    if (a.net && this.layer === 'peoples') this.drawLinks(a, px);
    if (a.sites && ['relief', 'biomes', 'peoples', 'soils'].includes(this.layer)) this.drawSites(a, px);
    if (a.parties && ['relief', 'biomes', 'peoples', 'fauna'].includes(this.layer)) this.drawParties(a, px);
    if (a.ruins && ['relief', 'biomes', 'peoples'].includes(this.layer)) this.drawRuins(a, px);
    if (a.towns && ['relief', 'biomes', 'peoples', 'fauna', 'rain', 'soils'].includes(this.layer)) this.drawTowns(a, px);
    if (a.f.flow && ['relief', 'rain', 'rocks', 'temp', 'biomes', 'soils'].includes(this.layer)) this.rivers(a, px);
  }

  // rivers: a line from each river cell to the cell it drains into, wider for more water
  rivers(a, px) {
    const f = a.f, k2 = scaleOf(a) ** 2, u = this.unit(a) * 192 / Math.min(a.w, a.h);
    const classes = [[RIVERS.great * k2, 1.6 * u], [RIVERS.river * k2, 1 * u], [RIVERS.stream * k2, 0.55 * u]], paths = classes.map(() => []);
    for (let i = 0; i < a.n; i++) {
      const v = f.flow[i], d = f.down[i];
      if (v < classes[2][0] || d < 0 || f.lake[i] >= 0) continue;
      paths[classes.findIndex(([thr]) => v >= thr)].push(i);
    }
    px.strokeStyle = RIVER; px.lineCap = 'round';
    classes.forEach(([, lw], c) => {
      px.lineWidth = Math.max(this.minW, lw); px.beginPath();
      for (const i of paths[c]) { const d = f.down[i]; px.moveTo(i % a.w + 0.5, ((i / a.w) | 0) + 0.5); px.lineTo(d % a.w + 0.5, ((d / a.w) | 0) + 0.5); }
      px.stroke();
    });
  }

  // roads: a line between neighbouring road cells, wider the more worn
  drawRoads(a, px) {
    const r = a.f.road, w = a.w, k = this.unit(a), min = ROADS.levels[0].wear;
    px.lineCap = 'round';
    ROADS.levels.forEach((L, lvl) => {
      px.strokeStyle = lvl === 2 ? 'rgba(236,214,170,0.95)' : lvl === 1 ? 'rgba(206,176,128,0.9)' : 'rgba(170,140,100,0.75)';
      px.lineWidth = Math.max(this.minW, L.width * k); px.beginPath();
      for (let i = 0; i < a.n; i++) {
        if (r[i] < min || roadLevel(r[i]) !== lvl) continue;
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny >= a.h || r[ny * w + nx] < min) continue;
          px.moveTo(x + 0.5, y + 0.5); px.lineTo(nx + 0.5, ny + 0.5);
        }
      }
      px.stroke();
    });
  }

  // sea lanes: pale dashed lines over the water between harbours, wider the more sailed
  drawLanes(a, px) {
    const r = a.f.sea, w = a.w, k = this.unit(a), min = SEA.levels[0].wear;
    px.lineCap = 'butt'; px.setLineDash([2 * k, 2 * k]);
    SEA.levels.forEach((L, lvl) => {
      px.strokeStyle = lvl === 1 ? 'rgba(230,240,250,0.9)' : 'rgba(190,210,230,0.7)';
      px.lineWidth = Math.max(this.minW, L.width * k); px.beginPath();
      for (let i = 0; i < a.n; i++) {
        if (r[i] < min || seaLevelOf(r[i]) !== lvl) continue;
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny >= a.h || r[ny * w + nx] < min) continue;
          px.moveTo(x + 0.5, y + 0.5); px.lineTo(nx + 0.5, ny + 0.5);
        }
      }
      px.stroke();
    });
    px.setLineDash([]);
  }

  // towns: a square in the people's colour, bigger for bigger towns; the first towns of a people ringed
  drawTowns(a, px) {
    const k = this.unit(a);
    for (const t of a.towns) {
      if (!t.alive) continue;
      const c = (t.realm && realmOf(a, t.realm) || WORLD_PEOPLES.get(t.people)).color, s = (1.2 + 0.7 * t.tier) * k, x = t.x + 0.5, y = t.y + 0.5;
      px.fillStyle = `rgb(${c.join(',')})`; px.strokeStyle = 'rgba(12,12,10,0.9)'; px.lineWidth = Math.max(this.minW, 0.45 * k);
      px.fillRect(x - s, y - s, 2 * s, 2 * s); px.strokeRect(x - s, y - s, 2 * s, 2 * s);
      if (t.capital) { px.strokeStyle = `rgba(${c.join(',')},0.8)`; px.beginPath(); px.arc(x, y, s * 1.9, 0, Math.PI * 2); px.stroke(); }
    }
  }

  // the works of the towns (atlas/sites.js): a track from each to its town, and a mark by what it is —
  // a round field, a square mine or quarry, a tent-shaped lodge; a stump where one burnt
  drawSites(a, px) {
    const k = this.unit(a), s0 = Math.max(0.35, 0.5 * k), close = this.cam.zoom > 6;
    px.lineCap = 'round'; px.strokeStyle = 'rgba(200,180,140,0.7)'; px.lineWidth = Math.max(this.minW, 0.25 * k);
    px.beginPath();
    for (const s of a.sites) {
      if (!s.alive) continue;
      for (let q = 1; q < s.path.length; q++) { const u = s.path[q - 1], v = s.path[q]; px.moveTo(u % a.w + 0.5, ((u / a.w) | 0) + 0.5); px.lineTo(v % a.w + 0.5, ((s.path[q] / a.w) | 0) + 0.5); }
    }
    px.stroke();
    for (const s of a.sites) {
      if (s.died < 0) continue;
      const b = TOWN_BUILDINGS.get(s.kind), x = s.x + 0.5, y = s.y + 0.5, r = s0 * (b.notable ? 1.25 : 1);
      if (!s.alive) {   // a stump
        px.strokeStyle = 'rgba(40,30,24,0.7)'; px.lineWidth = Math.max(this.minW, 0.3 * k);
        px.beginPath(); px.moveTo(x - r * 0.6, y - r * 0.6); px.lineTo(x + r * 0.6, y + r * 0.6); px.moveTo(x + r * 0.6, y - r * 0.6); px.lineTo(x - r * 0.6, y + r * 0.6); px.stroke();
        continue;
      }
      const c = SITE_COLORS[b.cat] || [200, 200, 200];
      px.fillStyle = `rgb(${c.join(',')})`; px.strokeStyle = 'rgba(12,12,10,0.85)'; px.lineWidth = Math.max(this.minW, 0.2 * k);
      px.beginPath();
      if (b.cat === 'food' && b.id !== 'lodge') px.arc(x, y, r, 0, Math.PI * 2);
      else if (b.id === 'lodge') { px.moveTo(x, y - r); px.lineTo(x + r, y + r * 0.8); px.lineTo(x - r, y + r * 0.8); px.closePath(); }
      else px.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      px.fill(); px.stroke();
      // close up, the kind of work in a word under the mark
      if (close) { px.fillStyle = 'rgba(240,235,220,0.9)'; px.font = `${Math.max(0.25, 0.3 * k)}px "PT Sans", sans-serif`; px.textAlign = 'center'; px.fillText(b.name, x, y + r + 0.35 * k); }
    }
  }

  // the parties on the move (atlas/parties.js): a dot in the owner's colour with a tail behind it,
  // slid between where it stood at the last tick and where it stands now; the way ahead dotted
  drawParties(a, px) {
    const k = this.unit(a), r = Math.max(0.5, 0.8 * k), t = this.slide();
    for (const p of a.parties) {
      const x = p.px + (p.x - p.px) * t, y = p.py + (p.y - p.py) * t, c = p.color;
      if (p.path && p.k < p.path.length && p.speed !== 'flight') {
        px.strokeStyle = `rgba(${c.join(',')},0.4)`; px.lineWidth = Math.max(this.minW, 0.12 * k); px.setLineDash([0.4 * k, 0.5 * k]);
        px.beginPath(); px.moveTo(x, y);
        for (let q = p.k; q < p.path.length; q++) px.lineTo(p.path[q] % a.w + 0.5, ((p.path[q] / a.w) | 0) + 0.5);
        px.stroke(); px.setLineDash([]);
      }
      const dx = p.x - p.px, dy = p.y - p.py, d = Math.hypot(dx, dy) || 1;
      px.strokeStyle = `rgba(${c.join(',')},0.8)`; px.lineWidth = Math.max(this.minW, 0.25 * k);
      px.beginPath(); px.moveTo(x, y); px.lineTo(x - dx / d * r * 2.2, y - dy / d * r * 2.2); px.stroke();
      px.fillStyle = `rgb(${c.join(',')})`; px.strokeStyle = 'rgba(255,250,235,0.95)'; px.lineWidth = Math.max(this.minW, 0.22 * k);
      px.beginPath();
      if (p.kind === 'army') px.rect(x - r, y - r, 2 * r, 2 * r);
      else if (p.kind === 'dragon') { px.moveTo(x - 1.8 * r, y); px.lineTo(x, y - 0.9 * r); px.lineTo(x + 1.8 * r, y); px.lineTo(x, y + 0.5 * r); px.closePath(); }
      else px.arc(x, y, r * (p.kind === 'brood' ? 0.7 : 1), 0, Math.PI * 2);
      px.fill(); px.stroke();
    }
  }

  // how far between the last tick and the next the screen is, 0 … 1: the parties slide by it
  slide() {
    if (!this.tickAt || this.paused || !this.tickWait) return 1;
    return Math.min(1, (performance.now() - this.tickAt) / this.tickWait);
  }

  // between ticks the parties keep sliding: a frame loop while history runs and there is something to slide
  animate() {
    if (this.raf) return;
    const loop = () => {
      this.raf = 0;
      const a = this.atlas;
      if (!a || this.paused || atlasDone(a) || !a.parties?.length || !this.tickWait || this.tickWait < 50) return;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // the links of the supply net between towns: the thicker, the more flows down them
  drawLinks(a, px) {
    const k = this.unit(a);
    for (const l of a.net.links.values()) {
      if (!l.p.alive || !l.q.alive || l.c < 0.08) continue;
      px.strokeStyle = `rgba(255,225,160,${(0.12 + 0.5 * l.c).toFixed(2)})`; px.lineWidth = Math.max(this.minW, (0.15 + 0.5 * l.c) * k);
      px.beginPath(); px.moveTo(l.p.x + 0.5, l.p.y + 0.5); px.lineTo(l.q.x + 0.5, l.q.y + 0.5); px.stroke();
    }
  }

  // ruins of burnt towns: a dark cross in a ring of the people that lived there
  drawRuins(a, px) {
    const k = this.unit(a), r = 1.6 * k;
    for (const ru of a.ruins) {
      const c = WORLD_PEOPLES.get(ru.people).color, x = ru.x + 0.5, y = ru.y + 0.5;
      px.strokeStyle = `rgba(${c.join(',')},0.7)`; px.lineWidth = Math.max(this.minW, 0.4 * k);
      px.beginPath(); px.arc(x, y, r * 1.3, 0, Math.PI * 2); px.stroke();
      px.strokeStyle = 'rgba(20,14,12,0.95)'; px.lineWidth = Math.max(this.minW, 0.6 * k);
      px.beginPath(); px.moveTo(x - r, y - r); px.lineTo(x + r, y + r); px.moveTo(x + r, y - r); px.lineTo(x - r, y + r); px.stroke();
    }
  }

  // lairs: a diamond in the owner's colour and a faint ring of its territory; the dead ones as a cross
  drawLairs(a, px) {
    // the mark shrinks against the cells as the zoom grows; the territory ring is true to the cells
    const k = this.unit(a), sz = Math.max(1.6 / Math.pow(this.cam.zoom, 0.6), 2.2 * k), ring = Math.min(a.w, a.h) / 192;
    for (const l of a.lairs) {
      const L = LAIRS.get(l.kind), x = l.x + 0.5, y = l.y + 0.5;
      if (!l.alive) {
        px.strokeStyle = 'rgba(30,20,20,0.6)'; px.lineWidth = Math.max(this.minW, 0.5 * k);
        px.beginPath(); px.moveTo(x - sz * 0.6, y - sz * 0.6); px.lineTo(x + sz * 0.6, y + sz * 0.6); px.moveTo(x + sz * 0.6, y - sz * 0.6); px.lineTo(x - sz * 0.6, y + sz * 0.6); px.stroke();
        continue;
      }
      px.strokeStyle = `rgba(${L.color.join(',')},0.45)`; px.lineWidth = Math.max(this.minW, 0.4 * k);
      px.beginPath(); px.arc(x, y, L.radius * ring, 0, Math.PI * 2); px.stroke();
      px.fillStyle = `rgb(${L.color.join(',')})`; px.strokeStyle = 'rgba(10,10,10,0.85)'; px.lineWidth = Math.max(this.minW, 0.45 * k);
      const r = sz * (0.7 + 0.5 * l.strength);
      px.beginPath();
      // a beast's lair is a diamond, a tribe's camp a tent
      if (L.tribe) { px.moveTo(x, y - r * 1.1); px.lineTo(x + r, y + r * 0.7); px.lineTo(x - r, y + r * 0.7); }
      else if (L.undead) { const t = r * 0.35; px.moveTo(x - t, y - r); px.lineTo(x + t, y - r); px.lineTo(x + t, y - t); px.lineTo(x + r, y - t); px.lineTo(x + r, y + t); px.lineTo(x + t, y + t); px.lineTo(x + t, y + r); px.lineTo(x - t, y + r); px.lineTo(x - t, y + t); px.lineTo(x - r, y + t); px.lineTo(x - r, y - t); px.lineTo(x - t, y - t); }
      else { px.moveTo(x, y - r); px.lineTo(x + r, y); px.lineTo(x, y + r); px.lineTo(x - r, y); }
      px.closePath(); px.fill(); px.stroke();
    }
  }

  // wind arrows every few cells, drawn on the map canvas in cell units
  arrows(a, px) {
    const step = Math.max(6, Math.round(Math.min(a.w, a.h) / 24));
    px.strokeStyle = 'rgba(240,240,230,0.85)'; px.lineWidth = Math.max(this.minW, step / 14 / Math.pow(this.cam.zoom, 0.6));
    px.beginPath();
    for (let y = step >> 1; y < a.h; y += step) for (let x = step >> 1; x < a.w; x += step) {
      const i = y * a.w + x, u = a.f.windX[i], v = a.f.windY[i], sp = Math.hypot(u, v);
      if (sp < 0.05) continue;
      const L = step * 0.42 * Math.min(1, 0.4 + sp), dx = u / sp * L, dy = v / sp * L;
      const x0 = x + 0.5 - dx, y0 = y + 0.5 - dy, x1 = x + 0.5 + dx, y1 = y + 0.5 + dy;
      px.moveTo(x0, y0); px.lineTo(x1, y1);
      const hx = -dx * 0.45, hy = -dy * 0.45;
      px.moveTo(x1, y1); px.lineTo(x1 + hx - hy * 0.6, y1 + hy + hx * 0.6);
      px.moveTo(x1, y1); px.lineTo(x1 + hx + hy * 0.6, y1 + hy - hx * 0.6);
    }
    px.stroke();
  }

  renderSide() {
    const a = this.atlas, all = ATLAS_STAGES.all();
    $('atlasStages').innerHTML = all.map((s, k) => {
      const st = k < a.stage ? 'done' : k === a.stage ? 'now' : '';
      const ms = a.ms[s.id] != null ? `${a.ms[s.id]} мс` : k === a.stage ? '…' : '';
      return `<li class="${st}" title="${esc(s.note)}"><span>${esc(s.label)}</span><small>${ms}</small></li>`;
    }).join('') + (() => {
      // one row per era: from which year to which, done, running or waiting
      let from = 0, html = '';
      const step = a.hist ? a.hist.step : 0;
      for (const e of eraPlan(a)) {
        const to = from + e.seasons, st = !landDone(a) || step < from || (step === 0 && !a.hist) ? '' : step >= to ? 'done' : 'now';
        const yr = st === 'now' ? `год ${a.hist.year} из ${to / 4}` : `годы ${from / 4 + 1}–${to / 4}`;
        html += `<li class="${st}" title="${esc(ERAS.get(e.id).note)}"><span>${ERAS.get(e.id).label}</span><small>${yr}</small></li>`;
        from = to;
      }
      return html;
    })();
    // the chronicle only grows: new lines are appended, the old ones stay in the page
    const box = $('atlasChron'), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 12;
    if (this.chronOf !== a || !a.chronicle.length) {
      this.chronOf = a; this.chronShown = 0;
      box.innerHTML = a.chronicle.length ? '' : '<small class="muted">Летопись начнётся с первым этапом.</small>';
    }
    if (a.chronicle.length > this.chronShown) {
      box.insertAdjacentHTML('beforeend', a.chronicle.slice(this.chronShown).map(c => `<div><small>${c.season != null ? `год ${c.year}, ${seasonLabel(c.season)}` : ERA[c.era] || c.era}</small> ${esc(c.text)}</div>`).join(''));
      this.chronShown = a.chronicle.length;
    }
    if (atEnd) box.scrollTop = box.scrollHeight;
    $('atlasStats').innerHTML = `<dt>Клеток</dt><dd>${a.n.toLocaleString('ru-RU')}</dd><dt>Числовой сид</dt><dd>${seedNumber(a.cfg.seed)}</dd>` +
      `<dt>Этап</dt><dd>${Math.min(a.stage, all.length)} из ${all.length}</dd>` +
      (a.lairs ? `<dt>Логова чудовищ</dt><dd>${a.lairs.filter(l => l.alive).length}</dd>` : '') +
      (a.realms ? a.realms.map(r => { const m = a.towns.filter(t => t.alive && t.realm === r.id); return m.length ? `<dt>${realmLabel(a, r.id)}</dt><dd>${m.length} ${m.length === 1 ? 'город' : m.length < 5 ? 'города' : 'городов'}</dd>` : ''; }).join('') : '') +
      (a.ruins?.length ? `<dt>Пепелища</dt><dd>${a.ruins.length}</dd>` : '');
    // how the peoples that have met get on
    const rels = Object.entries(a.rel || {}).map(([key, r]) => {
      const [p, q] = key.split(':'), st = stateOf(a, p, q);
      return `<dt>${realmLabel(a, p)} и ${realmLabel(a, q)}</dt><dd class="rel-${st}" title="отношение ${r.att.toFixed(1)}, войн ${r.wars}, торговых путей ${r.routes}">${stateLabel(st)}</dd>`;
    }).join('');
    $('atlasRels').innerHTML = rels ? `<dt class="relhead">Державы между собой</dt><dd></dd>${rels}` : '';
  }

  hover(e) {
    const a = this.atlas; if (!a || !a.f.elev) return;
    const cv = $('atlasMap'), r = cv.getBoundingClientRect();
    if (!this.cam) return;
    const [fx, fy] = this.cam.toCell(e.clientX - r.left, e.clientY - r.top), x = Math.floor(fx), y = Math.floor(fy);
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) { $('atlasReadout').textContent = 'Наведите на карту, чтобы увидеть клетку.'; return; }
    const i = y * a.w + x, f = a.f, parts = [`${x}, ${y}`];
    if (f.plate) parts.push(`плита ${f.plate[i] + 1}, кора ${f.crust[i] > 0.5 ? 'материковая' : 'океаническая'}`);
    if (f.bnd && f.bnd[i]) parts.push(BOUNDARY_BY_CODE[f.bnd[i]].label);
    if (f.land) parts.push(f.lake && f.lake[i] >= 0 ? (a.lakes[f.lake[i]].salt ? 'солёное озеро' : 'озеро') : f.land[i] ? 'суша' : 'море');
    const rk = f.flow && f.lake[i] < 0 ? riverKind(a, i) : null;
    if (rk) parts.push({stream: 'ручей', river: 'река', great: 'большая река'}[rk]);
    if (f.alluvium && f.alluvium[i] > 0.3) parts.push('пойма');
    parts.push(f.ocean && f.ocean[i] ? 'дно' : f.temp ? `${Math.max(1, Math.round(heightKm(a, f.elev[i]) * 1000))} м` : `высота ${f.elev[i].toFixed(3)}`);
    if (f.temp) parts.push(`${f.temp[i].toFixed(1)}°` + (f.trange && f.land[i] ? ` (размах года ${Math.round(f.trange[i])}°)` : ''));
    if (f.windX) { const sp = Math.hypot(f.windX[i], f.windY[i]); if (sp > 0.08) parts.push(`ветер ${windWord(f.windX[i], f.windY[i])}`); }
    if (f.rain && f.land[i]) parts.push(`${Math.round(f.rain[i])} мм в год, ${RAIN_WORDS.find(([v]) => f.rain[i] < v)[1]}`);
    const bio = biomeAt(a, i);
    if (bio) {
      parts.push(bio.label + (f.trees && bio.trees > 0.2 ? ` (лес ${Math.round(f.trees[i] * 100)}%)` : ''));
      const sl = soilAt(a, i); if (sl) parts.push(`почва ${sl.label}, плодородие ${Math.round(f.fert[i] * 100)}%`);
      const sh = Object.entries(cellBiomes(a, i)).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([id, v]) => `${BIOMES.get(id).label} ${Math.round(v * 100)}%`);
      if (sh.length > 1) parts.push(`округа: ${sh.join(', ')}`);
    }
    const town = townAt(a, i);
    if (town) {
      const P = WORLD_PEOPLES.get(town.people);
      const fx = townFx(town), cnt = {};
      for (const id of town.built) cnt[id] = (cnt[id] || 0) + 1;
      const list = Object.entries(cnt).map(([id, n]) => TOWN_BUILDINGS.get(id).name + (n > 1 ? ` ×${n}` : '')).join(', ');
      const gives = Object.entries(EFFECTS).filter(([k]) => k !== 'housing' && fx[k] > 0).map(([k, l]) => `${l} +${Math.round(fx[k] * 100)}%`).join(', ');
      const folk = Object.entries(town.folk || {}).filter(([, v]) => v >= 0.03).map(([id, v]) => `${WORLD_PEOPLES.get(id).label} ${Math.round(v * 100)}%`).join(', ');
      const sup = town.supply, feed = sup ? (sup.got > 0.05 * town.pop ? `; привозят еды на ${Math.round(sup.got)}` : sup.gave > 0.05 * town.pop ? `; отправляют еды на ${Math.round(sup.gave)}` : '') : '';
      parts.push(`${townLabel(town)} ${town.name} (${town.realm ? realmLabel(a, town.realm) : P.label}), ${Math.round(town.pop)} жителей${folk ? `, среди них ${folk}` : ''}, дома на ${room(fx)}, основан в год ${town.founded}, угодья в ${siteRadius(a, town)} клетках; постройки: ${list || 'нет'}` + (gives ? `; даёт: ${gives}` : '') + feed);
    }
    const party = partyAt(a, i);
    if (party) {
      const tgt = party.target != null ? a.towns.find(t => t.id === party.target) : null, lair = party.owner != null && party.kind !== 'army' ? a.lairs.find(l => l.id === party.owner) : null;
      parts.push(`${party.kind === 'raid' ? 'набег' : party.kind === 'brood' ? 'выводок' : party.kind === 'army' ? 'войско' : 'дракон'}: ${party.label}${lair ? ` ${LAIRS.get(lair.kind).from} «${lair.name}»` : ''}${party.state === 'home' ? ', идут домой' : tgt ? ` на ${townLabel(tgt, 1)} ${tgt.name}` : ''}${party.might ? `, сила ${party.might.toFixed(1)}` : ''}, в пути ${party.days} дн.`);
    }
    const site = siteAt(a, i);
    if (site) { const b = TOWN_BUILDINGS.get(site.kind), t = a.towns.find(t => t.id === site.town); parts.push(`${b.name} (${CATEGORIES[b.cat]}) ${townLabel(t, 2)} ${t.name}, с года ${site.built}`); }
    const ruin = ruinAt(a, i);
    if (ruin) parts.push(`пепелище ${ruin.name} (${WORLD_PEOPLES.get(ruin.people).label}), сожжено в год ${ruin.year}`);
    if (f.barrows && f.barrows[i] > 0.15) parts.push('курганы былых битв');
    if (a.rot && !f.ocean[i] && a.rot[faunaCellOf(a, i)] > 0.08) parts.push(`гниль ${Math.round(a.rot[faunaCellOf(a, i)] * 100)}%`);
    const land = landOf(a, i);
    if (land) parts.push(`земли: ${land.people.label} ${Math.round(land.share * 100)}%`);
    if (a.f.road && a.f.road[i] >= ROADS.levels[0].wear) parts.push(ROADS.levels[roadLevel(a.f.road[i])].label);
    if (a.f.sea && a.f.sea[i] >= SEA.levels[0].wear) parts.push(SEA.levels[seaLevelOf(a.f.sea[i])].label);
    const lair = lairAt(a, i);
    if (lair) { const L = LAIRS.get(lair.kind); parts.push(`владения: ${L.label} «${lair.name}», сила ${Math.round(lair.strength * 100)}%${lair.ancient ? ', древнее' : ''}`); }
    if (a.fauna && !f.ocean[i]) {
      const word = v => (v >= 0.8 ? 'много' : v >= 0.45 ? 'есть' : 'мало');
      const beasts = a.fauna.list.filter(s => s.role !== 'spirit').map(s => [s, faunaAt(a, i, s.id)]).filter(([, v]) => v > 0.15).sort((p, q) => q[1] - p[1]).slice(0, 4);
      if (beasts.length) parts.push('звери: ' + beasts.map(([s, v]) => `${s.sp.plural} ${word(v)}`).join(', '));
    }
    const geo = cellGeology(a, i);
    if (geo.rock) parts.push(geo.rock.label);
    if (geo.rock && f.land[i]) {
      const ores = ORE_GENESIS.all().filter(o => o.region !== 'goldVein' && o.region !== 'magma' && geo.ores[o.region] > 0).map(o => `${o.label} ${LEVEL_WORDS[geo.ores[o.region]]}`);
      if (geo.flags.goldVein) ores.push('золотая жила');
      if (geo.placer > 0) ores.push(`золотой песок ${LEVEL_WORDS[geo.placer]}`);
      if (geo.flags.magma) ores.push('магма');
      if (ores.length) parts.push(ores.join(', '));
    }
    $('atlasReadout').textContent = parts.join(' · ');
  }
}
