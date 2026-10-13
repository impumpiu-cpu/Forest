// Read-only questions about the world state, shared by systems and content definitions.
import {RESOURCES} from '../data/resources.js';
import {perTick} from '../core/util.js';

export const count = (w, key, any = false) => w.buildings.reduce((n, b) => n + (b.key === key && (any || b.done) ? 1 : 0), 0);
export const has = (w, key) => w.buildings.some(b => b.key === key && b.done);
export const openSites = w => w.buildings.filter(b => !b.done);
export const buildingById = (w, id) => w.buildings.find(b => b.id === id);

// asked many times a tick by brains, panels and buildings: the list is made once per tick
export const colonists = w => perTick(w, 'colonists', () => w.agents.filter(a => a.faction === 'colony'));
export const ofSpecies = (w, id) => w.agents.filter(a => a.species === id);

const FOOD = () => RESOURCES.filter(r => r.tags.includes('food'));
export const foodTotal = w => FOOD().reduce((s, r) => s + (w.stock[r.id] || 0), 0);

// how many colonists have each food as their favourite: {foodId: n}
export const favourites = w => perTick(w, 'favourites', () => {
  const out = {};
  for (const a of colonists(w)) if (a.food?.likes) out[a.food.likes] = (out[a.food.likes] || 0) + 1;
  return out;
});

export const popCap = w => 8 + w.mods.add.popCap;
export const jobUnlocked = (w, job) => !job.requires || [].concat(job.requires).some(b => has(w, b));

// ore kinds (codes) the colony wants dug now: those whose stock is below the resource's `target`
const ORE_RES = () => RESOURCES.filter(r => r.ore);
export const wantedOre = w => perTick(w, 'wantedOre', () => new Set(ORE_RES().filter(r => (w.stock[r.id] || 0) < r.target).map(r => r.ore)));
