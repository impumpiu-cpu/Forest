// The calamities of the epic world (cfg.epic; data/calamities.js; docs/CAMPAIGN.md «Доработка, этап 7»).
//
// At the dawn of the world a god leaves an artifact in a sanctuary. In each era it finds a bearer, a boss: an
// ordinary monster of its kind grown past its kind's limits (agents/special.js bossSpecial). A calamity rises
// around it in phases — omens for a few years, then the rising: the boss's own lair, its retinue's lairs around,
// more lairs woken all over the world, raids. It ends with the boss's death: in the wild era a dragon kills it and
// sleeps, wounded, deep into the next era; later the peoples (atlas/alliance.js, the next stage) — and if nobody has
// by the era's last years, heroes seal it away. A grave stays where it fell, and the artifact waits for the next.
//
// a.sanctuary = {i, name};  a.artifact = {name, acc, g, i, holder: {kind: 'sanctuary'|'boss'|'grave', calamity?}, trail}
// a.calamities = [{id, era, kind, label, phase: 'waiting'|'omens'|'rise'|'fallen', omensAt, riseAt, fallAt, heroesAt,
//   i, lair, town, boss: {species, name, title, g, special}, omens: [indices left], fell: {year, by}}]
// a.graves = [{calamity, i, year, era, boss, epitaph}]
// The calamities draw from their own stream (seed:atlas:calamity), kept by its position in a.calRnd.
import {mulberry, seedNumber} from '../core/rng.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {LAIRS, TRIBE_RAID} from '../data/lairs.js';
import {SPECIES} from '../data/species.js';
import {CALAMITIES, OMENS, FALL, ARTIFACTS, DAWN, CAL} from '../data/calamities.js';
import {bossSpecial} from '../agents/special.js';
import {newLair, findSpot, wherePhrase} from './lairs.js';
import {leaderForCalamity, leaderFalls} from './leaders.js';
import {barrows} from './diplomacy.js';
import {townLabel} from './towns.js';
import {eraPlan} from './history.js';
import {stepAlliance} from './alliance.js';
import {epitaph} from './chronicle.js';
import {plural} from '../core/util.js';

const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const pick = (r, list) => list[(r() * list.length) | 0];
const xy = (a, i) => [i % a.w, (i / a.w) | 0];
const dist = (a, i, j) => { const [x, y] = xy(a, i), [p, q] = xy(a, j); return Math.hypot(x - p, y - q); };
const land = (a, i) => !!a.f.land?.[i] && !a.f.ocean[i];

// the calamities' stream, kept by its position in the world
function draw(a) {
  const r = mulberry(a.calRnd ?? seedNumber(`${a.cfg.seed}:atlas:calamity`));
  return {r, done: () => { a.calRnd = r.state; }};
}

// a line of the chronicle of calamities (atlas/history.js say, with its topic)
// a word by gender: masculine, feminine, neuter
const G3 = (g, m, f, n) => (g === 'f' ? f : g === 'n' ? n : m);
export function tell(a, text, c = null) {
  const H = a.hist;
  a.chronicle.push({era: H.era, year: H.year, season: H.season, text, topic: 'calamity', ...(c ? {calamity: c.id} : {})});
}

// the years each era starts and ends at (the first year of history is 1)
function eraYears(a) {
  const out = {}; let y = 1;
  for (const e of eraPlan(a)) { const n = e.seasons / SEASONS_PER_YEAR; out[e.id] = {from: y, to: y + n - 1, len: n}; y += n; }
  return out;
}

// ── the dawn: the sanctuary, the artifact, the plan of the three calamities
export function startCalamities(a) {
  if (!a.cfg.epic || a.calamities) return;
  const {r, done} = draw(a);
  dawn(a, r);
  const Y = eraYears(a);
  a.calamities = ['wild', 'elder', 'young'].map((era, k) => {
    const E = Y[era], kinds = CALAMITIES.filter(C => C.eras.includes(era)), C = pick(r, kinds);
    const heroesAt = E.to - CAL.heroesBefore;
    const omensAt = Math.round(E.from + E.len * between(r, CAL.start));
    const riseAt = Math.min(heroesAt - 2, omensAt + Math.round(between(r, CAL.omens)));
    const fallAt = Math.min(heroesAt, riseAt + Math.round(between(r, CAL.fall)));
    return {id: k + 1, era, kind: C.id, label: C.label, phase: 'waiting', omensAt, riseAt, fallAt, heroesAt, i: -1, lair: null, town: null, boss: null,
      omens: OMENS.map((_, n) => n), fell: null};
  });
  done();
}

// the sanctuary and the artifact a god leaves in it (once a world)
function dawn(a, r) {
  // the sanctuary: a land cell well inside the world
  let i = -1;
  for (let k = 0; k < 400 && i < 0; k++) { const x = Math.round(a.w * (0.2 + 0.6 * r())), y = Math.round(a.h * (0.2 + 0.6 * r())), j = y * a.w + x; if (land(a, j)) i = j; }
  if (i < 0) for (let j = 0; j < a.n && i < 0; j++) if (land(a, j)) i = j;
  const [name, acc, g] = pick(r, ARTIFACTS);
  a.sanctuary = {i, name: 'Святилище Творца'};
  a.artifact = {name, acc, g, i, holder: {kind: 'sanctuary'}, trail: [{year: a.hist.year, era: a.hist.era, i, text: `оставлен${G3(g, '', 'а', 'о')} в святилище`}]};
  tell(a, DAWN.replace('{where}', wherePhrase(a, i)).replace('{artifact}', acc).replace('{in}', g === 'f' ? 'ней' : 'нём'));
}

// ── «Заселение мира» (cfg.free, atlas/settle.js): a calamity set by hand — its kind (or one drawn), its place (a cell, or
// −1: as the epic world places it) and in how many years it rises; its omens come before that, and if nobody brings its
// boss down, heroes seal it CAL.fall years after it rose. The first one also leaves the sanctuary and its artifact.
// → the calamity, or {error}
export function addCalamity(a, {kind = null, at = -1, years = 10} = {}) {
  a.calamities ||= [];
  const live = a.calamities.filter(c => c.phase !== 'fallen').length;
  if (live >= CAL.free.max) return {error: `бедствий, что ещё не прошли, может быть не больше ${CAL.free.max}`};
  if (kind && !CALAMITIES.some(C => C.id === kind)) return {error: 'нет такого бедствия'};
  const {r, done} = draw(a), y = a.hist.year;
  if (!a.artifact) dawn(a, r);
  const C = kind ? CALAMITIES.find(x => x.id === kind) : pick(r, CALAMITIES);
  const riseAt = y + Math.max(1, Math.round(years));
  const omensAt = Math.max(y, riseAt - Math.round(between(r, CAL.omens)));
  const heroesAt = riseAt + Math.round(between(r, CAL.fall));
  const c = {id: a.calamities.length + 1, era: 'free', kind: C.id, label: C.label, phase: 'waiting', omensAt, riseAt, fallAt: heroesAt, heroesAt,
    i: -1, at: at >= 0 ? at : -1, lair: null, town: null, boss: null, omens: OMENS.map((_, n) => n), fell: null, byHand: true};
  a.calamities.push(c);
  done();
  tell(a, `Над миром сгущается беда: ${C.label}${at >= 0 ? ` ${wherePhrase(a, at)}` : ''}. Знамения придут через ${omensAt - y || 'считанные'} ${plural(omensAt - y, 'год', 'года', 'лет')}.`, c);
  return c;
}

// ── a year of the calamities (in spring)
export function stepCalamities(a) {
  if ((!a.cfg.epic && !a.cfg.free) || !a.calamities || a.hist.season !== 0) return;
  const {r, done} = draw(a), y = a.hist.year;
  for (const c of a.calamities) {
    if (c.phase === 'waiting' && y >= c.omensAt) { c.phase = 'omens'; omen(a, c, r); }
    else if (c.phase === 'omens' && y < c.riseAt && r() < 0.6) omen(a, c, r);
    if (c.phase === 'omens' && y >= c.riseAt) rise(a, c, r);
    // the fourth (campaign/epic.js): its lair stands from the start, its omens run while the caravan walks
    if (c.phase === 'gathering' && y < c.riseAt && r() < 0.6) omen(a, c, r);
    if (c.phase === 'gathering' && y >= c.riseAt) riseGathered(a, c, r);
    if (c.phase === 'rise') {
      const lair = a.lairs.find(l => l.id === c.lair);
      if (!lair || !lair.alive) fall(a, c, r, 'cleared');
      else if (c.era === 'wild' && y >= c.fallAt) fall(a, c, r, 'dragon');
      else if (y >= c.heroesAt) fall(a, c, r, 'heroes');
    }
    // after the wild era the peoples band together against it, and fall apart after (atlas/alliance.js)
    if (c.era !== 'wild' && c.era !== 'after' && (c.phase === 'rise' || c.phase === 'fallen')) stepAlliance(a, c, r, text => tell(a, text, c));   // the fourth is the caravan's
  }
  done();
}

function omen(a, c, r) {
  if (!c.omens.length) return;
  const n = c.omens.splice((r() * c.omens.length) | 0, 1)[0];
  tell(a, `${OMENS[n]} Недоброе знамение.`, c);
}

// where a calamity rises: a land cell far from the one before (or from the sanctuary), not in a town; a vampire —
// in a town that far
function placeOf(a, c, r) {
  const k = a.calamities.indexOf(c), before = k > 0 ? a.calamities[k - 1].i : a.sanctuary.i;
  const want = CAL.apart * Math.hypot(a.w, a.h), C = CALAMITIES.find(x => x.id === c.kind);
  const far = j => (before >= 0 ? dist(a, j, before) : want);
  if (C.town) {
    const towns = (a.towns || []).filter(t => t.alive && !t.capital && !(a.lairs || []).some(l => l.alive && l.town === t.id));
    if (!towns.length) return null;
    const ok = towns.filter(t => far(t.i) >= want);
    const t = ok.length ? pick(r, ok) : towns.reduce((b, t) => (far(t.i) > far(b.i) ? t : b));
    return {i: t.i, town: t};
  }
  const nearTown = j => (a.towns || []).some(t => t.alive && Math.abs(t.x - j % a.w) <= 3 && Math.abs(t.y - ((j / a.w) | 0)) <= 3);
  let best = -1, bd = -1;
  const ok = [];
  for (let n = 0; n < 800; n++) {
    const j = (r() * a.n) | 0;
    if (!land(a, j) || nearTown(j)) continue;
    const d = far(j);
    if (d >= want) ok.push(j);
    if (d > bd) { bd = d; best = j; }
  }
  // after the wild era a calamity rises within a raid's reach of the peoples' towns: it is a calamity to someone
  const reach = TRIBE_RAID.reach * Math.min(a.w, a.h) / 192;
  const felt = c.era === 'wild' ? [] : ok.filter(j => (a.towns || []).some(t => t.alive && Math.hypot(t.x - j % a.w, t.y - ((j / a.w) | 0)) <= reach * 0.7));
  const i = felt.length ? pick(r, felt) : ok.length ? pick(r, ok) : best;
  return i >= 0 ? {i} : null;
}

// a land cell around a place, `lo` to `hi` cells off (× the world's scale)
function around(a, i, r, [lo, hi]) {
  const k = Math.min(a.w, a.h) / 192, [x0, y0] = xy(a, i);
  for (let n = 0; n < 40; n++) {
    const ang = r() * Math.PI * 2, d = (lo + r() * (hi - lo)) * k, x = Math.round(x0 + Math.cos(ang) * d), y = Math.round(y0 + Math.sin(ang) * d);
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
    const j = y * a.w + x;
    if (land(a, j)) return j;
  }
  return -1;
}

const bossName = c => `${c.boss.title[0]} ${c.boss.name}`;
const fem = c => c.boss?.g === 'f';

// a living leader of an old lair a calamity may rise on (atlas/leaders.js): of the kinds of calamity its era allows, the
// strongest leader whose lair is of one of a kind's lairs → {C, lair} or null
function hostLeader(a, c) {
  let best = null;
  // as placeOf: after the wild era a calamity rises where it is felt — within a raid's reach of the peoples' towns
  const reach = TRIBE_RAID.reach * Math.min(a.w, a.h) / 192 * 0.7;
  const felt = l => c.era === 'wild' || (a.towns || []).some(t => t.alive && Math.hypot(t.x - l.x, t.y - l.y) <= reach);
  for (const C of CALAMITIES.filter(x => x.eras.includes(c.era) && !x.town)) {
    const l = leaderForCalamity(a, C.lairs || [C.lair], felt);
    if (l && (!best || l.strength > best.lair.strength)) best = {C, lair: l};
  }
  return best;
}

// the place the hand chose: the cell (a vampire — the nearest living town within a raid's reach of it)
function placeAt(a, c, C) {
  if (!C.town) return {i: c.at};
  const reach = TRIBE_RAID.reach * Math.min(a.w, a.h) / 192;
  const t = (a.towns || []).filter(t => t.alive && !(a.lairs || []).some(l => l.alive && l.town === t.id)).sort((p, q) => dist(a, p.i, c.at) - dist(a, q.i, c.at))[0];
  return t && dist(a, t.i, c.at) <= reach ? {i: t.i, town: t} : null;
}

function rise(a, c, r) {
  let C = CALAMITIES.find(x => x.id === c.kind), place = null, host = null;
  // half the time the calamity takes one of the living leaders of the old lairs for its boss (CAL.fromLeader); not one
  // whose place the hand chose (atlas/settle.js) — there it rises where it was set
  if (c.at >= 0) place = placeAt(a, c, C);
  else if (r() < CAL.fromLeader) host = hostLeader(a, c);
  if (host) { C = host.C; c.kind = C.id; c.label = C.label; place = {i: host.lair.i}; }
  else if (!place) place = placeOf(a, c, r);
  if (!place && C.town) { C = CALAMITIES.find(x => x.id === 'necromancer'); c.kind = C.id; c.label = C.label; place = c.at >= 0 ? {i: c.at} : placeOf(a, c, r); }   // no towns to nest in
  if (!place) { c.phase = 'fallen'; c.fell = {year: a.hist.year, by: 'none'}; return; }
  const L = host ? LAIRS.get(host.lair.kind) : LAIRS.get(C.lairs ? pick(r, C.lairs) : C.lair), species = C.boss || L.species, sp = SPECIES.get(species);
  const lair = host ? host.lair : newLair(a, L, place.i, r, 1);
  if (host) { lair.strength = 1; lair.lord = null; }
  lair.boss = c.id;
  if (place.town) lair.town = place.town.id;
  if (L.undead) barrows(a, place.i, Math.max(2, Math.round(3 * Math.min(a.w, a.h) / 192)), 0.9);   // the dead want graves to rise from
  const roll = sp?.special ? bossSpecial(sp, r, CAL.boss) : {special: null};
  const was = host ? lair.leader : null;
  // a leader become a boss keeps its name and grows on from what it was
  if (was?.special && roll.special) for (const id of Object.keys(roll.special)) roll.special[id] = Math.max(roll.special[id], was.special[id] ?? 0);
  c.i = place.i; c.lair = lair.id; c.town = place.town?.id ?? null; c.phase = 'rise';
  // (a leader keeps its own title too: a pack's leader is not «the Mother» of a brood)
  c.boss = {species, name: was ? was.name : pick(r, C.names), title: was ? was.title : C.title, g: was ? 'm' : C.g, special: roll.special, ...(was ? {wasLeader: `${was.title[0]} ${was.name}`} : {})};
  if (host) { tell(a, `${was.title[0]} ${was.name} из «${lair.name}» ${wherePhrase(a, lair.i)} стал больше, чем главарём: на него пал выбор бедствия.`, c); leaderFalls(a, lair, 'boss'); }
  // the retinue around the boss, and lairs woken all over the world
  const kinds = C.retinue.length ? C.retinue : [L.id];
  const n = Math.round(between(r, CAL.retinue));
  for (let q = 0; q < n; q++) { const j = around(a, place.i, r, CAL.near); if (j >= 0) newLair(a, LAIRS.get(kinds[q % kinds.length]), j, r, 0.6).retinue = c.id; }
  const wild = LAIRS.filter(x => !x.undead && !x.dragon && !x.fiend), stir = Math.round(between(r, CAL.stir));
  let woke = 0;
  for (let q = 0; q < stir; q++) { const W = pick(r, wild), j = findSpot(a, W, r, null, 200); if (j >= 0) { newLair(a, W, j, r, 0.4); woke++; } }
  const where = wherePhrase(a, place.i);
  tell(a, C.rise.replace('{boss}', bossName(c)).replace('{lair}', lair.name).replace('{where}', where)
    .replace('{town}', place.town ? `${townLabel(place.town, 3)} ${place.town.name}` : where) + (woke ? ` По всему миру ожили логова чудовищ: ${woke}.` : ''), c);
  // the artifact has a new bearer
  const A = a.artifact;
  A.holder = {kind: 'boss', calamity: c.id}; A.i = place.i;
  A.trail.push({year: a.hist.year, era: a.hist.era, i: place.i, text: `у ${c.boss.title[1].toLowerCase()} по имени ${c.boss.name}`});
  tell(a, FALL.taken.replace('{artifact}', A.name).replace('{found}', A.g === 'f' ? 'ла' : A.g === 'n' ? 'ло' : 'ёл').replace('{boss}', bossName(c)), c);
}

// the boss falls to an alliance (atlas/alliance.js): `line` tells how
export const fallToAlliance = (a, c, line) => { if (c.phase === 'rise') fall(a, c, null, 'alliance', line); };

function fall(a, c, r, by, told = null) {
  const lair = a.lairs.find(l => l.id === c.lair), where = wherePhrase(a, c.i), f = fem(c);
  const words = s => s.replace(/\{boss\}/g, bossName(c)).replace(/\{lair\}/g, lair?.name || '').replace(/\{where\}/g, where).replace(/\{a\}/g, f ? 'а' : '')
    .replace(/\{him\}/g, f ? 'ней' : 'ним').replace(/\{gen\}/g, f ? 'неё' : 'него').replace(/\{dat\}/g, f ? 'ей' : 'ему').replace(/\{he\}/g, f ? 'она' : 'он').replace(/\{his\}/g, f ? 'её' : 'его');
  let line;
  if (by === 'dragon') {
    const dragons = (a.lairs || []).filter(l => l.alive && LAIRS.get(l.kind).dragon);
    const d = dragons.sort((p, q) => dist(a, p.i, c.i) - dist(a, q.i, c.i))[0];
    if (d) {
      const Y = eraYears(a);
      d.strength *= 0.5;
      d.sleep = Math.max(5, Math.round(Y.elder.from + Y.elder.len / 2 - a.hist.year));   // wounded: it wakes deep in the next era
      line = words(FALL.dragon).replace('{dragon}', d.name);
    } else { by = 'beasts'; line = words(FALL.beasts); }
  } else line = told || words(FALL[by]);
  if (lair && lair.alive) { lair.alive = false; lair.died = a.hist.year; }
  c.phase = 'fallen'; c.fell = {year: a.hist.year, by};
  // the grave where it fell
  barrows(a, c.i, Math.max(1, Math.round(CAL.grave.r * Math.min(a.w, a.h) / 192)), CAL.grave.v);
  const A = a.artifact;
  (a.graves ||= []).push({calamity: c.id, i: c.i, year: a.hist.year, era: c.era, boss: bossName(c), kind: c.kind, by, epitaph: epitaph(a, c)});
  A.holder = {kind: 'grave', calamity: c.id}; A.i = c.i;
  A.trail.push({year: a.hist.year, era: a.hist.era, i: c.i, text: `пропал${G3(A.g, '', 'а', 'о')} с гибелью ${c.boss.title[1].toLowerCase()} по имени ${c.boss.name}`});
  tell(a, line, c);
  tell(a, words(FALL.artifact).replace('{artifact}', A.name), c);
  void r;
}

// ── the fourth calamity (campaign/epic.js): it gathers at a seat when a caravan sets out after the artifact; its
// lair stands at once with the boss in it, the artifact goes there; it rises in the world `years` later
export function gatherFourth(a, i, years) {
  const {r, done} = draw(a);
  const kinds = CALAMITIES.filter(C => !C.town), C = pick(r, kinds);
  const L = LAIRS.get(C.lairs ? pick(r, C.lairs) : C.lair), species = C.boss || L.species, sp = SPECIES.get(species);
  const lair = newLair(a, L, i, r, 1);
  const c = {id: a.calamities.length + 1, era: 'after', kind: C.id, label: C.label, phase: 'gathering', omensAt: a.hist.year, riseAt: a.hist.year + years,
    i, lair: lair.id, town: null, omens: OMENS.map((_, n) => n), fell: null,
    boss: {species, name: pick(r, C.names), title: C.title, g: C.g, special: sp?.special ? bossSpecial(sp, r, CAL.boss).special : null}};
  lair.boss = c.id;
  if (L.undead) barrows(a, i, Math.max(2, Math.round(3 * Math.min(a.w, a.h) / 192)), 0.9);
  a.calamities.push(c);
  const A = a.artifact;
  A.holder = {kind: 'boss', calamity: c.id}; A.i = i;
  A.trail.push({year: a.hist.year, era: a.hist.era, i, text: `у ${c.boss.title[1].toLowerCase()} по имени ${c.boss.name}`});
  tell(a, `${A.name} покинул${A.g === 'f' ? 'а' : A.g === 'n' ? 'о' : ''} могилу: ${wherePhrase(a, i)}, в логове «${lair.name}», ${bossName(c)} собирает силы. До нового бедствия — ${years} лет.`, c);
  omen(a, c, r);
  done();
  return c;
}
function riseGathered(a, c, r) {
  const C = CALAMITIES.find(x => x.id === c.kind), lair = a.lairs.find(l => l.id === c.lair);
  if (!lair || !lair.alive) { c.phase = 'fallen'; c.fell = {year: a.hist.year, by: 'cleared'}; return; }
  c.phase = 'rise';
  const kinds = C.retinue.length ? C.retinue : [lair.kind];
  for (let q = 0, n = Math.round(between(r, CAL.retinue)); q < n; q++) { const j = around(a, c.i, r, CAL.near); if (j >= 0) newLair(a, LAIRS.get(kinds[q % kinds.length]), j, r, 0.6).retinue = c.id; }
  const wild = LAIRS.filter(x => !x.undead && !x.dragon && !x.fiend), stir = Math.round(between(r, CAL.stir));
  let woke = 0;
  for (let q = 0; q < stir; q++) { const W = pick(r, wild), j = findSpot(a, W, r, null, 200); if (j >= 0) { newLair(a, W, j, r, 0.4); woke++; } }
  tell(a, `Началось новое бедствие — ${c.label}: ${bossName(c)} выступил${fem(c) ? 'а' : ''} из логова «${lair.name}» ${wherePhrase(a, c.i)}.${woke ? ` По всему миру ожили логова чудовищ: ${woke}.` : ''}`, c);
}
// the fourth falls to the caravan's storm (campaign/epic.js): its grave, and the artifact in the caravan's hands
export function fallToCaravan(a, c, line) {
  if (c.phase === 'fallen') return;
  fall(a, c, null, 'caravan', line);
  const A = a.artifact; A.holder = {kind: 'caravan', calamity: c.id};
  A.trail.at(-1).text = `взят${G3(A.g, '', 'а', 'о')} караваном у ${c.boss.title[1].toLowerCase()} по имени ${c.boss.name}`;
  a.chronicle.at(-1).text = `${A.name} не пропал${A.g === 'f' ? 'а' : A.g === 'n' ? 'о' : ''}: ${A.g === 'f' ? 'её' : 'его'} унёс караван.`;
}

// the calamity whose boss holds a lair (for the screen: a boss's mark)
export const calamityOf = (a, lair) => (lair?.boss != null ? a.calamities?.find(c => c.id === lair.boss) : null);
