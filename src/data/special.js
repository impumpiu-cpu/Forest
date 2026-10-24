// SPECIAL: the seven characteristics every thinking creature (and every monster) is measured by.
// The scale has no ceiling: a human lives in 1–10, the sturdiest races reach 15, a beast can go far
// beyond (a dragon's strength may be 80). 5 is the human norm, where every effect below is neutral.
// Species set hard limits per characteristic (data/races.js, data/monsters.js); a people shifts them;
// each creature rolls its own values inside them (agents/special.js).
//
// Contests between two values use the ratio a / (a + b), never the difference, so one formula holds
// for two goblins wrestling and for a band of hunters against a dragon.
//
// Two scales of effect. A thinking race (and a raid monster) takes the effects as they are: an orc's
// strength makes its blow harder than a human's. A beast's entry (`relativeStats`) already describes its
// typical animal — its hp, attack and speed are tuned — so SPECIAL only moves one animal against its
// kin: a strong wolf bites harder than the pack's average. Its numbers still say how it compares with
// everyone else (a bear's 14 against a human's 5), which the card shows and later contests will use.
import {Registry} from '../core/registry.js';
import {CURVES, curveOf} from './curves.js';

export const STATS = new Registry('stat');

export const NORM = 5;

STATS.registerAll([
  {id: 'S', label: 'Сила',        short: 'СИЛ', note: 'урон в ближнем бою; рубка, горное дело, стройка, ковка'},
  {id: 'P', label: 'Восприятие',  short: 'ВОС', note: 'меткость, замечает врага раньше; сбор, охота, стрельба, рыбалка'},
  {id: 'E', label: 'Выносливость', short: 'ВЫН', note: 'здоровье, стойкость к холоду; поле, тяжёлая ноша'},
  {id: 'C', label: 'Харизма',     short: 'ХАР', note: 'как к нему относятся соседи; обращение с животными'},
  {id: 'I', label: 'Интеллект',   short: 'ИНТ', note: 'медицина, плавка, кухня; немного помогает учиться всему'},
  {id: 'A', label: 'Ловкость',    short: 'ЛОВ', note: 'скорость шага и удара, уклонение; дерево, шитьё, кожи, гончар, ювелир'},
  {id: 'L', label: 'Удача',       short: 'УДЧ', note: 'критический удар; шанс пережить смертельную рану и уйти без увечья'},
]);

// limits around a typical value: around({S: 6, P: 10, …}, 1) → {S: [5, 7], P: [9, 11], …}
export const around = (mid, spread = 1) => Object.fromEntries(Object.entries(mid).map(([k, v]) => [k, [Math.max(0, v - spread), v + spread]]));

// the typical creature of a species: the middle of every limit
export const middle = special => Object.fromEntries(Object.entries(special).map(([k, [lo, hi]]) => [k, (lo + hi) / 2]));

// a / (a + b): the chance that a wins a contest against b
export const contest = (a, b) => (a + b > 0 ? a / (a + b) : 0.5);

// What the values do. Each takes the creature's SPECIAL and returns a multiplier or an addition
// that agents/special.js folds into agent.mods / agent.maxHp. At 5 everything is neutral.
// The formulas are rows of data/curves.js (group 'special'), edited in the table «Кривые»; each reads its row
// when it is called, so an edit reaches every creature made or refreshed after it.
export const EFFECTS = Object.fromEntries(CURVES.filter(c => c.group === 'special').map(c => [c.id, s => curveOf(c, s)]));
