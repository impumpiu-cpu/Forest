// The colonist's role (docs/BEHAVIOUR.md «Люди»): a utility AI — every behaviour of its list offers what it wants with
// a score, the best becomes the task (agents/brains/tabled.js). The list is data/behaviour.js WAYS.colonist: needs
// (data/needs.js), work (data/jobs.js, the vacancies), the council, the trade, the healer, a prayer, the board's
// alarms and cries, the night watch, going along, helping, binding, learning; the weights are the behaviours' own.
// A captive and a former slave are the same role with shorter lists (WAYS.captive, WAYS.former): no council, no
// flag, no watch, no work beyond the zone.
//
// What is the role's and not a behaviour's: the body (agents/body.js stepBody: hunger, cold, healing; the needs
// falling past a band and a wound wake it — agents/attention.js), when it thinks (on events, not on a timer: wake();
// a long heartbeat as a safety net, HEART), a delivery under way finished before the next thought, the fire it runs
// from (COLONIST.fire: a firefighter holds out a little longer), and what is noted for the balance runner and the
// diary once a choice is made.
import {attackerOf} from '../combat.js';
import {stepBody} from '../body.js';
import {hpShare} from '../agent.js';
import {healWounds} from '../wounds.js';
import {wake, noticeSelf, heartOf} from '../attention.js';
import {knownFoeWithin, noteChoice, noteWatch, BOARD} from '../../settlement/board.js';
import {COLONIST} from '../../data/behaviour.js';

const FIRE_TASK = new Set(['flee', 'douse']);

// the body, and the events of one's own that call for a thought: a need past a band, a wound, a blow
function colonistBody(w, a) {
  const T = stepBody(w, a);   // reads last tick's `sleeping`
  if (a.dead) return T;
  noticeSelf(w, a);
  if (!a.downed) { healWounds(w, a); a.sleeping = false; }
  if (FIRE_TASK.has(a.task?.id)) a.mem.fire += 0.006;
  // being attacked can't wait for the next think
  const tid = a.task?.id;
  if (tid !== 'fight' && tid !== 'runHome' && tid !== 'flee' && attackerOf(w, a)) wake(a, 'на меня напали', 'нападение');
  return T;
}

// a delivery under way is finished first — unless something urgent comes up: an attack, a foe close by, a body at its
// limit. The load stays in the hands whatever is chosen
function hold(w, a) {
  if (a.task?.id !== 'job' || !a.task.hauling) return false;
  const U = COLONIST.urgent;
  return !(attackerOf(w, a) || hpShare(a) < U.hp || Object.values(a.needs).some(v => v < U.need) || !!knownFoeWithin(w, a, BOARD.near));
}

// once a choice is made: the diary (why it went to a cry, or why not), the night watch's bookkeeping
function decided(w, a, best, opts) {
  const flags = opts.filter(o => o[3].id === 'flags').map(o => [o[0], o[1], o[2], o[4]]);   // the board's own tuples: [task, score, why, flag]
  if (flags.length && !a.captive && !a.former) noteChoice(w, a, best, flags);
  noteWatch(w, a, best, a.task?.id);
}

// the role, shared by the colonist, the captive and the former slave but for the list (agents/brains/index.js)
export const colonistRole = {
  body: colonistBody,
  // a moment's thought between two jobs lasts exactly as long as it lasts; otherwise the heartbeat by what it is doing
  heart: (w, a) => (a.task?.id === 'ponder' ? a.task.until - w.tick + 2 : heartOf(a)),   // (+2: the thought's own end comes first, agents/tasks.js ponder)
  hold, decided, fire: COLONIST.fire, tallies: true, breath: true, idleWake: 'давно не оглядывался',
};
