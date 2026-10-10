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

export class Renderer {
  constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.ms = 0; }

  setup(w) {
    this.S = Math.max(4, Math.floor(1024 / w.w));
    this.cv.width = w.w * this.S; this.cv.height = w.h * this.S;
    this.terrain = layer(w); this.field = layer(w); this.glow = layer(w); this.smoke = layer(w);
  }

  paintTerrain(w) {
    const d = this.terrain.img.data, g = w.grid;
    for (let i = 0; i < w.n; i++) {
      let [r, gg, b] = BY_CODE[g.terr[i]].color(g.hgt[i], g.fert[i], g.wood[i]);
      if (g.bush[i] && g.food[i] > 0.2) { const k = g.food[i] * 0.55; r = r * (1 - k) + 196 * k; gg = gg * (1 - k) + 92 * k; b = b * (1 - k) + 149 * k; }
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

  paintField(w, mode) {
    const d = this.field.img.data, g = w.grid, dCamp = w.nav.get('camp');
    for (let i = 0; i < w.n; i++) {
      const o = i * 4; let r = 0, gg = 0, b = 0, a = 0;
      if (mode === 'temp') { [r, gg, b] = tempColor(g.temp[i]); a = 205; }
      else if (mode === 'res') {
        if (g.food[i] > 0.05) { r = 214; gg = 84; b = 160; a = 60 + g.food[i] * 190; }
        else if (g.terr[i] === T.FOREST) { r = 120; gg = 210; b = 90; a = g.wood[i] * 170; }
        else { r = 20; gg = 20; b = 16; a = 150; }
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
    const t0 = performance.now(), ctx = this.ctx, S = this.S, Wpx = w.w * S, Hpx = w.h * S;
    this.paintTerrain(w); this.paintGlowSmoke(w);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.terrain.c, 0, 0, Wpx, Hpx);
    ctx.imageSmoothingEnabled = true;
    if (view.layer !== 'world') { this.paintField(w, view.layer); ctx.drawImage(this.field.c, 0, 0, Wpx, Hpx); }
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
    this.drawAgents(w, view.selected);
    this.drawShots(w);
    this.ms = this.ms * 0.9 + (performance.now() - t0) * 0.1;
  }

  // the settlement zone: a soft tint inside and a dashed rim along its merged edge
  drawZone(w) {
    if (this.zoneVer !== w.zoneVersion) {
      this.zoneVer = w.zoneVersion;
      const c = this.zoneCanvas || (this.zoneCanvas = document.createElement('canvas'));
      c.width = this.cv.width; c.height = this.cv.height;
      const z = c.getContext('2d'), S = this.S, W = w.w, H = w.h;
      z.fillStyle = 'rgba(231,227,207,0.05)';
      for (let i = 0; i < w.n; i++) if (w.zone[i]) z.fillRect((i % W) * S, ((i / W) | 0) * S, S, S);
      z.strokeStyle = 'rgba(231,227,207,0.5)'; z.lineWidth = 1.2; z.setLineDash([3, 3]); z.beginPath();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!w.zone[y * W + x]) continue;
        const px = x * S, py = y * S;
        if (x === 0 || !w.zone[y * W + x - 1]) { z.moveTo(px, py); z.lineTo(px, py + S); }
        if (x === W - 1 || !w.zone[y * W + x + 1]) { z.moveTo(px + S, py); z.lineTo(px + S, py + S); }
        if (y === 0 || !w.zone[(y - 1) * W + x]) { z.moveTo(px, py); z.lineTo(px + S, py); }
        if (y === H - 1 || !w.zone[(y + 1) * W + x]) { z.moveTo(px, py + S); z.lineTo(px + S, py + S); }
      }
      z.stroke();
    }
    this.ctx.drawImage(this.zoneCanvas, 0, 0);
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
    for (const b of w.buildings) {
      const d = BUILDINGS.get(b.key), x = b.x * S, y = b.y * S, s = 2 * S;
      if (b.done) {
        ctx.fillStyle = d.color; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
        if (S >= 5) {
          ctx.fillStyle = '#14160f'; ctx.font = `bold ${Math.max(8, S * 0.95)}px "PT Sans", sans-serif`;
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

  drawAgents(w, selected) {
    const ctx = this.ctx, S = this.S;
    for (const a of w.agents) {
      const sp = SPECIES.get(a.species), look = sp.look, px = a.x * S, py = a.y * S;
      const r = Math.max(S * look.size, look.shape === 'person' ? 3.4 : 2.8);
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
