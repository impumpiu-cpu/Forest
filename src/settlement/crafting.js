// Crafting stations: each finished station building works one order at a time.
// An order is picked from RECIPES by what the colony lacks most (recipe.want), skipping recipes
// it cannot afford or whose materials the council is saving up for. Materials are taken when the
// order starts; finished items go to the colony's gear store (world.armory).
// The worker matters: a recipe above the first tier is open only to someone whose letter reaches it
// (agents/skills.js recipeAccess). A worker picks among the recipes open to them, does not take up an
// order they could not finish, and an order nobody alive can finish is called off (stepCrafting).
import {freeSlot} from './reserve.js';
import {RECIPES} from '../data/recipes.js';
import {ITEMS} from '../data/items.js';
import {BUILDINGS} from '../data/buildings.js';
import {log} from '../core/log.js';
import {colonists, has, foodTotal} from './query.js';
import {allItems, newItem, def} from '../agents/equipment.js';
import {think} from '../agents/mind.js';
import {RESOURCES} from '../data/resources.js';
import {furnacePick, furnaceHeat, FURNACE} from './stock.js';
import {fuelReserve} from './buildings.js';
import {perTick} from '../core/util.js';
import {fishable} from '../world/lakes.js';
import {season} from '../data/seasons.js';
import {FOODS} from '../data/foods.js';
import {freeSlots} from './life.js';
import {canMake, accessKey, recipeNeed, reasonText, skillOf} from '../agents/skills.js';
import {recipeSkill} from '../data/skills.js';
import {qualityRoll} from '../data/quality.js';
import {esc} from '../core/util.js';
import {HOUR} from '../core/time.js';
import {liveById} from '../agents/lookup.js';

const PRESERVED = () => FOODS.filter(f => f.of);

// how much of a resource the council's goal still needs to keep in the stock (wood: plus the fire's share)
function reserved(w, res) {
  const g = w.council.goal; if (!g) return 0;
  const v = BUILDINGS.get(g).cost[res] || 0;
  return v && res === 'wood' ? v + fuelReserve(w) : v;
}

function canStart(w, r) {
  if (r.needs && !r.needs.every(b => has(w, b))) return false;
  // the fire: wood for the fire comes on top of the wood in the price (and the camp fire's reserve)
  if (r.fuel && !furnacePick(w, r.heat ?? 2, r.fuel, fuelReserve(w) + (r.cost.wood || 0))) return false;
  if (r.tool && !((w.stock[r.tool] || 0) >= 1)) return false;   // a town-made tool from the stock (cupels)
  // enough in stock, and what is left still covers the council's savings goal
  return Object.entries(r.cost).every(([res, v]) => {
    const have = w.stock[res] || 0;
    return have >= v && (have - v >= reserved(w, res) || have < reserved(w, res) * 0.5);
  });
}

// what the recipes' want(ctx) can ask about the colony; made once per tick
export const craftContext = w => perTick(w, 'craftCtx', () => makeCraftContext(w));

function makeCraftContext(w) {
  const col = colonists(w), counts = {};
  const count = it => { counts[it.type] = (counts[it.type] || 0) + 1; };
  for (const a of col) for (const it of allItems(a)) count(it);
  for (const it of w.armory) count(it);
  const owned = id => counts[id] || 0;
  // silver blades: silvered iron and cast silver (agents/equipment.js def() carries the flag)
  let silvered = 0;
  for (const a of col) for (const it of allItems(a)) if (def(it).silver) silvered++;
  for (const it of w.armory) if (def(it).silver) silvered++;
  return {
    pop: col.length, owned,
    likes: job => col.filter(a => a.likes === job).length,
    timid: col.filter(a => a.mods.bravery < 0.8).length,
    stock: res => w.stock[res] || 0,
    bows: owned('bow'),
    has: b => has(w, b),
    fishing: w.lakes.some(fishable),
    food: foodTotal(w),
    season: season(w).id, drying: season(w).drying,
    stockpile: {spring: 0.7, summer: 1, autumn: 1.6, winter: 1}[season(w).id] ?? 1,
    stores: PRESERVED().reduce((s, f) => s + (w.stock[f.id] || 0), 0),
    fans: food => col.filter(a => a.food?.likes === food).length,
    get fuel() { return furnaceHeat(w, 2); },
    melee: () => MELEE().reduce((s, d) => s + owned(d.id), 0),
    freeSlots: freeSlots(w),
    silvered: () => silvered,
    silverFoes: w.chronicle.silverFoes || 0,
    placers: (w.plantBeds?.placer?.length || 0) > 0,
    spare: res => { const r = RESOURCES.get(res); return (w.stock[res] || 0) - 0.6 * (r.keep ?? r.target ?? 20); },
  };
}

// recipes grouped by station, built on first use
let byStation = null;
export function recipesAt(station) {
  if (!byStation) { byStation = {}; for (const r of RECIPES.all()) (byStation[r.at] ||= []).push(r); }
  return byStation[station] || [];
}
let melee = null;
const MELEE = () => melee || (melee = ITEMS.filter(d => d.slot === 'hand' && d.melee && !d.ranged));

// someone alive in the colony can take this recipe. A T1 recipe anyone can; otherwise the living are looked
// through directly, not through the per-tick list (reading that list early in a tick would fix it for the
// rest of the tick and change what other systems see)
export const anyoneCan = (w, r) => !recipeNeed(r) || w.agents.some(a => a.faction === 'colony' && !a.dead && canMake(a, r));

// The order a worker would start here: what the colony wants most among what they can make and the stock
// affords. Without a worker: what anyone in the colony could start.
export function pickRecipe(w, station, ctx = craftContext(w), a = null) {
  let best = null, bv = 0;
  for (const r of recipesAt(station)) {
    const v = r.want(ctx);
    if (v > bv && (a ? canMake(a, r) : anyoneCan(w, r)) && canStart(w, r)) { bv = v; best = r; }
  }
  return best;
}

// a workshop's benches are reservations 'bench:<id>:<k>' (settlement/reserve.js): a worker takes one when
// choosing the station, keeps it while walking there and working, and the task's end gives it back
export const benchesOf = b => BUILDINGS.get(b.key).benches || 1;
export const benchPrefix = b => 'bench:' + b.id;
export const freeBench = (w, b, a) => freeSlot(w, benchPrefix(b), benchesOf(b), a);

// Does a station of this kind have something for `a` to do, and a free bench? A running order counts only
// if `a` may work it; otherwise a recipe `a` could start. Cached per tick by station and by what the tiers
// let a worker do (accessKey), so a strong smith's answer is never handed to a weak one.
export function stationHasWork(w, station, a) {
  const map = perTick(w, 'orders', () => ({}));
  const b = w.buildings.find(x => x.key === station && x.done);
  if (!b || !freeBench(w, b, a)) return false;   // every bench taken by someone else
  const key = station + ':' + accessKey(a);
  if (!(key in map)) map[key] = b.order ? canMake(a, RECIPES.get(b.order.recipe)) : !!pickRecipe(w, station, undefined, a);
  return map[key];
}

// how badly the colony needs what this station would make next (its running order counts a bit more,
// so half-done work gets finished)
export function stationPriority(w, station, a = null) {
  const b = w.buildings.find(x => x.key === station && x.done); if (!b) return 0;
  const ctx = craftContext(w);
  if (b.order) { const r = RECIPES.get(b.order.recipe); return a && !canMake(a, r) ? 0 : r.want(ctx) + 0.5; }
  const r = pickRecipe(w, station, ctx, a);
  return r ? r.want(ctx) : 0;
}


// Add labour at a station building; starts an order if none is running. `amount` is the labour, or a
// function of the order's recipe (the worker's speed depends on the skill that recipe uses).
// Returns the recipe that was worked on, or false when no order could start (nothing was done).
export function workAt(w, b, amount, a) {
  // someone else's order this worker may not finish (a sword under a weak arm): nothing is done
  if (b.order && a && !canMake(a, RECIPES.get(b.order.recipe))) return false;
  if (!b.order) {
    const r = pickRecipe(w, b.key, undefined, a);
    if (!r) return false;
    // fuel is chosen before the materials are taken, with the price's own wood set aside, so the two never
    // compete for the same logs (it used to find no fuel left after the price and crash)
    const fuel = r.fuel ? furnacePick(w, r.heat ?? 2, r.fuel, fuelReserve(w) + (r.cost.wood || 0)) : null;
    if (r.fuel && !fuel) return false;
    if (w.scratch) delete w.scratch.orders;   // materials are taken: other stations may not afford theirs now
    for (const [res, v] of Object.entries(r.cost)) w.stock[res] -= v;
    if (fuel) w.stock[fuel[0].id] -= fuel[1];
    b.order = {recipe: r.id, progress: 0};
    if (fuel) b.order.fuel = [fuel[0].id, fuel[1]];   // given back if the order is ever called off
  }
  const r = RECIPES.get(b.order.recipe);
  const bellows = r.fuel && (w.stock.bellows || 0) >= 1;   // blown fire: the work goes faster
  const labour = typeof amount === 'function' ? amount(r) : amount;
  b.order.progress += labour * (bellows ? FURNACE.bellowsWork : 1);
  // who put how much work into it: the one with the most is the master whose skill sets the quality
  if (a) (b.order.by ||= {})[a.id] = (b.order.by?.[a.id] || 0) + labour;
  if (b.order.progress < r.work) return r;
  const by = b.order.by;
  b.order = null;
  w.stats.crafted++;
  if (w.scratch) delete w.scratch.craftCtx;   // item counts changed
  if (r.makes.item) {
    // a silvered blade carries the silver on the instance. Quality (data/quality.js): one random number
    // against the master's skill in the recipe's skill; bellows add a little chance of +1. A fine piece
    // keeps its maker's name: the quality says how good it is, the maker where it came from.
    const extra = {}, master = masterOf(w, by, a), skill = master ? skillOf(master, recipeSkill(r)) : 0;
    if (r.makes.silver) extra.silver = true;
    const q = ITEMS.get(r.makes.item).quality === false ? 0 : qualityRoll(w.rngs.colony(), skill, bellows ? FURNACE.bellowsFine : 0);
    if (q) { extra.q = q; if (master) extra.maker = master.name; }
    const it = newItem(r.makes.item, extra), name = def(it).label.toLowerCase();
    w.armory.push(it);
    w.armoryVersion = (w.armoryVersion || 0) + 1;
    if (q) { const f = w.chronicle.fine ||= {}; f[q] = (f[q] || 0) + 1; }
    const who = master ? `<b>${esc(master.name)}</b>` : 'мастер';
    log(w, `Сделано: ${name}.${q === 1 ? ` ${who} постарал${master?.gender === 'f' ? 'ась' : 'ся'}: вещь вышла добротной.` : q === 2 ? ` Работа мастера: ${who} сделал${master?.gender === 'f' ? 'а' : ''} вещь, какой в поселении ещё не видели.` : q >= 3 ? ` Чудо ремесла! ${who} сам${master?.gender === 'f' ? 'а' : ''} не верит, что это ${master?.gender === 'f' ? 'её' : 'его'} рук дело (${def(it).rank}).` : ''}`, 'craft', q >= 3 ? 'notice' : undefined);
    if (a) { think(w, a, 'madeItem', {item: name}); a.stats.crafted++; }
    w.chronicle.crafted[r.makes.item] = (w.chronicle.crafted[r.makes.item] || 0) + 1;
  } else {
    w.stock[r.makes.resource] = (w.stock[r.makes.resource] || 0) + r.makes.n;
    const res = RESOURCES.get(r.makes.resource);
    if (res.tags.includes('luxury') || res.tags.includes('furniture')) {
      log(w, `Сделано: ${res.short}.`, 'craft');
      if (a) { think(w, a, 'madeItem', {item: res.short}); a.stats.crafted++; }
    }
  }
  return r;
}

// Once an hour: an order that nobody alive in the colony may finish (its smith died or left) is called off,
// and its materials and fuel go back to the stock, so the station is free for what others can make.
export function stepCrafting(w) {
  if (w.tick % HOUR !== 7) return;
  for (const b of w.buildings) {
    if (!b.done || !b.order) continue;
    const r = RECIPES.get(b.order.recipe);
    if (anyoneCan(w, r) || !w.agents.some(a => a.faction === 'colony' && !a.dead)) continue;
    for (const [res, v] of Object.entries(r.cost)) w.stock[res] = (w.stock[res] || 0) + v;
    if (b.order.fuel) w.stock[b.order.fuel[0]] = (w.stock[b.order.fuel[0]] || 0) + b.order.fuel[1];
    b.order = null;
    if (w.scratch) { delete w.scratch.orders; delete w.scratch.craftCtx; }
    const what = r.makes.item ? ITEMS.get(r.makes.item).short : RESOURCES.get(r.makes.resource).short;
    const need = recipeNeed(r);
    log(w, `Некому доделать: ${what} (${need ? 'требуется ' + reasonText(need) : 'нужен мастер'}). Заказ снят, материалы вернулись на склад.`, 'craft');
  }
}

// the master of a finished order: whoever put in the most work and is still around; else the last worker
function masterOf(w, by, last) {
  let best = null, bv = -1;
  for (const [id, v] of Object.entries(by || {})) {
    const o = liveById(w, +id);
    if (o && v > bv) { bv = v; best = o; }
  }
  return best || last || null;
}

export function orderText(b) {
  if (!b.order) return 'ждёт заказа';
  const r = RECIPES.get(b.order.recipe);
  const what = r.makes.item ? ITEMS.get(r.makes.item).short : `${RESOURCES.get(r.makes.resource).short} ×${r.makes.n}`;
  return `${what}: ${Math.floor(b.order.progress / r.work * 100)}%`;
}
