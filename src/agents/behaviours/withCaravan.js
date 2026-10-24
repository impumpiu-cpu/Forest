// With the caravan: the caravan's people go when it goes — the visit over (settlement/trade.js phase `leaving`), the
// caravan gone, a guard whose trader fell. The shared `leave` task. Reads: nothing of its own (a.caravan).
import {liveById} from '../lookup.js';
import {CARAVAN} from '../../data/behaviour.js';

export const withCaravan = {
  want(w, a) {
    const c = w.caravan;
    const gone = !c || c.id !== a.caravan || c.phase === 'leaving' || (a.brain === 'guard' && !liveById(w, c.traderId));
    return gone ? [[a.task?.id === 'leave' ? a.task : {id: 'leave'}, CARAVAN.want.leave, () => 'караван уходит']] : null;
  },
};
