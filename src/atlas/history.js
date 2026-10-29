// The history of the world map: the clock (one season a step), the eras (data/history.js) and the
// chronicle of what happens. The wild era: the beasts as fields (atlas/fauna.js) and the monsters'
// lairs (atlas/lairs.js). The era of the elder peoples: elves and dwarves come, spread, found and grow
// towns (atlas/peoples.js) and wear roads between them (atlas/roads.js); the wild goes on around them.
// History draws from its own random stream, so the land made before it does not change when history
// is reworked.
import {mulberry, seedNumber} from '../core/rng.js';
import {plural} from '../core/util.js';
import {SEASONS} from '../data/seasons.js';
import {SEASONS_PER_YEAR, SEASON_DAYS} from '../data/atlas.js';
import {ERAS, WILD_YEARS, EPIC_YEARS, FAUNA} from '../data/history.js';
import {ELDER_YEARS, YOUNG_YEARS, WORLD_PEOPLES} from '../data/peoples.js';
import {ROADS} from '../data/roads.js';
import {arrive, stepPeoples, townLabel} from './peoples.js';
import {townFx} from './towns.js';
import {wearRoads} from './roads.js';
import {sailLanes} from './sea.js';
import {SEA} from '../data/roads.js';
import {LAIRS} from '../data/lairs.js';
import {initFauna, stepFauna, rollWeather, plague} from './fauna.js';
import {placeLairs, stepLairs, wherePhrase} from './lairs.js';
import {stepLeaders, freeVassals} from './leaders.js';
import {stepCourts} from './court.js';
import {forgetSites} from './sites.js';
import {stepParties} from './parties.js';
import {stepEconomies} from './economy.js';
import {startCalamities, stepCalamities} from './calamity.js';
import {stepKingdom} from './kingdom.js';

const SEASON_LIST = SEASONS.all();

// the epic world's years of each era (data/history.js EPIC_YEARS): drawn once from their own stream, kept in the world
export function epicYears(a) {
  if (!a.epicYears && a.cfg.epicYears) a.epicYears = {...a.cfg.epicYears};   // set by hand (tests: short eras)
  if (!a.epicYears) {
    const r = mulberry(seedNumber(`${a.cfg.seed}:atlas:epic`)), Y = EPIC_YEARS;
    a.epicYears = Object.fromEntries(Object.entries(Y).map(([id, [lo, hi]]) => [id, Math.round(lo + r() * (hi - lo))]));
  }
  return a.epicYears;
}
// the eras with their length in seasons, in order
export const eraPlan = a => {
  if (a.cfg.free) return [{id: 'free', seasons: Math.ceil((a.hist?.end || 0) / SEASONS_PER_YEAR) * SEASONS_PER_YEAR}];   // «Заселение мира»: one stretch, as long as the hand has run it
  if (a.cfg.epic) { const Y = epicYears(a); return ['wild', 'elder', 'young'].map(id => ({id, seasons: Y[id] * SEASONS_PER_YEAR})); }
  return [
    {id: 'wild', seasons: WILD_YEARS[a.cfg.wild ?? 1].years * SEASONS_PER_YEAR},
    {id: 'elder', seasons: ELDER_YEARS[a.cfg.elder ?? 1].years * SEASONS_PER_YEAR},
    {id: 'young', seasons: YOUNG_YEARS[a.cfg.young ?? 1].years * SEASONS_PER_YEAR},
  ];
};
export const historyLength = a => eraPlan(a).reduce((s, e) => s + e.seasons, 0);
export const historyDone = a => !!a.hist && a.hist.step >= a.hist.end;
// the years history has lived (the year it stands at is not lived yet), and the year a run of it ends in
export const yearsLived = a => (a.hist ? Math.max(0, a.hist.year - 1) : 0);
export const endYear = a => (a.hist ? Math.floor(a.hist.end / SEASONS_PER_YEAR) + 1 : 0);
export const seasonLabel = s => SEASON_LIST[s % SEASON_LIST.length].label.toLowerCase();

// the world cell in the middle of a coarse fauna cell (on land if there is any)
function coarseToCell(a, j) {
  const F = a.fauna, x0 = (j % F.W) * F.c, y0 = ((j / F.W) | 0) * F.c;
  let best = Math.min(a.n - 1, (y0 + (F.c >> 1)) * a.w + x0 + (F.c >> 1));
  for (let y = y0; y < Math.min(a.h, y0 + F.c); y++) for (let x = x0; x < Math.min(a.w, x0 + F.c); x++) if (!a.f.ocean[y * a.w + x]) return y * a.w + x;
  return best;
}

function say(a, text) {
  const H = a.hist;
  // a line, or {text, topic} (the kingdom's lines are 'kingdom': minor in the chronicle, atlas/chronicle.js)
  a.chronicle.push(typeof text === 'string' ? {era: H.era, year: H.year, season: H.season, text} : {era: H.era, year: H.year, season: H.season, ...text});
}

export function startHistory(a) {
  const rnd = mulberry(seedNumber(`${a.cfg.seed}:atlas:history`));
  a.hist = {era: 'wild', year: 1, season: 0, step: 0, end: historyLength(a), rnd, nextLair: 1, names: new Set(), last: {}};
  a.f.road ||= new Float32Array(a.n); a.towns ||= [];   // the parties of the wild walk a world without roads or towns yet
  initFauna(a, rnd);
  const t = placeLairs(a, rnd);
  const parts = LAIRS.filter(L => !L.tribe && t[L.id]).map(L => `${L.label} — ${t[L.id]}`), tribes = LAIRS.filter(L => L.tribe && t[L.id]).map(L => `${L.label} — ${t[L.id]}`);
  const old = a.lairs.filter(l => l.ancient).length;
  say(a, `Началась ${ERAS.get('wild').label.toLowerCase()}. Городов ещё нет; звери расходятся по своим краям` +
    (parts.length ? `, чудовища заняли логова: ${parts.join(', ')}` : '') + (tribes.length ? `; дикие племена разбили станы: ${tribes.join(', ')}` : '') +
    (old ? `. ${old} ${plural(old, 'логово стоит', 'логова стоят', 'логов стоят')} с незапамятных времён.` : '.'));
  for (const i of a.ancientBarrows || []) say(a, `Курганы незапамятных времён стоят ${wherePhrase(a, i)}: кто в них лежит, не помнит никто.`);
  startCalamities(a);   // the epic world: the sanctuary, the artifact, the three calamities (atlas/calamity.js)
}

// the new roads of a round, in one line: the first two pairs by name, the rest counted
function roadsLine(a, fresh, say) {
  if (!fresh.length) return;
  const named = fresh.slice(0, 2).map(([p, q]) => `${p.name} и ${q.name}`), rest = fresh.length - named.length;
  say(`Протоптали ${fresh.length === 1 ? 'дорогу' : 'дороги'} между ${named.join(', между ')}` + (rest ? ` и ещё ${rest} ${plural(rest, 'парой городов', 'парами городов', 'парами городов')}` : '') + '.');
}

// one season of history. `onDay(day)` — optional: called after the parties' every day of the season
// (atlas/parties.js), so that a campaign's caravan walks the same days as the world's armies (campaign/)
export function stepHistory(a, onDay = null) {
  const H = a.hist, rnd = H.rnd, season = SEASON_LIST[H.season].id, F = a.fauna;
  if (H.season === 0) {
    rollWeather(a, rnd);
    const m = plague(a, rnd);
    if (m) say(a, `Мор: ${m.s.sp.plural} гибнут ${wherePhrase(a, coarseToCell(a, m.j))}.`);
  }
  // the worst weather of the year, if it is bad enough, is remembered and kills more: a harsh winter
  // where winters freeze, a drought in the dry season where they do not
  if (season === 'winter' && rnd() < FAUNA.harshChance) {
    let worst = 0, wj = -1;
    for (let j = 0; j < F.weather.length; j++) if (F.weather[j] < worst && F.list.some(s => s.K[j] > 0.3)) { worst = F.weather[j]; wj = j; }
    if (worst < FAUNA.harshAt) {
      const r = FAUNA.harshRadius, bx = wj % F.W, by = (wj / F.W) | 0, cell = coarseToCell(a, wj);
      for (const s of F.list) if (s.role !== 'spirit') for (let y = Math.max(0, by - r); y <= Math.min(F.H - 1, by + r); y++) for (let x = Math.max(0, bx - r); x <= Math.min(F.W - 1, bx + r); x++) s.N[y * F.W + x] *= 1 - FAUNA.harsh;
      const cold = a.f.temp[cell] - a.f.trange[cell] / 2 < 0;
      // the towns of the stricken country starve too: granaries and cellars soften it, healers save the weak
      const hit = [];
      for (const t of a.towns || []) {
        if (!t.alive || Math.abs(((t.x / F.c) | 0) - bx) > r || Math.abs(((t.y / F.c) | 0) - by) > r) continue;
        const fx = townFx(t), loss = FAUNA.townHarsh * Math.max(0.25, 1 - 0.6 * fx.food - 0.4 * fx.health);
        t.pop *= 1 - loss; hit.push(t);
      }
      const dead = hit.length ? `; в ${hit.length === 1 ? `${townLabel(hit[0], 3)} ${hit[0].name}` : `${hit.length} ${plural(hit.length, 'городе', 'городах', 'городах')}`} ${cold ? 'голод и мор' : 'голод'}` : '';
      say(a, cold ? `Лютая зима ${wherePhrase(a, cell)}: звери гибли от мороза и бескормицы${dead}.` : `Засуха ${wherePhrase(a, cell)}: травы выгорели, звери гибли от бескормицы${dead}.`);
    }
  }
  // the elder peoples: they come at the start of their era and live a year at a time from then on
  const free = !!a.cfg.free, plan = eraPlan(a), wildEnd = free ? 0 : plan[0].seasons, elderEnd = free ? -1 : wildEnd + plan[1].seasons;
  if (!free && (H.step === wildEnd || H.step === elderEnd)) {
    H.era = H.step === wildEnd ? 'elder' : 'young';
    say(a, `Началась ${ERAS.get(H.era).label.toLowerCase()}.`);
    arrive(a, H.era, rnd, t => say(a, t));
  }
  if (H.era !== 'wild' && season === 'spring') {
    forgetSites(a, H.year);
    stepPeoples(a, rnd, t => say(a, t));
    if ((H.step - wildEnd) % (ROADS.every * SEASONS_PER_YEAR) === 0)
      roadsLine(a, wearRoads(a), t => say(a, t));
    if ((H.step - wildEnd) % (SEA.every * SEASONS_PER_YEAR) === 0)
      for (const [p, q] of sailLanes(a)) say(a, `Корабли ${townLabel(p, 2)} ${p.name} проложили морской путь в ${townLabel(q, 1)} ${q.name}.`);
  }
  const totals = stepFauna(a, season);
  for (const line of stepLairs(a, rnd, season)) say(a, line);
  stepLeaders(a, t => say(a, t));
  stepCourts(a, rnd, season, t => say(a, t));   // the realms' deeds: war, peace, armies, raids, lairs cleared (atlas/court.js)
  stepKingdom(a, t => say(a, t));   // the realms as kingdoms: their own stream, in spring (atlas/kingdom.js)
  stepCalamities(a);
  // the towns' households: a season of the flows of their buildings (no die: atlas/economy.js)
  stepEconomies(a, SEASON_DAYS);
  stepParties(a, rnd, t => say(a, t), onDay);
  freeVassals(a);   // the lairs that fell this season, by any hand, free their vassals (atlas/leaders.js)
  // the year's beaten raids of the tribes and the dead, in one line
  if (H.season === 3 && H.repelled) {
    const parts = Object.entries(H.repelled).map(([p, n]) => `${WORLD_PEOPLES.get(p).label} — ${n}`);
    const total = Object.values(H.repelled).reduce((x, v) => x + v, 0);
    say(a, `За год отбито ${total} ${plural(total, 'набег дикарей и мертвецов', 'набега дикарей и мертвецов', 'набегов дикарей и мертвецов')}: ${parts.join(', ')}.`);
    H.repelled = null;
  }
  // booms and busts of whole species against their own running average; the two most striking a year
  if (H.season === 3) {
    const news = [];
    for (const [k, s] of a.fauna.list.entries()) {
      if (s.role === 'spirit' || s.role === 'folk' || s.role === 'dead' || s.usual <= 0) continue;   // (the tribes are folk, not beasts)
      const t = totals[k], avg = s.avg;
      s.avg = avg == null ? t : avg * 0.8 + t * 0.2;
      if (t === 0 && avg > 0) { news.push([9, `В мире не осталось ни одного зверя: ${s.sp.plural} вымерли.`]); continue; }
      if (avg == null || H.year < 5 || H.year - (H.last[s.id] ?? -99) < FAUNA.cooldown) continue;
      const r = t / avg;
      if (r > FAUNA.boom) news.push([r, `Год изобилия: ${s.sp.plural} расплодились, как никогда.`, s.id]);
      else if (r < FAUNA.bust) news.push([1 / r, `Тяжёлые годы: ${s.sp.plural} почти перевелись.`, s.id]);
    }
    for (const [, text, id] of news.sort((x, y) => y[0] - x[0]).slice(0, 2)) { if (id) H.last[id] = H.year; say(a, text); }
  }
  H.step++;
  H.season = (H.season + 1) % SEASON_LIST.length;
  if (H.season === 0) H.year++;
  if (!free && H.step === wildEnd) {
    const alive = a.lairs.filter(l => l.alive).length, gone = a.lairs.length - alive;
    say(a, `Дикая эра подошла к концу: ${alive} ${plural(alive, 'логово', 'логова', 'логов')} чудовищ стоит, ${gone} ${plural(gone, 'опустело', 'опустели', 'опустели')}. Мир ждёт первых народов.`);
  }
  // the end of an era is told once: a campaign lets history run on past the planned end (campaign/)
  if (!free && (H.step === elderEnd || (H.step === H.end && !H.endTold))) {
    const towns = a.towns.filter(t => t.alive), parts = [];
    for (const pe of a.peoples) {
      const mine = towns.filter(t => t.people === pe.id), pop = Math.round(mine.reduce((x, t) => x + t.pop, 0));
      const realms = (a.realms || []).filter(r => r.people === pe.id && mine.some(t => t.realm === r.id)).length;
      parts.push(`${pe.P.label} — ${realms} ${plural(realms, 'держава', 'державы', 'держав')}, ${mine.length} ${plural(mine.length, 'город', 'города', 'городов')}, ${pop} ${plural(pop, 'житель', 'жителя', 'жителей')}`);
    }
    if (H.step === elderEnd && H.step < H.end) say(a, `Эпоха древних народов подошла к концу: ${parts.join('; ')}. Скоро придут люди и орки.`);
    else {
      const wars = Object.values(a.rel || {}).reduce((x, r) => x + r.wars, 0), ruins = (a.ruins || []).length;
      H.endTold = true;
      say(a, `Эпоха молодых народов подошла к концу: ${parts.join('; ')}. Войн было ${wars}, сожжено городов: ${ruins}. История мира ждёт поселенцев.`);
    }
  }
}
