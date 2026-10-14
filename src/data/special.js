// SPECIAL: the seven characteristics every thinking creature (and every monster) is measured by.
// The scale has no ceiling: a human lives in 1–10, the sturdiest races reach 15, a beast can go far
// beyond (a dragon's strength may be 80). 5 is the human norm, where every effect below is neutral.
// Species set hard limits per characteristic (data/races.js, data/monsters.js); a people shifts them;
// each creature rolls its own values inside them (agents/special.js).
//
// Contests between two values use the ratio a / (a + b), never the difference, so one formula holds
// for two goblins wrestling and for a band of hunters against a dragon.
import {Registry} from '../core/registry.js';

export const STATS = new Registry('stat');

export const NORM = 5;

STATS.registerAll([
  {id: 'S', label: 'Сила',        short: 'СИЛ', note: 'урон в ближнем бою'},
  {id: 'P', label: 'Восприятие',  short: 'ВОС', note: 'меткость, замечает врага раньше'},
  {id: 'E', label: 'Выносливость', short: 'ВЫН', note: 'здоровье, стойкость к холоду'},
  {id: 'C', label: 'Харизма',     short: 'ХАР', note: 'как к нему относятся соседи'},
  {id: 'I', label: 'Интеллект',   short: 'ИНТ', note: 'как быстро учится ремеслу'},
  {id: 'A', label: 'Ловкость',    short: 'ЛОВ', note: 'скорость шага и удара'},
  {id: 'L', label: 'Удача',       short: 'УДЧ', note: 'увернуться от удара, попасть наудачу'},
]);

// a / (a + b): the chance that a wins a contest against b
export const contest = (a, b) => (a + b > 0 ? a / (a + b) : 0.5);

// What the values do. Each takes the creature's SPECIAL and returns a multiplier or an addition
// that agents/special.js folds into agent.mods / agent.maxHp. At 5 everything is neutral.
export const EFFECTS = {
  // melee damage grows a little slower than strength: an ogre (14) hits ~2.3× a human (5)
  str:   s => Math.max(0.2, s.S / NORM) ** 0.8,
  // health: E 5 → ×1, E 10 → ×1.4, E 14 → ×1.72
  hp:    s => Math.max(0.3, 0.6 + 0.08 * s.E),
  // how hard the cold bites
  cold:  s => Math.max(0.4, 1.25 - 0.05 * s.E),
  // added to the chance to hit with a shot
  aim:   s => 0.03 * (s.P - NORM) + 0.01 * (s.L - NORM),
  // how far an enemy is noticed (× the usual radius)
  sight: s => Math.max(0.5, 0.8 + 0.04 * s.P),
  speed: s => Math.max(0.5, 1 + 0.025 * (s.A - NORM)),
  // attack cooldown multiplier: nimble creatures strike more often
  swing: s => Math.max(0.5, 1 - 0.03 * (s.A - NORM)),
  // skill gained from work
  learn: s => Math.max(0.2, 0.5 + 0.1 * s.I),
  // chance that a blow or a shot simply misses this creature
  dodge: s => Math.min(0.15, Math.max(0, 0.015 * (s.L - 4))),
  // how much others like this creature (added to their opinion of it, data/relations.js)
  charm: s => 0.15 * (s.C - NORM),
};
