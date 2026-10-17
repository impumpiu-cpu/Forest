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

export const DEFAULT_ATLAS_CFG = {seed: '1', size: 'medium', land: 1, plates: 1, hemisphere: 'north', wild: 1};
