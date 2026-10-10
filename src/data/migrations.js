// Arrivals and departures. Nobody is born here: populations change only by migration.
// A migration checks every `interval` ticks (or on its own schedule) how big a group should come,
// then spawns it at a map edge reachable from the camp.
import {Registry} from '../core/registry.js';
import {colonists, foodTotal, popCap, ofSpecies} from '../settlement/query.js';
import {plural} from '../core/util.js';
import {RAIDS, WILDLIFE, PREDATORS} from './presets.js';
import {T} from './terrain.js';

export const MIGRATIONS = new Registry('migration');

MIGRATIONS.registerAll([
  {id: 'settlers', species: 'human', faction: 'colony', interval: 900, topic: 'people',
    size: w => (foodTotal(w) > colonists(w).length * 5 && colonists(w).length < popCap(w) ? 1 : 0),
    message: (w, group) => `К лагерю пришла новая душа: <b>${group[0].name}</b>.`},

  // hares drift in while the meadows can feed more of them; grazers also wander off on their own
  {id: 'hares', species: 'hare', faction: 'wild', interval: 240, minDist: 20, topic: 'wildlife',
    size: (w, rng) => {
      const k = WILDLIFE[w.cfg.wildlife].hares; if (!k) return 0;
      if (w.cache.grass == null || w.tick % 1200 < 240) w.cache.grass = w.grid.terr.reduce((s, t) => s + (t === T.GRASS), 0);
      const cap = Math.round(w.cache.grass / 500 * k), n = ofSpecies(w, 'hare').length;
      return n < cap ? Math.min(cap - n, 1 + Math.floor(rng() * 3)) : 0;
    },
    message: (w, group, side) => (group.length > 1 ? `С ${side} прибежали зайцы: ${group.length}.` : null)},

  // a wolf pack comes only while there are hares to eat and no other pack around
  {id: 'wolves', species: 'wolf', faction: 'predators', interval: 1500, minDist: 30, topic: 'danger', level: 'notice',
    size: (w, rng) => {
      const k = PREDATORS[w.cfg.predators].wolves;
      if (!k || ofSpecies(w, 'wolf').length || ofSpecies(w, 'hare').length < 5 || rng() > k) return 0;
      return 2 + Math.floor(rng() * (k >= 1 ? 3 : 2));
    },
    // members share a pack id; the first one leads
    groupInit: group => { const pack = group[0].id; for (const a of group) { a.pack = pack; a.name = 'Волк'; } },
    message: (w, group, side) => `С ${side} пришла стая волков: ${group.length}. Одному в лес лучше не ходить.`},

  {id: 'raiders', species: 'human', faction: 'raiders', minDist: 40, topic: 'danger',
    // scheduled by the start-menu setting, or triggered by the «Набег» button
    nextAt: (w, rng) => (RAIDS[w.cfg.raids].every ? w.tick + RAIDS[w.cfg.raids].every * (0.6 + rng() * 0.8) : Infinity),
    size: w => (colonists(w).length ? 2 + Math.floor(colonists(w).length / 4) : 0),
    init: a => { a.name = 'Волк'; a.hp = 0.75; },
    // raiders come armed, and better armed as the days go by: early bands carry clubs and slings
    // in rags, later ones spears, shields, bows and leather
    kit: (rng, w) => {
      const day = Math.floor(w.tick / 1200);
      const early = [['club'], ['club'], ['spear'], ['sling'], ['staff']];
      const late = [['spear', 'shield'], ['club', 'shield'], ['maul'], ['bow', 'quiver'], ['spear'], ['sling']];
      const pool = rng() < Math.min(0.85, day * 0.07) ? late : early;
      const set = pool[Math.floor(rng() * pool.length)];
      const r = rng(), leather = Math.min(0.55, day * 0.04), plates = day > 10 ? Math.min(0.2, (day - 10) * 0.02) : 0;
      return [...set, ...(r < plates ? ['hardleather'] : r < plates + leather ? ['jerkin'] : r < plates + leather + 0.4 ? ['clothes'] : [])];
    },
    ammo: 8,
    message: (w, group, side) => `Набег! ${group.length} ${plural(group.length, 'налётчик', 'налётчика', 'налётчиков')} из «Серых волков» ${group.length === 1 ? 'идёт' : 'идут'} с ${side}.`},
]);
