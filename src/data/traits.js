// Character traits. Each colonist gets a liked and a disliked job (from JOBS with preferable: true)
// and up to two traits from this list. A trait changes multipliers in agent.mods;
// traits in the same `group` exclude each other.
import {Registry} from '../core/registry.js';
import {baseMods} from './mods.js';

export const TRAITS = new Registry('trait');

TRAITS.registerAll([
  {id: 'brave',   label: 'смелый',     group: 'courage',  weight: 1, mods: {bravery: 0.45}},
  {id: 'timid',   label: 'робкий',     group: 'courage',  weight: 1, mods: {bravery: -0.4}},
  {id: 'hardy',   label: 'закалённый', group: 'cold',     weight: 1, mods: {cold: 0.6}},
  {id: 'chilly',  label: 'мерзлявый',  group: 'cold',     weight: 1, mods: {cold: 1.5}},
  {id: 'glutton', label: 'обжора',     group: 'appetite', weight: 1, mods: {hunger: 1.35}},
  {id: 'frugal',  label: 'неприхотливый', group: 'appetite', weight: 1, mods: {hunger: 0.75}},
  {id: 'quick',   label: 'шустрый',    group: 'pace',     weight: 1, mods: {speed: 1.15}},
  {id: 'diligent', label: 'усердный',  group: 'work',     weight: 1, mods: {work: 1.2}},
  {id: 'lazy',    label: 'ленивый',    group: 'work',     weight: 1, mods: {work: 0.8}},
]);

// the neutral body every agent starts from; traits, species and SPECIAL (agents/special.js) adjust it. Every key,
// what it means and how it stacks: data/mods.js CREATURE_MODS (the table «Модификаторы существа»); an edit there
// puts the new neutral values into this same object (rebuildBaseMods)
export const BASE_MODS = baseMods();
export function rebuildBaseMods() {
  for (const k of Object.keys(BASE_MODS)) delete BASE_MODS[k];
  Object.assign(BASE_MODS, baseMods());
}

// how strongly liked / disliked work pulls
export const LIKE_RANGE = [1.45, 1.65];
export const DISLIKE_RANGE = [0.45, 0.65];
export const NEUTRAL_RANGE = [0.85, 1.15];
