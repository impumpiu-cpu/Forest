// The camp stockpile: deposits with processing bonuses, eating, spoilage, theft.
import {RESOURCES} from '../data/resources.js';
import {yieldOf} from './mods.js';
import {FOODS, tasteOf} from '../data/foods.js';
import {season} from '../data/seasons.js';

const foods = () => RESOURCES.filter(r => r.tags.includes('food'));

export function deposit(w, res, amount) { w.stock[res] = (w.stock[res] || 0) + amount * yieldOf(w, res); }

// the meal a colonist picks: the favourite food if the stock has it, otherwise the most plentiful
// food they don't mind, and the disliked one only when nothing else is left
// (and anything made from them: dried fish is fish); otherwise a hot dish, then whatever spoils
// fastest, keeping dried and salted food for lean days
export function chooseMeal(w, a) {
  const likes = a?.food?.likes, dislikes = a?.food?.dislikes;
  let best = null, bv = -Infinity;
  for (const r of foods()) {
    const have = w.stock[r.id] || 0;
    if (have < 1) continue;
    const f = FOODS.get(r.id), t = tasteOf(f);
    const v = (t === likes ? 10 - (f.of ? 1 : 0) : 0) - (t === dislikes ? 1e6 : 0) + (f.dish ? 6 : 0) + f.spoil * 2 + Math.min(1, have / 20);
    if (v > bv) { bv = v; best = r; }
  }
  return best;
}

// eat one meal; returns {fed, res, mood: 'liked' | 'disliked' | null} (fed 0 if there is nothing to eat)
export function eatMeal(w, a) {
  const best = chooseMeal(w, a);
  if (!best) return {fed: 0, res: null, mood: null};
  w.stock[best.id] -= 1;
  const t = tasteOf(FOODS.get(best.id));
  const mood = a?.food?.likes === t ? 'liked' : a?.food?.dislikes === t ? 'disliked' : null;
  return {fed: best.nutrition, res: best, mood};
}

// ── fuel
let cf, sf;
const campFuels = () => cf || (cf = RESOURCES.filter(r => r.tags.includes('fuel')).sort((x, y) => (x.burn ?? 9) - (y.burn ?? 9)));

// what the campfire would burn now: wood first, then coal
export function campFuel(w) { return campFuels().find(r => (w.stock[r.id] || 0) > 0.05) || null; }

// feed the campfire for one tick; coal burns longer than wood
export function burnCampFuel(w, amount) {
  const r = campFuel(w); if (!r) return false;
  w.stock[r.id] = Math.max(0, w.stock[r.id] - amount / (r.heat || 1));
  return true;
}

// ── furnace fuel. A recipe asks for `fuel` units of heat at a `heat` level (data/recipes.js); each fuel
// resource with a `furnace` block (data/resources.js) gives heat up to its `tier` and needs `per`
// units of itself for one unit of heat: wood (tier 1, 3 logs a unit) melts copper, gold and silver;
// iron needs coal (tier 2). Magma (tier 3) will burn nothing, later. Kузнечные меха in the stock
// save a quarter of the fuel (FURNACE.bellows).
export const FURNACE = {bellows: 0.75, bellowsWork: 1.25, bellowsFine: 0.05, coalSpare: 6};
const furnaceFuels = () => sf || (sf = RESOURCES.filter(r => r.furnace).sort((x, y) => x.furnace.tier - y.furnace.tier));
const fuelNeed = (w, units) => units * ((w.stock.bellows || 0) >= 1 ? FURNACE.bellows : 1);

// how this recipe would be fired now: [resource, amount] or null if there is not enough of a hot
// enough fuel. Low-heat work takes coal while there is plenty of it (it goes further than wood), wood
// otherwise, keeping the camp's firewood reserve; iron takes coal only.
export function furnacePick(w, heat, units, woodReserve = 0) {
  const need = fuelNeed(w, units);
  const ok = furnaceFuels().filter(r => r.furnace.tier >= heat);
  const coal = ok.find(r => r.furnace.tier >= 2), wood = ok.find(r => r.furnace.tier < 2);
  const have = r => (w.stock[r.id] || 0) - (r === wood ? woodReserve : 0);
  if (coal && have(coal) >= need * coal.furnace.per + (wood ? FURNACE.coalSpare : 0)) return [coal, need * coal.furnace.per];
  if (wood && have(wood) >= need * wood.furnace.per) return [wood, need * wood.furnace.per];
  if (coal && have(coal) >= need * coal.furnace.per) return [coal, need * coal.furnace.per];
  return null;
}
// heat units in stock at a heat level (for the panels and the charcoal pit's orders)
export const furnaceHeat = (w, heat = 2) => furnaceFuels().filter(r => r.furnace.tier >= heat).reduce((s, r) => s + (w.stock[r.id] || 0) / r.furnace.per, 0);

// share of the food in stock that lies in the open: pots hold POT_HOLDS portions each, a granary
// keeps half of the rest out of reach (rats nibble only the open food; it also spoils faster)
const POT_HOLDS = 6;
export function potShare(w) {
  let food = 0; for (const r of foods()) food += w.stock[r.id] || 0;
  return food <= 0 ? 1 : Math.min(1, (w.stock.pots || 0) * POT_HOLDS / food);
}
export const exposedShare = w => (1 - potShare(w)) * (w.buildings.some(b => b.key === 'granary' && b.done) ? 0.5 : 1);

// rats: eat `amount` of food from whatever lies in the open, the most plentiful first
export function nibble(w, amount) {
  const open = exposedShare(w); if (open <= 0) return;
  let best = null;
  for (const r of foods()) if ((w.stock[r.id] || 0) >= 1 && (!best || w.stock[r.id] > w.stock[best.id])) best = r;
  if (!best) return;
  const lost = Math.min(w.stock[best.id], amount * open);
  w.stock[best.id] -= lost; w.stats.ratsAte = (w.stats.ratsAte || 0) + lost;
}

export function spoil(w) {
  // food in pots spoils at 40% of the rate
  const S = season(w), sealed = 1 - 0.6 * potShare(w);
  for (const r of foods()) {
    const lost = w.stock[r.id] * 0.00015 * r.spoil * w.mods.mul.spoil * S.spoil * sealed;
    w.stock[r.id] = Math.max(0, w.stock[r.id] - lost);
    w.stats.spoiledToday += lost;
  }
}

export function burnStock(w, frac) { for (const r of RESOURCES.all()) w.stock[r.id] = Math.max(0, w.stock[r.id] * (1 - frac)); }

// raiders take up to `loot` units of each resource, less behind a palisade; gold and silver locked in
// a forged chest (furniture, settlement/life.js) are harder to get at; returns the total taken
export function plunder(w) {
  let total = 0;
  const chest = w.buildings.some(b => b.done && b.furniture?.includes('chest')) ? 0.4 : 1;
  for (const r of RESOURCES.all()) {
    const take = Math.min(w.stock[r.id], (r.loot || 0) * w.mods.mul.loot * (r.money ? chest : 1));
    w.stock[r.id] -= take; total += take;
  }
  return total;
}
