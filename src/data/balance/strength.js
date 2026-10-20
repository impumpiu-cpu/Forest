// The strength rating (КС, коэффициент силы): one number for how much a fighter is worth in a fight.
// A plain human with tier 0 gear (`ref`) is 100. Ratings add up: two sides with the same total should win
// about half the time each, whatever their numbers — ten goblins of 10 against one human of 100.
// The game reads it through agents/strength.js; `npm run arena` (part 2, group battles) checks it and
// says what to change here.
//
// How a rating is made (agents/strength.js):
//   offence  = damage per tick the creature deals: blow × strength × skill × crits / cooldown
//              (or shots × hit chance, whichever is more; a venomous bite adds its poison)
//   staying  = health / (1 − armour) / (1 − block) / (1 − dodge), more for what plain weapons barely hurt
//   rating   = base × ((offence × staying) / the same of `ref`) ^ alpha × adjust[species]
// `alpha` says how numbers fight. 1 — each fights one foe at a time (two humans are only twice one);
// 0.5 — everyone strikes at once (Lanchester's square law: two humans stand against four of a fighter
// half as good). Melee in the open sits between; the arena measures it.
export const STRENGTH = {
  base: 100,
  // the 100: a human, 5 in every letter, no skill, a bone spear and bast clothes
  ref: {species: 'human', special: 5, skill: 0, kit: ['spear', 'clothes']},
  // fitted by `npm run arena` (4000 battles): 0.55 — melee in the open is close to everyone striking at once
  alpha: 0.55,
  // shots count for this share of their damage (a bow shoots only while the foe is still coming)
  rangedWeight: 1,
  // blood drunk: health stretched as if it were 1 / (1 − drinks × this)
  drinksWeight: 0.5,
  // what the formula misses for a species (speed, reach, how it holds up in a crowd): × to its rating,
  // as the arena suggests
  adjust: {demon: 0.89, upyr: 0.94, goblin: 1.05, vampire: 0.94},
};
