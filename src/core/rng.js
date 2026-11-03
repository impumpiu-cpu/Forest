// Deterministic random numbers: the same seed and settings give the same world.

// A seed plus the same player actions always give the same story. `rng.state` reads or restores the
// position in a stream (saves).
//
// The map is drawn from one stream (w.rng, world/generate.js). The running game draws from separate
// streams, one per subsystem (w.rngs, STREAMS below), so a change in one part shifts only its own
// randomness: tune combat, and the weather, the wildlife and the arrivals of the same seed stay what
// they were. Comparing a seed before and after an edit then shows the edit, not a different story.
export function mulberry(a) {
  const rng = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  Object.defineProperty(rng, 'state', {get: () => a | 0, set: v => { a = v | 0; }});
  return rng;
}

// any text works as a seed: digits are used as is, words are hashed (FNV-1a)
export function seedNumber(text) {
  const t = String(text).trim();
  if (/^\d{1,9}$/.test(t)) return +t;
  let h = 2166136261;
  for (const ch of t) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// the game's random streams by subsystem; each is seeded from the game's seed and its name
export const STREAMS = {
  weather: 'погода: дожди, снег, молнии',
  fire:    'огонь: как он перекидывается и гаснет',
  wild:    'звери: пастьба, охота, стаи, туши, скот',
  nechist: 'нечисть',
  combat:  'удары и выстрелы',
  colony:  'поселенцы: работа, быт, совет, мастерские, поля',
  social:  'отношения и склоки',
  outside: 'внешний мир: прибытия, банды, отряды, торговля',
  birth:   'рождение существ: характер, SPECIAL, вещи',
  alarm:   'тревога: кто из спящих услышал крик',
  hits:    'куда пришёлся удар (data/anatomy.js): отдельно, чтобы место не сдвигало остальной бой',
  leans:   'склонности при рождении (data/leans.js): отдельно, чтобы не сдвигать остальное рождение',
};
export function newStreams(seed) {
  return Object.fromEntries(Object.keys(STREAMS).map(k => [k, mulberry(seedNumber(`${seed}/${k}`))]));
}
// saves keep only the positions
export const streamStates = rngs => Object.fromEntries(Object.entries(rngs).map(([k, r]) => [k, r.state]));
export function restoreStreams(states, seed) {
  const rngs = newStreams(seed);
  for (const [k, v] of Object.entries(states || {})) if (rngs[k]) rngs[k].state = v;
  return rngs;
}
