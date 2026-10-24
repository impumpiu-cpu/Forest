// The code of the behaviours (docs/BEHAVIOUR.md): for every row of the catalogue (data/behaviours.js) the
// acts under the same id, as agents/jobRunners.js holds the runners the jobs name.
//   want  — (w, a, ctx) → [[task, score, why], …] | null: what it offers right now, as the colonist brain's
//           options (why: () → text for the card). A task is {id, mode?, …}; the same id as the current task
//           keeps the task object (its spot, its progress), only `mode` is updated. ctx: {sp, T, night}
//   pick  — (w, a, task): what happens the moment the offer is taken (a hunt begins, the pack is called)
//   always — (w, a, ctx): every tick whatever the task (an aura, a veil, a body's own healing)
//   step  — the task's step (a behaviour whose row says `task: false` has none);  enter, exit — its hooks
// agents/tasks.js registers the tasks from the catalogue and reaches the steps here.
import {BEHAVIOURS} from '../../data/behaviours.js';
import {bolt} from './bolt.js';
import {alert} from './alert.js';
import {sniffHay} from './sniffHay.js';
import {leave} from './leave.js';
import {rest} from './rest.js';
import {graze} from './graze.js';
import {scare} from './scare.js';
import {leaveHurt} from './leaveHurt.js';
import {feed} from './feed.js';
import {chase} from './chase.js';
import {maul, defendLair} from './maul.js';
import {catchBreath} from './catchBreath.js';
import {wanderOff} from './wanderOff.js';
import {roam} from './roam.js';
import {shunFire} from './shunFire.js';
import {standGround} from './standGround.js';
import {pack} from './pack.js';
import {drawOff} from './drawOff.js';
import {scurry} from './scurry.js';
import {hide} from './hide.js';
import {nibble} from './nibble.js';
import {vanish} from './vanish.js';
import {fightBack} from './fightBack.js';
import {lure} from './lure.js';
import {astray} from './astray.js';
import {lurk} from './lurk.js';
import {fendOff} from './fendOff.js';
import {penned} from './penned.js';
import {depart} from './depart.js';
import {led} from './led.js';
import {downed} from './downed.js';
import {fleeFire} from './fleeFire.js';
import {escape} from './escape.js';
import {retreat} from './retreat.js';
import {raid} from './raid.js';
import {withCaravan} from './withCaravan.js';
import {peddle} from './peddle.js';
import {defendCaravan} from './defendCaravan.js';
import {escort} from './escort.js';

export const ACTS = {bolt, alert, sniffHay, leave, rest, graze, defendLair, scare, leaveHurt, feed, chase, maul, catchBreath, wanderOff, roam, shunFire, standGround, pack, drawOff, scurry, hide, nibble, vanish, fightBack, lure, astray, lurk, fendOff, penned, depart, led, downed, fleeFire, escape, retreat, raid, withCaravan, peddle, defendCaravan, escort};

for (const d of BEHAVIOURS.all()) {
  const c = ACTS[d.id];
  if (!c?.want) throw new Error(`behaviour ${d.id}: no code in agents/behaviours/`);
  if (d.task !== false && !c.step) throw new Error(`behaviour ${d.id}: a task without a step`);
}
for (const id of Object.keys(ACTS)) if (!BEHAVIOURS.has(id)) throw new Error(`behaviour ${id}: code without a row in data/behaviours.js`);
