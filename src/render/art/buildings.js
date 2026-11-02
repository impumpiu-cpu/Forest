// The buildings of the local map (buildings/<id>.svg): seen from above and the front, the picture fills its lot and
// its roof stands a little over the lot's top edge. Being built, it is a pale ghost in scaffolding with the work done
// under it; a field or a pen is its fence of rails round the lot and its sign in the corner (the crops are drawn by
// the map as before, render/renderer.js).
import {drawSprite, hasSprite, cached, FIGURE, FULL} from './sprite.js';

const RISE = 0.14;   // how far over the lot's top the picture reaches, in its height

function picture(key, P, ghost) {
  return cached(`bld|${key}|${P}|${ghost ? 1 : 0}`, P, P, g => drawSprite(g, key, 0, 0, P / 100, {step: P < 40 ? FIGURE : FULL, minLine: 0.8, flags: new Set([ghost ? 'build' : 'done']), alpha: ghost ? 0.38 : 1}));
}

function progressBar(ctx, d, b, x, y, bw) {
  ctx.fillStyle = 'rgba(20,22,15,0.75)'; ctx.fillRect(x, y, bw, 4);
  ctx.fillStyle = d.color; ctx.fillRect(x, y, bw * Math.min(1, b.progress / d.work), 4);
}
function scaffold(ctx, x, y, bw, bh, S) {
  ctx.save();
  ctx.strokeStyle = '#231f20'; ctx.lineWidth = Math.max(2.2, S * 0.16); ctx.lineCap = 'round';
  const poles = () => { ctx.beginPath(); for (const k of [0.12, 0.5, 0.88]) { ctx.moveTo(x + bw * k, y + bh * 0.95); ctx.lineTo(x + bw * k, y + bh * 0.1); } ctx.moveTo(x + bw * 0.08, y + bh * 0.4); ctx.lineTo(x + bw * 0.92, y + bh * 0.4); ctx.moveTo(x + bw * 0.12, y + bh * 0.9); ctx.lineTo(x + bw * 0.5, y + bh * 0.4); ctx.stroke(); };
  poles(); ctx.strokeStyle = '#a5794a'; ctx.lineWidth = Math.max(1.2, S * 0.08); poles();
  ctx.restore();
}

export function drawBuilding(ctx, b, d, x, y, bw, bh, S) {
  const key = `buildings/${b.key}`;
  if (!hasSprite(key)) return false;
  if ((d.soil || d.pen) && (b.w || 2) > 2) {
    // the fence: rails round the lot, a post at every cell, the sign in the corner
    ctx.save();
    if (d.pen && b.done) { ctx.fillStyle = 'rgba(120,96,60,0.45)'; ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2); }
    if (!b.done) ctx.setLineDash([4, 4]);
    for (const [c, k] of [['#231f20', 0.2], ['#a5794a', 0.1]]) { ctx.strokeStyle = c; ctx.lineWidth = Math.max(k > 0.15 ? 3 : 1.5, S * k); ctx.strokeRect(x + 1, y + 1, bw - 2, bh - 2); }
    ctx.setLineDash([]);
    if (b.done && S >= 6) {
      ctx.fillStyle = '#5e4528'; ctx.strokeStyle = '#231f20'; ctx.lineWidth = 1;
      for (let k = 0; k <= b.w; k++) for (const yy of [y + 1, y + bh - 1]) { ctx.beginPath(); ctx.arc(x + Math.min(bw - 1, Math.max(1, k * S)), yy, Math.max(1.5, S * 0.1), 0, 7); ctx.fill(); ctx.stroke(); }
      for (let k = 1; k < b.h; k++) for (const xx of [x + 1, x + bw - 1]) { ctx.beginPath(); ctx.arc(xx, y + k * S, Math.max(1.5, S * 0.1), 0, 7); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();
    if (S >= 5) { const P = Math.round(Math.max(14, S * 1.5)); ctx.drawImage(picture(key, P, !b.done), x - P * 0.2, y - P * 0.45, P, P); }
    if (!b.done) progressBar(ctx, d, b, x, y + bh + 1, bw);
    return true;
  }
  const P = Math.round(bw), top = y - bh * RISE;
  ctx.drawImage(picture(key, P, !b.done), x, top, P, P);
  if (!b.done) { scaffold(ctx, x, top + bh * 0.1, bw, bh * 0.9, S); progressBar(ctx, d, b, x, y + bh + 1, bw); }
  // furniture (settlement/life.js): a gold pip for each piece, in the top corner
  if (b.furniture?.length && S >= 6) {
    ctx.fillStyle = '#e3c14a'; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 0.8;
    b.furniture.forEach((_, k) => { ctx.beginPath(); ctx.arc(x + bw - 3 - k * 4.5, top + 4, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  }
  return true;
}
