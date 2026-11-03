// The world map's pictures (ui/atlasView.js, ui/campaignView.js): towns, parties, lairs, ruins and the other marks.
// The map draws in cells (its context is scaled by S, CSS pixels to a cell); a picture is made into a bitmap at its
// size on the screen and laid down in cells, so it stays crisp at every zoom. Small, a town is the crest of its people
// on a shield of its realm's colour; nearer, the town itself, by people and step (towns/<people>-<tier>.svg).
import {SPECIES} from '../../data/species.js';
import {WORLD_PEOPLES} from '../../data/peoples.js';
import {drawSprite, hasSprite, cached, MARK, FIGURE, FULL} from './sprite.js';
import {LAIRS as LAIR_ART, SITES, PORT_LINES, PORT_IDS, HIDDEN_WALLS} from '../../data/looks.js';
import {TOWN_BUILDINGS} from '../../data/townBuildings.js';
import {byId} from '../index.js';
import {drawPawn, headOf} from './pawn.js';
import {LAIRS} from '../../data/lairs.js';
import {drawBeast} from './beasts.js';

const rgb = c => (Array.isArray(c) ? `rgb(${c.join(',')})` : c);
const stepOf = px => (px < 16 ? MARK : px < 34 ? FIGURE : FULL);
// size buckets: a pixel up to 40, then 2, then 4 — enough for a smooth zoom, few enough bitmaps
const bucket = px => (px <= 40 ? Math.max(4, Math.round(px)) : px <= 120 ? Math.round(px / 2) * 2 : Math.round(px / 4) * 4);

// lay picture `key` D cells across centred at (x, y) (`lift`: how far above the centre its middle stands, in D)
export function place(px, key, x, y, D, S, o = {}, lift = 0.1) {
  if (!hasSprite(key)) return false;
  const P = bucket(D * S), c = o.colors || {}, fl = o.flags ? [...o.flags].sort().join('.') : '';
  const bmp = cached(`w|${key}|${P}|${Object.values(c).join(',')}|${fl}|${o.alpha ?? 1}`, P, P, g =>
    drawSprite(g, key, 0, 0, P / 100, {...o, step: o.step ?? stepOf(P), minLine: 0.9}));
  px.drawImage(bmp, x - D / 2, y - D / 2 - D * lift, D, D);
  return true;
}

// ── towns
// what a town's buildings show in its picture (data/townBuildings.js): walls — any of the line «wall» but the unseen
// (data/looks.js HIDDEN_WALLS), of stone — one that takes stone; a port — data/looks.js PORT_LINES and PORT_IDS
function townFlags(t) {
  const f = new Set();
  for (const id of t.built || []) {
    const b = TOWN_BUILDINGS.has(id) ? TOWN_BUILDINGS.get(id) : null; if (!b) continue;
    if (b.line === 'wall' && !HIDDEN_WALLS.has(id)) { f.add('walls'); if (b.in?.stone) f.add('stone'); }
    if (PORT_LINES.has(b.line) || PORT_IDS.has(id)) f.add('port');
  }
  return f;
}
export function town(px, t, x, y, s, k, S, {color}) {
  const key = `towns/${t.people}-${Math.min(2, t.tier || 0)}`;
  if (!hasSprite(key)) return false;
  const D = s * 2 * 1.45, P = D * S, colors = {faction: rgb(color)};
  if (P < 24 && hasSprite(`map/crest-${t.people}`)) place(px, `map/crest-${t.people}`, x, y, D * 0.8, S, {colors, step: FIGURE}, 0);
  else place(px, key, x, y, D, S, {colors, flags: townFlags(t)});
  if (t.capital) place(px, 'map/crown', x, y - D * (P < 24 ? 0.46 : 0.62), D * (P < 24 ? 0.42 : 0.34), S, {step: FIGURE}, 0);
  return true;
}

export function ruin(px, ru, x, y, r, k, S) {
  const c = WORLD_PEOPLES.has(ru.people) ? WORLD_PEOPLES.get(ru.people).color : [150, 150, 150];
  return place(px, 'map/ruin', x, y, r * 1.4, S, {colors: {faction: rgb(c)}, alpha: 0.65});
}

// ── parties: a banner, and in front of it a few pawns of who marches (their race, their beasts) when there is room
function mainRace(a, p) {
  const t = p.from != null ? byId(a).town.get(p.from) : null;
  const kin = t?.kin;
  if (kin && typeof kin === 'object') { let best = null, n = -1; for (const [r, v] of Object.entries(kin)) if (v > n && SPECIES.has(r)) { best = r; n = v; } if (best) return best; }
  return WORLD_PEOPLES.has(p.people) ? WORLD_PEOPLES.get(p.people).race : 'human';
}
const KIT = [{body: {type: 'chainmail'}, right: {type: 'spear'}, left: {type: 'shield'}}, {body: {type: 'jerkin'}, right: {type: 'sword'}, left: {type: 'shield'}}, {body: {type: 'scalemail'}, right: {type: 'axe'}}];
function troop(px, races, x, y, D, S, color, beast) {
  // pawns stand on the ground line in front of the banner; drawn in cells through a small transform
  const P = D * S;
  if (P < 30) return;
  px.save(); px.translate(x, y); px.scale(1 / S, 1 / S);
  const r = Math.min(14, P * 0.15), off = [-P * 0.22, P * 0.02, P * 0.24];
  races.slice(0, 3).forEach((race, n) => {
    const sp = SPECIES.get(race);
    if (sp.look?.shape === 'person') drawPawn(px, {id: n, species: race, equip: KIT[n % 3], faceX: 1}, sp, off[n], P * 0.22 - (n === 1 ? P * 0.06 : 0), r, color);
    else drawBeast(px, {id: n, faceX: 1}, sp, off[n], P * 0.2, r * 1.1, sp.look.color || color);
  });
  if (beast) { const sp = SPECIES.get(beast); drawBeast(px, {faceX: 1}, sp, P * 0.36, P * 0.28, r * 1.2, sp.look.color || color); }
  px.restore();
}
export function party(px, p, x, y, r, k, S, a, dir) {
  const D = r * 4.2, c = rgb(p.color);
  if (p.kind === 'army') {
    place(px, 'parties/banner', x - D * 0.12, y, D, S, {colors: {faction: c}});
    const race = mainRace(a, p), beast = Object.keys(p.warBeasts || {})[0] || (p.golems?.length ? 'golem' : null) || Object.keys(p.wild || {})[0];
    troop(px, [race, race, race], x, y, D, S, c, beast && SPECIES.has(beast) ? beast : null);
    return true;
  }
  const lair = p.owner != null ? byId(a).lair.get(p.owner) : null;
  const LK = lair && LAIRS.has(lair.kind) ? LAIRS.get(lair.kind) : null, sp = LK?.species && SPECIES.has(LK.species) ? SPECIES.get(LK.species) : null;
  if (p.kind === 'leader') { place(px, 'parties/leader', x, y, D * 0.8, S, {}, 0.2); if (sp) troop(px, [sp.id], x, y, D, S, c); return true; }
  if (p.kind === 'raid' || p.kind === 'brood' || p.kind === 'dragon') {
    if (p.kind === 'raid') place(px, 'parties/raid', x - D * 0.1, y, D, S, {colors: {faction: c}});
    if (sp) {
      const P = D * S;
      if (sp.look?.shape === 'person') troop(px, [sp.id, sp.id], x, y, D, S, c);
      else if (P >= 14) { px.save(); px.translate(x, y); px.scale(1 / S, 1 / S); drawBeast(px, {faceX: dir < 0 ? -1 : 1}, sp, 0, P * 0.1, P * (p.kind === 'dragon' ? 0.32 : 0.22), sp.look.color || c); px.restore(); }
      else if (p.kind !== 'raid') return false;
    } else if (p.kind !== 'raid') return false;
    return true;
  }
  return false;
}

export function caravan(px, K, x, y, r, k, S, a, col) {
  const D = r * 3.4, gone = K.phase && ['lost', 'timeout'].includes(K.phase);
  return place(px, 'parties/caravan', x, y, D, S, {colors: {faction: gone ? '#5a5a5a' : rgb(col)}}, 0.25);
}

// ── lairs: the base of its kind (a nest, a cave, a camp, a barrow…), the head or the beast of its owner on it
export function lair(px, l, L, x, y, sz, k, S, a, ring) {
  const base = `lairs/${LAIR_ART[L.id] || L.id}`;
  if (!hasSprite(base)) return false;
  const D = sz * 2.4 * (0.75 + 0.4 * (l.strength ?? 0.5)), c = rgb(L.color);
  if (!l.alive) return place(px, 'map/ruin', x, y, D * 0.8, S, {colors: {faction: '#5a5050'}, alpha: 0.7});
  if (!l.hidden) {   // the territory, as the scheme draws it
    px.strokeStyle = `rgba(${L.color.join(',')},0.4)`; px.lineWidth = Math.max(0.7 / S, 0.4 * k);
    px.beginPath(); px.arc(x, y, L.radius * ring, 0, Math.PI * 2); px.stroke();
  }
  place(px, base, x, y, D, S, {colors: {faction: c}, alpha: l.hidden ? 0.5 : 1});
  // the owner: a head on a dark disc for a people of lairs, the beast itself for beasts
  const P = D * S, sp = L.species && SPECIES.has(L.species) ? SPECIES.get(L.species) : null;
  if (sp && P >= 22 && !l.hidden) {
    const h = headOf(sp);
    px.save(); px.translate(x + D * 0.3, y - D * 0.38); px.scale(1 / S, 1 / S);
    const e = Math.round(P * 0.42);
    if (h) {
      const bmp = cached(`lairhead|${h}|${e}`, e, e, g => { drawSprite(g, 'marks/token', 0, 0, e / 100, {colors: {faction: '#2a2420'}, minLine: 0.8}); drawSprite(g, h, e * 0.08, e * 0.06, e * 0.84 / 100, {colors: {skin: sp.look.skin || '#999', hair: '#2a2420', beard: '#2a2420', cloth: c}, step: stepOf(e), minLine: 0.7}); });
      px.drawImage(bmp, -e / 2, -e / 2, e, e);
    } else drawBeast(px, {faceX: 1}, sp, 0, e * 0.1, e * 0.32, sp.look.color || c);
    px.restore();
  }
  return true;
}
export const leader = (px, l, x, y, sz, k, S) => place(px, 'parties/leader', x, y - sz * 1.4, sz * 1.1, S, {}, 0);
export const sanctuary = (px, x, y, sz, k, S) => place(px, 'map/sanctuary', x, y, sz * 2.4, S);
export const grave = (px, g, x, y, sz, k, S) => place(px, 'map/grave', x, y, sz * 1.9, S);

// the works of the towns (atlas/sites.js) by kind: data/looks.js SITES
export function site(px, s, b, x, y, r, k, S, a, close) {
  const key = `map/site-${SITES[b.id] || b.id}`;
  if (!place(px, key, x, y, r * 1.7, S, {alpha: 0.85}, 0.05)) return false;
  if (close) { px.textBaseline = 'alphabetic'; px.fillStyle = 'rgba(240,235,220,0.9)'; px.font = `${Math.max(0.25, 0.3 * k)}px "PT Sans", sans-serif`; px.textAlign = 'center'; px.fillText(b.name, x, y + r * 1.8 + 0.35 * k); }
  return true;
}

// a thing of the caravan's bubble (campaign/bubble.js): the hostile, the merchants, the herds
export function thing(px, t, T, hunt, s, k, S) {
  const key = T.mood === 'hostile' ? 'map/thing-hostile' : T.mood === 'trade' ? 'map/thing-trade' : 'map/thing-game';
  return place(px, key, t.x, t.y, s * 2.4, S, {alpha: T.mood === 'hostile' && !hunt ? 0.75 : 1}, 0);
}

// a click on the map (in cells) that hits a picture bigger than its cell: the town or the party under it, the nearest
// one; null — none (ui/atlasView.js selectAt)
export function artPick(a, fx, fy, k) {
  let best = null, bd = Infinity;
  const hit = (cx, cy, half, sel) => { const dx = fx - cx, dy = fy - cy, d = Math.hypot(dx, dy); if (Math.abs(dx) <= half && Math.abs(dy) <= half && d < bd) { bd = d; best = sel; } };
  for (const p of a.parties || []) if (p.kind !== 'caravan' && p.state !== 'gone') hit(p.x, p.y - 0.1 * 4.2 * Math.max(0.5, 0.8 * k), 2.1 * Math.max(0.5, 0.8 * k), {kind: 'party', id: p.id, i: p.i});
  if (best) return best;
  for (const t of a.towns || []) {
    if (!t.alive) continue;
    const D = (1.2 + 0.7 * t.tier) * k * 2 * 1.45;
    hit(t.x + 0.5, t.y + 0.5 - 0.1 * D, D / 2, {kind: 'town', id: t.id, i: t.y * a.w + t.x});
  }
  return best;
}
