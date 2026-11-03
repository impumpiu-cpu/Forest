// The seam: how a cell of the world map becomes the site of a local map (seam/cell.js). Every number
// that turns a world quantity into a local one lives here, so the seam is tuned without touching code.
// The world measures in cells and seasons, the local map in days and tiles; the conversions below are
// design numbers, not geography (docs/WORLD.md).

export const SEAM = {
  // how far around the cell the world is asked about neighbours, in world cells (× the world's scale)
  reach: 26,
  // days of travel a raiding band needs from a source `d` cells away: from + d × perCell, capped;
  // the local raid schedule checks every dist / 2 days (outside/scripted.js); the nearest foe is never
  // closer than the polygon's «Частые» (3 days, data/presets.js RAIDS)
  days: {from: 3, perCell: 0.3, max: 12},
  // a source this many days away or nearer sends raids at all
  raidDays: 11,
  // the raid's chance per check, as the polygon's «Редкие/Частые» (data/presets.js RAIDS)
  raidChance: 0.6,
  // roads: roadAccess 0 … 1 in the cell and its ring → the region's `road` (× the chance a caravan comes);
  // ≥ 1.1 brings two road gates, ≥ 0.8 one (world/site.js rollGates — here the gates follow the world's roads)
  road: {base: 0.5, perAccess: 0.8},
  // a lair whose territory holds the cell makes its beast this much more common here
  lairBeast: 1.6,
  // the cell's rot (atlas/lairs.js) above this sends the dead — as from a barrow `rotCells` cells away:
  // the rot is spread thin over the land, not a camp next door
  rotUndead: 0.25, rotCells: 7,
  // fertility of the world's soil (0 … 1) → the site's × on fertility
  fert: {base: 0.5, per: 0.7, min: 0.4, max: 1.3},
  // the world's climate → the local climate's numbers (data/presets.js CLIMATES):
  //   rain: showers a day from mm a year;  regrow: from rain and warmth;  ign: harder to set alight in the cold
  //   and the wet, easier in the heat and the dry;  daylight: hours gained at the solstice from the latitude
  climate: {rainBase: 0.06, rainPerMm: 1 / 2000, rainMax: 0.75, regrowMm: 700, ignPerDeg: 2.5, ignDry: -5, ignWet: 5, daylightPerDeg: 0.1, daylightMax: 9},
};

// which raid band (data/raids.js) a world lair sends, by the lair's kind (data/lairs.js)
export const LAIR_BANDS = {
  goblins: 'goblins', gnolls: 'gnolls', ogres: 'ogres', trolls: 'troll', swamptrolls: 'troll', icetrolls: 'troll', giants: 'giants',
  wights: 'undead', necromancer: 'cultists', ghouls: 'upyrs', vampire: 'vampire',
};
// which raid band an unfriendly realm sends, by its people (data/peoples.js); the dwarves and the elves send a war party
// only to a realm they are at war with (seam/cell.js, campaign/land.js); the humans' host is made by their buildings (HOST_BANDS)
export const REALM_BANDS = {orcs: 'orcs', dwarves: 'dwarves', elves: 'elves'};   // (the humans: HOST_BANDS below)
// a people whose band is made by what its realm has built (atlas/towns.js realmBand): the humans' host — `base`, and
// `base:<letters>` for the buildings of `by` its realm has (data/raids.js host: the tilt-yard's knights, the hippodrome's
// horse, the den's cutthroats)
export const HOST_BANDS = {humans: {base: 'host', by: {tiltyard: 'k', hippodrome: 'h', den: 'd'}}};
// the peoples whose bands come only in a war (not for mere dislike): the dwarves do not raid
export const WAR_ONLY_BANDS = ['dwarves', 'elves'];
// the peoples whose towns raid a colony of no realm (a hamlet off any realm's land) by their nature
export const RAID_UNRULED = ['orcs'];
// outlaws live wherever people do: a little banditry near any town of men
export const OUTLAWS = {band: 'bandits', weight: 0.4, people: ['humans']};   // people: the towns they haunt the roads near
// the tribes as fields (data/lairs.js LAIR_FIELD): a tribe's folk living within the reach send their band too, without a
// lair of theirs near — from the coarse cell where they are thickest for the distance; weight × their density there
// (at least `at`)
export const FOLK_RAIDS = {at: 0.05, weight: 1.2};

// wild beds of the region (data/plants.js, data/regions.js `flora`) from the cell's biomes: Σ share × weight,
// then rounded to a level (data/regions.js LEVELS) at these steps
export const FLORA = {
  hive:     {forest: 1.2, meadow: 1.1, taiga: 0.6, shrubland: 0.8, jungle: 0.8, savanna: 0.5, foothills: 0.5, swamp: 0.3},
  herbs:    {forest: 1, meadow: 1, swamp: 1.6, taiga: 1, jungle: 1.4, foothills: 0.6, tundra: 0.4, shrubland: 0.6},
  sleepgrass: {steppe: 1.2, forest: 0.8, meadow: 0.8, taiga: 0.8, foothills: 0.8, shrubland: 0.6},
  wort:     {meadow: 1.3, forest: 0.9, steppe: 0.7, foothills: 0.7, shrubland: 0.8, taiga: 0.5},
  saltlick: {steppe: 1.2, desert: 1.4, foothills: 1, highlands: 1, barrows: 1, savanna: 0.8, volcano: 0.8},
  wildflax: {meadow: 1.1, swamp: 1, forest: 0.6, steppe: 0.5, taiga: 0.4},
};
export const FLORA_STEPS = [0.15, 0.45, 1.1];   // below the first — none, then poor, as usual, rich
