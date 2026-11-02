// A creature of the local map as a pawn (docs/ART.md «Пешки»): a body without arms or legs in the colour of its side,
// the head of its race, what it wears over the body, what it holds in its hands, what hangs on its back. Turned
// only left or right (a.faceX), the way it last stepped. Drawn small, it is the head on a token in its side's colour.
// The look is made into one bitmap per look and size (sprite.js `cached`); the scene copies it.
import {ITEMS} from '../../data/items.js';
import {HAIR, METAL} from '../../art/palette.js';
import {drawSprite, hasSprite, anchorOf, cached, MARK, FIGURE, FULL} from './sprite.js';

// the body of a race (bodies/*.svg); a species may name its own in the table: look.body
const BODY = {human: 'common', darkelf: 'common', zombie: 'common', upyr: 'common', halfling: 'small', goblin: 'small', elf: 'slim',
  dwarf: 'stout', orc: 'broad', gnoll: 'broad', giant: 'huge', ogre: 'huge', troll: 'huge', necromancer: 'robe', vampire: 'robe', skeleton: 'bones'};
export const bodyOf = sp => sp.look?.body || BODY[sp.id] || 'common';
export const headOf = sp => (hasSprite(`heads/${sp.look?.head || sp.id}`) ? `heads/${sp.look?.head || sp.id}` : null);

// the hair of one creature: the race's own, or one of a few by its id, so a crowd of people is not one head of hair
const HAIRS = {human: ['#6b4528', '#2a2220', '#c8a050', '#9a4a26', '#8a8a86', '#4a3020'], halfling: ['#8a5a2b', '#c8a050', '#6b4528', '#9a4a26'],
  dwarf: ['#b5652a', '#6b4528', '#2a2220', '#d0b080', '#8a8a86', '#9a4a26'], giant: ['#4a3a2a', '#2a2220', '#8a5a2b']};
const hairOf = (a, sp) => { const h = HAIRS[sp.id]; return h ? h[Math.abs(a.id | 0) % h.length] : HAIR[sp.id] || '#4a3a2a'; };

const PLATE = new Set(['lamellar', 'scale', 'mail', 'wicker']);
export const FLEEING = new Set(['flee', 'bolt', 'escape', 'retreat', 'hide']);
export const FIGHTING = new Set(['fight', 'assault', 'chase', 'maul', 'kill', 'torch']);

// what is in a hand → a picture of held/ and the colours of its metal
function heldOf(slot) {
  if (!slot) return null;
  if (!ITEMS.has(slot.type)) return null;
  const it = ITEMS.get(slot.type);
  const key = hasSprite(`held/${it.form}`) ? `held/${it.form}` : hasSprite(`held/${it.glyph}`) ? `held/${it.glyph}` : null;
  return key && {key, id: it.id, colors: {metal: METAL[it.material] || '#c4ccd4'}};
}
function backOf(slot) {
  if (!slot) return null;
  const it = ITEMS.has(slot.type) ? ITEMS.get(slot.type) : null;
  return it && hasSprite(`back/${it.form}`) ? {key: `back/${it.form}`, id: it.id} : hasSprite(`back/${slot.type}`) ? {key: `back/${slot.type}`, id: slot.type} : null;
}

// the look of one creature: what goes into its picture (and the key its bitmap is kept under)
export function lookOf(a, sp, cloth) {
  const head = headOf(sp);
  if (!head) return null;
  const body = bodyOf(sp), flags = new Set();
  const e = a.equip || {};
  let armor = null;
  if (e.body && ITEMS.has(e.body.type)) {
    const it = ITEMS.get(e.body.type);
    if (it && it.form !== 'garment') {
      armor = it.color;
      if (it.form === 'coat') flags.add('coat');
      else if (it.form === 'jerkin') flags.add('jerkin');
      else if (PLATE.has(it.form)) { flags.add('plate'); flags.add(it.form); if (it.tier >= 2) flags.add('heavy'); }
      else flags.add('jerkin');
    }
  }
  const two = e.left && e.left === e.right;
  const right = heldOf(e.right), left = two ? null : heldOf(e.left), back = backOf(e.back);
  const hair = hairOf(a, sp);
  const colors = {skin: sp.look.skin || '#e2b48c', hair, beard: hair, cloth, faction: cloth, armor: armor || cloth, fur: '#e8dcc0'};
  const key = `${sp.id}|${body}|${[...flags].join('.')}|${armor || ''}|${right?.id || ''}|${left?.id || ''}|${back?.id || ''}|${cloth}|${hair}`;
  return {head, body: `bodies/${body}`, flags, colors, right, left, back, key};
}

// place picture `key` so that its point `at` lands on (x, y) of the pawn (both in the pawn's units)
function at(ctx, key, anchorName, x, y, unit, o) {
  const p = anchorOf(key, anchorName) || [50, 50];
  return drawSprite(ctx, key, x - p[0] * unit, y - p[1] * unit, unit, o);
}

// the pawn in a box H × H (CSS px), its body's viewBox filling it
function paintPawn(g, L, H) {
  const u = H / 100, B = L.body, step = H < 30 ? FIGURE : FULL, o = {colors: L.colors, flags: L.flags, step, minLine: 0.8};
  const A = n => anchorOf(B, n) || [50, 50, 5];
  if (L.back) { const p = A('back'); at(g, L.back.key, 'strap', p[0] * u, p[1] * u, u, {step, minLine: 0.8}); }
  drawSprite(g, B, 0, 0, u, o);
  const off = A('off'), hand = A('hand'), hd = A('head');
  if (L.left) at(g, L.left.key, 'grip', off[0] * u, off[1] * u, u, {colors: {...L.colors, ...L.left.colors}, step, minLine: 0.8});
  // the head: its picture fills the circle `head` of the body
  const hs = (hd[2] * 2) / 100 * u, hpx = hd[2] * 2 * u;
  drawSprite(g, L.head, (hd[0] - hd[2]) * u, (hd[1] - hd[2]) * u, hs, {colors: L.colors, step: hpx < 10 ? MARK : hpx < 16 ? FIGURE : FULL, minLine: 0.8});
  if (L.right) at(g, L.right.key, 'grip', hand[0] * u, hand[1] * u, u, {colors: {...L.colors, ...L.right.colors}, step, minLine: 0.8});
  // the hands over the grips
  const hr = hand[2] * 2.2 * u / 100;
  if (L.right) drawSprite(g, 'bodies/hand', hand[0] * u - 50 * hr, hand[1] * u - 50 * hr, hr, {colors: L.colors, minLine: 0.6});
  if (L.left) drawSprite(g, 'bodies/hand', off[0] * u - 50 * hr, off[1] * u - 50 * hr, hr, {colors: L.colors, minLine: 0.6});
}

// the token: the head on a disc in the side's colour, D across
function paintToken(g, L, D) {
  drawSprite(g, 'marks/token', 0, 0, D / 100, {colors: L.colors, minLine: 0.9});
  const h = D * 0.86, hpx = h;
  drawSprite(g, L.head, (D - h) / 2, (D - h) / 2 - D * 0.03, h / 100, {colors: L.colors, step: hpx < 10 ? MARK : hpx < 16 ? FIGURE : FULL, minLine: 0.7});
}

// the sizes: a pawn this tall in CSS px for a creature of radius r (render/renderer.js), the token across
export const PAWN_K = 2.9, TOKEN_K = 2.3, PAWN_MIN = 18;
const PAD_X = 0.2, PAD_Y = 0.12;

// draw the creature at (px, py); returns its box [x, y, w, h] on the screen (CSS px)
export function drawPawn(ctx, a, sp, px, py, r, cloth) {
  const L = lookOf(a, sp, cloth);
  if (!L) return null;
  const lying = a.sleeping || a.task?.id === 'downed', flip = (a.faceX ?? 1) < 0;
  const H = Math.round(r * PAWN_K);
  if (H < PAWN_MIN) {
    const D = Math.max(6, Math.round(r * TOKEN_K));
    const bmp = cached(`tok|${L.key}|${D}|${lying ? 1 : 0}`, D, D, g => {
      paintToken(g, L, D);
      if (lying) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(16,20,40,0.35)'; g.fillRect(0, 0, D, D); }
    });
    ctx.drawImage(bmp, px - D / 2, py - D / 2, D, D);
    marks(ctx, a, px, py - D * 0.15, D);
    return [px - D / 2, py - D / 2, D, D];
  }
  // the bitmap has room round the body for what sticks out of it: a spear's head, a shield, an axe's blade
  const W = Math.ceil(H * (1 + 2 * PAD_X)), Hh = Math.ceil(H * (1 + PAD_Y)), ox = H * PAD_X, oy = H * PAD_Y;
  const bmp = cached(`pawn|${L.key}|${H}|${flip ? 1 : 0}|${lying ? 1 : 0}`, W, Hh, g => {
    if (lying) { g.translate(W / 2, Hh / 2); g.rotate(-Math.PI / 2); g.translate(-W / 2, -Hh / 2); }
    if (flip) { g.translate(W, 0); g.scale(-1, 1); }
    g.translate(ox, oy);
    paintPawn(g, L, H);
    if (a.sleeping) { const d = globalThis.devicePixelRatio || 1; g.setTransform(d, 0, 0, d, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(16,20,40,0.3)'; g.fillRect(0, 0, W, Hh); }
  });
  const x = px - W / 2, y = lying ? py - Hh / 2 : py - H * 0.6 - oy;
  ctx.drawImage(bmp, x, y, W, Hh);
  marks(ctx, a, px, lying ? py : y + oy + H * 0.3, H * 0.6);
  return [px - H / 2, y + oy, H, H];
}

// the strokes round the head: fear, rage, sleep (marks/*.svg), as big as the head
function marks(ctx, a, x, y, size) {
  const id = a.task?.id;
  const key = a.sleeping ? 'marks/sleep' : FLEEING.has(id) ? 'marks/alarm' : FIGHTING.has(id) ? 'marks/anger' : null;
  if (!key || !hasSprite(key)) return;
  const s = Math.max(10, Math.round(size));
  const bmp = cached(`mark|${key}|${s}`, s, s, g => drawSprite(g, key, 0, 0, s / 100, {minLine: 1}));
  ctx.drawImage(bmp, x - s / 2, y - s / 2, s, s);
}
