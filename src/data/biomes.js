// Biomes: the kinds of land a region is made of. A region (data/regions.js) is a mix of them in
// shares — a taiga valley may be 60% taiga, 20% swamp, 10% broadleaf wood and 10% lakes — and a beast
// (data/species.js, data/bestiary.js) names the biomes it lives in with a rarity word. How many of
// that beast the region has is the sum over biomes of share × rarity (world/region.js faunaFrom).
//
// The list follows physical geography. Every biome has a `kind`:
//   zonal       — set by the climate, as in the Köppen classification and the natural zones: the
//                 world map (atlas/biomes.js) assigns them from the yearly mean temperature, the
//                 warmest and coldest month and the yearly rain against the dryness threshold
//   altitude    — the mountain belts (высотная поясность): rugged slopes below the tree line and the
//                 alpine belt above it
//   intrazonal  — set by the ground, not the climate: waterlogged land, open water, volcanic ground
//   feature     — not a kind of nature at all: old graves (left by history) and the world under the
//                 rocks (caves); the world map fills them from history and geology, not from climate
//
//   koppen: the Köppen classes the biome stands for (for reference)
//   where:  «in» the biome, for the chronicle;  color: on the world map;  trees: how much of the ground forest can cover there (0..1), used by
//   the growth of forests (atlas/vegetation.js)
//
// The local map does not draw biomes yet: they decide who lives in a region and, through the world
// map, how its land looks.
import {Registry} from '../core/registry.js';

export const BIOME_KINDS = {zonal: 'природные зоны', altitude: 'высотные пояса', intrazonal: 'интразональные', feature: 'особые места'};

export const BIOMES = new Registry('biome');

BIOMES.registerAll([
  // ── zonal, from the poles to the equator
  {id: 'ice', kind: 'zonal', label: 'льды', where: 'во льдах', koppen: 'EF', color: [236, 242, 246], trees: 0,
    note: 'ледниковые щиты и снежные поля: ни один месяц не теплее нуля'},
  {id: 'tundra', kind: 'zonal', label: 'тундра', where: 'в тундре', koppen: 'ET', color: [150, 160, 140], trees: 0.04,
    note: 'мхи, лишайники, карликовые берёзы и вечная мерзлота: лето короче и холоднее, чем нужно лесу'},
  {id: 'taiga', kind: 'zonal', label: 'тайга', where: 'в тайге', koppen: 'Dfc, Dsc', color: [56, 92, 70], trees: 0.82,
    note: 'ельники, пихтачи и сосняки на подзолах; зима долгая и морозная, лето короткое'},
  {id: 'forest', kind: 'zonal', label: 'широколиственный лес', where: 'в широколиственных лесах', koppen: 'Cfb, Cfa, Dfb', color: [74, 128, 70], trees: 0.88,
    note: 'дубравы, буковые и смешанные леса умеренного пояса, светлые поляны'},
  {id: 'meadow', kind: 'zonal', label: 'лесостепь и луга', where: 'в лесостепи', koppen: 'Dfb, Cfb (суше)', color: [134, 160, 86], trees: 0.35,
    note: 'луга с перелесками на границе леса и степи; по речным поймам — заливные луга'},
  {id: 'steppe', kind: 'zonal', label: 'степь', where: 'в степи', koppen: 'BSk', color: [190, 182, 110], trees: 0.05,
    note: 'ковыль и полынь на чернозёмах и каштановых почвах; дождей меньше, чем испаряется'},
  {id: 'shrubland', kind: 'zonal', label: 'жестколистные кустарники', where: 'в зарослях жестколистных кустарников', koppen: 'Csa, Csb', color: [150, 140, 80], trees: 0.3,
    note: 'маквис и гарига тёплых сухих берегов: дуб каменный, можжевельник, лавр'},
  {id: 'desert', kind: 'zonal', label: 'пустыня', where: 'в пустыне', koppen: 'BWh, BWk', color: [222, 196, 140], trees: 0,
    note: 'пески, щебень и солончаки: воды выпадает меньше половины того, что могло бы испариться'},
  {id: 'savanna', kind: 'zonal', label: 'саванна', where: 'в саванне', koppen: 'Aw, BSh', color: [182, 168, 80], trees: 0.18,
    note: 'высокие травы и редкие деревья жарких краёв с сухим сезоном'},
  {id: 'jungle', kind: 'zonal', label: 'влажный тропический лес', where: 'в тропических лесах', koppen: 'Af, Am', color: [30, 106, 60], trees: 0.96,
    note: 'многоярусный лес вечного лета и ливней; почва под ним бедная'},
  // ── mountain belts
  {id: 'foothills', kind: 'altitude', label: 'предгорья', where: 'в предгорьях', color: [140, 128, 100], trees: 0.45,
    note: 'крутые каменистые склоны ниже границы леса: осыпи, скалы, горные луга'},
  {id: 'highlands', kind: 'altitude', label: 'высокогорье', where: 'в высокогорье', color: [150, 138, 126], trees: 0.03,
    note: 'альпийский пояс выше границы леса: скалы, луга, ледники, гнёзда на уступах'},
  // ── set by the ground
  {id: 'swamp', kind: 'intrazonal', label: 'болото', where: 'на болотах', color: [86, 112, 90], trees: 0.4,
    note: 'переувлажнённые низины: торфяники и топи на севере, плавни и мангры на юге'},
  {id: 'water', kind: 'intrazonal', label: 'водоёмы', where: 'у воды', color: [58, 104, 150], trees: 0,
    note: 'озёра и большие реки с омутами'},
  {id: 'volcano', kind: 'intrazonal', label: 'вулкан', where: 'на склонах вулкана', color: [96, 70, 64], trees: 0.1,
    note: 'тёплые камни, пепел, горячие ключи'},
  // ── not nature
  {id: 'barrows', kind: 'feature', label: 'курганы', where: 'среди курганов', color: [150, 120, 120], trees: 0,
    note: 'пустоши с древними могилами; на карте мира появятся из истории'},
  {id: 'underground', kind: 'feature', label: 'подземье', where: 'в подземье', color: [70, 64, 80], trees: 0,
    note: 'пещеры под скалами: карст в известняке, лавовые трубки в базальте, старые выработки'},
]);

// The thresholds of the world map's classification (atlas/biomes.js), after Köppen.
//   dryness: P_dry = a·T + b (mm, T the yearly mean): rain below P_dry / 2 is a desert, below P_dry a
//            steppe (or a savanna when hot), as in the Köppen B climates with rain through the year
//   treeline: the warmest month must reach this for forest (ET/EF below it)
//   tropics:  the coldest month at or above this is the tropics (A climates)
//   continental: the coldest month below this has a snowy winter (D climates)
//   taiga:    D climates with a yearly mean below this are boreal
//   jungle:   tropical rain from which the forest never dries
//   forestSteppe / mediterranean: rain up to this × P_dry is forest steppe / dry-summer scrub
//   mountain: relative height (0 at the sea, 1 at the highest peak) from which steep ground is mountains
export const KOPPEN = {dryness: [20, 140], treeline: 10, tropics: 18, continental: -3, taiga: 2, jungle: 1700,
  forestSteppe: 1.6, mediterranean: 1.7, warmTemperate: 13, mountain: 0.3};

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
