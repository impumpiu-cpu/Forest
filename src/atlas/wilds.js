// The wild allies of a people (data/peoples.js `wilds`: the elves). The children of the wood fight little themselves: the
// beasts of the land and the treants of the forest stand with them.
//   the grove (a season): the treants that wake about a town of theirs in the forest — `grove.grow` a year (t.grove gathers
//     it, a treant wakes at each whole one) while there are fewer than `grove.cap[tier]` of them (t.treants); each stands as a
//     treant's worth of its people in the town's might (atlas/towns.js might, t.wardMen);
//   the guard: in its might the town also counts beasts of the land worth `guard` of its people, where beasts of the wood live
//     about it (the callers summon them to the walls);
//   the march (atlas/army.js sendArmy): an army of theirs takes beasts of the land about its town worth `beasts` of its men and,
//     when it marches on a town in the forest, treants worth `treants` of them (p.wild). They fight and fall with it, and go
//     back to the wood when it comes home.
// Worth: a beast's health × blow × WAR_BEASTS.men, as the greenskins' war beasts (atlas/beasts.js beastWorth).
import {WORLD_PEOPLES, WAR_BEASTS as WB} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {SUMMON} from '../data/roles.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {beastWorth} from './beasts.js';
import {faunaCell} from './fauna.js';
import {biomeAt} from './biomes.js';
import {placeHas} from './towns.js';

const TREANT = 'treant';
const wildsOf = t => WORLD_PEOPLES.get(t.people)?.wilds;
const sylvan = sp => sp && sp.sylvan && sp.id !== TREANT;
export const worthOf = id => beastWorth(SPECIES.get(id));

// the beast of the wood that lives densest about a cell (the fauna; none hunted out — what its biome keeps), or null
export function beastAt(a, i) {
  if (a.fauna) {
    const j = faunaCell(a, i);
    let best = null, bv = 0;
    for (const s of a.fauna.list) {
      const sp = SPECIES.has(s.id) ? SPECIES.get(s.id) : null, n = s.N[j];
      if (!sylvan(sp) || !(n >= WB.least)) continue;
      const v = n * beastWorth(sp);
      if (v > bv) { bv = v; best = sp; }
    }
    if (best) return best.id;
  }
  const b = biomeAt(a, i)?.id;
  let best = null, bv = 0;
  for (const sp of SPECIES.all()) { const v = sylvan(sp) ? (SUMMON.levels[sp.habitat?.[b]] || 0) * beastWorth(sp) : 0; if (v > bv) { bv = v; best = sp; } }
  return best?.id || null;
}
export const forestAt = (a, i) => placeHas(a, i, 'forest');

// a season of a town's grove and guard: → true when a treant woke
export function stepWilds(a, t) {
  const W = wildsOf(t);
  if (!W) return false;
  const forest = forestAt(a, t.i), cap = forest ? W.grove.cap[t.tier || 0] || 0 : 0;
  let woke = false;
  if ((t.treants || 0) < cap) {
    t.grove = (t.grove || 0) + W.grove.grow / SEASONS_PER_YEAR;
    if (t.grove >= 1) { t.grove -= 1; t.treants = (t.treants || 0) + 1; woke = true; }
  } else { t.grove = 0; if ((t.treants || 0) > cap) t.treants = cap; }   // (the forest about it cut, or the town fell a step: they sleep)
  const beast = beastAt(a, t.i);
  t.wardMen = Math.round(((t.treants || 0) * worthOf(TREANT) + (beast ? W.guard * t.pop : 0)) * 10) / 10;
  return woke;
}

// what an army of this town takes of the wild: {species: n}, by its men and the land of its goal
export function wildOfArmy(a, t, men, goal) {
  const W = wildsOf(t);
  if (!W || !(men > 0)) return {};
  const out = {}, beast = beastAt(a, t.i);
  if (beast) out[beast] = Math.max(1, Math.round(W.beasts * men / worthOf(beast)));   // (at least one: a small levy still has its wolf)
  if (goal != null && forestAt(a, goal)) { const n = Math.round(W.treants * men / worthOf(TREANT)); if (n > 0) out[TREANT] = n; }
  return out;
}
