// Trade with passing caravans. The numbers live in data/trade.js; this file runs a visit:
//   coming   — the caravan walks in from the map edge (agents/brains/caravan.js moves it);
//   camp     — it has set up by the camp and waits for the evening council to end;
//   trading  — right after the council the colony sells and buys (holdTrade), people gather round;
//   night    — it sleeps by the camp;
//   leaving  — next morning it walks off; when nobody of it is left on the map the visit is over.
// If the trader is killed the visit ends at once and the rest of the caravan leaves.
//
// world.caravan is the visit in progress (null between visits); world.trade keeps the totals and
// the last deals for the panel.
import {TRADE} from '../data/trade.js';
import {RESOURCES} from '../data/resources.js';
import {FOODS} from '../data/foods.js';
import {ITEMS} from '../data/items.js';
import {RECIPES} from '../data/recipes.js';
import {QUALITY} from '../data/quality.js';
import {DAY, HOUR, dayOf, hourOf} from '../core/time.js';
import {log} from '../core/log.js';
import {esc, plural} from '../core/util.js';
import {colonists, foodTotal} from './query.js';
import {COUNCIL_TO} from './council.js';
import {allItems, itemDef, itemPrice, newItem, def as itemOf} from '../agents/equipment.js';
import {think} from '../agents/mind.js';
import {BUILDINGS} from '../data/buildings.js';
import {recomputeMods} from './mods.js';
import {freeSlots} from './life.js';
import {treasury, pay} from './precious.js';
import {contest} from '../data/special.js';
import {practice} from '../agents/skills.js';
import {liveById} from '../agents/lookup.js';

// ── keys: town-made tools (tag 'key'). One is wanted while the colony has none and could use it:
// a building that needs it could be built (it is the only thing missing), or the tool works by itself
// from the stock once its building stands (`useWith`: the ploughshare with a field, bellows and cupels
// with the furnace)
const KEYS = () => RESOURCES.filter(r => r.tags.includes('key'));
export function keyWanted(w, id) {
  if ((w.stock[id] || 0) >= 1) return false;
  const users = BUILDINGS.filter(d => d.key === id);
  if (users.length) return users.some(d => !w.buildings.some(b => b.key === d.id) &&
    (!d.needs || w.buildings.some(b => b.done && b.key === d.needs)) && (!d.available || d.available(w)));
  const r = RESOURCES.get(id);
  return !!r.useWith && w.buildings.some(b => b.done && b.key === r.useWith);
}

export const newTradeState = () => ({visits: 0, deals: [], earned: 0, spent: 0});

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
const round1 = v => Math.round(v * 10) / 10;

// ── goods: {kind: 'res', id, n} or {kind: 'item', type, q}
// places the goods take in the crates: a resource by stacks (data/balance/prices.js `stack`), an item one each
const stackOf = id => RESOURCES.get(id).stack || 1;
export const goodsUnits = goods => goods.reduce((s, g) => s + (g.kind === 'res' ? Math.ceil(g.n / stackOf(g.id)) : 1), 0);
// how many more units of a resource fit: the free places, and what is left in its last stack
const roomFor = (c, id) => { const have = c.goods.find(g => g.kind === 'res' && g.id === id)?.n || 0, st = stackOf(id); return (c.capacity - goodsUnits(c.goods)) * st + (have % st ? st - have % st : 0); };
export const unitPrice = g => (g.kind === 'res' ? RESOURCES.get(g.id).value || 0 : itemPrice(g.type, g.q, g.silver));
export const goodsLabel = g => (g.kind === 'res' ? RESOURCES.get(g.id).label : itemOf(g).label.toLowerCase());
// prices at the visit's terms: b (−haggle…+haggle) is the colony's gain from haggling, 0 without terms
export const askPrice = (g, b = 0) => round1(unitPrice(g) * (TRADE.ask - b));
export const bidPrice = (g, b = 0) => round1(unitPrice(g) * (TRADE.bid + b));
const askAt = askPrice, bidAt = bidPrice;

// ── the negotiator: whoever of the colony haggles best and can stand at the trade (not senseless, not
// lying at the healer's). Charisma × (1 + barter) against the trader's; the terms are fixed once for the
// visit (c.terms), so asking again never rolls again. No negotiator: plain prices, the trade still happens.
const haggler = a => (a.special?.C ?? 5) * (1 + (a.skill?.barter || 0));
export function negotiator(w) {
  let best = null, bv = -1;
  for (const a of colonists(w)) {
    if (a.downed || a.captive || (a.task?.id === 'treat' && a.task.lying)) continue;   // (a captive never haggles for its captors)
    const v = haggler(a); if (v > bv) { bv = v; best = a; }
  }
  return best;
}
export function termsOf(w, c = w.caravan) {
  if (!c) return {b: 0};
  if (c.terms) return c.terms;
  const a = negotiator(w), t = traderOf(w, c);
  const theirs = (t?.special?.C ?? TRADE.traderC) * (1 + TRADE.traderBarter);
  const b = a ? round2(TRADE.haggle * (2 * contest(haggler(a), theirs) - 1)) : 0;
  return (c.terms = {b, by: a?.id ?? null, name: a?.name ?? null, f: a?.gender === 'f'});
}
const round2 = v => Math.round(v * 100) / 100;

// items a ware line can be: 'plain' — what the outpost could make itself (it has a recipe), short of iron;
// 'any' — anything finer work improves and a trader may carry (not of a rare material)
function itemPool(spec) {
  if (Array.isArray(spec)) return spec;
  if (spec === 'plain') return ITEMS.filter(d => !d.iron && RECIPES.all().some(r => r.makes?.item === d.id)).map(d => d.id);
  return ITEMS.filter(d => d.quality !== false && d.sold !== false).map(d => d.id);
}

function addGoods(goods, g) {
  if (g.kind === 'res') { const same = goods.find(x => x.kind === 'res' && x.id === g.id); if (same) { same.n += g.n; return; } }
  goods.push(g);
}

// fill `units` places in the crates from TRADE.WARES
export function makeGoods(rng, units) {
  const goods = [], total = TRADE.WARES.reduce((s, x) => s + x.w, 0);
  const sold = new Set(QUALITY.filter(q => q.sold).map(q => q.q));
  let left = units, guard = 200;
  while (left > 0 && guard-- > 0) {
    let r = rng() * total, line = TRADE.WARES[0];
    for (const x of TRADE.WARES) { r -= x.w; if (r <= 0) { line = x; break; } }
    if (line.items) {
      if (!sold.has(line.q || 0)) continue;
      const type = pick(rng, itemPool(line.items));
      addGoods(goods, {kind: 'item', type, q: line.q || 0, ...(line.silver && !ITEMS.get(type).silver ? {silver: true} : {})}); left--;
    } else {
      const id = line.food ? pick(rng, FOODS.filter(f => !f.dish).map(f => f.id)) : pick(rng, line.resource);
      const st = RESOURCES.get(id).stack || 1, n = Math.min(left * st, between(rng, line.n));
      addGoods(goods, {kind: 'res', id, n}); left -= Math.ceil(n / st);
    }
  }
  return goods;
}

// ── the caravan on the map
const members = (w, c) => w.agents.filter(o => o.caravan === c.id && !o.dead);
export const traderOf = (w, c = w.caravan) => (c ? liveById(w, c.traderId) : null);

// called by the migration when the group reaches the map edge (data/migrations.js 'caravan')
export function startCaravan(w, group) {
  const rng = w.rngs.outside, id = w.tick;
  const trader = group.find(a => a.role === 'trader'), mules = group.filter(a => a.species === 'mule');
  const cap = TRADE.crates * TRADE.crate;
  let units = 0;
  for (const [k, m] of mules.entries()) {
    m.owner = trader.id; m.slot = k;
    m.load = Math.round(cap * (TRADE.load[0] + rng() * (TRADE.load[1] - TRADE.load[0])));
    units += m.load;
  }
  for (const a of group) a.caravan = id;
  w.caravan = {id, phase: 'coming', traderId: trader.id, name: trader.name, gender: trader.gender, set: w.tick,
    capacity: mules.length * cap, goods: makeGoods(rng, units),
    purse: between(rng, TRADE.purse), arrived: null, traded: false, tradedAt: null, tradeEnd: null, spot: null, deal: null};
  // the rumour of mithril brings a trader with a fatter purse
  const mith = Math.min(3, Math.floor(w.stock.mithrilOre || 0));
  if (mith) { w.caravan.purse += TRADE.mithrilPurse * mith; w.caravan.buyer = true; }
  // town-made tools the colony still lacks; any other one now and then
  const lack = KEYS().filter(r => keyWanted(w, r.id) || (w.stock[r.id] || 0) < 1).sort((x, y) => keyWanted(w, y.id) - keyWanted(w, x.id));
  // (the first one the colony could use right away always comes)
  lack.slice(0, TRADE.keys[1]).forEach((r, k) => { if ((k === 0 && keyWanted(w, r.id)) || rng() < TRADE.keyChance) addGoods(w.caravan.goods, {kind: 'res', id: r.id, n: 1}); });
  w.trade.visits++;
}

// spread what the caravan carries over its mules, for the crates drawn on their sides
function reload(w, c) {
  const mules = members(w, c).filter(a => a.species === 'mule');
  let units = goodsUnits(c.goods);
  const cap = TRADE.crates * TRADE.crate;
  for (const m of mules) { m.load = Math.min(cap, units); units -= m.load; }
}

// ── what the colony wants from a trader
// how good a piece is at its job, and which job that is: [role, score] (role null: not worth buying)
function roleOf(d) {
  if (d.slot === 'body') return ['body', (d.armor || 0) * 2 + (d.warmth || 0) * 0.5];
  if (d.ranged) return ['ranged', d.ranged.dmg * 0.5];
  if (d.melee) return ['melee', d.melee.dmg * 0.5 + (d.block || 0)];
  if (d.block) return ['shield', d.block * 2];
  const tools = Object.entries(d.tool || {});
  if (tools.length) { const [job, m] = tools.sort((x, y) => y[1] - x[1])[0]; return ['tool:' + job, m - 1]; }
  return [null, 0];
}

// for each role, the scores of what the people who need it have now, worst first; the gear store
// counts too (it will be handed out) unless `store` is false
function gearNeeds(w, store = true) {
  const col = colonists(w), pop = col.length, slots = {};
  const need = role => {
    if (role === 'body' || role === 'melee') return pop;
    if (role === 'shield') return Math.ceil(pop / 2);
    if (role === 'ranged') return Math.max(2, col.filter(a => a.likes === 'hunt').length);
    const job = role.slice(5);
    return Math.max(1, col.filter(a => a.likes === job).length);
  };
  const add = (role, score) => (slots[role] ||= []).push(score);
  for (const a of col) {
    const best = {};
    for (const it of allItems(a)) { const [r, s] = roleOf(itemDef(it.type, it.q)); if (r) best[r] = Math.max(best[r] || 0, s); }
    for (const [r, s] of Object.entries(best)) add(r, s);
  }
  if (store) for (const it of w.armory) { const [r, s] = roleOf(itemDef(it.type, it.q)); if (r) add(r, s); }
  const out = {};
  const roles = new Set([...Object.keys(slots), 'body', 'melee', 'shield', 'ranged']);
  for (const r of roles) {
    const have = (slots[r] || []).sort((x, y) => y - x).slice(0, need(r));
    while (have.length < need(r)) have.push(0);
    out[r] = have.sort((x, y) => x - y);
  }
  return out;
}

const keepOf = (r, pop) => r.keep ?? (r.keepPerHead != null ? r.keepPerHead * pop : r.target ?? 20);

// ── the deal, right after the evening council
export function holdTrade(w) {
  const c = w.caravan, pop = colonists(w).length;
  const deal = {day: dayOf(w.tick) + 1, trader: c.name, sold: [], bought: [], earned: 0, spent: 0};
  // the terms the colony's negotiator got, for the whole visit
  const terms = termsOf(w, c), askPrice = g => askAt(g, terms.b), bidPrice = g => bidAt(g, terms.b);
  deal.by = terms.name; deal.b = terms.b;
  const note = (list, label, n, gold) => { const x = list.find(e => e[0] === label); if (x) { x[1] += n; x[2] += gold; } else list.push([label, n, gold]); };
  const free = () => c.capacity - goodsUnits(c.goods);
  // the colony pays in coins, and in gold and silver at their rate when the coins run out (settlement/precious.js)
  const cash = () => treasury(w);
  const spend = p => { const coins = pay(w, p, (id, n) => addGoods(c.goods, {kind: 'res', id, n})); c.purse = round1(c.purse + (coins || 0)); return coins !== false; };

  // 1. sell: the jeweller's work, spare gear, and what the colony has beyond what it keeps;
  //    the dearest first, as long as the trader has gold and room
  // a town-made tool the colony needs is worth parting with more: sell down to half of what it keeps
  const keyCost = c.goods.filter(g => g.kind === 'res' && RESOURCES.get(g.id).tags.includes('key') && keyWanted(w, g.id)).reduce((t, g) => t + askPrice(g), 0);
  const keepK = keyCost > cash() ? 0.5 : 1;
  const offers = [];
  for (const r of RESOURCES.all()) {
    if (r.sell === false || !(r.value > 0)) continue;
    const spare = Math.floor((w.stock[r.id] || 0) - keepOf(r, pop) * keepK);
    if (spare > 0) offers.push({g: {kind: 'res', id: r.id, n: 1}, n: spare});
  }
  // spare gear: a piece in the store that would be a step up for nobody (everyone who needs that
  // kind of thing has as good or better on them); one of each kind stays as a spare for breakages
  const worn = gearNeeds(w, false), kinds = new Map();
  for (const it of w.armory) {
    if (itemDef(it.type, it.q).keep || itemOf(it).silver) continue;   // epic finds and silver blades are never sold
    const [role, score] = roleOf(itemDef(it.type, it.q));
    if (role && worn[role] && score > worn[role][0]) continue;
    const k = it.type + ':' + (it.q || 0); (kinds.get(k) || kinds.set(k, []).get(k)).push(it);
  }
  for (const list of kinds.values()) for (const it of list.slice(1)) offers.push({g: {kind: 'item', type: it.type, q: it.q || 0}, n: 1, inst: it});
  offers.sort((x, y) => bidPrice(y.g) - bidPrice(x.g));
  const isFood = g => g.kind === 'res' && RESOURCES.get(g.id).tags.includes('food');
  for (const o of offers) {
    const p = bidPrice(o.g); if (p <= 0) continue;
    // food never goes below the colony's reserve in all
    const cap = isFood(o.g) ? Math.floor(foodTotal(w) - pop * TRADE.foodKeep) : Infinity;
    const n = Math.min(o.n, cap, Math.floor(c.purse / p), o.g.kind === 'res' ? roomFor(c, o.g.id) : free());
    if (n <= 0) continue;
    if (o.inst) w.armory.splice(w.armory.indexOf(o.inst), 1);
    else w.stock[o.g.id] -= n;
    addGoods(c.goods, o.g.kind === 'res' ? {kind: 'res', id: o.g.id, n} : o.g);
    c.purse = round1(c.purse - p * n); w.stock.gold = round1((w.stock.gold || 0) + p * n);
    deal.earned += p * n; note(deal.sold, goodsLabel(o.g), n, p * n);
  }

  // 2. buy food when short: the most filling for the money first
  if (foodTotal(w) < pop * TRADE.foodShort) {
    const foods = c.goods.filter(g => g.kind === 'res' && RESOURCES.get(g.id).tags.includes('food'))
      .sort((x, y) => askPrice(x) / RESOURCES.get(x.id).nutrition - askPrice(y) / RESOURCES.get(y.id).nutrition);
    for (const g of foods) {
      const p = askPrice(g), want = Math.ceil((pop * TRADE.foodUpTo - foodTotal(w)) / RESOURCES.get(g.id).nutrition);
      const n = Math.min(g.n, want, Math.floor(cash() / p));
      if (n <= 0 || !spend(p * n)) continue;
      g.n -= n; w.stock[g.id] = (w.stock[g.id] || 0) + n;
      deal.spent += p * n; note(deal.bought, RESOURCES.get(g.id).label, n, p * n);
    }
    c.goods = c.goods.filter(g => g.kind !== 'res' || g.n > 0);
  }

  // 2a. a town-made tool the colony could use right away: before anything else but food
  for (const g of c.goods) {
    if (g.kind !== 'res' || !RESOURCES.get(g.id).tags.includes('key') || !keyWanted(w, g.id)) continue;
    const p = askPrice(g); if (p > cash() || !spend(p)) continue;
    g.n -= 1; w.stock[g.id] = (w.stock[g.id] || 0) + 1;
    deal.spent += p; note(deal.bought, RESOURCES.get(g.id).label, 1, p);
    log(w, `Купили у торговца: <b>${RESOURCES.get(g.id).label}</b>. Теперь можно: ${RESOURCES.get(g.id).opens}.`, 'trade', 'notice');
  }
  c.goods = c.goods.filter(g => g.kind !== 'res' || g.n > 0);
  recomputeMods(w);

  // 2b. stock up on what the outpost cannot make itself and keeps needing (salt), up to TRADE.wants
  for (const [id, upTo] of Object.entries(TRADE.wants)) {
    const g = c.goods.find(x => x.kind === 'res' && x.id === id); if (!g) continue;
    const p = askPrice(g), n = Math.min(g.n, Math.floor(upTo - (w.stock[id] || 0)), Math.floor(cash() * TRADE.maxShare / p));
    if (n <= 0 || !spend(p * n)) continue;
    g.n -= n; w.stock[id] = (w.stock[id] || 0) + n;
    deal.spent += p * n; note(deal.bought, RESOURCES.get(id).label, n, p * n);
  }
  c.goods = c.goods.filter(g => g.kind !== 'res' || g.n > 0);

  // 2c. silver blades: once something that fears silver has come, enough for half the colony, cheapest first;
  //     before that, one spare if it is cheap for the colony
  {
    const owned = () => [...colonists(w).flatMap(a => allItems(a)), ...w.armory].filter(it => itemOf(it).silver).length;
    const foes = w.chronicle.silverFoes || 0, want = foes ? Math.ceil(pop * TRADE.silverShare) : 1;
    const offer = c.goods.filter(g => g.kind === 'item' && itemOf(g).silver).sort((x, y) => askPrice(x) - askPrice(y));
    for (const g of offer) {
      if (owned() >= want) break;
      const p = askPrice(g);
      if (p > cash() * (foes ? TRADE.maxShare : TRADE.silverSpare) || !spend(p)) continue;
      c.goods.splice(c.goods.indexOf(g), 1);
      w.armory.push(newItem(g.type, {...(g.q ? {q: g.q} : {}), ...(g.silver ? {silver: true} : {})}));
      w.armoryVersion = (w.armoryVersion || 0) + 1;
      deal.spent += p; note(deal.bought, goodsLabel(g), 1, p);
    }
  }

  // 3. buy gear that is a real step up for someone, best gain for the money first; save the rest
  const needs = gearNeeds(w);
  for (;;) {
    let best = null, bv = 0;
    for (const g of c.goods) {
      if (g.kind !== 'item') continue;
      const [role, score] = roleOf(itemDef(g.type, g.q));
      if (!role || !needs[role]) continue;
      const gain = score - needs[role][0], p = askPrice(g);
      if (gain < TRADE.minGain || p > cash() * TRADE.maxShare) continue;
      const v = gain / Math.max(0.5, p);
      if (v > bv) { bv = v; best = {g, role, score, p}; }
    }
    if (!best || !spend(best.p)) break;
    c.goods.splice(c.goods.indexOf(best.g), 1);
    w.armory.push(newItem(best.g.type, {...(best.g.q ? {q: best.g.q} : {}), ...(best.g.silver ? {silver: true} : {})}));
    w.armoryVersion = (w.armoryVersion || 0) + 1;
    needs[best.role][0] = best.score; needs[best.role].sort((x, y) => x - y);
    deal.spent += best.p; note(deal.bought, goodsLabel(best.g), 1, best.p);
  }

  // 4. finer furniture from the towns, only for a colony with gold to spare and a place to put it
  for (const g of c.goods) {
    if (g.kind !== 'res' || !RESOURCES.get(g.id).tags.includes('furniture') || freeSlots(w) <= 0) continue;
    const p = askPrice(g); if (cash() - p < TRADE.furnish || !spend(p)) continue;
    g.n -= 1; w.stock[g.id] = (w.stock[g.id] || 0) + 1;
    deal.spent += p; note(deal.bought, RESOURCES.get(g.id).label, 1, p);
  }
  c.goods = c.goods.filter(g => g.kind !== 'res' || g.n > 0);

  deal.earned = round1(deal.earned); deal.spent = round1(deal.spent); deal.gold = round1(cash());
  c.deal = deal; c.traded = true; c.tradedAt = w.tick;
  w.trade.deals.unshift(deal); if (w.trade.deals.length > 6) w.trade.deals.pop();
  w.trade.earned = round1(w.trade.earned + deal.earned); w.trade.spent = round1(w.trade.spent + deal.spent);
  reload(w, c);

  // the negotiator learns from a real deal only, by how much there was to haggle over
  const lines = deal.sold.length + deal.bought.length, neg = liveById(w, terms.by);
  if (neg && lines) practice(neg, 'barter', Math.min(TRADE.practiceMax, TRADE.practicePerLine * lines));
  const list = xs => xs.map(([l, n, g]) => `${l}${n > 1 ? ' ×' + n : ''}`).join(', ');
  const haggled = terms.name ? ` Торговал${terms.f ? 'ась' : 'ся'} за поселение <b>${esc(terms.name)}</b>: ${terms.b > 0 ? `цены на ${Math.round(terms.b * 100)}% выгоднее` : terms.b < 0 ? `купец переторговал, цены на ${Math.round(-terms.b * 100)}% хуже` : 'сошлись на обычных ценах'}.` : '';
  const sold = deal.sold.length ? `Продали: ${list(deal.sold)} — за ${deal.earned} зол.` : 'Продать было нечего.';
  const bought = deal.bought.length ? ` Купили: ${list(deal.bought)} — за ${deal.spent} зол.` : ' Ничего не купили, золото отложили.';
  log(w, `Торг с купцом <b>${esc(c.name)}</b> после совета.${haggled} ${sold}${bought} В казне ${Math.floor(deal.gold)} зол.${(w.stock.gold || 0) < deal.gold - 0.5 ? ` (монетами ${Math.floor(w.stock.gold || 0)}, остальное — золото и серебро)` : ''}`, 'trade');
}

// ── the visit, step by step (called every tick from sim.js)
export function stepTrade(w) {
  const c = w.caravan; if (!c) return;
  const h = hourOf(w.tick), today = dayOf(w.tick);
  const on = members(w, c);
  if (!on.length && w.tick > c.set) {   // everyone has left the map: the visit is over
    w.caravan = null; return;
  }
  if (c.phase !== 'leaving' && !traderOf(w, c)) {
    c.phase = 'leaving';
    log(w, 'Купец погиб. Охрана уводит караван прочь, торга не будет.', 'trade', 'alert');
    return;
  }
  // still on the road: no way to the camp, or too long on the way — the caravan turns back
  if (c.phase === 'coming' && c.arrived == null && ((c.noPath || 0) > 60 || w.tick - c.set > TRADE.maxComing * HOUR)) {
    c.phase = 'leaving';
    log(w, `Купец <b>${esc(c.name)}</b> не нашёл дороги к лагерю и повернул назад.`, 'trade', 'notice');
    return;
  }
  if (c.phase === 'coming' && c.arrived != null) {
    c.phase = 'camp';
    const n = on.filter(a => a.species === 'mule').length;
    log(w, `К лагерю пришёл купец <b>${esc(c.name)}</b> с охраной и ${n} ${plural(n, 'вьючным мулом', 'вьючными мулами', 'вьючными мулами')}.${c.buyer ? ' Он прослышал о мифриле и привёз полный кошель.' : ''} Торг — после совета.`, 'trade', 'notice');
  }
  // trade right after today's council (or after the council hour, if nobody sat)
  if (c.phase === 'camp' && !c.traded && h < TRADE.tradeUntil && colonists(w).length &&
      (w.council.lastDay === today && h >= 19 || h >= COUNCIL_TO)) {
    holdTrade(w); c.phase = 'trading'; c.tradeEnd = w.tick + 1.2 * HOUR;
  }
  if (c.phase === 'trading' && w.tick >= c.tradeEnd) c.phase = 'night';
  const stayed = c.arrived != null && w.tick - c.arrived > TRADE.maxStay * DAY;
  if ((c.phase === 'night' && h >= TRADE.leaveHour && h < 12 && w.tick - c.tradedAt > 6 * HOUR) || (stayed && c.phase !== 'leaving')) {
    c.phase = 'leaving';
    log(w, c.traded ? `Купец <b>${esc(c.name)}</b> собрал товар и ушёл своей дорогой.` : `Купец <b>${esc(c.name)}</b> не дождался торга и ушёл.`, 'trade');
  }
}

export const tradeOpen = w => w.caravan?.phase === 'trading';

// a colonist at the trade: remembers the day once
export function attendTrade(w, a) {
  const d = w.caravan?.deal; if (!d) return;
  const got = d.bought.map(x => x[0]).slice(0, 2).join(', ');
  think(w, a, 'tradeDay', {trader: w.caravan.name, got});
}
