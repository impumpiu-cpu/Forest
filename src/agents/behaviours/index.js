// The code of the behaviours (docs/BEHAVIOUR.md): for every row of the catalogue (data/behaviours.js) the
// acts under the same id, as agents/jobRunners.js holds the runners the jobs name.
//   want  — (w, a, ctx) → [[task, score, why], …] | null: what it offers right now, as the colonist brain's
//           options (why: () → text for the card). A task is {id, mode?, …}; the same id as the current task
//           keeps the task object (its spot, its progress), only `mode` is updated. ctx: {sp, T, night}
//   step  — the task's step (a behaviour whose row says `task: false` has none);  enter, exit — its hooks
// agents/tasks.js registers the tasks from the catalogue and reaches the steps here.
import {BEHAVIOURS} from '../../data/behaviours.js';
import {bolt} from './bolt.js';
import {alert} from './alert.js';
import {sniffHay} from './sniffHay.js';
import {leave} from './leave.js';
import {rest} from './rest.js';
import {graze} from './graze.js';

export const ACTS = {bolt, alert, sniffHay, leave, rest, graze};

for (const d of BEHAVIOURS.all()) {
  const c = ACTS[d.id];
  if (!c?.want) throw new Error(`behaviour ${d.id}: no code in agents/behaviours/`);
  if (d.task !== false && !c.step) throw new Error(`behaviour ${d.id}: a task without a step`);
}
for (const id of Object.keys(ACTS)) if (!BEHAVIOURS.has(id)) throw new Error(`behaviour ${id}: code without a row in data/behaviours.js`);
