// Armour, clothing and shields: every number a balance pass touches (names and colours: data/items.js).
// After an edit: `npm run items` and `npm run arena`.
//
//   tier:   the material step, as for weapons (data/balance/weapons.js): 0 hide, bone, cloth · 2 iron
//   form:   the family; the same form one tier up must protect better and cost more
//   armor:  share of a blow's damage absorbed;  block: chance to stop a melee blow (shields)
//   warmth: share of cold kept out;  speed: walking multiplier (heavy armour slows)
//   dur:    hits taken (or blocks made) before it breaks;  value: price of a plain piece in imperial gold
export const ARMOR = {
  // shields (held in a hand)
  shield:      {tier: 0, form: 'shield',  block: 0.32, dur: 35, value: 3},
  // clothing: warm before it is armour
  clothes:     {tier: 0, form: 'cloth',   armor: 0.08, warmth: 0.35, dur: 50,  value: 1},
  linen:       {tier: 0, form: 'cloth',   armor: 0.1,  warmth: 0.45, dur: 90,  value: 3},
  woolens:     {tier: 0, form: 'cloth',   armor: 0.1,  warmth: 0.7,  dur: 110, value: 5},
  furcoat:     {tier: 0, form: 'fur',     armor: 0.14, warmth: 0.85, speed: 0.97, dur: 80,  value: 4},
  furlined:    {tier: 0, form: 'fur',     armor: 0.16, warmth: 0.95, speed: 0.97, dur: 100, value: 9},
  // armour
  jerkin:      {tier: 0, form: 'leather', armor: 0.2,  warmth: 0.55, dur: 70,  value: 3},
  hardleather: {tier: 0, form: 'leather', armor: 0.35, warmth: 0.45, speed: 0.95, dur: 90,  value: 9},
  lamellar:    {tier: 2, form: 'plates',  armor: 0.5,  warmth: 0.4,  speed: 0.93, dur: 170, value: 30},
  scalemail:   {tier: 2, form: 'plates',  armor: 0.48, warmth: 0.35, speed: 0.94, dur: 190, value: 25},
  chainmail:   {tier: 2, form: 'mail',    armor: 0.55, warmth: 0.3,  speed: 0.95, dur: 220, value: 40},
};
