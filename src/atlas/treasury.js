// The realm's treasury (data/macro.js TREASURY, docs/WORLD.md «Казна»). A store of the realm in its seat: no people live
// in it, it only takes and gives goods — the seat's own stock is the town's, the treasury is the realm's.
//
// Every season, after the households and the trade (atlas/history.js):
//   - dues: each town pays `tax` (the edict «подати») of the worth of its net making — in gold as far as it has it, the
//     rest in the goods that keep (luxury, arms, tools, metal, timber, stone, stores) — out of its stock; corruption takes
//     its share on the way (data/kingdom.js);
//   - the armies of the realm are paid for the season: gold, and the arms and armour they wear out (the share paid is
//     `p.paid`, read day by day by atlas/diplomacy.js keepArmy); their food stays the towns' (atlas/economy.js orders);
//   - the court is paid in gold (the buildings keep themselves: their upkeep is the timber and stone the households
//     spend); what the treasury owed the court and the armies and did not pay is counted (`unpaid`): decay grows of it;
//   - the council gives the towns what they lack of what it holds beyond its reserve (TREASURY.reserve seasons of the
//     armies and the court).
// Through the season the builders are paid from it (atlas/build.js), customs take their duty of the trade (atlas/trade.js),
// and a storm or a raid carries loot into it. `r.treasury.yr` sums the year for the kingdom (atlas/kingdom.js), which
// clears it; `r.treasury.last` is the last season, for the card.
import {TREASURY as T, keepOf} from '../data/macro.js';
import {TOWN_GOODS, goodPrice} from '../data/townBuildings.js';
import {realmTowns, stockOf, giveStock} from './economy.js';

const add = (o, k, v) => { if (v) o[k] = (o[k] || 0) + v; };
const worth = g => goodPrice(g) || 1;
const r3 = v => Math.round(v * 1000) / 1000;
export const keeps = g => TOWN_GOODS.has(g) && (TOWN_GOODS.get(g).spoil || 0) <= T.keeps;

export const treasuryOf = r => { const R = r.treasury ||= {stock: {}, yr: {in: {}, out: {}, lost: 0, due: 0, unpaid: 0}, last: null}; R.season ||= {in: {}, out: {}}; return R; };
const realmById = (a, id) => a.realms?.find(r => r.id === id);
export const held = (r, g) => treasuryOf(r).stock[g] || 0;

// put into the treasury (`why` — the line of the ledger), take from it (as much as there is; returns what was taken)
export function deposit(r, g, v, why) {
  if (!(v > 0)) return;
  const R = treasuryOf(r);
  R.stock[g] = (R.stock[g] || 0) + v;
  add(R.yr.in, why, v * worth(g)); add(R.season.in, why, v * worth(g));
}
export function withdraw(r, g, v, why) {
  if (!(v > 0)) return 0;
  const R = treasuryOf(r), n = Math.min(v, R.stock[g] || 0);
  if (n <= 0) return 0;
  R.stock[g] -= n;
  add(R.yr.out, why, n * worth(g)); add(R.season.out, why, n * worth(g));
  return n;
}
// pay a worth in gold, and where gold is short, in kind: silver, luxury, gems, then whatever keeps, dearest first
// (TREASURY.payIn) — wages in kind, as in any lean year; returns the worth paid
export function payWorth(r, w, why) {
  if (!(w > 0)) return 0;
  const R = treasuryOf(r), order = [...T.payIn, ...Object.keys(R.stock).filter(g => !T.payIn.includes(g) && keeps(g)).sort((p, q) => worth(q) - worth(p) || (p < q ? -1 : 1))];
  let left = w;
  for (const g of order) {
    if (left <= 1e-9) break;
    left -= withdraw(r, g, left / worth(g), why) * worth(g);
  }
  return w - left;
}
// a realm by id, for the other systems (a town of no realm has no treasury)
export const realmTreasury = (a, id) => { const r = id != null ? realmById(a, id) : null; return r && !r.fallen ? r : null; };

// the tax rate of a realm this year (its edict) and what corruption takes of a payment
const taxOf = r => T.tax[r.kingdom?.edicts?.taxes] ?? T.tax.usual;
export const corruptShare = r => Math.min(T.corruptMax, T.corrupt * (r.kingdom?.ruin?.corruption || 0));

// what the realm owes a day: its armies (gold, arms, armour), the court and the upkeep of its buildings, in gold
function armiesOf(a, r) { return (a.parties || []).filter(p => p.kind === 'army' && p.owner === r.id && p.state !== 'gone' && p.men > 0); }
const courtGold = (r, towns) => Object.values(r.kingdom?.court || {}).filter(Boolean).length * T.court * towns.reduce((x, t) => x + t.pop, 0) / 1000;

export function stepTreasury(a, days) {
  for (const r of a.realms || []) {
    if (r.fallen != null) continue;
    const towns = realmTowns(a, r.id).filter(t => t.econ);
    if (!towns.length) continue;
    const R = treasuryOf(r);
    R.season = R.last = {in: {}, out: {}};   // this season's ledger: the trade, the builders and the wars add to it later
    // dues: `tax` of the worth of each town's net making this season — in gold as far as the town has it, the rest in the
    // goods that keep, by how much of each it made; corruption takes its share on the way
    const rate = taxOf(r), lost = corruptShare(r);
    for (const t of towns) {
      const made = Object.entries(t.econ.rate || {}).filter(([, v]) => v > 0);
      let due = rate * days * made.reduce((x, [g, v]) => x + v * worth(g), 0);
      if (due <= 0) continue;
      const pay = (g, n) => {
        if (n <= 0) return;
        t.econ.stock[g] = stockOf(t, g) - n; due -= n * worth(g);
        deposit(r, g, n * (1 - lost), 'tax');
        R.yr.lost += n * lost * worth(g); add(R.season.out, 'corruption', n * lost * worth(g));
      };
      pay('gold', Math.min(stockOf(t, 'gold'), due / worth('gold')));
      const kind = made.filter(([g]) => g !== 'gold' && keeps(g)), K = kind.reduce((x, [g, v]) => x + v * worth(g), 0);
      if (due > 0 && K > 0) { const d = due; for (const [g, v] of kind) pay(g, Math.min(stockOf(t, g), d * v / K)); }
    }
    // the armies' pay and wear for the season: each gets the share the treasury has of what all of them ask
    const armies = armiesOf(a, r), ask = {};
    for (const p of armies) for (const g of ['gold', 'arms', 'armor']) add(ask, g, (keepOf(p.people)[g] || 0) * p.men * days);
    const share = {};
    for (const [g, v] of Object.entries(ask)) share[g] = v > 0 ? (g === 'gold' ? payWorth(r, v * worth(g), 'army') / (v * worth(g)) : withdraw(r, g, v, 'army') / v) : 1;
    for (const p of armies) p.paid = {gold: share.gold ?? 1, arms: share.arms ?? 1, armor: share.armor ?? 1};
    // the court in gold (the buildings keep themselves: their upkeep is the timber and stone the households spend);
    // what the treasury owed and did not pay — the court and the armies' pay — is counted: decay grows of it
    const due = courtGold(r, towns) * days, paid = payWorth(r, due * worth('gold'), 'court') / worth('gold');
    R.yr.due += due + (ask.gold || 0); R.yr.unpaid += due - paid + (ask.gold || 0) * (1 - (share.gold ?? 1));
    // the council: what the towns lacked this season, of what the treasury holds beyond its reserve
    const keepGold = T.reserve * days * ((ask.gold || 0) / days + courtGold(r, towns));
    const keep = {gold: keepGold, arms: T.reserve * (ask.arms || 0), armor: T.reserve * (ask.armor || 0)};
    for (const g of Object.keys(R.stock)) {
      const spare = (R.stock[g] || 0) - (keep[g] || 0);
      if (spare <= 1e-6) continue;
      const lack = towns.map(t => (t.econ.short || []).includes(g) ? Math.max(0, ((t.econ.want?.[g] || 0) - (t.econ.prod?.[g] || 0)) * days - stockOf(t, g)) * T.help : 0);
      const L = lack.reduce((s, v) => s + v, 0);
      if (L <= 0) continue;
      const give = withdraw(r, g, Math.min(spare, L), 'help');
      towns.forEach((t, k) => giveStock(t, g, give * lack[k] / L));
    }
    for (const g of Object.keys(R.stock)) R.stock[g] = r3(R.stock[g]);
  }
}

// a town taken by storm or raided: the winner's realm carries off `share` of what keeps in its stock (and, of a seat, of
// the treasury); returns the worth taken
export function plunder(a, town, toRealm, share, seat = false) {
  const to = realmTreasury(a, toRealm);
  let w = 0;
  if (!to || !town.econ) return 0;
  for (const [g, v] of Object.entries(town.econ.stock)) if (keeps(g) && v > 0) {
    const n = v * share; town.econ.stock[g] = v - n; deposit(to, g, n, 'loot'); w += n * worth(g);
  }
  const from = seat ? realmTreasury(a, town.realm) : null;
  if (from && from !== to) for (const g of Object.keys(treasuryOf(from).stock)) {
    const n = withdraw(from, g, held(from, g) * T.loot.seat, 'looted');
    deposit(to, g, n, 'loot'); w += n * worth(g);
  }
  return w;
}

// the worth the treasury holds
export const treasuryWorth = r => Object.entries(treasuryOf(r).stock).reduce((s, [g, v]) => s + v * worth(g), 0);
