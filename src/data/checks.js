// Checks (docs/NRI.md, этап 5): the ladder of difficulty, as the DC of D&D, and the four degrees of success, as in
// Pathfinder 2 — one roll gives a critical failure, a failure, a success or a critical success.
//
// The ladder. Every contest in the game is a / (a + b) (data/special.js contest): a check of a letter against a step
// of the ladder is contest(letter, step.vs), so `vs` is the step as an opponent's letter. At the human norm 5:
// trivial 80%, easy 67%, medium 50%, hard 33%, heroic 20%.
//
// The degrees. A roll u (0…1) against a chance p: success while u < p, as every check always was; the lowest
// `crit` share of the successes is a critical success, the highest `fumble` share of the failures a critical failure.
// So the degrees never change whether a check passes: they only add what DEGREE_EFFECTS says on top, and with every
// effect at 0 a check goes exactly as it did.
import {Registry} from '../core/registry.js';
import {contest} from './special.js';

export const DIFFICULTY = new Registry('difficulty');
DIFFICULTY.registerAll([
  {id: 'trivial', label: 'пустяк', vs: 1.25, note: 'при норме 5 — 80%'},
  {id: 'easy', label: 'легко', vs: 2.5, note: '67%'},
  {id: 'medium', label: 'средне', vs: 5, note: '50%: противник, равный человеку'},
  {id: 'hard', label: 'трудно', vs: 10, note: '33%'},
  {id: 'heroic', label: 'героически', vs: 20, note: '20%'},
]);
// the chance of a letter against a step of the ladder
export const checkChance = (x, step) => contest(x, DIFFICULTY.get(step).vs);

export const DEGREES = {crit: 0.1, fumble: 0.1};
export const DEGREE_NAMES = {critSuccess: 'крит. успех', success: 'успех', fail: 'провал', critFail: 'крит. провал'};

// the degree of a roll u against a chance p
export function degreeOf(u, p) {
  if (u < p) return u < p * DEGREES.crit ? 'critSuccess' : 'success';
  return u >= 1 - (1 - p) * DEGREES.fumble ? 'critFail' : 'fail';
}
export const passed = d => d === 'success' || d === 'critSuccess';

// What a critical degree adds, by check. Every value 0 — the game as it was; a value turns the effect on.
//   shot     — the roll to hit with a shot (agents/combat.js shoot)
//   block    — the defender's roll to block a blow or a shot (agents/combat.js damage)
//   melee    — a blow struck: a roll of the striker's Agility against `step` (drawn only while an effect here is on)
//   craft    — the quality roll of a finished piece (settlement/crafting.js): the chance is that of a fine piece
//   survive  — the luck check of a deadly wound (agents/wounds.js)
export const DEGREE_CHECKS = {
  shot: {label: 'выстрел'}, block: {label: 'блок'}, melee: {label: 'удар вблизи', step: 'easy'},
  craft: {label: 'ремесло'}, survive: {label: 'пережить смертельную рану'},
};

export const DEGREE_EFFECTS = new Registry('degreeEffect');
const D = (check, degree, effect, note) => ({id: `${check}.${degree}`, check, degree, effect, value: 0, note});
DEGREE_EFFECTS.registerAll([
  D('shot', 'critSuccess', 'урон × (1 + значение)', 'стрела в щель доспеха'),
  D('shot', 'critFail', 'износ лука + значение', 'тетива хлестнула, лук треснул'),
  D('block', 'critSuccess', 'износ оружия нападающего + значение', 'клинок встретил окованный край щита'),
  D('block', 'critFail', 'урон × (1 + значение)', 'щит отвели — удар пришёлся в открытое'),
  D('melee', 'critSuccess', 'урон × (1 + значение)', 'удар в полную силу'),
  D('melee', 'critFail', 'пауза удара + значение тиков', 'промах, раскрылся'),
  D('craft', 'critSuccess', 'прочность вещи × (1 + значение)', 'вещь вышла на славу'),
  D('craft', 'critFail', 'прочность вещи × (1 − значение)', 'изъян в работе'),
  D('survive', 'critSuccess', '1 — без второй проверки и без увечья', 'чудом: рана чистая'),
]);
export const degreeValue = (check, degree) => (DEGREE_EFFECTS.has(`${check}.${degree}`) ? DEGREE_EFFECTS.get(`${check}.${degree}`).value : 0);
// is anything of this check turned on (a check that rolls only for its degrees rolls only then)
const ofCheck = new Map();
export const degreesOn = check => {
  let list = ofCheck.get(check);
  if (!list) ofCheck.set(check, list = DEGREE_EFFECTS.filter(e => e.check === check));
  for (const e of list) if (e.value) return true;
  return false;
};
