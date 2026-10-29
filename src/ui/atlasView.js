// The «Мир» screen: the world-map polygon. Settings on the left, the map in the middle, the
// chronicle on the right. The land runs a stage a frame; history runs a season a step at the observer's pace
// (core/clock.js), so the map is drawn and the chronicle written as the world is made. The map has
// a camera (render/camera.js): the wheel zooms at the cursor, dragging pans, as on the local map.
// The cells are painted once per change into an off-screen bitmap and drawn scaled; everything on
// top (rivers, roads, towns, lairs) is drawn in cell units over it. (Later the generation moves to
// a Web Worker — docs/WORLD.md.)
import {ATLAS_SIZES, ATLAS_LAND} from '../data/atlas.js';
import {DEEDS, deedLabel} from '../data/deeds.js';
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
import {townAt, landOf, townLabel} from '../atlas/peoples.js';
import {roadLevel} from '../atlas/roads.js';
import {seaLevelOf} from '../atlas/sea.js';
import {SEA} from '../data/roads.js';
import {WORLD_PEOPLES, ELDER_YEARS, YOUNG_YEARS} from '../data/peoples.js';
import {ruinAt} from '../atlas/diplomacy.js';
import {realmOf, realmLabel, realmLand} from '../atlas/realms.js';
import {captiveCount} from '../atlas/lairs.js';
import {ROADS} from '../data/roads.js';
import {faunaAt} from '../atlas/fauna.js';
import {lairAt} from '../atlas/lairs.js';
import {towers, seatMap} from '../atlas/necro.js';
import {LAIRS} from '../data/lairs.js';
import {REALM_STATS, RUINS, OFFICES} from '../data/kingdom.js';
import {WILD_YEARS} from '../data/history.js';
import {SPECIES} from '../data/species.js';
import {TOWN_BUILDINGS, EFFECTS} from '../data/townBuildings.js';
import {townFx, room, realmMetalWords} from '../atlas/towns.js';
import {esc} from '../core/util.js';
import {offerText, latinTitle} from './store.js';
import {worldChronicleText, calamityChronicleText} from '../atlas/chronicle.js';
import {$} from './dom.js';
import {SeasonClock} from '../core/clock.js';
import {siteAt, siteRadius} from '../atlas/sites.js';
import {partyAt} from '../atlas/parties.js';
import {pickObject, inspectHtml, whereIs} from './inspect.js';
import {openTab} from './tabs.js';
import {CATEGORIES} from '../data/townBuildings.js';

const OPTS = {
  size: Object.entries(ATLAS_SIZES).map(([k, v]) => [k, v.label]),
  land: ATLAS_LAND.map((l, i) => [i, l.label]),
  plates: PLATE_COUNTS.map((p, i) => [i, p.label]),
  hemisphere: Object.entries(HEMISPHERES).map(([k, v]) => [k, v.label]),
  wild: WILD_YEARS.map((e, i) => [i, e.label]),
  elder: ELDER_YEARS.map((e, i) => [i, e.label]),
  young: YOUNG_YEARS.map((e, i) => [i, e.label]),
  // the beasts with a habitat, and the tribes of the lairs (their fields: atlas/lairs.js lairFolk)
  fauna: [...SPECIES.filter(sp => sp.habitat), ...[...new Set(LAIRS.filter(L => L.tribe).map(L => L.species))].map(id => SPECIES.get(id))].map(sp => [sp.id, sp.plural]),
  layer: [['relief', 'Рельеф'], ['plates', 'Плиты'], ['rocks', 'Породы'], ['ores', 'Руды'], ['temp', 'Температура'], ['wind', 'Ветры'], ['rain', 'Осадки'], ['biomes', 'Биомы'], ['soils', 'Почвы'], ['fauna', 'Звери'], ['wild', 'Живность'], ['rot', 'Гниль'], ['peoples', 'Народы'], ['realms', 'Державы']],
  ore: ORE_GENESIS.all().map(o => [o.id, o.label]),
};
// the layer «Живность»: each lair's owner in the colour of its first lair kind (data/lairs.js); a land that holds next to
// none of a kind does not show it bright for the few that wandered in
const WILD_COLORS = {}; for (const L of LAIRS.all()) if (L.species && !L.undead && !L.fiend && !WILD_COLORS[L.species]) WILD_COLORS[L.species] = L.color;
const WILD_K = 0.05;
const VIEW_KEYS = new Set(['layer', 'ore', 'fauna']);
// the pace of history: seasons a frame and the wait between frames; «сразу» runs as many seasons as
// fit in a frame's budget. ×1 is a season a frame — 100 years in about 40 s, slow enough to read
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
// the layer «Гниль» (atlas/lairs.js stepRot): the rot of the dead from faint to thick; the steps at which the dead rise
// (data/lairs.js: a vampire in a mixed town, ghouls by the ruins, wights on the barrows, a necromancer's tower)
const ROT_RAMP = [[0, [64, 62, 58]], [0.12, [96, 74, 104]], [0.25, [130, 72, 150]], [0.5, [176, 70, 186]], [1, [236, 120, 230]]];
const ROT_FROM = 0.03;   // below this the land is clean
const HEAT = [[0, [70, 110, 200]], [0.4, [190, 220, 230]], [0.6, [236, 214, 120]], [1, [200, 70, 50]]];
// yearly rain, mm: desert sand → steppe → green → deep wet blue-green
const WET = [[0, [214, 184, 120]], [250, [196, 186, 110]], [600, [120, 160, 80]], [1200, [50, 130, 90]], [2500, [30, 90, 120]]];
const rainColor = mm => ramp(WET.map(([v, c]) => [v / 2500, c]), mm / 2500);
const COMPASS = ['восточный', 'юго-восточный', 'южный', 'юго-западный', 'западный', 'северо-западный', 'северный', 'северо-восточный'];
// where the wind blows from, in words (the map's y grows downwards: north is up)
const windWord = (x, y) => COMPASS[(Math.round(Math.atan2(-y, -x) / (Math.PI / 4)) + 8) % 8];

// the chronicle's detail, remembered in this browser (shared by the «Мир» and «Кампания» screens)
export function loadDetail() { try { return localStorage.getItem('forest.chronDetail') || 'normal'; } catch (e) { return 'normal'; } }
export function saveDetail(v) { try { localStorage.setItem('forest.chronDetail', v); } catch (e) { /* storage unavailable */ } }
// a row of buttons for a choice; `on(value)` when one is pressed
export function segOf(box, items, cur, on) {
  box.innerHTML = items.map(d => `<button type="button" data-val="${d.id}" aria-pressed="${d.id === cur}">${d.label}</button>`).join('');
  box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); on(b.dataset.val); });
}
// the world's chronicle into a text file: by its eras at `what` detail ('major' | 'normal' | 'all'), or 'calamity'
export function exportChronicle(a, name, what) {
  const title = name || `Мир ${a.cfg.seed}`;
  const text = what === 'calamity' ? calamityChronicleText(a, {name: title}) : worldChronicleText(a, {detail: what, name: title});
  return offerText(latinTitle(`${what === 'calamity' ? 'kataklizmy' : 'letopis-mira'}-${title}`), text);
}

// The map on a screen: the cells of a world painted by layer, the camera over them, what is drawn on top (rivers,
// roads, towns, lairs, parties), the readout of a cell under the cursor. No controls of its own: the polygon «Мир»
// (AtlasView below, the base of the campaign screen), the campaign (ui/campaignView.js), «Создать землю» and «Заселение мира» (src/app/,
// forest.html) are each this map with their own. `ids` (wireCamera) names the page's elements: map, readout, zoom
// buttons, the screen, the legend — so nothing here reaches for an element of one page only.
export class MapView {
  constructor(opts = {}) {
    this.atlas = null; this.layer = 'relief'; this.ore = 'iron'; this.fauna = 'wolf';
    this.cam = null; this.bitmap = null; this.bitmapKey = ''; this.grab = null;
    // the observer's clock (core/clock.js): a season a step at the pace chosen; the screens give it their step
    this.clock = new SeasonClock({step: () => this.stepSeason(), after: () => this.afterSeason(), done: () => this.afterRun()});
    this.worldId = null; this.worldName = '';   // the library record this world is saved as, if any
    this.pick = -1;   // the cell picked (the polygon: for a settlement, seam/cell.js), -1 — none
    this.sel = null; this.selCell = '';   // the object selected for the inspector (ui/inspect.js)
    this.setup(opts);
    this.build();
  }
  setup() {}
  build() {}
  // ── the inspector (ui/inspect.js): a click selects a party, a town, a lair or the cell; its card is in `ids.inspect`
  cellAt(e) {
    const a = this.atlas; if (!a || !this.cam) return -1;
    const cv = $(this.ids.map), r = cv.getBoundingClientRect(), [fx, fy] = this.cam.toCell(e.clientX - r.left, e.clientY - r.top);
    const x = Math.floor(fx), y = Math.floor(fy);
    return x < 0 || y < 0 || x >= a.w || y >= a.h ? -1 : y * a.w + x;
  }
  selectAt(e) {
    const i = this.cellAt(e); if (i < 0) return;
    this.select(pickObject(this.atlas, i), this.cellText(i));
  }
  select(sel, cellText = '') {
    this.sel = sel; this.selCell = cellText;
    this.renderInspect(); this.draw();
    if (sel && this.ids?.dock) openTab($(this.ids.dock), 'object');   // the dock shows the card
  }
  renderInspect() {
    const box = this.ids?.inspect ? $(this.ids.inspect) : null; if (!box) return;
    box.innerHTML = this.atlas ? inspectHtml(this.atlas, this.sel, this.selCell) : '';
  }
  // the selection on the map: a ring that follows a party
  drawSelection(a, px) {
    const at = whereIs(a, this.sel, this.slide()); if (!at) return;
    px.beginPath(); px.arc(at[0], at[1], 1.6, 0, Math.PI * 2);
    px.lineWidth = Math.max(this.minW * 2, 0.25); px.strokeStyle = '#fff'; px.stroke();
    px.lineWidth = Math.max(this.minW, 0.12); px.strokeStyle = '#000'; px.stroke();
  }

  // the clock's step, what follows it and what follows the run — the screens' own
  stepSeason() { return false; }
  afterSeason() { this.draw(); this.animate(); }
  afterRun() {}
  get paused() { return this.clock.paused; }
  // the readout of the cell under the cursor at most once a frame (a hover looks up a good deal)
  hoverSoon(e) {
    this.hoverEv = {clientX: e.clientX, clientY: e.clientY};
    if (this.hoverRaf) return;
    this.hoverRaf = requestAnimationFrame(() => { this.hoverRaf = 0; if (this.hoverEv) this.hover(this.hoverEv); });
  }
  clickAt() {}
  overlay() {}

  // the camera over the map: the wheel zooms at the cursor, dragging pans, the buttons and keys zoom;
  // a press that does not drag is a click (clickAt). Shared with the campaign screen (ui/campaignView.js).
  wireCamera(ids) {
    this.ids = ids;
    const cv = $(ids.map);

    const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      if (!this.cam) return;
      // a tool that paints with the left button (app/landView.js: the brush) takes the press instead of the camera
      if (e.button === 0 && this.paintStart?.(e)) { cv.setPointerCapture(e.pointerId); this.painting = e.pointerId; return; }
      this.grab = {id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: e.button !== 0};
      cv.setPointerCapture(e.pointerId);
      if (e.button !== 0) e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      if (this.painting === e.pointerId) { this.paintMove(e); this.hoverSoon(e); return; }
      const g = this.grab;
      if (g && g.id === e.pointerId) {
        if (!g.drag && Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_PX) { g.drag = true; this.dragged?.(); }
        if (g.drag) { const [cw, ch] = this.box(); this.cam.pan(cw, ch, e.clientX - g.lx, e.clientY - g.ly); cv.classList.add('dragging'); this.draw(); }
        g.lx = e.clientX; g.ly = e.clientY;
      }
      this.hoverSoon(e);
    });
    const release = () => { this.grab = null; cv.classList.remove('dragging'); };
    cv.addEventListener('pointerup', e => { if (this.painting === e.pointerId) { this.painting = null; this.paintEnd(e); return; } const g = this.grab; if (g && g.id === e.pointerId && !g.drag && e.button === 0) this.clickAt(e); release(); });
    cv.addEventListener('pointercancel', e => { if (this.painting === e.pointerId) { this.painting = null; this.paintEnd(e); } release(); });
    cv.addEventListener('pointerleave', () => { $(ids.readout).textContent = ids.hint; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      if (!this.cam) return;
      e.preventDefault();
      const [px, py] = local(e), [cw, ch] = this.box();
      this.cam.zoomAt(cw, ch, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), px, py); this.draw();
    }, {passive: false});
    $(ids.zoomIn).addEventListener('click', () => this.zoomCentre(1.6));
    $(ids.zoomOut).addEventListener('click', () => this.zoomCentre(1 / 1.6));
    $(ids.zoomFit).addEventListener('click', () => { if (this.cam) { this.cam.reset(); this.draw(); } });
    document.addEventListener('keydown', e => {
      if ($(ids.screen).hidden || e.target !== document.body || e.ctrlKey || e.metaKey) return;
      if (e.key === '+' || e.key === '=') this.zoomCentre(1.6);
      else if (e.key === '-' || e.key === '_') this.zoomCentre(1 / 1.6);
      else if (e.key === '0' || e.key === 'Home') { if (this.cam) { this.cam.reset(); this.draw(); } }
    });
  }

  // the size of the map's box in CSS pixels (the canvas is kept at the box's size, at device resolution)
  box() { const cv = $(this.ids.map); return [cv.clientWidth || 1, cv.clientHeight || 1]; }

  zoomCentre(f) { if (!this.cam) return; const [cw, ch] = this.box(); this.cam.zoomAt(cw, ch, f, cw / 2, ch / 2); this.draw(); }

  legend() {
    const sw = (c, l) => `<span><i style="background:rgb(${c.join(',')})"></i>${esc(l)}</span>`;
    let html = '';
    if (this.layer === 'plates') html = sw([200, 190, 150], 'материковая кора') + sw([50, 62, 96], 'океаническая кора') + BOUNDARIES.all().map(b => sw(b.color, b.label)).join('') + sw([255, 60, 30], 'живой вулкан');
    else if (this.layer === 'rocks') html = Object.entries(ROCK_KINDS).map(([k, l]) => `<b>${esc(l)}:</b> ` + ROCKS.filter(r => r.kind === k).map(r => sw(r.color, r.label)).join('')).join('');
    else if (this.layer === 'ores') { const o = ORE_GENESIS.get(this.ore); html = sw([70, 72, 66], 'нет') + sw(mix([70, 72, 66], o.color, 0.45), 'бедно') + sw(mix([70, 72, 66], o.color, 0.75), 'есть') + sw(o.color, 'богато'); }
    else if (this.layer === 'biomes') html = Object.entries(BIOME_KINDS).filter(([k]) => k !== 'feature').map(([k, l]) => `<b>${esc(l)}:</b> ` + BIOMES.filter(b => b.kind === k).map(b => sw(b.color, b.label)).join('')).join('') + '<b>леса</b> темнее, гари светлее';
    else if (this.layer === 'soils') html = SOILS.filter(s => s.id !== 'none').map(s => sw(s.color, s.label)).join('') + '<b>ярче</b> — плодороднее';
    else if (this.layer === 'fauna') html = sw([70, 70, 64], 'не их края') + sw([120, 116, 100], 'могут жить, но нет') + sw(SPECIES.get(this.fauna).look?.color ? hexRgb(SPECIES.get(this.fauna).look.color) : [220, 120, 60], 'столько, сколько край прокормит') + '<b>логова</b> (ромб): ' + LAIRS.filter(L => !L.tribe && !L.undead).map(L => sw(L.color, L.label)).join('') + '<b>станы племён</b> (шатёр): ' + LAIRS.filter(L => L.tribe).map(L => sw(L.color, L.label)).join('') + '<b>мёртвые</b> (крест): ' + LAIRS.filter(L => L.undead).map(L => sw(L.color, L.label)).join('') + sw([60, 40, 40], '× опустевшее') + '<span>пунктирный ромб — скрытое логово глуши</span>' + sw([110, 60, 130], 'гниль');
    else if (this.layer === 'peoples') html = WORLD_PEOPLES.all().map(P => sw(P.color, `земли: ${P.label}`)).join('') + '<b>города</b> — квадраты в цвете державы (оттенок цвета народа), крупнее с ростом; кольцо — столица державы; ' + ROADS.levels.map(L => L.label).join(', ') + '; пунктир по воде — морские пути гаваней; × в кольце — сожжённый город; ' + sw([120, 90, 90], 'курганы былых битв') + '<b>угодья городов</b>: ' + sw(SITE_COLORS.food, 'пашни, выгоны, рощи (круг)') + sw(SITE_COLORS.raw, 'рудники, каменоломни, лесосеки (квадрат)') + '× пень — сожжено; тонкие тропы к городу; <b>жёлтые связи</b> между городами — по ним идёт хлеб, ярче — больше; <b>отряды</b>: круг с хвостом — набег или выводок, квадрат — войско, крылья — дракон (пунктир — путь вперёд); ' + sw([170, 70, 40], 'фуражиры войска');
    else if (this.layer === 'wild') html = Object.entries(WILD_COLORS).map(([id, c]) => sw(c, SPECIES.get(id).plural)).join('') + '<b>живность логов</b> — где чей народ гуще всего, ярче — гуще; ореолы вокруг логов, выводки несут их дальше; пунктирный ромб — скрытое логово' + sw([110, 60, 130], 'гниль');
    else if (this.layer === 'rot') html = sw(ROT_RAMP[0][1], 'чисто') + sw(ROT_RAMP[1][1], '12% — вампир заводится в смешанном городе') + sw(mix(ROT_RAMP[1][1], ROT_RAMP[2][1], 0.6), '20% — упыри у пепелищ') + sw(ROT_RAMP[2][1], '25% — курганники на курганах') + sw(ROT_RAMP[3][1], '50% — башня некроманта') + sw(ROT_RAMP[4][1], 'гуще некуда') + sw([150, 110, 80], 'курганы и могилы — гниль сочится из них') + '<b>гниль</b> растёт от могил (битвы, набеги, пепелища), ползёт по округе и с обозами крыс по дорогам; тает в мороз и зной, быстрее у башен магов и храмов';
    else if (this.layer === 'realms') { const a = this.atlas, alive = a?.realms ? a.realms.filter(r => a.towns.some(t => t.alive && t.realm === r.id)) : [];
      html = (alive.length ? alive.map(r => sw(r.color, `${realmLabel(a, r.id)} — ${a.towns.filter(t => t.alive && t.realm === r.id).length} гор.`)).join('') : '<span>держав ещё нет</span>') +
        '<b>земля державы</b> — куда достают её города по суше (крупные города и столица — дальше); светлая кайма — граница; ничья земля — серая' + sw(LAIRS.get('necromancer').color, 'владения некроманта: его башня, данники-нежить, культ') ; }
    else if (this.layer === 'rain') html = [[100, 'пустыня'], [400, 'сухо'], [800, 'умеренно'], [1500, 'влажно'], [2500, 'очень влажно']].map(([v, l]) => sw(rainColor(v), `${l} (${v} мм)`)).join('');
    else if (this.layer === 'wind') html = sw([240, 240, 230], 'стрелки — куда дует ветер') + sw([90, 110, 150], 'тише') + sw([200, 210, 240], 'сильнее');
    else if (this.layer === 'temp') html = sw(HEAT[0][1], '−30°') + sw(HEAT[1][1], '−4°') + sw(HEAT[2][1], '+9°') + sw(HEAT[3][1], '+35°');
    else html = sw(FRESH, 'пресное озеро') + sw(SALT, 'солёное озеро') + `<span><i style="background:${RIVER};height:3px"></i>реки</span>` + sw(DEEP[0][1], 'глубокое море') + sw(DEEP[1][1], 'мелководье') + sw(LAND[0][1], 'низины') + sw(LAND[2][1], 'нагорья') + sw(LAND[4][1], 'вершины');
    const box = $(this.ids?.legend || 'atlasLegend'); if (box) box.innerHTML = html;   // (the campaign's map has its own legend: none here)
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
        if (!a.fauna || f.ocean[i] || !(this.fauna in a.fauna.idx)) return mix(base, [8, 12, 20], 0.4);
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
      case 'wild': {   // the lairs' folk (atlas/lairs.js lairFolk): the kind that lives thickest here, as bright as it is thick
        const g = mix(base, [40, 40, 36], 0.6); if (!a.fauna || f.ocean[i]) return g;
        const F = a.fauna, j = faunaCellOf(a, i); let best = 0, col = null;
        for (const s of F.list) { if (!s.lair || s.K[j] <= 0) continue; const v = Math.min(1, s.N[j] / Math.max(s.K[j], WILD_K)); if (v > best) { best = v; col = WILD_COLORS[s.id]; } }
        return col ? this.rotTint(a, i, mix(g, col, 0.15 + 0.8 * best)) : this.rotTint(a, i, g);
      }
      case 'rot': {   // the rot (atlas/lairs.js): its ramp over the land, the barrows and graves under it
        const g = mix(base, [40, 40, 36], 0.65); if (!a.rot || !a.fauna || f.ocean[i]) return g;
        const v = a.rot[faunaCellOf(a, i)];
        let c = v < ROT_FROM ? g : mix(g, ramp(ROT_RAMP, v), Math.min(1, 0.45 + v));
        if (f.barrows && f.barrows[i] > 0.15) c = mix(c, [150, 110, 80], 0.35 + 0.4 * Math.min(1, f.barrows[i]));   // barrows and graves: the rot's seed
        return c;
      }
      case 'realms': {   // the realms' land (atlas/realms.js realmLand): its colour, a light rim where it meets another or no one's
        const g = mix(base, [40, 40, 36], 0.6), own = this.realmOwn; if (f.ocean[i]) return g;   // (made once a repaint: paint())
        const o = own ? own[i] : -1;
        if (o < 0) {   // no realm's: a necromancer's seat (atlas/necro.js), a dark land with a rim of its own
          const S = this.seats, n = S ? S[i] : -1; if (n < 0) return g;
          const x = i % a.w, y = (i / a.w) | 0, col = LAIRS.get(this.towerList[n].kind).color;
          const rim = (x > 0 && S[i - 1] !== n) || (x < a.w - 1 && S[i + 1] !== n) || (y > 0 && S[i - a.w] !== n) || (y < a.h - 1 && S[i + a.w] !== n);
          return rim ? mix(col, [230, 200, 240], 0.4) : mix(g, col, 0.5);
        }
        const col = a.realms[o].color, x = i % a.w, y = (i / a.w) | 0;
        const edge = (x > 0 && own[i - 1] !== o && !f.ocean[i - 1]) || (x < a.w - 1 && own[i + 1] !== o && !f.ocean[i + 1]) || (y > 0 && own[i - a.w] !== o && !f.ocean[i - a.w]) || (y < a.h - 1 && own[i + a.w] !== o && !f.ocean[i + a.w]);
        return edge ? mix(col, [250, 245, 230], 0.45) : mix(g, col, 0.6);
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
    const key = `${this.layer}:${this.ore}:${this.fauna}:${a.stage}:${a.hist ? a.hist.step : -1}:${a.towns?.length || 0}`;
    if (this.bitmap && this.bitmapKey === key) return this.bitmap;
    if (this.layer === 'realms') this.legend();   // the realms come and go with the history
    // what «Державы» reads cell by cell, made once a repaint: the realms' land, the necromancers' seats
    if (this.layer === 'realms') { this.realmOwn = realmLand(a); this.towerList = towers(a); this.seats = seatMap(a, this.towerList); }
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
  // a box of cells painted again into the bitmap (a brush's dab, app/landView.js) instead of the whole map
  paintBox(a, x0, y0, x1, y1) {
    if (!this.bitmap) return;
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(a.w - 1, Math.ceil(x1)); y1 = Math.min(a.h - 1, Math.ceil(y1));
    if (x1 < x0 || y1 < y0) return;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, px = this.bitmap.getContext('2d'), img = px.createImageData(bw, bh), d = img.data;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      // the shade looks one cell up and left: the box's own edge is shaded from the cells beside it, as the whole map is
      const i = y * a.w + x, c = this.color(a, i), s = this.shade(a, i), o = ((y - y0) * bw + (x - x0)) * 4;
      d[o] = c[0] * s; d[o + 1] = c[1] * s; d[o + 2] = c[2] * s; d[o + 3] = 255;
    }
    px.putImageData(img, x0, y0);
  }

  // the size unit of what is drawn over the cells: a 192-cell-high world's cell at zoom 1, growing
  // with the zoom slower than the cells do, so a close-up still shows the ground around a town
  unit(a) { return Math.min(a.w, a.h) / 192 / Math.pow(this.cam.zoom, 0.6); }

  draw() {
    const a = this.atlas; if (!a || !this.cam) return;
    const cv = $(this.ids.map), [cw, ch] = this.box(), dpr = window.devicePixelRatio || 1;
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
    if (a.f.road && ['relief', 'biomes', 'peoples', 'realms', 'fauna', 'wild', 'rot'].includes(this.layer)) this.drawRoads(a, px);
    if (a.f.sea && ['relief', 'biomes', 'peoples', 'realms'].includes(this.layer)) this.drawLanes(a, px);
    if (a.lairs && ['relief', 'biomes', 'fauna', 'wild', 'peoples', 'realms', 'rot'].includes(this.layer)) { this.drawLairs(a, px); this.drawLeaders(a, px); }
    if (a.artifact && ['relief', 'biomes', 'fauna', 'wild', 'peoples', 'realms'].includes(this.layer)) this.drawEpic(a, px);
    if (a.net && this.layer === 'peoples') this.drawLinks(a, px);
    if (a.sites && ['relief', 'biomes', 'peoples', 'realms', 'soils'].includes(this.layer)) this.drawSites(a, px);
    if (a.parties && ['relief', 'biomes', 'peoples', 'realms', 'fauna', 'wild'].includes(this.layer)) this.drawParties(a, px);
    if (a.ruins && ['relief', 'biomes', 'peoples', 'realms', 'rot'].includes(this.layer)) this.drawRuins(a, px);
    if (a.towns && ['relief', 'biomes', 'peoples', 'realms', 'fauna', 'wild', 'rain', 'soils', 'rot'].includes(this.layer)) this.drawTowns(a, px);
    if (a.f.flow && ['relief', 'rain', 'rocks', 'temp', 'biomes', 'soils'].includes(this.layer)) this.rivers(a, px);
    if (this.sel) this.drawSelection(a, px);
    this.overlay(a, px, cam);
  }

  // rivers: a line from each river cell to the cell it drains into, wider for more water
  // the lines of rivers, roads and lanes change only with the world: built once a stage or a season (Path2D, in cell
  // units) and only stroked on a frame — panning and hovering do not walk the whole grid
  cachedPaths(a, kind, build) {
    const key = `${kind}:${a.stage}:${a.hist ? a.hist.step : -1}`;
    if (this.pathsOf !== a) { this.pathsOf = a; this.paths = new Map(); }
    if (!this.paths.has(key)) { for (const k of this.paths.keys()) if (k.startsWith(kind + ':')) this.paths.delete(k); this.paths.set(key, build()); }
    return this.paths.get(key);
  }
  segments(a, r, min, levelOf, levels) {
    const w = a.w, out = Array.from({length: levels}, () => new Path2D());
    for (let i = 0; i < a.n; i++) {
      if (r[i] < min) continue;
      const lvl = levelOf(r[i]), x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny >= a.h || r[ny * w + nx] < min) continue;
        out[lvl].moveTo(x + 0.5, y + 0.5); out[lvl].lineTo(nx + 0.5, ny + 0.5);
      }
    }
    return out;
  }

  rivers(a, px) {
    const f = a.f, k2 = scaleOf(a) ** 2, u = this.unit(a) / scaleOf(a);
    const classes = [[RIVERS.great * k2, 1.6 * u], [RIVERS.river * k2, 1 * u], [RIVERS.stream * k2, 0.55 * u]];
    const paths = this.cachedPaths(a, 'rivers', () => {
      const out = classes.map(() => new Path2D());
      for (let i = 0; i < a.n; i++) {
        const v = f.flow[i], d = f.down[i];
        if (v < classes[2][0] || d < 0 || f.lake[i] >= 0) continue;
        const P = out[classes.findIndex(([thr]) => v >= thr)];
        P.moveTo(i % a.w + 0.5, ((i / a.w) | 0) + 0.5); P.lineTo(d % a.w + 0.5, ((d / a.w) | 0) + 0.5);
      }
      return out;
    });
    px.strokeStyle = RIVER; px.lineCap = 'round';
    classes.forEach(([, lw], c) => { px.lineWidth = Math.max(this.minW, lw); px.stroke(paths[c]); });
  }

  // roads: a line between neighbouring road cells, wider the more worn
  drawRoads(a, px) {
    const k = this.unit(a), paths = this.cachedPaths(a, 'roads', () => this.segments(a, a.f.road, ROADS.levels[0].wear, roadLevel, ROADS.levels.length));
    px.lineCap = 'round';
    ROADS.levels.forEach((L, lvl) => {
      px.strokeStyle = lvl === 2 ? 'rgba(236,214,170,0.95)' : lvl === 1 ? 'rgba(206,176,128,0.9)' : 'rgba(170,140,100,0.75)';
      px.lineWidth = Math.max(this.minW, L.width * k); px.stroke(paths[lvl]);
    });
  }

  // sea lanes: pale dashed lines over the water between harbours, wider the more sailed
  drawLanes(a, px) {
    const k = this.unit(a), paths = this.cachedPaths(a, 'lanes', () => this.segments(a, a.f.sea, SEA.levels[0].wear, seaLevelOf, SEA.levels.length));
    px.lineCap = 'butt'; px.setLineDash([2 * k, 2 * k]);
    SEA.levels.forEach((L, lvl) => {
      px.strokeStyle = lvl === 1 ? 'rgba(230,240,250,0.9)' : 'rgba(190,210,230,0.7)';
      px.lineWidth = Math.max(this.minW, L.width * k); px.stroke(paths[lvl]);
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
      if (p.kind === 'caravan') continue;   // the campaign screen draws its own (ui/campaignView.js)
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
      // a leader of an old lair (atlas/leaders.js): a crown-like point — a star of five rays, as big as an army
      else if (p.kind === 'leader') { for (let n = 0; n < 10; n++) { const rr = n % 2 ? r * 0.55 : r * 1.35, ang = -Math.PI / 2 + n * Math.PI / 5; px.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); } px.closePath(); }
      else px.arc(x, y, r * (p.kind === 'brood' ? 0.7 : 1), 0, Math.PI * 2);
      px.fill(); px.stroke();
    }
  }

  // how far between the last season and the next the screen is, 0 … 1: the parties slide by it (core/clock.js)
  slide() { return this.clock.phase(); }

  // between seasons the parties keep sliding: a frame loop while the clock runs and there is something to slide
  animate() {
    if (this.raf) return;
    const loop = () => {
      this.raf = 0;
      const a = this.atlas;
      this.frame?.();   // what a screen shows between seasons (the day of the season)
      if (!a || !this.clock.running || this.slide() >= 1) { this.draw(); return; }
      if (a.parties?.length) this.draw();
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
      // a hidden lair (atlas/lairs.js WILD): the realms know nothing of it — a faint dashed mark, no territory ring
      if (l.hidden) {
        const r = sz * (0.7 + 0.5 * l.strength);
        px.strokeStyle = `rgba(${L.color.join(',')},0.7)`; px.lineWidth = Math.max(this.minW, 0.4 * k); px.setLineDash([0.5 * sz, 0.4 * sz]);
        px.beginPath(); px.moveTo(x, y - r); px.lineTo(x + r, y); px.lineTo(x, y + r); px.lineTo(x - r, y); px.closePath(); px.stroke(); px.setLineDash([]);
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

  // the leaders of the old lairs (atlas/leaders.js): a silver ring round the lair; a thin line to the lord of a vassal
  drawLeaders(a, px) {
    const k = this.unit(a), sz = Math.max(2.2 / Math.pow(this.cam.zoom, 0.6), 3 * k), silver = 'rgba(225,232,240,0.95)';
    const byId = new Map(a.lairs.map(l => [l.id, l]));
    px.strokeStyle = 'rgba(225,232,240,0.35)'; px.lineWidth = Math.max(this.minW, 0.3 * k);
    px.beginPath();
    for (const l of a.lairs) { const lord = l.alive && l.lord != null ? byId.get(l.lord) : null; if (lord?.alive && lord.leader) { px.moveTo(l.x + 0.5, l.y + 0.5); px.lineTo(lord.x + 0.5, lord.y + 0.5); } }
    px.stroke();
    px.strokeStyle = silver; px.lineWidth = Math.max(this.minW, 0.7 * k);
    for (const l of a.lairs) {
      if (!l.alive || !l.leader) continue;
      px.beginPath(); px.arc(l.x + 0.5, l.y + 0.5, sz * 1.3, 0, Math.PI * 2); px.stroke();
    }
  }

  // the epic world (atlas/calamity.js): the sanctuary — a gold star; a calamity's boss — a gold ring round its lair;
  // the graves of the fallen bosses — a gold cross on a dark stone
  drawEpic(a, px) {
    const k = this.unit(a), sz = Math.max(2.2 / Math.pow(this.cam.zoom, 0.6), 3 * k), gold = 'rgba(255,214,90,0.95)', w = Math.max(this.minW, 0.5 * k);
    if (a.sanctuary?.i >= 0) {
      const x = a.sanctuary.i % a.w + 0.5, y = ((a.sanctuary.i / a.w) | 0) + 0.5;
      px.fillStyle = gold; px.strokeStyle = 'rgba(20,14,8,0.9)'; px.lineWidth = w;
      px.beginPath();
      for (let n = 0; n < 10; n++) { const r = n % 2 ? sz * 0.45 : sz, ang = -Math.PI / 2 + n * Math.PI / 5; px.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r); }
      px.closePath(); px.fill(); px.stroke();
    }
    for (const l of a.lairs || []) {
      if (l.boss == null || !l.alive) continue;
      px.strokeStyle = gold; px.lineWidth = Math.max(this.minW, 0.9 * k);
      px.beginPath(); px.arc(l.x + 0.5, l.y + 0.5, sz * 1.6, 0, Math.PI * 2); px.stroke();
    }
    for (const g of a.graves || []) {
      const x = g.i % a.w + 0.5, y = ((g.i / a.w) | 0) + 0.5;
      px.fillStyle = 'rgba(30,24,20,0.9)'; px.beginPath(); px.arc(x, y, sz * 0.9, 0, Math.PI * 2); px.fill();
      px.strokeStyle = gold; px.lineWidth = Math.max(this.minW, 0.7 * k);
      px.beginPath(); px.moveTo(x, y - sz * 0.7); px.lineTo(x, y + sz * 0.7); px.moveTo(x - sz * 0.45, y - sz * 0.25); px.lineTo(x + sz * 0.45, y - sz * 0.25); px.stroke();
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

  hover(e) {
    const a = this.atlas; if (!a || !a.f.elev || !this.cam) return;
    const i = this.cellAt(e);
    $(this.ids.readout).textContent = i < 0 ? this.ids.hint : this.cellText(i);
  }
  // the cell in words: the land, the climate, the biome, what stands and lives here
  cellText(i) {
    const a = this.atlas, x = i % a.w, y = (i / a.w) | 0;
    const f = a.f, parts = [`${x}, ${y}`];
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
      const R = town.realm ? a.realms.find(r => r.id === town.realm) : null;
      if (R) parts.push(`держава работает металлы: ${realmMetalWords(a, town).join(', ') || 'никакие'}`);
      if (R?.captives && Object.values(R.captives).some(v => v > 0)) parts.push(`увели в полон за историю: ${captiveCount(R)}`);
      if (R?.why) parts.push(`последнее дело державы (${R.why.year} г.): ${deedLabel(R.why.deed)} — ${R.why.why}${R.why.alt ? `; иначе: ${deedLabel(R.why.alt)}` : ''}`);
      // the realm as a kingdom (atlas/kingdom.js): its attributes, its ruin, its court
      const Kd = R?.kingdom;
      if (Kd) {
        const st = REALM_STATS.all().map(x => `${x.label} ${Kd.stats[x.id].toFixed(1)}`).join(', ');
        const ru = RUINS.all().filter(x => Kd.ruin[x.id] > 0.05).map(x => `${x.label} ${Kd.ruin[x.id].toFixed(1)}`).join(', ');
        const court = OFFICES.all().map(o => `${o.label}: ${Kd.court[o.id]?.name || '—'}`).join(', ');
        parts.push(`держава: ${st}${ru ? `; разруха: ${ru}` : ''}; двор — ${court}`);
      }
    }
    const party = partyAt(a, i);
    if (party) {
      const tgt = party.target != null ? a.towns.find(t => t.id === party.target) : null, lair = party.owner != null && party.kind !== 'army' ? a.lairs.find(l => l.id === party.owner) : null;
      parts.push(`${party.kind === 'raid' ? 'набег' : party.kind === 'brood' ? 'выводок' : party.kind === 'army' ? 'войско' : party.kind === 'leader' ? `главарь: ${DEEDS.has(party.plan) ? deedLabel(party.plan) : party.plan}` : 'дракон'}: ${party.label}${lair ? ` ${LAIRS.get(lair.kind).from} «${lair.name}»` : ''}${party.state === 'home' ? ', идут домой' : tgt ? ` на ${townLabel(tgt, 1)} ${tgt.name}` : ''}${party.might ? `, сила ${party.might.toFixed(1)}` : ''}, в пути ${party.days} дн.`);
    }
    const site = siteAt(a, i);
    if (site) { const b = TOWN_BUILDINGS.get(site.kind), t = a.towns.find(t => t.id === site.town); parts.push(`${b.name} (${CATEGORIES[b.cat]}) ${townLabel(t, 2)} ${t.name}, с года ${site.built}`); }
    const ruin = ruinAt(a, i);
    if (ruin) parts.push(`пепелище ${ruin.name} (${WORLD_PEOPLES.get(ruin.people).label}), сожжено в год ${ruin.year}`);
    if (f.barrows && f.barrows[i] > 0.15) parts.push('курганы былых битв');
    if (a.rot && !f.ocean[i] && a.rot[faunaCellOf(a, i)] > 0.08) parts.push(`гниль ${Math.round(a.rot[faunaCellOf(a, i)] * 100)}%`);
    const land = landOf(a, i);
    if (land) parts.push(`земли: ${land.people.label} ${Math.round(land.share * 100)}%`);
    const own = realmLand(a)?.[i];
    if (own != null && own >= 0) parts.push(`держава: ${realmLabel(a, a.realms[own].id)}`);
    if (a.f.road && a.f.road[i] >= ROADS.levels[0].wear) parts.push(ROADS.levels[roadLevel(a.f.road[i])].label);
    if (a.f.sea && a.f.sea[i] >= SEA.levels[0].wear) parts.push(SEA.levels[seaLevelOf(a.f.sea[i])].label);
    const lair = lairAt(a, i);
    if (lair) {
      const L = LAIRS.get(lair.kind), lord = lair.lord != null ? a.lairs.find(l => l.id === lair.lord) : null;
      parts.push(`владения: ${L.label} «${lair.name}»${lair.hidden ? ' (скрыто: державы о нём не знают)' : ''}, сила ${Math.round(lair.strength * 100)}%${lair.ancient ? ', древнее' : ''}${lair.leader ? `, ${lair.leader.title[0].toLowerCase()} — ${lair.leader.name} (с ${lair.leader.born} г., дел: ${lair.leader.deeds}${lair.why ? `; ${lair.why.year} г. — ${deedLabel(lair.why.deed)}: ${lair.why.why}` : ''})` : ''}${lord?.leader ? `, платит дань «${lord.name}»` : ''}${captiveCount(lair) ? `; в полоне: ${captiveCount(lair)}` : ''}`);
    }
    if (a.fauna && !f.ocean[i]) {
      const word = v => (v >= 0.8 ? 'много' : v >= 0.45 ? 'есть' : 'мало');
      const beasts = a.fauna.list.filter(s => s.role !== 'spirit').map(s => [s, faunaAt(a, i, s.id)]).filter(([, v]) => v > 0.15).sort((p, q) => q[1] - p[1]).slice(0, 4);
      if (beasts.length) parts.push('живность: ' + beasts.map(([s, v]) => `${s.sp.plural} ${word(v)}`).join(', '));
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
    return parts.join(' · ');
  }
}

// The world screen of old (its own controls are gone with the polygon; the campaign screen builds on it: the library,
// a saved world shown, the clock's steps over history).
export {OPTS as ATLAS_OPTS};
