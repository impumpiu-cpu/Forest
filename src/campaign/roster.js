// The guild's roster: the few rules its systems share (campaign/guild.js, house.js, retire.js, branches.js, temple.js) — who
// counts as one of the guild, one given back to the ranks, one leaving it.
import {parted} from './kin.js';

// one of the guild now: alive, taken in, not dead and not gone
export const isLive = m => !!m?.alive && !!m.guild && !['dead', 'left', 'candidate'].includes(m.guild.state);
// back to the ranks from whatever he did (a post, a lesson, a cure, the road): free at his house — at rest, if he had retired
export function release(G, m) { m.guild = {state: m.retired ? 'retired' : 'ready', since: G.day}; }
// out of the guild, for `why` (the list of those gone shows it): his kin there feel it (campaign/kin.js)
export function leaveGuild(a, G, m, why) {
  m.guild = {state: 'left', since: G.day}; m.asks = null;
  m.left = {day: G.day, year: a.hist?.year ?? 0, why};
  parted(G, m);
}
