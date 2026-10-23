// Creature behaviour tuning moved out of the logic (docs/TABLE.md, «Ревизия»): squads, carcasses and packs, wild herds,
// trophies, vermin. The logic files import these; the tables (data/schema/index.js) show and edit them.
import {DAY} from '../core/time.js';

export const SQUAD = {
  think: 10,         // morale and the goal are checked this often
  view: 14,          // colony fighters this close to a member count against the band
  nerve: {living: 0.4, beasts: 0.3, mindless: -Infinity},
  leaderLoss: 0.25,  // morale lost with the leader
  lossWeight: 0.8,   // morale lost per share of the band fallen
  odds: 0.2,         // morale per unit of the strength ratio, either way (capped)
  hold: 40,          // a raider keeps its foe at least this long…
  closer: 0.55,      // …unless another is at most this share of the distance away
  scoutNear: 18,     // scouts stop this far from the camp (by the camp flow field)…
  scoutWatch: 150,   // …and watch this long
  burnNear: 1.6,     // a torch is put to a wall from this close
  burnFor: 60,       // after the fire is lit, the band lingers this long and goes
  rearHold: 150,     // the rear guard holds pursuers off this long
  looters: 0.4,      // share of a looting band sent to the stores
  grabNear: 10,      // a looter this close to the stores (camp flow field) still grabs on a retreat
};

export const CARCASS = {
  life: 4 * DAY,       // rots away entirely after this
  rotFrom: 2 * DAY,    // from this age on it feeds the rot…
  upyr: 0.25,          // …and each night past that an upyr may rise from it with this chance,
  upyrFrom: 0.4,       // if it is of a beast this big (species hp) and at least…
  upyrLeft: 0.1,       // …this share of it is still uneaten
  smell: 30,           // a hungry beast knows of a carcass this close
  eatAt: 0.9,          // eats from this close
  takeAt: 1.4,         // a hunter takes what is left from this close
  scare: 4,            // feeders this close to a hunter either give way or turn on him
};

export const PACK = {
  lost: 70,            // ticks without sight of the prey before the hunt is given up
  flankOff: 3.5,       // a flanker aims this far to the side of the prey…
  flankAhead: 2.5,     // …and this far ahead of where it runs
  closeIn: 2.5,        // from this close everyone goes straight for it
  winded: 0.25,        // stamina below which a member drops back to wait
  rested: 0.6,         // …and from which it rejoins
  roles: 15,           // roles are dealt again this often
};

export const WILD_HERD = {
  join: 10,           // a beast joins a herd of its kind whose middle is this close…
  lookouts: 2,        // …members looking round each tick, in turn
  alarmFor: 40,       // the alarm holds this long after the threat was last seen
  spread: 3.5,        // how far from the pasture each beast picks its own patch
  straggler: 6,       // farther than this from the herd's middle: a straggler (wolves like it)
  nerve: [0.6, 1.4],  // how skittish, rolled once per beast: low — bolts first
  relay: 10,          // a calm beast follows the bolting ones after this × its nerve
};

export const TROPHY = {lucky: 0.5, soft: 5, practice: 40};

export const VERMIN = {
  den: [7, 13],     // the hiding place is this many cells from the camp fire…
  watch: 5,         // …and it waits while someone awake is this close to the stores,
  patience: 160,    // …but not longer than this: then it makes a dash for the food anyway
  grab: 100,        // a raid on the stores lasts this long, then it runs back to its hole
};

// a colonist's roster (agents/brains/colonist.js): keeping to a task, thinking again at work, a moment's thought before
// switching jobs; `attacked` — the weight of answering an attack on oneself: more than any need can reach
export const ROSTER = {keep: 0.2, committed: 0.25, ponder: [8, 16], attacked: 2.6};
