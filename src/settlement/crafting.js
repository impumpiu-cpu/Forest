// Crafting stations: each finished station building works one order at a time.
// An order is picked from RECIPES by what the colony lacks most (recipe.want), skipping recipes
// it cannot afford or whose materials the council is saving up for. Materials are taken when the
// order starts; finished items go to the colony's gear store (world.armory).
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

export function pickRecipe(w, station, ctx = craftContext(w)) {
  let best = null, bv = 0;
  for (const r of recipesAt(station)) {
    const v = r.want(ctx);
    if (v > bv && canStart(w, r)) { bv = v; best = r; }
  }
  return best;
}

// a workshop's benches are reservations 'bench:<id>:<k>' (settlement/reserve.js): a worker takes one when
// choosing the station, keeps it while walking there and working, and the task's end gives it back
export const benchesOf = b => BUILDINGS.get(b.key).benches || 1;
export const benchPrefix = b => 'bench:' + b.id;
export const freeBench = (w, b, a) => freeSlot(w, benchPrefix(b), benchesOf(b), a);

// does a station of this kind have something to do, and a free bench for `a`? (orders cached per tick)
export function stationHasWork(w, station, a) {
  const map = perTick(w, 'orders', () => ({}));
  const b = w.buildings.find(x => x.key === station && x.done);
  if (!b || !freeBench(w, b, a)) return false;   // every bench taken by someone else
  if (!(station in map)) map[station] = !!b.order || !!pickRecipe(w, station);
  return map[station];
}

// how badly the colony needs what this station would make next (its running order counts a bit more,
// so half-done work gets finished)
export function stationPriority(w, station) {
  const b = w.buildings.find(x => x.key === station && x.done); if (!b) return 0;
  const ctx = craftContext(w);
  if (b.order) return RECIPES.get(b.order.recipe).want(ctx) + 0.5;
  const r = pickRecipe(w, station, ctx);
  return r ? r.want(ctx) : 0;
}


// add labour at a station building; starts an order if none is running
export function workAt(w, b, amount, a) {
  if (!b.order) {
    const r = pickRecipe(w, b.key);
    if (!r) return false;
    // fuel is chosen before the materials are taken, with the price's own wood set aside, so the two never
    // compete for the same logs (it used to find no fuel left after the price and crash)
    const fuel = r.fuel ? furnacePick(w, r.heat ?? 2, r.fuel, fuelReserve(w) + (r.cost.wood || 0)) : null;
    if (r.fuel && !fuel) return false;
    if (w.scratch) delete w.scratch.orders;   // materials are taken: other stations may not afford theirs now
    for (const [res, v] of Object.entries(r.cost)) w.stock[res] -= v;
    if (fuel) w.stock[fuel[0].id] -= fuel[1];
    b.order = {recipe: r.id, progress: 0};
  }
  const r = RECIPES.get(b.order.recipe);
  const bellows = r.fuel && (w.stock.bellows || 0) >= 1;   // blown fire: the work goes faster
  b.order.progress += amount * (bellows ? FURNACE.bellowsWork : 1);
  if (b.order.progress < r.work) return true;
  b.order = null;
  w.stats.crafted++;
  if (w.scratch) delete w.scratch.craftCtx;   // item counts changed
  if (r.makes.item) {
    // a silvered blade carries the silver on the instance; with bellows a forged piece now and then comes out finer
    const extra = {};
    if (r.makes.silver) extra.silver = true;
    if (bellows && w.rng() < FURNACE.bellowsFine) extra.q = 1;
    const it = newItem(r.makes.item, extra), name = def(it).label.toLowerCase();
    w.armory.push(it);
    w.armoryVersion = (w.armoryVersion || 0) + 1;
    log(w, `Сделано: ${name}.${extra.q ? ' Меха раздули жар как надо: вещь вышла добротной.' : ''}`, 'craft');
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
  return true;
}

export function orderText(b) {
  if (!b.order) return 'ждёт заказа';
  const r = RECIPES.get(b.order.recipe);
  const what = r.makes.item ? ITEMS.get(r.makes.item).short : `${RESOURCES.get(r.makes.resource).short} ×${r.makes.n}`;
  return `${what}: ${Math.floor(b.order.progress / r.work * 100)}%`;
}
