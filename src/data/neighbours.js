// Who lives beyond the edge of the map. Stage 0 has no world map yet: these are the fixed
// neighbours of the scripted stub (outside/scripted.js). Later a statistical world map will own
// them — and their distances will really drive who comes and how often.
//   dist — days of travel to the colony; `flows` — which arrivals come from there.
import {Registry} from '../core/registry.js';

export const NEIGHBOURS = new Registry('neighbour');

NEIGHBOURS.registerAll([
  {id: 'kin', label: 'Род Ольхи', kind: 'kin', dist: 4, flows: ['settlers'],
    note: 'материнское племя: отсюда уходят искать новую жизнь; через его земли изредка забредают полурослики, гномы, эльфы и великаны'},
  {id: 'hostile', label: 'Враждебные земли', kind: 'enemy', dist: null, flows: ['raiders'],   // distance comes from the raids preset
    note: 'стойбище «Серых волков», орочьи и гоблинские становища, норы гноллов, курганы с мертвецами; чем ближе, тем чаще набеги'},
  {id: 'empire', label: 'Имперский тракт', kind: 'trade', dist: 5, flows: ['caravan'],
    note: 'торговая дорога: время от времени по ней приходят караваны с имперским золотом и товаром'},
  {id: 'wilds', label: 'Дикие леса', kind: 'wild', dist: 0, flows: ['hares', 'deer', 'foxes', 'boars', 'wolves', 'mules', 'rats'],
    note: 'леса за краем карты: оттуда приходят звери'},
]);
