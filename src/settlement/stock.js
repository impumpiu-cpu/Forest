// The camp stockpile: deposits with processing bonuses, eating, spoilage, theft.
import {RESOURCES} from '../data/resources.js';
import {yieldOf} from './mods.js';

const foods = () => RESOURCES.filter(r => r.tags.includes('food'));

export function deposit(w, res, amount) { w.stock[res] = (w.stock[res] || 0) + amount * yieldOf(w, res); }

// eat one meal from the most plentiful food; returns {fed, res} (fed 0 if there is nothing to eat)
export function eatMeal(w) {
  let best = null;
  for (const r of foods()) if (w.stock[r.id] >= 1 && (!best || w.stock[r.id] > w.stock[best.id])) best = r;
  if (!best) return {fed: 0, res: null};
  w.stock[best.id] -= 1;
  return {fed: best.nutrition, res: best};
}

export function spoil(w) {
  for (const r of foods()) {
    const lost = w.stock[r.id] * 0.00015 * r.spoil * w.mods.mul.spoil;
    w.stock[r.id] = Math.max(0, w.stock[r.id] - lost);
    w.stats.spoiledToday += lost;
  }
}

export function burnStock(w, frac) { for (const r of RESOURCES.all()) w.stock[r.id] = Math.max(0, w.stock[r.id] * (1 - frac)); }

// raiders take up to `loot` units of each resource, less behind a palisade; returns the total taken
export function plunder(w) {
  let total = 0;
  for (const r of RESOURCES.all()) {
    const take = Math.min(w.stock[r.id], (r.loot || 0) * w.mods.mul.loot);
    w.stock[r.id] -= take; total += take;
  }
  return total;
}
