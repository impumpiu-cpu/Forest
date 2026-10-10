// Creatures. A species sets body stats, which needs it has, how it looks and, for animals,
// its own brain and what hunting it yields. Add a fantasy race or a new animal here.
import {Registry} from '../core/registry.js';

export const SPECIES = new Registry('species');

export const HUMAN_NAMES = ['Милава', 'Ждан', 'Горислав', 'Веселина', 'Тихон', 'Любава', 'Мирон', 'Злата', 'Ярослав', 'Дарина',
  'Ратибор', 'Снежана', 'Боян', 'Забава', 'Светозар', 'Агния', 'Велимир', 'Олеся', 'Добрыня', 'Василиса', 'Радим', 'Ведана'];

SPECIES.registerAll([
  {id: 'human', label: 'человек', hp: 1, speed: 0.13, needs: ['food', 'rest', 'warmth'],
    heatHarm: 70, look: {shape: 'person', size: 0.62}, names: HUMAN_NAMES, sentient: true,
    attack: {power: 1, cooldown: 12}},

  // Hares graze, rest at night, bolt from people and fire. They never breed here:
  // their numbers change only through migration (see migrations.js).
  {id: 'hare', label: 'заяц', hp: 0.3, speed: 0.17, needs: [], brain: 'grazer',
    heatHarm: 60, look: {shape: 'hare', size: 0.42, color: '#cdbb9a'},
    yields: {resource: 'meat', amount: 2},
    flee: {radius: 4.5, sprint: 1.45, from: ['human', 'wolf'], stamina: 0.007},
    grazes: {terrain: ['grass'], eatsBerries: 0.004},
    leaveChance: 0.0004},

  // Wolves hunt hares in packs and may go for a person who wanders off alone, mostly at night
  // or when starving. They shun the lit camp, fire and groups of people, and leave when wounded
  // or when the hares run out. Like everyone else they only arrive and depart by migration.
  {id: 'wolf', label: 'волк', hp: 0.8, speed: 0.14, needs: ['food'], brain: 'predator',
    mods: {hunger: 0.55},
    heatHarm: 60, look: {shape: 'wolf', size: 0.58, color: '#8d8f96'},
    attack: {power: 0.85, cooldown: 14},
    killMessage: name => `Волки загрызли поселенца: <b>${name}</b>.`,
    predator: {
      prey: ['hare'],            // what it hunts for food
      victims: ['human'],        // what it attacks only when the target is alone
      sprint: 1.9, stamina: 0.003,
      sight: 22,                 // how far it notices prey
      loneRadius: 6,             // nobody else of the victim's kind this close → the victim is alone
      campShy: 11,               // keeps this far from a lit camp
      groupFear: 3,              // this many people together make it back off
      feedTicks: 90,
    }},
]);
