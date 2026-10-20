// Creatures: the library of how strong every species is. One row per species (data/species.js,
// races.js, monsters.js, bestiary.js keep what it is: names, looks, brain, needs, habitat, abilities):
//
//   special  — SPECIAL limits [min, max] per letter (data/special.js says what each letter does).
//              around({S: 6, …}, spread) — the typical one ± spread; beasts (`relativeStats`) are described
//              by their typical animal, so their SPECIAL only moves one animal against its kin
//   peoples  — how a sub-race shifts the limits: {hill: {C: 1, E: -1}} (its names and tastes: data/races.js)
//   hp       — health of the typical one (Endurance moves it, data/special.js EFFECTS.hp)
//   speed    — cells a tick (Agility moves it)
//   attack   — the bare blow: {power, cooldown, reach?, type?}; type — pierce (a bite, a sting), slash (claws),
//              blunt (a fist, a hoof; the default); a creature with a weapon fights with the weapon
//   resist   — what blows do to its body, × the damage: by kind (pierce, slash, blunt: spear points pass through
//              a skeleton's ribs, a club breaks them) and by delivery (melee, ranged: plain weapons barely hurt a leshy)
//   ks       — correction of the strength rating (КС) for this species, × to what the formula gives;
//              `npm run arena:calibrate` writes it here (a row without `ks` is not yet calibrated: × 1)
//
// Abilities that change a fight (venom, web, breath, drinks, weakTo) stay with the species:
// they are what it is; the rating reads them (agents/strength.js).
//
// Each row stays on one line: the arena finds a species' row by its id and rewrites its `ks`.
import {around} from '../special.js';

// The strength rating (КС, коэффициент силы): one number for how much a fighter is worth in a fight.
// A plain human with tier 0 gear (`ref`) is 100. Ratings add up: two sides with the same total should
// win about half the time each, whatever their numbers — ten goblins of 10 against one human of 100.
// How it is made (agents/strength.js):
//   offence  = damage per tick: blow × strength × skill × crits / cooldown, plus shots × hit chance × rangedWeight
//              for a shooter, plus the poison of a venomous bite
//   staying  = health / (1 − armour) / (1 − block) / (1 − dodge), more for what plain weapons barely hurt
//   rating   = base × ((offence × staying) / the same of `ref`) ^ alpha × ks of the species
// `alpha` says how numbers fight: 1 — each fights one foe at a time; 0.5 — everyone strikes at once
// (Lanchester's square law). Melee in the open sits between; `npm run arena` (part 2) measures it.
export const STRENGTH = {
  base: 100,
  // the 100: a human, 5 in every letter, no skill, a bone spear and bast clothes
  ref: {species: 'human', special: 5, skill: 0, kit: ['spear', 'clothes']},
  // `npm run arena:calibrate` fits these two (part 2): 0.55 — melee in the open is close to everyone striking at once
  alpha: 0.55,
  // shots count for this share of their damage on top of the blow (a bow shoots while the foe is coming or held)
  rangedWeight: 0.47,
  // of the blows a fighter meets, this share are shots (what a shield's `cover` is worth in the rating)
  shotShare: 0.25,
  // blood drunk: health stretched as if it were 1 / (1 − drinks × this)
  drinksWeight: 0.5,
};

export const CREATURES = {
  // beasts of data/species.js
  hare:        {special: around({S: 1, P: 8, E: 2, C: 1, I: 1, A: 9, L: 5}), hp: 0.12, speed: 0.17},
  wolf:        {special: around({S: 6, P: 10, E: 7, C: 2, I: 3, A: 8, L: 4}), hp: 0.8, speed: 0.14, attack: {power: 0.85, cooldown: 14, type: 'pierce'}, ks: 1.06},
  deer:        {special: around({S: 4, P: 8, E: 5, C: 2, I: 1, A: 8, L: 4}), hp: 0.45, speed: 0.15},
  fox:         {special: around({S: 2, P: 9, E: 3, C: 2, I: 3, A: 9, L: 6}), hp: 0.15, speed: 0.18},
  boar:        {special: around({S: 8, P: 4, E: 9, C: 1, I: 1, A: 4, L: 3}), hp: 1.3, speed: 0.12, attack: {power: 1.45, cooldown: 14, type: 'pierce'}, ks: 1.03},
  rat:         {special: around({S: 1, P: 6, E: 1, C: 0, I: 2, A: 7, L: 7}), hp: 0.05, speed: 0.15},
  mule:        {special: around({S: 10, P: 4, E: 10, C: 2, I: 2, A: 3, L: 4}), hp: 3.2, speed: 0.11, attack: {power: 1.9, cooldown: 16}, ks: 1.04},
  goat:        {special: around({S: 3, P: 6, E: 5, C: 2, I: 2, A: 8, L: 5}), hp: 0.3, speed: 0.14},
  // thinking races (data/races.js)
  human:       {special: {S: [1, 10], P: [1, 10], E: [1, 10], C: [1, 10], I: [1, 10], A: [1, 10], L: [1, 10]}, hp: 1, speed: 0.13, attack: {power: 1, cooldown: 12}},
  halfling:    {special: {S: [1, 6], P: [3, 11], E: [2, 9], C: [3, 10], I: [1, 10], A: [4, 12], L: [4, 13]}, hp: 0.8, speed: 0.12, attack: {power: 0.8, cooldown: 11}, ks: 1.02},
  giant:       {special: {S: [8, 15], P: [1, 8], E: [7, 14], C: [1, 8], I: [1, 7], A: [1, 6], L: [1, 8]}, hp: 1.5, speed: 0.13, attack: {power: 1.3, cooldown: 14}, ks: 0.99},
  elf:         {special: {S: [1, 7], P: [5, 13], E: [1, 7], C: [3, 11], I: [3, 11], A: [5, 13], L: [1, 10]}, peoples: {high: {I: 1, C: 1, S: -1}}, hp: 0.9, speed: 0.14, attack: {power: 0.9, cooldown: 11}, ks: 1.01},
  darkelf:     {special: {S: [1, 7], P: [6, 13], E: [2, 8], C: [2, 10], I: [4, 12], A: [5, 13], L: [1, 10]}, hp: 0.9, speed: 0.14, attack: {power: 0.9, cooldown: 11}, ks: 1.03},
  dwarf:       {special: {S: [4, 12], P: [3, 10], E: [6, 14], C: [1, 8], I: [3, 11], A: [1, 8], L: [1, 10]}, peoples: {hill: {C: 1, E: -1}, deep: {P: 2, E: 1, C: -1, A: 0, S: -1}}, hp: 1.15, speed: 0.115, attack: {power: 1.1, cooldown: 12}, ks: 0.99},
  orc:         {special: {S: [5, 13], P: [2, 9], E: [5, 13], C: [1, 9], I: [1, 8], A: [3, 10], L: [1, 9]}, hp: 1.15, speed: 0.13, attack: {power: 1.2, cooldown: 12}, ks: 1},
  goblin:      {special: {S: [1, 5], P: [4, 11], E: [1, 7], C: [1, 8], I: [2, 11], A: [5, 12], L: [3, 11]}, hp: 0.65, speed: 0.135, attack: {power: 0.7, cooldown: 10}, ks: 1.01},
  ogre:        {special: {S: [10, 15], P: [1, 6], E: [8, 14], C: [1, 6], I: [1, 5], A: [1, 5], L: [1, 8]}, hp: 1.8, speed: 0.115, attack: {power: 1.6, cooldown: 16}, ks: 0.96},
  troll:       {special: {S: [7, 13], P: [3, 10], E: [6, 13], C: [1, 7], I: [1, 7], A: [4, 11], L: [1, 8]}, peoples: {swamp: {E: 1, A: -1}, ice: {S: 1, I: -1}}, hp: 1.5, speed: 0.135, attack: {power: 1.5, cooldown: 13}, ks: 0.98},
  gnoll:       {special: {S: [4, 11], P: [5, 12], E: [5, 12], C: [1, 6], I: [1, 7], A: [4, 11], L: [1, 8]}, hp: 1.05, speed: 0.14, attack: {power: 1.2, cooldown: 12}, ks: 1.02},
  // raid monsters (data/monsters.js)
  demon:       {special: {S: [12, 16], P: [8, 12], E: [12, 16], C: [2, 6], I: [5, 9], A: [8, 12], L: [2, 6]}, hp: 3.2, speed: 0.12, attack: {power: 2.2, cooldown: 13, type: 'slash'}, resist: {ranged: 0.6}, ks: 0.86},
  zombie:      {special: {S: [5, 8], P: [1, 3], E: [7, 10], C: [0, 0], I: [0, 1], A: [1, 3], L: [0, 0]}, hp: 0.9, speed: 0.075, attack: {power: 0.9, cooldown: 18}, ks: 1.03},
  skeleton:    {special: {S: [4, 7], P: [2, 4], E: [5, 8], C: [0, 0], I: [0, 1], A: [3, 6], L: [0, 0]}, hp: 0.7, speed: 0.11, attack: {power: 1, cooldown: 14}, resist: {pierce: 0.5, slash: 0.8, blunt: 1.3}, ks: 1.03},
  upyr:        {special: {S: [5, 10], P: [5, 9], E: [6, 10], C: [0, 2], I: [1, 3], A: [5, 10], L: [1, 4]}, hp: 0.95, speed: 0.155, attack: {power: 1.15, cooldown: 12, type: 'pierce'}, ks: 0.94},
  vampire:     {special: {S: [9, 12], P: [8, 12], E: [9, 12], C: [8, 13], I: [8, 13], A: [8, 12], L: [3, 8]}, hp: 1.4, speed: 0.15, attack: {power: 1.6, cooldown: 11, type: 'pierce'}, ks: 0.94},
  necromancer: {special: {S: [1, 10], P: [1, 10], E: [1, 10], C: [2, 8], I: [7, 10], A: [1, 10], L: [1, 10]}, hp: 0.9, speed: 0.13, attack: {power: 1, cooldown: 12}, ks: 1.09},
  // the bestiary (data/bestiary.js)
  varg:        {special: around({S: 10, P: 10, E: 9, C: 2, I: 4, A: 9, L: 4}), hp: 1.5, speed: 0.15, attack: {power: 1.35, cooldown: 13, type: 'pierce'}, ks: 1.06},
  bear:        {special: around({S: 14, P: 6, E: 13, C: 2, I: 3, A: 5, L: 4}), hp: 3.6, speed: 0.12, attack: {power: 2.4, cooldown: 16, type: 'slash'}, ks: 0.94},
  lynx:        {special: around({S: 5, P: 11, E: 5, C: 2, I: 3, A: 12, L: 5}), hp: 0.6, speed: 0.16, attack: {power: 1, cooldown: 11, type: 'slash'}, ks: 1},
  elk:         {special: around({S: 11, P: 6, E: 12, C: 2, I: 2, A: 6, L: 4}), hp: 3.4, speed: 0.13, attack: {power: 2, cooldown: 16}, ks: 1.09},
  hyena:       {special: around({S: 6, P: 10, E: 8, C: 1, I: 3, A: 9, L: 5}), hp: 0.7, speed: 0.15, attack: {power: 0.9, cooldown: 12, type: 'pierce'}, ks: 1.06},
  toad:        {special: around({S: 7, P: 6, E: 9, C: 1, I: 1, A: 4, L: 4}), hp: 1, speed: 0.06, attack: {power: 1.2, cooldown: 20}, ks: 0.98},
  griffin:     {special: around({S: 16, P: 14, E: 13, C: 4, I: 5, A: 13, L: 5}), hp: 2.4, speed: 0.18, attack: {power: 1.9, cooldown: 13, type: 'slash'}, ks: 0.92},
  wyvern:      {special: around({S: 15, P: 10, E: 14, C: 2, I: 3, A: 10, L: 4}), hp: 2.8, speed: 0.15, attack: {power: 1.7, cooldown: 14, type: 'slash'}, ks: 0.92},
  dragon:      {special: around({S: 40, P: 14, E: 36, C: 6, I: 9, A: 10, L: 6}, 2), hp: 12, speed: 0.16, attack: {power: 5, cooldown: 12, type: 'slash'}, ks: 0.94},
  drake:       {special: around({S: 22, P: 11, E: 20, C: 3, I: 4, A: 9, L: 5}, 2), hp: 4.5, speed: 0.14, attack: {power: 2.6, cooldown: 15, type: 'slash'}, ks: 0.92},
  spider:      {special: around({S: 8, P: 9, E: 7, C: 0, I: 2, A: 12, L: 4}), hp: 1.1, speed: 0.13, attack: {power: 1, cooldown: 12, type: 'pierce'}, ks: 1.03},
  stoneworm:   {special: around({S: 18, P: 3, E: 18, C: 0, I: 1, A: 3, L: 3}), hp: 6, speed: 0.06, attack: {power: 2.8, cooldown: 22}, ks: 1.06},
  bat:         {special: around({S: 2, P: 12, E: 2, C: 0, I: 2, A: 13, L: 6}), hp: 0.2, speed: 0.17, attack: {power: 0.35, cooldown: 9, type: 'pierce'}, ks: 1.09},
  salamander:  {special: around({S: 4, P: 7, E: 8, C: 1, I: 2, A: 8, L: 5}), hp: 0.5, speed: 0.12},
  leshy:       {special: around({S: 12, P: 12, E: 14, C: 3, I: 6, A: 4, L: 6}), hp: 3, speed: 0.07, attack: {power: 1.4, cooldown: 16}, resist: {melee: 0.35, ranged: 0.25}, ks: 1.06},
  rusalka:     {special: around({S: 5, P: 9, E: 6, C: 12, I: 5, A: 9, L: 5}), hp: 1, speed: 0.11, attack: {power: 1, cooldown: 14, type: 'slash'}, ks: 0.95},
  kikimora:    {special: around({S: 3, P: 9, E: 5, C: 2, I: 5, A: 10, L: 7}), hp: 0.5, speed: 0.13},
  vodyanoy:    {special: around({S: 11, P: 8, E: 13, C: 6, I: 5, A: 5, L: 5}), hp: 2.4, speed: 0.08, attack: {power: 1.8, cooldown: 18}, resist: {melee: 0.5, ranged: 0.4}, ks: 1.04},
  poludnitsa:  {special: around({S: 6, P: 11, E: 7, C: 10, I: 6, A: 9, L: 5}), hp: 1.2, speed: 0.1, attack: {power: 1.1, cooldown: 15, type: 'slash'}, resist: {melee: 0.3, ranged: 0.3}, ks: 0.9},
  horse:       {special: around({S: 9, P: 7, E: 9, C: 3, I: 2, A: 7, L: 5}), hp: 2.4, speed: 0.17},
  aurochs:     {special: around({S: 13, P: 5, E: 13, C: 1, I: 1, A: 4, L: 4}), hp: 4.2, speed: 0.12, attack: {power: 2.3, cooldown: 17}, ks: 1.09},
  saiga:       {special: around({S: 4, P: 8, E: 6, C: 1, I: 1, A: 9, L: 5}), hp: 0.5, speed: 0.19},
  lion:        {special: around({S: 12, P: 10, E: 11, C: 3, I: 3, A: 9, L: 4}), hp: 3, speed: 0.15, attack: {power: 2.2, cooldown: 13, type: 'slash'}, ks: 0.92},
  crocodile:   {special: around({S: 14, P: 6, E: 15, C: 1, I: 1, A: 4, L: 3}), hp: 3.6, speed: 0.08, attack: {power: 2.6, cooldown: 20, type: 'pierce'}, ks: 1.01},
  camel:       {special: around({S: 10, P: 5, E: 12, C: 2, I: 2, A: 4, L: 4}), hp: 3, speed: 0.12, attack: {power: 1.6, cooldown: 16}, ks: 1.05},
  scorpion:    {special: around({S: 6, P: 8, E: 7, C: 0, I: 1, A: 10, L: 4}), hp: 0.9, speed: 0.12, attack: {power: 0.8, cooldown: 12, type: 'pierce'}, ks: 1.03},
  polarbear:   {special: around({S: 15, P: 6, E: 14, C: 2, I: 3, A: 5, L: 4}), hp: 4.2, speed: 0.12, attack: {power: 2.6, cooldown: 16, type: 'slash'}, ks: 0.88},
  seal:        {special: around({S: 5, P: 6, E: 8, C: 1, I: 2, A: 4, L: 5}), hp: 0.8, speed: 0.07},
  sheep:       {special: around({S: 3, P: 5, E: 5, C: 2, I: 1, A: 6, L: 4}), hp: 0.35, speed: 0.12},
};

// a species entry + its row → the full definition (data/species.js and the lists it gathers call this).
// A species with no row is an error at load time; a row with no species is caught by tools/check-data.mjs.
export function bodyFor(entry) {
  const row = CREATURES[entry.id];
  if (!row) throw new Error(`species ${entry.id}: no row in data/balance/creatures.js`);
  const out = {...entry, special: row.special, hp: row.hp, speed: row.speed};
  if (row.attack) out.attack = {...row.attack};
  else delete out.attack;
  if (row.resist) out.resist = {...row.resist};
  else delete out.resist;
  if (row.peoples && entry.peoples) out.peoples = entry.peoples.map(p => (row.peoples[p.id] ? {...p, shift: row.peoples[p.id]} : p));
  if (row.ks != null) out.ks = row.ks; else delete out.ks;
  return out;
}
