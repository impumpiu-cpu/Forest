// Creatures. A species sets body stats, which needs it has, how it looks and, for animals,
// its own brain and what hunting it yields. Add a fantasy race or a new animal here.
import {Registry} from '../core/registry.js';

export const SPECIES = new Registry('species');

export const HUMAN_NAMES = ['Милава', 'Ждан', 'Горислав', 'Веселина', 'Тихон', 'Любава', 'Мирон', 'Злата', 'Ярослав', 'Дарина',
  'Ратибор', 'Снежана', 'Боян', 'Забава', 'Светозар', 'Агния', 'Велимир', 'Олеся', 'Добрыня', 'Василиса', 'Радим', 'Ведана'];

SPECIES.registerAll([
  {id: 'human', label: 'человек', hp: 1, speed: 0.13, needs: ['food', 'rest', 'warmth'],
    heatHarm: 70, look: {shape: 'person', size: 0.62}, names: HUMAN_NAMES, sentient: true},

  // Hares graze, rest at night, bolt from people and fire. They never breed here:
  // their numbers change only through migration (see migrations.js).
  {id: 'hare', label: 'заяц', hp: 0.3, speed: 0.17, needs: [], brain: 'grazer',
    heatHarm: 60, look: {shape: 'hare', size: 0.42, color: '#cdbb9a'},
    yields: {resource: 'meat', amount: 2},
    flee: {radius: 4.5, sprint: 1.45},
    grazes: {terrain: ['grass'], eatsBerries: 0.004},
    leaveChance: 0.0004},
]);
