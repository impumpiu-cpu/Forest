// Soils of the world map, after the zonal soil science of Dokuchaev: each natural zone has its soil,
// river valleys and wetlands have their own, and the rock under the soil makes it richer or poorer.
// The system is atlas/soils.js.
//   biomes: the biomes this soil forms under (the first soil that fits wins; `rain` limits it by the
//           yearly rain, mm, [min, max])
//   fert:   how fertile it is, 0..1 — later the fertility of the local map
//   color:  on the world map
import {Registry} from '../core/registry.js';

export const SOILS = new Registry('soil');
SOILS.registerAll([
  {id: 'alluvial', label: 'аллювиальная', fert: 1, color: [96, 70, 44], note: 'наносы речных пойм и дельт: самые плодородные земли'},
  {id: 'andosol', label: 'вулканическая', biomes: ['volcano'], fert: 0.85, color: [70, 56, 52], note: 'молодой пепел, богатый всем, что нужно растениям'},
  {id: 'peat', label: 'торфяная', biomes: ['swamp'], fert: 0.25, color: [70, 60, 46], note: 'недоразложившиеся растения переувлажнённых низин; кислая'},
  {id: 'gley', label: 'тундровая глеевая', biomes: ['tundra'], fert: 0.12, color: [130, 128, 120], note: 'тонкий слой над вечной мерзлотой, сырой и холодный'},
  {id: 'podzol', label: 'подзолистая', biomes: ['taiga'], fert: 0.3, color: [176, 168, 150], note: 'кислая промытая почва под хвойным лесом'},
  {id: 'forestBrown', label: 'бурая лесная', biomes: ['forest'], fert: 0.62, color: [120, 92, 60], note: 'почва широколиственных лесов, гумусовая'},
  {id: 'greyForest', label: 'серая лесная', biomes: ['meadow'], fert: 0.72, color: [110, 100, 88], note: 'переход от лесных почв к чернозёму'},
  {id: 'chernozem', label: 'чернозём', biomes: ['steppe'], rain: [350, Infinity], fert: 0.98, color: [40, 34, 30], note: 'толстый гумусовый слой степей: лучшая пашня'},
  {id: 'chestnut', label: 'каштановая', biomes: ['steppe'], fert: 0.6, color: [130, 96, 66], note: 'почва сухих степей, тоньше и солонее чернозёма'},
  {id: 'cinnamonic', label: 'коричневая', biomes: ['shrubland'], fert: 0.5, color: [150, 100, 70], note: 'почва сухих субтропиков под кустарниками'},
  {id: 'redBrown', label: 'красно-бурая', biomes: ['savanna'], fert: 0.45, color: [160, 90, 60], note: 'почва саванн с сухим сезоном'},
  {id: 'laterite', label: 'латеритная', biomes: ['jungle'], fert: 0.3, color: [176, 84, 52], note: 'красная выщелоченная почва тропиков: всё богатство в самом лесу'},
  {id: 'desertSoil', label: 'пустынная', biomes: ['desert'], fert: 0.08, color: [220, 200, 160], note: 'серозёмы, пески и щебень, местами солончаки'},
  {id: 'mountain', label: 'горная', biomes: ['foothills', 'highlands'], fert: 0.25, color: [140, 130, 116], note: 'тонкая каменистая почва склонов'},
  {id: 'none', label: 'нет почвы', biomes: ['ice', 'water', 'barrows', 'underground'], fert: 0, color: [200, 200, 200], note: 'лёд, вода или голый камень'},
]);

// what the rock under the soil adds to its fertility (data/geology.js rock ids)
export const ROCK_FERT = {limestone: 0.1, basalt: 0.1, andesite: 0.05, shale: 0.03, sandstone: -0.1, granite: -0.05, gneiss: -0.05, schist: 0};

// soils from this alluvium (atlas/hydrology.js) are alluvial whatever the zone
export const ALLUVIAL_FROM = 0.45;
