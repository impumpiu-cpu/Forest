// The quick fight (campaign/fight.js autoFight; plan Г6, the author's word 13.11): a fight settled at once, never easier than the
// same fight on the local map. The map's outcomes are measured by tools/autofight-calibrate.mjs — the same company against the
// same foe, fought on the map — and written here as a table: for a kind of foe (`how:creature` — 'night' | 'ambush' | 'guard',
// the band or the beast), at the ratio of the two sides' strength (agents/strength.js: the company's over the foe's), what the
// map gave: the share of fights won, and the dead, the maims, the health lost and the potions drunk by one who stood in it.
//
//   doubt  — the quick fight reads the table at the ratio ÷ `doubt`: as if the foe were that much stronger — fewer won, more
//            hurt (who wants to be sure, watches the fight)
//   extra  — × the costs read (the dead, the maims, the health lost)
//   below  — under the table's weakest ratio the chance to win falls × (ratio / the weakest)^`below`: never a win the map would
//            not give
//   else   — a foe the table has not measured: the worse half of the measured ones (the tool writes it)
//   table  — {key: {r: [ratios], win, dead, maim, hp, pot}} — per one who stood in it; the ratios rising, the wins never
//            falling with them, the costs never rising (the tool smooths them so). `npm run autofight:calibrate` rewrites it.
export const AUTOFIGHT = {
  doubt: 1.2, extra: 1.15, below: 2,
  // ── the table (written by tools/autofight-calibrate.mjs --write; one line per kind of foe)
  table: {},
  else: {r: [1], win: [0.5], dead: [0.2], maim: [0.2], hp: [0.6], pot: [0.1]},
};
