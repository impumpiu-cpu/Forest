// Weapons: every number a balance pass touches. Names, slots, looks and flags (iron, silver, tradeOnly)
// stay in data/items.js; data/items.js takes the numbers from here by the item's id.
// After an edit: `npm run items` (power levels, prices, dominated pieces) and `npm run arena`
// (thousands of duels without graphics). How to read both: docs/BALANCE.md.
//
//   tier:   the material step — 0 wood, bone and stone · 1 bronze and cast silver · 2 iron · 3+ what comes later
//   form:   the family of the weapon; the same form one tier up must hit harder and cost more (npm run items)
//   melee:  {dmg, cd} — dmg multiplies the base blow, cd is ticks between blows (lower is faster)
//   ranged: {dmg, range, cd} — what the ammunition is lives in data/items.js
//   block:  chance to stop a melee blow;  speed: walking multiplier;  tool: {job: work speed multiplier}
//   dur:    uses before it breaks;  value: price of a plain (+0) piece in imperial gold (finer: data/quality.js)
// The shape of the table (npm run items): within a tier spears hit hardest of the one-handers, axes a
// little softer (they are tools too), a two-hander makes up for the shield it leaves no hand for, and a
// metal piece costs more than the metal it is made of. Bows and slings lose a duel to a club on purpose:
// they shoot from afar while others hold the line.
export const WEAPONS = {
  // tier 0: the woods give it
  club:        {tier: 0, form: 'club',   melee: {dmg: 1.3,  cd: 12}, dur: 70, value: 1},
  spear:       {tier: 0, form: 'spear',  melee: {dmg: 1.55, cd: 13}, dur: 55, value: 1.5},
  axe:         {tier: 0, form: 'axe',    melee: {dmg: 1.45, cd: 13}, tool: {chop: 1.6}, dur: 90, value: 2},
  staff:       {tier: 0, form: 'staff',  melee: {dmg: 1.4,  cd: 10}, block: 0.15, speed: 1.05, dur: 80, value: 2},
  maul:        {tier: 0, form: 'maul',   melee: {dmg: 2.5,  cd: 15}, tool: {build: 1.45, mine: 1.35}, dur: 90, value: 3},
  bow:         {tier: 0, form: 'bow',    melee: {dmg: 0.6,  cd: 14}, ranged: {dmg: 1.7, range: 7, cd: 22}, dur: 90, value: 5},
  sling:       {tier: 0, form: 'sling',  melee: {dmg: 0.5,  cd: 14}, ranged: {dmg: 0.6, range: 4.5, cd: 20}, dur: 60, value: 0.5},
  // tier 1: cast in bronze (or silver) at the furnace on a wood fire
  bronzespear: {tier: 1, form: 'spear',  melee: {dmg: 1.75, cd: 13}, dur: 95, value: 3.5},
  bronzeaxe:   {tier: 1, form: 'axe',    melee: {dmg: 1.65, cd: 13}, tool: {chop: 1.9, build: 1.08}, dur: 120, value: 3.5},
  silverknife: {tier: 1, form: 'dagger', melee: {dmg: 1.3,  cd: 9},  dur: 70, value: 10},
  // tier 2: forged iron
  ironspear:   {tier: 2, form: 'spear',  melee: {dmg: 1.95, cd: 12}, dur: 120, value: 5},
  ironaxe:     {tier: 2, form: 'axe',    melee: {dmg: 1.85, cd: 12}, tool: {chop: 2.2, build: 1.15}, dur: 160, value: 5},
  sword:       {tier: 2, form: 'sword',  melee: {dmg: 1.95, cd: 11}, block: 0.1, dur: 150, value: 8},
};
