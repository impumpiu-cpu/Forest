// Creature behaviour tuning moved out of the logic (docs/SETTLEMENT.md): squads, carcasses and packs, wild herds,
// trophies, vermin. The logic files import these; the tables (data/schema/index.js) show and edit them.
import {DAY} from '../core/time.js';

// The behaviours of the tabled brain (agents/behaviours/, docs/BEHAVIOUR.md) as ready lists a species row
// copies (`behaviours: [...WAYS.grazer]`): the order is the order of the choice. A beast of the meadows runs,
// sniffs the herder's hay, wanders off now and then, sleeps at night and grazes; one that lives in a herd
// (`herd`) also stands alert at the herd's alarm
export const WAYS = {
  grazer: ['bolt', 'sniffHay', 'leave', 'rest', 'graze'],
  herdGrazer: ['bolt', 'alert', 'sniffHay', 'leave', 'rest', 'graze'],
  // a hunter of the pack: holds a stormed lair to the last; fire, a crowd and the settlement zone drive it off;
  // wounded (or a night hunter at dawn) it leaves; eats its kill, chases game, goes for a lone person,
  // gets its breath back, moves on when the land is empty, else roams — hungry, on the scent of prey
  predator: ['defendLair', 'scare', 'leaveHurt', 'feed', 'chase', 'maul', 'catchBreath', 'wanderOff', 'roam'],
  // a big grazer that stands its ground (a mule, a boar, a bear, an elk): fire sends it off; whoever comes at it is
  // kicked, whoever shot it is charged, a bold bull stands up for its herd; a pack mule walks behind its trader (`mule`);
  // it sniffs the herder's hay, else leaves, sleeps, grazes; one of a herd (an elk) also draws off from what comes
  // too close to the herd and stands alert at its alarm
  stander: ['shunFire', 'standGround', 'sniffHay', 'leave', 'rest', 'graze'],
  herdStander: ['shunFire', 'standGround', 'sniffHay', 'drawOff', 'alert', 'leave', 'rest', 'graze'],
  mule: ['shunFire', 'standGround', 'pack', 'sniffHay', 'leave', 'rest', 'graze'],   // the mule alone carries a trader's crates
  // vermin (a rat, the kikimora): runs from whoever is awake and close, hides in its hole while the stores are watched,
  // sneaks in to nibble the food when the camp is quiet
  vermin: ['shunFire', 'scurry', 'hide', 'nibble'],
  // the nechist of wood and water: hidden after a fight, fights back one on one, keeps to its home ground; the
  // leshy and the poludnitsa lead the nearby astray, the rusalka and the vodyanoy sing by night
  woodSpirit: ['shunFire', 'vanish', 'fightBack', 'astray', 'lurk'],
  waterSpirit: ['shunFire', 'vanish', 'fightBack', 'lure', 'lurk'],
  // not a species' list but a brain's (agents/brains/index.js): a tamed beast in its pen, someone who left the outpost
  livestock: ['shunFire', 'fendOff', 'penned', 'rest'],
  leaver: ['depart'],
  led: ['led'],   // a tame beast a raider leads away (campaign/camp.js)
  // ── people: a role is a list (agents/brains/index.js; the people's bodies: agents/people.js)
  // a raider: fallen senseless it lies; fire drives it; lost, burnt by the sun or badly hurt it leaves; else its band's
  // plan, the nearest foe, the stores (the mindless dead: the nearest living soul)
  raider: ['downed', 'fleeFire', 'retreat', 'capture', 'raid'],
  // a captive on the run: for the map's edge as fast as its bonds let it
  fugitive: ['downed', 'escape'],
  // a trader: with the caravan's phase — walks in, stands at the stall, sleeps by the fire, leaves; never fights
  trader: ['fleeFire', 'withCaravan', 'peddle'],
  // a caravan guard: answers whoever goes for the caravan, else keeps by the trader
  guard: ['fleeFire', 'withCaravan', 'defendCaravan', 'escort'],
  // the colonist (agents/brains/colonist.js): fallen it lies, fire it flees, attacked it fights or runs home; then the
  // utility AI — every behaviour offers with its weight: the body, the work, the council, the trade, the healer, a prayer,
  // low spirits, a nechist's spell, a fire at the camp, the board's cries and alarms, the night watch, going along,
  // helping, binding a fallen foe, learning beside a master, idling
  colonist: ['downed', 'fleeFire', 'warband', 'defend', 'needs', 'work', 'idle', 'company', 'aid', 'sulk', 'spellbound', 'pray', 'council', 'treat', 'trade', 'douse', 'watch', 'flags', 'muster', 'reserve', 'bind', 'assist'],
  // a captive: the body, the camp's work, out of harm's way at the fire — no council, no flag, no watch, no trade, no
  // healer, no going along; kept inside the zone (keepIn)
  captive: ['downed', 'fleeFire', 'defend', 'keepIn', 'needs', 'work', 'idle', 'sulk', 'spellbound', 'pray', 'douse', 'muster', 'reserve', 'assist'],
  // a former slave: everything a free colonist may, but no flag, watch, council or trade
  former: ['downed', 'fleeFire', 'defend', 'needs', 'work', 'idle', 'company', 'aid', 'sulk', 'spellbound', 'pray', 'treat', 'douse', 'muster', 'reserve', 'bind', 'assist'],
};

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

// How the fighting roles fight (agents/tactics.js, data/roles.js): distances in cells
//   kite        — a shooter or a healer steps back from a blade closer than this that comes at it
//   guard       — a shield-bearer turns on one at its shooters, a spearman or a cleaver joins on one held, this close
//   wounded     — below this share of health a foe counts as wounded (the cutthroat's and the sentient archer's pick)
//   sneakUntil  — a cutthroat creeps while no foe is nearer than this (agents/combat.js COMBAT.sneak)
//   mend        — the healer: goes to a fallen one of its band within `near`, works `ticks` on it; a sentient one gives
//                 a potion to one below `potionBelow` of its health; gives it up after `chase` ticks
export const TACTICS = {kite: 2.5, guard: 5, wounded: 0.5, sneakUntil: 2.5, mend: {near: 12, ticks: 60, potionBelow: 0.35, chase: 240}, kiteFor: 30};

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

// the beasts of the meadows (agents/behaviours/: bolt, rest, graze): how far they run, how they pick a patch
export const GRAZE = {
  fireNear: 2,        // fire this close sends a grazer running from the heat
  hurtPace: 0.55,     // a wounded herd beast runs at this share of its sprint (+ the rest × its health)
  restAt: 0.7,        // night deeper than this: it sits still (a species' `restAt` overrides)
  newSpot: 0.01,      // a tick: chance to pick another patch while grazing…
  farOff: 0.15,       // …and that the new one is on another meadow this far (else close by)
  far: 30, near: 7,
  tries: 12,          // candidate patches looked at; the lushest wins, less hard against the map edge
  edge: 0.12, lush: 0.3,
  pace: 0.35,         // walks to the patch at this share of its speed
  berries: 0.05,      // a cell with more berries than this is nibbled on the way (grazes.eatsBerries a tick)
};
// what each offer of a grazer's behaviours is worth in its lane (a lane is never weighed against another)
export const WANT = {fire: 2, threat: 1, alert: 1, hay: 1, leave: 0.5, rest: 0.4, graze: 0.3};

// fire for whoever has no other fear (agents/behaviours/shunFire.js): this close sends it off, at this pace
export const FIRE = {near: 2, pace: 1.3, want: 2};

// a beast that stands its ground, beyond its species' `mule` block (agents/behaviours/standGround.js, pack.js, drawOff.js)
export const STAND = {
  foeNear: 3,          // whoever attacks it from this close is its foe
  bull: 1.15,          // a herd beast this bold (its nerve, agents/wildHerd.js) stands up for its herd…
  bullHp: 0.6,         // …while at least this healthy…
  bullNear: 12,        // …for a member this close
  limpPace: 0.9,       // badly hurt (mule.fleeBelow) it limps off at this pace
  closePace: 1.15,     // walks up to its foe at this pace…
  chargeDrain: 0.004,  // …or charges (mule.charge), the sprint draining this much stamina a tick
  kick: {least: 0.1, spread: 0.12},   // a kick: this share of the blow's power, plus up to this much more
  pack: {angle: 2.4, step: 0.9, at: 1.6, off: 0.6, hurry: 4, hurryPace: 1.3, pace: 1, catchUp: 1.2},   // a pack mule: its place behind the trader (an angle per slot)
  drawOff: 0.8,        // steps away from what comes too close to the herd at this pace
  want: {limp: 1.5, foe: 1.4, pack: 1, drawOff: 1.1},   // (fire, hay, alert, leave, rest, graze: WANT above, as every beast's)
};

// people on a raid (agents/behaviours/raid.js, retreat.js; the band's plan: agents/squad.js)
export const RAID = {
  hunt: 16,            // the mindless dead go for whoever is this close; anyone further off they find by shambling to the camp
  near: 10,            // a living raider answers a foe this close
  hurtBelow: 0.3,      // health below this share: leaves (the mindless never do)
  sunHurts: 0.5, sunLeaves: 0.6,   // the sun-shy (upyrs, vampires) wither when the day is brighter than the first, leave past the second
  rotsFrom: 12,        // the rot loses its hold above this temperature (°C)
  regen: 0.0003, regenCool: 30,   // orcs and trolls close their wounds on a raid, not by a fire
  fire: {heat: 50, near: 1.5},    // the living run from heat and from fire this close
  // taking a prisoner (agents/behaviours/capture.js): a living raider binds a fallen foe this close when no foe stands
  // within `calm`; the knots take `ticks` on the spot; a bound one is led off like a beast (led.js) at PEN.ledPace
  capture: {near: 8, calm: 6, ticks: 40, hp: 0.4},
  want: {fallen: 3, fire: 2, leave: 1.5, plan: 1, capture: 0.95, fight: 0.9, go: 0.5},
};
// people of a trade caravan (agents/behaviours/peddle.js, escort.js, defendCaravan.js; settlement/trade.js)
export const CARAVAN = {
  campAt: 6,           // how close to the camp fire the caravan sets up (cells along the camp flow field)
  lateWait: 50, lateFar: 6,   // the trader waits this long for a straggler this far behind, then goes on without it
  pace: 0.9, spotPace: 0.5,   // walking in; keeping to the spot
  mends: 0.0002,       // wounds close this much a tick on the road
  guard: {sight: 9, help: 12, at: 1.3, angle: 0.8, off: 0.5, hurry: 4, hurryPace: 1.25, pace: 1},   // a guard: whom it answers, its place by the trader (an angle per slot)
  want: {leave: 1.5, fight: 1, stay: 0.5},   // (fire: RAID.want.fire, as every traveller's)
};

// a tamed beast in its pen (agents/behaviours/fendOff.js, penned.js; settlement/herd.js)
export const PEN = {
  foeNear: 3,          // a beast of prey or a raider this close: a mule kicks, a goat runs…
  flee: 1.3,           // …at this pace
  mends: 0.0003,       // wounds close this share of full health a tick in the pen
  campNear: 5, campPace: 0.8, stroll: 0.02, strollR: 4, strollPace: 0.4,   // no pen yet: keeps by the camp
  toPen: 0.9,          // walks to its pen at this pace
  newSpot: 0.008, margin: 0.3, there: 0.2, pace: 0.3,   // inside: from spot to spot
  ledNear: 0.8, ledPace: 1.1,   // led away by a raider: keeps this close, at this pace (agents/behaviours/led.js)
  want: {foe: 1.5, out: 0.5, in: 0.3},
};

// the nechist beyond its species' `spirit` block (agents/nechist.js; agents/behaviours/vanish.js, fightBack.js, lurk.js, lure.js, astray.js)
export const NECHIST = {
  homeTries: 600,      // cells looked at for a home cell to come back to
  grudge: 200,         // remembers who hurt it this long…
  giveUp: 12,          // …while they are this close
  nightFrom: 0.5,      // a night spirit is awake past this
  mends: 0.0003,       // at home its wounds close this share of full health a tick (× spirit.regen)
  crowdNear: 5, crowd: 3,   // colonists this close make a crowd it melts away from (spirit.crowd overrides)
  hidden: {dive: 2, melt: 1},   // hours under the water, in the thicket
  hideFar: 1.5,        // hides at a home cell this × keepOff from the camp
  hidePace: 1.2, strikeReach: 0.9, strikePace: 1.1,
  wander: {near: 0.8, newSpot: 0.004, reach: 10, tries: 30, searchAgain: 120, pace: 0.6},
  lure: {every: 30, oneSong: 12, holds: 2, lonely: 5, singVeil: 6, reach: 1.2},   // a song a night (hours), the spell holds (hours), who is alone
  astray: {hours: [1, 1], logEvery: 0.5},   // lost for 1 + up to 1 hours; the log once in half a day
  spell: {astray: 1.2, lure: 1.5},   // how hard a spell holds a colonist against its other wants (agents/brains/colonist.js)
  want: {hidden: 1.5, strike: 1.4, dive: 1.6, drowning: 1, song: 0.3, lurk: 0.2},
};

// Auras of the ones who lead (agents/auras.js): `lead` — the boss's: while the bearer lives nobody of its side runs and
// its band's morale does not break; the bearer never runs. officerBelow — an officer (the band's leader under a boss)
// stands until its health is below this share, aura or no aura
export const AURAS = {
  lead: {label: 'воля вожака', note: 'пока жив — свои не бегут и не отступают, отряд не ломается'},
  officerBelow: 0.15,
};

// how often a beast thinks in full (ticks; the species' `heart`): the alarms — fire, a foe, the herd's cry, a blow — are
// looked at every tick regardless (agents/brains/tabled.js), and a task that ends, a herd's alarm or a shot wake it
// at once (agents/attention.js wake); in between it goes on with what it does. Lower = sharper and dearer.
export const BEAT = {grazer: 8, stander: 8, predator: 4, vermin: 6, spirit: 10, livestock: 10};

// a predator beyond its species' `predator` block (agents/hunting.js, agents/behaviours/: scare, leaveHurt, feed,
// chase, maul, catchBreath, wanderOff, roam, defendLair)
export const PROWL = {
  // what each offer is worth in its lane: the red lane (fire > leaving > a crowd > the zone), then the queue, where a
  // hunt under way gives way to a rest when out of breath, then joining the pack, the pack before a carcass, prey, people, moving on
  want: {lair: 1, fire: 3, leave: 2.5, crowd: 2, zone: 1.5,
    breath: 0.96, feedOn: 0.95, chaseOn: 0.94, maulOn: 0.93, joinChase: 0.7, joinMaul: 0.69, carcass: 0.6, prey: 0.55, people: 0.5, wander: 0.45, roam: 0.1},
  value: {winded: 0.5, catchOdds: 0.8, straggler: 1.4, catchMin: 0.15, way: 0.5, bigRisk: 0.3, least: 0.05},   // preyValue: see agents/hunting.js
  killCall: 10,        // pack members this close to the kill sit down to it
  joinNear: 12,        // members this close join an attack on a person
  calmBold: 0.5,       // the pause after a try at people is shorter by this × boldness
  desperate: 0.8,      // boldness above which the pack goes for a pair («изголодавшиеся… бросаются»)
  scent: 70,           // how far a hungry predator smells its prey (cells)…
  scentAgain: 120,     // …and after how long it picks the trail anew
  fire: {near: 2.5, pace: 1.4},   // fire this close sends it off, at this pace
  peopleNear: 6,       // people this close count as a crowd
  crowdBold: 2,        // a starving one needs this × boldness more people to be scared off
  hurtBelow: 0.35,     // health below this share: leaves the woods…
  leavePace: 1.2,      // …at this pace
  dawn: 0.3,           // a night hunter leaves when the night falls below this
  nightLit: 0.5,       // night deeper than this (or the lit camp) → the zone keeps it farther off (zoneShyNight)
  boldZone: 0.6,       // the zone's hold shrinks by this × boldness
  feed: {done: 0.98, least: 0.05, pace: 0.8},   // full at this, a carcass this small is left, the walk to it
  chase: {winded: 0.05, stuck: 90, moved: 3, ignoreFor: 600, flankPace: 0.75, bigBite: 1.0, bite: 0.7},
  maul: {stuck: 120, moved: 3, reset: 1.5, reach: 0.9, pace: 0.6, helpNear: 5, help: 2, helpBold: 2, calmStuck: 0.5, calmHelp: 0.7},
  rested: 0.7,         // out of breath: rests until stamina is back to this
  join: {near: 15, fresh: 0.6},   // a member this close and this fresh joins a new chase
  smellBelow: 0.1,     // goes back to a carcass while food < sated − this
  people: {night: 0.25, sightBase: 0.6, sightBold: 0.4},   // the cover of night adds to boldness; how far it looks for a victim
  wanderBold: 0.85,    // starving past this with no prey in sight: the pack may leave for other grounds
  roam: {follow: 2.5, followPace: 0.95, scentPace: 0.85, spotNear: 1.5, stuck: 120, tries: 20, margin: 6, nightPace: 0.85, dayPace: 0.7},
  defend: {reach: 80, winded: 0.2, pace: 0.8, drain: 0.6},   // a lair's guard (campaign/camp.js)
};

export const TROPHY = {lucky: 0.5, soft: 5, practice: 40};

export const VERMIN = {
  den: [7, 13],     // the hiding place is this many cells from the camp fire…
  watch: 5,         // …and it waits while someone awake is this close to the stores,
  patience: 160,    // …but not longer than this: then it makes a dash for the food anyway
  grab: 100,        // a raid on the stores lasts this long, then it runs back to its hole
  denTries: 40, denPace: 0.9, denAt: 0.6, flee: 1.3, caughtAt: 0.8, killLog: 0.3,   // the hole, the dash from a person, how close it is caught
  hideAfter: 60,    // back in the hole, it waits at least this long
  daylight: 0.4,    // the kikimora keeps to the marsh while the night is shallower than this
  denLuck: 0.5,     // chance in the choice of a hole
  spoil: {smell: 25, pace: 0.9, at: 0.9, food: 0.003, rot: 4, logEvery: 300},   // the kikimora at a carcass
  want: {flee: 1.5, hide: 0.6, nibble: 0.5},
};

// a colonist's roster (agents/brains/colonist.js): keeping to a task, thinking again at work, a moment's thought before
// switching jobs; `attacked` — the weight of answering an attack on oneself: more than any need can reach
export const ROSTER = {keep: 0.2, committed: 0.25, ponder: [8, 16], ponderBelow: 1.2, attacked: 2.6};

// the colonist's role beyond the roster (agents/brains/colonist.js; the behaviours needs, work, idle, council, trade, treat,
// pray, sulk, spellbound, douse, defend, flags, watch, muster, reserve, escort, aid, bind, assist)
export const COLONIST = {
  fire: {heat: 55, near: 1.5, douseHeat: 58, douseHp: 0.6},   // runs from heat and fire this close; a firefighter holds out a little longer
  urgent: {hp: 0.35, need: 0.12},   // a delivery under way is finished first — unless hurt or starving this badly
  outfit: {near: 3, every: 300},    // passing the camp this close: swaps gear with the store, not more often than this
  dropNear: 2,                       // a load left over from a broken-off job goes to the stores from this close
  campHot: 40, campHotMul: 0.1,      // a burning camp is no place to eat or sleep
  softCap: [0.8, 0.2],               // work's ceiling: as it was up to 0.8, then bending under 1
  night: {build: 0.3, work: 0.2, outdoorFrom: 0.6, outdoorMul: 1.5, outdoorRisk: 0.5, pray: 0.5},   // work goes unwillingly by night, outdoor work waits for morning
  tasty: 1.2,                        // a job that brings your favourite food is a little more tempting
  standHp: 0.85,                     // brave × healthy above this: stands and fights when attacked, else runs home
  memWolf: 0.05,                     // a wolf's attack is remembered this much (a.mem.wolf)
  prayFrom: 0.1,                     // low spirits past this want a prayer
  sleptFull: 0.995,                  // rested to this before dawn: sleeps on till first light
  want: {idle: 0.08, sulk: 0.95, pray: [0.3, 1.2], council: 1.3, treat: [2, 0.25], trade: 1.1, douse: 0.8, douseHp: 0.6, douseBrave: 0.7, muster: 1.25, hurtEnemy: 1.6, sleepOn: 1.0},
};

// Sleep and warming by the fire (agents/tasks.js). A sleeper rests `rate` a tick, × (1 + `beds` × the beds' share);
// one by a fire warms `warm` × its warmth a tick, × `unlit` when the camp fire is out. A rested sleeper stays in bed
// while the night is deeper than `nightFrom`; one who slept warmer than `houseWarm` remembers the house
// (mood `houseMood` + `houseComfort` × its comfort); warming ends above `warmEnough`.
export const REST = {rate: 0.004, beds: 0.6, warm: 0.0028, unlit: 0.5, nightFrom: 0.75, houseWarm: 0.6, houseMood: 0.22, houseComfort: 1.2, houseFine: 0.1, warmEnough: 0.92};

// Fire put by a creature (agents/tasks.js, agents/combat.js): a raider's torch to a wall, a drake's breath on the
// ground (only where the fuel is above `breath.fuel`), and how much one dousing takes off (× the colony's douse).
export const KINDLE = {torch: {fire: 0.6, heat: 300, fuel: 0.9}, breath: {fuel: 0.05, fire: 0.5, heat: 260}, douse: 0.05};

// How a colonist weighs gear (agents/equipment.js): courage `brave[0] + brave[1] × bravery`; a blow against a blow of 1
// every `blowTicks`, × `melee` × courage + `meleeBase`; silver while a creature that fears it is here (`silverHere`) or
// once met (`silverMet`); a shot × `ranged` × liking for the hunt + `rangedBase`, × `noAmmo` without arrows; block ×
// `block` × courage; a tool's gain × `tool` × liking for the job (× `backTool` on the back); speed in the hand ×
// `handSpeed`. On the body: armour × (`armorBrave[0]` + `armorBrave[1]` × bravery) × `armor`, warmth × `warmth` ×
// the cold × the season's dress, a lost share of speed × `bodySpeed`. On the back: a quiver for the bow in hand
// `quiver`, a basket `carryBase` + carry × `carry` × liking for gathering, a spare weapon `spareWeapon`; a second
// one-hander adds `second`. The colonist swaps only for a loadout better by `swap`.
export const GEAR = {
  brave: [0.5, 0.5], blowTicks: 12, melee: 0.6, meleeBase: 0.15, silverHere: 1.6, silverMet: 0.35,
  ranged: 0.55, rangedBase: 0.1, noAmmo: 0.3, block: 1.6, tool: 1.4, backTool: 1.3, handSpeed: 2,
  armorBrave: [0.6, 0.4], armor: 2, warmth: 0.8, bodySpeed: 2, quiver: 3, carryBase: 0.25, carry: 0.15, spareWeapon: 0.05,
  second: 0.05, swap: 0.12,
};

// Heat that harms (agents/body.js heatHarm, the one rule for every creature): above a species' `heatHarm` a creature
// loses `perDegree` of health a tick for every degree, at most `max`, × its answer to fire (`resist.fire`, the table
// «Урон по видам»). The profiles by who it is: a colonist (agents/body.js), a spirit, a beast (livestock, grazers,
// mules), a raider and an undead raider, a trader of a caravan.
export const HEAT = {
  colonist: {perDegree: 0.00004, max: 0.005},
  spirit: {perDegree: 0.0002, max: 0.02},
  beast: {perDegree: 0.0001, max: 0.01},
  raider: {perDegree: 0.00005, max: 0.006},
  undead: {perDegree: 0.0001, max: 0.012},
  caravan: {perDegree: 0.00005, max: 0.006},
};
