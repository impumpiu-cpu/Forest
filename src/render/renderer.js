// Canvas renderer. Every field is painted into its own offscreen canvas at 1 px per cell and
// scaled up: terrain crisp, fields smooth. Fire is added with 'lighter' for a glow; night darkens.
import {BY_CODE, T} from '../data/terrain.js';
import {SPECIES} from '../data/species.js';
import {FACTIONS} from '../data/factions.js';
import {BUILDINGS} from '../data/buildings.js';
import {RESOURCES} from '../data/resources.js';
import {nightness} from '../core/time.js';
import {clamp} from '../core/util.js';
import {DX, DY} from '../world/grid.js';
import {FAR} from '../nav/navigation.js';
import {LOOKS} from './looks.js';
import {ORE_BY_CODE} from '../data/ores.js';
import {season} from '../data/seasons.js';
import {CROPS} from '../data/crops.js';
import {PLANTS, plantLayer} from '../data/plants.js';

const PLANTS_TINT = PLANTS.all().map(p => ({key: plantLayer(p.id), tint: p.tint}));

const TSTOPS = [[-5, 52, 84, 196], [8, 64, 150, 186], [16, 104, 186, 102], [24, 222, 206, 84], [45, 240, 132, 46], [120, 220, 44, 40], [500, 255, 236, 214]];
function tempColor(t) {
  if (t <= TSTOPS[0][0]) return TSTOPS[0].slice(1);
  for (let k = 1; k < TSTOPS.length; k++) if (t <= TSTOPS[k][0]) {
    const a = TSTOPS[k - 1], b = TSTOPS[k], f = (t - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
  }
  return TSTOPS[TSTOPS.length - 1].slice(1);
}


function layer(w) {
  const c = document.createElement('canvas'); c.width = w.w; c.height = w.h;
  const ctx = c.getContext('2d'); return {c, ctx, img: ctx.createImageData(w.w, w.h)};
}

// the closest the camera comes: one cell this many CSS pixels wide
export const MAX_CELL_PX = 40;

export class Renderer {
  constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.ms = 0; this.S = 1; this.ox = 0; this.oy = 0; }

  setup(w) {
    this.w = w;
    this.terrain = layer(w); this.field = layer(w); this.glow = layer(w); this.smoke = layer(w); this.zoneTint = layer(w);
    this.tTerrain = -Infinity; this.tField = -Infinity; this.fieldKey = null; this.zoneVer = null;
  }

  // ── camera. view.cam = {zoom, cx, cy}: zoom 1 shows the whole map, (cx, cy) is the centre in cells.
  // Everything below draws in CSS pixels with one cell = this.S, shifted by (this.ox, this.oy).
  size() { return [this.cv.clientWidth || 1, this.cv.clientHeight || 1]; }
  fitScale(w) { const [cw, ch] = this.size(); return Math.min(cw / w.w, ch / w.h); }
  maxZoom(w) { return Math.max(1, MAX_CELL_PX / this.fitScale(w)); }

  // keep the zoom within limits and the map on screen; a map smaller than the view stays centred
  clampCam(w, cam) {
    const [cw, ch] = this.size();
    cam.zoom = clamp(cam.zoom, 1, this.maxZoom(w));
    const S = this.fitScale(w) * cam.zoom;
    const hx = cw / 2 / S, hy = ch / 2 / S;
    cam.cx = w.w <= 2 * hx ? w.w / 2 : clamp(cam.cx, hx, w.w - hx);
    cam.cy = w.h <= 2 * hy ? w.h / 2 : clamp(cam.cy, hy, w.h - hy);
    this.S = S; this.ox = cw / 2 - cam.cx * S; this.oy = ch / 2 - cam.cy * S;
  }

  // a point on the canvas (CSS pixels from its top-left corner) → map coordinates in cells
  toCell(px, py) { return [(px - this.ox) / this.S, (py - this.oy) / this.S]; }

  // zoom by `factor`, keeping the map point under (px, py) where it is
  zoomAt(w, cam, factor, px, py) {
    this.clampCam(w, cam);
    const [mx, my] = this.toCell(px, py), [cw, ch] = this.size();
    cam.zoom = clamp(cam.zoom * factor, 1, this.maxZoom(w));
    const S = this.fitScale(w) * cam.zoom;
    cam.cx = mx - (px - cw / 2) / S; cam.cy = my - (py - ch / 2) / S;
    this.clampCam(w, cam);
  }

  pan(w, cam, dx, dy) { this.clampCam(w, cam); cam.cx -= dx / this.S; cam.cy -= dy / this.S; this.clampCam(w, cam); }

  paintTerrain(w) {
    const d = this.terrain.img.data, g = w.grid;
    // the season tints grass and forest: autumn gold, winter snow (water freezes white at the edges only)
    const [tr, tg, tb, tk] = season(w).tint, wet = season(w).snow;
    for (let i = 0; i < w.n; i++) {
      let [r, gg, b] = BY_CODE[g.terr[i]].color(g.hgt[i], g.fert[i], g.wood[i]);
      const ore = g.ore?.[i];
      if (ore) { const c = ORE_BY_CODE[ore].tint, k = 0.55; r = r * (1 - k) + c[0] * k; gg = gg * (1 - k) + c[1] * k; b = b * (1 - k) + c[2] * k; }
      for (const p of PLANTS_TINT) { const v = g[p.key]?.[i]; if (v > 0.2) { const k = v * 0.6; r = r * (1 - k) + p.tint[0] * k; gg = gg * (1 - k) + p.tint[1] * k; b = b * (1 - k) + p.tint[2] * k; } }
      if (g.bush[i] && g.food[i] > 0.2) { const k = g.food[i] * 0.55; r = r * (1 - k) + 196 * k; gg = gg * (1 - k) + 92 * k; b = b * (1 - k) + 149 * k; }
      if (tk && (g.terr[i] === T.GRASS || g.terr[i] === T.FOREST || g.terr[i] === T.BURNT || (wet && g.terr[i] === T.ROCK))) {
        const k = g.terr[i] === T.FOREST ? tk * 0.7 : tk;
        r = r * (1 - k) + tr * k; gg = gg * (1 - k) + tg * k; b = b * (1 - k) + tb * k;
      }
      const o = i * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    this.terrain.ctx.putImageData(this.terrain.img, 0, 0);
  }

  paintGlowSmoke(w) {
    const gd = this.glow.img.data, sd = this.smoke.img.data, g = w.grid;
    for (let i = 0; i < w.n; i++) {
      const f = g.fire[i], o = i * 4, hot = clamp((g.temp[i] - 60) / 400, 0, 1);
      gd[o] = 255; gd[o + 1] = 120 + f * 90; gd[o + 2] = 40 + f * 40; gd[o + 3] = Math.min(255, f * 255 + hot * 120);
      const sm = Math.min(1, g.smoke[i] * 0.6); sd[o] = 150; sd[o + 1] = 150; sd[o + 2] = 144; sd[o + 3] = sm * 190;
    }
    this.glow.ctx.putImageData(this.glow.img, 0, 0); this.smoke.ctx.putImageData(this.smoke.img, 0, 0);
  }

  paintField(w, mode, view) {
    const d = this.field.img.data, g = w.grid, dCamp = w.nav.get('camp');
    const shown = RESOURCES.filter(r => r.map && !view.resHidden.has(r.id));
    for (let i = 0; i < w.n; i++) {
      const o = i * 4; let r = 0, gg = 0, b = 0, a = 0;
      if (mode === 'temp') { [r, gg, b] = tempColor(g.temp[i]); a = 205; }
      else if (mode === 'res') {
        // the strongest of the resources switched on in the filter; everything else is dimmed
        let best = 0.05, col = null;
        for (const res of shown) { const v = res.map(w, i); if (v > best) { best = v; col = res.mapColor; } }
        if (col) { [r, gg, b] = col; a = 70 + best * 180; } else { r = 20; gg = 20; b = 16; a = 165; }
      } else if (mode === 'nav') {
        const v = dCamp[i];
        if (v >= FAR) { r = 20; gg = 16; b = 16; a = 170; }
        else { const band = Math.floor(v / 8) % 2, k = clamp(v / 140, 0, 1); r = 98 + 120 * k; gg = 198 - 90 * k; b = 185 - 100 * k; a = band ? 120 : 70; }
      }
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = a;
    }
    this.field.ctx.putImageData(this.field.img, 0, 0);
  }

  draw(w, view) {
    const t0 = performance.now(), ctx = this.ctx;
    // the canvas follows its box; its backing store is in device pixels for a crisp picture
    const dpr = window.devicePixelRatio || 1, [cw, ch] = this.size();
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (this.cv.width !== bw || this.cv.height !== bh) { this.cv.width = bw; this.cv.height = bh; }
    this.clampCam(w, view.cam);
    const S = this.S, Wpx = w.w * S, Hpx = w.h * S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0f0a'; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(dpr, 0, 0, dpr, this.ox * dpr, this.oy * dpr);
    // terrain and the overlay layers change slowly: repaint them a few times a second, not every frame
    // (fire glow and smoke stay per frame)
    if (t0 - this.tTerrain > 200) { this.paintTerrain(w); this.tTerrain = t0; }
    this.paintGlowSmoke(w);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.terrain.c, 0, 0, Wpx, Hpx);
    ctx.imageSmoothingEnabled = true;
    if (view.layer !== 'world') {
      const key = view.layer + ':' + [...view.resHidden].join(',');
      if (t0 - this.tField > 150 || this.fieldKey !== key) { this.paintField(w, view.layer, view); this.tField = t0; this.fieldKey = key; }
      ctx.drawImage(this.field.c, 0, 0, Wpx, Hpx); }
    ctx.drawImage(this.smoke.c, 0, 0, Wpx, Hpx);

    const night = nightness(w.tick);
    if (view.layer === 'world' && night > 0) { ctx.fillStyle = `rgba(8,12,30,${night * 0.62})`; ctx.fillRect(0, 0, Wpx, Hpx); }
    if (w.weather.rain > 0.05) this.drawRain(w, Wpx, Hpx);

    // light: fire glow (crisp + soft halo) and the campfire
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glow.c, 0, 0, Wpx, Hpx);
    ctx.globalAlpha = 0.55; ctx.drawImage(this.glow.c, -S * 1.5, -S * 1.5, Wpx + S * 3, Hpx + S * 3); ctx.globalAlpha = 1;
    const cx = (w.camp.x + 0.5) * S, cy = (w.camp.y + 0.5) * S;
    if (w.campLit) {
      const fl = 0.9 + Math.random() * 0.1, gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, S * 9 * fl);
      gr.addColorStop(0, `rgba(255,160,70,${0.55 + night * 0.25})`); gr.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, S * 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(231,227,207,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, S * 3.4, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.fillStyle = w.campLit ? '#ffb15a' : '#5a4a3a'; ctx.beginPath(); ctx.arc(cx, cy, S * 0.55, 0, Math.PI * 2); ctx.fill();

    if (view.layer === 'nav') this.drawArrows(w);
    this.drawZone(w);
    this.drawBuildings(w);
    this.drawPick(w, view);
    this.drawAgents(w, view.selected);
    this.drawShots(w);
    this.ms = this.ms * 0.9 + (performance.now() - t0) * 0.1;
  }

  // the settlement zone: a soft tint inside and a dashed rim along its merged edge
  // (the tint is a 1-pixel-per-cell layer, the rim a path in cell units: both fit any zoom)
  drawZone(w) {
    if (this.zoneVer !== w.zoneVersion) {
      this.zoneVer = w.zoneVersion;
      const d = this.zoneTint.img.data, W = w.w, H = w.h;
      for (let i = 0; i < w.n; i++) { const o = i * 4; d[o] = 231; d[o + 1] = 227; d[o + 2] = 207; d[o + 3] = w.zone[i] ? 13 : 0; }
      this.zoneTint.ctx.putImageData(this.zoneTint.img, 0, 0);
      const p = new Path2D();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!w.zone[y * W + x]) continue;
        if (x === 0 || !w.zone[y * W + x - 1]) { p.moveTo(x, y); p.lineTo(x, y + 1); }
        if (x === W - 1 || !w.zone[y * W + x + 1]) { p.moveTo(x + 1, y); p.lineTo(x + 1, y + 1); }
        if (y === 0 || !w.zone[(y - 1) * W + x]) { p.moveTo(x, y); p.lineTo(x + 1, y); }
        if (y === H - 1 || !w.zone[(y + 1) * W + x]) { p.moveTo(x, y + 1); p.lineTo(x + 1, y + 1); }
      }
      this.zoneRim = p;
    }
    const ctx = this.ctx, S = this.S;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.zoneTint.c, 0, 0, w.w * S, w.h * S); ctx.imageSmoothingEnabled = true;
    ctx.save(); ctx.scale(S, S);
    ctx.strokeStyle = 'rgba(231,227,207,0.5)'; ctx.lineWidth = 1.2 / S; ctx.setLineDash([3 / S, 3 / S]);
    ctx.stroke(this.zoneRim); ctx.restore();
  }

  // arrows and sling stones in flight, fading
  drawShots(w) {
    const ctx = this.ctx, S = this.S;
    for (const f of w.fx) {
      const k = f.t / 8, x2 = f.x2 * S, y2 = f.y2 * S, x1 = f.x1 * S, y1 = f.y1 * S;
      const hx = x1 + (x2 - x1) * (1 - k), hy = y1 + (y2 - y1) * (1 - k);
      ctx.strokeStyle = f.kind === 'arrow' ? `rgba(240,225,180,${k})` : `rgba(200,195,180,${k})`;
      ctx.lineWidth = f.kind === 'arrow' ? 1.4 : 1; ctx.beginPath();
      if (f.kind === 'arrow') { const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1; ctx.moveTo(hx - dx / l * S * 1.2, hy - dy / l * S * 1.2); ctx.lineTo(hx, hy); }
      else { ctx.arc(hx, hy, Math.max(1.2, S * 0.18), 0, Math.PI * 2); }
      ctx.stroke();
    }
  }

  drawRain(w, Wpx, Hpx) {
    const ctx = this.ctx, r = w.weather.rain;
    if (season(w).snow) {   // snow: slow white flakes
      ctx.fillStyle = `rgba(235,240,250,${r * 0.12})`; ctx.fillRect(0, 0, Wpx, Hpx);
      ctx.fillStyle = `rgba(250,252,255,${0.4 + r * 0.5})`;
      const n = Math.round(r * 320), off = (w.tick * 2) % 600;
      for (let k = 0; k < n; k++) { const x = (k * 97.3 + Math.sin(k + w.tick * 0.05) * 6) % Wpx, y = (k * 53.1 + off) % Hpx; ctx.fillRect(x, y, 2, 2); }
      return;
    }
    ctx.fillStyle = `rgba(40,60,90,${r * 0.18})`; ctx.fillRect(0, 0, Wpx, Hpx);
    ctx.strokeStyle = `rgba(190,210,235,${r * 0.35})`; ctx.lineWidth = 1; ctx.beginPath();
    const n = Math.round(r * 260), off = (w.tick * 7) % 40;
    for (let k = 0; k < n; k++) {
      const x = ((k * 97.3) % Wpx), y = ((k * 53.1 + off * 9) % Hpx);
      ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9);
    }
    ctx.stroke();
  }

  drawArrows(w) {
    const ctx = this.ctx, S = this.S, dCamp = w.nav.get('camp');
    ctx.strokeStyle = 'rgba(240,236,220,0.75)'; ctx.lineWidth = 1;
    for (let y = 2; y < w.h; y += 4) for (let x = 2; x < w.w; x += 4) {
      const i = y * w.w + x; if (dCamp[i] >= FAR || dCamp[i] === 0) continue;
      let bj = -1, bd = dCamp[i];
      for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue; const j = ny * w.w + nx; if (dCamp[j] < bd) { bd = dCamp[j]; bj = j; } }
      if (bj < 0) continue;
      const ddx = (bj % w.w) - x, ddy = ((bj / w.w) | 0) - y, l = Math.hypot(ddx, ddy);
      const px = (x + 0.5) * S, py = (y + 0.5) * S, ux = ddx / l, uy = ddy / l, L = S * 1.4;
      ctx.beginPath(); ctx.moveTo(px - ux * L, py - uy * L); ctx.lineTo(px + ux * L, py + uy * L);
      ctx.lineTo(px + ux * L - (ux * 0.8 - uy * 0.5) * S * 0.8, py + uy * L - (uy * 0.8 + ux * 0.5) * S * 0.8); ctx.stroke();
    }
  }

  // finished buildings are solid blocks with a letter, sites are dashed with a progress bar
  drawBuildings(w) {
    const ctx = this.ctx, S = this.S;
    // field plots: ploughed earth, then the crop greening and ripening
    for (const b of w.buildings) {
      if (!b.plots || b.key !== 'field') continue;
      for (const p of b.plots) {
        const px = (p.i % w.w) * S, py = ((p.i / w.w) | 0) * S;
        let col = [92, 70, 48];
        if (p.crop) { const [c0, c1] = CROPS.get(p.crop).color, k = p.g; col = c0.map((v, j) => v + (c1[j] - v) * k); }
        ctx.fillStyle = `rgb(${col.map(v => v | 0).join(',')})`; ctx.fillRect(px + 1, py + 1, S - 2, S - 2);
        if (p.crop && p.g >= 1) { ctx.strokeStyle = '#f0e0a0'; ctx.lineWidth = 1; ctx.strokeRect(px + 1.5, py + 1.5, S - 3, S - 3); }
      }
    }
    for (const b of w.buildings) {
      const d = BUILDINGS.get(b.key), x = b.x * S, y = b.y * S, s = 2 * S;
      if (b.done) {
        ctx.fillStyle = d.color; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
        if (S >= 5) {
          ctx.fillStyle = '#14160f'; ctx.font = `bold ${clamp(S * 0.95, 8, 26)}px "PT Sans", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.mark, x + s / 2, y + s / 2 + 1);
          ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        }
      } else {
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = d.color; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2); ctx.restore();
        ctx.fillStyle = 'rgba(20,22,15,0.7)'; ctx.fillRect(x, y + s + 1, s, 3);
        ctx.fillStyle = d.color; ctx.fillRect(x, y + s + 1, s * Math.min(1, b.progress / d.work), 3);
      }
    }
  }

  // outline of the selected building or cell
  drawPick(w, view) {
    const ctx = this.ctx, S = this.S;
    let x, y, s;
    const b = view.selBld != null ? w.buildings.find(q => q.id === view.selBld) : null;
    if (b) { x = b.x * S; y = b.y * S; s = 2 * S; }
    else if (view.selCell != null && view.selCell >= 0) { x = (view.selCell % w.w) * S; y = ((view.selCell / w.w) | 0) * S; s = S; }
    else return;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, s + 4, s + 4);
  }

  drawAgents(w, selected) {
    const ctx = this.ctx, S = this.S;
    for (const a of w.agents) {
      const sp = SPECIES.get(a.species), look = sp.look, px = a.x * S, py = a.y * S;
      // grows with the zoom, but slower than the cells, so a close-up still shows the ground around it
      const r = Math.max(Math.min(S * look.size, 4 + S * 0.26), look.shape === 'person' ? 3.4 : 2.8);
      const color = look.color || FACTIONS.get(a.faction).color;
      if (a === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, Math.PI * 2); ctx.stroke(); }
      LOOKS[look.shape](ctx, a, px, py, r, color, S);
      if (a.flash) { ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.stroke(); }
      if (a.carry?.n > 0) { ctx.fillStyle = RESOURCES.get(Object.keys(a.carry.res)[0]).color; ctx.fillRect(px + r * 0.4, py - r * 1.1, Math.max(3, S * 0.55), Math.max(3, S * 0.55)); }
      if (a.hp < sp.hp * 0.999 && sp.sentient) {
        ctx.fillStyle = '#2a1414'; ctx.fillRect(px - S, py + r + 2, S * 2, 2);
        ctx.fillStyle = a.hp > sp.hp * 0.5 ? '#8fbf5a' : '#e0b040'; ctx.fillRect(px - S, py + r + 2, S * 2 * clamp(a.hp / sp.hp, 0, 1), 2);
      }
      if (a.task?.id === 'flee') { ctx.fillStyle = '#ffe0a0'; ctx.font = `bold ${Math.max(10, S * 1.6)}px "PT Sans", sans-serif`; ctx.fillText('!', px + r, py - r); }
    }
  }
}
