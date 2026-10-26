// What the deeds share: distances and the leader's reach on the world map.
import {LEADER, TRIBE_RAID} from '../../data/lairs.js';
import {scaleOf} from '../tectonics.js';

export {dist} from '../../core/util.js';   // (one for all: core/util.js)
// how far a leader goes: its reach × the tribes' raid reach, scaled with the map
export const reachOf = a => TRIBE_RAID.reach * LEADER.reach * scaleOf(a);
