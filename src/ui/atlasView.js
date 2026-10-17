// The «Мир» screen: the world-map polygon. Settings on the left, the map in the middle, the
// chronicle on the right. Stages run one per frame, so the map is drawn and the chronicle written
// as the world is made. (Later this moves to a Web Worker — docs/WORLD.md.)
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
import {WORLD_PEOPLES, ELDER_YEARS, TIERS} from '../data/peoples.js';
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

const STORE = 'forest.atlas';
const ERA = {geology: 'Геология', climate: 'Климат', water: 'Вода', life: 'Жизнь'};
const OPTS = {
  size: Object.entries(ATLAS_SIZES).map(([k, v]) => [k, v.label]),
  land: ATLAS_LAND.map((l, i) => [i, l.label]),
  plates: PLATE_COUNTS.map((p, i) => [i, p.label]),
  hemisphere: Object.entries(HEMISPHERES).map(([k, v]) => [k, v.label]),
  wild: WILD_YEARS.map((e, i) => [i, e.label]),
  elder: ELDER_YEARS.map((e, i) => [i, e.label]),
  fauna: SPECIES.filter(sp => sp.habitat).map(sp => [sp.id, sp.plural]),
  layer: [['relief', 'Рельеф'], ['plates', 'Плиты'], ['rocks', 'Породы'], ['ores', 'Руды'], ['temp', 'Температура'], ['wind', 'Ветры'], ['rain', 'Осадки'], ['biomes', 'Биомы'], ['soils', 'Почвы'], ['fauna', 'Звери'], ['peoples', 'Народы']],
  ore: ORE_GENESIS.all().map(o => [o.id, o.label]),
};
const VIEW_KEYS = new Set(['layer', 'ore', 'fauna']);

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
    $('atlasBack').addEventListener('click', () => { clearTimeout(this.timer); this.onBack(); });
    const cv = $('atlasMap');
    cv.addEventListener('pointermove', e => this.hover(e));
    cv.addEventListener('pointerleave', () => { $('atlasReadout').textContent = 'Наведите на карту, чтобы увидеть клетку.'; });
  }

  show() { this.sync(); if (!this.atlas) this.generate(); }

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
    else if (this.layer === 'fauna') html = sw([70, 70, 64], 'не их края') + sw([120, 116, 100], 'могут жить, но нет') + sw(SPECIES.get(this.fauna).look?.color ? hexRgb(SPECIES.get(this.fauna).look.color) : [220, 120, 60], 'столько, сколько край прокормит') + '<b>логова:</b> ' + LAIRS.all().map(L => sw(L.color, L.label)).join('') + sw([60, 40, 40], '× опустевшее');
    else if (this.layer === 'peoples') html = WORLD_PEOPLES.all().map(P => sw(P.color, `земли: ${P.label}`)).join('') + '<b>города</b> — квадраты, крупнее с ростом; кольцо — первые города народа; ' + ROADS.levels.map(L => L.label).join(', ');
    else if (this.layer === 'rain') html = [[100, 'пустыня'], [400, 'сухо'], [800, 'умеренно'], [1500, 'влажно'], [2500, 'очень влажно']].map(([v, l]) => sw(rainColor(v), `${l} (${v} мм)`)).join('');
    else if (this.layer === 'wind') html = sw([240, 240, 230], 'стрелки — куда дует ветер') + sw([90, 110, 150], 'тише') + sw([200, 210, 240], 'сильнее');
    else if (this.layer === 'temp') html = sw(HEAT[0][1], '−30°') + sw(HEAT[1][1], '−4°') + sw(HEAT[2][1], '+9°') + sw(HEAT[3][1], '+35°');
    else html = sw(FRESH, 'пресное озеро') + sw(SALT, 'солёное озеро') + `<span><i style="background:${RIVER};height:3px"></i>реки</span>` + sw(DEEP[0][1], 'глубокое море') + sw(DEEP[1][1], 'мелководье') + sw(LAND[0][1], 'низины') + sw(LAND[2][1], 'нагорья') + sw(LAND[4][1], 'вершины');
    $('atlasLegend').innerHTML = html;
  }

  generate() {
    clearTimeout(this.timer);
    const a = this.atlas = newAtlas(this.cfg);
    const cv = $('atlasMap'); cv.width = a.w; cv.height = a.h;
    cv.getContext('2d').clearRect(0, 0, a.w, a.h);
    this.paused = false; this.syncPause();
    this.renderSide();
    this.run();
  }

  // the land a stage a frame, then history a year (four seasons) a frame; pausing stops between frames
  run() {
    const a = this.atlas;
    clearTimeout(this.timer);
    const next = () => {
      if (a !== this.atlas || this.paused) return;
      const steps = landDone(a) ? 4 : 1;
      for (let k = 0; k < steps && !atlasDone(a); k++) runNextStage(a);
      this.draw(); this.renderSide();
      if (!atlasDone(a)) this.timer = setTimeout(next, 30); else this.syncPause();
    };
    this.timer = setTimeout(next, 30);
  }

  syncPause() {
    const b = $('atlasPause'), a = this.atlas, busy = a && landDone(a) && !atlasDone(a);
    b.hidden = !busy && !this.paused;
    b.textContent = this.paused ? 'Дальше' : 'Пауза';
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
        return mix(mix(base, [40, 40, 36], 0.6), col, Math.min(1, v) * 0.9);
      }
      case 'peoples': {
        const g = mix(base, [40, 40, 36], 0.55), land = a.peoples && landOf(a, i);
        return land ? mix(g, land.people.color, 0.25 + 0.6 * land.share) : g;
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

  draw() {
    const a = this.atlas; if (!a) return;
    const px = $('atlasMap').getContext('2d'), img = px.createImageData(a.w, a.h), d = img.data;
    for (let i = 0; i < a.n; i++) {
      const c = this.color(a, i), s = this.shade(a, i), o = i * 4;
      d[o] = c[0] * s; d[o + 1] = c[1] * s; d[o + 2] = c[2] * s; d[o + 3] = 255;
    }
    px.putImageData(img, 0, 0);
    if (this.layer === 'wind' && a.f.windX) this.arrows(a, px);
    if (a.f.road && ['relief', 'biomes', 'peoples', 'fauna'].includes(this.layer)) this.drawRoads(a, px);
    if (a.lairs && ['relief', 'biomes', 'fauna', 'peoples'].includes(this.layer)) this.drawLairs(a, px);
    if (a.towns && ['relief', 'biomes', 'peoples', 'fauna', 'rain', 'soils'].includes(this.layer)) this.drawTowns(a, px);
    if (a.f.flow && ['relief', 'rain', 'rocks', 'temp', 'biomes', 'soils'].includes(this.layer)) this.rivers(a, px);
  }

  // rivers: a line from each river cell to the cell it drains into, wider for more water
  rivers(a, px) {
    const f = a.f, k2 = scaleOf(a) ** 2;
    const classes = [[RIVERS.great * k2, 1.6], [RIVERS.river * k2, 1], [RIVERS.stream * k2, 0.55]], paths = classes.map(() => []);
    for (let i = 0; i < a.n; i++) {
      const v = f.flow[i], d = f.down[i];
      if (v < classes[2][0] || d < 0 || f.lake[i] >= 0) continue;
      paths[classes.findIndex(([thr]) => v >= thr)].push(i);
    }
    px.strokeStyle = RIVER; px.lineCap = 'round';
    classes.forEach(([, lw], c) => {
      px.lineWidth = lw; px.beginPath();
      for (const i of paths[c]) { const d = f.down[i]; px.moveTo(i % a.w + 0.5, ((i / a.w) | 0) + 0.5); px.lineTo(d % a.w + 0.5, ((d / a.w) | 0) + 0.5); }
      px.stroke();
    });
  }

  // roads: a line between neighbouring road cells, wider the more worn
  drawRoads(a, px) {
    const r = a.f.road, w = a.w, k = Math.min(a.w, a.h) / 192, min = ROADS.levels[0].wear;
    px.lineCap = 'round';
    ROADS.levels.forEach((L, lvl) => {
      px.strokeStyle = lvl === 2 ? 'rgba(236,214,170,0.95)' : lvl === 1 ? 'rgba(206,176,128,0.9)' : 'rgba(170,140,100,0.75)';
      px.lineWidth = Math.max(0.35, L.width * k); px.beginPath();
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

  // towns: a square in the people's colour, bigger for bigger towns; the first towns of a people ringed
  drawTowns(a, px) {
    const k = Math.min(a.w, a.h) / 192;
    for (const t of a.towns) {
      if (!t.alive) continue;
      const c = WORLD_PEOPLES.get(t.people).color, s = (1.2 + 0.7 * t.tier) * k, x = t.x + 0.5, y = t.y + 0.5;
      px.fillStyle = `rgb(${c.join(',')})`; px.strokeStyle = 'rgba(12,12,10,0.9)'; px.lineWidth = Math.max(0.4, 0.45 * k);
      px.fillRect(x - s, y - s, 2 * s, 2 * s); px.strokeRect(x - s, y - s, 2 * s, 2 * s);
      if (t.capital) { px.strokeStyle = `rgba(${c.join(',')},0.8)`; px.beginPath(); px.arc(x, y, s * 1.9, 0, Math.PI * 2); px.stroke(); }
    }
  }

  // lairs: a diamond in the owner's colour and a faint ring of its territory; the dead ones as a cross
  drawLairs(a, px) {
    const k = Math.min(a.w, a.h) / 192, sz = Math.max(1.6, 2.2 * k);
    for (const l of a.lairs) {
      const L = LAIRS.get(l.kind), x = l.x + 0.5, y = l.y + 0.5;
      if (!l.alive) {
        px.strokeStyle = 'rgba(30,20,20,0.6)'; px.lineWidth = Math.max(0.5, 0.5 * k);
        px.beginPath(); px.moveTo(x - sz * 0.6, y - sz * 0.6); px.lineTo(x + sz * 0.6, y + sz * 0.6); px.moveTo(x + sz * 0.6, y - sz * 0.6); px.lineTo(x - sz * 0.6, y + sz * 0.6); px.stroke();
        continue;
      }
      px.strokeStyle = `rgba(${L.color.join(',')},0.45)`; px.lineWidth = Math.max(0.4, 0.4 * k);
      px.beginPath(); px.arc(x, y, L.radius * k, 0, Math.PI * 2); px.stroke();
      px.fillStyle = `rgb(${L.color.join(',')})`; px.strokeStyle = 'rgba(10,10,10,0.85)'; px.lineWidth = Math.max(0.5, 0.45 * k);
      const r = sz * (0.7 + 0.5 * l.strength);
      px.beginPath(); px.moveTo(x, y - r); px.lineTo(x + r, y); px.lineTo(x, y + r); px.lineTo(x - r, y); px.closePath(); px.fill(); px.stroke();
    }
  }

  // wind arrows every few cells, drawn on the map canvas in cell units
  arrows(a, px) {
    const step = Math.max(6, Math.round(Math.min(a.w, a.h) / 24));
    px.strokeStyle = 'rgba(240,240,230,0.85)'; px.lineWidth = Math.max(0.6, step / 14);
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
    const box = $('atlasChron'), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 12;
    box.innerHTML = a.chronicle.length
      ? a.chronicle.map(c => `<div><small>${c.season != null ? `год ${c.year}, ${seasonLabel(c.season)}` : ERA[c.era] || c.era}</small> ${esc(c.text)}</div>`).join('')
      : '<small class="muted">Летопись начнётся с первым этапом.</small>';
    if (atEnd) box.scrollTop = box.scrollHeight;
    $('atlasStats').innerHTML = `<dt>Клеток</dt><dd>${a.n.toLocaleString('ru-RU')}</dd><dt>Числовой сид</dt><dd>${seedNumber(a.cfg.seed)}</dd>` +
      `<dt>Этап</dt><dd>${Math.min(a.stage, all.length)} из ${all.length}</dd>` +
      (a.lairs ? `<dt>Логова чудовищ</dt><dd>${a.lairs.filter(l => l.alive).length}</dd>` : '') +
      (a.towns ? WORLD_PEOPLES.all().map(P => { const m = a.towns.filter(t => t.alive && t.people === P.id); return `<dt>Города: ${P.label}</dt><dd>${m.length}</dd>`; }).join('') : '');
  }

  hover(e) {
    const a = this.atlas; if (!a || !a.f.elev) return;
    const cv = $('atlasMap'), r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * a.w), y = Math.floor((e.clientY - r.top) / r.height * a.h);
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) return;
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
      parts.push(`${townLabel(town)} ${town.name} (${P.label}), ${Math.round(town.pop)} жителей, дома на ${room(fx)}, основан в год ${town.founded}; постройки: ${list || 'нет'}` + (gives ? `; даёт: ${gives}` : ''));
    }
    const land = landOf(a, i);
    if (land) parts.push(`земли: ${land.people.label} ${Math.round(land.share * 100)}%`);
    if (a.f.road && a.f.road[i] >= ROADS.levels[0].wear) parts.push(ROADS.levels[roadLevel(a.f.road[i])].label);
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
