// «Заселение мира» (docs/TABLE.md, этап 9): history on a land made in «Создать землю», led by hand. There are no eras
// (cfg.free; atlas/history.js runs one stretch 'free'): the hand brings the disturbances — peoples landed where it
// points (their founding town and realm), lairs of monsters set where it points or the wild's lairs as the land gives
// them, up to three calamities with their kind, place and year — and then runs the clock 5–100 years at a time; looks,
// steps in again, runs on. Everything else is the world's history as it always was: the beasts, the lairs and their
// leaders, the peoples' fields, towns, roads, trade, wars, technologies, the calamities' omens, rising and fall.
//
// The hand's acts draw from the history's own stream, so the same land with the same acts in the same order is the same
// world (tools/settle-check.mjs).
import {mulberry, seedNumber} from '../core/rng.js';
import {plural} from '../core/util.js';
import {FREE} from '../data/history.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {LAIRS, LAIR_LIFE} from '../data/lairs.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {CALAMITIES} from '../data/calamities.js';
import {landDone, runNextStage} from './generate.js';
import {initFauna, faunaCell} from './fauna.js';
import {seedRot, wildLairs, newLair, groundFits, homeField, wherePhrase, R as lairRadius} from './lairs.js';
import {landBand, townAt} from './peoples.js';
import {addCalamity, deadGraves} from './calamity.js';
import {worldSubs} from './realms.js';

function say(a, text) {
  const H = a.hist;
  a.chronicle.push({era: H.era, year: H.year, season: H.season, text, hand: true});
}

// the land becomes a world with a clock: the beasts spread by the land, the old barrows are there, no lair, no people yet
export function startFree(a) {
  if (!landDone(a)) throw new Error('земля ещё не готова');
  if (a.hist) throw new Error('у этого мира уже идёт история');
  a.cfg = {...a.cfg, free: true};
  const rnd = mulberry(seedNumber(`${a.cfg.seed}:atlas:history`));
  a.hist = {era: 'free', year: 1, season: 0, step: 0, end: 0, rnd, nextLair: 1, names: new Set(), last: {}};
  a.f.road ||= new Float32Array(a.n); a.towns ||= []; a.peoples ||= []; a.realms ||= []; a.contacts ||= {};
  initFauna(a, rnd);
  a.lairs = []; a.tribeLand = {};
  a.ancientBarrows = seedRot(a, rnd);
  say(a, 'Мир ждёт руки: звери уже расходятся по своим краям, но ни городов, ни логов ещё нет.');
  for (const i of a.ancientBarrows) say(a, `Курганы незапамятных времён стоят ${wherePhrase(a, i)}: кто в них лежит, не помнит никто.`);
  return a;
}
export const isFree = a => !!a?.cfg?.free;
const busy = a => a.hist.step < a.hist.end;

// the lairs of the wild as the land gives them (once): every kind as many as its ground feeds
export function wildByLand(a) {
  if (a.hist.wild) return {error: 'логова по земле уже легли'};
  const t = wildLairs(a, a.hist.rnd);
  a.hist.wild = true;
  const parts = LAIRS.filter(L => t[L.id]).map(L => `${L.label} — ${t[L.id]}`), n = Object.values(t).reduce((s, v) => s + v, 0);
  say(a, n ? `Чудовища заняли логова, какие им дала земля: ${parts.join(', ')}.` : 'Земля не дала чудовищам ни одного логова.');
  return {n};
}

// what the hand may set: the peoples with their sub-races, the lair kinds, the calamities
export const PLACEABLE = {
  peoples: () => WORLD_PEOPLES.all().map(P => ({id: P.id, label: P.label, color: P.color, subs: worldSubs(P.race).map(s => ({id: s.id, label: s.plural || s.label}))})),
  // a vampire's manor is in a town (it comes by itself, or as a calamity)
  lairs: () => LAIRS.filter(L => L.at !== 'town').map(L => ({id: L.id, label: L.label, color: L.color, kind: L.tribe ? 'племя' : L.undead ? 'мёртвые' : L.fiend ? 'демоны' : L.dragon ? 'дракон' : 'чудовища'})),
  calamities: () => CALAMITIES.map(C => ({id: C.id, label: C.label, town: !!C.town})),
};

// a people's band landed by hand near a cell → {town, realm} or {error}
export function landPeople(a, peopleId, i, subId = null) {
  if (busy(a)) return {error: 'время идёт — дождитесь конца отрезка'};
  if (!WORLD_PEOPLES.has(peopleId)) return {error: 'нет такого народа'};
  if (a.f.ocean[i]) return {error: 'это море'};
  return landBand(a, peopleId, i, subId, a.hist.rnd, t => say(a, t));
}

const GROUND = {heights: 'им нужны высокие крутые горы', volcano: 'им нужен вулкан', caves: 'им нужны пещеры — известняк или базальт', deep: 'им нужна глухая чаща',
  open: 'им нужны открытые края: тундра, тайга, степь, луга', home: 'это не их земля', rift: 'разлом открывается у вулкана или на шве плит в горах'};

// a lair set by hand on a cell → the lair or {error}. The dead get graves (and rot) about them to feed on.
export function addLair(a, kindId, i) {
  if (busy(a)) return {error: 'время идёт — дождитесь конца отрезка'};
  const L = LAIRS.has(kindId) ? LAIRS.get(kindId) : null;
  if (!L || L.at === 'town') return {error: 'такое логово рукой не ставится'};
  if (a.f.ocean[i] || a.f.lake[i] >= 0) return {error: 'это вода'};
  if (townAt(a, i) || a.siteAt?.[i]) return {error: 'здесь город или его угодья'};
  const p = {x: i % a.w, y: (i / a.w) | 0};
  if (a.lairs.some(o => o.alive && o.kind === L.id && Math.hypot(o.x - p.x, o.y - p.y) < lairRadius(a, L))) return {error: 'рядом уже стоит такое же логово'};
  if (L.ground === 'rot') {
    deadGraves(a, i);
    const j = faunaCell(a, i); a.rot[j] = Math.max(a.rot[j], (L.rotAt || FREE.rotAt) * FREE.rot);
  } else if (!groundFits(a, L, i)) return {error: `${L.label}: ${GROUND[L.ground] || 'не их место'}`};
  if (L.tribe) a.tribeLand[L.id] ||= homeField(a, L);
  const lair = newLair(a, L, i, a.hist.rnd, L.dragon ? LAIR_LIFE.dragonStart : FREE.lair);
  lair.byHand = true;
  say(a, `${L.label[0].toUpperCase() + L.label.slice(1)} «${lair.name}» ${L.g === 'pl' ? 'легли' : L.g === 'f' ? 'встала' : L.g === 'n' ? 'встало' : 'встал'} ${wherePhrase(a, i)}${SPECIES.has(L.species) ? ` — ${SPECIES.get(L.species).plural}` : ''}.`);
  return lair;
}

// a calamity set by hand (atlas/calamity.js addCalamity): kind (null — drawn), place (−1 — as the world places it), years
export function setCalamity(a, {kind = null, at = -1, years = FREE.calIn[1]} = {}) {
  if (busy(a)) return {error: 'время идёт — дождитесь конца отрезка'};
  if (at >= 0 && (a.f.ocean[at] || a.f.lake[at] >= 0)) return {error: 'это вода'};
  if (at >= 0 && (townAt(a, at) || a.siteAt?.[at])) return {error: 'здесь город или его угодья — бедствие встаёт в глуши (вампир найдёт город сам)'};
  return addCalamity(a, {kind, at, years});
}

// may a caravan set out from this world (app/campView.js «В поход»): null, or why not
export function canMarch(a) {
  if (!a?.hist) return 'в мире ещё нет истории';
  if (busy(a)) return 'время идёт — дождитесь конца отрезка';
  return (a.towns || []).some(t => t.alive && t.capital) ? null : 'в мире нет ни одной столицы — высадите народ';
}
export const wildDone = a => !!a.hist?.wild;

// a stretch of the clock run on: seasons while `more()` says so (the screen gives a frame's budget); the line at its end
// is told here, once, when the stretch is done → true when it is
export function stepRun(a, more = () => true) {
  while (busy(a) && more()) runNextStage(a);
  if (busy(a)) return false;
  endRun(a);
  return true;
}

// the clock: the next `years` are to run (runNextStage steps them a season at a time, as any history)
export function runYears(a, years) {
  const H = a.hist;
  H.end = Math.max(H.end, H.step) + Math.round(years * SEASONS_PER_YEAR);
  H.runFrom = H.year; H.runStats = stats(a);
}

// what the world holds now: for the line at the end of a stretch
function stats(a) {
  const towns = (a.towns || []).filter(t => t.alive);
  return {towns: towns.length, pop: Math.round(towns.reduce((s, t) => s + t.pop, 0)), realms: (a.realms || []).filter(r => towns.some(t => t.realm === r.id)).length,
    lairs: (a.lairs || []).filter(l => l.alive).length, ruins: (a.ruins || []).length};
}

// the line at the end of a stretch: how the world changed
export function endRun(a) {
  const H = a.hist, was = H.runStats; if (!was) return;
  const now = stats(a), years = H.year - H.runFrom;
  const d = (n, m) => (n === m ? `${n}` : `${m} → ${n}`);
  say(a, `Прошло ${years} ${plural(years, 'год', 'года', 'лет')}. Городов ${d(now.towns, was.towns)}, жителей ${d(now.pop, was.pop)}, держав ${d(now.realms, was.realms)}, логов ${d(now.lairs, was.lairs)}` +
    (now.ruins > was.ruins ? `, сожжено городов: ${now.ruins - was.ruins}` : '') + '.');
  H.runStats = null;
}
