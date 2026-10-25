// The caravan's war band (docs/BEHAVIOUR.md «Дружина»): on the map of a camp (campaign/camp.js) the caravan's people are
// not settlers who answer a cry only while nobody covers it, keep by the fire or finish their work — they came as a
// company of arms. Once the camp's alarm is up (w.campaign.alarm: a foe seen by one awake, a blow struck — stepCamp),
// every able one goes for the foe: the one who strikes it, else the nearest on its feet. Who sleeps sleeps till the
// alarm (a night raid takes a sleeping camp by surprise); a captive, a former slave (no arms) and one hurt past
// BOARD.hurt keep out of it (agents/behaviours/colony.js reserve). Reads: w.campaign (alarm, foeObjs).
import {hpShare} from '../agent.js';
import {attackerOf} from '../combat.js';
import {BOARD} from '../../settlement/board.js';
import {CAMP} from '../../data/camp.js';

const up = o => !o.dead && !o.gone && !o.captive && !o.downed;

export const warband = {
  want(w, a) {
    const C = w.campaign;
    if (!C?.alarm || a.captive || a.former || a.downed || hpShare(a) <= BOARD.hurt) return null;
    let e = attackerOf(w, a);
    if (!e || !up(e)) {
      e = null; let best = Infinity;
      for (const o of C.foeObjs || []) { if (!up(o)) continue; const d = Math.hypot(o.x - a.x, o.y - a.y); if (d < best) { best = d; e = o; } }
    }
    if (!e) return null;
    return [[a.task?.id === 'fight' && a.task.target === e ? a.task : {id: 'fight', target: e}, CAMP.band.want, () => `дружина в бою: ${e.name}`]];
  },
};
