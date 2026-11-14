// The ways of the kinds (plan claude/bestiary-plan.md З-10; the author's word 14.11: a goblin of the first band and of the
// last are not the same goblin). A creature of a band or a lair carries the perks of its kind's way up to its level, on top of
// what its kind is born with (data/bestiary.js `perks`) and of its class's way (data/classes.js) — one list, the same id at the
// highest rank (data/perks.js perksOf). A pawn of the caravan or the guild takes none of it: it grows by its own picks.
// Every row written out (the author's word 13.11: no «× the rank», no formula of the level):
//   SPECIES_PATH — {species: [{level, perk, rank}]}
// Where a creature's level comes from:
//   a band — its threat (data/classes.js bandLevel: 1/3/5/7/9);
//   a lair of the world — its age (LAIR_LEVEL: years since it was founded, up to `age[k]` — `level[k]`);
//   a camp put up for a contract — its tier (TIER_LEVEL[tier]).
export const SPECIES_PATH = {
  // ── the thinking kinds of the bands and the tribes
  goblin:   [{level: 3, perk: 'herd', rank: 1}, {level: 5, perk: 'shadowStep', rank: 1}, {level: 9, perk: 'roar', rank: 1}],
  orc:      [{level: 3, perk: 'bloodPrice', rank: 1}, {level: 7, perk: 'oldWolf', rank: 1}, {level: 9, perk: 'roar', rank: 1}],
  gnoll:    [{level: 5, perk: 'fleet', rank: 1}, {level: 7, perk: 'oldWolf', rank: 1}, {level: 9, perk: 'roar', rank: 1}],
  troll:    [{level: 3, perk: 'livingFlesh', rank: 1}, {level: 5, perk: 'fury', rank: 1}, {level: 9, perk: 'roar', rank: 1}],
  ogre:     [{level: 5, perk: 'stalwart', rank: 1}, {level: 7, perk: 'roar', rank: 1}, {level: 9, perk: 'stalwart', rank: 2}],
  giant:    [{level: 5, perk: 'stalwart', rank: 1}, {level: 7, perk: 'rockThrow', rank: 1}, {level: 9, perk: 'roar', rank: 1}],
  human:    [{level: 7, perk: 'oldWolf', rank: 1}],
  dwarf:    [{level: 5, perk: 'stalwart', rank: 1}, {level: 9, perk: 'oldWolf', rank: 1}],
  elf:      [{level: 5, perk: 'deadEye', rank: 1}, {level: 9, perk: 'deadEye', rank: 2}],
  darkelf:  [{level: 3, perk: 'shadowStep', rank: 1}, {level: 7, perk: 'shadowStep', rank: 2}],
  // ── the dead
  skeleton: [{level: 5, perk: 'stalwart', rank: 1}, {level: 9, perk: 'stalwart', rank: 2}],   // (old bones grown hard; never scales: a club still breaks them)
  zombie:   [{level: 5, perk: 'grab', rank: 1}, {level: 9, perk: 'stalwart', rank: 1}],
  upyr:     [{level: 5, perk: 'fleet', rank: 1}, {level: 9, perk: 'bloodDrink', rank: 3}],
  vampire:  [{level: 7, perk: 'roar', rank: 1}, {level: 9, perk: 'bloodDrink', rank: 3}],
  // ── beasts and monsters
  wolf:     [{level: 5, perk: 'charge', rank: 1}, {level: 9, perk: 'oldWolf', rank: 1}],
  varg:     [{level: 5, perk: 'charge', rank: 2}, {level: 7, perk: 'charge', rank: 3}, {level: 9, perk: 'roar', rank: 1}],
  hyena:    [{level: 5, perk: 'charge', rank: 1}, {level: 7, perk: 'fleet', rank: 1}],
  bear:     [{level: 5, perk: 'roar', rank: 1}, {level: 9, perk: 'charge', rank: 2}],
  polarbear: [{level: 5, perk: 'roar', rank: 1}, {level: 9, perk: 'charge', rank: 2}],
  lynx:     [{level: 5, perk: 'shadowStep', rank: 1}, {level: 9, perk: 'leap', rank: 1}],
  boar:     [{level: 5, perk: 'charge', rank: 1}, {level: 9, perk: 'charge', rank: 2}],
  lion:     [{level: 5, perk: 'charge', rank: 1}, {level: 7, perk: 'roar', rank: 1}, {level: 9, perk: 'leap', rank: 1}],
  spider:   [{level: 5, perk: 'venom', rank: 2}, {level: 7, perk: 'webShot', rank: 3}, {level: 9, perk: 'venom', rank: 3}],
  toad:     [{level: 5, perk: 'grab', rank: 2}, {level: 9, perk: 'swallow', rank: 2}],
  crocodile: [{level: 5, perk: 'scales', rank: 1}, {level: 7, perk: 'grab', rank: 3}, {level: 9, perk: 'scales', rank: 2}],
  griffin:  [{level: 5, perk: 'grab', rank: 2}, {level: 9, perk: 'charge', rank: 3}],
  manticore: [{level: 5, perk: 'roar', rank: 1}, {level: 9, perk: 'venom', rank: 2}],
  wyvern:   [{level: 5, perk: 'scales', rank: 3}, {level: 9, perk: 'flight', rank: 3}],
  drake:    [{level: 5, perk: 'roar', rank: 1}, {level: 7, perk: 'tailSweep', rank: 1}, {level: 9, perk: 'fireBreath', rank: 4}],
  stoneworm: [{level: 7, perk: 'swallow', rank: 2}],
  scorpion: [{level: 5, perk: 'sting', rank: 3}, {level: 7, perk: 'scales', rank: 2}, {level: 9, perk: 'grab', rank: 2}],
  owlbear:  [{level: 5, perk: 'grab', rank: 1}, {level: 7, perk: 'roar', rank: 2}, {level: 9, perk: 'charge', rank: 2}],
  ankheg:   [{level: 5, perk: 'acidJet', rank: 3}, {level: 7, perk: 'scales', rank: 2}, {level: 9, perk: 'grab', rank: 2}],
  constrictor: [{level: 5, perk: 'constrict', rank: 3}, {level: 9, perk: 'grab', rank: 3}],
  crawler:  [{level: 5, perk: 'numbing', rank: 2}, {level: 9, perk: 'grab', rank: 2}],
  rustbeast: [{level: 5, perk: 'rust', rank: 3}, {level: 9, perk: 'scales', rank: 2}],
  cobra:    [{level: 5, perk: 'venomSpit', rank: 3}, {level: 9, perk: 'venom', rank: 3}],
  bulette:  [{level: 5, perk: 'charge', rank: 1}, {level: 9, perk: 'roar', rank: 1}],
  hookhorror: [{level: 5, perk: 'grab', rank: 3}, {level: 9, perk: 'scales', rank: 3}],
  cyclops:  [{level: 5, perk: 'stalwart', rank: 1}, {level: 7, perk: 'roar', rank: 2}, {level: 9, perk: 'charge', rank: 2}],
};

// a lair of the world: its folk's level by its age (years since it was founded, a.hist.year − lair.born)
export const LAIR_LEVEL = {age: [0, 10, 30, 60, 120], level: [1, 3, 5, 7, 9]};
export function lairLevel(age) {
  let k = 0; while (k + 1 < LAIR_LEVEL.age.length && age >= LAIR_LEVEL.age[k + 1]) k++;
  return LAIR_LEVEL.level[k];
}
// a camp put up for a contract: its folk's level by the contract's tier (I … V)
export const TIER_LEVEL = {level: [1, 1, 3, 5, 7, 9]};
export const tierLevel = tier => TIER_LEVEL.level[Math.max(0, Math.min(TIER_LEVEL.level.length - 1, tier || 0))];

// the way of a kind, sorted by level (a copy)
export const pathOf = species => (SPECIES_PATH[species] || []).slice().sort((x, y) => x.level - y.level);
