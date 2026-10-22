// The bubble around the caravan (data/bubble.js): the things that walk near it. They are born in a ring
// around it out of the world's fields — the same dangers that a night was rolled from before (campaign/
// land.js), the roads' traffic, the game — move by day and by night, hunt the caravan when they notice it,
// and melt back into the field when it leaves them behind. The world's own parties near it count as things
// too. A thing that reaches the caravan is an encounter: a fight at night, an ambush on the march, a trade
// on the road, a hunt.
//
// K.bubble = {next, things: [{id, kind, x, y, i, strength, label, born, sated, goods, seen}]}
import {mulberry, seedNumber} from '../core/rng.js';
import {scaleOf} from '../atlas/tectonics.js';
import {townAt} from '../atlas/peoples.js';
import {roadAccess} from '../atlas/roads.js';
import {trades, atWar} from '../atlas/diplomacy.js';
import {LAIRS} from '../data/lairs.js';
import {SPECIES} from '../data/species.js';
import {faunaLevel} from '../world/region.js';
import {BUBBLE, THINGS, TRAIN, HERD} from '../data/bubble.js';
import {HIRES} from '../data/market.js';
import {EPIC} from '../data/calamities.js';
import {GAME} from '../data/campaign.js';
import {dangers, cellRegion, lairFoe} from './land.js';
import {REALM_BANDS} from '../data/seam.js';

export const bubbleOf = K => (K.bubble ||= {next: 1, things: []});
// a thing on the caravan's trail: a pursuit, or one that has noticed it (things of saves from before: all of them)
export const hunting = t => !!t.pursuit || (t.hunting ?? true);

// the darker the further on (data/bubble.js grow): the share of the way to the crown walked and the clues found
export function grow(a, K) {
  const Q = K.quest, G = BUBBLE.grow;
  if (!Q) return 1;
  let way = 1;
  if (Q.crown.state !== 'carried') {
    const [hx, hy] = [K.home % a.w, (K.home / a.w) | 0], [cx, cy] = [Q.crown.i % a.w, (Q.crown.i / a.w) | 0];
    const all = Math.hypot(cx - hx, cy - hy) || 1, left = Math.hypot(cx - K.x, cy - K.y);
    way = Math.max(0, Math.min(1, 1 - left / all));
  }
  return 1 + G.way * way + G.clue * (Q.found || 0);
}
const sc = (a, v) => v * scaleOf(a);
const dist = (K, t) => Math.hypot(t.x - K.x, t.y - K.y);
const cellAt = (a, x, y) => Math.min(a.h - 1, Math.max(0, Math.floor(y))) * a.w + Math.min(a.w - 1, Math.max(0, Math.floor(x)));
const land = (a, i) => !!a.f.land && !a.f.ocean[i];

// a town of the caravan's friends at or by a cell: the land around it is quieter
function friendlyNear(a, K, i) {
  const t = townAt(a, i);
  return !!t && t.realm && (t.realm === K.realm || (trades(a, K.realm, t.realm) && !atWar(a, K.realm, t.realm)));
}

// the most common game of a cell, for a herd's name
function herdOf(a, i) {
  const reg = cellRegion(a, i), w = {region: reg};
  let best = null, bv = 0;
  for (const [id, k] of Object.entries(GAME)) if (SPECIES.has(id) && k >= 0.8) { const v = faunaLevel(w, id); if (v > bv) { bv = v; best = id; } }
  return best ? {id: best, level: bv} : null;
}

// ── birth: a few cells of the ring a day; each cell's dangers, its road and its game may send a thing.
// The roll of a cell is seeded by the cell and the day, so the same day in the same place sends the same.
// A guide knows the land and keeps the caravan out of harm's way: the hostile are born × HIRES.guide.night
function spawn(a, K, guided) {
  const B = bubbleOf(K), near = sc(a, BUBBLE.near), far = sc(a, BUBBLE.far);
  const pick = mulberry(seedNumber(`${K.seed}:bubble:${K.day}`)), g = grow(a, K);
  for (let s = 0; s < BUBBLE.samples && B.things.length < BUBBLE.max; s++) {
    const ang = pick() * Math.PI * 2, d = near + pick() * (far - near), x = K.x + Math.cos(ang) * d, y = K.y + Math.sin(ang) * d;
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
    const i = cellAt(a, x, y); if (!land(a, i)) continue;
    const r = mulberry(seedNumber(`${K.seed}:cell:${i}:${K.day}`)), k = (friendlyNear(a, K, i) ? BUBBLE.friendly : 1) * (guided ? HIRES.guide.night : 1) * g;
    // the active hunt of an epic quest (campaign/epic.js): the hostile are born on the caravan's trail
    const trail = (K.quest?.hunt ?? 0) >= 2 ? EPIC.hunt.trail : 0;
    const add = props => { if (B.things.length < BUBBLE.max) B.things.push({id: B.next++, x, y, i, born: K.day, sated: -1, seen: false, hunting: trail > 0 && r() < trail, ...props}); };   // (no draw without a hunt: the stream stays as it was
    const thing = (dg, f = 1, small = false) => ({kind: dg.kind, strength: (dg.strength ?? 1) * f, label: small ? `малый отряд: ${dg.label || THINGS[dg.kind].label}` : dg.label || THINGS[dg.kind].label, ...(dg.band ? {band: dg.band} : {}), ...(dg.beast ? {beast: dg.beast} : {})});
    const ds = dangers(a, i);
    for (const dg of ds) if (r() < dg.p * BUBBLE.spawn * k) add(thing(dg));
    // a small party by day, about its own business
    const S = BUBBLE.small, hostile = ds.filter(dg => THINGS[dg.kind]?.mood === 'hostile');
    if (hostile.length && r() < S.chance * Math.min(1, hostile.reduce((v, dg) => v + dg.p, 0) * 4) * k) { add(thing(hostile[(r() * hostile.length) | 0], S.strength[0] + r() * (S.strength[1] - S.strength[0]), true)); K.stats.small = (K.stats.small || 0) + 1; }
    const road = roadAccess(a, i);
    if (road > 0.2 && r() < TRAIN.chance * road) add({kind: 'trader', strength: 0, label: THINGS.trader.label, goods: Math.round(TRAIN.food[0] + r() * (TRAIN.food[1] - TRAIN.food[0]))});
    const herd = herdOf(a, i);
    if (herd && r() < HERD.chance * Math.min(1.5, herd.level)) add({kind: 'herd', strength: 0, label: `стадо: ${SPECIES.get(herd.id).plural}`, game: herd.id});
  }
}

// ── a half day of moving: hunters go for the caravan when they notice it, the rest wander (traders along
// the roads); a thing left far behind melts away
function move(a, K, r, guided) {
  // a quiet people (elves) is noticed from less far (data/bubble.js `quiet`)
  const q = BUBBLE.quiet[K.people] ?? 1, B = bubbleOf(K), sense = sc(a, BUBBLE.sense) * q, notice = sc(a, BUBBLE.wanderSense) * q, gone = sc(a, BUBBLE.gone);
  for (const t of B.things) {
    const T = THINGS[t.kind], step = sc(a, T.speed) / 2, d = dist(K, t);
    let nx = t.x, ny = t.y;
    // one about its own business notices the caravan only near; then it is on its trail
    if (T.hunts && !hunting(t) && t.sated < K.day && d <= notice && !K.inTown) { t.hunting = true; K.stats.noticed = (K.stats.noticed || 0) + 1; }
    if (T.hunts && hunting(t) && t.sated < K.day && (d <= sense || t.pursuit) && !K.inTown) {
      if (guided && r() < BUBBLE.guideLoses / 2) t.sated = K.day + 2;   // the guide leads them off the trail
      else { const k = Math.min(1, step / Math.max(1e-6, d)); nx += (K.x - t.x) * k; ny += (K.y - t.y) * k; }
    } else {
      const ang = r() * Math.PI * 2; nx += Math.cos(ang) * step * 0.6; ny += Math.sin(ang) * step * 0.6;
      if (T.road && a.f.road) {   // keep to the road: of the eight cells around, step towards the most worn
        const x0 = Math.floor(t.x), y0 = Math.floor(t.y);
        let best = -1, bv = a.f.road[t.i] || 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = cellAt(a, x0 + dx, y0 + dy); if ((a.f.road[j] || 0) > bv && land(a, j) && r() < 0.6) { bv = a.f.road[j]; best = j; } }
        if (best >= 0) { nx = t.x + ((best % a.w) + 0.5 - t.x) * 0.5; ny = t.y + (((best / a.w) | 0) + 0.5 - t.y) * 0.5; }
      }
    }
    const j = cellAt(a, nx, ny);
    if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && land(a, j)) { t.x = nx; t.y = ny; t.i = j; }
  }
  // a pursuit sent after the crown (campaign/quest.js) does not melt away: it follows from further off
  B.things = B.things.filter(t => (t.pursuit ? dist(K, t) <= gone * 2 : dist(K, t) <= gone && (K.day - t.born <= BUBBLE.life || (THINGS[t.kind].hunts && hunting(t) && t.sated < K.day && dist(K, t) <= sense))));
}

// the world's parties near the caravan, as things: a lair's raid or brood, an army that is no friend, a dragon
export function worldThings(a, K) {
  const out = [], sense = sc(a, BUBBLE.sense), P = BUBBLE.partyMight;
  for (const p of a.parties || []) {
    if (p.kind === 'caravan' || p.state === 'gone' || Math.hypot(p.x - K.x, p.y - K.y) > sense) continue;
    let kind = null, who = {};
    if (p.kind === 'army') { kind = K.realm && p.owner !== K.realm && (atWar(a, K.realm, p.owner) || !trades(a, K.realm, p.owner)) ? 'army' : null; who = {band: REALM_BANDS[p.people] || 'bandits'}; }
    else if (p.kind === 'raid') { const l = (a.lairs || []).find(x => x.id === p.owner), L = l && LAIRS.get(l.kind); kind = L?.undead ? 'undead' : 'tribe'; who = l ? lairFoe(l.kind) : {}; }
    else if (p.kind === 'brood' || p.kind === 'dragon') { kind = 'lair'; const l = (a.lairs || []).find(x => x.id === p.owner); who = l ? lairFoe(l.kind) : {}; }
    if (!kind) continue;
    out.push({id: `p${p.id}`, party: p.id, kind, ...who, x: p.x, y: p.y, i: p.i, label: p.label || THINGS[kind].label, sated: (K.partySated || {})[p.id] ?? -1,
      strength: Math.min(P.max, Math.max(P.min, (p.might || 3) * P.per))});
  }
  return out;
}

// a day's moving and the things that reach the caravan: `phase` 'day' — after the march, 'night' — at the camp
export function stepBubble(a, K, phase, r, guided) {
  if (phase === 'day') spawn(a, K, guided);
  move(a, K, r, guided);
  const contact = sc(a, BUBBLE.contact);
  return [...bubbleOf(K).things, ...worldThings(a, K)].filter(t => dist(K, t) <= contact && t.sated < K.day);
}

// the hunters on the caravan's trail within sight
export const pursuers = (a, K, sight) => [...bubbleOf(K).things, ...worldThings(a, K)].filter(t => THINGS[t.kind].hunts && hunting(t) && t.sated < K.day && dist(K, t) <= Math.min(sight, sc(a, BUBBLE.sense)));
export function lose(K, t, days) { if (t.party) (K.partySated ||= {})[t.party] = K.day + days; else t.sated = K.day + days; }

// the hunters near enough that the council would not camp here
export const huntersNear = (a, K) => [...bubbleOf(K).things, ...worldThings(a, K)].some(t => THINGS[t.kind].hunts && hunting(t) && t.sated < K.day && dist(K, t) <= sc(a, BUBBLE.sense) * BUBBLE.wary);

// what the scouts see within the fog's sight: the first time a strong thing shows, it is told
export function sighted(a, K, sight) {
  const out = [];
  for (const t of [...bubbleOf(K).things, ...worldThings(a, K)]) {
    if (t.seen || dist(K, t) > sight || THINGS[t.kind].mood !== 'hostile' || t.kind === 'wolves') continue;
    if (t.party) { (K.partySeen ||= {}); if (K.partySeen[t.party]) continue; K.partySeen[t.party] = K.day; }
    else t.seen = true;
    out.push(t);
  }
  return out;
}

// the end of an encounter: a beaten thing is gone; one that won leaves the caravan alone for a while
export function settle(K, t, won) {
  const B = bubbleOf(K);
  if (t.party) { (K.partySated ||= {})[t.party] = K.day + BUBBLE.sated; return; }
  if (won || t.pursuit) B.things = B.things.filter(x => x.id !== t.id);   // a pursuit goes home after its fight
  else t.sated = K.day + BUBBLE.sated;
}
export const removeThing = (K, t) => { const B = bubbleOf(K); B.things = B.things.filter(x => x.id !== t.id); };
