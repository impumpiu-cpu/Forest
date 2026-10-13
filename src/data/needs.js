// Bodily needs, 0 (empty) … 1 (satisfied). Each need decays per tick, hurts when empty
// and names the task that satisfies it. `urge` turns the level into a utility score.
import {Registry} from '../core/registry.js';
import {nightness} from '../core/time.js';
import {season} from './seasons.js';

export const NEEDS = new Registry('need');

NEEDS.registerAll([
  {id: 'food', label: 'сытость', color: 'var(--food)', task: 'eat', memory: 'hunger', start: [0.6, 1],
    // predators go hungrier in lean seasons (data/seasons.js)
    decay: (w, a) => 0.0006 * a.mods.hunger * (a.faction === 'predators' ? season(w).hunger : 1),
    harm: 0.0008, cause: 'голода',
    urge: (w, a, v) => (1 - v) ** 2 * 2.2},
  {id: 'rest', label: 'бодрость', color: '#7d9be0', task: 'sleep', memory: 'tired', start: [0.6, 1],
    decay: (w, a) => (a.sleeping ? 0 : 0.00045),
    harm: 0, cause: 'усталости',
    urge: (w, a, v) => (1 - v) ** 2 * 1.8 + (nightness(w.tick) > 0.6 && v < 0.75 ? 0.35 : 0)},
  // warmth follows the temperature field under the agent's feet
  {id: 'warmth', label: 'тепло', color: 'var(--ember)', task: 'warm', memory: 'cold', start: [0.9, 0.9],
    // clothing keeps part of the cold out
    decay: (w, a, T) => (T < 14 ? (14 - T) * 0.00012 * a.mods.cold * (1 - (a.gear?.warmth || 0)) : T > 18 ? -0.003 : 0),
    harm: 0.0007, harmBelow: 0.15, cause: 'холода',
    urge: (w, a, v) => (1 - v) ** 2 * 2.0},
]);
