// Conditions (docs/RULES.md), as conditions and exhaustion in D&D: everything that is wrong with a creature for a
// while or for life, in one table — what it is, where the game keeps it, what it does, how it ends.
//
//   kind  wound      — a grave wound that heals in `days` (agent.wounds, agents/wounds.js)
//         trauma     — an incurable trauma a deadly wound may leave (agent.wounds; `weight` — how often, data/anatomy.js
//                      says at which place of the body)
//         state      — a passing state kept on the creature itself (`where`: its field)
//         exhaustion — a stage of exhaustion: how many of `EXHAUSTION.needs` are at or below `EXHAUSTION.low`
//   mods  — what it does to the body (keys of «Модификаторы существа»); hp — × full health
//
// Wounds, traumas and the stages of exhaustion work through the body's sources (agents/special.js refreshBody).
// The states run in agents/body.js stepEffects. data/wounds.js WOUNDS is the wounds and traumas of this table.
import {Registry} from '../core/registry.js';
import {TAINT} from './afflictions.js';

export const CONDITION_KINDS = {wound: 'рана', trauma: 'травма', state: 'состояние', exhaustion: 'истощение', taint: 'порча'};

export const CONDITIONS = new Registry('condition');

CONDITIONS.registerAll([
  // ── wounds and traumas (agent.wounds)
  {id: 'grave', kind: 'wound', where: 'wounds', label: 'тяжёлая рана', note: 'заживает', days: 4, mods: {speed: 0.85, work: 0.75}},
  {id: 'limp', kind: 'trauma', where: 'wounds', label: 'хромота', note: 'на всю жизнь', trauma: true, weight: 3, mods: {speed: 0.85}},
  {id: 'maimedHand', kind: 'trauma', where: 'wounds', label: 'покалеченная рука', note: 'на всю жизнь', trauma: true, weight: 3, mods: {work: 0.85, str: 0.85, fin: 0.85}},
  {id: 'chest', kind: 'trauma', where: 'wounds', label: 'пробитая грудь', note: 'на всю жизнь', trauma: true, weight: 2, hp: 0.85, mods: {cold: 1.15}},
  {id: 'eye', kind: 'trauma', where: 'wounds', label: 'выбитый глаз', note: 'на всю жизнь', trauma: true, weight: 2, mods: {sight: 0.8, aim: -0.08}},
  {id: 'dread', kind: 'trauma', where: 'wounds', label: 'страх смерти', note: 'на всю жизнь', trauma: true, weight: 2, mods: {bravery: -0.3}},
  // ── passing states (a field of the creature)
  {id: 'downed', kind: 'state', where: 'downed', label: 'без сознания', note: 'смертельная рана, пережитая удачей: истекает кровью, пока не перевяжут (числа — «Навыки, мастера, раны» deathblow, кривые «Пережить…», «Истекает кровью»)'},
  {id: 'poisoned', kind: 'state', where: 'poison', label: 'отравлен', note: 'укус ядовитого: урон каждый тик до срока (числа — у вида, venom; × «Урон по видам» яд)'},
  {id: 'webbed', kind: 'state', where: 'webbed', label: 'в паутине', note: 'замедлен до срока (числа — у вида, web)'},
  {id: 'bleeding', kind: 'state', where: 'bleeding', label: 'кровотечение', dmg: 0.0004, ticks: 600,
    note: 'кровопускающее оружие: шанс — значение свойства bleed; dmg здоровья в тик ticks тиков; нежить не кровит'},
  {id: 'stunned', kind: 'state', where: 'stunned', label: 'оглушён', ticks: 40, slow: 0.5,
    note: 'оглушающее оружие: шанс — значение свойства stun; ticks тиков не бьёт и не стреляет, шаг × slow'},
  {id: 'drunk', kind: 'state', where: 'drankAt', label: 'во хмелю', note: 'кружка браги на вечернем совете (settlement/life.js); у рас, что живут брагой, — работа (brew у расы)'},
  // ── an illness, withdrawal, the rot (data/afflictions.js: how they are caught, the stages of an illness)
  {id: 'ill', kind: 'state', where: 'ill', label: 'болен', note: 'недуг со стадиями («Недуги»): стадия — что делает с телом'},
  {id: 'withdrawal', kind: 'state', where: 'withdrawal', label: 'ломка', mods: {}, note: 'привыкший к браге без кружки дольше, чем «Зависимости» days'},
  {id: 'tainted1', kind: 'taint', stage: 1, label: 'порча I', mods: {}, note: 'удары нежити; проходит сама'},
  {id: 'tainted2', kind: 'taint', stage: 2, label: 'порча II', mods: {}, note: 'порча въелась глубже'},
  {id: 'tainted3', kind: 'taint', stage: 3, label: 'порча III', mods: {}, note: 'порча на грани: тело чернеет'},
  // ── exhaustion: neutral for now (empty mods), ready for the numbers
  {id: 'exhausted1', kind: 'exhaustion', stage: 1, label: 'истощение I', mods: {}, note: 'одна нужда на исходе'},
  {id: 'exhausted2', kind: 'exhaustion', stage: 2, label: 'истощение II', mods: {}, note: 'две нужды на исходе'},
  {id: 'exhausted3', kind: 'exhaustion', stage: 3, label: 'истощение III', mods: {}, note: 'все три на исходе'},
]);

// a need at or below `low` counts towards exhaustion
export const EXHAUSTION = {low: 0.15, needs: ['food', 'rest', 'warmth']};

// the stage of the rot a creature carries (data/afflictions.js TAINT), as its row
export const taintRow = a => { const n = TAINT.stages.filter(x => (a.taint || 0) >= x).length; return n ? CONDITIONS.filter(c => c.kind === 'taint').find(c => c.stage === n) ?? null : null; };
export const exhaustionRow = stage => (stage > 0 ? CONDITIONS.filter(c => c.kind === 'exhaustion').find(c => c.stage === stage) ?? null : null);
// the stage a creature's needs put it at now
export function exhaustionStage(a) {
  let n = 0;
  for (const id of EXHAUSTION.needs) if (a.needs?.[id] != null && a.needs[id] <= EXHAUSTION.low) n++;
  return n && Math.min(n, exhaustionStages());
}
// how many stages of exhaustion there are (counted once: the rows are fixed, only their numbers are edited)
let stages = 0;
const exhaustionStages = () => stages || (stages = CONDITIONS.filter(c => c.kind === 'exhaustion').length);
const hasMods = row => !!row && (Object.keys(row.mods || {}).length > 0 || row.hp != null);

// what the creature is in now: [{row, until?}] — for the card and the checks
export function conditionsOf(w, a) {
  const out = [];
  for (const x of a.wounds || []) if (CONDITIONS.has(x.id)) out.push({row: CONDITIONS.get(x.id), until: x.until});
  const now = w?.tick ?? 0;
  if (a.downed) out.push({row: CONDITIONS.get('downed'), until: a.downed.until});
  if (a.poison && now < a.poison.until) out.push({row: CONDITIONS.get('poisoned'), until: a.poison.until});
  if (a.webbed && now < a.webbed.until) out.push({row: CONDITIONS.get('webbed'), until: a.webbed.until});
  if (a.bleeding && now < a.bleeding.until) out.push({row: CONDITIONS.get('bleeding'), until: a.bleeding.until});
  if (a.stunned && now < a.stunned.until) out.push({row: CONDITIONS.get('stunned'), until: a.stunned.until});
  const ex = exhaustionRow(a.exhaust || 0); if (ex) out.push({row: ex});
  if (a.ill) out.push({row: CONDITIONS.get('ill'), until: a.ill.next, ill: a.ill});
  if (a.withdrawal) out.push({row: CONDITIONS.get('withdrawal')});
  const tr = taintRow(a); if (tr) out.push({row: tr});
  return out;
}
export {hasMods as conditionHasMods};
