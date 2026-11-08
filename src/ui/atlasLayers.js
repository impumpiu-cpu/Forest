// The map's layers (ui/atlasView.js MapView): the colour of a cell on each layer, the light on the relief, the legend,
// the off-screen bitmap of the cells. Out of ui/atlasView.js; MapView takes these methods by extending MapLayers.
import {biomeAt, soilAt} from '../view/world.js';
import {BIOMES, BIOME_KINDS} from '../data/biomes.js';
import {SOILS} from '../data/soils.js';
import {BOUNDARIES, BOUNDARY_BY_CODE, ROCKS, ROCK_BY_CODE, ROCK_KINDS, ORE_GENESIS} from '../data/geology.js';
import {landOf} from '../view/world.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {realmLabel, realmLand} from '../view/world.js';
import {ROADS} from '../data/roads.js';
import {faunaAt} from '../view/world.js';
import {towers, seatMap} from '../view/world.js';
import {LAIRS} from '../data/lairs.js';
import {SPECIES} from '../data/species.js';
import {esc} from '../core/util.js';
import {$} from './dom.js';

// the roles of the towns on the layer «Воля державы» (atlas/mind.js), and the seat's
export const ROLE_COLORS = {agg: [205, 72, 58], grow: [96, 178, 84], econ: [222, 178, 64], seat: [240, 236, 222]};
// the layer «Живность»: each lair's owner in the colour of its first lair kind (data/lairs.js); a land that holds next to
// none of a kind does not show it bright for the few that wandered in
// (read at each paint, not at load: the tables' edits of the lairs are seen at once)
function wildColors() { const C = {}; for (const L of LAIRS.all()) if (L.species && !L.undead && !L.fiend && !C[L.species]) C[L.species] = L.color; return C; }
const WILD_K = 0.05;

// the marks of the towns' works, by the building's category (data/townBuildings.js CATEGORIES)
export const SITE_COLORS = {food: [196, 182, 72], raw: [168, 150, 128], trade: [220, 190, 120]};

const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
const hexRgb = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
export const faunaCellOf = (a, i) => (((i / a.w) | 0) / a.fauna.c | 0) * a.fauna.W + ((i % a.w) / a.fauna.c | 0);
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t));
  for (let k = 1; k < stops.length; k++) if (t <= stops[k][0]) {
    const [t0, c0] = stops[k - 1], [t1, c1] = stops[k];
    return mix(c0, c1, (t - t0) / (t1 - t0 || 1));
  }
  return stops[stops.length - 1][1];
}
export const FRESH = [58, 104, 150], SALT = [150, 176, 168], RIVER = 'rgba(70,130,190,0.95)';
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

export class MapLayers {
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
    else if (this.layer === 'wild') html = Object.entries(wildColors()).map(([id, c]) => sw(c, SPECIES.get(id).plural)).join('') + '<b>живность логов</b> — где чей народ гуще всего, ярче — гуще; ореолы вокруг логов, выводки несут их дальше; пунктирный ромб — скрытое логово' + sw([110, 60, 130], 'гниль');
    else if (this.layer === 'rot') html = sw(ROT_RAMP[0][1], 'чисто') + LAIRS.filter(L => L.rotAt != null).sort((p, q) => p.rotAt - q.rotAt).map(L => sw(ramp(ROT_RAMP, L.rotAt), `${Math.round(L.rotAt * 100)}% — ${L.label}`)).join('') + sw(ROT_RAMP[4][1], 'гуще некуда') + sw([150, 110, 80], 'курганы и могилы — гниль сочится из них') + '<b>гниль</b> растёт от могил (битвы, набеги, пепелища), ползёт по округе и с обозами крыс по дорогам; тает в мороз и зной, быстрее у башен магов и храмов';
    else if (this.layer === 'realms') { const a = this.atlas, alive = a?.realms ? a.realms.filter(r => a.towns.some(t => t.alive && t.realm === r.id)) : [];
      html = (alive.length ? alive.map(r => sw(r.color, `${realmLabel(a, r.id)} — ${a.towns.filter(t => t.alive && t.realm === r.id).length} гор.`)).join('') : '<span>держав ещё нет</span>') +
        '<b>земля державы</b> — куда достают её города по суше (крупные города и столица — дальше); светлая кайма — граница; ничья земля — серая' + sw(LAIRS.get('necromancer').color, 'владения некроманта: его башня, данники-нежить, культ') ; }
    else if (this.layer === 'will') html = sw(ROLE_COLORS.agg, 'роль: агрессия') + sw(ROLE_COLORS.grow, 'роль: рост') + sw(ROLE_COLORS.econ, 'роль: экономика') + sw(ROLE_COLORS.seat, 'столица — по ветру державы') +
      '<b>нити</b> — от города к столице в цвете его роли: роль ставит совет державы раз в год; <b>рамка</b> другого цвета — город строит против роли (роль — приоритет, не приказ). Курс, ветер и траты совета — в карточке державы';
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
        for (const s of F.list) { if (!s.lair || s.K[j] <= 0) continue; const v = Math.min(1, s.N[j] / Math.max(s.K[j], WILD_K)); if (v > best) { best = v; col = (this.wildColors ||= wildColors())[s.id]; } }
        return col ? this.rotTint(a, i, mix(g, col, 0.15 + 0.8 * best)) : this.rotTint(a, i, g);
      }
      case 'rot': {   // the rot (atlas/lairs.js): its ramp over the land, the barrows and graves under it
        const g = mix(base, [40, 40, 36], 0.65); if (!a.rot || !a.fauna || f.ocean[i]) return g;
        const v = a.rot[faunaCellOf(a, i)];
        let c = v < ROT_FROM ? g : mix(g, ramp(ROT_RAMP, v), Math.min(1, 0.45 + v));
        if (f.barrows && f.barrows[i] > 0.15) c = mix(c, [150, 110, 80], 0.35 + 0.4 * Math.min(1, f.barrows[i]));   // barrows and graves: the rot's seed
        return c;
      }
      case 'will':
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
    if (this.layer === 'wild') this.wildColors = wildColors();
    if (this.layer === 'realms' || this.layer === 'will') { this.realmOwn = realmLand(a); this.towerList = towers(a); this.seats = seatMap(a, this.towerList); }
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
}
