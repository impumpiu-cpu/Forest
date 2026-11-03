// The smith's mark (docs/BALANCE.md, «Клеймо кузнеца»): what only a smith of a people's town puts on a piece he forges.
// Each people's smiths are masters of one kind of blow — the elves of the thrust, the orcs of the cut, the dwarves of
// the crushing blow — and whatever they make strikes and guards better in that kind. Humans have no mark: they stand
// in the middle, with no gift and no flaw.
//
// A piece of the mark's own kind (an elven spear, a dwarven hammer): its blow × (1 + hit). A piece of another kind keeps
// its nature but takes the mark's kind into its blow: a dwarven sword still cuts, yet `share` of its blow is a crushing
// one, × (1 + hit) — «a sharpened crowbar does not stop crushing». Armour and shields of a mark guard better against the
// mark's kind: their `vs` for it × (1 + guard). One mark on a piece at most.
//
// Where a mark comes from: forging in a town of the people (campaign/town.js smithy: a town's forge works no worse than
// +1, `forge`), the town's market (its smiths' work), a trader from such a town on the local map (`trader` — the share of
// metal and wooden arms he brings that bear the mark), trophies. Neither the outpost nor the caravan can put a mark on.
//   price — × to the price of the piece (on top of its quality)
export const MARKS = {
  elf:   {id: 'elf', people: 'elves', blow: 'pierce', label: 'эльфийской работы', short: 'эльф.'},
  orc:   {id: 'orc', people: 'orcs', blow: 'slash', label: 'работы зеленокожих', short: 'зелен.'},
  dwarf: {id: 'dwarf', people: 'dwarves', blow: 'blunt', label: 'дварфийской работы', short: 'дварф.'},
};

export const MARK = {hit: 0.25, guard: 0.25, share: 0.3, price: 1.5, trader: 0.35, forge: {q: 1, cityQ: 2, cityTier: 2}};

// the mark a people's smiths put on (null: none — humans, or a people with no smiths of its own)
export const markOfPeople = people => Object.values(MARKS).find(m => m.people === people)?.id || null;
// whether a piece can bear a mark: arms and armour that finer work can improve
export const markable = d => d.quality !== false && !!(d.melee || d.ranged || d.armor || d.block);
