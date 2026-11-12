// The adventurers' guild (plan claude/guild-plan.md Г1; docs/GUILD.md): a house in a capital of the living world that takes the
// world's errands and sends its own people on them. The world lives on its own; the guild only answers what it asks.
//   start     — the founding: `gold` in the treasury; `candidates` come to the door, `pick` of them are taken in
//   party     — an expedition (a caravan on the world map, its camps on the local map): `min`…`max` of the guild's people
//               (`max` grows with the guild's rooms later — Г6)
//   chore     — a deed in town (tier 0, data/chores.js): `hands` of the guild at once, offered `perSeason` a season (±`spread`),
//               each offer standing `stands` days
//   home      — a day at the guild's house: the hurt mend `heal` of their health; one below `ready` is still healing (may be
//               sent all the same, at his own risk)
//   wage      — a season's pay of a member: `base` + `perLevel` × (level − 1), gold; unpaid `leave` seasons running — he leaves
//   age       — a recruit's years: the race's grown age + up to `span` × (its life − grown age), skewed young by `skew`;
//               he dies of age at his life (atlas/population.js lifeOf, health drawn) × `dies` (drawn between the two)
//   purse     — the gold an expedition takes from the treasury by default (its food, ferries, hires on the way); what is left
//               comes back; `food` — the price of a day's ration bought for the road
//   roster    — at most this many in the guild (the barracks of Г6 raise it)
//   muster    — who goes (campaign/guild.js muster; the author's word 12.11): the player names at most `named` of the party asked
//               (at least one), the rest of those at the house answer for themselves, as a colonist answers the board: a will of
//               `base`, + `brave` × (bravery − 1) (data/traits.js), − `risk` for each level the errand's rank stands above one's own,
//               + `bond` × (opinion − `neutral`) to each one already going (data/relations.js opinion with the guild's bonds),
//               − `rest` when back home less than `restDays` days, − `hurt` × the health short of home.ready, ± `sway` drawn;
//               will above `line` — goes. One who thinks of one going no better than `foe` will not go with him; one at `friend` or
//               above is gone after. The strongest will first, one at a time (each one going changes the others' answer)
//   acquaint  — the founding: two of those who came to the door know each other from the town with the chance `chance`: a bond of
//               `least`…1 × ±`spread` (campaign/social.js relations), a little more often good than bad (`good`); each way of it
//               apart by up to ±`diff` × `spread`
//   bond      — a deed done together: the bond between each two of them, + `won` when it went right, `lost` when it went wrong
//   rank      — by an errand's tier (data/errands.js; 0 — a deed in town): the least level the best of an expedition must have —
//               the newcomers start with the deeds in town (the author's word 12.11), a dragon is for a party of 16–20
export const GUILD = {
  start: {gold: 150, candidates: 20, pick: 8},
  party: {min: 1, max: 6},
  chore: {hands: 4, perSeason: 5, spread: 2, stands: 30},
  home: {heal: 0.04, ready: 0.75},
  wage: {base: 1, perLevel: 0.25, leave: 2},
  age: {span: 0.35, skew: 1.6, dies: [0.85, 1.15]},
  purse: 20, food: 0.15,
  roster: 16,
  rank: [0, 3, 6, 9, 12, 16],
  muster: {named: 0.25, base: 0.15, brave: 0.6, risk: 0.12, bond: 0.15, neutral: 2, rest: 0.2, restDays: 30, hurt: 1.5, sway: 0.25, line: 0, foe: -1, friend: 4},
  acquaint: {chance: 0.4, spread: 3.5, good: 0.6, least: 0.25, diff: 0.25},
  bond: {won: 0.5, lost: -0.2},
};
