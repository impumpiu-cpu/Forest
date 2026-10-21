// When the settlement is lost: nobody left, or one survivor at most while raiders hold or have
// just plundered the camp. The simulation stops and the chronicle is summed up.
import {HOUR} from '../core/time.js';
import {log} from '../core/log.js';
import {colonists} from './query.js';

export function checkEnd(w) {
  if (w.over || w.tick < 50) return;
  const pop = colonists(w).filter(a => !a.captive).length;   // captives left alone are no settlement: they scatter
  const raiders = w.agents.some(a => a.faction === 'raiders' && !a.dead && !a.downed);
  const plundered = w.tick - w.stats.lastSteal < 12 * HOUR;
  if (pop === 0) w.over = {tick: w.tick, reason: raiders || plundered ? 'raided' : 'empty'};
  else if (pop <= 1 && (raiders || plundered)) w.over = {tick: w.tick, reason: 'raided'};
  if (w.over) log(w, w.over.reason === 'raided' ? 'Налётчики разорили лагерь. Поселение пало.' : 'В поселении не осталось ни души.', 'death');
}
