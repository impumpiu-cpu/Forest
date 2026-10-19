// What `npm run items` (tools/items-check.mjs) and `npm run arena` measure items against. The game never reads this file.
//
// Power level (PL) puts every weapon and every piece of armour on one axis. One level is × `step`:
//   attack PL  = log_step(damage per tick / the reference weapon's)        — the reference is PL 0
//   defence PL = log_step(1 / (1 − armour))  and the same for a shield's block: how much longer one lives
// Attack and defence add up: a fighter's strength is roughly damage per tick × how long it lasts, so
// a spear (attack) plus a shield (defence) is the sum of the two, and a two-hander must make up for the
// shield it leaves no hand for. Quality (data/quality.js) adds log_step(1 + hit) to attack.
export const RULES = {
  step: 1.2,
  ref: 'club',
  // tools count for this share of their own PL when an item's worth is weighed (an axe is also for chopping)
  toolWeight: 0.5,
  // clothing is worth its warmth too: PL for keeping out all the cold (0.5 warmth — half of it)
  warmth: 3,
  // where a plain piece of each tier should sit (attack PL for weapons, defence PL for armour); outside — a warning
  tierPL: {
    weapon: {0: [-0.5, 1], 1: [0.5, 2], 2: [1.5, 3.5], 3: [3, 5], 4: [4.5, 6.5]},
    armor:  {0: [0, 2.5], 1: [1.5, 3.5], 2: [3, 4.5], 3: [4, 5.5], 4: [5, 6.5]},
  },
  // a lower tier beating a higher one of the same kind by more than this many levels is a warning
  overlap: 0.5,
  // a price more than this many times off the fitted price curve is a warning
  priceOff: 2,
  // npm run arena: a piece whose whole 95% interval of wins sits above `strong` dominates its tier,
  // below `weak` lags behind; groups with fewer than `minN` duels are not judged
  arena: {strong: 0.55, weak: 0.45, minN: 30},
};
