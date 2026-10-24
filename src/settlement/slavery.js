// The settlement trades in captives with a visiting trader (docs/CAPTIVES.md, stage 5; numbers: data/slavery.js).
// At the deal after the evening council (settlement/trade.js holdTrade):
//   - sell: an unruly captive (its will to run high, not resigned), or any when food is short — never one that
//     has earned enough service to be close to freedom. The trader takes it away with the caravan;
//   - buy: a trader now and then brings a captive; the colony buys it while it has bonds for it, room among its
//     captives, fewer than it wants, and gold to spare.
// A sale is taken ill: former slaves' tie to the colony weakens, the captives left behind grow readier to run,
// a merciful colonist is troubled.
import {SLAVE, captivePrice} from '../data/slavery.js';
import {CAPTIVE, BONDS, bestBonds} from '../data/captives.js';
import {SPECIES} from '../data/species.js';
import {captives} from './captives.js';
import {formers} from './freedom.js';
import {colonists, foodTotal} from './query.js';
import {createAgent, hpShare} from '../agents/agent.js';
import {releaseAll} from './reserve.js';
import {think} from '../agents/mind.js';
import {log} from '../core/log.js';
import {esc, g, clamp} from '../core/util.js';
import {ALIGN_DRIFT, shiftAlign} from '../data/values.js';

const round1 = v => Math.round(v * 10) / 10;
const tally = w => (w.chronicle.captives ||= {taken: 0, died: 0});
export const priceOf = a => captivePrice({hp: hpShare(a), S: a.special?.S ?? 5, skill: a.skill, resigned: !!a.captive?.resigned, will: a.captive?.will ?? 0.6});

// who the colony would sell now
export function forSale(w) {
  const free = colonists(w).filter(a => !a.captive && !a.dead).length;
  const short = foodTotal(w) / Math.max(1, free) < SLAVE.sell.foodDays;
  return captives(w).filter(a => !a.downed && (a.captive.service || 0) < SLAVE.sell.service && (short || (!a.captive.resigned && (a.captive.will ?? 0) >= SLAVE.sell.will)));
}

// the company takes a sale ill
function upset(w, sold) {
  const U = SLAVE.upset;
  for (const f of formers(w)) { f.former.bond = clamp(f.former.bond + U.former, 0, 1); think(w, f, 'captiveSold', {name: sold.name}); }
  for (const c of captives(w)) if (c !== sold && !c.captive.resigned) c.captive.will = clamp((c.captive.will ?? 0.6) + U.fear, 0, 1);
  for (const a of colonists(w)) if (!a.captive && !a.former) {
    if ((a.align?.mercy ?? 0) > 0) think(w, a, 'captiveSold', {name: sold.name});
    else shiftAlign(a, 'mercy', ALIGN_DRIFT.pawn.sold);   // the hard grow harder: they get used to it
  }
}

// 1. sell to the trader, as long as it has gold
export function sellCaptives(w, c, deal, note) {
  for (const a of forSale(w)) {
    const p = round1(priceOf(a) * SLAVE.trader.k);
    if (p <= 0 || c.purse < p) continue;
    releaseAll(w, a);
    a.gone = true; a.sold = true; a.task = {id: 'idle'};
    if (w.scratch) delete w.scratch.colonists;
    c.purse = round1(c.purse - p); w.stock.gold = round1((w.stock.gold || 0) + p);
    deal.earned += p; note(deal.sold, `пленный (${SPECIES.get(a.species).label})`, 1, p);
    const r = w.chronicle.people?.find(x => x.id === a.id); if (r) { r.left = w.tick; r.cause = g(a, 'продан торговцу', 'продана торговцу'); }
    tally(w).sold = (tally(w).sold || 0) + 1;
    log(w, `Торговцу ${esc(c.name)} ${g(a, 'продали пленного', 'продали пленную')} <b>${esc(a.name)}</b> (${SPECIES.get(a.species).label}) за ${p} зол.: путы ушли вместе с ${g(a, 'ним', 'ней')}.`, 'trade', 'notice');
    upset(w, a);
  }
}

// what a trader brings: now and then a captive (settlement/trade.js startCaravan)
export function traderCaptive(rng) {
  if (rng() >= SLAVE.buy.trader) return null;
  const R = SLAVE.buy.races;
  return {race: R[(rng() * R.length) | 0]};
}

// 2. buy one the trader brought, while there are bonds, room and gold to spare
export function buyCaptive(w, c, deal, note, cash, spend, trader) {
  const o = c.captive; if (!o) return;
  const B = bestBonds(w.stock), have = captives(w).length;
  if (!B || have >= Math.min(CAPTIVE.max, SLAVE.buy.want)) return;
  const p = round1(captivePrice({hp: 1, S: 5, will: SLAVE.buy.will}) * SLAVE.trader.k * SLAVE.buy.mark);
  if (cash() < p * 2 || !spend(p)) return;   // half the purse at most
  c.captive = null;
  const at = trader || {x: w.camp.x + 0.5, y: w.camp.y + 0.5};
  const a = createAgent(w, o.race, 'colony', at.x, at.y);
  w.stock[B.resource] -= B.n;
  a.captive = {since: w.tick, bonds: B.id, by: null, band: null, people: null, was: 'bought', will: SLAVE.buy.will};
  const r = w.chronicle.people?.find(x => x.id === a.id); if (r) r.captive = true;
  tally(w).bought = (tally(w).bought || 0) + 1;
  deal.spent += p; note(deal.bought, `пленный (${SPECIES.get(o.race).label})`, 1, p);
  log(w, `У торговца ${esc(c.name)} ${g(a, 'купили пленного', 'купили пленную')} <b>${esc(a.name)}</b> (${SPECIES.get(o.race).label}) за ${p} зол. Путы — ${B.label}.`, 'trade', 'notice');
}
