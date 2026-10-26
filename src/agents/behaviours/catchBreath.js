// Catch breath: out of breath in a chase or an attack, it lies down and gets its wind back before the next try
// (the shared `rest` task in the `winded` mode: three breaths a tick). Reads: nothing of its own.
import {PROWL} from '../../data/behaviour.js';

export const catchBreath = {
  want(w, a) {
    const t = a.task;
    if (t?.id === 'rest' && t.mode === 'winded') return a.stamina < PROWL.rested ? [[t, PROWL.want.breath, () => 'переводит дух']] : null;
    if ((t?.id === 'chase' || t?.id === 'maul') && a.stamina <= PROWL.chase.winded) return [[{id: 'rest', mode: 'winded'}, PROWL.want.breath, () => 'выдохся']];
    return null;
  },
};
