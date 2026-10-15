// Biomes: the kinds of land a region is made of. A region (data/regions.js) is a mix of them in
// shares — a taiga valley may be 60% taiga, 20% swamp, 10% leafy wood and 10% lakes — and a beast
// (data/species.js, data/bestiary.js) names the biomes it lives in with a rarity word. How many of
// that beast the region has is the sum over biomes of share × rarity (world/region.js faunaFrom).
//
// For now biomes are statistics only: they decide who lives here. The local map is still drawn from
// grass, wood, rock and water; marsh and barrow cells on the map come with the world map.
import {Registry} from '../core/registry.js';

export const BIOMES = new Registry('biome');

BIOMES.registerAll([
  {id: 'meadow',     label: 'луга',          note: 'открытая трава, перелески, речные поймы'},
  {id: 'forest',     label: 'лиственный лес', note: 'дубравы и березняки, светлые поляны'},
  {id: 'taiga',      label: 'тайга',         note: 'ельники и сосняки, долгая зима'},
  {id: 'foothills',  label: 'предгорья',     note: 'камни, осыпи, каменистые луга'},
  {id: 'highlands',  label: 'высокогорье',   note: 'скалы и ледники, гнёзда на уступах'},
  {id: 'swamp',      label: 'болото',        note: 'топь, кочки, тростник, туман'},
  {id: 'barrows',    label: 'курганы',       note: 'пустоши с древними могилами'},
  {id: 'underground', label: 'подземье',     note: 'пещеры и старые выработки под скалами'},
  {id: 'volcano',    label: 'вулкан',        note: 'тёплые камни, пепел, горячие ключи'},
  {id: 'water',      label: 'водоёмы',       note: 'озёра и реки с омутами'},
]);

// how common a beast is in a biome it lives in
export const RARITY = {
  common: {mul: 1.6,  label: 'часто'},
  usual:  {mul: 1,    label: 'обычно'},
  rare:   {mul: 0.5,  label: 'редко'},
  scarce: {mul: 0.15, label: 'очень редко'},
};

// below this level a beast does not live in the region at all
export const FAUNA_FLOOR = 0.12;

// a level as a word for the panel
export function faunaWord(v) {
  if (v >= 1.3) return 'много';
  if (v >= 0.75) return 'есть';
  if (v >= 0.3) return 'мало';
  return 'очень редко';
}
