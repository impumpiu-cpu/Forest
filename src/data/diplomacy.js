// How the peoples of the world map get on (atlas/diplomacy.js). Each pair of peoples that has met has
// an attitude, −5 … +5, that starts from the old memory of their races (data/relations.js) and moves
// every year:
//   drift     back towards that old memory, this much a year
//   pressure  living on the same land sours them: − pressure × the share of their land they share
//   trade     every trade route between their towns warms them: + trade a route, at most tradeMax a year,
//             and never past `tradeCeil` above their old memory: trade makes neighbours, not kin
//   raid      an orc raid on the other's town: − raid
//   war       a war is declared at `warAt` or below when their lands touch; it wears them out by
//             `weariness` a year; peace is made when the attitude has risen to `peaceAt` (or after
//             `longest` years of war) and is set to `afterPeace`
//   states    words for an attitude: the first whose `from` it reaches
// Lands overlapping: where two peoples live on the same coarse cell, each loses `compete[state]` ×
// the other's density a year — friends share the land, enemies push each other out (Lotka–Volterra).
// Towns: a town on a trade route takes in folk of the other people, `mingle` of its people a year up
// to `mingleMax`. In a war the nearest towns of the two fight once a year within `front` cells (of a
// 192-cell-high world): the loser loses `battleLoss` of its people, and a hamlet beaten that hard is
// burnt (`raze` people, or `razeShare` of its step's threshold — a bled town of any size): a ruin stays, and the
// battlefield is left with barrows.
// A people of raiders (the deed `raidTown` in its row, data/deeds.js — the orcs) raids the nearest town of a people
// it dislikes within `raidReach` cells, at most `raidsPerYear` raids a year for the realm: the loot grows the raiding
// town, the victim loses `raidLoss`. War, peace and the armies' marches are the realms' deeds too (atlas/court.js,
// atlas/deeds/): this file keeps their numbers, atlas/diplomacy.js the body of the relations.
// The dead of a war beyond the fighters (WAR_LOSS; atlas/population.js books them by cause — the cards and tools/pop-ledger.mjs
// show them): a work burnt by raiders or besiegers (atlas/sites.js raidSite) kills `work` [from, to] of the hands that worked
// it (the building's `jobs`, data/townBuildings.js); a storm takes `battleLoss` of the town (above); a siege starves it
// (data/parties.js ARMY.starve); the taken go into slavery or captivity, not into the grave.
// Peoples meet when their lands touch or their towns stand within `front` cells of each other; a war
// needs the same: a border.
export const DIPLOMACY = {
  drift: 0.2, pressure: 1.2, trade: 0.1, tradeMax: 0.35, tradeCeil: 2.5, raid: 0.8, warAt: -3.2, weariness: 0.5, peaceAt: -1.8, longest: 12, afterPeace: -1.2,
  compete: {war: 0.35, hostile: 0.25, tense: 0.12, peace: 0.06, friends: 0.02},
  mingle: 0.012, mingleMax: 0.3, strangersSeen: 0.1,   // (strangersSeen: the share of a town's people of strangers the chronicle tells of)
  front: 40, battleLoss: [0.12, 0.3], raze: 70, razeShare: 0.3,
  raidReach: 45, raidChance: 0.15, raidsPerYear: 2, raidLoss: 0.15, raidTake: 0.3, repelled: 0.1, barrows: 3,
  warLoss: {work: [0.25, 0.4]},
  luck: [0.6, 0.8],   // a battle's and a siege's luck on both sides: × luck[0] + luck[1] × a roll (atlas/diplomacy.js fight, the storm)
  states: [
    {id: 'friends', from: 2, label: 'дружба'},
    {id: 'peace', from: -0.5, label: 'мир'},
    {id: 'tense', from: -2, label: 'настороженность'},
    {id: 'hostile', from: -Infinity, label: 'вражда'},
  ],
};
