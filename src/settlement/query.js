// Read-only questions about the world state, shared by systems and content definitions.
import {RESOURCES} from '../data/resources.js';

export const count = (w, key, any = false) => w.buildings.reduce((n, b) => n + (b.key === key && (any || b.done) ? 1 : 0), 0);
export const has = (w, key) => w.buildings.some(b => b.key === key && b.done);
export const openSites = w => w.buildings.filter(b => !b.done);
export const buildingById = (w, id) => w.buildings.find(b => b.id === id);

export const colonists = w => w.agents.filter(a => a.faction === 'colony');
export const ofSpecies = (w, id) => w.agents.filter(a => a.species === id);

const FOOD = () => RESOURCES.filter(r => r.tags.includes('food'));
export const foodTotal = w => FOOD().reduce((s, r) => s + (w.stock[r.id] || 0), 0);

export const popCap = w => 8 + w.mods.add.popCap;
export const jobUnlocked = (w, job) => !job.requires || [].concat(job.requires).some(b => has(w, b));

// ore kinds (codes) the colony wants dug now: those whose stock is below the resource's `target`
export function wantedOre(w) {
  const c = w.cache.wantedOre || (w.cache.wantedOre = {tick: -1, set: null});
  if (c.tick !== w.tick) {
    c.tick = w.tick;
    c.set = new Set(RESOURCES.filter(r => r.ore && (w.stock[r.id] || 0) < r.target).map(r => r.ore));
  }
  return c.set;
}
export const oreResource = code => RESOURCES.filter(r => r.ore === code)[0];
