// Curves: how a SPECIAL letter turns into a number the game reads (docs/RULES.md). One shape of formula for
// every such rule, so each is a row of the table «Кривые» and is edited as numbers, not as code:
//
//   line  — base + per × (X − pivot), then clamped to [min, max]       (health, speed, aim, learning…)
//   pow   — clamp(X / pivot, min, max) ^ pow                            (the force of a blow: grows slower than X)
//   soft  — base + per × X / (X + pivot), then clamped to [min, max]   (luck: every point helps less than the last)
//
// An empty min or max is no bound. X is the creature's letter `stat`; the human norm is 5 (data/special.js NORM),
// where a curve of a multiplier gives 1 and one of an addition gives 0. The table «SPECIAL (итог)» shows every
// curve at every letter from 1 to 15 and for the beasts beyond.
//
// Who reads them:
//   group 'special' — data/special.js EFFECTS: agents/special.js folds them into agent.mods and the health
//   group 'luck'    — the critical blow and the deadly wound (data/wounds.js, agents/wounds.js)
//   group 'body'    — how long the fallen bleed (data/wounds.js bleedTicks)
//   group 'skill'   — learning speed and the soft ceiling of a skill (agents/skills.js)
import {Registry} from '../core/registry.js';

export const SHAPES = {
  line: 'прямая: base + per × (X − pivot)',
  pow: 'степень: (X / pivot) ^ pow',
  soft: 'насыщение: base + per × X / (X + pivot)',
};
export const CURVE_GROUPS = {special: 'действие SPECIAL', luck: 'удача', body: 'тело', skill: 'навыки'};

export const CURVES = new Registry('curve');

// (the order of the arithmetic below is the order the formulas had before they were rows: the same numbers to the bit)
const L = (id, group, label, stat, base, per, pivot, min, max, note, more = {}) => ({id, group, label, stat, shape: 'line', base, per, pivot, min, max, note, ...more});

CURVES.registerAll([
  // ── what SPECIAL does (data/special.js EFFECTS)
  {id: 'str', group: 'special', label: 'Удар Силой', stat: 'S', shape: 'pow', pivot: 5, pow: 0.8, min: 0.2, max: null, unit: '×',
    note: 'урон в ближнем бою растёт чуть медленнее Силы: огр (14) бьёт в ~2,3 раза сильнее человека (5)'},
  {id: 'fin', group: 'special', label: 'Удар Ловкостью', stat: 'A', shape: 'pow', pivot: 5, pow: 0.8, min: 0.2, max: null, unit: '×',
    note: 'то же для удара Ловкостью: кинжал, половина меча (data/balance/forms.js scale)'},
  L('hp', 'special', 'Здоровье', 'E', 0.6, 0.08, 0, 0.3, null, 'E 5 → ×1, E 10 → ×1,4, E 14 → ×1,72', {unit: '×'}),
  L('cold', 'special', 'Холод', 'E', 1.25, -0.05, 0, 0.4, null, 'как сильно кусает холод', {unit: '×'}),
  L('aim', 'special', 'Меткость', 'P', 0, 0.03, 5, null, null, 'прибавка к шансу попасть выстрелом (только Восприятие: Удача работает через криты)', {unit: '+'}),
  L('sight', 'special', 'Обзор', 'P', 0.8, 0.04, 0, 0.5, null, 'как далеко замечают врага (× обычного радиуса)', {unit: '×'}),
  L('speed', 'special', 'Скорость шага', 'A', 1, 0.025, 5, 0.5, null, 'скорость шага', {unit: '×'}),
  L('swing', 'special', 'Пауза удара', 'A', 1, -0.03, 5, 0.5, null, 'множитель паузы между ударами: ловкие бьют чаще', {unit: '×'}),
  L('learn', 'special', 'Учёба', 'I', 0.9, 0.02, 0, 0.7, null, 'небольшая общая прибавка к учёбе любому навыку; навык учится в основном своей буквой («Темп навыка»)', {unit: '×'}),
  L('dodge', 'special', 'Уклонение', 'A', 0, 0.015, 4, 0, 0.15, 'шанс, что удар или выстрел просто пройдёт мимо', {unit: '+'}),
  L('charm', 'special', 'Обаяние', 'C', 0, 0.15, 5, null, null, 'прибавка к мнению других о существе (data/relations.js)', {unit: '+'}),
  // ── luck (data/wounds.js)
  {id: 'crit', group: 'luck', label: 'Крит', stat: 'L', shape: 'soft', base: 0.02, per: 0.18, pivot: 10, min: 0, max: 0.3, unit: 'шанс',
    note: 'шанс критического удара у попавшего удара или выстрела; L 5 → 8%, L 10 → 11%. Множитель урона — «Навыки, мастера, раны» crit.mul'},
  {id: 'survive', group: 'luck', label: 'Пережить смертельную рану', stat: 'L', shape: 'soft', base: 0.05, per: 0.4, pivot: 8, min: 0, max: 0.4, unit: 'шанс',
    note: 'упасть без сознания вместо смерти; L 1 → 9%, 5 → 20%, 10 → 27%'},
  {id: 'clean', group: 'luck', label: 'Уйти без увечья', stat: 'L', shape: 'soft', base: 0.25, per: 0.5, pivot: 8, min: 0, max: 0.85, unit: 'шанс',
    note: 'вторая проверка упавшего: провал — к тяжёлой ране неизлечимая травма; L 5 → 44%, L 10 → 53%'},
  // ── the body
  L('bleed', 'body', 'Истекает кровью', 'E', 1.5, 0.25, 0, null, null, 'сколько часов живёт упавший без перевязки: E 5 → 2,75 ч, E 10 → 4 ч', {unit: 'ч'}),
  // ── skills (agents/skills.js)
  L('skillPace', 'skill', 'Темп навыка', null, 0.6, 0.08, 0, 0.3, null, 'как быстро практика становится навыком по букве самого навыка: 1 при 5, 1,4 при 10, 0,68 при 1', {unit: '×', letter: 'буква навыка'}),
  {id: 'skillCap', group: 'skill', label: 'Мягкий потолок навыка', stat: null, shape: 'pow', pivot: 10, pow: 1, min: 0, max: 1, unit: 'доля', letter: 'буква навыка',
    note: 'выше потолка практика почти не помогает («Навыки, мастера, раны» learn.overCap); 10 × буква на шкале 0–100 карточки'},
]);

const bound = (v, min, max) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

// the value of a curve at letter x
export function curveAt(c, x) {
  if (c.shape === 'pow') return bound(x / c.pivot, c.min, c.max) ** c.pow;
  if (c.shape === 'soft') return bound(c.base + c.per * x / (x + c.pivot), c.min, c.max);
  return bound(c.base + c.per * (x - c.pivot), c.min, c.max);
}
// the value of a curve for a creature's SPECIAL (only its own letter is read)
export const curveOf = (c, special) => curveAt(c, special[c.stat]);
// the same by id, for the systems that read one curve
export const curve = (id, x) => curveAt(CURVES.get(id), x);
