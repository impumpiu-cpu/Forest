// Start menu: world settings with a live terrain preview (same generator as the game). The land comes
// from the polygon (seed, sliders, climate, threats) or from a cell of the world map picked on the
// «Мир» screen (cfg.cell, seam/cell.js): then the world decides the land, the climate and who raids.
import {SIZES, CLIMATES, START, LEVELS3, STOCKS, RAIDS, WILDLIFE, PREDATORS, MONSTERS, DEFAULT_CFG} from '../data/presets.js';
import {RAID_BANDS} from '../data/raids.js';
import {cellSummary} from './cellText.js';
import {makeTerrain} from '../world/generate.js';
import {seedNumber} from '../core/rng.js';
import {BY_CODE, T, isWater} from '../data/terrain.js';
import {$} from './dom.js';
import {esc} from '../core/util.js';

const OPTS = {
  size: Object.entries(SIZES).map(([k, v]) => [k, v.label]),
  water: LEVELS3.map((l, i) => [i, l]), forest: LEVELS3.map((l, i) => [i, l]), rock: LEVELS3.map((l, i) => [i, l]),
  climate: Object.entries(CLIMATES).map(([k, v]) => [k, v.label]),
  start: Object.entries(START).map(([k, v]) => [k, v.label]),
  stock: Object.entries(STOCKS).map(([k, v]) => [k, v.label]),
  raids: Object.entries(RAIDS).map(([k, v]) => [k, v.label]),
  wildlife: Object.entries(WILDLIFE).map(([k, v]) => [k, v.label]),
  predators: Object.entries(PREDATORS).map(([k, v]) => [k, v.label]),
  monsters: Object.entries(MONSTERS).map(([k, v]) => [k, v.label]),
  source: [['poly', 'Полигон'], ['world', 'Клетка мира']],
};
const NOTES = {size: v => SIZES[v].note, climate: v => CLIMATES[v].note,
  source: v => (v === 'world' ? 'Земля, климат, соседи и набеги — из сохранённого мира.' : 'Испытательная площадка: всё задаётся здесь.')};
const STORE = 'forest.cfg';

export class Menu {
  constructor({onStart, onResume, onPickCell}) {
    this.cfg = this.load();
    this.onStart = onStart; this.onResume = onResume; this.onPickCell = onPickCell;
    this.build();
  }

  load() {
    try { const raw = localStorage.getItem(STORE); if (raw) return {...DEFAULT_CFG, source: 'poly', cell: null, ...JSON.parse(raw)}; } catch (e) { /* storage unavailable */ }
    return {...DEFAULT_CFG, source: 'poly', cell: null};
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.cfg)); } catch (e) { /* storage unavailable */ } }

  build() {
    document.querySelectorAll('#menu .seg[data-key]').forEach(box => {
      const key = box.dataset.key;
      box.innerHTML = OPTS[key].map(([v, l]) => `<button type="button" data-val="${v}" aria-pressed="false">${l}</button>`).join('');
      box.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        this.cfg[key] = typeof DEFAULT_CFG[key] === 'number' ? +b.dataset.val : b.dataset.val;
        if (key === 'source' && b.dataset.val === 'world' && !this.cfg.cell) { this.save(); this.sync(); this.onPickCell(); return; }
        this.save(); this.sync();
      });
    });
    $('cfgName').addEventListener('input', e => { this.cfg.name = e.target.value.trim() || DEFAULT_CFG.name; this.save(); });
    $('cfgSeed').addEventListener('input', e => { this.cfg.seed = e.target.value.trim() || '1'; this.save(); this.schedulePreview(); });
    $('seedRandom').addEventListener('click', () => { this.cfg.seed = String(100000 + Math.floor(Math.random() * 899999)); this.save(); this.sync(); });
    $('cfgColonists').addEventListener('input', e => { this.cfg.colonists = +e.target.value; $('colonistsOut').textContent = this.cfg.colonists; this.save(); });
    $('cfgLightning').addEventListener('change', e => { this.cfg.lightning = e.target.checked; this.save(); });
    $('cfgSpirits').addEventListener('change', e => { this.cfg.spirits = e.target.checked; this.save(); });
    // the bands that may raid the polygon: all pressed by default; a press toggles one
    const bands = $('cfgBands');
    bands.innerHTML = RAID_BANDS.all().map(b => `<button type="button" data-band="${b.id}" aria-pressed="true">${b.label}</button>`).join('');
    bands.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const all = RAID_BANDS.all().map(x => x.id), on = new Set(this.cfg.bands || all);
      if (on.has(b.dataset.band)) on.delete(b.dataset.band); else on.add(b.dataset.band);
      this.cfg.bands = on.size === all.length ? null : all.filter(id => on.has(id));
      this.save(); this.sync();
    });
    $('cellPick').addEventListener('click', () => this.onPickCell());
    $('resetCfg').addEventListener('click', () => { this.cfg = {...DEFAULT_CFG, source: this.cfg.source, cell: this.cfg.cell}; this.save(); this.sync(); });
    $('startGame').addEventListener('click', () => { this.save(); this.onStart(this.gameCfg()); });
    $('backToGame').addEventListener('click', () => this.onResume());
  }

  // a cell of the world map chosen on the «Мир» screen
  useCell(plan) { this.cfg.cell = plan; this.cfg.source = 'world'; this.save(); }

  // the settings a game starts with: on a world cell its seed and plan, on the polygon none of them
  gameCfg() {
    const {source, cell, ...c} = this.cfg;
    return source === 'world' && cell ? {...c, seed: cell.seed, cell} : c;
  }

  sync() {
    const c = this.cfg, world = c.source === 'world';
    document.querySelectorAll('#menu [data-only]').forEach(el => { el.hidden = el.dataset.only !== (world ? 'world' : 'poly'); });
    $('cellInfo').innerHTML = c.cell ? cellSummary(c.cell) : '<dt>Клетка</dt><dd>не выбрана: откройте мир на экране «Мир» и щёлкните по суше</dd>';
    $('startGame').disabled = world && !c.cell;
    $('cfgSpirits').checked = c.spirits !== false;
    const onBands = new Set(c.bands || RAID_BANDS.all().map(b => b.id));
    $('cfgBands').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(onBands.has(b.dataset.band))));
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
    const cfg = this.gameCfg();
    if (this.cfg.source === 'world' && !this.cfg.cell) { $('previewStats').innerHTML = '<dt>Клетка</dt><dd>не выбрана</dd>'; return; }
    const t = makeTerrain(cfg), pc = $('preview'), px = pc.getContext('2d');
    pc.width = t.w; pc.height = t.h;
    const img = px.createImageData(t.w, t.h), d = img.data, n = t.w * t.h, cnt = [];
    for (let i = 0; i < n; i++) {
      const code = t.terr[i]; cnt[code] = (cnt[code] || 0) + 1;
      let [r, g, b] = BY_CODE[code].color(t.hgt[i], t.fert[i], 0.8);
      if (code === T.WATER) { const x = i % t.w, y = (i / t.w) | 0, land = k => !isWater(t.terr[k]); if ((x > 0 && land(i - 1)) || (x < t.w - 1 && land(i + 1)) || (y > 0 && land(i - t.w)) || (y < t.h - 1 && land(i + t.w))) { r = r * 0.6 + 70; g = g * 0.6 + 80; b = b * 0.6 + 70; } }
      const o = i * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    px.putImageData(img, 0, 0);
    px.strokeStyle = '#ffffff'; px.lineWidth = Math.max(1, t.w / 128);
    px.beginPath(); px.arc(t.cx + 0.5, t.cy + 0.5, 4.5, 0, Math.PI * 2); px.stroke();
    const pct = code => ((cnt[code] || 0) / n * 100).toFixed(0) + '%';
    $('previewStats').innerHTML = `<dt>Клеток</dt><dd>${n.toLocaleString('ru-RU')}</dd>` +
      BY_CODE.map(d => d.code).filter(c => cnt[c] > 0).map(c => `<dt>${esc(BY_CODE[c].label[0].toUpperCase() + BY_CODE[c].label.slice(1))}</dt><dd>${pct(c)}</dd>`).join('') +
      `<dt>Земля</dt><dd>${t.site.region.label}</dd>` +
      `<dt>Числовой сид</dt><dd>${seedNumber(cfg.seed)}</dd>`;
  }
}
