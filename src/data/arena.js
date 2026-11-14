// The arena (campaign/arena.js; app/arenaView.js): a third way to play — one fight on a camp map of a world cell drawn at random,
// the sides made by hand. Numbers only; what it is made of — the camp's fight (campaign/camp.js), the kinds, roles and bands of
// the game.
//   kinds — the fight: `kind` the camp's (data/camp.js: night — the foe comes at the camp; guard — the company storms the foe's
//           place, laid out as a scene; ambush — met close at once), `meet` — the arena's meeting: wall on wall, nobody creeps
//   hour  — the hour it begins at (the foe comes `clock.come` hours later, the fight may last `clock.until` hours)
//   gear  — the company's gear by step: the threat its role's kit is drawn at (data/roles.js roleKit, ROLE_TIERS)
//   threat — the foe's bands' gear by the same steps (raidThreat)
//   most  — the most of a side: fighters of the company, heads of a beast row, КС of a band row
//   dark  — a foe that shuns the sun (a species `sun`, `nocturnal`; a band of them) fights only by night or in a vault
//           (data/pieces.js SCENES vault: under the ground, always night)
export const ARENA = {
  kinds: {
    defend: {kind: 'night', label: 'Оборона лагеря', note: 'враг приходит к вашему лагерю'},
    storm: {kind: 'guard', label: 'Штурм', note: 'отряд идёт на место врага: сцена с его логовом в середине карты'},
    meet: {kind: 'ambush', meet: true, label: 'Встречный бой', note: 'стенка на стенку: обе стороны рядом, никто не крадётся'},
  },
  hour: {day: 10, night: 23},
  clock: {come: 0.1, until: 10},
  gear: [{label: 'дерево и кость', t: 0}, {label: 'бронза', t: 10}, {label: 'железо', t: 20}, {label: 'сталь', t: 32}, {label: 'лучшее', t: 60}],
  levels: {member: [1, 20], foe: [1, 9]},
  most: {members: 16, heads: 30, band: 3000},
  // a random side: how many, and the КС the foe is drawn to against the company's (× the company's)
  random: {members: [4, 8], rows: [1, 2], band: 0.5, bandS: [300, 500], over: 1.2},
  dark: {bands: ['upyrs', 'vampire']},
};
