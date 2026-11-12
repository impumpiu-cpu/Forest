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
export const GUILD = {
  start: {gold: 150, candidates: 20, pick: 8},
  party: {min: 1, max: 6},
  chore: {hands: 4, perSeason: 5, spread: 2, stands: 30},
  home: {heal: 0.04, ready: 0.75},
  wage: {base: 1, perLevel: 0.25, leave: 2},
  age: {span: 0.35, skew: 1.6, dies: [0.85, 1.15]},
  purse: 20, food: 0.15,
  roster: 16,
};
