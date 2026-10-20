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
export const EFFECTS = {
  // melee damage grows a little slower than strength: an ogre (14) hits ~2.3× a human (5)
  str:   s => Math.max(0.2, s.S / NORM) ** 0.8,
  // the same for a blow struck with agility (a dagger, half of a sword: data/balance/forms.js `scale`)
  fin:   s => Math.max(0.2, s.A / NORM) ** 0.8,
  // health: E 5 → ×1, E 10 → ×1.4, E 14 → ×1.72
  hp:    s => Math.max(0.3, 0.6 + 0.08 * s.E),
  // how hard the cold bites
  cold:  s => Math.max(0.4, 1.25 - 0.05 * s.E),
  // added to the chance to hit with a shot (Perception only: Luck works through critical blows, data/wounds.js)
  aim:   s => 0.03 * (s.P - NORM),
  // how far an enemy is noticed (× the usual radius)
  sight: s => Math.max(0.5, 0.8 + 0.04 * s.P),
  speed: s => Math.max(0.5, 1 + 0.025 * (s.A - NORM)),
  // attack cooldown multiplier: nimble creatures strike more often
  swing: s => Math.max(0.5, 1 - 0.03 * (s.A - NORM)),
  // a small general bonus to learning any skill; each skill learns mainly by its own letter (data/skills.js)
  learn: s => Math.max(0.7, 0.9 + 0.02 * s.I),
  // chance that a blow or a shot simply misses this creature: a nimble one steps aside (Agility)
  dodge: s => Math.min(0.15, Math.max(0, 0.015 * (s.A - 4))),
  // how much others like this creature (added to their opinion of it, data/relations.js)
  charm: s => 0.15 * (s.C - NORM),
};
