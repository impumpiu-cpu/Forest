// The «Мир» screen: the world-map polygon. Settings on the left, the map in the middle, the
// chronicle on the right. The land runs a stage a frame; history runs a season a step at the observer's pace
// (core/clock.js), so the map is drawn and the chronicle written as the world is made. The map has
// a camera (render/camera.js): the wheel zooms at the cursor, dragging pans, as on the local map.
// The cells are painted once per change into an off-screen bitmap and drawn scaled; everything on
// top (rivers, roads, towns, lairs) is drawn in cell units over it. (Later the generation moves to
// a Web Worker — docs/WORLD.md.)
import {skin, SKIN_EVENT, wireSkinButton} from '../render/skin.js';
import {artPick} from '../render/art/world.js';
import {ATLAS_SIZES, ATLAS_LAND} from '../data/atlas.js';
import {DEEDS, deedLabel} from '../data/deeds.js';
import {cellGeology} from '../atlas/geology.js';
import {riverKind} from '../atlas/hydrology.js';
import {biomeAt, soilAt, cellBiomes} from '../atlas/biomes.js';
import {heightKm} from '../atlas/climate.js';
import {BIOMES} from '../data/biomes.js';
import {PLATE_COUNTS, HEMISPHERES, BOUNDARY_BY_CODE, ORE_GENESIS} from '../data/geology.js';
import {LEVEL_WORDS} from '../data/regions.js';
import {RAIN_WORDS} from '../data/climate.js';
import {townAt, landOf} from '../atlas/peoples.js';
import {townLabel} from '../atlas/towns.js';
import {roadLevel} from '../atlas/roads.js';
import {seaLevelOf} from '../atlas/sea.js';
import {SEA} from '../data/roads.js';
import {WORLD_PEOPLES, ELDER_YEARS, YOUNG_YEARS} from '../data/peoples.js';
import {ruinAt} from '../atlas/diplomacy.js';
import {realmLabel, realmLand} from '../atlas/realms.js';
import {personOf} from '../atlas/persons.js';
import {rulerOf, rulerTitle, profileOf} from '../atlas/polities.js';
import {captiveCount} from '../atlas/lairs.js';
import {ROADS} from '../data/roads.js';
import {faunaAt} from '../atlas/fauna.js';
import {lairAt} from '../atlas/lairs.js';
import {LAIRS} from '../data/lairs.js';
import {REALM_STATS, RUINS, OFFICES} from '../data/kingdom.js';
import {WILD_YEARS} from '../data/history.js';
import {SPECIES} from '../data/species.js';
import {TOWN_BUILDINGS, EFFECTS} from '../data/townBuildings.js';
import {townFx, room, realmMetalWords} from '../atlas/towns.js';
import {offerText, latinTitle} from './store.js';
import {worldChronicleText, calamityChronicleText} from '../atlas/chronicle.js';
import {$, seg} from './dom.js';
import {SeasonClock} from '../core/clock.js';
import {siteAt, siteRadius} from '../atlas/sites.js';
import {partyAt} from '../atlas/parties.js';
import {pickObject, inspectHtml, whereIs, kinLine} from './inspect.js';
import {openTab} from './tabs.js';
import {CATEGORIES} from '../data/townBuildings.js';
import {RIVER_KINDS, PARTY_KINDS} from '../data/labels.js';
import {MapOverlays} from './atlasOverlays.js';
import {faunaCellOf} from './atlasLayers.js';
import {PROFILES} from '../data/commands.js';

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
  layer: [['relief', 'Рельеф'], ['plates', 'Плиты'], ['rocks', 'Породы'], ['ores', 'Руды'], ['temp', 'Температура'], ['wind', 'Ветры'], ['rain', 'Осадки'], ['biomes', 'Биомы'], ['soils', 'Почвы'], ['fauna', 'Звери'], ['wild', 'Живность'], ['rot', 'Гниль'], ['peoples', 'Народы'], ['realms', 'Державы'], ['will', 'Воля державы']],
  ore: ORE_GENESIS.all().map(o => [o.id, o.label]),
  // which commands the world's minds may choose (data/commands.js PROFILES; table «Профили команд»)
  profile: PROFILES.all().map(p => [p.id, p.label]),
};
// what is drawn over the cells on each layer of the map (once, not a list a frame)
const OVER = {
  roads: ['relief', 'biomes', 'peoples', 'realms', 'will', 'fauna', 'wild', 'rot'], lanes: ['relief', 'biomes', 'peoples', 'realms'],
  lairs: ['relief', 'biomes', 'fauna', 'wild', 'peoples', 'realms', 'rot'], epic: ['relief', 'biomes', 'fauna', 'wild', 'peoples', 'realms'],
  links: ['peoples'], sites: ['relief', 'biomes', 'peoples', 'realms', 'soils'], parties: ['relief', 'biomes', 'peoples', 'realms', 'will', 'fauna', 'wild'],
  ruins: ['relief', 'biomes', 'peoples', 'realms', 'will', 'rot'], will: ['will'], towns: ['relief', 'biomes', 'peoples', 'realms', 'will', 'fauna', 'wild', 'rain', 'soils', 'rot'],
  rivers: ['relief', 'rain', 'rocks', 'temp', 'biomes', 'soils'],
};
const ON = {}; for (const [what, layers] of Object.entries(OVER)) for (const l of layers) (ON[l] ||= new Set()).add(what);
const NONE = new Set();
// a press that moves less than this is a click (a hover); further, it drags the map
const DRAG_PX = 5;
const COMPASS = ['восточный', 'юго-восточный', 'южный', 'юго-западный', 'западный', 'северо-западный', 'северный', 'северо-восточный'];
// where the wind blows from, in words (the map's y grows downwards: north is up)
const windWord = (x, y) => COMPASS[(Math.round(Math.atan2(-y, -x) / (Math.PI / 4)) + 8) % 8];

// the chronicle's detail, remembered in this browser (shared by the «Мир» and «Кампания» screens)
export function loadDetail() { try { return localStorage.getItem('forest.chronDetail') || 'normal'; } catch (e) { return 'normal'; } }
export function saveDetail(v) { try { localStorage.setItem('forest.chronDetail', v); } catch (e) { /* storage unavailable */ } }
// a row of buttons for a choice; `on(value)` when one is pressed (ui/dom.js seg)
export const segOf = (box, items, cur, on) => { seg(box, items, cur, on); };
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
export class MapView extends MapOverlays {
  constructor(opts = {}) {
    super();
    this.atlas = null; this.layer = 'relief'; this.ore = OPTS.ore[0]?.[0]; this.fauna = OPTS.fauna[0]?.[0];
    this.cam = null; this.bitmap = null; this.bitmapKey = ''; this.grab = null;
    // the observer's clock (core/clock.js): a season a step at the pace chosen; the screens give it their step
    this.clock = new SeasonClock({step: () => this.stepSeason(), after: () => this.afterSeason(), done: () => this.afterRun()});
    this.worldId = null; this.worldName = '';   // the library record this world is saved as, if any
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
    let sel = pickObject(this.atlas, i);
    // the pictures stand bigger than their cell (render/art/world.js): a click on one picks it
    if (skin.art && sel.kind === 'cell') {
      const r = $(this.ids.map).getBoundingClientRect(), [fx, fy] = this.cam.toCell(e.clientX - r.left, e.clientY - r.top);
      sel = artPick(this.atlas, fx, fy, this.unit(this.atlas)) || sel;
    }
    this.select(sel, this.cellText(i));
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
    $(ids.zoomFit).addEventListener('click', () => this.zoomFit());
    // the look (render/skin.js): «Картинки» or «Схема», one for all the maps; G flips it (app/main.js)
    if (ids.skin) wireSkinButton($(ids.skin));
    document.addEventListener(SKIN_EVENT, () => { if (!$(ids.screen).hidden) this.draw(); });
    document.addEventListener('keydown', e => {
      if ($(ids.screen).hidden || e.target !== document.body || e.ctrlKey || e.metaKey) return;
      if (e.key === '+' || e.key === '=') this.zoomCentre(1.6);
      else if (e.key === '-' || e.key === '_') this.zoomCentre(1 / 1.6);
      else if (e.key === '0' || e.key === 'Home') this.zoomFit();
    });
  }

  // the size of the map's box in CSS pixels (the canvas is kept at the box's size, at device resolution)
  box() { const cv = $(this.ids.map); return [cv.clientWidth || 1, cv.clientHeight || 1]; }

  zoomCentre(f) { if (!this.cam) return; const [cw, ch] = this.box(); this.cam.zoomAt(cw, ch, f, cw / 2, ch / 2); this.draw(); }
  zoomFit() { if (this.cam) { this.cam.reset(); this.draw(); } }


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
    const on = ON[this.layer] || NONE;
    // the rivers lie on the land: under the roads, the lanes, the towns and all the rest
    if (a.f.flow && on.has('rivers')) this.rivers(a, px);
    if (a.f.road && on.has('roads')) this.drawRoads(a, px);
    if (a.f.sea && on.has('lanes')) this.drawLanes(a, px);
    if (a.lairs && on.has('lairs')) { this.drawLairs(a, px); this.drawLeaders(a, px); }
    if (a.artifact && on.has('epic')) this.drawEpic(a, px);
    if (a.net && on.has('links')) this.drawLinks(a, px);
    if (a.sites && on.has('sites')) this.drawSites(a, px);
    if (a.parties && on.has('parties')) this.drawParties(a, px);
    if (a.ruins && on.has('ruins')) this.drawRuins(a, px);
    if (a.towns && on.has('will')) this.drawWill(a, px);
    if (a.towns && on.has('towns')) this.drawTowns(a, px);
    if (this.sel) this.drawSelection(a, px);
    this.overlay(a, px, cam);
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
    if (rk) parts.push(RIVER_KINDS[rk] || rk);
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
      const folk = kinLine(a, town);
      const sup = town.supply, feed = sup ? (sup.got > 0.05 * town.pop ? `; привозят еды на ${Math.round(sup.got)}` : sup.gave > 0.05 * town.pop ? `; отправляют еды на ${Math.round(sup.gave)}` : '') : '';
      parts.push(`${townLabel(town)} ${town.name} (${town.realm ? realmLabel(a, town.realm) : P.label}), ${Math.round(town.pop)} жителей (${folk}), дома на ${room(fx)}, основан в год ${town.founded}, угодья в ${siteRadius(a, town)} клетках; постройки: ${list || 'нет'}` + (gives ? `; даёт: ${gives}` : '') + feed);
      const R = town.realm ? a.realms.find(r => r.id === town.realm) : null;
      if (R) parts.push(`держава работает металлы: ${realmMetalWords(a, town).join(', ') || 'никакие'}`);
      if (R?.captives && Object.values(R.captives).some(v => v > 0)) parts.push(`увели в полон за историю: ${captiveCount(R)}`);
      if (R?.why) parts.push(`последнее дело державы (${R.why.year} г.): ${deedLabel(R.why.deed)} — ${R.why.why}${R.why.alt ? `; иначе: ${deedLabel(R.why.alt)}` : ''}`);
      // the realm as a kingdom (atlas/kingdom.js): its attributes, its ruin, its court
      const Kd = R?.kingdom;
      if (Kd) {
        const st = REALM_STATS.all().map(x => `${x.label} ${Kd.stats[x.id].toFixed(1)}`).join(', ');
        const ru = RUINS.all().filter(x => Kd.ruin[x.id] > 0.05).map(x => `${x.label} ${Kd.ruin[x.id].toFixed(1)}`).join(', ');
        const court = OFFICES.all().map(o => `${o.label}: ${personOf(a, Kd.court[o.id]?.person)?.name || '—'}`).join(', ');
        const ruler = rulerOf(a, R);
        parts.push(`держава (${profileOf(R).label}): ${ruler ? `${rulerTitle(R, ruler)} ${ruler.name}, ${(a.hist?.year ?? 0) - ruler.born} лет` : 'трон пуст'}; ${st}${ru ? `; разруха: ${ru}` : ''}; двор — ${court}`);
      }
    }
    const party = partyAt(a, i);
    if (party) {
      const tgt = party.target != null ? a.towns.find(t => t.id === party.target) : null, lair = party.owner != null && party.kind !== 'army' ? a.lairs.find(l => l.id === party.owner) : null;
      parts.push(`${party.kind === 'leader' ? `${PARTY_KINDS.leader.map}: ${DEEDS.has(party.plan) ? deedLabel(party.plan) : party.plan}` : PARTY_KINDS[party.kind]?.label || party.kind}: ${party.label}${lair ? ` ${LAIRS.get(lair.kind).from} «${lair.name}»` : ''}${party.state === 'home' ? ', идут домой' : tgt ? ` на ${townLabel(tgt, 1)} ${tgt.name}` : ''}${party.might ? `, сила ${party.might.toFixed(1)}` : ''}, в пути ${party.days} дн.`);
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

// the choices of the map's settings and layers (the screens of src/app/ build their rows from them)
export {OPTS as ATLAS_OPTS};
