// Illness, withdrawal and the rot on a creature (docs/RULES.md; the numbers: data/afflictions.js).
//   catchIll(w, a, id)  — falls ill with the first stage (one illness at a time)
//   stepIll(w, a)       — every `every` days the body's check (data/checks.js): cured, better, worse, dead
//   taintBy(w, t, by)   — a blow of an undead adds to the rot
//   stepTaint(w, a)     — the rot fades
//   stepWithdrawal(w, a) — a hooked one long without a cup is in withdrawal
// The body is rebuilt only when a stage that ends or begins does something (its `mods`, or `hp`), so a rule
// without numbers changes nothing; the random numbers are drawn only when someone is ill or a chance is set.
import {AFFLICTIONS, ADDICTION, TAINT, illTicks, illStage} from '../data/afflictions.js';
import {CONDITIONS, taintRow, conditionHasMods} from '../data/conditions.js';
import {degreeOf, checkChance, DIFFICULTY} from '../data/checks.js';
import {resistTo} from '../data/balance/combat.js';
import {SPECIES} from '../data/species.js';
import {NORM} from '../data/special.js';
import {DAY} from '../core/time.js';
import {kill} from './agent.js';
import {refreshBody} from './special.js';
import {log} from '../core/log.js';
import {esc} from '../core/util.js';
import {hasHut} from '../settlement/healing.js';

const rebuildIf = (a, ...rows) => { if (rows.some(conditionHasMods)) refreshBody(a); };

export function catchIll(w, a, id) {
  if (a.ill || a.dead) return false;
  const A = AFFLICTIONS.get(id);
  a.ill = {id, stage: 1, next: w.tick + illTicks(A)};
  rebuildIf(a, illStage(a));
  if (a.faction === 'colony' && a.name) log(w, `<b>${esc(a.name)}</b>: ${A.label} (${A.stages[0].label}).`, 'people');
  return true;
}

// one step easier on the ladder when the settlement has a healer's hut
const stepFor = (w, A) => {
  const ids = DIFFICULTY.ids(), k = ids.indexOf(A.save);
  return w.buildings && hasHut(w) ? ids[Math.max(0, k - 1)] : A.save;
};

export function stepIll(w, a) {
  const d = a.ill;
  if (d && !AFFLICTIONS.has(d.id)) { a.ill = null; return; }   // an illness this build does not know (a save from elsewhere)
  if (!d || w.tick < d.next || a.dead) return;
  const A = AFFLICTIONS.get(d.id), before = illStage(a);
  const deg = degreeOf(w.rngs.colony(), checkChance(a.special?.[A.stat] ?? NORM, stepFor(w, A)));
  const step = {critSuccess: -A.stages.length, success: -1, fail: 1, critFail: 2}[deg];
  const next = d.stage + step;
  if (next <= 0) {
    a.ill = null; rebuildIf(a, before);
    if (a.faction === 'colony' && a.name) log(w, `<b>${esc(a.name)}</b> поправил${a.gender === 'f' ? 'ась' : 'ся'}: ${A.label} прошла.`, 'people');
    return;
  }
  if (next > A.stages.length && A.deadly) { kill(w, a, A.cause || 'недуга'); return; }
  d.stage = Math.min(next, A.stages.length); d.next = w.tick + illTicks(A);
  const after = illStage(a);
  if (after !== before) rebuildIf(a, before, after);
}

export function taintBy(w, t, by) {
  if (!(TAINT.perHit > 0) || !SPECIES.get(by.species).undead || SPECIES.get(t.species).undead) return;   // the dead are past the rot
  const before = taintRow(t);
  t.taint = (t.taint || 0) + TAINT.perHit * resistTo(SPECIES.get(t.species), 'rot');
  const after = taintRow(t);
  if (after !== before) rebuildIf(t, before, after);
}
export function stepTaint(w, a) {
  if (!a.taint) return;
  const before = taintRow(a);
  a.taint -= TAINT.fade / DAY;
  if (a.taint <= 0) delete a.taint;
  const after = taintRow(a);
  if (after !== before) rebuildIf(a, before, after);
}

export function stepWithdrawal(w, a) {
  if (!a.addicted) return;
  if (!ADDICTION[a.addicted]) { delete a.addicted; delete a.withdrawal; return; }
  const B = ADDICTION[a.addicted], now = a.drankAt == null || w.tick - a.drankAt > B.days * DAY;
  if (now === !!a.withdrawal) return;
  if (now) a.withdrawal = true; else delete a.withdrawal;
  rebuildIf(a, CONDITIONS.get('withdrawal'));
}
