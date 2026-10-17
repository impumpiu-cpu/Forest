// The «Мир» screen: the world-map polygon. Settings on the left, the map in the middle, the
// chronicle on the right. Stages run one per frame, so the map is drawn and the chronicle written
// as the world is made. (Later this moves to a Web Worker — docs/WORLD.md.)
import {ATLAS_SIZES, ATLAS_LAND, DEFAULT_ATLAS_CFG} from '../data/atlas.js';
import {ATLAS_STAGES} from '../atlas/stages.js';
import {cellGeology} from '../atlas/geology.js';
import {PLATE_COUNTS, HEMISPHERES, BOUNDARIES, BOUNDARY_BY_CODE, ROCKS, ROCK_BY_CODE, ROCK_KINDS, ORE_GENESIS} from '../data/geology.js';
import {LEVEL_WORDS} from '../data/regions.js';
import {RAIN_WORDS} from '../data/climate.js';
import {newAtlas, runNextStage, atlasDone} from '../atlas/generate.js';
import {seedNumber} from '../core/rng.js';
import {esc} from '../core/util.js';
import {$} from './dom.js';

const STORE = 'forest.atlas';
const ERA = {geology: 'Геология'};
const OPTS = {
  size: Object.entries(ATLAS_SIZES).map(([k, v]) => [k, v.label]),
  land: ATLAS_LAND.map((l, i) => [i, l.label]),
  plates: PLATE_COUNTS.map((p, i) => [i, p.label]),
  hemisphere: Object.entries(HEMISPHERES).map(([k, v]) => [k, v.label]),
  layer: [['relief', 'Рельеф'], ['plates', 'Плиты'], ['rocks', 'Породы'], ['ores', 'Руды'], ['temp', 'Температура'], ['wind', 'Ветры'], ['rain', 'Осадки']],
  ore: ORE_GENESIS.all().map(o => [o.id, o.label]),
};
const VIEW_KEYS = new Set(['layer', 'ore']);

const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t));
  for (let k = 1; k < stops.length; k++) if (t <= stops[k][0]) {
    const [t0, c0] = stops[k - 1], [t1, c1] = stops[k];
    return mix(c0, c1, (t - t0) / (t1 - t0 || 1));
  }
  return stops[stops.length - 1][1];
}
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
    this.cfg = this.load(); this.atlas = null; this.layer = 'relief'; this.ore = 'iron'; this.timer = 0;
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
    $('atlasBack').addEventListener('click', () => { clearTimeout(this.timer); this.onBack(); });
    const cv = $('atlasMap');
    cv.addEventListener('pointermove', e => this.hover(e));
    cv.addEventListener('pointerleave', () => { $('atlasReadout').textContent = 'Наведите на карту, чтобы увидеть клетку.'; });
  }

  show() { this.sync(); if (!this.atlas) this.generate(); }

  sync() {
    $('atlasSeed').value = this.cfg.seed;
    const val = {...this.cfg, layer: this.layer, ore: this.ore};
    document.querySelectorAll('#atlas .seg[data-akey]').forEach(box => {
      box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === String(val[box.dataset.akey]))));
    });
    $('atlasSizeNote').textContent = ATLAS_SIZES[this.cfg.size].note;
    $('atlasHemiNote').textContent = HEMISPHERES[this.cfg.hemisphere].note;
    $('atlasOre').hidden = this.layer !== 'ores';
    this.legend();
  }

  legend() {
    const sw = (c, l) => `<span><i style="background:rgb(${c.join(',')})"></i>${esc(l)}</span>`;
    let html = '';
    if (this.layer === 'plates') html = sw([200, 190, 150], 'материковая кора') + sw([50, 62, 96], 'океаническая кора') + BOUNDARIES.all().map(b => sw(b.color, b.label)).join('') + sw([255, 60, 30], 'живой вулкан');
    else if (this.layer === 'rocks') html = Object.entries(ROCK_KINDS).map(([k, l]) => `<b>${l}:</b> ` + ROCKS.filter(r => r.kind === k).map(r => sw(r.color, r.label)).join('')).join('');
    else if (this.layer === 'ores') { const o = ORE_GENESIS.get(this.ore); html = sw([70, 72, 66], 'нет') + sw(mix([70, 72, 66], o.color, 0.45), 'бедно') + sw(mix([70, 72, 66], o.color, 0.75), 'есть') + sw(o.color, 'богато'); }
    else if (this.layer === 'rain') html = [[100, 'пустыня'], [400, 'сухо'], [800, 'умеренно'], [1500, 'влажно'], [2500, 'очень влажно']].map(([v, l]) => sw(rainColor(v), `${l} (${v} мм)`)).join('');
    else if (this.layer === 'wind') html = sw([240, 240, 230], 'стрелки — куда дует ветер') + sw([90, 110, 150], 'тише') + sw([200, 210, 240], 'сильнее');
    else if (this.layer === 'temp') html = sw(HEAT[0][1], '−30°') + sw(HEAT[1][1], '−4°') + sw(HEAT[2][1], '+9°') + sw(HEAT[3][1], '+35°');
    else html = sw(DEEP[0][1], 'глубокое море') + sw(DEEP[1][1], 'мелководье') + sw(LAND[0][1], 'низины') + sw(LAND[2][1], 'нагорья') + sw(LAND[4][1], 'вершины');
    $('atlasLegend').innerHTML = html;
  }

  generate() {
    clearTimeout(this.timer);
    const a = this.atlas = newAtlas(this.cfg);
    const cv = $('atlasMap'); cv.width = a.w; cv.height = a.h;
    cv.getContext('2d').clearRect(0, 0, a.w, a.h);
    this.renderSide();
    const next = () => {
      if (a !== this.atlas) return;
      runNextStage(a); this.draw(); this.renderSide();
      if (!atlasDone(a)) this.timer = setTimeout(next, 30);
    };
    this.timer = setTimeout(next, 30);
  }

  // the colour of one cell on the chosen layer; a field that is not made yet shows as the dark sea
  color(a, i) {
    const f = a.f;
    if (!f.elev) {
      if (f.plate && this.layer === 'plates') return this.plateColor(a, i);
      return [12, 15, 10];
    }
    const base = f.land ? (f.land[i] ? ramp(LAND, (f.elev[i] - a.sea) / (1 - a.sea)) : ramp(DEEP, f.elev[i] / (a.sea || 1))) : ramp(LAND, f.elev[i]);
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
    }).join('');
    $('atlasChron').innerHTML = a.chronicle.length
      ? a.chronicle.map(c => `<div><small>${ERA[c.era] || c.era}</small> ${esc(c.text)}</div>`).join('')
      : '<small class="muted">Летопись начнётся с первым этапом.</small>';
    $('atlasStats').innerHTML = `<dt>Клеток</dt><dd>${a.n.toLocaleString('ru-RU')}</dd><dt>Числовой сид</dt><dd>${seedNumber(a.cfg.seed)}</dd>` +
      `<dt>Этап</dt><dd>${Math.min(a.stage, all.length)} из ${all.length}</dd>`;
  }

  hover(e) {
    const a = this.atlas; if (!a || !a.f.elev) return;
    const cv = $('atlasMap'), r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * a.w), y = Math.floor((e.clientY - r.top) / r.height * a.h);
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) return;
    const i = y * a.w + x, f = a.f, parts = [`${x}, ${y}`];
    if (f.plate) parts.push(`плита ${f.plate[i] + 1}, кора ${f.crust[i] > 0.5 ? 'материковая' : 'океаническая'}`);
    if (f.bnd && f.bnd[i]) parts.push(BOUNDARY_BY_CODE[f.bnd[i]].label);
    if (f.land) parts.push(f.land[i] ? 'суша' : 'море');
    parts.push(`высота ${f.elev[i].toFixed(3)}`);
    if (f.temp) parts.push(`${f.temp[i].toFixed(1)}°` + (f.trange && f.land[i] ? ` (размах года ${Math.round(f.trange[i])}°)` : ''));
    if (f.windX) { const sp = Math.hypot(f.windX[i], f.windY[i]); if (sp > 0.08) parts.push(`ветер ${windWord(f.windX[i], f.windY[i])}`); }
    if (f.rain && f.land[i]) parts.push(`${Math.round(f.rain[i])} мм в год, ${RAIN_WORDS.find(([v]) => f.rain[i] < v)[1]}`);
    const geo = cellGeology(a, i);
    if (geo.rock) parts.push(geo.rock.label);
    if (geo.rock && f.land[i]) {
      const ores = ORE_GENESIS.all().filter(o => o.region !== 'goldVein' && o.region !== 'magma' && geo.ores[o.region] > 0).map(o => `${o.label} ${LEVEL_WORDS[geo.ores[o.region]]}`);
      if (geo.flags.goldVein) ores.push('золотая жила');
      if (geo.flags.magma) ores.push('магма');
      if (ores.length) parts.push(ores.join(', '));
    }
    $('atlasReadout').textContent = parts.join(' · ');
  }
}
