import {ITEMS} from '../data/items.js';
import {SPECIES} from '../data/species.js';
import {TRADE} from '../data/trade.js';

// How creatures are drawn. A species names its look in data/species.js (look.shape);
// a new shape is one more painter here.
// small marks for what is held in the hands, drawn beside the body
export const GLYPHS = {
  club(ctx, x, y, r) { line(ctx, x, y + r * 0.6, x + r * 0.5, y - r * 0.8, '#8a6a3c', Math.max(1.5, r * 0.35)); },
  spear(ctx, x, y, r) { line(ctx, x, y + r, x + r * 0.2, y - r * 1.4, '#a5794a', 1.2); dot(ctx, x + r * 0.22, y - r * 1.45, Math.max(1, r * 0.22), '#ece6d2'); },
  javelin(ctx, x, y, r) { line(ctx, x - r * 0.15, y + r * 0.7, x + r * 0.05, y - r * 1.2, '#a5794a', 1); line(ctx, x + r * 0.15, y + r * 0.7, x + r * 0.35, y - r * 1.2, '#a5794a', 1); dot(ctx, x + r * 0.35, y - r * 1.25, Math.max(0.9, r * 0.18), '#ece6d2'); },
  axe(ctx, x, y, r) { line(ctx, x, y + r * 0.8, x + r * 0.2, y - r * 0.8, '#8a6a3c', 1.2); dot(ctx, x + r * 0.45, y - r * 0.7, Math.max(1.2, r * 0.3), '#ece6d2'); },
  ironspear(ctx, x, y, r) { line(ctx, x, y + r, x + r * 0.2, y - r * 1.4, '#a5794a', 1.2); line(ctx, x + r * 0.18, y - r * 1.25, x + r * 0.26, y - r * 1.85, '#cfd6dc', Math.max(1.2, r * 0.3)); },
  ironaxe(ctx, x, y, r) { line(ctx, x, y + r * 0.8, x + r * 0.2, y - r * 0.8, '#8a6a3c', 1.2); ctx.fillStyle = '#cfd6dc'; ctx.beginPath(); ctx.moveTo(x + r * 0.2, y - r * 0.95); ctx.lineTo(x + r * 0.85, y - r * 1.1); ctx.lineTo(x + r * 0.85, y - r * 0.3); ctx.lineTo(x + r * 0.2, y - r * 0.5); ctx.fill(); },
  sword(ctx, x, y, r) { line(ctx, x, y + r * 0.9, x + r * 0.25, y - r * 1.6, '#d8dee3', Math.max(1.3, r * 0.3)); line(ctx, x - r * 0.3, y + r * 0.35, x + r * 0.45, y + r * 0.25, '#6b4f2c', 1.3); },
  dagger(ctx, x, y, r) { line(ctx, x, y + r * 0.7, x + r * 0.15, y - r * 0.9, '#e8ecf2', Math.max(1.1, r * 0.25)); line(ctx, x - r * 0.25, y + r * 0.35, x + r * 0.35, y + r * 0.3, '#6b4f2c', 1.1); },
  shield(ctx, x, y, r) { ctx.fillStyle = '#7a5530'; ctx.strokeStyle = '#2b1d0e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, Math.max(1.8, r * 0.55), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); },
  staff(ctx, x, y, r) { line(ctx, x, y + r * 1.2, x + r * 0.15, y - r * 1.3, '#a5794a', 1.3); },
  maul(ctx, x, y, r) { line(ctx, x, y + r, x + r * 0.2, y - r * 0.8, '#8a6a3c', 1.3); ctx.fillStyle = '#6b4f2c'; ctx.fillRect(x - r * 0.25, y - r * 1.1, r * 0.9, r * 0.5); },
  bow(ctx, x, y, r) { ctx.strokeStyle = '#a5794a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x - r * 0.4, y, r * 1.1, -1.1, 1.1); ctx.stroke(); line(ctx, x + r * 0.1, y - r, x + r * 0.1, y + r, '#e8e2cf', 0.7); },
  crossbow(ctx, x, y, r) { line(ctx, x - r * 0.1, y + r * 0.9, x + r * 0.1, y - r * 0.8, '#8a6a3c', Math.max(1.3, r * 0.3)); ctx.strokeStyle = '#cfd6dc'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x + r * 0.1, y - r * 0.2, r * 0.8, -2.6, -0.5); ctx.stroke(); },
  net(ctx, x, y, r) { ctx.strokeStyle = '#d8cfb4'; ctx.lineWidth = 0.7; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x - r * 0.6, y + k * r * 0.4); ctx.lineTo(x + r * 0.6, y + k * r * 0.4); ctx.moveTo(x + k * r * 0.4, y - r * 0.6); ctx.lineTo(x + k * r * 0.4, y + r * 0.6); ctx.stroke(); } },
  rod(ctx, x, y, r) { line(ctx, x, y + r, x + r * 0.9, y - r * 1.6, '#a5794a', 1.1); ctx.strokeStyle = 'rgba(232,226,207,0.7)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x + r * 0.9, y - r * 1.6); ctx.lineTo(x + r * 1.3, y + r * 0.6); ctx.stroke(); },
  sling(ctx, x, y, r) { ctx.strokeStyle = '#9b7650'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + r * 0.6); ctx.quadraticCurveTo(x + r, y, x + r * 0.2, y - r * 0.6); ctx.stroke(); dot(ctx, x + r * 0.2, y - r * 0.6, Math.max(1, r * 0.2), '#b9b4a6'); },
};
function line(ctx, x1, y1, x2, y2, c, wdt) { ctx.strokeStyle = c; ctx.lineWidth = wdt; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function dot(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

export const LOOKS = {
  // a disc in the faction colour; its rim shows the body armour, glyphs show what is in the hands
  person(ctx, a, px, py, r, color) {
    ctx.fillStyle = a.sleeping ? shade(color, 0.65) : color;
    const body = a.equip?.body ? ITEMS.get(a.equip.body.type) : null;   // the plain piece's colour
    ctx.strokeStyle = body ? body.color : '#0e100b'; ctx.lineWidth = body ? Math.max(1.8, r * 0.38) : 1.5;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // the face: a dot in the race's skin colour, so a dwarf and an elf of one faction differ at a glance
    const skin = SPECIES.get(a.species).look.skin;
    if (skin && r >= 3) { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(px, py, r * 0.42, 0, Math.PI * 2); ctx.fill(); }
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
  // treant: a thick trunk on root-feet, boughs for arms, a green crown; bark-dark, the crown greys when it rests
  treant(ctx, a, px, py, r, color) {
    ctx.save(); ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(px - r * 0.5, py + r * 0.9); ctx.lineTo(px - r * 0.35, py - r * 0.4); ctx.lineTo(px + r * 0.35, py - r * 0.4); ctx.lineTo(px + r * 0.5, py + r * 0.9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, r * 0.22); ctx.beginPath();
    ctx.moveTo(px - r * 0.3, py - r * 0.1); ctx.lineTo(px - r * 1.05, py - r * 0.55);
    ctx.moveTo(px + r * 0.3, py - r * 0.1); ctx.lineTo(px + r * 1.05, py - r * 0.6);
    ctx.moveTo(px - r * 0.45, py + r * 0.85); ctx.lineTo(px - r * 0.8, py + r * 1.05); ctx.moveTo(px + r * 0.45, py + r * 0.85); ctx.lineTo(px + r * 0.8, py + r * 1.05);
    ctx.stroke();
    ctx.fillStyle = a.task?.id === 'rest' ? '#5f6e4a' : '#3f7a34'; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.arc(px, py - r * 0.75, r * 0.62, 0, Math.PI * 2); ctx.arc(px - r * 0.5, py - r * 0.55, r * 0.42, 0, Math.PI * 2); ctx.arc(px + r * 0.5, py - r * 0.6, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8d27a'; ctx.beginPath(); ctx.arc(px - r * 0.14, py - r * 0.15, r * 0.07, 0, Math.PI * 2); ctx.arc(px + r * 0.14, py - r * 0.15, r * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  // golem (data/constructs.js): a squat block of plates on thick legs, heavy fists, a slit of coal-light for eyes
  golem(ctx, a, px, py, r, color) {
    ctx.save(); ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1; ctx.fillStyle = color;
    ctx.fillRect(px - r * 0.55, py + r * 0.45, r * 0.4, r * 0.6); ctx.strokeRect(px - r * 0.55, py + r * 0.45, r * 0.4, r * 0.6);
    ctx.fillRect(px + r * 0.15, py + r * 0.45, r * 0.4, r * 0.6); ctx.strokeRect(px + r * 0.15, py + r * 0.45, r * 0.4, r * 0.6);
    ctx.fillRect(px - r * 0.7, py - r * 0.6, r * 1.4, r * 1.1); ctx.strokeRect(px - r * 0.7, py - r * 0.6, r * 1.4, r * 1.1);
    ctx.beginPath(); ctx.arc(px - r * 0.95, py + r * 0.2, r * 0.3, 0, Math.PI * 2); ctx.arc(px + r * 0.95, py + r * 0.2, r * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillRect(px - r * 0.35, py - r * 1.05, r * 0.7, r * 0.5); ctx.strokeRect(px - r * 0.35, py - r * 1.05, r * 0.7, r * 0.5);
    ctx.fillStyle = a.hp > 0 ? '#ff8a2a' : '#3a2a1a'; ctx.fillRect(px - r * 0.25, py - r * 0.85, r * 0.5, r * 0.1);
    ctx.restore();
  },
  // deer: a long tan body with a pale rump and branching antlers
  deer(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#efe4cc'; ctx.beginPath(); ctx.arc(-r * 1.05, -r * 0.1, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(r * 1.2, -r * 0.55, r * 0.4, r * 0.32, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = Math.max(1, r * 0.14); ctx.beginPath();
    ctx.moveTo(r * 1.1, -r * 0.8); ctx.lineTo(r * 0.9, -r * 1.6); ctx.moveTo(r * 0.95, -r * 1.25); ctx.lineTo(r * 0.6, -r * 1.45);
    ctx.moveTo(r * 1.3, -r * 0.8); ctx.lineTo(r * 1.5, -r * 1.6); ctx.stroke();
    ctx.restore();
  },
  // fox: a small orange body with a white-tipped brush
  fox(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-r * 1.3, r * 0.1, r * 0.75, r * 0.35, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4ecdc'; ctx.beginPath(); ctx.arc(-r * 1.9, r * 0.25, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(r * 0.8, -r * 0.4); ctx.lineTo(r * 1.6, -r * 0.1); ctx.lineTo(r * 0.8, r * 0.25); ctx.fill();
    ctx.restore();
  },
  // boar: a dark, heavy wedge with pale tusks; reddish when it charges
  boar(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = a.task?.mule ? '#6a3a2a' : color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-r * 1.2, -r * 0.6); ctx.quadraticCurveTo(0, -r * 1.1, r * 1.3, -r * 0.2); ctx.lineTo(r * 1.3, r * 0.35); ctx.quadraticCurveTo(0, r * 0.9, -r * 1.2, r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#efe4cc'; ctx.lineWidth = Math.max(1, r * 0.15); ctx.beginPath(); ctx.moveTo(r * 1.1, r * 0.2); ctx.lineTo(r * 1.45, -r * 0.2); ctx.stroke();
    ctx.restore();
  },
  rat(ctx, a, px, py, r, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(px, py, r * 1.2, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c8b0a8'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(px - r * 1.1, py); ctx.lineTo(px - r * 2.4, py + r * 0.5); ctx.stroke();
  },
  // goat: a pale stocky body, a small head with swept-back horns and a beard; a tame one wears a
  // red cord at the neck, a kid is smaller
  goat(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    if (a.tame && a.age < 20) r *= 0.7;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * 0.72, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(r * 1.05, -r * 0.5, r * 0.38, r * 0.3, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6a5a44'; ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.beginPath(); ctx.moveTo(r * 0.95, -r * 0.75); ctx.quadraticCurveTo(r * 0.7, -r * 1.35, r * 0.35, -r * 1.05); ctx.stroke();
    ctx.strokeStyle = '#efe8d8'; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath(); ctx.moveTo(r * 1.25, -r * 0.3); ctx.lineTo(r * 1.2, r * 0.05); ctx.stroke();
    if (a.tame) { ctx.fillStyle = '#c8402e'; ctx.beginPath(); ctx.arc(r * 0.72, -r * 0.25, Math.max(1, r * 0.18), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },
  // a big brown disc with a short mane; a pack mule carries two crates, one on each side,
  // filled to how much of its load is left
  mule(ctx, a, px, py, r, color) {
    if (a.owner != null) {
      const cap = TRADE.crates * TRADE.crate, k = Math.min(1, (a.load || 0) / cap), s = r * 0.85;
      for (const side of [-1, 1]) {
        const x = px + side * (r + s * 0.55) - s / 2, y = py - s / 2;
        ctx.fillStyle = '#3b2a17'; ctx.fillRect(x, y, s, s);
        ctx.fillStyle = '#c7a066'; ctx.fillRect(x, y + s * (1 - k), s, s * k);
        ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1; ctx.strokeRect(x, y, s, s);
      }
    }
    ctx.fillStyle = a.task?.mule ? '#9a5a3a' : color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#3a2614'; ctx.lineWidth = Math.max(1.5, r * 0.25);
    ctx.beginPath(); ctx.arc(px, py, r * 0.55, -2.4, -0.7); ctx.stroke();
    // a tame mule wears a halter
    if (a.tame) { ctx.strokeStyle = '#c8402e'; ctx.lineWidth = Math.max(1, r * 0.15); ctx.beginPath(); ctx.arc(px, py, r * 0.8, 0.3, 1.3); ctx.stroke(); }
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
  // bear: a heavy rounded body, small round ears; reddish when it charges
  bear(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = a.task?.mule ? '#7a3a2a' : color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 1.15, -r * 0.35, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 0.95, -r * 0.85, r * 0.2, 0, Math.PI * 2); ctx.arc(r * 1.4, -r * 0.82, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  // toad: a squat blob with two bulging eyes
  toad(ctx, a, px, py, r, color) {
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(px, py, r * 1.1, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8e2a0';
    ctx.beginPath(); ctx.arc(px - r * 0.45, py - r * 0.6, r * 0.25, 0, Math.PI * 2); ctx.arc(px + r * 0.45, py - r * 0.6, r * 0.25, 0, Math.PI * 2); ctx.fill();
  },
  // a winged beast (griffin, wyvern, drake): a body between two spread wings
  bird(ctx, a, px, py, r, color) {
    const flap = Math.sin((a.id * 7 + (a.x + a.y) * 3)) * 0.25;
    ctx.fillStyle = shade(color, 0.8); ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + s * r * 1.9, py - r * (0.9 + flap)); ctx.lineTo(px + s * r * 1.5, py + r * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = a.task?.id === 'maul' ? '#c0603a' : color;
    ctx.beginPath(); ctx.ellipse(px, py, r * 0.6, r * 0.95, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  },
  // giant spider: a dark body with eight legs
  spider(ctx, a, px, py, r, color) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, r * 0.18);
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
      const y = py - r * 0.5 + k * r * 0.35;
      ctx.beginPath(); ctx.moveTo(px, y); ctx.quadraticCurveTo(px + s * r * 1.1, y - r * 0.6, px + s * r * 1.6, y + r * 0.3); ctx.stroke();
    }
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(px, py + r * 0.2, r * 0.7, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c0403a'; ctx.beginPath(); ctx.arc(px, py - r * 0.55, r * 0.15, 0, Math.PI * 2); ctx.fill();
  },
  // stone worm: a long segmented body
  worm(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    for (let k = 3; k >= 0; k--) {
      ctx.beginPath(); ctx.arc(px - dir * k * r * 0.6, py + Math.sin(k + a.x) * r * 0.15, r * (0.75 - k * 0.08), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  },
  // bat: a tiny body with jagged wings
  bat(ctx, a, px, py, r, color) {
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(px - r * 2, py - r * 0.4); ctx.lineTo(px - r, py + r * 0.3); ctx.lineTo(px, py - r * 0.2);
    ctx.lineTo(px + r, py + r * 0.3); ctx.lineTo(px + r * 2, py - r * 0.4); ctx.lineTo(px, py + r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
  },
  // salamander: a slim lizard with a curled tail
  lizard(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(-r * 2, r * 0.2, -r * 1.7, -r * 0.6); ctx.lineWidth = Math.max(1, r * 0.25); ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = '#f2c060'; ctx.beginPath(); ctx.arc(r * 0.2, -r * 0.1, r * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  // the nechist: a hazy, half-seen figure; fainter while it keeps itself hidden (a.veil)
  spirit(ctx, a, px, py, r, color) {
    ctx.save();
    ctx.globalAlpha = a.veil === 0 ? 0.25 : a.veil ? 0.6 : 0.95;
    ctx.fillStyle = color; ctx.strokeStyle = shade(color, 0.6); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px - r * 0.8, py + r);
    ctx.quadraticCurveTo(px - r * 0.9, py - r * 0.6, px, py - r * 1.2); ctx.quadraticCurveTo(px + r * 0.9, py - r * 0.6, px + r * 0.8, py + r);
    ctx.quadraticCurveTo(px, py + r * 0.6, px - r * 0.8, py + r); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e9f2c8'; ctx.beginPath(); ctx.arc(px - r * 0.25, py - r * 0.45, r * 0.12, 0, Math.PI * 2); ctx.arc(px + r * 0.25, py - r * 0.45, r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  // horse: a long body with a neck up and a mane; a tame one wears a halter
  horse(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    if (a.tame && a.age < 30) r *= 0.7;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.8, -r * 0.3); ctx.lineTo(r * 1.35, -r * 1.25); ctx.lineTo(r * 1.75, -r * 1.05); ctx.lineTo(r * 1.25, -r * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = shade(color, 0.5); ctx.lineWidth = Math.max(1, r * 0.22);
    ctx.beginPath(); ctx.moveTo(r * 0.85, -r * 0.55); ctx.lineTo(r * 1.35, -r * 1.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 1.25, -r * 0.1); ctx.quadraticCurveTo(-r * 1.9, r * 0.1, -r * 1.8, r * 0.7); ctx.stroke();
    if (a.tame) { ctx.strokeStyle = '#c8402e'; ctx.lineWidth = Math.max(1, r * 0.14); ctx.beginPath(); ctx.arc(r * 1.45, -r * 1.05, r * 0.3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  },
  // bull: a heavy dark body, a broad head and two pale horns; reddish when it charges
  bull(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    if (a.tame && a.age < 40) r *= 0.7;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = a.task?.mule ? '#7a3a2a' : color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(r * 1.25, -r * 0.25, r * 0.5, r * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e8dfc8'; ctx.lineWidth = Math.max(1.2, r * 0.18);
    ctx.beginPath(); ctx.moveTo(r * 1.1, -r * 0.6); ctx.quadraticCurveTo(r * 0.9, -r * 1.3, r * 1.35, -r * 1.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 1.5, -r * 0.6); ctx.quadraticCurveTo(r * 1.75, -r * 1.3, r * 2.0, -r * 1.05); ctx.stroke();
    if (a.tame) { ctx.fillStyle = '#c8402e'; ctx.beginPath(); ctx.arc(r * 1.05, -r * 0.1, Math.max(1, r * 0.18), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },
  // lion: a wolf's long body with a dark round mane about the head; reddish when it mauls
  lion(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = a.task?.id === 'maul' ? '#b06a6a' : color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.4, r * 0.72, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 1.35, -r * 0.1); ctx.quadraticCurveTo(-r * 2.1, -r * 0.3, -r * 2.3, r * 0.4); ctx.lineWidth = Math.max(1.2, r * 0.25); ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = shade(color, 0.55); ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(r * 1.25, -r * 0.35, r * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(r * 1.35, -r * 0.35, r * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  // camel: a tall sandy body with one hump and a long neck; the tame one wears a halter
  camel(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    if (a.tame && a.age < 40) r *= 0.7;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = a.task?.mule ? '#a0683a' : color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.7, r * 0.55, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.9, -r * 0.2); ctx.lineTo(r * 1.3, -r * 1.4); ctx.lineTo(r * 1.75, -r * 1.3); ctx.lineTo(r * 1.3, -r * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (a.tame) { ctx.strokeStyle = '#c8402e'; ctx.lineWidth = Math.max(1, r * 0.14); ctx.beginPath(); ctx.arc(r * 1.45, -r * 1.25, r * 0.28, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  },
  // seal: a sleek grey tube with a round head and a pale belly
  seal(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.4, r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 1.25, -r * 0.15, r * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(color, 1.3); ctx.beginPath(); ctx.ellipse(-r * 0.1, r * 0.2, r * 0.8, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0e100b'; ctx.beginPath(); ctx.arc(r * 1.4, -r * 0.25, Math.max(0.8, r * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  // sheep: a round woolly body on a small dark head; sheared, it is thinner
  sheep(ctx, a, px, py, r, color) {
    const dir = a.faceX ?? 1;
    if (a.tame && a.age < 20) r *= 0.7;
    const woolly = a.wool == null || a.wool > 0.5;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.fillStyle = color; ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, r * (woolly ? 1.2 : 1.0), r * (woolly ? 0.95 : 0.7), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (woolly) for (const [x, y] of [[-0.7, -0.6], [0, -0.85], [0.7, -0.6], [-0.9, 0.3], [0.9, 0.3]]) { ctx.beginPath(); ctx.arc(r * x, r * y, r * 0.35, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#3a2e24'; ctx.beginPath(); ctx.ellipse(r * 1.15, -r * 0.3, r * 0.36, r * 0.28, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (a.tame) { ctx.fillStyle = '#c8402e'; ctx.beginPath(); ctx.arc(r * 0.75, -r * 0.1, Math.max(1, r * 0.16), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },
};

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * k, g = ((n >> 8) & 255) * k, b = (n & 255) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
