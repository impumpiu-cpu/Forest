// Beasts and monsters of the local map (beasts/<shape>.svg, by look.shape of data/species.js): seen from the side,
// turned the way they last stepped (a.faceX). Stage 5 of docs/ART.md; until a shape has its picture, the plain look.
import {drawSprite, hasSprite, cached, FIGURE, FULL} from './sprite.js';

export function drawBeast(ctx, a, sp, px, py, r, color) {
  // a species of its own picture (beasts/dragon.svg), else the picture of its shape (beasts/bird.svg)
  const key = hasSprite(`beasts/${sp.id}`) ? `beasts/${sp.id}` : `beasts/${sp.look?.shape}`;
  if (!hasSprite(key)) return false;
  const H = Math.max(8, Math.round(r * 3.2)), flip = (a.faceX ?? 1) < 0, lying = a.sleeping || a.task?.id === 'downed' || a.task?.id === 'rest';
  const bmp = cached(`beast|${key}|${color}|${H}|${flip ? 1 : 0}|${lying ? 1 : 0}|${a.tame ? 1 : 0}`, H, H, g => {
    if (flip) { g.translate(H, 0); g.scale(-1, 1); }
    drawSprite(g, key, 0, 0, H / 100, {colors: {fur: color, hide: color, skin: color}, step: H < 26 ? FIGURE : FULL, minLine: 0.8, flags: new Set([lying ? 'rest' : 'up', ...(a.tame ? ['tame'] : [])])});
  });
  ctx.drawImage(bmp, px - H / 2, py - H * 0.55, H, H);
  return true;
}
