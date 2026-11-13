// Morale: one's own, in a fight (agents/morale.js; plan claude/combat-plan.md Бой-1, the author's word 13.11). A ladder of
// states seen by the player — confident, steady, wavering, breaking, fleeing — with a number 0…100 under it. The donors:
// Battle Brothers (the ladder; a check at each event, against one's resolve; the dead immune), OpenXcom (the numbers: a loss
// × (110 − resolve) / 100, an officer's leadership, an officer's death felt more), Cataclysm DDA (a beast's: wounds and the
// kin falling stir it, fire scares it). The tables «Мораль» (data/schema/index.js) show and edit them.
//
//   start   — one's morale at the fight's start (× nothing: the steady middle)
//   ladder  — the states, from the top: one is in the first whose `at` its morale reaches; `fight` × its blows and shots
//             (a fleeing one strikes nothing), `guard` × the blows it takes
//   want    — the weight of the flight, in its lane (red: above the fight, below fire and the fallen)
//   rally   — a fleeing one stops fleeing once its morale is back to `at` and no foe stands within `far` cells; until then it
//             runs (agents/behaviours/rout.js): a raider, a beast — off the map; one of the caravan — to the fire
//   think   — every this many ticks one weighs where it stands: the foes and friends within `view`
//   loss    — every loss of morale × (110 − resolve) / 100 (OpenXcom); a gain × (resolve + 10) / 100
//   fell    — one of one's side falls (dead or senseless) within `view` and is seen: `base` points; × `near` within `close`
//             cells; × `kin` for one's kin, `friend` for one thought well of, `officer` for an officer, `leader` for the
//             band's leader (OpenXcom: an officer's death felt × 1.2–1.75)
//   killed  — one of the foe falls: the one who struck `own`, those of its side who saw it `seen`; the foe's leader — `leader`
//   wound   — a blow taken: `per` points × the share of its health it took
//   standing — where one's morale settles while it stands where it stands (each think it drifts `drift` of the way there; the
//             events above strike it off it): `calm.to`, − the odds — the foes' strength nearby over one's side's, past 1,
//             × `odds.per` (capped at `odds.cap` times; × temper, × (110 − resolve) / 100) — or + one's side the stronger,
//             × `odds.gain`; − a ring of foes within `close` past `ring.from`, `ring.per` each (Battle Brothers, OpenXcom:
//             the odds and the ring are a check's modifiers, not a drain)
//   officer — an officer of one's side within `near` cells softens every loss ÷ (1 + its bonus): an officer `officer`, the
//             band's leader `leader`, a boss `boss` (OpenXcom's sergeant 10 % … commander 50 %)
//   home    — + resolve to one holding its own home (a lair stormed, a caravan's camp attacked)
//   squad   — a band (agents/squad.js) breaks when `broken` of its members are breaking or fleeing, or `leaderless` of them
//             once its leader fell
//   resolve — one's resolve 0…100: its species' (`species`; else its kind's `kind`), + `bravery` × (its bravery − 1)
//             (agents/agent.js own bravery, traits, traumas, potions), + `level` a level past the first (capped `levelCap`)
//   temper  — how a species takes a fight, beside its resolve: × the points of each kind of event (`fell`, `wound`, `odds`,
//             `ring`); `numbers` — its side's numbers count for more than their strength (a goblin)
export const MORALE = {
  start: 60, think: 10, view: 12, close: 2.5,
  want: 5,   // the weight of running, once fleeing (agents/behaviours/rout.js): above a fight's, below fire's and a fall's
  ladder: [
    {id: 'confident', label: 'уверен', at: 80, fight: 1.1, guard: 0.95},
    {id: 'steady', label: 'стоек', at: 50, fight: 1, guard: 1},
    {id: 'wavering', label: 'колеблется', at: 30, fight: 0.9, guard: 1.05},
    {id: 'breaking', label: 'ломается', at: 12, fight: 0.75, guard: 1.1},
    {id: 'fleeing', label: 'бежит', at: 0, fight: 0, guard: 1.15},
  ],
  rally: {at: 30, far: 10},
  fell: {base: 12, close: 4, near: 1.3, kin: 1.6, friend: 1.3, officer: 1.4, leader: 1.75},
  killed: {own: 10, seen: 4, leader: 14},
  wound: {per: 25},
  odds: {per: 20, cap: 3, gain: 10},
  ring: {from: 1, per: 8},
  calm: {to: 60},
  drift: 0.2,
  officer: {near: 8, officer: 0.25, leader: 0.4, boss: 0.5},
  home: 10,
  squad: {broken: 0.5, leaderless: 0.3},
  resolve: {bravery: 40, level: 1.5, levelCap: 15,
    kind: {race: 45, beast: 35, monster: 60, spirit: 60, demon: 75},
    species: {
      human: 45, elf: 45, darkelf: 50, dwarf: 55, halfling: 35,
      orc: 55, goblin: 25, troll: 80, ogre: 75, giant: 80, gnoll: 35,
      wolf: 35, varg: 45, bear: 55, lion: 50, lynx: 30, hyena: 30, boar: 50, spider: 40, scorpion: 45,
      griffin: 60, manticore: 65, wyvern: 70, drake: 70, dragon: 95, stoneworm: 70,
      vampire: 70, upyr: 50,
    }},
  temper: {
    // the big ones: a blow, a ring of foes, a friend's fall — little to them
    stubborn: {fell: 0.6, wound: 0.5, odds: 0.6, ring: 0.3},
    // the pack: the odds are everything — it presses the weak, it runs from the strong
    pack: {fell: 1, wound: 1, odds: 2, ring: 1.2},
    // the skittish: frightened easily, bold in a crowd
    skittish: {fell: 1.4, wound: 1.2, odds: 1.2, ring: 1.3, numbers: true},
  },
  tempers: {troll: 'stubborn', ogre: 'stubborn', giant: 'stubborn', dragon: 'stubborn', stoneworm: 'stubborn',
    gnoll: 'pack', hyena: 'pack', wolf: 'pack', varg: 'pack',
    goblin: 'skittish', halfling: 'skittish', lynx: 'skittish'},
};
