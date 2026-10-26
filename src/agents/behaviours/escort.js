// Escort: a caravan guard keeps its place by the trader's side, hurrying when it falls behind. Reads: nothing of its own (a.slot).
import {approach} from '../movement.js';
import {liveById} from '../lookup.js';
import {CARAVAN} from '../../data/behaviour.js';

export const escort = {
  want(w, a) { return [[a.task?.id === 'escort' ? a.task : {id: 'escort'}, CARAVAN.want.stay, () => 'при купце']]; },
  step(w, a) {
    const trader = liveById(w, w.caravan?.traderId); if (!trader) return;
    const G = CARAVAN.guard, k = a.slot ?? 0, ang = k * Math.PI + G.angle;
    const tx = trader.x + Math.cos(ang) * G.at, ty = trader.y + Math.sin(ang) * G.at;
    if (Math.hypot(tx - a.x, ty - a.y) > G.off && approach(w, a, tx, ty, Math.hypot(trader.x - a.x, trader.y - a.y) > G.hurry ? G.hurryPace : G.pace) === null) approach(w, a, trader.x, trader.y);
  },
};
