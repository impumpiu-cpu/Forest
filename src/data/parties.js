// Parties: the forces of the world map that move as things, not as fields (atlas/parties.js,
// docs/WORLD.md «Отряды»). Everything weaker than `threshold` stays diffuse — the small raids,
// the caravans, the hunters — and is settled by chance where it stands, as before. What is stronger
// walks the map as a party: a raid out of a lair, a brood going to found a new lair, an army of a
// realm at war, a dragon on the wing. The season stays the world's tick; inside it a party moves
// day by day (data/atlas.js SEASON_DAYS), and the screen slides it between frames.
export const PARTIES = {
  // might from which a raid moves as a party rather than being settled by chance — about a strong
  // camp (strength 0,6 × a greenskin's SPECIAL ≈ 3); armies and dragons always do
  threshold: 3,
  // cells a day over open meadow (of a 192-cell-high world; scaled with the map); a cell's cost
  // (data/roads.js ROADS.cost, eased by a road) divides it; flight ignores the ground
  speed: {foot: 0.7, rider: 1.1, flight: 2.5},
  // a party that cannot reach its goal (no path, the goal gone) goes home; one that cannot go home disbands
  giveUp: 200,     // days a party may be on the way before it turns back
};

// Raids of the lairs as parties: the deed atlas/deeds/raid.js picks the target and the might; the party strikes
// when it arrives and carries the loot home — the camp grows on its return.

// Armies of realms at war (atlas/diplomacy.js → atlas/parties.js). Each year of a war the realm whose
// turn it is musters an army at its town nearest the enemy: `levy` of the town's people march (× its people's `levy`, data/peoples.js:
// a tenth of a human town, half of a greenskin horde) and `beasts` of the beasts of its store (the horde: all, data/peoples.js
// beastLevy), with
// the town's might × `might`; the army walks to the enemy's nearest town and besieges it.
//   siege: each day the besiegers burn one of the town's works with chance `burn`, so its food falls;
//          the town eats its stock (`stock` seasons of food in granaries and cellars, ×(1 + `stockFood`
//          × its food effects)); when the stock is gone the people starve by `starve` a day; the army assaults
//          when the town is weakened enough (`assaultAt` × its might, walls counting) or after
//          `longest` days; a lost assault sends the army home with `beatenLoss` of its men; a town taken
//          with fewer than `broken` of the people it had when the siege began is burnt, whatever its size
//   supplies: days an army feeds itself (each work burnt at a siege adds `forage` days); beyond them it
//             loses `attrition` of its men a day and turns home
//   scourge: radius (cells) around a marching or besieging army where its foragers rule: the works
//            there yield nothing and no road is worn (a.f.scourge: 1 under the army, fading by `scourgeFade` a
//            year; the works and the roads count the land as scourged above `scourged` — so a year after the
//            army has gone, at exactly 0.45, it is clear again; the fade must stay ≤ the threshold)
export const ARMY = {levy: 0.1, beasts: 0.25, might: 2.85, minMen: 16, burn: 0.08, stock: 1.5, stockFood: 0.25, starve: 0.008, assaultAt: 0.9, longest: 120, beatenLoss: 0.35, winLoss: 0.15, broken: 0.55,
  supplies: 120, forage: 15, attrition: 0.02, scourge: 2.5, scourgeFade: 0.45, scourged: 0.45, everyYears: 1};

// The dragon (data/bestiary.js `dragon`; the lair kind in data/lairs.js): one or two in a world, in
// an ancient lair at a volcano. It sleeps for years, then flies out: to the richest town within
// `reach` cells, burns `burns` of its works and `loss` of its people, and flies home to sleep again.
export const DRAGON = {sleep: [6, 14], reach: 45, burns: [2, 4], loss: 0.1, might: 60};
