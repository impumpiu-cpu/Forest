// The «Кампания» screen's local camp player (ui/campaignView.js CampaignView): a fight or a stop the core played on the
// local map (campaign/camp.js) is played again over the world map from its setup when the playback reaches its day;
// the card of what is clicked on it. Out of ui/campaignView.js, a mixin over the screen's base (MapView).
import {esc} from '../core/util.js';
import {$} from './dom.js';
import {openTab} from './tabs.js';
import {personHtml, creatureHtml, buildingHtml, cellHtml} from './cards.js';
import {openCamp, stepCamp, campDone} from '../view/campaign.js';
import {workText} from '../view/campaign.js';
import {CAMP_KINDS} from '../data/labels.js';
import {CAMP} from '../data/camp.js';
import {nightness} from '../core/time.js';
import {mindAt, mindCard} from '../render/minds.js';

// the camps watched on the local map by the pace (core/clock.js PACE): at the observer's pace the day stops too, at
// `max` none (a camp runs at `local` × the base pace: an hour in 2,5 s when watching)
export const WATCH = {day: {stops: true}, watch: {stops: true}, x4: {}, x16: {}};

export const campLocal = Base => class extends Base {
  // ── a camp on the local map: played again from its setup over the world map, then the season goes on
  startLocal(c) {
    let w;
    try { w = openCamp(c.setup); } catch (e) { console.warn('стоянка не открылась', e); return; }
    this.clock.hold(c.at);   // the season waits while the camp is watched, at the camp's own day
    this.ticks.last = 0; this.ticks.acc = 0; this.ticks.paused = false; this.ticks.pace = this.localPace(this.clock.pace, c);
    this.local = {w, c, view: {cam: {zoom: 2, cx: w.camp.x + 0.5, cy: w.camp.y + 0.5}, layer: 'world', resHidden: new Set(), selected: null, selBld: null, selCell: null}, done: 0};
    $('campLocal').hidden = false; $('campLocalBar').hidden = false;
    this.localR.setup(w);
    this.localText(); this.renderStock(); this.renderSide();   // the roster and the chronicle at the camp's day
  }
  // the camp's map has its own camera (the local view's {zoom, cx, cy}, render/renderer.js): while a camp is shown the
  // zoom buttons and keys work on it (MapView.zoomCentre, zoomFit), the wheel zooms at the cursor, dragging pans
  zoomCentre(f) { const L = this.local; if (!L) return super.zoomCentre(f); const [cw, ch] = this.localR.size(); this.localR.zoomAt(L.w, L.view.cam, f, cw / 2, ch / 2); }
  zoomFit() { const L = this.local; if (!L) return super.zoomFit(); L.view.cam.zoom = 1; L.view.cam.cx = L.w.w / 2; L.view.cam.cy = L.w.h / 2; }
  wireLocalCamera() {
    const cv = $('campLocal'), at = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('wheel', e => { const L = this.local; if (!L) return; e.preventDefault(); const [px, py] = at(e); this.localR.zoomAt(L.w, L.view.cam, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), px, py); }, {passive: false});
    let g = null;
    cv.addEventListener('pointerdown', e => { if (!this.local) return; g = {id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: e.button !== 0}; this.localDragged = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      const L = this.local; if (!L || !g || g.id !== e.pointerId) return;
      if (!g.drag && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 4) g.drag = true;
      if (g.drag) { this.localR.pan(L.w, L.view.cam, e.clientX - g.lx, e.clientY - g.ly); this.localDragged = true; }
      g.lx = e.clientX; g.ly = e.clientY;
    });
    const up = () => { g = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }
  // the local map's pace: the clock's — but a named fight shown at «Сразу» is played at ×4, to be seen
  localPace(id, c = this.local?.c) { return !WATCH[id] && c?.boss ? 'x4' : id; }
  localText() {
    const L = this.local, c = L.c, w = L.w, last = w.logLines[0];
    $('campLocalText').innerHTML = `<b>${CAMP_KINDS[c.kind] || CAMP_KINDS.stop}</b>${c.kind !== 'stop' ? ` — ${esc(c.label)}` : ''}, день похода ${c.day + 1}${L.wind ? ' · <span class="muted">ночь идёт ⏩</span>' : ''}${last ? ` · <small>${esc(last.when.replace(/^День \d+, /, ''))} ${last.html.replace(/<[^>]+>/g, '')}</small>` : ''}`;
  }
  // the night winds on by itself (CAMP.clock.wind × the pace) while no foe is on the map, the camp is set up and it is dark:
  // the camp's sun is slow (core/time.js dayScale), and a quiet night is not worth the watching
  winding(w) {
    const C = w.campaign;
    if (C.S.kind === 'stop' || campDone(w)) return false;
    if (C.foeObjs.some(o => !o.dead && !o.gone && !o.captive && o.task?.id !== 'leave')) return false;
    if ((w.works || []).some(x => !x.done) || nightness(w) < CAMP.clock.dark) return false;
    return true;
  }
  stepLocal() {
    const L = this.local, w = L.w, wind = this.winding(w), per = this.ticks.ticks(performance.now(), 40, wind ? CAMP.clock.wind : 1);
    if (wind !== L.wind) { L.wind = wind; this.localText(); }
    if (!this.ticks.paused) {
      if (!campDone(w)) { for (let k = 0; k < per && !campDone(w); k++) stepCamp(w); }
      else if (!L.done) L.done = performance.now();
      else if (performance.now() - L.done > 1500) { this.endLocal(); return; }
    }
    this.localR.draw(w, L.view);
    if (w.logVersion !== L.logV) { L.logV = w.logVersion; this.localText(); }
    L.frames = (L.frames || 0) + 1;
    if ((L.view.selected || L.view.mind) && L.frames % 15 === 0) this.localCard();   // the creature's card follows it
    if (L.frames % 15 === 0 && !$('campStock').closest('[data-pane]').hidden) this.renderStock();   // the dock's «Склад», while it is open
  }
  // the camp's map: what is under the click, shown in the dock («Объект») and followed while the camp runs
  pickLocal(e) {
    const L = this.local; if (!L) return;
    const r = $('campLocal').getBoundingClientRect(), [fx, fy] = this.localR.toCell(e.clientX - r.left, e.clientY - r.top), w = L.w;
    // an icon of the overmind (render/minds.js) first: its boxes are in CSS pixels from the map's corner
    const R = this.localR, hit = mindAt(R.mindHits || [], e.clientX - r.left - R.ox, e.clientY - r.top - R.oy);
    if (hit) {
      L.view.selected = null; L.view.selBld = null; L.view.selCell = null; L.view.mind = hit;
      $('campInspect').innerHTML = `<div class="pc">${mindCard(w, hit)}</div>`;
      if (this.ids?.dock) openTab($(this.ids.dock), 'object');
      return;
    }
    L.view.mind = null;
    let best = null, bd = 0.9;
    for (const a of w.agents) { if (a.dead) continue; const d = Math.hypot(a.x - fx, a.y - fy); if (d < bd) { bd = d; best = a; } }
    const i = (fy | 0) * w.w + (fx | 0);
    L.view.selected = best; L.view.selBld = null; L.view.selCell = null;
    if (!best) { const b = w.buildings.find(b => b.cells?.includes(i)); if (b) L.view.selBld = b.id; else if (i >= 0 && i < w.w * w.h) L.view.selCell = i; }
    // one of the company picked on the map is picked in the roster too (and the other way: pickMember) — one choice, two views
    if (best?.member != null && this.who !== best.member) { this.who = best.member; this.renderSide(); }
    this.localCard(true);
    if (this.ids?.dock) openTab($(this.ids.dock), 'object');
  }
  // the roster's pick on a camp being watched: the member's pawn is the map's pick (the ring, the card)
  pickMember(id) {
    const L = this.local; if (!L) return;
    const ag = id == null ? null : [...L.w.agents].find(a => !a.dead && a.member === id);
    L.view.selected = ag || null; L.view.selBld = null; L.view.selCell = null; L.view.mind = null;
    if (ag) this.localCard(true);
  }
  localCard(force = false) {
    const L = this.local, w = L?.w, box = $('campInspect');
    if (!L) return;
    const a = L.view.selected;
    if (a && (a.dead || !w.agents.includes(a))) { L.view.selected = null; box.innerHTML = '<p class="muted">Его больше нет на карте.</p>'; return; }
    if (L.view.mind) { box.innerHTML = `<div class="pc">${mindCard(w, L.view.mind)}</div>`; return; }   // a flag changes by the tick: followed
    if (!force && !a) return;   // a building or a cell does not change by the tick
    if (a) box.innerHTML = `<div class="pc">${a.diary && a.likes ? personHtml(w, a) : creatureHtml(w, a)}</div>`;
    else if (L.view.selBld != null) { const b = w.buildings.find(b => b.id === L.view.selBld); box.innerHTML = b ? `<div class="pc">${buildingHtml(w, b)}</div>` : ''; }
    else if (L.view.selCell != null) {
      const x = (w.works || []).find(x => x.cells.includes(L.view.selCell));   // a thing of the camp set up on this cell (campaign/works.js)
      box.innerHTML = `<div class="pc">${x ? `<p><b>Стоянка.</b> ${esc(workText(w, x))}</p>` : ''}${cellHtml(w, L.view.selCell)}</div>`;
    }
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
