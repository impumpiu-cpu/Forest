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
const role = (id, behaviours, more = {}) => { const b = {id, behaviours, ...more}; b.step = (w, a) => tabledStep(w, a, b); return b; };
BRAINS.registerAll([tabledBrain,
  role('livestock', WAYS.livestock, {heart: BEAT.livestock}), role('leaver', WAYS.leaver), role('led', WAYS.led),
  role('raider', WAYS.raider, {body: raidBody}), role('fugitive', WAYS.fugitive, {body: roadBody}),
  role('summoned', WAYS.summoned),
  role('trader', WAYS.trader, {body: roadBody}), role('guard', WAYS.guard, {body: roadBody}),
  role('colonist', WAYS.colonist, colonistRole), role('captive', WAYS.captive, colonistRole), role('former', WAYS.former, colonistRole)]);
// the roles that run their tasks through TASKS (world/save.js: an unknown task id would stop the game)
export const TASK_BRAINS = new Set(BRAINS.filter(b => b.behaviours).map(b => b.id));
