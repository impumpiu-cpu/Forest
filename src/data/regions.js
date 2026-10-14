// Regions: what kind of land the outpost stands on. Like an embark site in Dwarf Fortress, the land
// decides which ores lie in the rocks, which beasts come to the meadows and which wild beds grow:
// a region may have no gold, no coal or no magma at all. For now the region falls out of the world
// seed (world/region.js); later the global map will let players pick the site.
//
// Every amount is a level: 0 — none, 0.5 — poor, 1 — as usual, 1.6 — rich.
//   ores:   by ore id (data/ores.js): how many veins and pockets; 0 = none (no vein is planted either)
//   placer: gold-bearing sand in the shallows (data/plants.js 'placer');  goldVein: whether a quartz
//           vein with native gold can ever turn up when a worked-out vein opens the rock (a rare event)
//   fauna:  by species id — 0 keeps them away (migrations), 1.6 brings a few more;  hares come everywhere
//   flora:  by wild bed id (data/plants.js) — 0 = none, otherwise × the bed's chance
//   magma:  a magma vent under the rocks; nothing uses it yet (a magma forge can only be captured, later)
//   road:   how close the imperial road is: × the chance a caravan comes
//   weight: how often this kind of land is rolled
// When a region is rolled every level may move one step up or down (shift chance), so two valleys
// differ; a region with no game at all gets a few deer, so that everyone has a way to live.
import {Registry} from '../core/registry.js';

export const LEVELS = [0, 0.5, 1, 1.6];
export const LEVEL_WORDS = {0: 'нет', 0.5: 'бедно', 1: 'есть', 1.6: 'богато'};
export const REGION_SHIFT = 0.25;

export const REGIONS = new Registry('region');

REGIONS.registerAll([
  {id: 'hills', label: 'Лесистые холмы', weight: 3, note: 'ровная земля без особых богатств: лес, дичь, немного руды',
    ores: {iron: 1, coal: 1, gems: 0.5, bronze: 0.5, silver: 0, mithril: 0}, placer: 0, goldVein: false, magma: false, road: 1,
    fauna: {deer: 1, boar: 1, fox: 1, goat: 0.5, mule: 1, wolf: 1}, flora: {hive: 1, herbs: 1, saltlick: 0, wildflax: 0.5}},
  {id: 'valley', label: 'Речная долина', weight: 2, note: 'золото в отмелях, жирная земля, тракт близко; угля нет',
    ores: {iron: 0.5, coal: 0, gems: 0, bronze: 0.5, silver: 0, mithril: 0}, placer: 1.6, goldVein: false, magma: false, road: 1.3,
    fauna: {deer: 1, boar: 0.5, fox: 1, goat: 0, mule: 0.5, wolf: 0.5}, flora: {hive: 1, herbs: 1, saltlick: 0, wildflax: 1}},
  {id: 'foothills', label: 'Каменистое предгорье', weight: 2, note: 'железо, серебро и самоцветы, козы и мулы; бедная почва',
    ores: {iron: 1.6, coal: 0.5, gems: 1, bronze: 1, silver: 1, mithril: 0}, placer: 0.5, goldVein: true, magma: false, road: 0.8,
    fauna: {deer: 0.5, boar: 0, fox: 0.5, goat: 1.6, mule: 1.6, wolf: 1}, flora: {hive: 0.5, herbs: 0.5, saltlick: 1, wildflax: 0}},
  {id: 'taiga', label: 'Северная тайга', weight: 2, note: 'уголь и меха, много дичи и волков',
    ores: {iron: 0.5, coal: 1.6, gems: 0, bronze: 0, silver: 0.5, mithril: 0}, placer: 0, goldVein: false, magma: false, road: 0.7,
    fauna: {deer: 1.6, boar: 0.5, fox: 1.6, goat: 0, mule: 0, wolf: 1.6}, flora: {hive: 0.5, herbs: 1, saltlick: 0, wildflax: 0.5}},
  {id: 'oldmines', label: 'Старые копи у потухшего вулкана', weight: 1, note: 'самоцветы, серебро, может найтись мифрил; под скалами магма; тракт далеко',
    ores: {iron: 1, coal: 0.5, gems: 1.6, bronze: 0.5, silver: 1, mithril: 1}, placer: 0, goldVein: true, magma: true, road: 0.5,
    fauna: {deer: 0.5, boar: 0, fox: 0.5, goat: 1, mule: 1, wolf: 1}, flora: {hive: 0, herbs: 0.5, saltlick: 0.5, wildflax: 0}},
]);

// saves made before regions: the land as it was then — every old ore as usual, no precious metals
export const LEGACY_REGION = {id: 'legacy', label: 'Окрестности брода', note: 'земли, освоенные до разведки регионов',
  ores: {iron: 1, coal: 1, gems: 1, bronze: 0, silver: 0, mithril: 0}, placer: 0, goldVein: false, magma: false, road: 1,
  fauna: {deer: 1, boar: 1, fox: 1, goat: 1, mule: 1, wolf: 1}, flora: {hive: 1, herbs: 1, saltlick: 0, wildflax: 0}};
