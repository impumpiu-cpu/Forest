// World view. Two axes and a handful of values instead of a nine-cell alignment grid: the grid says
// who is "good", values say what two people will quarrel about.
//   AXES   — order (−3 вольница … +3 порядок) and mercy (−3 жестокость … +3 милосердие).
//            Each race has a default (data/races.js `align`), each creature its own point near it.
//   VALUES — what someone holds dear; every thinking creature draws 2–3 of them, weighted by its race.
//            Shared values bring people closer; `clash` pairs drive them apart (data/relations.js).
import {Registry} from '../core/registry.js';

export const AXES = {
  order: {label: 'Порядок', neg: 'вольница', pos: 'порядок'},
  mercy: {label: 'Милосердие', neg: 'жестокость', pos: 'милосердие'},
};
export const AXIS_MAX = 3;

export const VALUES = new Registry('value');

VALUES.registerAll([
  {id: 'work',      label: 'труд',    clash: ['nature', 'freedom']},
  {id: 'gold',      label: 'золото',  clash: ['faith', 'family']},
  {id: 'ancestors', label: 'предки',  clash: ['freedom', 'knowledge']},
  {id: 'nature',    label: 'природа', clash: ['work', 'gold']},
  {id: 'strength',  label: 'сила',    clash: ['family', 'knowledge']},
  {id: 'knowledge', label: 'знание',  clash: ['faith', 'ancestors']},
  {id: 'faith',     label: 'вера',    clash: ['knowledge', 'gold']},
  {id: 'family',    label: 'семья',   clash: ['strength']},
  {id: 'freedom',   label: 'свобода', clash: ['ancestors', 'work']},
]);

// how a point on an axis reads: «порядок +2», «середина», «жестокость −1»
export function axisWord(axis, v) {
  const a = AXES[axis], r = Math.round(v);
  if (!r) return 'середина';
  return `${r > 0 ? a.pos : a.neg} ${r > 0 ? '+' : '−'}${Math.abs(r)}`;
}
