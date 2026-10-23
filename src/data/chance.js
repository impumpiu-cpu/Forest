// Random tables (docs/NRI.md, этап 5): one format and one engine for everything the game draws from a list.
//
// A row says how likely it is as data, not code:
//   weight   — its weight (mode `one`) or its chance (modes `first`, `each`)
//   threat   — only from this threat level (settlement/threat.js); below it the row weighs `below` (0 if not said)
//   night    — only while the night is deeper than this (0…1)
//   perNight — added to the weight × the night (the dead come thrice as often in the dark)
// Modes:
//   one   — one row by weight (who comes on a raid: data/raids.js)
//   first — the rows in order, the first whose chance passes (a morning's find: data/campaign.js FINDS)
//   each  — every row on its own chance (a beast's rare trophies: `trophies` of a species)
// The engine draws exactly as the old code did — one number per weighted pick, one per row tried — so a table
// read through it gives the same story.
import {weighted} from '../core/util.js';

export const CHANCE_MODES = {one: 'одна по весу', first: 'первая, что выпала', each: 'каждая сама по себе'};

// the weight (or chance) of a row in the context {threat, night}
export function chanceWeight(c, {threat = 0, night = 0} = {}) {
  if (c.threat != null && !(threat >= c.threat)) return c.below ?? 0;
  if (c.night != null && !(night > c.night)) return 0;
  return c.perNight ? c.weight + c.perNight * night : c.weight;
}
// mode one: [[id, weight], …] → an id (core/util.js weighted, one number of rnd)
export const pickOne = (rnd, entries) => weighted(rnd, entries);
// mode first: the first row whose chance passes, else null (one number of rnd per row tried)
export function pickFirst(rnd, rows, chanceOf) {
  for (const r of rows) if (rnd() < chanceOf(r)) return r;
  return null;
}
// mode each: does this row's chance pass (one number of rnd)
export const passes = (rnd, p) => rnd() < p;
