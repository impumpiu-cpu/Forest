// Canvas renderer. Every field is painted into its own offscreen canvas at 1 px per cell and
// scaled up: terrain crisp, fields smooth. Fire is added with 'lighter' for a glow; night darkens.
import {CARCASS} from '../view/local.js';
import {hpShare} from '../view/local.js';
import {BY_CODE, T, WALKABLE, isWater} from '../data/terrain.js';
import {airTemp} from '../view/local.js';
import {SPECIES, isSentient} from '../data/species.js';
import {FACTIONS} from '../data/factions.js';
import {BUILDINGS} from '../data/buildings.js';
import {RESOURCES} from '../data/resources.js';
import {nightness} from '../core/time.js';
import {clamp} from '../core/util.js';
import {DX, DY} from '../view/local.js';
import {FAR} from '../view/local.js';
import {LOOKS} from './looks.js';
import {skin} from './skin.js';
import {ART} from './art/index.js';
import {drawMinds} from './minds.js';
import {Camera} from './camera.js';
import {ORE_BY_CODE} from '../data/ores.js';
import {seasonTint, snowy} from '../data/seasons.js';
import {CROPS} from '../data/crops.js';
import {PLANTS, plantLayer} from '../data/plants.js';

// the plants' tints of the ground (data/plants.js), read at each paint: the tables' edits are seen at once
const plantsTint = () => PLANTS.all().map(p => ({key: plantLayer(p.id), tint: p.tint}));

// fertility 0…1: pale clay → loam → dark humus with a green cast
const FSTOPS = [[0, 186, 150, 120], [0.3, 176, 130, 80], [0.5, 196, 176, 70], [0.7, 120, 168, 60], [0.85, 50, 130, 50], [1, 20, 90, 40]];
function soilColor(f) {
  for (let k = 1; k < FSTOPS.length; k++) if (f <= FSTOPS[k][0]) {
    const a = FSTOPS[k - 1], b = FSTOPS[k], t = (f - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
  }
  return FSTOPS[FSTOPS.length - 1].slice(1);
}

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

export {MAX_CELL_PX} from './camera.js';

export class Renderer {
  constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.ms = 0; this.S = 1; this.ox = 0; this.oy = 0; this.camera = new Camera(1, 1); }

  setup(w) {
    this.w = w;
    this.terrain = layer(w); this.field = layer(w); this.glow = layer(w); this.smoke = layer(w); this.zoneTint = layer(w);
    this.tTerrain = -Infinity; this.tField = -Infinity; this.fieldKey = null; this.zoneVer = null;
  }

  // ── camera. view.cam = {zoom, cx, cy}: zoom 1 shows the whole map, (cx, cy) is the centre in cells.
  // Everything below draws in CSS pixels with one cell = this.S, shifted by (this.ox, this.oy). The arithmetic is
  // render/camera.js's: the view's plain {zoom, cx, cy} goes through it and comes back clamped.
  size() { return [this.cv.clientWidth || 1, this.cv.clientHeight || 1]; }
  // run `fn` on the Camera with the view's position, then write the position and the scale back
  withCam(w, cam, fn) {
    const C = this.camera, [cw, ch] = this.size();
    C.w = w.w; C.h = w.h; C.zoom = cam.zoom; C.cx = cam.cx; C.cy = cam.cy;
    fn(C, cw, ch);
    cam.zoom = C.zoom; cam.cx = C.cx; cam.cy = C.cy; this.S = C.S; this.ox = C.ox; this.oy = C.oy;
  }

  // keep the zoom within limits and the map on screen; a map smaller than the view stays centred
  clampCam(w, cam) { this.withCam(w, cam, (C, cw, ch) => C.clamp(cw, ch)); }

  // a point on the canvas (CSS pixels from its top-left corner) → map coordinates in cells
  toCell(px, py) { return [(px - this.ox) / this.S, (py - this.oy) / this.S]; }

  // zoom by `factor`, keeping the map point under (px, py) where it is
  zoomAt(w, cam, factor, px, py) { this.withCam(w, cam, (C, cw, ch) => C.zoomAt(cw, ch, factor, px, py)); }

  pan(w, cam, dx, dy) { this.withCam(w, cam, (C, cw, ch) => C.pan(cw, ch, dx, dy)); }

  paintTerrain(w) {
    const shoreOf = (g, i, W, H) => { const x = i % W, y = (i / W) | 0; return (x > 0 && !isWater(g.terr[i - 1])) || (x < W - 1 && !isWater(g.terr[i + 1])) || (y > 0 && !isWater(g.terr[i - W])) || (y < H - 1 && !isWater(g.terr[i + W])); };
    const d = this.terrain.img.data, g = w.grid;
    // the season tints grass and forest: autumn gold, winter snow (water freezes white at the edges only)
    const PLANTS_TINT = plantsTint(), [tr, tg, tb, tk] = seasonTint(w), wet = (w.snow || 0) > 0.15, W = w.w;
    for (let i = 0; i < w.n; i++) {
      let [r, gg, b] = BY_CODE[g.terr[i]].color(g.hgt[i], g.fert[i], g.wood[i]);
      // the shore: water beside land is shallow and pale (an edge for the eye, not a kind of ground)
      if (g.terr[i] === T.WATER && shoreOf(g, i, W, w.h)) { r = r * 0.6 + 70; gg = gg * 0.6 + 80; b = b * 0.6 + 70; }
      const ore = g.ore?.[i];
      if (ore) { const c = ORE_BY_CODE[ore].tint, k = 0.55; r = r * (1 - k) + c[0] * k; gg = gg * (1 - k) + c[1] * k; b = b * (1 - k) + c[2] * k; }
      for (const p of PLANTS_TINT) { const v = g[p.key]?.[i]; if (v > 0.2) { const k = v * 0.6; r = r * (1 - k) + p.tint[0] * k; gg = gg * (1 - k) + p.tint[1] * k; b = b * (1 - k) + p.tint[2] * k; } }
      if (g.bush[i] && g.food[i] > 0.2) { const k = g.food[i] * 0.55; r = r * (1 - k) + 196 * k; gg = gg * (1 - k) + 92 * k; b = b * (1 - k) + 149 * k; }
      if (tk && (BY_CODE[g.terr[i]].tint || (wet && g.terr[i] === T.ROCK))) {
        const k = g.terr[i] === T.FOREST ? tk * 0.7 : tk;
        r = r * (1 - k) + tr * k; gg = gg * (1 - k) + tg * k; b = b * (1 - k) + tb * k;
      }
      const o = i * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    this.terrain.ctx.putImageData(this.terrain.img, 0, 0);
  }

  paintGlowSmoke(w) {
    const gd = this.glow.img.data, sd = this.smoke.img.data, g = w.grid, amb = airTemp(w);
    for (let i = 0; i < w.n; i++) {
      const f = g.fire[i], o = i * 4, hot = clamp((amb + g.heat[i] - 60) / 400, 0, 1);
      gd[o] = 255; gd[o + 1] = 120 + f * 90; gd[o + 2] = 40 + f * 40; gd[o + 3] = Math.min(255, f * 255 + hot * 120);
      const sm = Math.min(1, g.smoke[i] * 0.6); sd[o] = 150; sd[o + 1] = 150; sd[o + 2] = 144; sd[o + 3] = sm * 190;
    }
    this.glow.ctx.putImageData(this.glow.img, 0, 0); this.smoke.ctx.putImageData(this.smoke.img, 0, 0);
  }

  paintField(w, mode, view) {
    const d = this.field.img.data, g = w.grid, dCamp = w.nav.get('camp'), amb = airTemp(w);
    const shown = RESOURCES.filter(r => r.map && !view.resHidden.has(r.id));
    for (let i = 0; i < w.n; i++) {
      const o = i * 4; let r = 0, gg = 0, b = 0, a = 0;
      if (mode === 'temp') { [r, gg, b] = tempColor(amb + g.heat[i]); a = 205; }
      else if (mode === 'res') {
        // the strongest of the resources switched on in the filter; everything else is dimmed
        let best = 0.05, col = null;
        for (const res of shown) { const v = res.map(w, i); if (v > best) { best = v; col = res.mapColor; } }
        if (col) { [r, gg, b] = col; a = 70 + best * 180; } else { r = 20; gg = 20; b = 16; a = 165; }
      } else if (mode === 'soil') {
        // fertility: grey-brown poor ground → dark rich green; water and rock blacked out
        if (!WALKABLE[g.terr[i]]) { r = 14; gg = 16; b = 14; a = 200; }
        else { const f = g.fert[i]; [r, gg, b] = soilColor(f); a = 215; }
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
    // with nothing burning, smoking or hot the two layers are empty: paint them clear once, then skip them
    const st = w.stats, calm = !st.anyFire && (st.smokeMax ?? 1) <= 0 && (st.tempMax ?? Infinity) <= 60;
    if (!calm || !this.glowCalm || this.glowFor !== w) { this.paintGlowSmoke(w); this.glowCalm = calm; this.glowFor = w; }
    const lit = !this.glowCalm;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.terrain.c, 0, 0, Wpx, Hpx);
    ctx.imageSmoothingEnabled = true;
    if (view.layer !== 'world') {
      const key = view.layer + ':' + [...view.resHidden].join(',');
      if (t0 - this.tField > 150 || this.fieldKey !== key) { this.paintField(w, view.layer, view); this.tField = t0; this.fieldKey = key; }
      ctx.drawImage(this.field.c, 0, 0, Wpx, Hpx); }
    if (lit) ctx.drawImage(this.smoke.c, 0, 0, Wpx, Hpx);

    const night = nightness(w);
    if (view.layer === 'world' && night > 0) { ctx.fillStyle = `rgba(8,12,30,${night * 0.62})`; ctx.fillRect(0, 0, Wpx, Hpx); }
    if (w.weather.rain > 0.05) this.drawRain(w, Wpx, Hpx);

    // light: fire glow (crisp + soft halo) and the campfire
    ctx.globalCompositeOperation = 'lighter';
    if (lit) {
      ctx.drawImage(this.glow.c, 0, 0, Wpx, Hpx);
      ctx.globalAlpha = 0.55; ctx.drawImage(this.glow.c, -S * 1.5, -S * 1.5, Wpx + S * 3, Hpx + S * 3); ctx.globalAlpha = 1;
    }
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
    if (w.works?.length) this.drawWorks(w);
    this.drawPick(w, view);
    this.drawAgents(w, view.selected);
    this.drawShots(w);
    // what the overmind has posted (render/minds.js): over everything, in screen-sized icons; their boxes for a click
    this.mindHits = drawMinds(ctx, w, S, view);
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
    if (snowy(w)) {   // snow: slow white flakes
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

  // The caravan's camp set up for the night (campaign/works.js): the cart by the fire, the tether's posts and rope, the
  // poles with hides, the spit, the smoking rack, the stakes — drawn as small things on the ground, in the making dashed
  drawWorks(w) {
    const ctx = this.ctx, S = this.S, dark = '#2a2016', wood = '#8a6a3c', post = '#5a4428';
    const pole = (x, y, h = 0.9) => { ctx.fillStyle = post; ctx.fillRect(x - S * 0.08, y - S * h, S * 0.16, S * h); };
    for (const x of w.works) {
      const px = x.x * S, py = x.y * S, k = x.done ? 1 : Math.min(1, x.progress / x.ticks);
      ctx.save();
      if (!x.done) ctx.globalAlpha = 0.35 + 0.65 * k;
      if (x.key === 'stakes') {
        // sharpened poles leaning out from the fire
        const i = x.cells[0], cxp = ((i % w.w) + 0.5) * S, cyp = (((i / w.w) | 0) + 0.5) * S, ang = Math.atan2(cyp - (w.camp.y + 0.5) * S, cxp - (w.camp.x + 0.5) * S);
        ctx.strokeStyle = x.done ? wood : 'rgba(138,106,60,0.6)'; ctx.lineWidth = Math.max(1.2, S * 0.14); ctx.lineCap = 'round';
        for (let m = -1; m <= 1; m++) {
          const ox = Math.cos(ang + Math.PI / 2) * m * S * 0.3, oy = Math.sin(ang + Math.PI / 2) * m * S * 0.3;
          ctx.beginPath(); ctx.moveTo(cxp + ox - Math.cos(ang) * S * 0.3, cyp + oy - Math.sin(ang) * S * 0.3); ctx.lineTo(cxp + ox + Math.cos(ang) * S * 0.45, cyp + oy + Math.sin(ang) * S * 0.45 - S * 0.25); ctx.stroke();
        }
      } else if (x.key === 'wagon') {
        // the cart: a box on two wheels, the shafts toward the fire
        const bw = S * 1.7, bh = S * 0.9;
        ctx.fillStyle = wood; ctx.fillRect(px - bw / 2, py - bh / 2 - S * 0.2, bw, bh);
        ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.strokeRect(px - bw / 2, py - bh / 2 - S * 0.2, bw, bh);
        ctx.fillStyle = '#c9b48a'; ctx.fillRect(px - bw / 2 + 2, py - bh / 2 - S * 0.2 + 2, bw - 4, bh * 0.5);   // the load under its cloth
        ctx.fillStyle = dark; for (const dx of [-0.55, 0.55]) { ctx.beginPath(); ctx.arc(px + dx * S, py + bh * 0.35, S * 0.3, 0, Math.PI * 2); ctx.fill(); }
      } else if (x.key === 'tether') {
        // posts with a rope between them, the beasts' hay at their feet
        const a = x.cells[0], b = x.cells[x.cells.length - 1], ax = ((a % w.w) + 0.5) * S, ay = (((a / w.w) | 0) + 0.5) * S, bx = ((b % w.w) + 0.5) * S, by = (((b / w.w) | 0) + 0.5) * S;
        pole(ax, ay); pole(bx, by);
        if (x.done) { ctx.strokeStyle = '#d8c89a'; ctx.lineWidth = Math.max(1, S * 0.08); ctx.beginPath(); ctx.moveTo(ax, ay - S * 0.75); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - S * 0.55, bx, by - S * 0.75); ctx.stroke(); }
      } else if (x.key === 'racks') {
        // two poles with a hide stretched between them
        const a = x.cells[0], b = x.cells[x.cells.length - 1], ax = ((a % w.w) + 0.5) * S, ay = (((a / w.w) | 0) + 0.5) * S, bx = ((b % w.w) + 0.5) * S, by = (((b / w.w) | 0) + 0.5) * S;
        pole(ax, ay, 1.1); pole(bx, by, 1.1);
        if (x.done) { ctx.fillStyle = '#b08a5a'; ctx.beginPath(); ctx.moveTo(ax + S * 0.1, ay - S * 1.0); ctx.lineTo(bx - S * 0.1, by - S * 1.0); ctx.lineTo(bx - S * 0.2, by - S * 0.35); ctx.lineTo(ax + S * 0.2, ay - S * 0.35); ctx.closePath(); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 0.8; ctx.stroke(); }
      } else if (x.key === 'spit') {
        // a spit on two forks beside the fire, the meat on it
        pole(px - S * 0.45, py + S * 0.2, 0.7); pole(px + S * 0.45, py + S * 0.2, 0.7);
        ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = Math.max(1, S * 0.08); ctx.beginPath(); ctx.moveTo(px - S * 0.55, py - S * 0.45); ctx.lineTo(px + S * 0.55, py - S * 0.45); ctx.stroke();
        if (x.done) { ctx.fillStyle = '#a0563c'; ctx.beginPath(); ctx.ellipse(px, py - S * 0.45, S * 0.3, S * 0.16, 0, 0, Math.PI * 2); ctx.fill(); }
      } else if (x.key === 'smoke') {
        // a rack over a smouldering pit, smoke above it
        pole(px - S * 0.4, py + S * 0.3, 0.9); pole(px + S * 0.4, py + S * 0.3, 0.9);
        ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = Math.max(1, S * 0.08); ctx.beginPath(); ctx.moveTo(px - S * 0.5, py - S * 0.5); ctx.lineTo(px + S * 0.5, py - S * 0.5); ctx.stroke();
        ctx.fillStyle = '#4a3a2a'; ctx.beginPath(); ctx.ellipse(px, py + S * 0.3, S * 0.4, S * 0.18, 0, 0, Math.PI * 2); ctx.fill();
        if (x.done) { ctx.fillStyle = 'rgba(200,200,190,0.45)'; for (let m = 0; m < 3; m++) { ctx.beginPath(); ctx.arc(px + Math.sin(w.tick / 9 + m * 2) * S * 0.2, py - S * (0.8 + m * 0.35), S * (0.18 + m * 0.08), 0, Math.PI * 2); ctx.fill(); } }
      }
      ctx.restore();
      if (!x.done && S >= 5) { ctx.fillStyle = 'rgba(20,22,15,0.7)'; ctx.fillRect(px - S * 0.6, py + S * 0.55, S * 1.2, 3); ctx.fillStyle = '#d8b25a'; ctx.fillRect(px - S * 0.6, py + S * 0.55, S * 1.2 * k, 3); }
    }
  }

  // Buildings: a lived-in or working building is a solid block with its letter; a plot of land
  // (`soil: true` — fields, gardens) is drawn as land: ploughed earth with the crop greening and
  // ripening, or berry bushes (painted on the terrain), inside a fence of thin rails. Sites are dashed
  // with a progress bar. Old 2×2 fields from earlier saves draw their scattered plots the same way.
  drawBuildings(w) {
    const ctx = this.ctx, S = this.S;
    for (const b of w.buildings) {
      if (!b.plots || b.key !== 'field') continue;
      for (const p of b.plots) {
        const px = (p.i % w.w) * S, py = ((p.i / w.w) | 0) * S;
        let col = [92, 70, 48];
        if (p.crop) { const [c0, c1] = CROPS.get(p.crop).color, k = p.g; col = c0.map((v, j) => v + (c1[j] - v) * k); }
        ctx.fillStyle = `rgb(${col.map(v => v | 0).join(',')})`; ctx.fillRect(px, py, S, S);
        if (S >= 6) {   // furrows
          ctx.strokeStyle = 'rgba(30,22,12,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
          for (let k = 1; k < 3; k++) { ctx.moveTo(px + 1, py + S * k / 3); ctx.lineTo(px + S - 1, py + S * k / 3); }
          ctx.stroke();
        }
        if (p.crop && p.g >= 1) { ctx.strokeStyle = '#f0e0a0'; ctx.lineWidth = 1; ctx.strokeRect(px + 1.5, py + 1.5, S - 3, S - 3); }
      }
    }
    for (const b of w.buildings) {
      const d = BUILDINGS.get(b.key), x = b.x * S, y = b.y * S, bw = (b.w || 2) * S, bh = (b.h || 2) * S;
      if (skin.art && ART.building(ctx, b, d, x, y, bw, bh, S, w)) continue;   // the picture (render/art/)
      if ((d.soil || d.pen) && (b.w || 2) > 2) {
        // a fence of rails around the plot of land, the mark in its corner; a pen is trampled ground
        // with posts along the rails
        if (d.pen && b.done) {
          ctx.fillStyle = 'rgba(120,96,60,0.45)'; ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
          if (S >= 6) { ctx.fillStyle = '#4a3720'; for (let k = 0; k <= b.w; k++) for (const yy of [y, y + bh]) ctx.fillRect(x + k * S - 1.5, yy - 1.5, 3, 3); for (let k = 1; k < b.h; k++) for (const xx of [x, x + bw]) ctx.fillRect(xx - 1.5, y + k * S - 1.5, 3, 3); }
        }
        ctx.save();
        if (!b.done) ctx.setLineDash([3, 3]);
        ctx.strokeStyle = b.done ? '#6b4f2c' : d.color; ctx.lineWidth = Math.max(1.5, S * 0.12);
        ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
        ctx.restore();
        if (b.done && S >= 7) {
          ctx.fillStyle = 'rgba(20,22,15,0.75)'; ctx.fillRect(x + 2, y + 2, S * 1.2, S * 0.9);
          ctx.fillStyle = '#efe6cf'; ctx.font = `bold ${clamp(S * 0.7, 8, 18)}px "PT Sans", sans-serif`;
          ctx.textBaseline = 'middle'; ctx.fillText(d.mark, x + 3, y + 2 + S * 0.45); ctx.textBaseline = 'alphabetic';
        }
        if (!b.done) {
          ctx.fillStyle = 'rgba(20,22,15,0.7)'; ctx.fillRect(x, y + bh + 1, bw, 3);
          ctx.fillStyle = d.color; ctx.fillRect(x, y + bh + 1, bw * Math.min(1, b.progress / d.work), 3);
        }
        continue;
      }
      if (b.done) {
        ctx.fillStyle = d.color; ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
        if (S >= 5) {
          ctx.fillStyle = '#14160f'; ctx.font = `bold ${clamp(S * 0.95, 8, 26)}px "PT Sans", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.mark, x + bw / 2, y + bh / 2 + 1);
          ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        }
      } else {
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = d.color; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, bw - 2, bh - 2); ctx.restore();
        ctx.fillStyle = 'rgba(20,22,15,0.7)'; ctx.fillRect(x, y + bh + 1, bw, 3);
        ctx.fillStyle = d.color; ctx.fillRect(x, y + bh + 1, bw * Math.min(1, b.progress / d.work), 3);
      }
      // furniture: a gold pip for each piece in the top corner (settlement/life.js)
      if (b.furniture?.length && S >= 6) {
        ctx.fillStyle = '#e3c14a'; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 0.8;
        b.furniture.forEach((_, k) => { ctx.beginPath(); ctx.arc(x + bw - 3 - k * 4.5, y + 4, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      }
    }
    // graves: a low mound with a wooden cross; bodies not yet buried lie as grey shapes
    for (const gr of w.graves || []) {
      const gx = gr.x * S, gy = gr.y * S;
      ctx.fillStyle = 'rgba(90,70,48,0.85)'; ctx.beginPath(); ctx.ellipse(gx + S / 2, gy + S * 0.65, S * 0.35, S * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = gr.rite ? '#2a1d10' : '#5a4630'; ctx.lineWidth = Math.max(1.2, S * 0.12); ctx.beginPath();
      ctx.moveTo(gx + S / 2, gy + S * 0.15); ctx.lineTo(gx + S / 2, gy + S * 0.6); ctx.moveTo(gx + S * 0.32, gy + S * 0.3); ctx.lineTo(gx + S * 0.68, gy + S * 0.3); ctx.stroke();
    }
    // carcasses (agents/carcass.js): a dark red shape, fading as it is eaten; greenish once it rots
    for (const c of w.carcasses || []) {
      const rot = w.tick - c.t > CARCASS.rotFrom ? 1 : 0, k = 0.4 + 0.6 * Math.min(1, c.food / (c.food0 || 1));
      ctx.fillStyle = rot ? 'rgba(96,110,60,0.85)' : `rgba(120,32,28,${0.45 + 0.4 * k})`; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(c.x * S, c.y * S, Math.max(2.4, S * 0.38 * k), Math.max(1.4, S * 0.2), -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const c of w.corpses || []) {
      ctx.fillStyle = 'rgba(150,150,150,0.85)'; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(c.x * S, c.y * S, Math.max(3, S * 0.45), Math.max(1.6, S * 0.18), 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // outline of the selected building or cell
  drawPick(w, view) {
    const ctx = this.ctx, S = this.S;
    let x, y, sw, sh;
    const b = view.selBld != null ? w.buildings.find(q => q.id === view.selBld) : null;
    if (b) { x = b.x * S; y = b.y * S; sw = (b.w || 2) * S; sh = (b.h || 2) * S; }
    else if (view.selCell != null && view.selCell >= 0) { x = (view.selCell % w.w) * S; y = ((view.selCell / w.w) | 0) * S; sw = sh = S; }
    else return;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, sw + 4, sh + 4);
  }

  drawAgents(w, selected) {
    const ctx = this.ctx, S = this.S;
    for (const a of w.agents) {
      const sp = SPECIES.get(a.species), look = sp.look, px = a.x * S, py = a.y * S;
      // grows with the zoom, but slower than the cells, so a close-up still shows the ground around it
      const r = Math.max(Math.min(S * look.size, 4 + S * 0.26), look.shape === 'person' ? 3.4 : 2.8);
      const color = look.color || FACTIONS.get(a.faction).color;
      if (a === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, Math.PI * 2); ctx.stroke(); }
      // the picture (render/art/: it marks its own state), else the plain look;
      // a rider (agents/mount.js): its beast under it, the rider a little above
      const pic = skin.art && ART.agent(ctx, a, px, py, r, color, S, w);
      if (pic) { /* drawn */ } else if (a.mount?.hp > 0) { const ml = SPECIES.get(a.mount.species).look, mr = Math.max(Math.min(S * ml.size, 4 + S * 0.26), 2.8); LOOKS[ml.shape](ctx, a, px, py + r * 0.3, mr, ml.color || color, S); LOOKS[look.shape](ctx, a, px, py - mr * 0.6, r * 0.85, color, S); }
      else LOOKS[look.shape](ctx, a, px, py, r, color, S);
      if (a.flash) { ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.stroke(); }
      if (a.carry?.n > 0) { ctx.fillStyle = RESOURCES.get(Object.keys(a.carry.res)[0]).color; ctx.fillRect(px + r * 0.4, py - r * 1.1, Math.max(3, S * 0.55), Math.max(3, S * 0.55)); }
      if (hpShare(a) < 0.999 && isSentient(sp)) {
        ctx.fillStyle = '#2a1414'; ctx.fillRect(px - S, py + r + 2, S * 2, 2);
        ctx.fillStyle = hpShare(a) > 0.5 ? '#8fbf5a' : '#e0b040'; ctx.fillRect(px - S, py + r + 2, S * 2 * clamp(hpShare(a), 0, 1), 2);
      }
      if (a.task?.id === 'flee' && !pic) { ctx.fillStyle = '#ffe0a0'; ctx.font = `bold ${Math.max(10, S * 1.6)}px "PT Sans", sans-serif`; ctx.fillText('!', px + r, py - r); }
    }
  }
}
