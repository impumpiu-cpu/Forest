// The colony journal. Messages are HTML snippets; callers escape user text.
import {clockStr} from './time.js';

const MAX_LINES = 60;

export function log(world, html) {
  world.logLines.unshift({t: world.tick, html, when: clockStr(world.tick)});
  if (world.logLines.length > MAX_LINES) world.logLines.pop();
  world.logVersion++;
}
