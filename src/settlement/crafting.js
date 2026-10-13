// Crafting stations: each finished station building works one order at a time.
// An order is picked from RECIPES by what the colony lacks most (recipe.want), skipping recipes
// it cannot afford or whose materials the council is saving up for. Materials are taken when the
// order starts; finished items go to the colony's gear store (world.armory).
import {RECIPES} from '../data/recipes.js';
import {ITEMS} from '../data/items.js';
import {BUILDINGS} from '../data/buildings.js';
import {log} from '../core/log.js';
import {colonists, has} from './query.js';
import {allItems, newItem} from '../agents/equipment.js';
import {think} from '../agents/mind.js';
import {RESOURCES} from '../data/resources.js';
import {smeltFuelTotal, takeSmeltFuel} from './stock.js';
import {perTick} from '../core/util.js';
import {fishable} from '../world/lakes.js';
import {season} from '../data/seasons.js';
import {FOODS} from '../data/foods.js';

const PRESERVED = () => FOODS.filter(f => f.of);

// how much of a resource the council's goal still needs to keep in the stock
function reserved(w, res) {
  const g = w.council.goal; if (!g) return 0;
  return BUILDINGS.get(g).cost[res] || 0;
}

function canStart(w, r) {
  if (r.needs && !r.needs.every(b => has(w, b))) return false;
  if (r.fuel && smeltFuelTotal(w) < r.fuel) return false;
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
  return {
    pop: col.length, owned,
    likes: job => col.filter(a => a.likes === job).length,
    timid: col.filter(a => a.mods.bravery < 0.8).length,
    stock: res => w.stock[res] || 0,
    bows: owned('bow'),
    has: b => has(w, b),
    fishing: w.lakes.some(fishable),
    season: season(w).id, drying: season(w).drying,
    stockpile: {spring: 0.7, summer: 1, autumn: 1.6, winter: 1}[season(w).id] ?? 1,
    stores: PRESERVED().reduce((s, f) => s + (w.stock[f.id] || 0), 0),
    fans: food => col.filter(a => a.food?.likes === food).length,
    get fuel() { return smeltFuelTotal(w); },
    melee: () => MELEE().reduce((s, d) => s + owned(d.id), 0),
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

// who is at the bench: worker id → last tick worked
function busyOthers(w, b, a) {
  if (!b.workers) return 0;
  let n = 0;
  for (const [id, t] of b.workers) { if (w.tick - t > 3) b.workers.delete(id); else if (!a || id !== a.id) n++; }
  return n;
}

// does a station of this kind have something to do, and a free bench for `a`? (orders cached per tick)
export function stationHasWork(w, station, a) {
  const map = perTick(w, 'orders', () => ({}));
  const b = w.buildings.find(x => x.key === station && x.done);
  if (!b || busyOthers(w, b, a) >= (BUILDINGS.get(station).benches || 1)) return false;
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

export function markWorking(w, b, a) { (b.workers || (b.workers = new Map())).set(a.id, w.tick); }

// add labour at a station building; starts an order if none is running
export function workAt(w, b, amount, a) {
  if (!b.order) {
    const r = pickRecipe(w, b.key);
    if (!r) return false;
    if (w.scratch) delete w.scratch.orders;   // materials are taken: other stations may not afford theirs now
    for (const [res, v] of Object.entries(r.cost)) w.stock[res] -= v;
    if (r.fuel) takeSmeltFuel(w, r.fuel);
    b.order = {recipe: r.id, progress: 0};
  }
  const r = RECIPES.get(b.order.recipe);
  b.order.progress += amount;
  if (b.order.progress < r.work) return true;
  b.order = null;
  w.stats.crafted++;
  if (w.scratch) delete w.scratch.craftCtx;   // item counts changed
  if (r.makes.item) {
    w.armory.push(newItem(r.makes.item));
    w.armoryVersion = (w.armoryVersion || 0) + 1;
    log(w, `Сделано: ${ITEMS.get(r.makes.item).label.toLowerCase()}.`, 'craft');
    if (a) { think(w, a, 'madeItem', {item: ITEMS.get(r.makes.item).label.toLowerCase()}); a.stats.crafted++; }
    w.chronicle.crafted[r.makes.item] = (w.chronicle.crafted[r.makes.item] || 0) + 1;
  } else {
    w.stock[r.makes.resource] = (w.stock[r.makes.resource] || 0) + r.makes.n;
    const res = RESOURCES.get(r.makes.resource);
    if (res.tags.includes('luxury')) {
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
