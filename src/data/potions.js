// The healing potion (docs/RULES.md «Зелье лечения»): brewed in the healer's hut from healing herbs (data/recipes.js
// `potion`), bought dear in towns, found now and then, carried by a foe only rarely. Each fighter has a slot of its own
// for them — at most `slot` — and drinks one by itself when its health falls below `below` of its whole (agents/potions.js):
// it heals `heal` at once, whatever the body (a human has 1 health, a dwarf 1.8, an elf 0.83 — data/races.js), so a potion
// is worth more to the slight than to the stout.
export const POTION = {
  heal: 0.6,       // ≈ 60 % of a standard fighter's health (a human: 1)
  below: 0.15,     // drunk when health falls below this share of the whole, while still on one's feet
  slot: 3,         // carried at most
  herbs: 2,        // healing herbs a potion takes (the recipe)
  // the settlement's stock fills its people's slots (settlement/potions.js): every `hand` ticks
  hand: 60,
  // a foe carries one with this chance (data/migrations.js raiders)
  foe: 0.03,
  // the caravan (campaign/march.js): a day of camp with the healer's hut in the camp gathers a healing herb with this
  // chance (× 2 in wooded land); herbs are brewed at once into potions while the slots are not full
  camp: {herbs: 0.35, wooded: 2},
};
