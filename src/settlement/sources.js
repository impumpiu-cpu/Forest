// Where a resource can come from, for plans that must not wait on the impossible (the council's goal).
// A resource is obtainable when some work the colony can do now brings it in, or a workshop it has built
// makes it out of things that are themselves obtainable (a short chain, at most a few links, no loops):
//   — gathering: a job whose `resource` (or `also`) it is, with its wild bed on the map;
//   — hunting: what the game hunters go after leaves (`yields`: meat, hides, bones…), if such game lives here;
//   — fields: the crop's yield, with seed in the stock or obtainable;
//   — the herd: milk and wool from beasts that can be tamed here;
//   — workshops: a recipe at a built station, its own needs met.
// Traders are not counted: a caravan may not come for days, and the council should not wait on one.
import {JOBS} from '../data/jobs.js';
import {RECIPES} from '../data/recipes.js';
import {CROPS} from '../data/crops.js';
import {SPECIES} from '../data/species.js';
import {jobUnlocked, has} from './query.js';
import {faunaLevel} from '../world/region.js';

const DEPTH = 3;
const livesHere = (w, id) => faunaLevel(w, id) > 0 || w.agents.some(o => o.species === id && !o.dead && !o.tame);

function fromJob(w, job, res, depth, seen) {
  if (!jobUnlocked(w, job)) return false;
  if (job.resource === res || job.also?.includes(res)) return !job.bed || (w.plantBeds?.[job.bed]?.length || 0) > 0;
  if (job.runner === 'hunt') return [...job.prey, ...(job.risky || [])].some(id => SPECIES.get(id).yields?.[res] && livesHere(w, id));
  if (job.runner === 'farm') return CROPS.all().some(c => c.yields?.[res] && ((w.stock[c.seed] || 0) >= 1 || obtainable(w, c.seed, depth - 1, seen)));
  if (job.runner === 'herd') return SPECIES.filter(s => s.tame?.[res]).some(s => livesHere(w, s.id));
  return false;
}

function fromRecipe(w, r, depth, seen) {
  if (!has(w, r.at) || !(r.needs || []).every(b => has(w, b)) || (r.tool && !((w.stock[r.tool] || 0) >= 1))) return false;
  return Object.entries(r.cost).every(([c, v]) => (w.stock[c] || 0) >= v || obtainable(w, c, depth - 1, seen));
}

export function obtainable(w, res, depth = DEPTH, seen = new Set()) {
  if (depth < 0 || seen.has(res)) return false;
  seen = new Set(seen).add(res);
  if (JOBS.all().some(j => fromJob(w, j, res, depth, seen))) return true;
  return RECIPES.all().some(r => r.makes?.resource === res && fromRecipe(w, r, depth, seen));
}
