// The «Мир» screen: the world-map polygon. Settings on the left, the map in the middle, the
// chronicle on the right. Stages run one per frame, so the map is drawn and the chronicle written
// as the world is made. (Later this moves to a Web Worker — docs/WORLD.md.)
import {ATLAS_SIZES, ATLAS_LAND, DEFAULT_ATLAS_CFG} from '../data/atlas.js';
import {ATLAS_STAGES} from '../atlas/stages.js';
import {newAtlas, runNextStage, atlasDone} from '../atlas/generate.js';
import {seedNumber} from '../core/rng.js';
import {esc} from '../core/util.js';
import {$} from './dom.js';

const STORE = 'forest.atlas';
const ERA = {geology: 'Геология'};
const OPTS = {
  size: Object.entries(ATLAS_SIZES).map(([k, v]) => [k, v.label]),
  land: ATLAS_LAND.map((l, i) => [i, l.label]),
  layer: [['relief', 'Рельеф'], ['temp', 'Температура']],
};

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

export class AtlasView {
  constructor({onBack}) {
    this.cfg = this.load(); this.atlas = null; this.layer = 'relief'; this.timer = 0;
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
        if (key === 'layer') { this.layer = b.dataset.val; this.sync(); this.draw(); return; }
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
    const val = {size: this.cfg.size, land: this.cfg.land, layer: this.layer};
    document.querySelectorAll('#atlas .seg[data-akey]').forEach(box => {
      box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === String(val[box.dataset.akey]))));
    });
    $('atlasSizeNote').textContent = ATLAS_SIZES[this.cfg.size].note;
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
    const {elev, temp, land} = a.f;
    if (!elev) return [12, 15, 10];
    if (this.layer === 'temp' && temp) return ramp(HEAT, (temp[i] + 30) / 65);
    if (!land) return ramp(LAND, elev[i]);
    return land[i] ? ramp(LAND, (elev[i] - a.sea) / (1 - a.sea)) : ramp(DEEP, elev[i] / (a.sea || 1));
  }

  draw() {
    const a = this.atlas; if (!a) return;
    const px = $('atlasMap').getContext('2d'), img = px.createImageData(a.w, a.h), d = img.data;
    for (let i = 0; i < a.n; i++) { const c = this.color(a, i), o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
    px.putImageData(img, 0, 0);
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
    if (f.land) parts.push(f.land[i] ? 'суша' : 'море');
    parts.push(`высота ${f.elev[i].toFixed(3)}`);
    if (f.temp) parts.push(`${f.temp[i].toFixed(1)}°`);
    $('atlasReadout').textContent = parts.join(' · ');
  }
}
