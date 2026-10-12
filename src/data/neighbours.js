// Who lives beyond the edge of the map. Stage 0 has no world map yet: these are the fixed
// neighbours of the scripted stub (outside/scripted.js). Later a statistical world map will own
// them — and their distances will really drive who comes and how often.
//   dist — days of travel to the colony; `flows` — which arrivals come from there.
import {Registry} from '../core/registry.js';

export const NEIGHBOURS = new Registry('neighbour');

NEIGHBOURS.registerAll([
  {id: 'kin', label: 'Род Ольхи', kind: 'kin', dist: 4, flows: ['settlers'],
    note: 'материнское племя: отсюда уходят искать новую жизнь'},
  {id: 'greywolves', label: '«Серые волки»', kind: 'enemy', dist: null, flows: ['raiders'],   // distance comes from the raids preset
    note: 'стойбище разбойников; чем ближе оно, тем чаще набеги'},
  {id: 'wilds', label: 'Дикие леса', kind: 'wild', dist: 0, flows: ['hares', 'wolves'],
    note: 'леса за краем карты: оттуда приходят звери'},
]);
