// Brain registry: a species or faction names its brain by id. `tabled` is the one brain for every species whose
// row lists its behaviours (data/behaviours.js, docs/BEHAVIOUR.md); `livestock` and `leaver` are lists of their own
// run the same way (a tamed goat thinks as livestock, not as a goat); the people's brains are written by hand.
import {Registry} from '../../core/registry.js';
import {colonistRole} from './colonist.js';
import {tabledBrain, tabledStep} from './tabled.js';
import {WAYS, BEAT} from '../../data/behaviour.js';
import {raidBody, roadBody} from '../people.js';

export const BRAINS = new Registry('brain');
// a brain that is a list of behaviours of its own (data/behaviour.js WAYS), whatever the species — a role: a tamed beast,
// one who left, a raider, a trader, a guard, a runaway, a colonist, a captive, a former slave. `body` — the body it lives in (agents/people.js; the beast's
// by default), `heart` — how often it thinks
// The list (WAYS[ways]) and the beat (BEAT[beat]) are read at each step, not copied here: an edit of the table «Повадки
// существ» reaches them
const role = (id, ways, more = {}, beat = null) => {
  const b = {id, ...more, get behaviours() { return WAYS[ways]; }};
  if (beat) Object.defineProperty(b, 'heart', {get: () => BEAT[beat], enumerable: true});
  b.step = (w, a) => tabledStep(w, a, b);
  return b;
};
BRAINS.registerAll([tabledBrain,
  role('livestock', 'livestock', {}, 'livestock'), role('leaver', 'leaver'), role('led', 'led'),
  role('raider', 'raider', {body: raidBody}), role('fugitive', 'fugitive', {body: roadBody}),
  role('summoned', 'summoned'), role('golem', 'golem'),
  role('trader', 'trader', {body: roadBody}), role('guard', 'guard', {body: roadBody}),
  role('colonist', 'colonist', colonistRole), role('captive', 'captive', colonistRole), role('former', 'former', colonistRole)]);
// the roles that run their tasks through TASKS (world/save.js: an unknown task id would stop the game)
export const TASK_BRAINS = new Set(BRAINS.filter(b => b.behaviours).map(b => b.id));
