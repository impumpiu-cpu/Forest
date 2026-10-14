// Precious metals: the rare events around them and their use as money.
//
// Events:
//   - a gold vein: when a worked-out vein opens the rock, in a region whose land allows it
//     (data/regions.js goldVein), once a game at most, with PRECIOUS.veinChance, a few rock cells
//     beside the passage turn into gold-bearing quartz (ore 'goldvein': native gold nuggets);
//   - the first mithril dug.
//   Both are told in the journal, cheer everyone up and spread as a rumour: `w.fame` adds to the
//   raiders' threat (settlement/threat.js) — a rich outpost draws more than traders.
//
// Money: imperial gold is the colony's coin; gold and silver count in a payment at their `money`
// share of the price (data/resources.js). The treasury is coins plus all such metal; a payment takes
// coins first, then the metal a trader values least (dust before bars).
import {RESOURCES} from '../data/resources.js';
import {ORES} from '../data/ores.js';
import {T} from '../data/terrain.js';
import {log} from '../core/log.js';
import {esc, g} from '../core/util.js';
import {colonists} from './query.js';
import {think} from '../agents/mind.js';
import {region} from '../world/region.js';

export const PRECIOUS = {
  veinChance: 0.02,     // per worked-out vein, in a region that allows a gold vein
  veinCells: [2, 4],    // rock cells that turn into gold quartz
  fameVein: 6,          // added to the raid threat by the rumour of gold…
  fameMithril: 4,       // …and of mithril
};

export function maybeGoldVein(w, at, by) {
  if (!region(w).goldVein || w.goldVein || w.rng() >= PRECIOUS.veinChance) return;
  const o = ORES.get('goldvein'), g0 = w.grid, x0 = at % w.w, y0 = (at / w.w) | 0;
  const want = PRECIOUS.veinCells[0] + Math.floor(w.rng() * (PRECIOUS.veinCells[1] - PRECIOUS.veinCells[0] + 1));
  let placed = 0;
  for (let rad = 1; rad <= 3 && placed < want; rad++) for (let yy = -rad; yy <= rad && placed < want; yy++) for (let xx = -rad; xx <= rad && placed < want; xx++) {
    if (Math.max(Math.abs(xx), Math.abs(yy)) !== rad) continue;   // the ring at this distance
    const x = x0 + xx, y = y0 + yy;
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    const j = y * w.w + x;
    if (g0.terr[j] !== T.ROCK || g0.ore[j]) continue;
    g0.ore[j] = o.code; g0.oreLeft[j] = o.vein.amount[0] + Math.floor(w.rng() * (o.vein.amount[1] - o.vein.amount[0] + 1)); placed++;
  }
  if (!placed) return;
  w.goldVein = {tick: w.tick, cells: placed};
  w.fame = (w.fame || 0) + PRECIOUS.fameVein;
  w.nav.dirty('ore');
  log(w, `Золото! ${by ? `<b>${esc(by.name)}</b> ${g(by, 'вскрыл', 'вскрыла')}` : 'В выработке открылась'} кварцевую жилу с самородным золотом. Слух о ней разойдётся быстро.`, 'build', 'alert');
  for (const a of colonists(w)) think(w, a, 'goldStrike');
}

export function foundMithril(w, by) {
  if (w.mithrilFound) return;
  w.mithrilFound = w.tick;
  w.fame = (w.fame || 0) + PRECIOUS.fameMithril;
  log(w, `<b>${esc(by?.name || 'Рудокопы')}</b> ${by ? g(by, 'добыл', 'добыла') : 'добыли'} мифриловую руду. Переработать её здесь нечем, но купцы дадут за неё хорошую цену.`, 'build', 'notice');
  for (const a of colonists(w)) think(w, a, 'mithrilFound');
}

// ── money
const MONEY = () => RESOURCES.filter(r => r.money);
export const coinValue = (w, r) => (w.stock[r.id] || 0) * r.value * r.money;
// everything the colony can pay with: coins + metal at its rate
export const treasury = w => (w.stock.gold || 0) + MONEY().reduce((s, r) => s + coinValue(w, r), 0);

// pay `price` gold: coins first, then metal, the lowest rate first; what was paid in metal goes to the
// trader (`toGoods(id, n)`). Returns the coins that changed hands (after change), or false (and pays
// nothing) if the treasury is short.
export function pay(w, price, toGoods) {
  if (treasury(w) + 1e-9 < price) return false;
  let left = price;
  const before = w.stock.gold || 0;
  const coins = Math.min(left, before);
  w.stock.gold = (w.stock.gold || 0) - coins; left -= coins;
  for (const r of [...MONEY()].sort((x, y) => x.money - y.money)) {
    if (left <= 1e-9) break;
    const unit = r.value * r.money, have = w.stock[r.id] || 0;
    if (have <= 0) continue;
    // whole units where possible; the trader gives change in coins for the last one
    const n = Math.min(have, Math.ceil(left / unit - 1e-9));
    w.stock[r.id] -= n; left -= n * unit;
    if (toGoods) toGoods(r.id, n);
  }
  if (left < 0) w.stock.gold = (w.stock.gold || 0) - left;   // change
  w.stock.gold = Math.round(w.stock.gold * 10) / 10;
  return before - w.stock.gold;
}
