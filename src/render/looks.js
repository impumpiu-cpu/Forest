// How creatures are drawn. A species names its look in data/species.js (look.shape);
// a new shape is one more painter here.
export const LOOKS = {
  person(ctx, a, px, py, r, color, S) {
    ctx.fillStyle = a.sleeping ? shade(color, 0.65) : color;
    ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
};

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * k, g = ((n >> 8) & 255) * k, b = (n & 255) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
