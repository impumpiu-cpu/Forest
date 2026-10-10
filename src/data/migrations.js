// Arrivals and departures. Nobody is born here: populations change only by migration.
// A migration checks every `interval` ticks, or when its own `nextAt(w, rng, arrived)` says,
// how big a group should come, then spawns it at a map edge reachable from the camp.
// `arrived` is the size of the group that just came (0 if the check found nobody).
import {Registry} from '../core/registry.js';
import {colonists, foodTotal, popCap, ofSpecies} from '../settlement/query.js';
import {plural} from '../core/util.js';
import {RAIDS, WILDLIFE, PREDATORS} from './presets.js';
import {T} from './terrain.js';
import {DAY, HOUR} from '../core/time.js';
import {raidThreat, raidSize, settlerWaitDays} from '../settlement/threat.js';

export const MIGRATIONS = new Registry('migration');

MIGRATIONS.registerAll([
  // one newcomer at a time; after an arrival the wait grows with the colony,
  // and if nobody could come (no food to spare, no room) they check again a couple of hours later
  {id: 'settlers', species: 'human', faction: 'colony', topic: 'people',
    nextAt: (w, rng, arrived) => (arrived === 0 ? w.tick + 2 * HOUR : w.tick + settlerWaitDays(colonists(w).length) * DAY),
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
    // scheduled by the start-menu setting (each raid brings the next one a little closer),
    // or triggered by the «Набег» button. Size, gear, toughness and aim grow with the threat.
    nextAt: (w, rng) => (RAIDS[w.cfg.raids].every
      ? w.tick + RAIDS[w.cfg.raids].every * Math.max(0.6, 1 - w.stats.raids * 0.05) * (0.6 + rng() * 0.8) : Infinity),
    size: w => raidSize(w),
    groupInit: (group, w) => {
      const t = raidThreat(w); w.stats.raids++;
      for (const a of group) { a.hp = 0.75 + Math.min(0.35, t * 0.012); a.skill = {hunt: Math.min(0.7, 0.1 + t * 0.025)}; }
    },
    init: a => { a.name = 'Налётчик'; },
    // early bands carry clubs and slings in rags, later ones spears, shields, bows and leather
    kit: (rng, w) => {
      const t = raidThreat(w);
      const early = [['club'], ['club'], ['spear'], ['sling'], ['staff']];
      const late = [['spear', 'shield'], ['club', 'shield'], ['maul'], ['bow', 'quiver'], ['spear'], ['sling']];
      const pool = rng() < Math.min(0.9, t * 0.04) ? late : early;
      const set = pool[Math.floor(rng() * pool.length)];
      const r = rng(), leather = Math.min(0.6, t * 0.025), plates = t > 12 ? Math.min(0.3, (t - 12) * 0.025) : 0;
      return [...set, ...(r < plates ? ['hardleather'] : r < plates + leather ? ['jerkin'] : r < plates + leather + 0.4 ? ['clothes'] : [])];
    },
    ammo: 8,
    message: (w, group, side) => `Набег! ${group.length} ${plural(group.length, 'налётчик', 'налётчика', 'налётчиков')} из «Серых волков» ${group.length === 1 ? 'идёт' : 'идут'} с ${side}.`},
]);
