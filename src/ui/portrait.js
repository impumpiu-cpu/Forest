// A member's portrait: its pawn dressed as it is (render/art/pawn.js) on a canvas — the caravan's strip (ui/shell/campShell.js)
// and the guild's people and muster (ui/guildView.js). `cache` keeps the dressed pawns by the member's id.
import {SPECIES} from '../data/species.js';
import {dress, gearDef} from '../view/local.js';
import {drawPawn} from '../render/art/pawn.js';

export function drawPortrait(cv, m, cache = new Map()) {
  const sp = SPECIES.get(m.race), ctx = cv.getContext('2d'), key = `${m.gear?.hand?.join(',')}|${m.gear?.body}`;
  let pawn = cache.get(m.id);
  if (!pawn || pawn.key !== key) {
    pawn = {key, id: m.id, species: m.race, gender: m.gender, equip: {}, faceX: 1};
    try { dress(pawn, [...(m.gear?.hand || []), m.gear?.body].filter(id => id && gearDef(id)), 0); } catch (e) { pawn.equip = {}; }
    cache.set(m.id, pawn);
  }
  ctx.clearRect(0, 0, cv.width, cv.height);
  const s = cv.width / 256;
  if (!sp || !drawPawn(ctx, pawn, sp, 128 * s, 168 * s, 118 * s, '#8a6a4a')) { ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.arc(128 * s, 128 * s, 36 * s, 0, 6.283); ctx.fill(); }
}
// every `canvas[data-pt]` under `box` drawn for the member of that id (`find(id)` → the member)
export function drawPortraits(box, find, cache) {
  for (const cv of box.querySelectorAll('canvas[data-pt]')) { const m = find(+cv.dataset.pt); if (m) drawPortrait(cv, m, cache); }
}
