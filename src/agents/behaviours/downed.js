// Downed: fallen senseless after a deadly blow (agents/wounds.js), one of the people lies and bleeds until helped or
// until the time runs out; nothing else is chosen. Reads: nothing of its own (a.downed).
import {stepDowned} from '../wounds.js';
import {RAID} from '../../data/behaviour.js';

export const downed = {
  want(w, a) { return a.downed ? [[a.task?.id === 'downed' ? a.task : {id: 'downed'}, RAID.want.fallen, () => 'без сознания']] : null; },
  step(w, a) { if (a.downed) stepDowned(w, a); },
};
