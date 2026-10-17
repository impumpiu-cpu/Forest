// The history of the world map: the clock (one season a step), the eras (data/history.js) and the
// chronicle of what happens. The wild era: the beasts as fields (atlas/fauna.js) and the monsters'
// lairs (atlas/lairs.js). The era of the elder peoples: elves and dwarves come, spread, found and grow
// towns (atlas/peoples.js) and wear roads between them (atlas/roads.js); the wild goes on around them.
// History draws from its own random stream, so the land made before it does not change when history
// is reworked.
import {mulberry, seedNumber} from '../core/rng.js';
import {plural} from '../core/util.js';
import {SEASONS} from '../data/seasons.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {ERAS, WILD_YEARS, FAUNA} from '../data/history.js';
import {ELDER_YEARS, YOUNG_YEARS} from '../data/peoples.js';
import {ROADS} from '../data/roads.js';
import {arrive, stepPeoples} from './peoples.js';
import {wearRoads} from './roads.js';
import {LAIRS} from '../data/lairs.js';
import {initFauna, stepFauna, rollWeather, plague} from './fauna.js';
import {placeLairs, stepLairs, wherePhrase} from './lairs.js';

const SEASON_LIST = SEASONS.all();

// the eras with their length in seasons, in order
export const eraPlan = a => [
  {id: 'wild', seasons: WILD_YEARS[a.cfg.wild ?? 1].years * SEASONS_PER_YEAR},
  {id: 'elder', seasons: ELDER_YEARS[a.cfg.elder ?? 1].years * SEASONS_PER_YEAR},
  {id: 'young', seasons: YOUNG_YEARS[a.cfg.young ?? 1].years * SEASONS_PER_YEAR},
];
export const historyLength = a => eraPlan(a).reduce((s, e) => s + e.seasons, 0);
export const historyDone = a => !!a.hist && a.hist.step >= a.hist.end;
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
  a.chronicle.push({era: H.era, year: H.year, season: H.season, text});
}

export function startHistory(a) {
  const rnd = mulberry(seedNumber(`${a.cfg.seed}:atlas:history`));
  a.hist = {era: 'wild', year: 1, season: 0, step: 0, end: historyLength(a), rnd, nextLair: 1, names: new Set(), last: {}};
  initFauna(a, rnd);
  const t = placeLairs(a, rnd);
  const parts = LAIRS.filter(L => t[L.id]).map(L => `${L.label} — ${t[L.id]}`), old = a.lairs.filter(l => l.ancient).length;
  say(a, `Началась ${ERAS.get('wild').label.toLowerCase()}. Разумных народов ещё нет; звери расходятся по своим краям` +
    (parts.length ? `, чудовища заняли логова: ${parts.join(', ')}` + (old ? `; ${old} из них стоят с незапамятных времён.` : '.') : '.'));
}

// one season of history
export function stepHistory(a) {
  const H = a.hist, rnd = H.rnd, season = SEASON_LIST[H.season].id, F = a.fauna;
  if (H.season === 0) {
    rollWeather(a, rnd);
    const m = plague(a, rnd);
    if (m) say(a, `Мор: ${m.s.sp.plural} гибнут ${wherePhrase(a, coarseToCell(a, m.j))}.`);
  }
  // the worst weather of the year, if it is bad enough, is remembered and kills more: a harsh winter
  // where winters freeze, a drought in the dry season where they do not
  if (season === 'winter' && rnd() < 0.5) {
    let worst = 0, wj = -1;
    for (let j = 0; j < F.weather.length; j++) if (F.weather[j] < worst && F.list.some(s => s.K[j] > 0.3)) { worst = F.weather[j]; wj = j; }
    if (worst < FAUNA.harshAt) {
      const r = 4, bx = wj % F.W, by = (wj / F.W) | 0, cell = coarseToCell(a, wj);
      for (const s of F.list) if (s.role !== 'spirit') for (let y = Math.max(0, by - r); y <= Math.min(F.H - 1, by + r); y++) for (let x = Math.max(0, bx - r); x <= Math.min(F.W - 1, bx + r); x++) s.N[y * F.W + x] *= 1 - FAUNA.harsh;
      const cold = a.f.temp[cell] - a.f.trange[cell] / 2 < 0;
      say(a, cold ? `Лютая зима ${wherePhrase(a, cell)}: звери гибли от мороза и бескормицы.` : `Засуха ${wherePhrase(a, cell)}: травы выгорели, звери гибли от бескормицы.`);
    }
  }
  // the elder peoples: they come at the start of their era and live a year at a time from then on
  const plan = eraPlan(a), wildEnd = plan[0].seasons, elderEnd = wildEnd + plan[1].seasons;
  if (H.step === wildEnd || H.step === elderEnd) {
    H.era = H.step === wildEnd ? 'elder' : 'young';
    say(a, `Началась ${ERAS.get(H.era).label.toLowerCase()}.`);
    arrive(a, H.era, rnd, t => say(a, t));
  }
  if (H.era !== 'wild' && season === 'spring') {
    stepPeoples(a, rnd, t => say(a, t));
    if ((H.step - wildEnd) % (ROADS.every * SEASONS_PER_YEAR) === 0)
      for (const [p, q] of wearRoads(a)) say(a, `Между ${p.name} и ${q.name} протоптали дорогу.`);
  }
  const totals = stepFauna(a, season);
  for (const line of stepLairs(a, rnd, season)) say(a, line);
  // booms and busts of whole species against their own running average; the two most striking a year
  if (H.season === 3) {
    const news = [];
    for (const [k, s] of a.fauna.list.entries()) {
      if (s.role === 'spirit' || s.usual <= 0) continue;
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
  if (H.step === wildEnd) {
    const alive = a.lairs.filter(l => l.alive).length, gone = a.lairs.length - alive;
    say(a, `Дикая эра подошла к концу: ${alive} ${plural(alive, 'логово', 'логова', 'логов')} чудовищ стоит, ${gone} ${plural(gone, 'опустело', 'опустели', 'опустели')}. Мир ждёт первых народов.`);
  }
  if (H.step === elderEnd || H.step >= H.end) {
    const towns = a.towns.filter(t => t.alive), parts = [];
    for (const pe of a.peoples) {
      const mine = towns.filter(t => t.people === pe.id), pop = Math.round(mine.reduce((x, t) => x + t.pop, 0));
      parts.push(`${pe.P.label} — ${mine.length} ${plural(mine.length, 'город', 'города', 'городов')}, ${pop} ${plural(pop, 'житель', 'жителя', 'жителей')}`);
    }
    if (H.step === elderEnd && H.step < H.end) say(a, `Эпоха древних народов подошла к концу: ${parts.join('; ')}. Скоро придут люди и орки.`);
    else {
      const wars = Object.values(a.rel || {}).reduce((x, r) => x + r.wars, 0), ruins = (a.ruins || []).length;
      say(a, `Эпоха молодых народов подошла к концу: ${parts.join('; ')}. Войн было ${wars}, сожжено городов: ${ruins}. История мира ждёт поселенцев.`);
    }
  }
}
