// What is drawn over the cells of the map (ui/atlasView.js MapView): rivers, roads, sea lanes, towns, the realms' will,
// the towns' works, parties, supply links, ruins, lairs, leaders, the epic marks, wind arrows. Out of ui/atlasView.js;
// MapView takes these methods by extending MapOverlays.
import {skin} from '../render/skin.js';
import {ART} from '../render/art/index.js';
import {RIVERS} from '../data/hydrology.js';
import {scaleOf} from '../atlas/tectonics.js';
import {roadLevel} from '../atlas/roads.js';
import {seaLevelOf} from '../atlas/sea.js';
import {SEA} from '../data/roads.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {townLean} from '../atlas/mind.js';
import {leadOf} from '../data/mind.js';
import {ROADS} from '../data/roads.js';
import {LAIRS} from '../data/lairs.js';
import {TOWN_BUILDINGS} from '../data/townBuildings.js';
import {byId} from '../render/index.js';
import {MapLayers, ROLE_COLORS, SITE_COLORS, RIVER} from './atlasLayers.js';

export class MapOverlays extends MapLayers {
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
      const will = this.layer === 'will' && t.realm != null;
      const c = will ? (t.role ? ROLE_COLORS[t.role] : ROLE_COLORS.seat) : (t.realm && byId(a).realm.get(t.realm) || WORLD_PEOPLES.get(t.people)).color, s = (1.2 + 0.7 * t.tier) * k, x = t.x + 0.5, y = t.y + 0.5;
      const pic = skin.art && ART.town(px, t, x, y, s, k, this.cam.S, {color: c, will, a});   // the picture (render/art/), with its own capital mark
      if (!pic) {
        px.fillStyle = `rgb(${c.join(',')})`; px.strokeStyle = 'rgba(12,12,10,0.9)'; px.lineWidth = Math.max(this.minW, 0.45 * k);
        px.fillRect(x - s, y - s, 2 * s, 2 * s); px.strokeRect(x - s, y - s, 2 * s, 2 * s);
      }
      if (t.capital && !pic) { px.strokeStyle = `rgba(${c.join(',')},0.8)`; px.beginPath(); px.arc(x, y, s * 1.9, 0, Math.PI * 2); px.stroke(); }
      if (will && t.role && leadOf(townLean(t)) !== t.role) {   // it builds against its role: a mark of the vector it leans to
        const o = ROLE_COLORS[leadOf(townLean(t))]; px.strokeStyle = `rgb(${o.join(',')})`; px.lineWidth = Math.max(this.minW, 0.6 * k);
        px.strokeRect(x - s * 1.6, y - s * 1.6, 3.2 * s, 3.2 * s);
      }
    }
  }

  // the realms' will (atlas/mind.js): a thread from each town to its seat — what it pays up and what is granted down,
  // thicker for a bigger town
  drawWill(a, px) {
    const k = this.unit(a);
    for (const t of a.towns) {
      if (!t.alive || t.realm == null || t.capital) continue;
      const I = byId(a), R = I.realm.get(t.realm), seat = R && I.town.get(R.capital);
      if (seat && !seat.alive) continue;
      if (!seat) continue;
      const c = t.role ? ROLE_COLORS[t.role] : ROLE_COLORS.seat;
      px.strokeStyle = `rgba(${c.join(',')},0.55)`; px.lineWidth = Math.max(this.minW, (0.2 + 0.15 * t.tier) * k);
      px.beginPath(); px.moveTo(t.x + 0.5, t.y + 0.5); px.lineTo(seat.x + 0.5, seat.y + 0.5); px.stroke();
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
      if (skin.art && ART.site(px, s, b, x, y, r, k, this.cam.S, a, close)) continue;   // the picture (render/art/)
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
      if (skin.art && ART.party(px, p, x, y, r, k, this.cam.S, a, dx / d)) continue;   // the picture (render/art/)
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
      if (skin.art && ART.ruin(px, ru, x, y, r, k, this.cam.S, a)) continue;   // the picture (render/art/)
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
      if (skin.art && ART.lair(px, l, L, x, y, sz, k, this.cam.S, a, ring)) continue;   // the picture (render/art/): its own ring
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
    const lairs = byId(a).lair;
    px.strokeStyle = 'rgba(225,232,240,0.35)'; px.lineWidth = Math.max(this.minW, 0.3 * k);
    px.beginPath();
    for (const l of a.lairs) { const lord = l.alive && l.lord != null ? lairs.get(l.lord) : null; if (lord?.alive && lord.leader) { px.moveTo(l.x + 0.5, l.y + 0.5); px.lineTo(lord.x + 0.5, lord.y + 0.5); } }
    px.stroke();
    px.strokeStyle = silver; px.lineWidth = Math.max(this.minW, 0.7 * k);
    for (const l of a.lairs) {
      if (!l.alive || !l.leader) continue;
      if (skin.art && ART.leader(px, l, l.x + 0.5, l.y + 0.5, sz, k, this.cam.S, a)) continue;
      px.beginPath(); px.arc(l.x + 0.5, l.y + 0.5, sz * 1.3, 0, Math.PI * 2); px.stroke();
    }
  }

  // the epic world (atlas/calamity.js): the sanctuary — a gold star; a calamity's boss — a gold ring round its lair;
  // the graves of the fallen bosses — a gold cross on a dark stone
  drawEpic(a, px) {
    const k = this.unit(a), sz = Math.max(2.2 / Math.pow(this.cam.zoom, 0.6), 3 * k), gold = 'rgba(255,214,90,0.95)', w = Math.max(this.minW, 0.5 * k);
    if (a.sanctuary?.i >= 0) {
      const x = a.sanctuary.i % a.w + 0.5, y = ((a.sanctuary.i / a.w) | 0) + 0.5;
      if (!(skin.art && ART.sanctuary(px, x, y, sz, k, this.cam.S, a))) {
      px.fillStyle = gold; px.strokeStyle = 'rgba(20,14,8,0.9)'; px.lineWidth = w;
      px.beginPath();
      for (let n = 0; n < 10; n++) { const r = n % 2 ? sz * 0.45 : sz, ang = -Math.PI / 2 + n * Math.PI / 5; px.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r); }
      px.closePath(); px.fill(); px.stroke();
      }
    }
    for (const l of a.lairs || []) {
      if (l.boss == null || !l.alive) continue;
      px.strokeStyle = gold; px.lineWidth = Math.max(this.minW, 0.9 * k);
      px.beginPath(); px.arc(l.x + 0.5, l.y + 0.5, sz * 1.6, 0, Math.PI * 2); px.stroke();
    }
    for (const g of a.graves || []) {
      const x = g.i % a.w + 0.5, y = ((g.i / a.w) | 0) + 0.5;
      if (skin.art && ART.grave(px, g, x, y, sz, k, this.cam.S, a)) continue;
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
}
