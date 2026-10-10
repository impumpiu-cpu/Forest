import {ITEMS} from '../data/items.js';

// How creatures are drawn. A species names its look in data/species.js (look.shape);
// a new shape is one more painter here.
// small marks for what is held in the hands, drawn beside the body
const GLYPHS = {
  club(ctx, x, y, r) { line(ctx, x, y + r * 0.6, x + r * 0.5, y - r * 0.8, '#8a6a3c', Math.max(1.5, r * 0.35)); },
  spear(ctx, x, y, r) { line(ctx, x, y + r, x + r * 0.2, y - r * 1.4, '#a5794a', 1.2); dot(ctx, x + r * 0.22, y - r * 1.45, Math.max(1, r * 0.22), '#ece6d2'); },
  axe(ctx, x, y, r) { line(ctx, x, y + r * 0.8, x + r * 0.2, y - r * 0.8, '#8a6a3c', 1.2); dot(ctx, x + r * 0.45, y - r * 0.7, Math.max(1.2, r * 0.3), '#ece6d2'); },
  shield(ctx, x, y, r) { ctx.fillStyle = '#7a5530'; ctx.strokeStyle = '#2b1d0e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, Math.max(1.8, r * 0.55), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); },
  staff(ctx, x, y, r) { line(ctx, x, y + r * 1.2, x + r * 0.15, y - r * 1.3, '#a5794a', 1.3); },
  maul(ctx, x, y, r) { line(ctx, x, y + r, x + r * 0.2, y - r * 0.8, '#8a6a3c', 1.3); ctx.fillStyle = '#6b4f2c'; ctx.fillRect(x - r * 0.25, y - r * 1.1, r * 0.9, r * 0.5); },
  bow(ctx, x, y, r) { ctx.strokeStyle = '#a5794a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x - r * 0.4, y, r * 1.1, -1.1, 1.1); ctx.stroke(); line(ctx, x + r * 0.1, y - r, x + r * 0.1, y + r, '#e8e2cf', 0.7); },
  sling(ctx, x, y, r) { ctx.strokeStyle = '#9b7650'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + r * 0.6); ctx.quadraticCurveTo(x + r, y, x + r * 0.2, y - r * 0.6); ctx.stroke(); dot(ctx, x + r * 0.2, y - r * 0.6, Math.max(1, r * 0.2), '#b9b4a6'); },
};
function line(ctx, x1, y1, x2, y2, c, wdt) { ctx.strokeStyle = c; ctx.lineWidth = wdt; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function dot(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

export const LOOKS = {
  // a disc in the faction colour; its rim shows the body armour, glyphs show what is in the hands
  person(ctx, a, px, py, r, color) {
    ctx.fillStyle = a.sleeping ? shade(color, 0.65) : color;
    const body = a.equip?.body ? ITEMS.get(a.equip.body.type) : null;
    ctx.strokeStyle = body ? body.color : '#0e100b'; ctx.lineWidth = body ? Math.max(1.8, r * 0.38) : 1.5;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (!a.equip) return;
    const e = a.equip, two = e.left && e.left === e.right;
    if (two) GLYPHS[ITEMS.get(e.left.type).glyph]?.(ctx, px + r * 1.05, py, r);
    else {
      if (e.right) GLYPHS[ITEMS.get(e.right.type).glyph]?.(ctx, px + r * 1.05, py, r);
      if (e.left) GLYPHS[ITEMS.get(e.left.type).glyph]?.(ctx, px - r * 1.05, py, r);
    }
  },
  hare(ctx, a, px, py, r, color) {
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(px, py, r * 1.1, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // two ears; flat when resting
    const up = a.task?.id === 'rest' ? 0.4 : 1;
    ctx.beginPath();
    ctx.ellipse(px - r * 0.35, py - r * (0.9 + 0.5 * up), r * 0.22, r * 0.6 * up + 0.5, -0.2, 0, Math.PI * 2);
    ctx.ellipse(px + r * 0.15, py - r * (0.9 + 0.5 * up), r * 0.22, r * 0.6 * up + 0.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
  },
  // long grey body, pointed ears, tail; facing the way it last moved
  wolf(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = a.task?.id === 'maul' ? '#b06a6a' : color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(r * 1.3, -r * 0.35, r * 0.55, r * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 1.15, -r * 0.7); ctx.lineTo(r * 1.3, -r * 1.25); ctx.lineTo(r * 1.5, -r * 0.75); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * 1.3, -r * 0.1); ctx.quadraticCurveTo(-r * 2.1, -r * 0.2, -r * 2.2, r * 0.4); ctx.lineWidth = Math.max(1.5, r * 0.35); ctx.strokeStyle = color; ctx.stroke();
    ctx.restore();
  },
};

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * k, g = ((n >> 8) & 255) * k, b = (n & 255) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
