// Who lives beyond the edge of the map. Stage 0 has no world map yet: these are the fixed
// neighbours of the scripted stub (outside/scripted.js). Later a statistical world map will own
// them — and their distances will really drive who comes and how often.
//   dist — days of travel to the colony; `flows` — which arrivals come from there.
import {Registry} from '../core/registry.js';
import {SPECIES, onSpeciesChange, arrives} from './species.js';

// the bestiary's beasts come from the wild woods, the nechist lives right here (data/bestiary.js `arrive`)
const bestiary = resident => SPECIES.filter(s => s.arrive && !!s.resident === resident).map(s => s.id);

export const NEIGHBOURS = new Registry('neighbour');

NEIGHBOURS.registerAll([
  {id: 'kin', label: 'Род Ольхи', kind: 'kin', dist: 4, flows: ['settlers'],
    note: 'материнское племя: отсюда уходят искать новую жизнь; через его земли изредка забредают полурослики, дварфы, эльфы и великаны'},
  {id: 'hostile', label: 'Враждебные земли', kind: 'enemy', dist: null, flows: ['raiders'],   // distance comes from the raids preset
    note: 'стойбище «Серых волков», орочьи и гоблинские становища, норы гноллов, курганы с мертвецами; чем ближе, тем чаще набеги'},
  {id: 'empire', label: 'Имперский тракт', kind: 'trade', dist: 5, flows: ['caravan'],
    note: 'торговая дорога: время от времени по ней приходят караваны с имперским золотом и товаром'},
  {id: 'wilds', label: 'Дикие леса', kind: 'wild', dist: 0, flows: ['hares', 'deer', 'foxes', 'boars', 'wolves', 'mules', 'goats', 'rats', ...bestiary(false)],
    note: 'леса за краем карты: оттуда приходят звери'},
  {id: 'local', label: 'Здешние места', kind: 'local', dist: 0, flows: bestiary(true),
    note: 'леса и воды вокруг брода: здесь живёт своя нечисть; убитая, она возвращается через несколько дней'},
]);
// a species made in the constructor (data/species.js cloneSpecies) comes from where the one it was copied from comes
onSpeciesChange((what, sp) => {
  for (const n of NEIGHBOURS.all()) n.flows = n.flows.filter(f => f !== sp.id);
  if (what !== 'removed' && arrives(sp)) { const n = NEIGHBOURS.get(sp.resident ? 'local' : 'wilds'); n.flows = [...n.flows, sp.id]; }
});
