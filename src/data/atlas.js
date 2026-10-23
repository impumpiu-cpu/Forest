// The world map (atlas): its settings and calendar. The world is a rectangle with ocean along every
// edge and a square grid (docs/WORLD.md). One cell of the world will become one local map: a set of
// probabilities (biomes, rocks, ores, beasts, distances to peoples) for the local generator.
// The scale (km per cell, cells per world) is still being tuned, so the sizes here are for trying out.

export const ATLAS_SIZES = {
  small:  {w: 128, h: 96,  label: 'Малый',   note: '128 × 96 клеток, быстрый'},
  medium: {w: 256, h: 192, label: 'Средний', note: '256 × 192 клеток'},
  large:  {w: 384, h: 288, label: 'Большой', note: '384 × 288 клеток, тяжелее'},
};

// how much of the world is land: the sea level is set so that this share of cells stays above it
export const ATLAS_LAND = [
  {share: 0.28, label: 'Архипелаг'},
  {share: 0.4, label: 'Материк'},
  {share: 0.55, label: 'Суша'},
];

// the calendar is shared with the local map (data/seasons.js): 4 seasons of 30 days.
// History before the landing will run 50–250 years in steps of one season.
export const SEASON_DAYS = 30, SEASONS_PER_YEAR = 4, YEAR_DAYS = SEASON_DAYS * SEASONS_PER_YEAR;

export const DEFAULT_ATLAS_CFG = {seed: '1', size: 'medium', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1};

// «Создать землю» (src/atlas/shape.js): what the hand may do to the land, and how far. Every change is a change of
// the base the generator works from, not of its result; what lies below it in the chain is worked out again.
export const SHAPE = {
  // a plate raised or lowered as a whole (relief units, 0..1 of the full height), the step of one press
  lift: {min: -0.3, max: 0.3, step: 0.05, soft: 6},          // `soft`: cells (of a 192-high world) over which a plate's edge blends
  // a plate's motion: its speed as the generator draws it is 0.35..1; the hand may set 0..1.2
  speed: {min: 0, max: 1.2, steps: [[0, 'стоит'], [0.4, 'медленно'], [0.75, 'средне'], [1.1, 'быстро']]},
  // the brush: raises or lowers the ground by `dz` at its middle per dab, fading to the rim (a Gaussian of the radius)
  brush: {dz: 0.035, radii: [[3, 'малая'], [7, 'средняя'], [14, 'большая']], max: 1500, spacing: 0.6},
  // the climate: degrees added at the equator and at the poles (blended by latitude), and the rain's multiplier
  climate: {equator: [-10, 10], pole: [-20, 20], wet: [0.5, 1.6]},
};
