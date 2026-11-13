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
//   devotion  — a member's devotion to the guild, 0 … 1 (`start` when taken in): sent against his will (named, though he would not
//               have gone) − `forced`, with a bad mood on the road (`mood` for `days` days: campaign/social.js); + `paid` a season
//               his wage is paid, + `back` home from an errand handed in; below `leave` he leaves the guild (at the house, at a
//               season's start); in the muster + `will` × (devotion − `start`)
//   level     — the guild's level is its fame (the author's word 13.11: fame as experience, a level that can be lost): the
//               fame each level needs (`need`, from level 0); the highest tier of the contracts the world gives a guild of a
//               level (`tier`, by level: 0 — the deeds in town only); a deed in town done well — + `chore` fame
//   recruit   — those who come to the guild's door, anew each season (the author's word 13.11): `count` of them; their level is
//               the guild's (at least the 1st), but `down` of them one lower (not below the 1st) and `up` one higher; taking one
//               in costs `fee.base` + `fee.perLevel` × his level (his first season's keep and the signing)
//   kin       — families (campaign/kin.js; plans Г4–Г5, the author's word 13.11): one at the door is a brother or sister of one of
//               the guild (or of one beside him at the door) with the chance `door`, a kin of a person of the world (a ruler, an
//               officer of the town) with `person`; kin start with a bond of `bond` each way and draw each other in the muster by
//               `like`; a kin's death (in the guild or in the world) — devotion − `grief`, mood − `mood`; one leaving — mood −
//               `parting`. Couples: two of the guild, grown, a bond each way of `couple.bond` or more, wed with `couple.chance` a
//               season; one alone may wed in the town with `couple.town`. A couple (or one wed in the town) has a child a spring
//               with `child` × the race's fertility (data/races.js body), while the mother is under `fertile` of her race's life;
//               grown (the race's adult age), the child comes to the door (`door` of the season's)
//   mood      — a member's spirits at the guild, −1 … 1 (campaign/kin.js): a friend dead − `friend`, a party lost whole − `lost`,
//               more than half of it − `half`, a party back with its errand done + `won` (to those at the house and back);
//               fades × `fade` a season; below `low` — he may leave (× `leave` a season for each step under it, as a
//               companion of a caravan does); in the muster + `will` × his mood; a parent of a child not grown − `parent`
//   bond      — a deed done together: the bond between each two of them, + `won` when it went right, `lost` when it went wrong
//   rank      — by an errand's tier (data/errands.js; 0 — a deed in town): the least level the best of an expedition must have —
//               the newcomers start with the deeds in town (the author's word 12.11), a dragon is for a party of 16–20
//   retire    — rest and retirement (campaign/retire.js; the author's word 13.11): one who has lived `old` of his years, or bears
//               `maims` lasting maims, asks a season with a chance `ask` to rest; left unheard — his mood − `refused` each season;
//               at rest he stays at the house, never in a party, may hold a post (trainer, healer…), paid `pension` × his wage
//               (a post — the whole wage); granted — his mood + `glad`. Let go with honour — `gift`: base + perLevel × level gold
//               from the treasury; let go without — his friends at the guild lose `fired` of their devotion
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
  level: {need: [0, 8, 20, 40, 65, 95, 135, 185, 245, 320, 400], tier: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5], chore: 1},
  recruit: {count: 5, up: 0.03, down: 0.35, fee: {base: 10, perLevel: 15}},
  kin: {door: 0.15, person: 0.08, bond: 3, like: 2, grief: 0.15, mood: 0.5, parting: 0.2, couple: {bond: 4, chance: 0.15, town: 0.02}, child: 0.35, fertile: 0.5},
  mood: {friend: 0.15, lost: 0.3, half: 0.15, won: 0.1, fade: 0.7, low: -0.4, leave: 0.6, will: 0.3, parent: 0.2},
  bond: {won: 0.5, lost: -0.2},
  retire: {old: 0.75, maims: 2, ask: 0.35, refused: 0.15, glad: 0.2, pension: 0.5, gift: {base: 10, perLevel: 4}, fired: 0.1},
  devotion: {start: 0.7, forced: 0.2, paid: 0.02, back: 0.05, leave: 0.2, will: 0.5, mood: -0.15, days: 30},
};
