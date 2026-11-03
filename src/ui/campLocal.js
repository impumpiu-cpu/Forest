// The «Кампания» screen's local camp player (ui/campaignView.js CampaignView): a fight or a stop the core played on the
// local map (campaign/camp.js) is played again over the world map from its setup when the playback reaches its day;
// the card of what is clicked on it. Out of ui/campaignView.js, a mixin over the screen's base (MapView).
import {esc} from '../core/util.js';
import {$} from './dom.js';
import {openTab} from './tabs.js';
import {personHtml, creatureHtml, buildingHtml, cellHtml} from './cards.js';
import {openCamp, stepCamp, campDone} from '../campaign/camp.js';
import {CAMP_KINDS} from '../data/labels.js';

// the camps watched on the local map by the pace (core/clock.js PACE): at the observer's pace the day stops too, at
// `max` none (a camp runs at `local` × the base pace: an hour in 2,5 s when watching)
export const WATCH = {watch: {stops: true}, x4: {}, x16: {}};

export const campLocal = Base => class extends Base {
  // ── a camp on the local map: played again from its setup over the world map, then the season goes on
  startLocal(c) {
    let w;
    try { w = openCamp(c.setup); } catch (e) { console.warn('стоянка не открылась', e); return; }
    this.clock.hold(c.at);   // the season waits while the camp is watched, at the camp's own day
    this.ticks.last = 0; this.ticks.acc = 0; this.ticks.paused = false; this.ticks.pace = this.localPace(this.clock.pace, c);
    this.local = {w, c, view: {cam: {zoom: 1.6, cx: w.camp.x + 0.5, cy: w.camp.y + 0.5}, layer: 'world', resHidden: new Set(), selected: null, selBld: null, selCell: null}, done: 0};
    $('campLocal').hidden = false; $('campLocalBar').hidden = false;
    this.localR.setup(w);
    this.localText(); this.renderStock();
  }
  // the local map's pace: the clock's — but a named fight shown at «Сразу» is played at ×4, to be seen
  localPace(id, c = this.local?.c) { return !WATCH[id] && c?.boss ? 'x4' : id; }
  localText() {
    const L = this.local, c = L.c, w = L.w, last = w.logLines[0];
    $('campLocalText').innerHTML = `<b>${CAMP_KINDS[c.kind] || CAMP_KINDS.stop}</b>${c.kind !== 'stop' ? ` — ${esc(c.label)}` : ''}, день похода ${c.day + 1}${last ? ` · <small>${esc(last.when.replace(/^День \d+, /, ''))} ${last.html.replace(/<[^>]+>/g, '')}</small>` : ''}`;
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
    L.frames = (L.frames || 0) + 1;
    if (L.view.selected && L.frames % 15 === 0) this.localCard();   // the creature's card follows it
    if (L.frames % 15 === 0 && !$('campStock').closest('[data-pane]').hidden) this.renderStock();   // the dock's «Склад», while it is open
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
    this.renderStock();
    // the season's playback goes on from where it stopped
    this.clock.release(); this.syncRun();
    this.animate();
  }
};
