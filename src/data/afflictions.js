// Afflictions, addiction and taint (docs/RULES.md). Every way in has a chance (`catch`, `hook`, `perHit`) that
// is 0 for now: the rules run, the tables show them, and nobody falls ill, gets hooked or tainted until a number is set.
//
// AFFLICTIONS — illnesses with stages, as afflictions in Pathfinder 2. One kept on the creature: agent.ill =
// {id, stage, next}. Every `every` days the body fights it: a check of `stat` against the step `save` of the ladder
// (data/checks.js; one step easier when the settlement has a healer's hut) — a critical success cures it, a success
// takes a stage off (from the first: cured), a failure adds one, a critical failure two; past the last stage it kills
// when `deadly`, else stays at the last. Each stage does to the body what its `mods` say (and `hp` × full health).
//   from — where it is caught: 'dressed' — a dressed deadly wound (agents/wounds.js stabilize, × (1 − medicine skill));
//          'cold' — a tick with warmth at or below the exhaustion line (agents/body.js), `catch` a day
// ADDICTION — a cup of braga (settlement/life.js) hooks with `hook`; a hooked one more than `days` without a cup is in
// withdrawal (the condition «ломка», data/conditions.js).
// TAINT — the rot: every blow of an undead adds `perHit` × the body's resist.rot (the table «Урон по видам») and it
// fades by `fade` a day; at `stages` it is the conditions «порча I–III».
import {Registry} from '../core/registry.js';
import {DAY} from '../core/time.js';

export const AFFLICTIONS = new Registry('affliction');
AFFLICTIONS.registerAll([
  {id: 'fever', label: 'лихорадка', cause: 'лихорадки', from: 'dressed', catch: 0, stat: 'E', save: 'medium', every: 1, deadly: true,
    stages: [{label: 'жар', mods: {work: 0.85}}, {label: 'бред', mods: {work: 0.6, speed: 0.85}}, {label: 'горячка', mods: {work: 0.3, speed: 0.6}}],
    note: 'рана загноилась: лечит лекарь и Выносливость'},
  {id: 'chill', label: 'простуда', cause: 'простуды', from: 'cold', catch: 0, stat: 'E', save: 'easy', every: 1, deadly: false,
    stages: [{label: 'насморк', mods: {work: 0.95}}, {label: 'кашель', mods: {work: 0.85, cold: 1.15}}],
    note: 'промёрз до костей'},
]);

export const ADDICTION = {braga: {hook: 0, days: 3}};
export const TAINT = {perHit: 0, fade: 0.5, stages: [5, 10, 20]};

export const AFFLICTION_FROM = {dressed: 'после перевязанной смертельной раны', cold: 'в холод без тепла'};
export const illTicks = A => Math.max(1, Math.round(A.every * DAY));
export const illStage = a => (a.ill && AFFLICTIONS.has(a.ill.id) ? AFFLICTIONS.get(a.ill.id).stages[a.ill.stage - 1] ?? null : null);

// what is wrong with the stages of an illness → [error] (the table's check)
export function stagesErrors(stages, keysOf) {
  if (!Array.isArray(stages) || !stages.length) return ['стадии — непустой список'];
  const errs = [], mods = keysOf?.('creatureMods');
  stages.forEach((s, k) => {
    if (!s || typeof s.label !== 'string') { errs.push(`стадия ${k + 1}: нужно название label`); return; }
    for (const [m, v] of Object.entries(s.mods || {})) {
      if (mods && !mods.has(m)) errs.push(`стадия ${k + 1}: модификатора «${m}» нет в словаре`);
      if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`стадия ${k + 1}: ${m} — не число`);
    }
  });
  return errs;
}
// the illness caught this way (`from`: 'cold', 'dressed'), the first of the list; null when none is
export const caughtFrom = from => AFFLICTIONS.all().find(x => x.from === from) || null;
