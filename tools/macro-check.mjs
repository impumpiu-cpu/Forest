// The macro model's books (docs/TESTING.md): what moves between towns, treasuries and armies is neither made nor lost
// except where a rule says so; every people has its own numbers; the tables reach the game.
// `node tools/macro-check.mjs` — one small world, then each system stepped on a copy of it.
import {generateAtlas} from '../src/atlas/generate.js';
import {goodPrice} from '../src/data/townBuildings.js';
import {WORLD_PEOPLES, TOWN_LIFE} from '../src/data/peoples.js';
import {EDICTS} from '../src/data/kingdom.js';
import {ECONOMY, TREASURY, TRADE, PLOTS} from '../src/data/macro.js';
import {setCell, resetAll} from '../src/data/schema/edits.js';
import {migrate} from '../src/atlas/demography.js';
import {stepTreasury, treasuryOf, plunder} from '../src/atlas/treasury.js';
import {stepMinds} from '../src/atlas/mind.js';
import {VECTOR_IDS} from '../src/data/mind.js';
import {stepTrade} from '../src/atlas/trade.js';
import {stepEconomies} from '../src/atlas/economy.js';
import {foundFrom, settleSpot} from '../src/atlas/peoples.js';
import {canBuild, plotsOf, plotsUsed} from '../src/atlas/towns.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {mulberry} from '../src/core/rng.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {SEASON_DAYS} from '../src/data/atlas.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const near = (x, y, tol = 1e-6) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y));
const worth = o => Object.entries(o || {}).reduce((s, [g, v]) => s + v * (goodPrice(g) || 1), 0);
const live = a => a.towns.filter(t => t.alive);
const people = a => live(a).reduce((s, t) => s + t.pop, 0);
const stocks = a => live(a).reduce((s, t) => s + worth(t.econ?.stock), 0);
const treasuries = a => (a.realms || []).reduce((s, r) => s + worth(r.treasury?.stock), 0);
const say = () => {};

const base = generateAtlas({seed: 'macrocheck', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
// a copy of the world to step a system on: saved and loaded, as a player's world is
const saved = saveAtlas(base, 'macrocheck'), copy = () => loadAtlas(structuredClone(saved));
check('мир сложился: города, державы, хозяйство', live(base).length > 5 && base.realms.length > 1 && live(base).every(t => t.econ), `городов ${live(base).length}`);

// ── people are neither made nor lost by moving
{
  const a = copy(), p0 = people(a);
  migrate(a);
  check('переезд не делает и не теряет жителей', near(people(a), p0), `${p0.toFixed(3)} → ${people(a).toFixed(3)}, переехало ${Math.round(a.hist.moved - (base.hist.moved || 0))}`);
}
{
  // the biggest town with a free spot in reach; in a full world it may be a hamlet: it is given people enough to send them
  // (data/peoples.js settlers.pop + TOWN_LIFE.abandon) before the books are counted
  const a = copy(), t = live(a).filter(t => settleSpot(a, t) >= 0).sort((p, q) => q.pop - p.pop)[0];
  if (t) t.pop = Math.max(t.pop, WORLD_PEOPLES.get(t.people).settlers.pop + TOWN_LIFE.abandon + 1);
  if (!t) check('поселенцы: есть город с местом рядом', false);
  else {
    const S = WORLD_PEOPLES.get(t.people).settlers, p0 = people(a), n0 = a.towns.length, before = t.pop;
    const made = foundFrom(a, t, mulberry(1), say, S.goods);
    check('поселенцы: уходят из своего города и столько же в новом', made && near(t.pop, before - S.pop) && near(made.pop, S.pop) && near(people(a), p0) && a.towns.length === n0 + 1,
      made ? `${Math.round(before)} → ${Math.round(t.pop)}, новый ${made.pop}` : 'не основали');
    check('поселенцы: новый город — той же державы, с их благами', made && made.realm === t.realm && near(worth(made.econ.stock), worth(S.goods)));
  }
}

// ── the council (atlas/mind.js): a wind of three shares, every town but the seat flagged with a role
{
  const a = copy();
  a.hist.season = 0;
  stepMinds(a, say);
  const rs = a.realms.filter(r => r.fallen == null && live(a).some(t => t.realm === r.id));
  const bad = rs.filter(r => !r.mind || !near(VECTOR_IDS.reduce((s, k) => s + r.mind.wind[k], 0), 1, 1e-2));
  check('совет: у каждой державы ветер из трёх долей', rs.length > 0 && !bad.length, `держав ${rs.length}`);
  const noRole = live(a).filter(t => t.realm != null && !t.capital && !t.role);
  check('совет: у каждого города, кроме столицы, роль', !noRole.length, noRole.map(t => t.name).join(', '));
}

// ── the treasury: what the towns pay arrives less corruption; what it pays out goes where the ledger says
{
  const a = copy();
  a.hist.season = 1;   // (no yearly dealings this season)
  stepMinds(a, say);   // (the council's wind: its free money goes as grants)
  const s0 = stocks(a), r0 = treasuries(a);
  stepTreasury(a, SEASON_DAYS, say);
  let lost = 0, spent = 0;
  for (const r of a.realms) {
    const L = r.treasury?.season;
    if (!L) continue;
    lost += L.out.corruption || 0;
    for (const k of ['army', 'court', 'guard', 'works', 'grantWorks']) spent += L.out[k] || 0;
  }
  const d = s0 + r0 - stocks(a) - treasuries(a);
  check('казна: подати и помощь не делают и не теряют благ сверх коррупции и трат', near(d, lost + spent, 1e-6), `ушло ${d.toFixed(3)}, коррупция ${lost.toFixed(3)}, траты ${spent.toFixed(3)}`);
  const taxed = a.realms.filter(r => (r.treasury?.season?.in?.tax || 0) > 0).length;
  check('казна: державы платят подати', taxed > 0, `держав с податями ${taxed}`);
}
{
  const a = copy();
  a.hist.season = 0;   // spring: tribute and ransom
  const r0 = treasuries(a), p0 = people(a);
  for (const r of a.realms) treasuryOf(r);
  stepTreasury(a, SEASON_DAYS, say);
  const tribute = a.realms.reduce((s, r) => s + (r.treasury?.season?.in?.tribute || 0) - (r.treasury?.season?.out?.tribute || 0), 0);
  const ransom = a.realms.reduce((s, r) => s + (r.treasury?.season?.in?.ransom || 0) - (r.treasury?.season?.out?.ransom || 0), 0);
  check('дань и выкуп переходят из казны в казну без потерь', near(tribute, 0, 1e-6) && near(ransom, 0, 1e-6), `дань ${tribute.toFixed(6)}, выкуп ${ransom.toFixed(6)}`);
}
{
  const a = copy(), [t] = live(a).filter(t => t.econ && worth(t.econ.stock) > 0), other = a.realms.find(r => r.id !== t.realm);
  if (t && other) {
    const w0 = stocks(a) + treasuries(a);
    const w = plunder(a, t, other.id, TREASURY.loot.assault, false);
    check('добыча переходит со склада в казну победителя', w > 0 && near(stocks(a) + treasuries(a), w0), `взято ${w.toFixed(2)}`);
  }
}

// ── trade: what arrives is what was sent × haul; the duty goes to the buyer's treasury
{
  const a = copy();
  const w0 = stocks(a) + treasuries(a);
  stepTrade(a, SEASON_DAYS);
  let sent = 0;
  for (const r of Object.values(a.rel || {})) if (r.trade) for (const [k, v] of Object.entries(r.trade)) if (k !== 'paid') sent += v;
  const d = w0 - stocks(a) - treasuries(a);
  check('торговля: в дороге теряется только (1 − haul) отправленного', near(d, sent * (1 - TRADE.haul), 0.02),   // (r.trade keeps whole gold)
    `потеряно ${d.toFixed(2)}, отправлено ${sent}`);
}

// ── the stock's limit: nothing is kept far over it after a season
{
  const a = copy();
  stepEconomies(a, SEASON_DAYS);
  let over = 0, worst = 0;
  for (const t of live(a)) for (const [g, v] of Object.entries(t.econ.stock)) {
    if (g === 'gold') continue;
    const cap = ECONOMY.hold * ECONOMY.holdStore * ((t.econ.want[g] || 0) + (t.econ.prod[g] || 0)) + ECONOMY.holdMin / (goodPrice(g) || 1);
    if (v > cap * 2) { over++; worst = Math.max(worst, v / cap); }
  }
  check('склад: после сезона нет благ сверх двух пределов', over === 0, over ? `таких ${over}, худшее ×${worst.toFixed(1)}` : '');
  const forage = live(a).filter(t => t.wants?.feeds > 0).every(t => (t.econ.prod.food || 0) + 1e-6 >= ECONOMY.forage * Math.min(t.pop, t.wants.feeds));
  check('еда с земли: не меньше forage × min(жители, прокорм)', forage);
}

// ── the plots: a full town builds nothing within it (outlying works still)
{
  const a = copy(), t = live(a).find(t => t.tier >= 1);
  const keep = t.built;
  const hut = TOWN_BUILDINGS.get('hut'), filler = keep.filter(id => !TOWN_BUILDINGS.get(id).site);
  t.built = [...keep, ...Array(Math.max(0, plotsOf(t) - plotsUsed(t))).fill('campfire')];
  check('участки: полный город не ставит постройку в черте', plotsUsed(t) >= plotsOf(t) && !canBuild(a, t, hut), `занято ${plotsUsed(t)} из ${plotsOf(t)} (${filler.length} было)`);
  t.built = keep;
  check('участки: числа по ступени', PLOTS.tier.length === 3 && PLOTS.tier.every((v, k) => k === 0 || v > PLOTS.tier[k - 1]));
}

// ── one source: every people has its numbers; every edict of dues has its rate
{
  const keys = ['born', 'content', 'migrate', 'welcome', 'settlers', 'army', 'crime', 'spacing'];
  const missing = WORLD_PEOPLES.all().flatMap(P => keys.filter(k => P[k] == null).map(k => `${P.id}.${k}`));
  check('у каждого народа свои числа демографии, войска, преступности', !missing.length, missing.join(', '));
  const levels = EDICTS.get('taxes').levels.map(l => l.id), noRate = levels.filter(id => TREASURY.tax[id] == null);
  check('у каждого уровня податей есть ставка казны', !noRate.length, noRate.join(', '));
  check('у каждой расы свой прирост: эльфы и гномы медленнее людей, люди медленнее орков',
    WORLD_PEOPLES.get('elves').born < WORLD_PEOPLES.get('humans').born && WORLD_PEOPLES.get('dwarves').born < WORLD_PEOPLES.get('humans').born && WORLD_PEOPLES.get('humans').born < WORLD_PEOPLES.get('orcs').born);
  check('гномы чужих не принимают, люди и орки — всех', !WORLD_PEOPLES.get('dwarves').welcome.length && ['humans', 'orcs'].every(p => WORLD_PEOPLES.get(p).welcome.length === 3));
}

// ── the tables reach the game
{
  const e1 = setCell('macroRules', 'treasury.court', 'value', 0.3), e2 = setCell('peoples', 'orcs', 'settlers.pop', 40), e3 = setCell('macroRules', 'economy.forage', 'value', 0.5);
  check('правка «Хозяйство и казна» и «Народов мира» доходит до игры', !e1?.error && !e2?.error && !e3?.error && TREASURY.court === 0.3 && WORLD_PEOPLES.get('orcs').settlers.pop === 40 && ECONOMY.forage === 0.5);
  resetAll();
  check('сброс возвращает числа', TREASURY.court === 0.15 && WORLD_PEOPLES.get('orcs').settlers.pop === 25 && ECONOMY.forage === 0.6 && TOWN_LIFE.fedOk === 0.75);
}

console.log(fail.length ? `\n${fail.length} провалено` : '\nвсё сходится');
process.exit(fail.length ? 1 : 0);
