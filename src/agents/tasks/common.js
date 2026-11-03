// What the tasks share (agents/tasks.js and agents/tasks/*.js): ending a task through the lifecycle, the forage job,
// milling about the camp.
import {endTask} from '../lifecycle.js';
import {JOBS} from '../../data/jobs.js';
import {cellOf} from '../../world/grid.js';
import {follow, moveToward} from '../movement.js';
import {TASK} from '../../data/behaviour.js';

// every task ends through the lifecycle (agents/lifecycle.js): done, or given up with a reason
export const done = (w, a) => endTask(w, a, 'done');
export const fail = (w, a, why, outcome = 'blocked') => endTask(w, a, outcome, why);

// the job a hungry one takes up to eat when the stores are empty (data/jobs.js `forage`)
export const forage = () => JOBS.all().find(j => j.forage)?.id || null;

// wander a little inside the camp so people don't stand in one spot
export function mill(w, a, task, radius = TASK.mill.sleep) {
  if (!task.spot || w.rngs.colony() < TASK.mill.respot) {
    const ang = w.rngs.colony() * Math.PI * 2, r = w.rngs.colony() * radius;
    task.spot = [w.camp.x + 0.5 + Math.cos(ang) * r, w.camp.y + 0.5 + Math.sin(ang) * r];
  }
  moveToward(w, a, task.spot[0], task.spot[1], TASK.mill.pace);
}
// to the camp, and once there (or within `near` of it) wander about it within `radius`
export function campMill(w, a, task, near, radius, pace = 1) {
  if (follow(w, a, 'camp', pace) === 'arrived' || w.nav.get('camp')[cellOf(w, a)] < near) mill(w, a, task, radius);
}
