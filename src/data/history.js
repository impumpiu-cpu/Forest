// The history of the world map: its eras and the knobs of the wild era. The systems are in
// src/atlas/history.js (the clock and the chronicle), atlas/fauna.js (the beasts as fields) and
// atlas/lairs.js (the monsters' lairs as points).
import {Registry} from '../core/registry.js';

// Eras in the order they come. History steps one season at a time (data/atlas.js calendar).
export const ERAS = new Registry('era');
ERAS.registerAll([
  {id: 'wild', label: 'Дикая эра', note: 'мир без разумных народов: звери расселяются по своим биомам, хищники следуют за добычей, чудовища вьют логова и делят владения'},
  {id: 'elder', label: 'Эпоха древних народов', note: 'приходят эльфы и гномы: их народы расползаются фронтом по своим краям, основывают города, строятся, наезживают дороги и теснят чудовищ'},
  {id: 'young', label: 'Эпоха молодых народов', note: 'приходят люди и орки: народы теснят друг друга на общих землях, торгуют по дорогам, селятся в чужих городах, враждуют, воюют и мирятся'},
  // «Заселение мира» (cfg.free, atlas/settle.js): no eras — the hand brings peoples, lairs and calamities, the clock runs by its years
  {id: 'free', label: 'Вольная история', note: 'эпох нет: расы, логова и бедствия вносит рука, время идёт отрезками в 5–100 лет'},
]);

// The epic world of the campaign (cfg.epic, docs/CAMPAIGN.md «Доработка, этап 6»): each era lasts this many years,
// drawn once from the world's own stream (seed:atlas:epic), so that the history has room for its calamities
export const EPIC_YEARS = {wild: [75, 150], elder: [75, 150], young: [75, 150]};

// How long the wild era lasts (the start setting «Дикая эра»), in years.
export const WILD_YEARS = [
  {years: 25, label: 'Короткая'},
  {years: 40, label: 'Обычная'},
  {years: 70, label: 'Долгая'},
];

// The beasts as fields on a coarse grid (`cell` world cells a side, scaled with the map): every
// species with a habitat (data/species.js, data/bestiary.js) has a carrying capacity K per coarse
// cell from the biomes there, and a density N that moves by reaction–diffusion each season:
//   herbivores: logistic growth r·N·(1 − N/K) × the season, minus what the predators take
//   predators:  grow when fed (Holling type II on their prey list, `predator.prey`), starve when not
//   spirits (`resident`): bound to their places, N = K
//   diffuse:    how much of a cell's beasts wander to the neighbours each season (× species speed)
//   season:     growth by season id (data/seasons.js): spring births, a hard winter thins them
//   predation:  how much a predator at full density takes;  half: prey density of half satiation;
//   trophic:    predators are fewer than their prey: a predator at its full density weighs this much
//               of the prey's (about a tenth, as up a food chain)
//   starve:     how fast unfed predators die off;  floor: below this share of K a species dies out locally
//   boom / bust: a species' world total against its own running average that the chronicle tells of,
//   at most once in `cooldown` years per species and two species a year
//   weather:    how much a year's weather (a broad random field, new each year) speeds or slows growth;
//               a winter this harsh (−1 … 1) somewhere is told in the chronicle and kills `harsh` of the beasts there
//               and `townHarsh` of the people of the towns there (less with food and health buildings, atlas/history.js)
//   plague:     chance a year that a crowded species (above `crowd` of K) is struck by a murrain there,
//               killing `plagueKill` within `plagueRadius` coarse cells
export const FAUNA = {weather: 0.5, harshAt: -0.7, harsh: 0.35, townHarsh: 0.12, plague: 0.012, crowd: 0.85, plagueKill: 0.6, plagueRadius: 5,
  cell: 4, diffuse: 0.1, growth: 0.45, season: {spring: 1.4, summer: 1, autumn: 0.35, winter: -0.3},
  predation: 0.35, half: 0.3, trophic: 0.12, starve: 0.25, floor: 0.01, boom: 1.25, bust: 0.6, cooldown: 12};

// «Заселение мира» (cfg.free, atlas/settle.js; docs/TABLE.md этап 9):
//   runs:     the stretches of time the hand may run at once, in years
//   calIn:    in how many years a calamity set by hand may rise
//   lair:     the strength a lair set by hand starts at; ghosts and the dead get graves and rot about them to feed on
export const FREE = {runs: [5, 10, 25, 50, 100], calIn: [5, 10, 25, 50], lair: 0.6, graves: 0.9};
