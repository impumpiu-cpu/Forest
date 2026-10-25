// What the deeds share: distances and the leader's reach on the world map.
import {LEADER, TRIBE_RAID} from '../../data/lairs.js';
import {scaleOf} from '../tectonics.js';

export const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
// how far a leader goes: its reach × the tribes' raid reach, scaled with the map
export const reachOf = a => TRIBE_RAID.reach * LEADER.reach * scaleOf(a);
