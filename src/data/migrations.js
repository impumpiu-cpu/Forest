// Arrivals and departures. Nobody is born here: populations change only by migration.
// A migration checks every `interval` ticks (or on its own schedule) how big a group should come,
// then spawns it at a map edge reachable from the camp.
import {Registry} from '../core/registry.js';
import {colonists, foodTotal, popCap, ofSpecies} from '../settlement/query.js';
import {plural} from '../core/util.js';
import {RAIDS, WILDLIFE} from './presets.js';
import {T} from './terrain.js';

export const MIGRATIONS = new Registry('migration');

MIGRATIONS.registerAll([
  {id: 'settlers', species: 'human', faction: 'colony', interval: 900,
    size: w => (foodTotal(w) > colonists(w).length * 5 && colonists(w).length < popCap(w) ? 1 : 0),
    message: (w, group) => `К лагерю пришла новая душа: <b>${group[0].name}</b>.`},

  // hares drift in while the meadows can feed more of them; grazers also wander off on their own
  {id: 'hares', species: 'hare', faction: 'wild', interval: 240, minDist: 20,
    size: (w, rng) => {
      const k = WILDLIFE[w.cfg.wildlife].hares; if (!k) return 0;
      if (w.cache.grass == null || w.tick % 1200 < 240) w.cache.grass = w.grid.terr.reduce((s, t) => s + (t === T.GRASS), 0);
      const cap = Math.round(w.cache.grass / 500 * k), n = ofSpecies(w, 'hare').length;
      return n < cap ? Math.min(cap - n, 1 + Math.floor(rng() * 3)) : 0;
    },
    message: (w, group, side) => (group.length > 1 ? `С ${side} прибежали зайцы: ${group.length}.` : null)},

  {id: 'raiders', species: 'human', faction: 'raiders', minDist: 40,
    // scheduled by the start-menu setting, or triggered by the «Набег» button
    nextAt: (w, rng) => (RAIDS[w.cfg.raids].every ? w.tick + RAIDS[w.cfg.raids].every * (0.6 + rng() * 0.8) : Infinity),
    size: w => (colonists(w).length ? 2 + Math.floor(colonists(w).length / 4) : 0),
    init: a => { a.name = 'Волк'; a.hp = 0.75; },
    message: (w, group, side) => `Набег! ${group.length} ${plural(group.length, 'налётчик', 'налётчика', 'налётчиков')} из «Серых волков» ${group.length === 1 ? 'идёт' : 'идут'} с ${side}.`},
]);
