// Start menu: world settings with a live terrain preview (same generator as the game).
import {SIZES, CLIMATES, LEVELS3, STOCKS, RAIDS, WILDLIFE, DEFAULT_CFG} from '../data/presets.js';
import {makeTerrain} from '../world/generate.js';
import {seedNumber} from '../core/rng.js';
import {BY_CODE, T} from '../data/terrain.js';
import {$} from './dom.js';

const OPTS = {
  size: Object.entries(SIZES).map(([k, v]) => [k, v.label]),
  water: LEVELS3.map((l, i) => [i, l]), forest: LEVELS3.map((l, i) => [i, l]), rock: LEVELS3.map((l, i) => [i, l]),
  climate: Object.entries(CLIMATES).map(([k, v]) => [k, v.label]),
  stock: Object.entries(STOCKS).map(([k, v]) => [k, v.label]),
  raids: Object.entries(RAIDS).map(([k, v]) => [k, v.label]),
  wildlife: Object.entries(WILDLIFE).map(([k, v]) => [k, v.label]),
};
const NOTES = {size: v => SIZES[v].note, climate: v => CLIMATES[v].note};
const STORE = 'forest.cfg';

export class Menu {
  constructor({onStart, onResume}) {
    this.cfg = this.load();
    this.onStart = onStart; this.onResume = onResume;
    this.build();
  }

  load() {
    try { const raw = localStorage.getItem(STORE); if (raw) return {...DEFAULT_CFG, ...JSON.parse(raw)}; } catch (e) { /* storage unavailable */ }
    return {...DEFAULT_CFG};
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.cfg)); } catch (e) { /* storage unavailable */ } }

  build() {
    document.querySelectorAll('#menu .seg[data-key]').forEach(box => {
      const key = box.dataset.key;
      box.innerHTML = OPTS[key].map(([v, l]) => `<button type="button" data-val="${v}" aria-pressed="false">${l}</button>`).join('');
      box.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        this.cfg[key] = typeof DEFAULT_CFG[key] === 'number' ? +b.dataset.val : b.dataset.val;
        this.save(); this.sync();
      });
    });
    $('cfgName').addEventListener('input', e => { this.cfg.name = e.target.value.trim() || DEFAULT_CFG.name; this.save(); });
    $('cfgSeed').addEventListener('input', e => { this.cfg.seed = e.target.value.trim() || '1'; this.save(); this.schedulePreview(); });
    $('seedRandom').addEventListener('click', () => { this.cfg.seed = String(100000 + Math.floor(Math.random() * 899999)); this.save(); this.sync(); });
    $('cfgColonists').addEventListener('input', e => { this.cfg.colonists = +e.target.value; $('colonistsOut').textContent = this.cfg.colonists; this.save(); });
    $('cfgLightning').addEventListener('change', e => { this.cfg.lightning = e.target.checked; this.save(); });
    $('resetCfg').addEventListener('click', () => { this.cfg = {...DEFAULT_CFG}; this.save(); this.sync(); });
    $('startGame').addEventListener('click', () => { this.save(); this.onStart({...this.cfg}); });
    $('backToGame').addEventListener('click', () => this.onResume());
  }

  sync() {
    const c = this.cfg;
    $('cfgName').value = c.name; $('cfgSeed').value = c.seed;
    $('cfgColonists').value = c.colonists; $('colonistsOut').textContent = c.colonists;
    $('cfgLightning').checked = !!c.lightning;
    document.querySelectorAll('#menu .seg[data-key]').forEach(box => {
      const key = box.dataset.key;
      box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === String(c[key]))));
    });
    for (const [key, fn] of Object.entries(NOTES)) { const el = document.querySelector(`[data-note="${key}"]`); if (el) el.textContent = fn(c[key]); }
    this.schedulePreview();
  }

  schedulePreview() { clearTimeout(this.timer); this.timer = setTimeout(() => this.preview(), 60); }

  preview() {
    const t = makeTerrain(this.cfg), pc = $('preview'), px = pc.getContext('2d');
    pc.width = t.w; pc.height = t.h;
    const img = px.createImageData(t.w, t.h), d = img.data, n = t.w * t.h, cnt = [];
    for (let i = 0; i < n; i++) {
      const code = t.terr[i]; cnt[code] = (cnt[code] || 0) + 1;
      const [r, g, b] = BY_CODE[code].color(t.hgt[i], t.fert[i], 0.8);
      const o = i * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    px.putImageData(img, 0, 0);
    px.strokeStyle = '#ffffff'; px.lineWidth = Math.max(1, t.w / 128);
    px.beginPath(); px.arc(t.cx + 0.5, t.cy + 0.5, 4.5, 0, Math.PI * 2); px.stroke();
    const pct = code => ((cnt[code] || 0) / n * 100).toFixed(0) + '%';
    $('previewStats').innerHTML = `<dt>Клеток</dt><dd>${n.toLocaleString('ru-RU')}</dd>` +
      [T.WATER, T.FOREST, T.GRASS, T.ROCK].map(c => `<dt>${BY_CODE[c].label[0].toUpperCase() + BY_CODE[c].label.slice(1)}</dt><dd>${pct(c)}</dd>`).join('') +
      `<dt>Числовой сид</dt><dd>${seedNumber(this.cfg.seed)}</dd>`;
  }
}
