// What an arriving group looks like and whether the colony's land can take it.
// WHEN groups come and HOW MANY want to come is not decided here: that is the outside world's
// business (src/outside/). This file is the local half of every arrival:
//   accept(w, n, rng) — how many of the n offered actually arrive (room, food, what the land feeds);
//   blocked(w)        — for the panel: why a due arrival is held up;
//   retry             — a due arrival that could not happen is tried again this often;
//   species/faction/init/kit/groupInit/message — the group itself.
import {Registry} from '../core/registry.js';
import {colonists, foodTotal, popCap, ofSpecies} from '../settlement/query.js';
import {plural} from '../core/util.js';
import {WILDLIFE} from './presets.js';
import {T} from './terrain.js';
import {HOUR} from '../core/time.js';
import {raidThreat} from '../settlement/threat.js';

export const MIGRATIONS = new Registry('migration');

MIGRATIONS.registerAll([
  // newcomers need a free place to sleep and food to spare
  {id: 'settlers', species: 'human', faction: 'colony', topic: 'people', retry: 2 * HOUR,
    blocked: w => (colonists(w).length >= popCap(w) ? 'нет места, нужен шалаш' : foodTotal(w) <= colonists(w).length * 5 ? 'мало еды в запасе' : null),
    accept: (w, n) => (MIGRATIONS.get('settlers').blocked(w) ? 0 : n),
    message: (w, group) => `К лагерю пришла новая душа: <b>${group[0].name}</b>.`},

  // hares stay only while the meadows can feed more of them
  {id: 'hares', species: 'hare', faction: 'wild', minDist: 20, topic: 'wildlife',
    accept: (w, n) => {
      const k = WILDLIFE[w.cfg.wildlife].hares;
      if (w.cache.grass == null || w.tick % 1200 < 240) w.cache.grass = w.grid.terr.reduce((s, t) => s + (t === T.GRASS), 0);
      const cap = Math.round(w.cache.grass / 500 * k);
      return Math.max(0, Math.min(n, cap - ofSpecies(w, 'hare').length));
    },
    message: (w, group, side) => (group.length > 1 ? `С ${side} прибежали зайцы: ${group.length}.` : null)},

  // a wolf pack settles in only while there are hares to eat and no other pack around
  {id: 'wolves', species: 'wolf', faction: 'predators', minDist: 30, topic: 'danger', level: 'notice',
    accept: (w, n) => (ofSpecies(w, 'wolf').length || ofSpecies(w, 'hare').length < 5 ? 0 : n),
    // members share a pack id; the first one leads
    groupInit: group => { const pack = group[0].id; for (const a of group) { a.pack = pack; a.name = 'Волк'; } },
    message: (w, group, side) => `С ${side} пришла стая волков: ${group.length}. Одному в лес лучше не ходить.`},

  // size, gear, toughness and aim grow with the threat the raiders see
  {id: 'raiders', species: 'human', faction: 'raiders', minDist: 40, topic: 'danger',
    groupInit: (group, w) => {
      const t = raidThreat(w); w.stats.raids++;
      const big = w.chronicle.biggestRaid;
      if (!big || group.length > big.size) w.chronicle.biggestRaid = {size: group.length, tick: w.tick};
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
