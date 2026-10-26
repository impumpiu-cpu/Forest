// Needs: eat, sleep, warm up — one offer per need of the species (data/needs.js: its task, its urge), weighed down when
// the camp burns. Rested before dawn, the sleeper sleeps on till first light (agents/tasks.js sleep) above any work,
// below the alarm, the council and an attack. Reads: needs.
import {NEEDS} from '../../data/needs.js';
import {nightness} from '../../core/time.js';
import {tempAt} from '../../world/heat.js';
import {raidAlarm} from '../../settlement/query.js';
import {COLONIST, REST} from '../../data/behaviour.js';

// a burning camp is no place to eat or sleep
export function campOk(w) {
  const g = w.grid; let hot = 0;
  for (const c of w.camp.cells) hot = Math.max(hot, tempAt(w, c) + g.fire[c] * 400);
  return hot < COLONIST.campHot ? 1 : COLONIST.campHotMul;
}

export const needs = {
  want(w, a, {sp}) {
    const ok = campOk(w), night = nightness(w), out = [];
    for (const id of sp.needs) {
      const n = NEEDS.get(id);
      if (n.task === 'sleep' && a.task?.id === 'sleep' && a.needs[id] >= COLONIST.sleptFull && night > REST.nightFrom && !raidAlarm(w)) { out.push([{id: 'sleep'}, COLONIST.want.sleepOn * ok, () => 'досыпает до рассвета']); continue; }
      out.push([{id: n.task}, n.urge(w, a, a.needs[id]) * ok, () => `${n.label} ${Math.round(a.needs[id] * 100)}%${ok < 1 ? ', но лагерь горит' : ''}`]);
    }
    return out;
  },
};
