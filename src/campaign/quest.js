// The quest (data/quest.js): the crown and the three clues. The crown lies where the world's own history
// would lose it — an ancient barrow, a dragon's lair, a lair of the dead, the ruins of a lair the peoples
// cleared or of a burnt town; the clues lie on the way to it: a sage in a friendly town, a living lair, a
// barrow, a ruin. The capital tells only where the first clue is to be looked for; each clue found narrows
// the crown down (a circle of 30 cells, then 12, then the place itself) and tells where another clue lies;
// rumours in the towns tell of the rest, so the caravan may take them in its own order. A guarded place is
// stormed (a fight on the local map: campaign/fight.js), the guards stronger the further from home. With the
// crown the caravan turns home, and the world sends its bands after it; a carrier who falls passes it on,
// or the foe takes it and makes camp with it — to be stormed again.
//
// K.quest = {name, story, crown: {kind, at, i, label, guard, area, exact, state: 'lost'|'carried'|'taken',
//   carrier}, clues: [{k, kind, at, i, label, guard, area, seen, found}], search, stormAt, next (pursuit)}
//   area = {x, y, r} — a circle the place is known to lie in; guard = {kind, strength, label, band?, beast?}
import {inLine} from '../data/campaign.js';
import {realmBand} from '../atlas/towns.js';
import {scaleOf} from '../atlas/tectonics.js';
import {moveCost} from '../atlas/roads.js';
import {townLabel} from '../atlas/towns.js';
import {realmLabelGen} from '../atlas/realms.js';
import {trades, atWar} from '../atlas/diplomacy.js';
import {biomeAt} from '../atlas/biomes.js';
import {settleable} from '../seam/cell.js';
import {LAIRS} from '../data/lairs.js';
import {QUEST} from '../data/quest.js';
import {CAMPAIGN, FOES} from '../data/campaign.js';
import {BUBBLE} from '../data/bubble.js';
import {lairFoe} from './land.js';
import {bubbleOf, cellAt} from './bubble.js';
import {makeEpicQuest, graveLine, epicTaken, epicWorld} from './epic.js';
import {cellDist, weighted} from '../core/util.js';

const DIRS = ['на востоке', 'на юго-востоке', 'на юге', 'на юго-западе', 'на западе', 'на северо-западе', 'на севере', 'на северо-востоке'];
const xy = (a, i) => [i % a.w + 0.5, ((i / a.w) | 0) + 0.5];
const dist = cellDist;   // (core/util.js)
// a word by the gender of the crown's name (feminine for «корона», masculine for «венец»)
// (a neuter one — «Сердце Творца», «Око Мира» of the epic world — from the feminine form)
const NEUT = {'её': 'его', 'Её': 'Его', 'она лежит': 'оно лежит', 'отбита': 'отбито', 'найдена': 'найдено', 'досталась': 'досталось'};
const gx = (Q, f, m) => (Q.g === 'm' ? m : Q.g === 'n' ? NEUT[f] ?? m : f);
const pick = (r, list) => list[(r() * list.length) | 0];

// ── the land the caravan can walk from home: a mask, and the cells it may stop on
export function reachable(a, K) {
  const seen = new Uint8Array(a.n), cells = [], queue = [K.home]; seen[K.home] = 1;
  while (queue.length) {
    const c = queue.pop(), x = c % a.w, y = (c / a.w) | 0;
    if (settleable(a, c)) cells.push(c);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, j = ny * a.w + nx;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && !seen[j] && moveCost(a, j, K.people) < Infinity) { seen[j] = 1; queue.push(j); }
    }
  }
  cells.sort((p, q) => p - q);   // the order of the flood must not decide the draws
  return {mask: seen, cells};
}
// the nearest cell the caravan can walk to, within r of a place (a lair in the crags: at its foot)
export function foot(a, mask, i, r = 3) {
  if (mask[i]) return i;
  const x0 = i % a.w, y0 = (i / a.w) | 0;
  let best = -1, bd = Infinity;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
    const j = y * a.w + x, d = dx * dx + dy * dy; if (mask[j] && d < bd) { bd = d; best = j; }
  }
  return best;
}

// ── the places of the world's history the quest can use
const lairName = l => `${LAIRS.get(l.kind).label} «${l.name}»`;
const friendly = (a, K, t) => t.realm && (t.realm === K.realm || (trades(a, K.realm, t.realm) && !atWar(a, K.realm, t.realm)));
function places(a, K, mask) {
  const out = [], add = (p, at) => { const i = foot(a, mask, at); if (i >= 0) out.push({...p, at, i}); };
  for (const b of a.ancientBarrows || []) add({kind: 'barrow', label: 'древний курган'}, b);
  for (const l of a.lairs || []) {
    const L = LAIRS.get(l.kind); if (!L || L.fiend) continue;
    if (L.dragon) { if (l.alive) add({kind: 'dragon', label: lairName(l), lair: l.id}, l.i); continue; }
    if (!l.alive) { const by = l.clearedBy != null && a.towns.find(t => t.id === l.clearedBy); add({kind: 'ruin', label: `развалины — ${lairName(l)}`, lair: l.id, died: l.died, by: by ? `${townLabel(by, 2)} ${by.name}` : null}, l.i); }
    else add({kind: L.undead ? 'dread' : 'lair', label: lairName(l), lair: l.id}, l.i);
  }
  for (const t of a.towns || []) {
    if (!t.alive) add({kind: 'ruin', label: `пепелище — ${townLabel(t, 0)} ${t.name}`, town: t.id, died: t.died}, t.i);
    else if (friendly(a, K, t) && t.id !== K.capital) add({kind: 'town', label: `${townLabel(t, 0)} ${t.name}`, town: t.id}, t.i);
  }
  return out;
}

// who guards a place, and how strong: stronger the further from home
function guardOf(a, K, p, crown = false) {
  const G = QUEST.guard, diag = Math.hypot(a.w, a.h), s = Math.min(G.max, (G.base + G.perDiag * dist(a, K.home, p.i) / diag) * (crown ? G.crown : 1));
  const l = p.lair != null ? a.lairs.find(x => x.id === p.lair) : null, L = l && LAIRS.get(l.kind);
  if (p.kind === 'town') return null;
  if (p.kind === 'dragon') return {kind: 'lair', strength: s, label: `выводок дракона — ${p.label}`, beast: 'drake'};
  if (p.kind === 'barrow') return {kind: 'undead', strength: s, label: 'мертвецы древнего кургана', band: 'undead'};
  if (p.kind === 'ruin') return {kind: 'bandits', strength: s, label: `разбойники, засевшие ${p.town != null ? 'на пепелище' : 'в развалинах'}`, band: 'bandits'};
  return {kind: L?.undead ? 'undead' : L?.tribe ? 'tribe' : 'lair', strength: s, label: p.label, ...(l ? lairFoe(l.kind) : {})};
}

// the crown's story, by where it lies (g — the gender of its name: «она сгинула», «он сгинул»)
const PAST = {m: 'пал', f: 'пала', n: 'пало', pl: 'пали'};
function story(a, p, g) {
  const she = g === 'f' ? 'Она' : 'Он', her = g === 'f' ? 'её' : 'его', lost = g === 'f' ? 'сгинула' : 'сгинул';
  if (p.kind === 'barrow') return `Древний король унёс ${her} с собой в могилу, и курган его до сих пор стережёт мёртвый караул.`;
  if (p.kind === 'dragon') return `${she} в сокровищнице дракона — ${p.label}.`;
  if (p.kind === 'dread') return `${she} у нечисти: ${p.label}.`;
  if (p.kind === 'ruin' && p.lair != null) {
    const l = a.lairs.find(x => x.id === p.lair), L = l && LAIRS.get(l.kind);
    return `${she} ${lost}${p.died != null ? ` в ${p.died}-м году` : ''}, когда ${PAST[L?.g] || 'пало'} ${L ? `${L.label} «${l.name}»` : 'старое логово'}${p.by ? ` — его разорили из ${p.by}` : ''}.`;
  }
  if (p.kind === 'ruin') return `${she} ${lost}${p.died != null ? ` в ${p.died}-м году` : ''} в огне: ${p.label}.`;
  return `Где ${she.toLowerCase()} ${lost}, не помнит никто.`;
}

// a circle that holds the place: of radius r cells (× the world's scale), its centre off the place
export function circle(a, i, r, rnd) {
  const R = r * scaleOf(a), [x, y] = xy(a, i), ang = rnd() * Math.PI * 2, d = rnd() * QUEST.off * R;
  return {x: Math.min(a.w - 0.5, Math.max(0.5, x + Math.cos(ang) * d)), y: Math.min(a.h - 0.5, Math.max(0.5, y + Math.sin(ang) * d)), r: R};
}

// ── the quest is laid out when the caravan sets out
export function makeQuest(a, K, rnd) {
  // an epic world tells its own story: the graves of its bosses, the lair of the fourth (campaign/epic.js)
  if (epicWorld(a)) { const E = makeEpicQuest(a, K, rnd); if (E) return E; }   // (and a world of «Заселение мира», campaign/epic.js)
  const {mask, cells} = reachable(a, K);
  if (!cells.length) return null;
  const diag = Math.hypot(a.w, a.h), G = CAMPAIGN.goal, home = K.home, d = i => dist(a, home, i) / diag;
  const all = places(a, K, mask);
  // the crown: a place of the right kind at the right distance; or else the far wilds
  let crown = null;
  for (const [near, far] of [[G.near, G.far], G.wide]) {
    const fit = all.filter(p => QUEST.crownAt[p.kind] && d(p.i) >= near && d(p.i) <= far);
    if (fit.length) { crown = weighted(rnd, fit.map(p => [p, QUEST.crownAt[p.kind]])); break; }
  }
  if (!crown) {
    const far = cells.filter(i => d(i) >= G.near);
    const i = far.length ? pick(rnd, far) : cells.reduce((b, c) => (d(c) > d(b) ? c : b), home);
    if (i === home) return null;
    crown = {kind: 'wild', label: biomeAt(a, i)?.where || 'в глуши', at: i, i};
  }
  // the clues: places near points on the way, each a little off the straight line
  const used = new Set([crown.at]), usedI = new Set([crown.i]), clues = [];
  const [hx, hy] = xy(a, home), [cx, cy] = xy(a, crown.i), len = Math.hypot(cx - hx, cy - hy), nx = -(cy - hy) / (len || 1), ny = (cx - hx) / (len || 1);
  for (let k = 0; k < QUEST.clueAt.length; k++) {
    const f = QUEST.clueAt[k], off = (rnd() * 2 - 1) * QUEST.scatter * len;
    const px = hx + (cx - hx) * f + nx * off, py = hy + (cy - hy) * f + ny * off;
    const fit = all.filter(p => QUEST.clueKinds[p.kind] && !used.has(p.at) && !usedI.has(p.i) && p.i !== home);
    let best = null, bv = Infinity;
    for (const p of fit) { const [x, y] = xy(a, p.i), v = Math.hypot(x - px, y - py) / QUEST.clueKinds[p.kind]; if (v < bv) { bv = v; best = p; } }
    // no place of history near: a cairn in the wilds keeps the clue
    // (on a small island: the walkable cell nearest to the point that no other place of the quest holds)
    if (!best || bv > len * 0.5) {
      let i = -1, id = Infinity;
      for (const c of cells) { if (usedI.has(c) || c === home) continue; const [x, y] = xy(a, c), v = Math.hypot(x - px, y - py); if (v < id) { id = v; i = c; } }
      best = i >= 0 ? {kind: 'cairn', label: `каменная пирамида ${biomeAt(a, i)?.where || ''}`.trim(), at: i, i} : fit[0];
    }
    if (!best) continue;
    used.add(best.at); usedI.add(best.i);
    clues.push({k, kind: best.kind, at: best.at, i: best.i, label: best.label, town: best.town ?? null, guard: best.kind === 'cairn' ? null : guardOf(a, K, best), area: null, seen: false, found: false});
  }
  const [name, acc, g] = pick(rnd, QUEST.names);
  const Q = {name, acc, g, story: story(a, crown, g), crown: {kind: crown.kind, at: crown.at, i: crown.i, label: crown.label, guard: crown.kind === 'wild' ? guardOf(a, K, {...crown, kind: 'ruin'}, true) : guardOf(a, K, crown, true),
    area: null, exact: false, seen: false, state: 'lost', carrier: null}, clues, search: null, stormAt: 0, next: null, found: 0};
  // the capital knows only where the first clue may be looked for
  if (clues.length) clues[0].area = circle(a, clues[0].i, QUEST.area, rnd);
  return Q;
}

// where a circle lies from a cell, in words: «на северо-востоке, дней за 20 пути»
export function whereFrom(a, K, from, area) {
  const [x, y] = xy(a, from), ang = Math.atan2(area.y - y, area.x - x), d = Math.hypot(area.x - x, area.y - y);
  const days = Math.max(1, Math.round(d / (CAMPAIGN.speed * scaleOf(a))));
  return d < area.r ? 'совсем рядом' : `${DIRS[(Math.round(ang / (Math.PI / 4)) + 8) % 8]}, дней за ${days} пути`;
}
const KIND_HINT = {grave: 'у могилы былого бедствия', seat: 'в логове нового бедствия', town: 'у летописцев одного из дружеских городов', lair: 'в логове', dread: 'в логове нечисти', barrow: 'в древнем кургане', ruin: 'в развалинах', cairn: 'под каменной пирамидой', dragon: 'в логове дракона'};
const clueHint = (a, K, c, from) => `${KIND_HINT[c.kind] || 'где-то'} ${whereFrom(a, K, from, c.area)}`;
export const questIntro = (a, K) => {
  const Q = K.quest, c = Q.clues[0];
  return `Их поручение — найти ${Q.acc || Q.name}. ${Q.story} Где ${gx(Q, 'она лежит', 'он лежит')}, не знает никто; ` + (c ? `в столице знают лишь, где искать первый след: ${clueHint(a, K, c, K.home)}.` : Q.crown.area ? `беглецы указали, где искать: ${whereFrom(a, K, K.home, Q.crown.area)}.` : 'следов нет — искать придётся наугад.');
};

// ── the target: where the council sends the caravan now (K.goal)
export function questTarget(a, K, rnd, say = null) {
  const Q = K.quest; if (!Q) return K.goal;
  const g = target(a, K, rnd);
  // sought too long without reaching it: left for a while (as after storms beaten back), another sought
  const key = g == null || Q.crown.state === 'carried' ? null : Q.search && g === Q.search.i ? Q.search.key : g === Q.crown.i ? 'crown' : Q.clues.find(c => c.i === g)?.k ?? null;
  if (key !== (Q.chase?.key ?? null)) Q.chase = key == null ? null : {key, since: K.day};
  else if (key != null && K.day - Q.chase.since > QUEST.stuck) {
    const place = key === 'crown' ? Q.crown : Q.clues.find(c => c.k === key);
    place.rest = K.day + QUEST.stuckRest; place.restWhy = 'stuck'; Q.search = null; Q.chase = null;
    if (place !== Q.crown) place.seen = false;
    say?.(`Совет: ${place.label} не даётся — ${Math.round(QUEST.stuck / 120)} года пути впустую. Пока искать в другом месте.`, 'quest');
    return target(a, K, rnd);
  }
  return g;
}
function target(a, K, rnd) {
  const Q = K.quest;
  const C = Q.crown;
  if (C.state === 'carried') return K.home;
  if ((C.exact || C.seen) && !(C.rest > K.day)) return C.i;   // (a crown left for a while after storms beaten back: elsewhere meanwhile)
  // a clue whose place was seen, or whose area is known: the nearest first (the order is the caravan's)
  const open = Q.clues.filter(c => !c.found && (c.seen || c.area) && !(c.rest > K.day));
  const near = (p, q) => distTo(a, K, p) - distTo(a, K, q);
  const seen = open.filter(c => c.seen).sort(near)[0];
  if (seen) return seen.i;
  const area = open.sort(near)[0] || (C.area && !(C.rest > K.day) ? C : null);
  if (area) return searchCell(a, K, area, rnd);
  // every place known is left for a while, and none is unknown to be asked of: back to the one left the soonest
  if (Q.clues.every(c => c.found || c.area)) {
    // (not a place left after storms beaten back: meanwhile they heal where they are)
    const back = [...Q.clues.filter(c => !c.found && c.rest > K.day), ...(C.rest > K.day && (C.exact || C.seen || C.area) ? [C] : [])].filter(p => p.restWhy !== 'storms').sort((p, q) => p.rest - q.rest)[0];
    if (back) { back.rest = 0; return target(a, K, rnd); }
  }
  return null;   // nothing known: the council looks for rumours in a town (campaign/march.js)
}
const distTo = (a, K, c) => Math.hypot(c.area ? c.area.x - K.x : xy(a, c.i)[0] - K.x, c.area ? c.area.y - K.y : xy(a, c.i)[1] - K.y);
// a cell of an area to search: its centre first, then a new cell each time one is reached
function searchCell(a, K, place, rnd) {
  const Q = K.quest, key = place === Q.crown ? 'crown' : place.k;
  const mask = reachMask(a, K);
  if (Q.search?.key === key && K.i !== Q.search.i) return Q.search.i;
  if (Q.search?.key === key && ++Q.search.tries >= QUEST.tries) { place.rest = K.day + QUEST.rest; place.restWhy = 'search'; Q.search = null; return target(a, K, rnd); }
  const A = place.area;
  let i = -1;
  for (let k = 0; k < 30 && i < 0; k++) {
    const first = Q.search?.key !== key && k === 0, ang = rnd() * Math.PI * 2, d = first ? 0 : Math.sqrt(rnd()) * A.r;
    i = foot(a, mask, cellAt(a, A.x + Math.cos(ang) * d, A.y + Math.sin(ang) * d), 2);
  }
  if (i < 0) { place.rest = K.day + QUEST.rest; place.restWhy = 'search'; return null; }
  Q.search = {key, i, tries: Q.search?.key === key ? Q.search.tries : 0};
  return i;
}
// the walkable mask, kept beside the campaign (not saved): asked rarely, when a search picks a cell
const MASKS = new WeakMap();
function reachMask(a, K) { let m = MASKS.get(K); if (!m) MASKS.set(K, m = reachable(a, K).mask); return m; }

// ── each day: what the scouts see of the places they look for
export function questSight(a, K, say) {
  const Q = K.quest; if (!Q) return;
  const sight = (QUEST.sight + CAMPAIGN.fog.sight) * scaleOf(a), d = i => Math.hypot(xy(a, i)[0] - K.x, xy(a, i)[1] - K.y);
  for (const c of Q.clues) if (!c.found && !c.seen && c.area && d(c.at) <= sight) {
    c.seen = true; K.path = null;
    say(`Разведчики нашли то, что искали: ${c.label}${c.guard ? ` (стража — ${c.guard.label === c.label ? FOES[c.guard.kind].label : c.guard.label})` : ''}.`, 'quest');
  }
  const C = Q.crown;
  if (C.state !== 'carried' && !C.seen && (C.area || C.exact || C.state === 'taken') && d(C.at) <= sight) {
    C.seen = true; K.path = null;
    if (!C.exact) say(`Разведчики нашли место, где лежит ${Q.name}: ${C.label}.`, 'quest', true);
  }
}

// ── at the place: take the clue (a sage tells it, or it is won from the guards), or the crown
// fight(d) — the storm (campaign/fight.js): true when won; might — the company's strength now (campaign/march.js
// caravanMight). → true when the evening was spent on it
export function questArrive(a, K, rnd, fight, say, might = 0) {
  const Q = K.quest; if (!Q) return false;
  const C = Q.crown, here = [...Q.clues.filter(c => !c.found && c.seen), ...(C.state !== 'carried' && (C.seen || C.exact) ? [C] : [])].find(p => p.i === K.i && !(p.rest > K.day));   // (a place left for a while is not stormed meanwhile)
  if (!here) return false;
  if (here.guard) {
    const ms = K.members.filter(m => m.alive), hp = ms.reduce((s, m) => s + m.hp, 0) / Math.max(1, ms.length);
    if (K.day < Q.stormAt || hp < QUEST.storm) return false;   // first heal and gather strength (the camp of the evening)
    if (ms.filter(m => !m.captive).length < QUEST.hands) { leaveFor(K, here, say, 'слишком мало рук для штурма'); return false; }   // too few left: for people first
    // beaten back once, the council does not send the same company against the same guards: it comes back stronger
    // than the one that lost (QUEST.stronger) — or, not grown so in time, leaves the place for a while
    if (here.lost && might < here.lost.might * QUEST.stronger) {
      if (K.day - here.lost.day >= QUEST.grow) leaveFor(K, here, say, `сил не прибавилось, а стража не ослабла`);
      return false;
    }
    K.stats.storms = (K.stats.storms || 0) + 1;
    const sk = here === C ? 'stormsLair' : here.kind === 'grave' ? 'stormsGrave' : null; if (sk) K.stats[sk] = (K.stats[sk] || 0) + 1;
    const win = fight(here.guard);
    if (!win) {
      Q.stormAt = K.day + QUEST.retry; here.fails = (here.fails || 0) + 1; here.lost = {might, day: K.day};
      if (here.fails >= QUEST.giveUp) leaveFor(K, here, say, `${QUEST.giveUp} штурма отбиты`);   // beaten back again and again: leave it for a while, look elsewhere
      return true;
    }
    delete here.lost;
  }
  if (here === C) takeCrown(a, K, say); else takeClue(a, K, here, rnd, say);
  K.path = null; Q.search = null;
  return true;
}

// a guarded place left for a while (QUEST.giveUpRest): the council looks elsewhere meanwhile
function leaveFor(K, here, say, why) {
  const Q = K.quest, C = Q.crown;
  here.fails = 0; delete here.lost; here.rest = K.day + QUEST.giveUpRest; here.restWhy = 'storms'; here.seen = here === C ? here.seen : false; K.path = null; Q.search = null;
  say(`${here.label[0].toUpperCase()}${here.label.slice(1)} не взять: ${why}. Совет решил пока искать в другом месте.`, 'quest');
}

function takeClue(a, K, c, rnd, say) {
  const Q = K.quest, C = Q.crown;
  c.found = true; c.day = K.day; Q.found++;
  const t = c.town != null ? a.towns.find(x => x.id === c.town) : null;
  const how = c.epitaph ? `${graveLine(c)} По ней и по старым летописям поняли` : t ? `В ${townLabel(t, 3)} ${t.name} летописец открыл старые свитки` : c.guard ? 'Среди добычи нашлась старая грамота' : 'Под камнями нашлась старая грамота';
  // the crown narrowed down
  const r = QUEST.narrow[Math.min(Q.found, QUEST.narrow.length) - 1];
  let told;
  if (r <= 0 || Q.found >= QUEST.narrow.length) { C.exact = true; C.area = null; told = `${Q.name} лежит здесь: ${C.label}, ${whereFrom(a, K, K.i, {x: xy(a, C.i)[0], y: xy(a, C.i)[1], r: 0})}`; }
  else { C.area = circle(a, C.i, r, rnd); told = `${Q.name} где-то ${whereFrom(a, K, K.i, C.area)} — в округе ${Math.round(C.area.r)} клеток`; }
  // and another clue: the nearest one not yet known
  const next = Q.clues.filter(x => !x.found && !x.area).sort((p, q) => dist(a, c.i, p.i) - dist(a, c.i, q.i))[0];
  if (next && !C.exact) next.area = circle(a, next.i, QUEST.area, rnd);
  say(`${how}: ${told}.${next && !C.exact ? ` Там же сказано, где искать другой след: ${clueHint(a, K, next, K.i)}.` : ''} Подсказок найдено: ${Q.found} из ${Q.clues.length}.`, 'quest', true);
}

function takeCrown(a, K, say) {
  const Q = K.quest, C = Q.crown, m = bearer(K);
  const again = C.state === 'taken';
  C.state = 'carried'; C.carrier = m?.id ?? null; C.seen = false; C.exact = false;
  K.phase = 'back'; K.goal = K.home; Q.next = K.day + 3; Q.carriedFrom = K.day;
  if (Q.epic && !again) { epicTaken(a, K, m?.name || 'караван'); say(`${C.label[0].toUpperCase()}${C.label.slice(1)} взято штурмом: ${C.guard?.boss?.name || 'босс'} пал${(C.guard?.boss?.g ?? a.calamities?.find(c => c.id === Q.calamity)?.boss?.g) === 'f' ? 'а' : ''}. ${Q.name} в руках каравана — ${gx(Q, 'её', 'его')} несёт ${m?.name}. Домой! Весть летит быстрее каравана, и враги не дадут донести ${gx(Q, 'её', 'его')} спокойно.`, 'crown', true, m ? [m.id] : null); return; }
  say(again ? `${Q.name} ${gx(Q, 'отбита', 'отбит')} у врагов: теперь ${gx(Q, 'её', 'его')} несёт ${m?.name}. Домой!` : `${Q.name} ${gx(Q, 'найдена', 'найден')} — ${C.label}! ${gx(Q, 'Её', 'Его')} несёт ${m?.name}. Весть об этом летит быстрее каравана: враги не дадут донести ${gx(Q, 'её', 'его')} спокойно.`, 'crown', true, m ? [m.id] : null);
}
// who carries the crown: a knight first, the healthiest
function bearer(K) {
  const ms = K.members.filter(m => m.alive && !m.captive);   // a captive never carries the crown
  return ms.filter(m => inLine(m)).sort((p, q) => q.hp - p.hp)[0] || ms.filter(m => m.core).sort((p, q) => q.hp - p.hp)[0] || ms[0] || null;
}

// after a fight: the carrier fell — another takes the crown, or, the fight lost, the foe takes it and makes
// camp with it near by (the caravan must storm it). d — the foe of the fight
export function afterFight(a, K, d, win, say) {
  const Q = K.quest; if (!Q || Q.crown.state !== 'carried') return;
  const C = Q.crown, m = K.members.find(x => x.id === C.carrier);
  if (m?.alive) return;
  const next = bearer(K);
  if (win && next) { C.carrier = next.id; say(`${Q.name} не ${gx(Q, 'досталась', 'достался')} врагам: ${gx(Q, 'её', 'его')} подобрал${next.gender === 'f' ? 'а' : ''} ${next.name}.`, 'crown'); return; }
  if (!next) return;   // nobody left to care
  // taken: the foe's camp a few cells off
  const mask = reachMask(a, K), [x, y] = [K.x, K.y], ang = ((K.day * 7919) % 360) / 57.3, r = 3 * scaleOf(a);
  const i = foot(a, mask, cellAt(a, x + Math.cos(ang) * r, y + Math.sin(ang) * r), 4);
  C.state = 'taken'; C.carrier = null; C.at = i >= 0 ? i : K.i; C.i = C.at; C.exact = true; C.seen = true; C.area = null;   // the old circle no longer holds it
  const who = (d.label || FOES[d.kind].label).replace(/^погоня: /, '');
  C.guard = {...d, label: who, strength: Math.min(QUEST.guard.max, (d.strength ?? 1) * 1.15)}; C.label = `стан врагов (${who})`;
  K.phase = 'out'; K.path = null;
  say(`${Q.name} ${gx(Q, 'досталась', 'достался')} врагам (${who}): ${gx(Q, 'её', 'его')} унесли и встали станом неподалёку. ${gx(Q, 'Её', 'Его')} придётся отбить.`, 'crown', true);
}

// a carrier who died of something else (hunger): the crown passes on
export function crownHands(K, say) {
  const Q = K.quest; if (!Q || Q.crown.state !== 'carried') return;
  const m = K.members.find(x => x.id === Q.crown.carrier);
  if (m?.alive) return;
  const next = bearer(K); if (!next) return;
  Q.crown.carrier = next.id;
  say(`${Q.name} теперь у ${next.name}.`, 'crown');
}

// ── rumours in a friendly town: where an unknown clue lies
export const askable = K => K.quest && K.quest.clues.some(c => !c.found && !c.area) && K.day >= (K.quest.askAt ?? 0);
export function rumour(a, K, t, rnd) {
  const Q = K.quest; if (!Q || Q.crown.state === 'carried' || Q.crown.exact) return null;
  const unknown = Q.clues.filter(c => !c.found && !c.area);
  if (!unknown.length || rnd() > QUEST.rumour.chance) return null;
  const charm = Math.max(...K.members.filter(m => m.alive && !m.captive).map(m => m.special?.C ?? 5)), R = QUEST.rumour;
  if (charm < R.charm && K.gold < R.price) return null;
  if (charm < R.charm) K.gold = Math.round((K.gold - R.price) * 10) / 10;
  const c = unknown.sort((p, q) => dist(a, t.i, p.i) - dist(a, t.i, q.i))[0];
  c.area = circle(a, c.i, QUEST.area, rnd); K.path = null;
  K.stats.rumours = (K.stats.rumours || 0) + 1;
  return `${charm >= R.charm ? 'разговорили' : `за ${R.price} зол. выведали у`} старожилов, где искать след: ${clueHint(a, K, c, t.i)}`;
}

// ── the way home with the crown: the world sends its bands after the caravan
export function pursuit(a, K, rnd, say) {
  const Q = K.quest; if (!Q || Q.crown.state !== 'carried' || K.inTown || K.day < (Q.next ?? Infinity)) return;
  const P = QUEST.pursuit;
  if (bubbleOf(K).things.filter(t => t.pursuit).length >= P.at) { Q.next = K.day + P.full; return; }   // enough on its trail already
  Q.next = K.day + Math.round(P.every * (P.jitter[0] + P.jitter[1] * rnd()));
  const years = (K.day - (Q.carriedFrom ?? K.day)) / 120, strength = Math.min(P.max, P.base + P.perYear * years);
  // who: an army of a realm that is no friend, else a tribe of the nearest living lair, else outlaws
  const enemy = (a.realms || []).filter(r => r.id !== K.realm && (atWar(a, K.realm, r.id) || !trades(a, K.realm, r.id)))
    .map(r => ({r, d: Math.min(...(a.towns || []).filter(t => t.alive && t.realm === r.id).map(t => Math.hypot(t.x - K.x, t.y - K.y)))})).filter(e => Number.isFinite(e.d)).sort((p, q) => p.d - q.d)[0];
  const lair = (a.lairs || []).filter(l => l.alive && LAIRS.get(l.kind)?.tribe).sort((p, q) => Math.hypot(p.x - K.x, p.y - K.y) - Math.hypot(q.x - K.x, q.y - K.y))[0];
  let thing;
  if (enemy && rnd() < P.army) thing = {kind: 'army', label: `погоня: войско ${realmLabelGen(a, enemy.r.id)}`, band: realmBand(a, enemy.r.id, enemy.r.people) || 'bandits'};
  else if (lair) thing = {kind: 'tribe', label: `погоня: ${lairName(lair)}`, ...lairFoe(lair.kind)};
  else thing = {kind: 'bandits', label: 'погоня: охотники за короной', band: 'bandits'};
  const B = bubbleOf(K), far = BUBBLE.far * scaleOf(a);
  for (let k = 0; k < 12; k++) {
    const ang = rnd() * Math.PI * 2, x = K.x + Math.cos(ang) * far, y = K.y + Math.sin(ang) * far;
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
    const i = cellAt(a, x, y); if (!a.f.land?.[i] || a.f.ocean[i]) continue;
    B.things.push({id: B.next++, x, y, i, born: K.day, sated: -1, seen: false, strength, pursuit: true, ...thing});
    K.stats.pursuers = (K.stats.pursuers || 0) + 1;
    if (K.stats.pursuers === 1 || rnd() < 0.3) say(`За караваном снарядили погоню: ${thing.label.replace('погоня: ', '')}.`, 'sight');
    return;
  }
}
