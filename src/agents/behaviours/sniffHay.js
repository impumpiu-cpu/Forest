// Sniff at hay: a herder holding out bait close by (data/jobs.js `herd`, settlement/herd.js) stops the
// beast where it stands — it keeps its grazing spot for after. Reads: nothing of its own.
import {calmHerders} from '../wildHerd.js';
import {WANT} from '../../data/behaviour.js';

export const hayNear = (w, a) => calmHerders(w).some(o => o.task?.tame === a.id && (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 9);

export const sniffHay = {
  want(w, a) {
    return hayNear(w, a) ? [[{id: 'graze', mode: 'hay'}, WANT.hay, () => 'пастух протягивает сено']] : null;
  },
};
